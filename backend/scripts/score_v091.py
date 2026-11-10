"""v0.9.1 scorer — THE active-model scorer (read docs/SCORING.md first).

Model: ElasticNet logistic + PU correction, run CAL-v91-* (``_v09/v091/SIGNOFF.md``):
v0.8.5's 21 base features + 4 partida (leave-current-out) + 2 RT-4 as-of institution
features, Stage-4b tempered (betas already scaled by T), intercept pinned to HR 10%.

    score = min(sigmoid(b0 + beta . x) / c_pu, 1)        then the v0.8.5 post-patch:
    structural-FP cap (5 vendors -> 0.05) + ghost-companion boost (ghost_confidence >= 0.4)

Features (null -> 0, clipped +-5, exactly as trained in _v09/train_eval.py::load):
  contract_z_features (16 z_*) + contract_z_features_v2 (5) + contract_features_v9 (6;
  RT-4 n_inst_prior -> log1p(n) [or log1p(min(n, cap))] and inst_hhi_prior, standardised
  with the stored population mean/std).
Population: contracts with a z-feature row, vendor_id NOT NULL, amount <= 100B MXN
(rejected contracts keep risk_score NULL / 'pending_score').

Steps (dry run by default; nothing is scored into contracts without --write):
  python -m scripts.score_v091 --install-calibration CAL-v91-...   # candidate -> model_calibration + feature_importance
  python -m scripts.score_v091 [--write]                            # score from model_calibration v0.9.1

--write sets contracts.risk_score_v91, risk_score, risk_level, risk_model_version='v0.9.1'.
risk_score_v8 is never touched (rollback = copy it back; see _v09/v091/prod/RUNBOOK.md).
"""
import argparse
import json
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

DB = Path(__file__).resolve().parents[1] / "RUBLI_NORMALIZED.db"
MODEL_VERSION = "v0.9.1"
MAX_VALID = 100_000_000_000
CLIP = 5.0
# v0.8.5 post-patch (_patch_v85_ghost_fp.py): the live cap covers exactly these 5 structural
# monopolies (INFRA, BAXTER x2, PRAXAIR, FRESENIUS) — not every is_false_positive GT link.
STRUCTURAL_FP_VENDORS = (1378, 5319, 1486, 4332, 4726)
FP_SCORE = 0.05

Z16 = ['single_bid', 'direct_award', 'price_ratio', 'vendor_concentration', 'ad_period_days',
       'year_end', 'same_day_count', 'network_member_count', 'co_bid_rate', 'price_hyp_confidence',
       'industry_mismatch', 'institution_risk', 'price_volatility', 'sector_spread', 'win_rate',
       'institution_diversity']
V2 = ['amount_residual_z', 'recency_z', 'cobid_herfindahl', 'pub_delay_z', 'amendment_flag']
PARTIDA = ['partida_price_residual_z_loo', 'partida_single_bid_z_loo', 'partida_direct_award_z_loo',
           'has_partida']


def level(s):
    # same ladder as frontend getRiskLevelFromScore (0.60 / 0.40 / 0.25)
    return np.select([s >= 0.60, s >= 0.40, s >= 0.25], ['critical', 'high', 'medium'], 'low')


def ghost_weight(g):
    return np.select([g >= 0.8, g >= 0.6], [0.40, 0.30], 0.20)


