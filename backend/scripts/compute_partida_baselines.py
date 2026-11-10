"""
compute_partida_baselines.py — Phase 3 of the categorization enhancement.

The v0.8.5 risk model benchmarks price and competition only against a coarse
12-row per-SECTOR baseline. That baseline hides enormous within-sector structure:
inside `salud` alone, partida direct-award rates span 39%->98% and mean amounts
span 62x. This script adds a per-OBJETO-DEL-GASTO (CUCOP partida) baseline so a
contract's price / single-bid / direct-award can be judged against its own
spending class, not a sector average that mixes medicines with lab reagents.

Produces two tables:

  partida_baselines(scope, code, n, mean_log_amount, std_log_amount,
                    single_bid_rate, direct_award_rate)
      scope ∈ {specifica(5-digit), generica(3-digit), capitulo(1-digit)} —
      a fallback ladder so thin specifica cells defer to genérica, then capítulo.

  contract_partida_features(contract_id, generica, capitulo, spending_class,
                            baseline_scope, partida_price_residual_z,
                            partida_single_bid_z, partida_direct_award_z,
                            is_consolidated_multi_partida)
      mirrors contract_z_features_v2 (joined by contract_id). NULL for pre-2023
      contracts with no partida -> zero-imputed by the scorer, exactly like the
      existing z-features (safe, no harm to historical scores).

These are DESCRIPTIVE features (red-flags / sharper attribution). They are NOT
wired into the active coefficient vector here — that belongs to the next retrain.

Run from backend/:
    python -m scripts.compute_partida_baselines
"""

import math
import sqlite3
import time
from pathlib import Path

from scripts.cucop_catalog import parse_partida, CAPITULO

DB_PATH = Path(__file__).parent.parent / "RUBLI_NORMALIZED.db"
MAX_VALID = 100_000_000_000          # project rule: reject > 100B MXN
MIN_SAMPLE = 50                       # min cell size before falling back coarser
WINSOR = 5.0                          # clamp residual z-scores to ±5 SD


def _connect():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA busy_timeout = 120000")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = OFF")
    conn.execute("PRAGMA cache_size = -200000")
    return conn


def _welford_finalize(acc):
    """acc = [n, mean, M2, sum_sb, sum_da] -> (n, mean, std, sb_rate, da_rate)."""
    n, mean, m2, ssb, sda = acc
    if n == 0:
        return (0, 0.0, 0.0, 0.0, 0.0)
    std = math.sqrt(m2 / n) if n > 1 else 0.0
    return (n, mean, std, ssb / n, sda / n)


def _z(x, mean, std):
    if std is None or std < 1e-9:
        return 0.0
    z = (x - mean) / std
    return max(-WINSOR, min(WINSOR, z))


def _rate_z(x, p):
    """Standardized residual of a 0/1 outcome vs its baseline rate p."""
    denom = math.sqrt(p * (1.0 - p)) if 0.0 < p < 1.0 else 0.0
    if denom < 1e-9:
        return 0.0
    return max(-WINSOR, min(WINSOR, (x - p) / denom))


def build_baselines(conn):
    cur = conn.cursor()
    print("  loading structure-D single-partida contracts for baselines...")
    t0 = time.time()
    rows = cur.execute(
        """SELECT partida_especifica, amount_mxn, is_single_bid, is_direct_award
           FROM contracts
           WHERE partida_especifica IS NOT NULL AND partida_especifica != ''
             AND amount_mxn IS NOT NULL AND amount_mxn > 0 AND amount_mxn <= ?""",
        (MAX_VALID,),
    ).fetchall()
    print(f"  loaded {len(rows):,} rows in {time.time()-t0:.1f}s")

    # Welford accumulators per code at each scope.
    acc = {"specifica": {}, "generica": {}, "capitulo": {}}

    def add(scope, code, logamt, sb, da):
        a = acc[scope].get(code)
        if a is None:
            a = [0, 0.0, 0.0, 0.0, 0.0]
            acc[scope][code] = a
        a[0] += 1
        delta = logamt - a[1]
        a[1] += delta / a[0]
        a[2] += delta * (logamt - a[1])
        a[3] += sb
        a[4] += da

    n_used = 0
    for partida, amt, sb, da in rows:
        p = parse_partida(partida)
        if not p or p["is_consolidated"]:
            continue  # baselines from clean single-partida rows only
        logamt = math.log1p(amt)
        sb = 1.0 if sb else 0.0
        da = 1.0 if da else 0.0
        add("specifica", p["primary"], logamt, sb, da)
        add("generica", p["generica"], logamt, sb, da)
        add("capitulo", str(p["capitulo"]), logamt, sb, da)
        n_used += 1
    print(f"  baseline sample (single-partida, valid amount): {n_used:,}")

    cur.execute("DROP TABLE IF EXISTS partida_baselines")
    cur.execute(
        """CREATE TABLE partida_baselines (
               scope TEXT, code TEXT, n INTEGER,
               mean_log_amount REAL, std_log_amount REAL,
               single_bid_rate REAL, direct_award_rate REAL,
               PRIMARY KEY (scope, code) )"""
    )
    out = []
    for scope, cells in acc.items():
        for code, a in cells.items():
            n, mean, std, sbr, dar = _welford_finalize(a)
            out.append((scope, code, n, mean, std, sbr, dar))
    cur.executemany(
        "INSERT INTO partida_baselines VALUES (?,?,?,?,?,?,?)", out
    )
    conn.commit()
    by_scope = {s: sum(1 for r in out if r[0] == s) for s in acc}
    print(f"  partida_baselines: {len(out):,} cells "
          f"(specifica={by_scope['specifica']}, generica={by_scope['generica']}, "
          f"capitulo={by_scope['capitulo']})")
    return acc


