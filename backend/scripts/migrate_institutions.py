"""
migrate_institutions.py — canonical institution identity (PREPUB_AUDIT entity resolution).

The ETL minted a new institution id per distinct name and per CompraNet era, so
one buyer shows up as 2-10 ids (institution_stats double-lists 101 federal groups;
880 state/municipal ids duplicate another). This migration records identity
WITHOUT rewriting institution ids on contracts:

  a. fill institutions.gobierno_nivel / state_code where NULL (high confidence only)
  b. institution_canonical  — one row per institution id -> surviving canonical_id
     institution_successor  — legal renames/mergers, LINKED (old -> new), not merged
  c. re-attribute contracts of the 11 2019-22 "ramo container" ids (e.g. 3773
     "DEFENSA NACIONAL" = 72% ISSFAM) to the real buyer by the UR code in
     procedure_number ('YYYY-RR-UUU-seq'); rows with no target stay put
  d. delete institution_stats rows whose institution no longer exists

Precomputes then aggregate by canonical_id (scripts/_institution_canonical.py).

Inputs (backend/data/institution_resolution/, from _entity_res/inst/):
  state_muni_canonical.csv  all ids: canonical_key, level, state_inegi, municipality
  federal_crosswalk.csv     federal ids: canonical_key (same key = same entity)
  renames_curated.csv       old_id -> new_id successor links with DOF sources

Usage:
  python -m scripts.migrate_institutions --db PATH --dry-run
  python -m scripts.migrate_institutions --db PATH                 # apply
  python -m scripts.migrate_institutions --db PATH --rollback DIR  # undo a run

Every apply writes reversal CSVs to <reversal-root>/<timestamp>/ (never overwritten),
so re-running is safe: a second run finds nothing left to fill or move.
"""
import argparse
import csv
import re
import sqlite3
import sys
import time
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data" / "institution_resolution"

# INEGI state code -> the abbreviation institutions.state_code already uses.
# (Quintana Roo had no code at all: the data writes 'Q ROO'.)
INEGI_TO_STATE = {
    "01": "AGS", "02": "BC", "03": "BCS", "04": "CAMP", "05": "COAH", "06": "COL",
    "07": "CHIS", "08": "CHIH", "09": "CDMX", "10": "DGO", "11": "GTO", "12": "GRO",
    "13": "HGO", "14": "JAL", "15": "MEX", "16": "MICH", "17": "MOR", "18": "NAY",
    "19": "NL", "20": "OAX", "21": "PUE", "22": "QRO", "23": "QROO", "24": "SLP",
    "25": "SIN", "26": "SON", "27": "TAB", "28": "TAMP", "29": "TLAX", "30": "VER",
    "31": "YUC", "32": "ZAC",
}
LEVEL_TO_NIVEL = {"state": "GE", "municipal": "GM", "federal": "APF", "autonomous": "APF"}
# crosswalk relations that are separate legal entities (linked, never merged)
NO_MERGE = {"container", "dissolved"}
SUCCESSOR_RELATIONS = {"successor", "merged_into"}
CONTAINER_RAMOS = {"023", "025", "033", "047", "000"}  # mirrors _entity_res/inst/gold/keys.py

DDL = """
CREATE TABLE IF NOT EXISTS institution_canonical (
    institution_id     INTEGER PRIMARY KEY,
    canonical_id       INTEGER NOT NULL,
    canonical_key      TEXT,
    level              TEXT,
    state_inegi        TEXT,
    municipality_inegi TEXT,
    body_type          TEXT,
    match_basis        TEXT NOT NULL,
    confidence         TEXT
);
CREATE INDEX IF NOT EXISTS idx_inst_canonical_cid ON institution_canonical(canonical_id);
CREATE TABLE IF NOT EXISTS institution_successor (
    institution_id INTEGER NOT NULL,
    successor_id   INTEGER NOT NULL,
    effective_date TEXT,
    source_url     TEXT,
    PRIMARY KEY (institution_id, successor_id)
);
"""


