/**
 * exchangeRates.ts — the ONE MXN→USD table for the frontend.
 *
 * Annual means of Banxico's daily FIX rate (series SF43718, «Tipo de cambio
 * para solventar obligaciones … Fecha de determinación (FIX)»), pesos per US
 * dollar, computed from the full daily series downloaded 2026-11-02:
 *   https://www.banxico.org.mx/SieInternet/consultasieiqy?series=SF43718&l=es
 * Cross-checked against FRED DEXMXUS annual means (all within 0.5 %) and the
 * CEFP's published FIX averages for 2021–2023 (exact match).
 * 2026 = year-to-date mean, 2 Jan – 30 Oct 2026 (210 fixing days); update yearly.
 *
 * Backend mirror: backend/api/fx_rates.py (kept equal by
 * backend/tests/test_fx_rates.py). Every USD figure on the site — the
 * formatDualCurrency hero/footer companion, formatCompactUSD in tooltips and
 * money paths, formatCompactUSDByYear, toReal2024USD — reads this table.
 */
export const MXN_USD_RATES: Record<number, number> = {
  2002: 9.67,  2003: 10.79, 2004: 11.29, 2005: 10.89, 2006: 10.90,
  2007: 10.93, 2008: 11.14, 2009: 13.50, 2010: 12.63, 2011: 12.43,
  2012: 13.17, 2013: 12.77, 2014: 13.30, 2015: 15.88, 2016: 18.69,
  2017: 18.91, 2018: 19.24, 2019: 19.26, 2020: 21.50, 2021: 20.28,
  2022: 20.12, 2023: 17.73, 2024: 18.33, 2025: 19.20,
  2026: 17.50, // YTD (Jan 2 – Oct 30, 2026)
}

/** Latest year in the table — its rate is "today's" rate for undated amounts. */
export const LATEST_RATE_YEAR = 2026

/** MXN per USD for `year`; undated or out-of-table years use the latest year. */
export function getExchangeRate(year?: number): number {
  return (year != null && MXN_USD_RATES[year]) || MXN_USD_RATES[LATEST_RATE_YEAR]
}
