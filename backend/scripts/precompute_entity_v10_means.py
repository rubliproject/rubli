"""Precompute per-vendor / per-institution means of every contract_features_v10 input.

The v0.9.2 risk waterfalls (vendors.py _build_waterfall, institutions.py
get_institution_risk_waterfall) average contract_features_v10 over an entity's
contracts; for IMSS that is a 662K-row live AVG (> 60 s on prod). This writes
`entity_v10_means` (entity_type 'vendor_id' | 'institution_id', entity_id, cnt,
one REAL column per feature), NULLs filled as _v10/score_v092.py fills them, and
active_model.v10_entity_means reads it first. Rerun after any rescore of v10.

    python -m scripts.precompute_entity_v10_means [DB]
"""
import sqlite3
import sys

from api.services.active_model import V10_FILL


def build(conn) -> int:
    feats = [r[1] for r in conn.execute("PRAGMA table_info(contract_features_v10)") if r[1] != "contract_id"]
    sel = ", ".join(f"AVG(COALESCE(f.{c}, {V10_FILL.get(c, 0.0)}))" for c in feats)
    conn.execute("DROP TABLE IF EXISTS entity_v10_means_new")
    conn.execute(f"CREATE TABLE entity_v10_means_new (entity_type TEXT, entity_id INTEGER, cnt INTEGER, "
                 f"{', '.join(c + ' REAL' for c in feats)}, PRIMARY KEY (entity_type, entity_id))")
    n = 0
    for col in ("vendor_id", "institution_id"):
        # INSERT … SELECT: rows never enter Python (a fetchall OOM-killed it in the 1.5 GB backend)
        k = conn.execute(f"INSERT INTO entity_v10_means_new SELECT '{col}', c.{col}, COUNT(*), {sel} "
                         f"FROM contract_features_v10 f JOIN contracts c ON c.id = f.contract_id "
                         f"WHERE c.{col} IS NOT NULL GROUP BY c.{col}").rowcount
        n += k
        print(f"{col}: {k:,} entities", flush=True)
    conn.execute("DROP TABLE IF EXISTS entity_v10_means")
    conn.execute("ALTER TABLE entity_v10_means_new RENAME TO entity_v10_means")
    conn.commit()
    return n


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else "RUBLI_NORMALIZED.db"
    c = sqlite3.connect(db)
    print(f"entity_v10_means: {build(c):,} rows -> {db}")
    c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    c.close()