def read_csv(name):
    with open(DATA / name, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def ur_key(procedure_number):
    """'2021-07-HXA-00000079' -> crosswalk key (same rules as gold/keys.py classify)."""
    m = re.match(r"^\d{4}-(\d{1,3})-([0-9A-Z]{3})-", procedure_number or "")
    if not m:
        return None
    ramo, ur = m.group(1).zfill(3), m.group(2)
    if re.search("[A-Z]", ur):
        return ("D:" + ramo + ur) if re.fullmatch(r"[A-Z]\d\d", ur) else "E:" + ur
    return "R:" + ramo + (ur if ramo in CONTAINER_RAMOS else "")


def build_plan(conn):
    """Pure read: everything the migration would write."""
    counts = dict(conn.execute(
        "SELECT institution_id, COUNT(*) FROM contracts WHERE institution_id IS NOT NULL GROUP BY 1"))
    inst = {r[0]: {"nivel": r[1], "state": r[2]} for r in
            conn.execute("SELECT id, gobierno_nivel, state_code FROM institutions")}
    state = {int(r["institution_id"]): r for r in read_csv("state_muni_canonical.csv")}
    fed = {int(r["institution_id"]): r for r in read_csv("federal_crosswalk.csv")}

    # group key per id: crosswalk wins over the state parse (6 ids carry both)
    group, basis, conf = {}, {}, {}
    for iid in inst:
        f, s = fed.get(iid), state.get(iid)
        if f and f["relation"] not in NO_MERGE:
            group[iid], basis[iid], conf[iid] = "F|" + f["canonical_key"], "federal_crosswalk:" + f["relation"], "high"
        elif f:
            group[iid], basis[iid], conf[iid] = "self|%d" % iid, "federal_crosswalk:" + f["relation"], "high"
        elif s and s["canonical_key"] and s["confidence"] in ("high", "medium"):
            group[iid], basis[iid], conf[iid] = "S|" + s["canonical_key"], "state_parse", s["confidence"]
        else:
            group[iid], basis[iid], conf[iid] = "self|%d" % iid, "self", s["confidence"] if s else None

    members = defaultdict(list)
    for iid, g in group.items():
        members[g].append(iid)
    canon = {}
    for g, ids in members.items():
        keep = max(ids, key=lambda i: (counts.get(i, 0), -i))  # most contracts, then lowest id
        for i in ids:
            canon[i] = keep

    canonical_rows = []
    for iid in sorted(inst):
        s = state.get(iid) or {}
        f = fed.get(iid) or {}
        canonical_rows.append((
            iid, canon[iid], f.get("canonical_key") or s.get("canonical_key") or None,
            s.get("level") or None, s.get("state_inegi") or None, s.get("municipality") or None,
            s.get("body_type") or None, basis[iid], conf[iid]))

    # a. NULL fills, high confidence only
    fills = []
    for iid, r in inst.items():
        s = state.get(iid)
        if not s or s["confidence"] != "high":
            continue
        new_nivel = LEVEL_TO_NIVEL.get(s["level"]) if r["nivel"] is None else None
        new_state = (INEGI_TO_STATE.get(s["state_inegi"] or "")
                     if r["state"] is None and s["level"] in ("state", "municipal") else None)
        if new_nivel or new_state:
            fills.append((iid, r["nivel"], r["state"], new_nivel or r["nivel"], new_state or r["state"]))

    # b'. successor links (renames / mergers), endpoints mapped to canonical ids
    succ = {}
    for r in read_csv("renames_curated.csv"):
        if r["relation"] not in SUCCESSOR_RELATIONS:
            continue
        old, new = int(r["old_id"]), int(r["new_id"])
        if old not in inst or new not in inst or canon[old] == canon[new]:
            continue
        succ[(old, canon[new])] = (r["effective_date"] or None, r["source_url"] or None)
    successor_rows = [(o, n, d, u) for (o, n), (d, u) in sorted(succ.items())]

    # c. container re-attribution by UR code
    target_of_key = {}
    for iid, f in fed.items():
        if f["relation"] in ("container", "dissolved", "predecessor", "merged_into", "branch"):
            continue
        k = f["continuity_key"]
        c = canon.get(iid)
        if c is not None and counts.get(c, 0) >= counts.get(target_of_key.get(k), -1):
            target_of_key[k] = c
    containers = [i for i, f in fed.items() if f["relation"] == "container" and i in inst]
    moves, unmoved = [], defaultdict(int)
    if containers:
        q = "SELECT id, institution_id, procedure_number FROM contracts WHERE institution_id IN (%s)" % \
            ",".join("?" * len(containers))
        for cid, old, pn in conn.execute(q, containers):
            k = ur_key(pn)
            tgt = target_of_key.get(k)
            if tgt and tgt != old:
                moves.append((cid, old, tgt, k))
            else:
                unmoved[(old, k)] += 1

    orphans = [r[0] for r in conn.execute(
        "SELECT institution_id FROM institution_stats WHERE institution_id NOT IN (SELECT id FROM institutions)")]
    return dict(canonical_rows=canonical_rows, fills=fills, successor_rows=successor_rows,
                moves=moves, unmoved=dict(unmoved), orphans=orphans, counts=counts, canon=canon)


def write_csv(path, header, rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def summarize(plan):
    canon = plan["canon"]
    absorbed = [i for i, c in canon.items() if i != c]
    groups = {canon[i] for i in absorbed}
    moved = sum(plan["counts"].get(i, 0) for i in absorbed)
    print(f"institution_canonical : {len(plan['canonical_rows'])} ids -> "
          f"{len(set(canon.values()))} canonical ({len(absorbed)} absorbed into {len(groups)} groups, "
          f"{moved:,} contracts re-grouped, 0 rewritten)")
    print(f"institution_successor : {len(plan['successor_rows'])} links")
    print(f"NULL fills            : {len(plan['fills'])} ids "
          f"(nivel {sum(1 for f in plan['fills'] if f[1] is None and f[3])}, "
          f"state {sum(1 for f in plan['fills'] if f[2] is None and f[4])})")
    by = defaultdict(int)
    for _, old, new, _k in plan["moves"]:
        by[(old, new)] += 1
    print(f"container re-attribution: {len(plan['moves'])} contracts moved, "
          f"{sum(plan['unmoved'].values())} left (no target)")
    for (old, new), n in sorted(by.items()):
        print(f"    {old} -> {new}: {n}")
    for (old, k), n in sorted(plan["unmoved"].items(), key=lambda x: -x[1])[:15]:
        print(f"    left {old} key={k}: {n}")
    print(f"orphan institution_stats rows: {len(plan['orphans'])}")


def apply(conn, plan, outdir):
    outdir.mkdir(parents=True, exist_ok=False)
    # reversal files first: if anything below fails the transaction rolls back anyway
    write_csv(outdir / "fills.csv", ["institution_id", "old_gobierno_nivel", "old_state_code",
                                     "new_gobierno_nivel", "new_state_code"], plan["fills"])
    write_csv(outdir / "container_moves.csv", ["contract_id", "old_institution_id",
                                               "new_institution_id", "ur_key"], plan["moves"])
    cols = [r[1] for r in conn.execute("PRAGMA table_info(institution_stats)")]
    if plan["orphans"]:
        ph = ",".join("?" * len(plan["orphans"]))
        rows = conn.execute(f"SELECT * FROM institution_stats WHERE institution_id IN ({ph})",
                            plan["orphans"]).fetchall()
    else:
        rows = []
    write_csv(outdir / "orphan_institution_stats.csv", cols, rows)

    t = time.time()
    conn.execute("BEGIN")
    try:
        for stmt in filter(str.strip, DDL.split(";")):
            conn.execute(stmt)
        conn.execute("DELETE FROM institution_canonical")
        conn.executemany("INSERT INTO institution_canonical VALUES (?,?,?,?,?,?,?,?,?)",
                         plan["canonical_rows"])
        conn.execute("DELETE FROM institution_successor")
        conn.executemany("INSERT INTO institution_successor VALUES (?,?,?,?)", plan["successor_rows"])
        conn.executemany("UPDATE institutions SET gobierno_nivel = ?, state_code = ? WHERE id = ?",
                         [(f[3], f[4], f[0]) for f in plan["fills"]])
        conn.executemany("UPDATE contracts SET institution_id = ? WHERE id = ? AND institution_id = ?",
                         [(new, cid, old) for cid, old, new, _k in plan["moves"]])
        if plan["orphans"]:
            conn.execute(f"DELETE FROM institution_stats WHERE institution_id IN ({ph})", plan["orphans"])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    print(f"applied in {time.time() - t:.1f}s; reversal files in {outdir}")


def rollback(conn, indir):
    """Undo one apply run from its reversal dir (drops the two new tables)."""
    def rows(name):
        with open(indir / name, encoding="utf-8", newline="") as f:
            return list(csv.DictReader(f))
    nz = lambda v: v if v != "" else None  # noqa: E731
    conn.execute("BEGIN")
    try:
        conn.executemany("UPDATE institutions SET gobierno_nivel = ?, state_code = ? WHERE id = ?",
                         [(nz(r["old_gobierno_nivel"]), nz(r["old_state_code"]), int(r["institution_id"]))
                          for r in rows("fills.csv")])
        conn.executemany("UPDATE contracts SET institution_id = ? WHERE id = ? AND institution_id = ?",
                         [(int(r["old_institution_id"]), int(r["contract_id"]), int(r["new_institution_id"]))
                          for r in rows("container_moves.csv")])
        orph = rows("orphan_institution_stats.csv")
        if orph:
            cols = list(orph[0].keys())
            conn.executemany(
                f"INSERT OR REPLACE INTO institution_stats ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                [[nz(r[c]) for c in cols] for r in orph])
        conn.execute("DROP TABLE IF EXISTS institution_canonical")
        conn.execute("DROP TABLE IF EXISTS institution_successor")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    print(f"rolled back from {indir}; now re-run the precomputes (RUNBOOK § rollback)")


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    p.add_argument("--db", required=True)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--reversal-root", default=None,
                   help="where reversal CSVs go (default: <db dir>/institution_migration_reversal)")
    p.add_argument("--rollback", default=None, help="reversal dir of the run to undo")
    a = p.parse_args()
    if not Path(a.db).exists():
        sys.exit(f"DB not found: {a.db}")
    conn = sqlite3.connect(a.db, timeout=120, isolation_level=None)
    conn.execute("PRAGMA busy_timeout = 60000")
    if a.rollback:
        rollback(conn, Path(a.rollback))
        return
    t = time.time()
    plan = build_plan(conn)
    print(f"plan built in {time.time() - t:.1f}s  ({a.db})")
    summarize(plan)
    if a.dry_run:
        print("DRY-RUN: nothing written.")
        return
    root = Path(a.reversal_root) if a.reversal_root else Path(a.db).resolve().parent / "institution_migration_reversal"
    apply(conn, plan, root / time.strftime("%Y%m%d_%H%M%S"))


def _selfcheck():
    assert ur_key("2021-07-HXA-00000079") == "E:HXA"
    assert ur_key("2021-14-A00-00000237") == "D:014A00"
    assert ur_key("2021-14-512-00000634") == "R:014"
    assert ur_key("2021-25-610-00000001") == "R:025610"
    assert ur_key("AA-007000999-E1-2020") is None


if __name__ == "__main__":
    _selfcheck()
    main()
