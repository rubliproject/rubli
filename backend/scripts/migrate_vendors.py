"""
migrate_vendors.py — canonical vendor identity (PREPUB_AUDIT entity resolution).

The ETL minted one vendor id per name spelling / CompraNet era, so one company
can be 2+ ids. This migration records identity WITHOUT rewriting contracts:

  vendor_rfc_quality       graded RFC per vendor (best_rfc is PRIVATE, never served)
  vendor_match_judgements  AUTO_rfc / AUTO_name pairs as 'same' (reviewer='auto')
  vendor_match_candidates  PROBABLE / REVIEW pairs: link-only, never merged;
                           `public` = may be shown as "possibly the same entity"
  vendor_canonical         group members only: vendor_id -> canonical_id
                           (connected components over 'same'; survivor = most contracts)
  vendors.rfc              filled ONLY for personas morales with a grade-A recovered
                           RFC whose current rfc is empty or junk (grade D)

Rules on top of _entity_res/method (FINDINGS_method.md):
  * AUTO edges touching GT / sanctioned / ETL-mixed vendors were already moved to
    REVIEW_guarded by 04_tiers.py; re-checked here against the live DB.
  * Blind review (FINDINGS_blind.md): an AUTO_name pair whose name has <= 1
    distinctive token (SAMTRAC, OMEGA COMUNICACIONES) needs a shared buyer, else it
    is demoted to candidate tier REVIEW_generic_name (analysts only).
  * PROBABLE_name_no_cosignal, REVIEW_guarded, REVIEW_generic_name are never public;
    REVIEW_name is public only when both sides lack an RFC and are Structure A/B;
    no pair touching a persona física is public.

Inputs (--inputs, default <repo>/_entity_res; the _private parquet holds RFCs, never commit it):
  method/proposed_auto_merges.parquet, method/proposed_probable_links.parquet,
  method/proposed_rfc_recoveries.parquet, method/_proposed_rfc_recoveries_private.parquet,
  method/flags.parquet, method/cores.parquet, method/resolve.py,
  rfc/vendor_rfc_grades.parquet, rfc/rfc_quality.py, research/generic_tokens_es.txt

Usage:
  python -m scripts.migrate_vendors --db PATH --dry-run
  python -m scripts.migrate_vendors --db PATH                 # apply
  python -m scripts.migrate_vendors --db PATH --rollback DIR  # undo a run

Every apply writes reversal CSVs to <reversal-root>/<timestamp>/ (they hold the old
vendors.rfc values: keep them private). Precomputes then aggregate by canonical id
(scripts/_vendor_canonical.py; scripts/_refresh_stats_tables.py --vendors-only).
"""
import argparse
import collections
import csv
import json
import sqlite3
import sys
import time
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_INPUTS = HERE.parent.parent / "_entity_res"
RULE_VERSION = "resolve.py@2026-09-24+blind-generic@2026-09-30"
GRADER_VERSION = "rfc_quality.py@2026-09-24"