def _pick_baseline(acc, p):
    """Finest-scope baseline with n>=MIN_SAMPLE: specifica -> generica -> capitulo."""
    for scope, key in (("specifica", p["primary"]),
                       ("generica", p["generica"]),
                       ("capitulo", str(p["capitulo"]))):
        a = acc[scope].get(key)
        if a and a[0] >= MIN_SAMPLE:
            return scope, _welford_finalize(a)
    # last resort: capitulo even if thin
    a = acc["capitulo"].get(str(p["capitulo"]))
    if a:
        return "capitulo", _welford_finalize(a)
    return None, None


def compute_features(conn, acc):
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS contract_partida_features")
    cur.execute(
        """CREATE TABLE contract_partida_features (
               contract_id INTEGER PRIMARY KEY,
               generica TEXT, capitulo INTEGER, spending_class TEXT,
               baseline_scope TEXT,
               partida_price_residual_z REAL,
               partida_single_bid_z REAL,
               partida_direct_award_z REAL,
               is_consolidated_multi_partida INTEGER )"""
    )
    print("  computing per-contract partida features...")
    t0 = time.time()
    rows = cur.execute(
        """SELECT id, partida_especifica, amount_mxn, is_single_bid, is_direct_award
           FROM contracts
           WHERE partida_especifica IS NOT NULL AND partida_especifica != ''"""
    ).fetchall()

    batch = []
    n_written = 0
    for cid, partida, amt, sb, da in rows:
        p = parse_partida(partida)
        if not p:
            continue
        scope, base = _pick_baseline(acc, p)
        consolidated = 1 if p["is_consolidated"] else 0
        if base is None:
            price_z = sbid_z = da_z = 0.0
        else:
            _, mean, std, sbr, dar = base
            # price residual is ill-defined for consolidated multi-object buys
            if consolidated or amt is None or amt <= 0 or amt > MAX_VALID:
                price_z = 0.0
            else:
                price_z = _z(math.log1p(amt), mean, std)
            sbid_z = _rate_z(1.0 if sb else 0.0, sbr)
            da_z = _rate_z(1.0 if da else 0.0, dar)
        batch.append((cid, p["generica"], p["capitulo"], p["spending_class"],
                      scope, price_z, sbid_z, da_z, consolidated))
        if len(batch) >= 20_000:
            cur.executemany(
                "INSERT OR REPLACE INTO contract_partida_features VALUES (?,?,?,?,?,?,?,?,?)",
                batch)
            conn.commit()
            n_written += len(batch)
            batch = []
    if batch:
        cur.executemany(
            "INSERT OR REPLACE INTO contract_partida_features VALUES (?,?,?,?,?,?,?,?,?)",
            batch)
        conn.commit()
        n_written += len(batch)
    print(f"  contract_partida_features: {n_written:,} rows in {time.time()-t0:.1f}s")


def report(conn):
    cur = conn.cursor()
    print("\n  === sanity: spending-class competition norms (the de-confounding signal) ===")
    for cls, cap in [("Goods", "2"), ("Services", "3"), ("Works", "6"), ("Capital", "5")]:
        r = cur.execute(
            "SELECT n, single_bid_rate, direct_award_rate FROM partida_baselines "
            "WHERE scope='capitulo' AND code=?", (cap,)).fetchone()
        if r:
            print(f"    {cls:<9} n={r[0]:>7,}  single_bid={100*r[1]:5.1f}%  direct_award={100*r[2]:5.1f}%")
    n_consol = cur.execute(
        "SELECT COUNT(*) FROM contract_partida_features WHERE is_consolidated_multi_partida=1"
    ).fetchone()[0]
    n_flag = cur.execute(
        "SELECT COUNT(*) FROM contract_partida_features "
        "WHERE partida_single_bid_z >= 2 OR partida_direct_award_z >= 2"
    ).fetchone()[0]
    print(f"    consolidated multi-partida contracts: {n_consol:,}")
    print(f"    contracts >=2 SD above their partida's single-bid/direct-award norm: {n_flag:,}")


def main():
    print("=" * 60)
    print("PARTIDA BASELINES + RISK FEATURES (Phase 3)")
    print("=" * 60)
    conn = _connect()
    try:
        acc = build_baselines(conn)
        compute_features(conn, acc)
        report(conn)
    finally:
        conn.close()
    print("=" * 60)


if __name__ == "__main__":
    main()
