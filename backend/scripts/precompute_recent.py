"""«Lo más reciente» — the last 14 days of ComprasMX publications → precomputed_stats['recent_activity'].

    python -m scripts.precompute_recent --db <DB> [--dry-run]

The Portada's freshness block (owner 2026-10-28: «I haven't seen anything new since 2025»). Reads the
staging table comprasmx_contracts (indexed on fecha_publicacion) so it answers even before the weekly
refresh has scored the newest rows; contracts already in the register carry their id and risk level.
  window   fecha_publicacion in (newest − 13 days .. newest]; > 100B MXN rejected, > 10B flagged
  largest  top 8 by amount; personas físicas never named (pooled label, title withheld: it can carry
           the name), no RFC written
Run by scripts/comprasmx_weekly.py after every refresh.
"""
import argparse
import json
import sqlite3
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.config.constants import FLAG_THRESHOLD, MAX_CONTRACT_VALUE  # noqa: E402
from api.public_labels import clean_name  # noqa: E402

STAT_KEY = "recent_activity"
DAYS = 14
TOP = 8


def compute(conn):
    newest = conn.execute("SELECT MAX(substr(fecha_publicacion, 1, 10)) FROM comprasmx_contracts").fetchone()[0]
    if not newest:
        return None
    start = (date.fromisoformat(newest) - timedelta(days=DAYS - 1)).isoformat()
    rows = conn.execute(
        "SELECT codigo_contrato, substr(fecha_publicacion, 1, 10), amount_mxn, is_direct_award, is_persona_fisica, "
        "titulo_contrato, siglas, institucion, institution_id, proveedor, vendor_id, orden_gobierno "
        "FROM comprasmx_contracts WHERE fecha_publicacion >= ? AND (amount_mxn IS NULL OR amount_mxn <= ?)",
        (start, MAX_CONTRACT_VALUE)).fetchall()
    n, v = len(rows), sum(r[2] or 0 for r in rows)
    da_v = sum(r[2] or 0 for r in rows if r[3])
    days = {}
    for r in rows:
        d = days.setdefault(r[1], [0, 0.0])
        d[0] += 1
        d[1] += r[2] or 0
    top = sorted(rows, key=lambda r: -(r[2] or 0))[:TOP]
    # their register ids + risk (contracts has no contract_number index: one pass for the few codes)
    codes = [r[0] for r in top]
    reg = {code: (cid, lvl, score) for cid, code, lvl, score in conn.execute(
        f"SELECT id, contract_number, risk_level, risk_score FROM contracts WHERE source_structure = 'E' "
        f"AND contract_number IN ({','.join('?' * len(codes))})", codes)} if codes else {}
    largest = []
    for r in top:
        pf = bool(r[4])
        cid, lvl, score = reg.get(r[0], (None, None, None))
        largest.append({
            "contract_id": cid, "date": r[1], "amount": r[2], "flagged": (r[2] or 0) > FLAG_THRESHOLD,
            "title": None if pf else r[5],  # a person's contract title can carry a CURP/RFC "institution_id": r[8], "institution": r[7], "siglas": r[6],
            "vendor_id": r[10], "vendor": clean_name(r[9]), "persona_fisica": pf,
            "direct_award": bool(r[3]), "risk_level": lvl, "risk_score": score, "federal": r[11] == "APF",
        })
    return {
        "newest": newest, "start": start, "days": DAYS, "n": n, "value": v, "da_v": da_v / v if v else None,
        "buyers": len({r[7] for r in rows}), "scored": sum(1 for x in largest if x["risk_level"]),
        "by_day": [{"date": d, "n": a[0], "value": a[1]} for d, a in sorted(days.items())],
        "largest": largest,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    t = time.time()
    conn = sqlite3.connect(a.db, timeout=120)
    data = compute(conn)
    if data is None:
        sys.exit("comprasmx_contracts is empty")
    print(f"{data['start']}..{data['newest']}: {data['n']:,} contracts · {data['value'] / 1e6:,.0f} MDP · "
          f"{data['buyers']} buyers · largest scored {data['scored']}/{len(data['largest'])}")
    if not a.dry_run:
        conn.execute("INSERT OR REPLACE INTO precomputed_stats(stat_key, stat_value, updated_at) VALUES (?, ?, datetime('now'))",
                     (STAT_KEY, json.dumps(data, ensure_ascii=False, separators=(",", ":"))))
        conn.commit()
        print(f"wrote precomputed_stats['{STAT_KEY}']")
    print(f"{time.time() - t:.1f}s")


if __name__ == "__main__":
    main()
