"""Ramo claves 40–44 per the PEF catalogue (audit docs/INSTITUTION_CLASSIFICATION_AUDIT_2026-10-27.md § 2)."""
from scripts.etl_classify import RAMO_TO_SECTOR
from scripts.etl_create_schema import RAMOS_DATA


def test_autonomous_ramos_map_to_their_real_bodies():
    # 40 INEGI · 41 COFECE · 42 INEE · 43 IFT · 44 INAI — 40 is not INFONAVIT
    assert {k: RAMO_TO_SECTOR[k] for k in ("40", "41", "42", "43", "44")} == {"40": 12, "41": 12, "42": 2, "43": 6, "44": 8}


def test_schema_seed_agrees_with_classifier():
    for r in RAMOS_DATA:
        if r["clave"] in RAMO_TO_SECTOR:
            assert r["sector_id"] == RAMO_TO_SECTOR[r["clave"]], r["clave"]
