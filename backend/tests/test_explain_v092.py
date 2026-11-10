"""v0.9.2 explainers read contract_features_v10 and reproduce the scored value exactly:
min(sigmoid(intercept + sum(beta * x)) / c_pu, 1) == risk_score (_v10/score_v092.py)."""
import json
import math
import sqlite3

import pytest

from api.services.active_model import v10_display_name, v10_means
from api.services.contract_service import contract_service

pytestmark = pytest.mark.no_db

COEF = {"z_price_ratio": 0.45, "rt4_log": 0.59, "inst_hhi_prior": 0.77, "cobid_herfindahl": -0.30,
        "partida_single_bid_z": -0.05}
B0, CPU = -3.6328, 0.436


def _db():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INT, risk_score REAL, risk_level TEXT, "
              "risk_model_version TEXT, risk_confidence_lower REAL, risk_confidence_upper REAL, sector_id INT, contract_year INT)")
    c.execute(f"CREATE TABLE contract_features_v10 (contract_id INTEGER PRIMARY KEY, {', '.join(f + ' REAL' for f in COEF)})")
    c.execute("CREATE TABLE model_calibration (id INTEGER PRIMARY KEY, model_version TEXT, run_id TEXT, sector_id INT, "
              "intercept REAL, coefficients TEXT, pu_correction_factor REAL, created_at TEXT, hyperparameters TEXT)")
    c.execute("INSERT INTO model_calibration VALUES (1, 'v0.9.2', 'CAL-v92', 0, ?, ?, ?, '2026-10-22', '{}')",
              (B0, json.dumps({"names": list(COEF), "values": list(COEF.values())}), CPU))
    rows = [(1, 2.0, 1.5, None, 1.0, 0.3), (2, -1.0, 0.0, 0.4, None, None)]  # NULLs -> scorer fill
    for cid, *x in rows:
        c.execute("INSERT INTO contract_features_v10 VALUES (?,?,?,?,?,?)", (cid, *x))
        filled = [v if v is not None else {"inst_hhi_prior": 1.0, "cobid_herfindahl": 1.0}.get(f, 0.0)
                  for f, v in zip(COEF, x)]
        z = B0 + sum(b * v for b, v in zip(COEF.values(), filled))
        s = min(1 / (1 + math.exp(-z)) / CPU, 1.0)
        c.execute("INSERT INTO contracts VALUES (?, 7, ?, 'low', 'v0.9.2', NULL, NULL, 1, 2024)", (cid, s))
    return c


def test_contract_explanation_reproduces_the_score():
    c = _db()
    for cid in (1, 2):
        e = contract_service.get_risk_explanation(c, cid)
        assert e["explanation_available"] and e["model_version"] == "v0.9.2"
        s = min(1 / (1 + math.exp(-e["logit"])) / e["pu_correction"], 1.0)
        stored = c.execute("SELECT risk_score FROM contracts WHERE id = ?", (cid,)).fetchone()[0]
        assert abs(s - stored) < 1e-3
        assert {f["feature"] for f in e["features"]} >= {"price_ratio", "rt4_log", "partida_single_bid_z_loo"}


def test_vendor_means_fill_nulls_like_the_scorer():
    c = _db()
    m, n = v10_means(c, "c.vendor_id = ?", (7,), COEF)
    assert n == 2 and m["inst_hhi_prior"] == pytest.approx((1.0 + 0.4) / 2) and m["cobid_herfindahl"] == pytest.approx(1.0)
    assert v10_display_name("z_price_ratio") == "price_ratio"


def test_entity_means_read_the_precompute_first():
    from api.services.active_model import v10_entity_means
    from scripts.precompute_entity_v10_means import build
    c = _db()
    c.execute("ALTER TABLE contracts ADD COLUMN institution_id INT")
    c.execute("UPDATE contracts SET institution_id = 3")
    live = v10_entity_means(c, "vendor_id", 7, COEF)  # no table yet -> live AVG
    assert build(c) == 2
    c.execute("DELETE FROM contract_features_v10")  # precompute must answer alone
    for col, eid in (("vendor_id", 7), ("institution_id", 3)):
        m, n = v10_entity_means(c, col, eid, COEF)
        assert n == 2 and m == pytest.approx(live[0])


def test_contract_explanation_carries_raw_units_when_stored():
    c = _db()
    e = contract_service.get_risk_explanation(c, 1)
    assert all("raw" not in f for f in e["features"])  # no *_raw column -> no `raw`
    c.execute("ALTER TABLE contract_features_v10 ADD COLUMN price_ratio_raw REAL")
    c.execute("UPDATE contract_features_v10 SET price_ratio_raw = 8.25 WHERE contract_id = 1")
    by = {f["feature"]: f for f in contract_service.get_risk_explanation(c, 1)["features"]}
    assert by["price_ratio"]["raw"] == 8.25 and "raw" not in by["rt4_log"]
    assert "raw" not in {f["feature"]: f for f in contract_service.get_risk_explanation(c, 2)["features"]}["price_ratio"]


