"""_v10/score_v092.py display squash (docs/MODEL_SATURATION_REVIEW_2026-10-28.md § 4 (b)):
risk_score = q if q <= 0.60 else 0.60 + 0.35*tanh((q-0.60)/K), q = sigmoid(z)/c_pu uncapped;
risk_score_v92 stays min(q, 1); risk_level identical."""
import importlib.util
import pathlib
import sqlite3

import numpy as np
import pytest

pytestmark = pytest.mark.no_db

_spec = importlib.util.spec_from_file_location(
    "score_v092", pathlib.Path(__file__).resolve().parents[2] / "_v10" / "score_v092.py")
sv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sv)

QMAX = 1 / 0.30  # q = sigmoid(z)/c_pu <= 1/c_pu, and the scorer guard keeps c_pu > 0.30
Q = np.concatenate([np.linspace(0, QMAX, 30001), [0.25, 0.4, 0.6, np.nextafter(0.6, 1), 1.0, 2.29]])


def test_display_is_strictly_increasing_and_continuous_at_060():
    q = np.unique(Q)
    assert np.all(np.diff(sv.display(q)) > 0)
    assert sv.display(np.array([0.6]))[0] == 0.6
    assert abs(sv.display(np.array([0.6 + 1e-9]))[0] - 0.6) < 1e-8


def test_display_below_060_is_unchanged_and_stays_below_095():
    q = Q[Q <= 0.6]
    assert np.array_equal(sv.display(q), q)
    assert sv.display(np.array([QMAX]))[0] < 0.95
    sv.check_squash(Q, 0.30)  # guards: K vs float tanh saturation, level changes 0, saturation 0


def test_levels_identical_to_capped_score():
    assert np.array_equal(sv.levels(sv.display(Q)), sv.levels(np.minimum(Q, 1.0)))


def test_saturated_contracts_get_distinct_display_values():
    z = np.linspace(-0.2, 3.0, 5000)                 # all saturate: sigmoid(z)/0.436 >= 1
    q = 1 / (1 + np.exp(-z)) / 0.436
    assert (np.minimum(q, 1) == 1).all()
    assert len(np.unique(sv.display(q))) == len(z)


P = {"betas_raw": {"x": 1.0}, "neutral_fill": {}, "intercept": -3.0, "c_pu": 0.436}


def _db(xs):
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE contracts (id INTEGER PRIMARY KEY, amount_mxn REAL, risk_score REAL, risk_level TEXT, "
              "risk_score_v92 REAL, risk_model_version TEXT)")
    c.execute("CREATE TABLE contract_features_v10 (contract_id INTEGER PRIMARY KEY, x REAL)")
    q = 1 / (1 + np.exp(-(P["intercept"] + np.asarray(xs)))) / P["c_pu"]
    s = np.minimum(q, 1)
    for i, (x, v, l) in enumerate(zip(xs, s, sv.levels(s)), 1):
        c.execute("INSERT INTO contract_features_v10 VALUES (?, ?)", (i, x))
        c.execute("INSERT INTO contracts VALUES (?, 1e6, ?, ?, ?, 'v0.9.2')", (i, float(v), str(l), float(v)))
    c.commit()
    return c, q


def test_squash_rewrites_only_risk_score_above_060_and_is_idempotent():
    c, q = _db(np.linspace(-4, 6, 400))
    before = c.execute("SELECT id, risk_score, risk_level, risk_score_v92 FROM contracts ORDER BY id").fetchall()
    n = sv.squash(c, P, write=True)
    after = c.execute("SELECT id, risk_score, risk_level, risk_score_v92 FROM contracts ORDER BY id").fetchall()
    assert n == int((q > 0.6).sum()) > 0
    assert [r[2:] for r in after] == [r[2:] for r in before]          # levels and risk_score_v92 untouched
    for (i, s0, *_), (_, s1, *_), qi in zip(before, after, q):
        assert s1 == (s0 if qi <= 0.6 else pytest.approx(float(sv.display(np.array([qi]))[0]), abs=1e-15))
    assert max(r[1] for r in after) < 0.95
    sv.squash(c, P, write=True)                                        # re-run: same values
    assert c.execute("SELECT id, risk_score, risk_level, risk_score_v92 FROM contracts ORDER BY id").fetchall() == after
    # rollback restores the capped score exactly
    c.execute("UPDATE contracts SET risk_score = risk_score_v92 WHERE risk_model_version = 'v0.9.2' AND risk_score_v92 > 0.60")
    assert c.execute("SELECT id, risk_score, risk_level, risk_score_v92 FROM contracts ORDER BY id").fetchall() == before


def test_squash_refuses_when_stored_v92_does_not_reproduce():
    c, _ = _db(np.linspace(-4, 6, 50))
    c.execute("UPDATE contracts SET risk_score_v92 = 0.5 WHERE id = 1")
    with pytest.raises(AssertionError, match="does not reproduce"):
        sv.squash(c, P, write=True)
