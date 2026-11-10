import pytest

from scripts.refresh_sat_efos import dedupe, exclude

pytestmark = pytest.mark.no_db


def test_exclude_drops_listed_vendor_ids():
    changes = [{"vendor_id": v, "old": 0, "new": 1, "via": "name"} for v in (1, 17565, 27433)]
    assert [c["vendor_id"] for c in exclude(changes, "17565, 27433")] == [1]
    assert len(exclude(changes, "")) == 3


def test_dedupe_keeps_strongest_stage():
    recs = [{"rfc": "X", "stage": "presunto"}, {"rfc": "X", "stage": "definitivo"}]
    assert dedupe(recs)["X"]["stage"] == "definitivo"