def install_calibration(conn, run_id):
    """Copy the signed-off candidate from model_calibration_v91 into model_calibration
    (model_version='v0.9.1', sector_id=0, {"names","values"}), resolving every transform."""
    cur = conn.execute("SELECT * FROM model_calibration_v91 WHERE run_id = ?", (run_id,))
    row = cur.fetchone()
    if row is None:
        sys.exit(f"run {run_id} not in model_calibration_v91")
    r = dict(zip([d[0] for d in cur.description], row))
    coef = json.loads(r['coefficients'])
    tf = json.loads(r['feature_transforms'])
    gold = json.loads(r['gold_metrics'])
    rt4_name = next(n for n in coef if n.startswith('rt4_'))
    kind = rt4_name[4:]
    # inst_hhi_prior was standardised in _v09/train_eval.py::load over the same population
    v9 = json.loads(conn.execute("SELECT feature_transforms FROM model_calibration_v9").fetchone()[0])
    transforms = {'clip': CLIP, 'null_to_zero': True,
                  'rt4': {'name': rt4_name, **tf['rt4'][kind]},
                  'inst_hhi_prior': v9['standardize']['inst_hhi_prior'],
                  'stage4b_T': tf.get('platt_slope'), 'stage4_delta': tf.get('stage4_delta'),
                  'source_tables': ['contract_z_features', 'contract_z_features_v2', 'contract_features_v9'],
                  'post_patch': {'structural_fp_vendors': list(STRUCTURAL_FP_VENDORS), 'fp_score': FP_SCORE,
                                 'ghost_boost': 'ghost_confidence>=0.8:+0.40g, >=0.6:+0.30g, >=0.4:+0.20g'}}
    hyper = {**tf.get('hp', {}), 'feature_transforms': transforms, 'variant': r['variant'],
             'source_run': run_id, 'gate': 'Gate B (Brier after a val-only prior-shift offset at 1:84, '
                                               'non-inferior to v0.8.5; ECE reported, not gating)'}
    gates = json.loads(r['gates']) if r.get('gates') else None
    conn.execute("DELETE FROM model_calibration WHERE model_version = ?", (MODEL_VERSION,))
    conn.execute(
        """INSERT INTO model_calibration (model_version, run_id, sector_id, intercept, coefficients,
               pu_correction_factor, auc_roc, brier_score, average_precision, hyperparameters,
               temporal_metrics, created_at, test_auc)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (MODEL_VERSION, run_id, 0, r['intercept'],
         json.dumps({'names': list(coef), 'values': [float(v) for v in coef.values()]}),
         r['c_pu'], gold['auc'], gold['brier_1to84'], gold['pr_auc_1to84'], json.dumps(hyper),
         json.dumps({'test_auc': gold['auc'], 'gold_metrics': gold, 'gates': gates,
                     'split': 'persisted gt_split gold_holdout (vendor-level)'}),
         datetime.now().isoformat(timespec='seconds'), gold['auc']))
    # feature_importance: one global model, so every sector gets the same ranking (v0.8.5 convention:
    # features are standardised, so linear-SHAP mean |contribution| is ranked by |beta|)
    ranked = sorted(coef.items(), key=lambda kv: -abs(kv[1]))
    now = datetime.now().isoformat()
    conn.execute("DELETE FROM feature_importance WHERE model_version = ?", (MODEL_VERSION,))
    conn.executemany(
        "INSERT INTO feature_importance (feature_name, factor_name, importance, shap_mean_abs, coefficient, "
        "model_version, rank, method, calculated_at, sector_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [(n, n, abs(b), abs(b), b, MODEL_VERSION, i + 1, 'linear_shap', now, sid)
         for sid in [None] + list(range(1, 13)) for i, (n, b) in enumerate(ranked)])
    conn.commit()
    print(f"[calibration] installed {run_id} as {MODEL_VERSION} sector_id=0 "
          f"(b0={r['intercept']:.4f}, c_pu={r['c_pu']:.4f}, {rt4_name})")


def load_model(conn):
    row = conn.execute("SELECT run_id, intercept, coefficients, pu_correction_factor, hyperparameters "
                       "FROM model_calibration WHERE model_version = ? AND sector_id = 0",
                       (MODEL_VERSION,)).fetchone()
    if row is None:
        sys.exit("no v0.9.1 row in model_calibration — run --install-calibration first")
    coef = json.loads(row[2])
    m = dict(run_id=row[0], intercept=float(row[1]), c_pu=float(row[3]), names=coef['names'],
             values=np.array(coef['values'], dtype='float64'), tf=json.loads(row[4])['feature_transforms'])
    # hard guardrails (docs/SCORING.md)
    if not m['intercept'] < -0.5 or not m['c_pu'] > 0.30:
        sys.exit(f"guardrail: intercept {m['intercept']:.4f} must be < -0.5 and c_pu {m['c_pu']:.4f} > 0.30")
    return m


def features(conn, m):
    zsel = ', '.join(f'zf.z_{z}' for z in Z16)
    v2sel = ', '.join(f'v2.{z}' for z in V2)
    q = f"""SELECT c.id, c.vendor_id, {zsel}, {v2sel},
                   f9.partida_price_residual_z_loo, f9.partida_single_bid_z_loo,
                   f9.partida_direct_award_z_loo, f9.has_partida, f9.n_inst_prior, f9.inst_hhi_prior
            FROM contract_z_features zf
            JOIN contracts c ON c.id = zf.contract_id
            LEFT JOIN contract_z_features_v2 v2 ON v2.contract_id = zf.contract_id
            LEFT JOIN contract_features_v9 f9 ON f9.contract_id = zf.contract_id
            WHERE c.vendor_id IS NOT NULL AND NOT (c.amount_mxn > {MAX_VALID})"""
    df = pd.concat(pd.read_sql(q, conn, chunksize=250_000), ignore_index=True)
    X = {n: df[f'z_{n}' if n in Z16 else n] for n in Z16 + V2 + PARTIDA}
    rt4, hhi = m['tf']['rt4'], m['tf']['inst_hhi_prior']
    n = df['n_inst_prior'].fillna(0).astype('float64')
    raw = np.log1p(np.minimum(n, rt4['cap_n_inst'])) if rt4['kind'] == 'cap' else np.log1p(n)
    X[rt4['name']] = (raw - rt4['mean']) / rt4['std']
    X['inst_hhi_prior'] = (df['inst_hhi_prior'].fillna(0.0) - hhi['mean']) / hhi['std']
    M = np.column_stack([np.nan_to_num(X[name].to_numpy('float64')) for name in m['names']])
    return df[['id', 'vendor_id']], np.clip(M, -CLIP, CLIP)


def score(conn, ids, M, m):
    p = 1.0 / (1.0 + np.exp(-(m['intercept'] + M @ m['values'])))
    raw = np.minimum(p / m['c_pu'], 1.0)
    s = raw.copy()
    vid = ids['vendor_id'].to_numpy('int64')
    fp = np.isin(vid, STRUCTURAL_FP_VENDORS)
    s[fp] = FP_SCORE
    g = pd.read_sql("SELECT vendor_id, ghost_confidence_score AS g FROM ghost_confidence_scores "
                    "WHERE ghost_confidence_score >= 0.4", conn).set_index('vendor_id')['g']
    gs = pd.Series(vid).map(g).to_numpy('float64')
    boost = ~np.isnan(gs) & ~fp
    s[boost] = np.minimum(1.0, s[boost] + gs[boost] * ghost_weight(gs[boost]))
    return np.round(raw, 6), np.round(s, 6), int(fp.sum()), int(boost.sum())


def report(name, s):
    lv = pd.Series(level(s)).value_counts().to_dict()
    print(f"[{name}] n={len(s):,} HR={(s >= .40).mean():.4%} critical={(s >= .60).mean():.4%} "
          f">=0.25={(s >= .25).mean():.4%} saturated={int((s >= 0.999999).sum()):,} mean={s.mean():.4f} "
          f"levels={lv}", flush=True)


def write(conn, ids, s):
    conn.execute("PRAGMA busy_timeout = 300000")
    conn.execute("PRAGMA cache_size = -3000000")  # 3 GB: with a cold cache the indexed UPDATE crawls
    conn.execute("PRAGMA temp_store = MEMORY")
    if 'risk_score_v91' not in {r[1] for r in conn.execute("PRAGMA table_info(contracts)")}:
        conn.execute("ALTER TABLE contracts ADD COLUMN risk_score_v91 REAL")
    conn.execute("DROP TABLE IF EXISTS temp._v91")
    conn.execute("CREATE TEMP TABLE _v91 (id INTEGER PRIMARY KEY, s REAL, lvl TEXT)")
    recs = list(zip(ids['id'].astype('int64').tolist(), s.tolist(), level(s).tolist()))
    for i in range(0, len(recs), 200_000):
        conn.executemany("INSERT INTO _v91 VALUES (?,?,?)", recs[i:i + 200_000])
    conn.commit()
    t = time.time()
    # Drop the indexes on the rewritten columns, update, rebuild them: one transaction.
    idx = conn.execute("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'contracts' "
                       "AND sql IS NOT NULL AND (sql LIKE '%risk_score%' OR sql LIKE '%risk_level%' "
                       "OR sql LIKE '%risk_model_version%')").fetchall()
    conn.execute("BEGIN IMMEDIATE")
    for name, _ in idx:
        conn.execute(f"DROP INDEX {name}")
    conn.execute("""UPDATE contracts SET risk_score_v91 = _v91.s, risk_score = _v91.s, risk_level = _v91.lvl,
                        risk_model_version = ? FROM _v91 WHERE contracts.id = _v91.id""", (MODEL_VERSION,))
    print(f"[write] updated in {time.time() - t:.0f}s; rebuilding {len(idx)} indexes", flush=True)
    for _, sql in idx:
        conn.execute(sql)
    conn.commit()
    print(f"[write] {len(recs):,} contracts written in {time.time() - t:.0f}s", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=str(DB))
    ap.add_argument('--install-calibration', metavar='RUN_ID')
    ap.add_argument('--write', action='store_true', help='write the scores (default: dry run)')
    a = ap.parse_args()
    conn = sqlite3.connect(a.db, timeout=300)
    if a.install_calibration:
        install_calibration(conn, a.install_calibration)
        return
    m = load_model(conn)
    print(f"[model] {MODEL_VERSION} {m['run_id']} b0={m['intercept']:.4f} c_pu={m['c_pu']:.4f} "
          f"features={len(m['names'])} rt4={m['tf']['rt4']['name']}", flush=True)
    t = time.time()
    ids, M = features(conn, m)
    print(f"[features] {M.shape} in {time.time() - t:.0f}s", flush=True)
    raw, s, n_fp, n_boost = score(conn, ids, M, m)
    report('formula', raw)
    print(f"[patch] structural-FP capped {n_fp:,} · ghost-boosted {n_boost:,}", flush=True)
    report('final', s)
    hr = float((s >= .40).mean())
    if not 0.02 <= hr <= 0.15:
        sys.exit(f"guardrail: HR {hr:.4f} outside OECD 2-15% — not written")
    if a.write:
        write(conn, ids, s)
    else:
        print("[dry-run] nothing written (pass --write)")
    conn.close()


if __name__ == '__main__':
    main()
