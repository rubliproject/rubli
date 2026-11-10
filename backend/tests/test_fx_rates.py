"""Backend and frontend share ONE MXN->USD table (Banxico FIX annual means)."""
import re
from pathlib import Path

import pytest

from api.fx_rates import LATEST_RATE, LATEST_RATE_YEAR, MXN_USD_RATES

pytestmark = pytest.mark.no_db

TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "exchangeRates.ts"


def test_backend_table_equals_frontend_table():
    src = TS.read_text(encoding="utf-8")
    body = src[src.index("MXN_USD_RATES"):src.index("}", src.index("MXN_USD_RATES"))]
    ts = {int(y): float(r) for y, r in re.findall(r"(\d{4}):\s*([\d.]+)", body)}
    assert ts == MXN_USD_RATES
    assert f"LATEST_RATE_YEAR = {LATEST_RATE_YEAR}" in src


def test_covers_data_years_and_latest_is_fallback():
    assert set(range(2002, 2027)) <= set(MXN_USD_RATES)
    assert LATEST_RATE_YEAR == max(MXN_USD_RATES)
    assert LATEST_RATE == MXN_USD_RATES[LATEST_RATE_YEAR]