DDL = """
CREATE TABLE IF NOT EXISTS vendor_match_judgements (
  id              INTEGER PRIMARY KEY,
  left_vendor_id  INTEGER NOT NULL REFERENCES vendors(id),
  right_vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  judgement       TEXT NOT NULL CHECK (judgement IN ('same','different','unsure')),
  source          TEXT NOT NULL,
  rule_version    TEXT,
  evidence        TEXT,
  reviewer        TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  superseded_by   INTEGER REFERENCES vendor_match_judgements(id),
  CHECK (left_vendor_id < right_vendor_id)
);
CREATE INDEX IF NOT EXISTS idx_vmj_left  ON vendor_match_judgements(left_vendor_id)  WHERE superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_vmj_right ON vendor_match_judgements(right_vendor_id) WHERE superseded_by IS NULL;

CREATE TABLE IF NOT EXISTS vendor_match_candidates (
  left_vendor_id  INTEGER NOT NULL,
  right_vendor_id INTEGER NOT NULL,
  tier            TEXT NOT NULL CHECK (tier IN ('PROBABLE_typo','PROBABLE_name_form_change','PROBABLE_name_no_cosignal',
                                                'PROBABLE_rfc_related','REVIEW_name','REVIEW_guarded','REVIEW_generic_name')),
  score           REAL,
  cosignals       INTEGER,
  public          INTEGER NOT NULL DEFAULT 0,
  rule_version    TEXT NOT NULL,
  PRIMARY KEY (left_vendor_id, right_vendor_id, rule_version)
);
CREATE INDEX IF NOT EXISTS idx_vmc_right ON vendor_match_candidates(right_vendor_id);

CREATE TABLE IF NOT EXISTS vendor_rfc_quality (
  vendor_id          INTEGER PRIMARY KEY REFERENCES vendors(id),
  db_rfc_grade       TEXT CHECK (db_rfc_grade IN ('A','B','C','D')),
  db_rfc_reason      TEXT,
  best_rfc           TEXT,            -- PRIVATE: never serialized by the API
  best_rfc_source    TEXT CHECK (best_rfc_source IN ('db','raw_rows','rupc')),
  best_rfc_grade     TEXT CHECK (best_rfc_grade IN ('A','B','C','D')),
  is_persona_fisica  INTEGER NOT NULL,
  rfc_date           TEXT,
  rfc_date_conflict  INTEGER NOT NULL DEFAULT 0,
  n_raw_rfcs         INTEGER NOT NULL DEFAULT 0,
  shared_with_n_ids  INTEGER NOT NULL DEFAULT 0,
  display_ok         INTEGER NOT NULL,
  rfc_recovered      INTEGER NOT NULL DEFAULT 0,  -- vendors.rfc was filled by this migration
  graded_at          TEXT NOT NULL,
  grader_version     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendor_canonical (
  vendor_id    INTEGER PRIMARY KEY,
  canonical_id INTEGER NOT NULL,
  group_size   INTEGER NOT NULL,
  match_basis  TEXT NOT NULL      -- 'rfc' | 'name' | 'rfc+name' (edges inside the component)
);
CREATE INDEX IF NOT EXISTS idx_vendor_canonical_cid ON vendor_canonical(canonical_id);
"""
NEW_TABLES = ("vendor_canonical", "vendor_match_candidates", "vendor_match_judgements", "vendor_rfc_quality")
AGG_COLS = ("total_contracts", "total_amount_mxn", "avg_risk_score")  # vendors columns the precompute resyncs


def load_inputs(inputs: Path):
    import pandas as pd
    sys.path[:0] = [str(inputs / "method"), str(inputs / "rfc")]
    import resolve  # noqa: E402  (entity-resolution normalizer + scorer)
    rd = lambda p: pd.read_parquet(inputs / p)
    return dict(
        pd=pd, resolve=resolve,
        auto=rd("method/proposed_auto_merges.parquet"),
        prob=rd("method/proposed_probable_links.parquet"),
        rec=rd("method/proposed_rfc_recoveries.parquet"),
        rec_priv=rd("method/_proposed_rfc_recoveries_private.parquet"),
        flags=rd("method/flags.parquet"),
        cores=rd("method/cores.parquet"),
        grades=rd("rfc/vendor_rfc_grades.parquet"),
        generic=[l.split("\t")[1] for l in open(inputs / "research/generic_tokens_es.txt", encoding="utf-8")
                 if l.startswith(("GENERIC", "REVIEW"))],
    )


def rfc_date(rfc: str):
    """Date encoded in an RFC (YYMMDD after the 3/4 letters); None if unparsable."""
    body = rfc[len(rfc) - 9:len(rfc) - 3]
    try:
        yy, mm, dd = int(body[:2]), int(body[2:4]), int(body[4:6])
        cy = date.today().year % 100
        return date((2000 if yy <= cy else 1900) + yy, mm, dd).isoformat()
    except ValueError:
        return None


def components(edges):
    parent = {}

    def find(x):
        while parent.get(x, x) != x:
            parent[x] = parent.get(parent[x], parent[x])
            x = parent[x]
        return x
    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    grp = collections.defaultdict(list)
    for x in {x for e in edges for x in e}:
        grp[find(x)].append(x)
    return list(grp.values())


