"""Seed exchange_rates table with Banxico FIX annual means (api/fx_rates.py).

Run: python -m scripts.seed_exchange_rates  (from backend/)

Idempotent — uses INSERT OR REPLACE so it can be run multiple times.
"""
import sys
from pathlib import Path

# Allow running as a module from backend/ directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from api.dependencies import get_db
from api.fx_rates import MXN_USD_RATES

ANNUAL_RATES = MXN_USD_RATES  # api/fx_rates.py — Banxico FIX annual means (SF43718)


def seed() -> None:
    with get_db() as conn:
        cursor = conn.cursor()

        # Table already exists (created by schema-architect).
        # Annual averages are stored with month=0 as a sentinel value,
        # since the existing schema enforces month NOT NULL.
        inserted = 0
        for year, rate in sorted(ANNUAL_RATES.items()):
            cursor.execute(
                """
                INSERT OR REPLACE INTO exchange_rates
                    (year, month, mxn_usd_fix, source, updated_at)
                VALUES (?, 0, ?, 'banxico_annual_avg', datetime('now'))
                """,
                (year, rate),
            )
            inserted += 1

        conn.commit()
        print(f"Seeded {inserted} annual exchange rate rows into exchange_rates.")
        print("Sample rows:")
        cursor.execute(
            "SELECT year, mxn_usd_fix, source FROM exchange_rates WHERE month = 0 ORDER BY year"
        )
        for row in cursor.fetchall():
            print(f"  {row['year']}: {row['mxn_usd_fix']} ({row['source']})")


if __name__ == "__main__":
    seed()
