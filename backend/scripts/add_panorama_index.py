"""Add the covering indexes behind GET /institutions/{id}/panorama (concept B2 «La columna») and
GET /categories/{id}/panorama (category profile B2).

    python -m scripts.add_panorama_index --db RUBLI_NORMALIZED.db      # local (~20 s)
    python -m scripts.add_panorama_index --db /app/data/RUBLI_DEPLOY.db  # prod, after the backend deploy

Idempotent (CREATE INDEX IF NOT EXISTS). Without it the endpoint still answers, ~3× slower.
"""
import argparse
import sqlite3
import time

from api.services.category_panorama import INDEX_SQL as CAT_INDEX_SQL
from api.services.institution_panorama import INDEX_SQL

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    db = ap.parse_args().db
    t = time.time()
    with sqlite3.connect(db, timeout=120) as conn:
        conn.execute(INDEX_SQL)
        conn.execute(CAT_INDEX_SQL)
    print(f"idx_c_inst_panorama + idx_c_cat_panorama ready on {db} in {time.time() - t:.1f} s")