def build_plan(conn, inputs: Path):
    I = load_inputs(inputs)
    res = I["resolve"]
    fl = I["flags"].set_index("id")
    cores = I["cores"].set_index("id")
    V = {r[0]: dict(rfc=r[1], name=r[2], is_individual=r[3], first=r[4], n=r[5] or 0, val=r[6] or 0.0)
         for r in conn.execute("""SELECT v.id, v.rfc, v.name, v.is_individual, v.first_contract_date,
                                         s.total_contracts, s.total_value_mxn
                                  FROM vendors v LEFT JOIN vendor_stats s ON s.vendor_id = v.id""")}
    gt = {r[0] for r in conn.execute("SELECT DISTINCT vendor_id FROM ground_truth_vendors WHERE vendor_id IS NOT NULL")}

    print("  vendors loaded", flush=True)
    # ---- vendor_rfc_quality ------------------------------------------------------
    grades = {int(r.vendor_id): (r.rfc_grade, r.reason) for r in I["grades"].itertuples()}
    rec = I["rec"].merge(I["rec_priv"].rename(columns={"id": "vendor_id"}), on="vendor_id")
    rec = {int(r.vendor_id): (r.key, r.key_src) for r in rec.itertuples()}
    rows, best_of = [], {}
    today = time.strftime("%Y-%m-%d %H:%M:%S")
    for vid in sorted(set(grades) | set(rec)):
        v = V.get(vid)
        if v is None:
            continue
        g, reason = grades.get(vid, (None, None))
        db_rfc = (v["rfc"] or "").strip().upper()
        if g == "A":
            best, src, bg = db_rfc, "db", "A"
        elif vid in rec:
            best, src, bg = rec[vid][0], rec[vid][1], "A"   # recoveries are grade A by construction
        else:
            best, src, bg = (db_rfc or None), ("db" if db_rfc else None), g
        fisica = int(len(best) == 13) if best and len(best) in (12, 13) else int(v["is_individual"] or 0)
        rd = rfc_date(best) if best and len(best) in (12, 13) else None
        conflict = int(bool(rd and v["first"] and str(v["first"])[:10] < rd))
        etl_mixed = bool(fl.etl_mixed.get(vid, False))
        n_raw = 2 if etl_mixed else int(src == "raw_rows" or (src == "db" and vid in rec))
        best_of[vid] = best
        rows.append(dict(vendor_id=vid, db_rfc_grade=g, db_rfc_reason=reason, best_rfc=best, best_rfc_source=src,
                         best_rfc_grade=bg, is_persona_fisica=fisica, rfc_date=rd, rfc_date_conflict=conflict,
                         n_raw_rfcs=n_raw, display_ok=int(bg == "A" and not fisica), rfc_recovered=0,
                         graded_at=today, grader_version=GRADER_VERSION))
    share = collections.Counter(b for b in best_of.values() if b)
    for r in rows:
        r["shared_with_n_ids"] = share[r["best_rfc"]] - 1 if r["best_rfc"] else 0
    Q = {r["vendor_id"]: r for r in rows}
    fisica = lambda vid: Q[vid]["is_persona_fisica"] if vid in Q else int(V.get(vid, {}).get("is_individual") or 0)

    # company RFC fill: persona moral, recovered grade A, db rfc empty or junk (D), not ETL-mixed.
    # Only RFCs CompraNet itself published for this vendor (raw rows) become public in
    # vendors.rfc — that column also drives EFOS/SFP flags. RUPC-inferred RFCs (unique-name
    # match) stay private in vendor_rfc_quality.best_rfc for merging only: 35 of the new
    # EFOS matches rested on them (2026-09-30 review).
    fills = []
    for vid, r in Q.items():
        if (r["best_rfc_source"] == "raw_rows" and r["best_rfc_grade"] == "A" and not r["is_persona_fisica"]
                and len(r["best_rfc"]) == 12 and r["db_rfc_grade"] in (None, "D") and r["n_raw_rfcs"] < 2
                and not r["rfc_date_conflict"]):
            fills.append((vid, V[vid]["rfc"], r["best_rfc"], r["best_rfc_source"]))
            r["rfc_recovered"] = 1

    print("  rfc quality graded", flush=True)
    # ---- judgements (AUTO) + blind generic-name rule -----------------------------
    comp = I["flags"][I["flags"].is_individual == 0].id
    company_cores = cores.core.reindex(comp).dropna()
    df = collections.Counter(t for c in company_cores for t in set(res.tokens(c)))
    sc = res.Scorer(df, len(company_cores), I["generic"])
    n_dist = lambda vid: sum(sc.distinctive(t) for t in res.tokens(cores.core.get(vid, "") or ""))

    auto = I["auto"]
    generic_pairs = [(int(a), int(b)) for a, b, t in zip(auto.id_a, auto.id_b, auto.tier)
                     if t == "AUTO_name" and min(n_dist(a), n_dist(b)) <= 1]
    need = {x for p in generic_pairs for x in p}
    buyers = collections.defaultdict(set)
    inst_canon = dict(conn.execute("SELECT institution_id, canonical_id FROM institution_canonical"))         if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='institution_canonical'").fetchone() else {}
    # covering-index scan (institution_id, vendor_id): no random reads into the 3.1M-row table
    for iid, vid in conn.execute("SELECT institution_id, vendor_id FROM contracts INDEXED BY idx_c_inst_vendor "
                                 "WHERE institution_id IS NOT NULL"):
        if vid in need:
            buyers[vid].add(inst_canon.get(iid, iid))
    no_buyer = {p for p in generic_pairs if not (buyers[p[0]] & buyers[p[1]])}

    print("  buyers scanned", flush=True)
    blocked = gt | {int(i) for i in fl.index[fl.sanctioned | fl.etl_mixed]}
    judg, cand = [], []
    for a, b, t in zip(auto.id_a, auto.id_b, auto.tier):
        a, b = sorted((int(a), int(b)))
        if a not in V or b not in V:
            continue
        if a in blocked or b in blocked:
            cand.append((a, b, "REVIEW_guarded", 1.0, None))
        elif (a, b) in no_buyer or (b, a) in no_buyer:
            cand.append((a, b, "REVIEW_generic_name", 1.0, None))
        else:
            src = "rfc_grade_a" if t == "AUTO_rfc" else "exact_name_v2"
            judg.append((a, b, src, json.dumps({"tier": t, "distinctive_tokens": min(n_dist(a), n_dist(b))})))

    # ---- canonical components ----------------------------------------------------
    edge_src = {(a, b): s for a, b, s, _ in judg}
    canon = {}
    for c in map(set, components([(a, b) for a, b, _, _ in judg])):
        keep = max(c, key=lambda x: (V[x]["n"], V[x]["val"], -x))
        srcs = {s for (a, b), s in edge_src.items() if a in c}
        basis = "rfc+name" if len(srcs) == 2 else ("rfc" if "rfc_grade_a" in srcs else "name")
        for x in c:
            canon[x] = (keep, len(c), basis)
    group_of = {x: canon[x][0] for x in canon}

    print("  components built", flush=True)
    # ---- candidates (link-only) ------------------------------------------------------
    prob = I["prob"]
    for r in prob.itertuples():
        a, b = sorted((int(r.id_a), int(r.id_b)))
        if a not in V or b not in V:
            continue
        cand.append((a, b, r.tier, None if r.score != r.score else float(r.score),
                     None if r.cos != r.cos else int(r.cos)))
    seen, cands = set(), []
    for a, b, tier, score, cos in cand:
        if (a, b) in seen:
            continue
        seen.add((a, b))
        same_group = group_of.get(a, a) == group_of.get(b, b)
        public = tier in ("PROBABLE_typo", "PROBABLE_name_form_change", "PROBABLE_rfc_related")
        if tier == "REVIEW_name":
            public = all(not bool(fl.has_key.get(x, False)) and fl.main_structure.get(x) in ("A", "B") for x in (a, b))
        public = public and not fisica(a) and not fisica(b) and not same_group
        cands.append((a, b, tier, score, cos, int(public)))

    return dict(V=V, gt=gt, rfcq=rows, fills=fills, judg=judg, cands=cands, canon=canon,
                generic_pairs=len(generic_pairs), no_buyer=len(no_buyer),
                sanctioned={int(i) for i in fl.index[fl.sanctioned]})


