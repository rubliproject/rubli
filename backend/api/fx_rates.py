"""The one MXN->USD table for the backend (mirror of frontend/src/lib/exchangeRates.ts).

Annual means of Banxico's daily FIX rate, series SF43718, pesos per US dollar, computed from
the full daily series downloaded 2026-11-02:
  https://www.banxico.org.mx/SieInternet/consultasieiqy?series=SF43718&l=es
2026 = year-to-date mean, 2 Jan - 30 Oct 2026 (210 fixing days); update yearly.
backend/tests/test_fx_rates.py keeps this equal to the frontend table.
"""

MXN_USD_RATES: dict[int, float] = {
    2002: 9.67,  2003: 10.79, 2004: 11.29, 2005: 10.89, 2006: 10.90,
    2007: 10.93, 2008: 11.14, 2009: 13.50, 2010: 12.63, 2011: 12.43,
    2012: 13.17, 2013: 12.77, 2014: 13.30, 2015: 15.88, 2016: 18.69,
    2017: 18.91, 2018: 19.24, 2019: 19.26, 2020: 21.50, 2021: 20.28,
    2022: 20.12, 2023: 17.73, 2024: 18.33, 2025: 19.20,
    2026: 17.50,  # YTD (Jan 2 - Oct 30, 2026)
}
LATEST_RATE_YEAR = 2026
LATEST_RATE = MXN_USD_RATES[LATEST_RATE_YEAR]
