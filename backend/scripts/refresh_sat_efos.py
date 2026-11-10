"""Refresh sat_efos_vendors from the SAT 69-B list and re-derive the ARIA EFOS flag.

aria_queue.is_efos_definitivo / efos_rfc are written only by a full ARIA
pipeline run, from whatever sat_efos_vendors held at the time — so they drift
when SAT moves a taxpayer between situaciones. This script reloads the table
and recomputes ONLY those two columns with the pipeline's own
``load_external_crossref`` (same RFC join + name fallback). IPS scores and
tiers are not touched; a pipeline re-run picks the new flags up for scoring.

    python -m scripts.refresh_sat_efos --db PATH [--file CSV | --url URL]   # dry run
    python -m scripts.refresh_sat_efos --db PATH --file CSV --apply [--exclude-vendor-ids 1,2]
    python -m scripts.refresh_sat_efos --db PATH --rollback BACKUP.json

Duplicate RFCs (one row per SAT proceeding) collapse to the strongest
situación: definitivo > presunto > desvirtuado > favorecido. Output never
prints an RFC — vendors are listed by id and name only.
"""
from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
import tempfile
import urllib.request
from collections import Counter
from datetime import datetime
from pathlib import Path

from scripts.aria_pipeline import load_external_crossref
from scripts.load_sat_efos import load_from_file

DEFAULT_URL = "http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv"
_PRECEDENCE = {"definitivo": 0, "presunto": 1, "desvirtuado": 2, "favorecido": 3}
_COLS = ("rfc", "company_name", "stage", "dof_date", "loaded_at")


def dedupe(records: list[dict]) -> dict[str, dict]:
    best: dict[str, dict] = {}
    for r in records:
        cur = best.get(r["rfc"])
        if cur is None or _PRECEDENCE.get(r["stage"], 9) < _PRECEDENCE.get(cur["stage"], 9):
            best[r["rfc"]] = r
    return best


def fetch(url: str, dest_dir: Path) -> Path:
    dest = dest_dir / f"sat69b_{datetime.now():%Y%m%d}.csv"
    with urllib.request.urlopen(url, timeout=120) as resp:
        dest.write_bytes(resp.read())
    return dest


def compute(db: Path, new: dict[str, dict]) -> tuple[Counter, list[dict]]:
    """Diff on a read-only connection: the new list goes into a TEMP table that
    shadows sat_efos_vendors, so the pipeline function reads it unchanged."""
    conn = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
    old = {rfc: stage for rfc, stage in conn.execute("SELECT rfc, stage FROM sat_efos_vendors")}
    transitions = Counter((old.get(k), v["stage"]) for k, v in new.items() if old.get(k) != v["stage"])
    transitions.update((stage, None) for rfc, stage in old.items() if rfc not in new)

    conn.execute("CREATE TEMP TABLE sat_efos_vendors (id INTEGER PRIMARY KEY, rfc TEXT, company_name TEXT, stage TEXT, dof_date TEXT, loaded_at TEXT)")
    conn.executemany(
        "INSERT INTO temp.sat_efos_vendors (rfc, company_name, stage, dof_date) VALUES (?, ?, ?, ?)",
        [(r["rfc"], r["company_name"], r["stage"], r["dof_date"]) for r in new.values()],
    )
    flags = load_external_crossref(conn)
    changes = []
    for vid, name, vrfc, is_efos, efos_rfc, tier in conn.execute(
        "SELECT q.vendor_id, v.name, v.rfc, q.is_efos_definitivo, q.efos_rfc, q.ips_tier "
        "FROM aria_queue q JOIN vendors v ON v.id = q.vendor_id"
    ):
        f = flags.get(vid, {"is_efos": 0, "efos_rfc": None})
        if int(is_efos or 0) != f["is_efos"] or (f["is_efos"] and efos_rfc != f["efos_rfc"]):
            changes.append({
                "vendor_id": vid, "name": name, "tier": tier,
                "old": int(is_efos or 0), "old_rfc": efos_rfc,
                "new": f["is_efos"], "new_rfc": f["efos_rfc"],
                # pipeline's name fallback: vendor RFC absent from the list
                "via": "rfc" if (vrfc or "").upper() in new else "name",
            })
    conn.close()
    return transitions, changes


def exclude(changes: list[dict], ids: str) -> list[dict]:
    skip = {int(x) for x in ids.split(",") if x.strip()}
    for c in changes:
        if c["vendor_id"] in skip:
            print(f"    excluded vendor {c['vendor_id']}  {c['old']} -> {c['new']}  [{c['via']}]")
    return [c for c in changes if c["vendor_id"] not in skip]