def summarize(plan):
    V, canon = plan["V"], plan["canon"]
    absorbed = [x for x, (c, _, _) in canon.items() if c != x]
    tiers = collections.Counter(t for _, _, t, _, _, _ in plan["cands"])
    pub = collections.Counter(t for _, _, t, _, _, p in plan["cands"] if p)
    q = plan["rfcq"]
    print(f"vendor_rfc_quality rows      {len(q):>8,}  (best grade A {sum(r['best_rfc_grade'] == 'A' for r in q):,}; "
          f"display_ok {sum(r['display_ok'] for r in q):,}; personas fisicas {sum(r['is_persona_fisica'] for r in q):,})")
    fsrc = collections.Counter(s for *_, s in plan["fills"])
    print(f"vendors.rfc filled           {len(plan['fills']):>8,}  {dict(fsrc)} "
          f"(was empty {sum(1 for _, o, _, _ in plan['fills'] if not (o or '').strip()):,}, was junk "
          f"{sum(1 for _, o, _, _ in plan['fills'] if (o or '').strip()):,}); on GT vendors "
          f"{sum(1 for v, *_ in plan['fills'] if v in plan['gt'])}")
    js = collections.Counter(s for _, _, s, _ in plan["judg"])
    print(f"judgements 'same'            {len(plan['judg']):>8,}  {dict(js)}")
    print(f"  AUTO_name generic-name pairs {plan['generic_pairs']:,}; without a shared buyer -> REVIEW_generic_name "
          f"{plan['no_buyer']:,}")
    print(f"vendor_canonical members     {len(canon):>8,}  in {len({c for c, _, _ in canon.values()}):,} groups; "
          f"absorbed ids {len(absorbed):,}; contracts re-grouped {sum(V[x]['n'] for x in absorbed):,}; "
          f"value {sum(V[x]['val'] for x in absorbed) / 1e9:,.1f}B MXN")
    print(f"  GT vendors in any group: {sum(1 for x in canon if x in plan['gt'])}; "
          f"sanctioned in any group: {sum(1 for x in canon if x in plan['sanctioned'])}")
    print(f"candidates                   {len(plan['cands']):>8,}  {dict(tiers)}")
    print(f"  public                     {sum(pub.values()):>8,}  {dict(pub)}")
    big = sorted({c for c, _, _ in canon.values()}, key=lambda c: -sum(V[x]['val'] for x in canon if canon[x][0] == c))[:10]
    print("largest groups by value (canonical id: name | members):")
    for c in big:
        mem = sorted(x for x in canon if canon[x][0] == c)
        print(f"  {c}: {V[c]['name']} | {mem} | {sum(V[x]['val'] for x in mem) / 1e9:.2f}B")


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def apply(conn, plan, rdir: Path):
    rdir.mkdir(parents=True, exist_ok=True)
    members = sorted(plan["canon"])
    t = time.time()
    conn.execute("BEGIN IMMEDIATE")
    try:
        for n in NEW_TABLES:  # tables only exist after a failed/partial run (applied runs exit in main)
            conn.execute(f"DROP TABLE IF EXISTS {n}")
        # reversal: old vendors.rfc, and the aggregate rows of every group member the precompute will rewrite
        write_csv(rdir / "vendors_rfc.csv", ["vendor_id", "old_rfc", "new_rfc_source"],
                  [(v, o, s) for v, o, _, s in plan["fills"]])
        ph = lambda ids: ",".join("?" * len(ids))
        vs_cols = [r[1] for r in conn.execute("PRAGMA table_info(vendor_stats)")]
        vs_rows, v_rows = [], []
        for i in range(0, len(members), 500):
            ch = members[i:i + 500]
            vs_rows += conn.execute(f"SELECT * FROM vendor_stats WHERE vendor_id IN ({ph(ch)})", ch).fetchall()
            v_rows += conn.execute(f"SELECT id, {', '.join(AGG_COLS)} FROM vendors WHERE id IN ({ph(ch)})", ch).fetchall()
        write_csv(rdir / "vendor_stats_members.csv", vs_cols, vs_rows)
        write_csv(rdir / "vendors_aggregates_members.csv", ["id", *AGG_COLS], v_rows)

        for stmt in DDL.split(";"):  # not executescript: it would COMMIT the open transaction
            if stmt.strip():
                conn.execute(stmt)
        cols = ["vendor_id", "db_rfc_grade", "db_rfc_reason", "best_rfc", "best_rfc_source", "best_rfc_grade",
                "is_persona_fisica", "rfc_date", "rfc_date_conflict", "n_raw_rfcs", "shared_with_n_ids", "display_ok",
                "rfc_recovered", "graded_at", "grader_version"]
        conn.executemany(f"INSERT INTO vendor_rfc_quality ({', '.join(cols)}) VALUES ({ph(cols)})",
                         [tuple(r[c] for c in cols) for r in plan["rfcq"]])
        conn.executemany("INSERT INTO vendor_match_judgements (left_vendor_id, right_vendor_id, judgement, source, "
                         "rule_version, evidence, reviewer) VALUES (?, ?, 'same', ?, ?, ?, 'auto')",
                         [(a, b, s, RULE_VERSION, e) for a, b, s, e in plan["judg"]])
        conn.executemany("INSERT INTO vendor_match_candidates (left_vendor_id, right_vendor_id, tier, score, cosignals, "
                         "public, rule_version) VALUES (?, ?, ?, ?, ?, ?, ?)",
                         [(*c, RULE_VERSION) for c in plan["cands"]])
        conn.executemany("INSERT INTO vendor_canonical VALUES (?, ?, ?, ?)",
                         [(x, c, n, b) for x, (c, n, b) in plan["canon"].items()])
        conn.executemany("UPDATE vendors SET rfc = ? WHERE id = ?", [(new, v) for v, _, new, _ in plan["fills"]])
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    print(f"applied in {time.time() - t:.1f}s; reversal: {rdir}")
    print("next: python -m scripts._refresh_stats_tables --vendors-only --db <DB>  (rebuilds vendor_stats by canonical id)")