def test_waterfall_is_centred_on_the_population_mean():
    """SILVER 11-05: the v0.9.2 waterfall printed the RAW entity mean as z_score, so «más que lo
    habitual» was always true for positive-valued inputs. z_score is now the entity mean minus the
    mean over every scored contract, contribution = beta x that gap — with or without the precompute."""
    from api.routers.vendors import _build_waterfall
    from api.services import active_model
    from scripts.precompute_entity_v10_means import build
    c = _db()
    c.execute("ALTER TABLE contracts ADD COLUMN institution_id INT")
    c.execute("INSERT INTO contract_features_v10 VALUES (3, 0.5, 3.0, 0.9, 0.2, 0.0)")
    c.execute("INSERT INTO contracts VALUES (3, 8, 0.1, 'low', 'v0.9.2', NULL, NULL, 1, 2024, NULL)")
    c.execute("UPDATE contracts SET institution_id = id % 2")  # two buyers
    fill = {"inst_hhi_prior": 1.0, "cobid_herfindahl": 1.0}
    pop = {f: c.execute(f"SELECT AVG(COALESCE({f}, {fill.get(f, 0.0)})) FROM contract_features_v10").fetchone()[0] for f in COEF}
    own, _ = v10_means(c, "c.vendor_id = ?", (7,), COEF)
    for precomputed in (False, True):
        if precomputed:
            build(c)
        active_model._V10_POP.clear()
        items, n, source = _build_waterfall(c, "vendor_id", 7)
        assert source == "features_v10" and n == 2
        by = {i.feature: i for i in items}
        for f, b in COEF.items():
            gap = own[f] - pop[f]
            it = by[v10_display_name(f)]
            assert it.z_score == pytest.approx(gap, abs=1e-4)
            assert it.contribution == pytest.approx(b * gap, abs=1e-4)
    # rt4_log: vendor 7 averages 0.75 against 1.5 over all contracts -> below the usual, not above
    assert by["rt4_log"].z_score < 0


def test_contract_explanation_matches_the_display_score_and_is_centred():
    """DIAG_RISK_EXPLAIN_2026-11-09: (1) the stored risk_score is the DISPLAY score (squash above 0.60, K=0.46),
    so σ(logit)/c_pu alone looks «wrong» for every critical contract — the endpoint must hand back the score it
    explains; (2) contract terms were β·raw-x, so positive-only inputs (rt4_log, inst_hhi_prior) always read as
    pushing UP. Like the vendor waterfall, the contract reasons are now centred on the mean scored contract."""
    from api.services import active_model
    c = _db()
    # contract 3 mirrors prod 2710162: huge amount, ONE prior institution (log1p(1)), concentrated buyers
    for cid, x in ((3, (5.0, math.log1p(1), 1.0, 1.0, 0.0)), (4, (0.0, 4.0, 0.2, 0.5, 0.0))):
        c.execute("INSERT INTO contract_features_v10 VALUES (?,?,?,?,?,?)", (cid, *x))
        z = B0 + sum(b * v for b, v in zip(COEF.values(), x))
        q = 1 / (1 + math.exp(-z)) / CPU
        disp = q if q <= .60 else .60 + .35 * math.tanh((q - .60) / .46)  # _v10/score_v092.py::display
        c.execute("INSERT INTO contracts VALUES (?, 9, ?, 'x', 'v0.9.2', NULL, NULL, 3, 2024)", (cid, disp))
    active_model._V10_POP.clear()
    e = contract_service.get_risk_explanation(c, 3)
    stored = c.execute("SELECT risk_score FROM contracts WHERE id = 3").fetchone()[0]
    assert stored < 0.95 and min(1 / (1 + math.exp(-e["logit"])) / CPU, 1.0) - stored > 0.05  # the reported mismatch
    assert abs(e["display_score"] - stored) <= 0.005
    assert e["model_score"] == pytest.approx(min(1 / (1 + math.exp(-e["logit"])) / CPU, 1.0), abs=1e-4)
    # centred decomposition: baseline (the mean contract) + Σ contributions == logit
    assert e["baseline_logit"] + sum(f["contribution"] for f in e["features"]) == pytest.approx(e["logit"], abs=1e-3)
    by = {f["feature"]: f for f in e["features"]}
    assert by["rt4_log"]["value"] == pytest.approx(math.log1p(1), abs=1e-3)
    assert by["rt4_log"]["z_score"] < 0 and by["rt4_log"]["contribution"] < 0  # fewer agencies than usual -> lowers it
    assert by["price_ratio"]["contribution"] > 0