def report(transitions: Counter, changes: list[dict], n_new: int) -> None:
    print(f"SAT list: {n_new} distinct RFCs")
    print("Stage transitions (old -> new, None = absent):")
    for (a, b), n in transitions.most_common():
        print(f"    {a} -> {b}: {n}")
    flips = [c for c in changes if c["old"] != c["new"]]
    print(f"aria_queue EFOS flag flips: {len(flips)}  (+ {len(changes) - len(flips)} efos_rfc-only updates)")
    for c in sorted(flips, key=lambda c: (c["tier"] or 9, c["vendor_id"])):
        print(f"    vendor {c['vendor_id']} T{c['tier']}  {c['old']} -> {c['new']}  [{c['via']}]  {c['name']}")


def apply(db: Path, new: dict[str, dict], changes: list[dict]) -> None:
    conn = sqlite3.connect(str(db), timeout=60, isolation_level=None)
    conn.execute("PRAGMA busy_timeout = 60000")
    old_rows = [dict(zip(("id",) + _COLS, r)) for r in conn.execute(
        f"SELECT id, {', '.join(_COLS)} FROM sat_efos_vendors")]
    backup = db.with_name(f"{db.name}.refresh_sat_efos_{datetime.now():%Y%m%d_%H%M%S}.json")
    backup.write_text(json.dumps({
        "sat_efos_vendors": old_rows,
        "aria_queue": [{"vendor_id": c["vendor_id"], "is_efos_definitivo": c["old"], "efos_rfc": c["old_rfc"]}
                       for c in changes],
    }), encoding="utf-8")
    print(f"Backup: {backup}")
    loaded_at = datetime.now().isoformat()
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM sat_efos_vendors")
        conn.executemany(
            "INSERT INTO sat_efos_vendors (rfc, company_name, stage, dof_date, loaded_at) VALUES (?, ?, ?, ?, ?)",
            [(r["rfc"], r["company_name"], r["stage"], r["dof_date"], loaded_at) for r in new.values()],
        )
        conn.executemany(
            "UPDATE aria_queue SET is_efos_definitivo = ?, efos_rfc = ? WHERE vendor_id = ?",
            [(c["new"], c["new_rfc"], c["vendor_id"]) for c in changes],
        )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    conn.close()
    print(f"Applied: {len(new)} SAT rows, {len(changes)} aria_queue rows. Undo: --rollback {backup}")


def rollback(db: Path, backup: Path) -> None:
    data = json.loads(backup.read_text(encoding="utf-8"))
    conn = sqlite3.connect(str(db), timeout=60, isolation_level=None)
    conn.execute("PRAGMA busy_timeout = 60000")
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM sat_efos_vendors")
        conn.executemany(
            f"INSERT INTO sat_efos_vendors (id, {', '.join(_COLS)}) VALUES (?, ?, ?, ?, ?, ?)",
            [tuple(r[k] for k in ("id",) + _COLS) for r in data["sat_efos_vendors"]],
        )
        conn.executemany(
            "UPDATE aria_queue SET is_efos_definitivo = ?, efos_rfc = ? WHERE vendor_id = ?",
            [(r["is_efos_definitivo"], r["efos_rfc"], r["vendor_id"]) for r in data["aria_queue"]],
        )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    conn.close()
    print(f"Restored {len(data['sat_efos_vendors'])} SAT rows, {len(data['aria_queue'])} aria_queue rows.")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", required=True, type=Path)
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--file", type=Path, help="local SAT Listado_Completo_69-B.csv")
    src.add_argument("--url", default=None, help=f"download URL (default {DEFAULT_URL})")
    ap.add_argument("--exclude-vendor-ids", default="", metavar="ID,ID",
                    help="vendor ids whose aria_queue flag is left unchanged (e.g. homonym name matches)")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--rollback", type=Path, metavar="BACKUP.json")
    args = ap.parse_args()
    logging.disable(logging.INFO)  # loaders log headers/samples; keep RFC-free output

    if not args.db.exists():
        print(f"DB not found: {args.db}", file=sys.stderr)
        return 1
    if args.rollback:
        rollback(args.db, args.rollback)
        return 0

    path = args.file or fetch(args.url or DEFAULT_URL, Path(tempfile.mkdtemp(dir=args.db.parent)))
    records = load_from_file(str(path))
    if not records:
        print(f"No records parsed from {path}", file=sys.stderr)
        return 1
    new = dedupe(records)
    transitions, changes = compute(args.db, new)
    changes = exclude(changes, args.exclude_vendor_ids)
    report(transitions, changes, len(new))
    if args.apply:
        apply(args.db, new, changes)
    else:
        print("DRY RUN — nothing written. Re-run with --apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