def rollback(conn, rdir: Path):
    rd = lambda n: list(csv.DictReader(open(rdir / n, encoding="utf-8")))
    num = lambda x: None if x in ("", None) else float(x)
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.executemany("UPDATE vendors SET rfc = ? WHERE id = ?",
                         [(r["old_rfc"] or None, int(r["vendor_id"])) for r in rd("vendors_rfc.csv")])
        conn.executemany(f"UPDATE vendors SET {', '.join(c + ' = ?' for c in AGG_COLS)} WHERE id = ?",
                         [(*(num(r[c]) for c in AGG_COLS), int(r["id"])) for r in rd("vendors_aggregates_members.csv")])
        vs = rd("vendor_stats_members.csv")
        if vs:
            cols = list(vs[0])
            conn.executemany(f"INSERT OR REPLACE INTO vendor_stats ({', '.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                             [tuple(r[c] if r[c] != "" else None for c in cols) for r in vs])
        for n in NEW_TABLES:
            conn.execute(f"DROP TABLE IF EXISTS {n}")
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    print(f"rolled back from {rdir}: vendors.rfc, member aggregates and vendor_stats rows restored; 4 tables dropped")


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    p.add_argument("--db", required=True)
    p.add_argument("--inputs", default=str(DEFAULT_INPUTS))
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--reversal-root", default=None,
                   help="where reversal CSVs go (default: <db dir>/vendor_migration_reversal)")
    p.add_argument("--rollback", default=None, help="reversal dir of the run to undo")
    a = p.parse_args()
    if not Path(a.db).exists():
        sys.exit(f"DB not found: {a.db}")
    conn = sqlite3.connect(a.db, timeout=120, isolation_level=None)
    conn.execute("PRAGMA busy_timeout = 60000")
    if a.rollback:
        rollback(conn, Path(a.rollback))
        return
    if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vendor_canonical'").fetchone()             and conn.execute("SELECT COUNT(*) FROM vendor_canonical").fetchone()[0]:
        print("already applied (vendor_canonical populated): nothing to do. --rollback DIR to undo.")
        return
    t = time.time()
    plan = build_plan(conn, Path(a.inputs))
    print(f"plan built in {time.time() - t:.1f}s  ({a.db})")
    summarize(plan)
    if a.dry_run:
        print("DRY-RUN: nothing written.")
        return
    root = Path(a.reversal_root) if a.reversal_root else Path(a.db).resolve().parent / "vendor_migration_reversal"
    apply(conn, plan, root / time.strftime("%Y%m%d_%H%M%S"))


def _selfcheck():
    assert rfc_date("ABC990101XY1") == "1999-01-01"
    assert rfc_date("ABCD050229XY1") is None  # 2005 is not a leap year
    assert sorted(map(sorted, components([(1, 2), (2, 3), (5, 6)]))) == [[1, 2, 3], [5, 6]]


if __name__ == "__main__":
    _selfcheck()
    main()
