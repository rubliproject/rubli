"""Build aria_vendor_drivers: the v0.9.2 risk model's own top inputs per vendor, ranked against the
vendors of its sector — the «why it scores high» aspects of /aria?ver=mapa (docs/ARIA_SPEC.md § 4).

Per vendor (contract_features_v10.vendor_cid, the canonical vendor the features were built on; an alias
id in the fila simply gets no model aspect), the mean over its contracts of three contract_features_v10 inputs with the largest positive
v0.9.2 betas that read in plain words (_v10/rematch_result.json, policy v091_asof, standardised betas):
  vol  price_volatility_raw      β 0.95  std of its prior amounts / its sector-year median amount
  pr   price_ratio_raw           β 0.48  contract amount / its sector-year median amount  (shown as ×)
  conc vendor_concentration_raw  β 0.19  its prior share of its sector's spend
and each mean's PERCENT_RANK among the vendors of the same primary sector (vendor_stats) that have it.
Not used: rt4_log (β 1.28, buyer breadth — works against capture, CLAUDE.md), cobid_herfindahl (β < 0:
the same competitors LOWER the score), inst_hhi_prior (the buyer share aspect already says it).
One INSERT … SELECT, built in a side table and swapped, so readers never see it empty. Rerun after any
v10 feature rebuild or ETL (docs/SCORING.md § If you must rescore, step 4). The endpoint reads it
through a 1 h cache and shows no model aspect when the table is absent.

    python -m scripts.precompute_aria_drivers --db PATH                    # features in PATH (prod)
    python -m scripts.precompute_aria_drivers --db PATH --features-db SRC  # contract_features_v10 read from SRC
    python -m scripts.precompute_aria_drivers --demo
"""
import argparse
import sqlite3
import time

DRIVERS = {"vol": "price_volatility_raw", "pr": "price_ratio_raw", "conc": "vendor_concentration_raw"}


def build(conn: sqlite3.Connection, src: str = "main") -> int:
    # keyed on the features' own canonical vendor (vendor_cid): one sequential scan, no 3M-row join to contracts
    means = ", ".join(f"AVG(f.{col}) AS {k}" for k, col in DRIVERS.items())
    # a NULL mean ranks in its own partition and is written NULL: «no history» is never an extreme
    ranks = ", ".join(f"m.{k}, CASE WHEN m.{k} IS NULL THEN NULL ELSE PERCENT_RANK() OVER "
                      f"(PARTITION BY vs.primary_sector_id, m.{k} IS NULL ORDER BY m.{k}) END" for k in DRIVERS)
    cols = ", ".join(f"{k} REAL, {k}_pct REAL" for k in DRIVERS)
    conn.execute("DROP TABLE IF EXISTS aria_vendor_drivers_new")
    conn.execute(f"CREATE TABLE aria_vendor_drivers_new (vendor_id INTEGER PRIMARY KEY, sector_id INTEGER, "
                 f"n INTEGER, {cols})")
    n = conn.execute(
        f"""INSERT INTO aria_vendor_drivers_new
            SELECT m.vendor_id, vs.primary_sector_id, m.n, {ranks}
            FROM (SELECT CAST(f.vendor_cid AS INTEGER) AS vendor_id, COUNT(*) AS n, {means}
                  FROM {src}.contract_features_v10 f
                  WHERE f.vendor_cid IS NOT NULL GROUP BY f.vendor_cid) m
            JOIN vendor_stats vs ON vs.vendor_id = m.vendor_id""").rowcount
    conn.execute("DROP TABLE IF EXISTS aria_vendor_drivers")
    conn.execute("ALTER TABLE aria_vendor_drivers_new RENAME TO aria_vendor_drivers")
    conn.commit()
    return n


def demo() -> None:
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE contract_features_v10 (contract_id INTEGER, vendor_cid REAL, price_volatility_raw REAL,
                                            price_ratio_raw REAL, vendor_concentration_raw REAL);
        CREATE TABLE vendor_stats (vendor_id INTEGER, primary_sector_id INTEGER);
        INSERT INTO vendor_stats VALUES (1, 1), (2, 1), (3, 1), (4, 2);
        INSERT INTO contract_features_v10 VALUES (10, 1, 1.0, 2.0, 0.1), (11, 1, 3.0, 4.0, 0.1),
            (20, 2, 0.5, 1.0, NULL), (30, 3, NULL, 0.5, 0.2), (40, 4, 9.0, 9.0, 0.9);
    """)
    assert build(c) == 4
    r = {v: (vol, vp, pr, pp, cp) for v, vol, vp, pr, pp, cp in
         c.execute("SELECT vendor_id, vol, vol_pct, pr, pr_pct, conc_pct FROM aria_vendor_drivers")}
    assert r[1] == (2.0, 1.0, 3.0, 1.0, 0.0), r[1]  # mean of its two contracts, top of sector 1
    assert r[3][1] is None and r[3][3] == 0.0         # no volatility → no rank; lowest price ratio
    assert r[2][4] is None                            # NULL concentration stays NULL
    assert r[4][1] == 0.0                             # alone in sector 2: ranked only against itself
    print("demo ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db")
    ap.add_argument("--features-db", help="read contract_features_v10 from this DB (read-only)")
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    if a.demo:
        demo()
    else:
        t = time.time()
        conn = sqlite3.connect(a.db, timeout=60, uri=True)
        conn.execute("PRAGMA temp_store=MEMORY")  # the GROUP BY b-tree never lands on a full C: temp dir
        src = "main"
        if a.features_db:
            conn.execute("ATTACH ? AS src", (f"file:{a.features_db}?mode=ro",))
            src = "src"
        print(f"aria_vendor_drivers: {build(conn, src):,} vendors -> {a.db} ({time.time() - t:.0f} s)")
        conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
        conn.close()
