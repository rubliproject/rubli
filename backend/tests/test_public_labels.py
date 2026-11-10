"""public_labels (docs/PREPUB_AUDIT_2026-09-24.md § P1 B3/B4/B5) — GET-only."""
import sqlite3

import pytest

from api.cache import app_cache
from api.public_labels import (
    amount_flag,
    apply_public_labels,
    capture_pair_excluded,
    is_named_persona,
    is_persona_fisica,
    is_public_entity,
    label_sets,
    pf_sql,
    public_status_counts,
    ranking_safe,
    label_persona_names,
    public_vendor_name,
)


@pytest.fixture()
def conn():
    """Tiny in-memory DB covering every rule branch."""
    app_cache.invalidate("public_labels")
    c = sqlite3.connect(":memory:")
    c.executescript(
        """
        CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT, is_individual INT, rfc TEXT);
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE ground_truth_cases (id INTEGER PRIMARY KEY, case_id TEXT, confidence_level TEXT,
            source_asf TEXT, source_news TEXT, source_legal TEXT, case_origin TEXT, provenance_tier TEXT);
        CREATE TABLE ground_truth_vendors (id INTEGER PRIMARY KEY, case_id, vendor_id INT,
            is_false_positive INT, match_method TEXT);
        CREATE TABLE aria_queue (vendor_id INTEGER PRIMARY KEY, primary_pattern TEXT);
        CREATE TABLE procurement_scandals (id INTEGER PRIMARY KEY, slug TEXT,
            ground_truth_case_id INT, is_verified INT);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INT, institution_id INT,
            contract_year INT, amount_mxn REAL);

        INSERT INTO vendors VALUES
          (1, 'SOURCED SA DE CV', 0, NULL),        -- documented
          (2, 'UNSOURCED SA DE CV', 0, NULL),      -- model_discovery, no source → lead
          (3, 'BAXTER SA DE CV', 0, NULL),         -- FP link only
          (4, 'FANTASMAS FILMS SA', 0, NULL),      -- scandal_actor junk link
          (5, 'PERSONA', 0, 'AAAA800101AB1'),      -- 13-char RFC → física
          (6, 'SECRETARIA DE LA DEFENSA NACIONAL', 1, NULL),
          (7, 'CLEAN P2 SA DE CV', 0, NULL),
          (8, 'P7 NOT DOCUMENTED SA', 0, NULL),
          (9, 'UNPUBLISHED CASE SA DE CV', 0, NULL);  -- sourced case, all scandal rows unpublished
        INSERT INTO institutions VALUES (1, 'CASA DE MONEDA DE MEXICO');
        INSERT INTO ground_truth_cases VALUES
          (10, 'CASE-10', 'high', '', 'https://news', '', 'model_discovery', 'B'),
          (11, 'CASE-11', 'high', '', '', '', 'model_discovery', 'C'),
          (12, 'CASE-12', 'confirmed_corrupt', '', '', '', 'official_record', 'A'),
          (13, 'CASE-13', 'high', '', 'https://news', '', 'official_record', 'A');
        INSERT INTO ground_truth_vendors VALUES
          (1, 10, 1, 0, 'name_match'),
          (2, 11, 2, 0, 'name_match'),
          (3, 12, 3, 1, 'name_match'),
          (4, 'CASE-12', 4, 0, 'scandal_actor'),
          (5, 11, 8, 0, 'name_match'),
          (6, 13, 9, 0, 'name_match');
        -- case 10: one published + one unpublished scandal row → still documented;
        -- case 13: only unpublished rows → no longer documents anyone.
        INSERT INTO procurement_scandals VALUES
          (1, 'mixed-published', 10, 1), (2, 'mixed-unpublished', 10, 0),
          (3, 'only-unpublished-a', 13, 0), (4, 'only-unpublished-b', 13, 0);
        INSERT INTO aria_queue VALUES (3, 'P6'), (5, 'P2'), (6, 'P6'), (7, 'P2'), (8, 'P7'), (1, 'P7');
        """
    )
    # vendor 5: 47 contracts ~1M and one 4.2B spike (the B5 shape)
    c.executemany(
        "INSERT INTO contracts (vendor_id, institution_id, contract_year, amount_mxn) VALUES (5, 9, 2022, ?)",
        [(1_000_000 + i * 10_000,) for i in range(47)],
    )
    c.execute("INSERT INTO contracts VALUES (2604968, 5, 9, 2022, 4216600000)")
    # vendor 7: steady large contractor — a 12B contract is 'review', not a spike
    c.executemany(
        "INSERT INTO contracts (vendor_id, institution_id, contract_year, amount_mxn) VALUES (7, 1, 2020, ?)",
        [(9e9,), (10e9,), (12e9,)],
    )
    yield c
    app_cache.invalidate("public_labels")


def test_gt_split(conn):
    s = label_sets(conn)
    assert s["documented"] == {1}           # case 10 has a published scandal row
    assert s["leads"] == {2, 8, 9}          # 9: case 13's scandal rows are all unpublished
    assert 3 in s["fp"] and 4 in s["fp"]


def test_pattern_suppression(conn):
    rows = [{"vendor_id": v, "primary_pattern": p, "in_ground_truth": 1}
            for v, p in [(1, "P7"), (3, "P6"), (5, "P2"), (6, "P6"), (7, "P2"), (8, "P7")]]
    out = {d["vendor_id"]: d for d in apply_public_labels(conn, rows)}
    assert out[3]["pattern_suppressed"] == "false_positive"
    assert out[5]["pattern_suppressed"] == "persona_fisica"
    assert out[6]["pattern_suppressed"] == "public_entity"
    assert out[8]["pattern_suppressed"] == "unverified_case_link"
    assert out[7]["primary_pattern"] == "P2" and "pattern_suppressed" not in out[7]
    assert out[1]["primary_pattern"] == "P7"
    # in_ground_truth now means "documented"; type preserved
    assert out[1]["in_ground_truth"] == 1 and out[3]["in_ground_truth"] == 0
    assert out[8]["gt_lead"] is True


def test_ranking_safe_drops_offender_rows(conn):
    kept = ranking_safe(conn, [{"vendor_id": v} for v in (1, 3, 5, 7)])
    assert [d["vendor_id"] for d in kept] == [1, 7]


@pytest.mark.no_db
def test_label_persona_names_keeps_and_labels_personas(conn):
    """Owner policy 2026-10-29 (.claude/rules/security.md): a persona física's NAME may show, always labelled;
    RFC never. The row keeps its name and gains persona_fisica; no RFC key is added."""
    rows = [{"vendor_id": 5, "vendor_name": "PERSONA"}, {"vendor_id": 7, "vendor_name": "CLEAN P2 SA DE CV"},
            {"vendor_id": None, "vendor_name": ""}]
    out = label_persona_names(conn, rows)
    assert [r["vendor_name"] for r in out] == ["PERSONA", "CLEAN P2 SA DE CV", ""]
    assert [r.get("persona_fisica") for r in out] == [True, False, False]
    assert all("rfc" not in r for r in out)
    assert "persona_fisica" not in rows[0]  # input not mutated


@pytest.mark.no_db
@pytest.mark.parametrize("name, ind, rfc, want", [
    ("JUAN PEREZ LOPEZ", 1, None, ("JUAN PEREZ LOPEZ", True)),           # persona física: named + labelled
    ("MARIA GOMEZ", 0, "GOMM800101AB1", ("MARIA GOMEZ", True)),          # 13-char RFC decides
    ("CONSTRUCTORA SA DE CV", 0, "CSA010101AB1", ("CONSTRUCTORA SA DE CV", False)),
    ("GOMM800101AB1", 1, "GOMM800101AB1", (None, True)),                 # an RFC as name never ships
    ("CORPORACION ALIMENTARIA PENASANTA", 1, None, ("CORPORACION ALIMENTARIA PENASANTA", False)),  # a firm, not a person
    (None, None, None, (None, False)),
])
def test_public_vendor_name_names_personas_never_rfcs(name, ind, rfc, want):
    assert public_vendor_name(name, ind, rfc) == want


def test_entity_detectors():
    assert is_public_entity("Secretar�a de Salud", ())
    assert is_public_entity("CASA DE MONEDA DE MEXICO", {"CASA DE MONEDA DE MEXICO"})
    assert not is_public_entity("HOLDING PARA VENTAS A GOBIERNO SA DE CV", ())
    assert not is_public_entity("BANCO NACIONAL DE MEXICO SA", ())
    assert is_persona_fisica(0, "AAAA800101AB1")
    assert not is_persona_fisica(0, "AAA800101AB1")
    # the dossier's persona física label (LEGAL_RESEARCH_PERSONAS_FISICAS_2026-10-30 § 5 #2)
    assert is_named_persona(1, None, "MARCO ANTONIO GUARDIOLA SILLER")
    assert not is_named_persona(1, None, "CONSTRUCTORA DEL NORTE SA DE CV")


def test_amount_flags(conn):
    assert amount_flag(conn, 2604968, 4216600000, 5) == "suspect_decimal"
    assert amount_flag(conn, 999, 12e9, 7) == "review"
    assert amount_flag(conn, 999, 5e6, 7) is None
    assert capture_pair_excluded(conn, 5, 9)          # física + spike
    assert not capture_pair_excluded(conn, 7, 1)


# ---------------------------------------------------------------------------
# Endpoints against the real DB (skipped when it is absent)
# ---------------------------------------------------------------------------

def test_fp_vendor_has_no_known_bad_banner(client, base_url):
    r = client.get(f"{base_url}/vendors/4332/ground-truth-status")  # BAXTER (GT FP)
    if r.status_code == 404:
        pytest.skip("vendor not in this DB")
    assert r.status_code == 200
    assert r.json()["is_known_bad"] is False


def test_capture_top_excludes_b5_leader(client, base_url):
    r = client.get(f"{base_url}/capture/top?limit=50")
    assert r.status_code == 200
    assert all(row["vendor_id"] != 69248 for row in r.json()["data"])


def test_contract_2604968_flagged(client, base_url):
    r = client.get(f"{base_url}/contracts/2604968")
    if r.status_code == 404:
        pytest.skip("contract not in this DB")
    assert r.json()["amount_flag"] == "suspect_decimal"


def test_aria_pattern_filter_has_no_suppressed_rows(client, base_url):
    r = client.get(f"{base_url}/aria/queue?pattern=P2&per_page=100")
    assert r.status_code == 200
    rows = r.json()["data"]
    assert all(row["primary_pattern"] == "P2" for row in rows)


def test_review_status_confirmed_only_for_documented(conn):
    rows = [
        {"vendor_id": 1, "review_status": "confirmed"},          # documented → stays
        {"vendor_id": 2, "review_status": "confirmed"},          # lead → reviewed
        {"vendor_id": 3, "review_status": "confirmed_corrupt"},  # FP → reviewed
        {"vendor_id": 7, "review_status": "needs_review"},       # untouched
    ]
    apply_public_labels(conn, rows)
    assert [r["review_status"] for r in rows] == ["confirmed", "reviewed", "reviewed", "needs_review"]
    assert public_status_counts(conn, [(1, "confirmed"), (2, "confirmed_corrupt"), (5, None)]) == {
        "confirmed": 1, "reviewed": 1, "pending": 1}


# docs/LEGAL_RESEARCH_PERSONAS_FISICAS_2026-10-30.md: one PF rule — RFC shape wins over is_individual.
_CASES = [
    (1, "SHD940101AB1", False),    # SIEMENS-like: is_individual=1 but a 12-char company RFC → company
    (1, " shd-940101-ab1 ", False),  # spacing/case/hyphens normalised like persona_fisica.rfc_shape
    (0, "AAAA800101AB1", True),    # 13-char personal RFC → PF even with is_individual=0
    (1, None, True), (1, "", True),  # no RFC → stored flag
    (0, None, False), (0, "10861.0", False),
    (0, "1234567890123", True),    # malformed 13 chars: stays PF (conservative, as before)
    (1, "XXXX", True),             # malformed: stored flag
]


@pytest.mark.parametrize("ind,rfc,pf", _CASES)
def test_rfc_shape_wins_over_is_individual(ind, rfc, pf):
    assert is_persona_fisica(ind, rfc) is pf


def test_pf_sql_matches_python():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE v (is_individual INT, rfc TEXT)")
    c.executemany("INSERT INTO v VALUES (?, ?)", [(i, r) for i, r, _ in _CASES])
    got = [bool(x) for (x,) in c.execute(f"SELECT {pf_sql()} FROM v ORDER BY rowid")]
    assert got == [pf for _, _, pf in _CASES]
    got = [bool(x) for (x,) in c.execute(f"SELECT {pf_sql('t.')} FROM v t ORDER BY rowid")]
    assert got == [pf for _, _, pf in _CASES]


def test_company_rfc_with_is_individual_gets_pattern_back(conn):
    conn.executescript("""
        INSERT INTO vendors VALUES (20, 'SIEMENS HEALTHCARE DIAGNOSTICS', 1, 'SHD940101AB1'),
                                   (21, 'JUAN PEREZ LOPEZ', 0, 'PELJ800101AB1');
        INSERT INTO aria_queue VALUES (20, 'P6'), (21, 'P6');""")
    app_cache.invalidate("public_labels")
    s = label_sets(conn)
    assert 20 not in s["suppressed"] and 20 not in s["pf"]
    assert s["suppressed"][21] == ("P6", "persona_fisica") and 21 in s["pf"]


def test_is_named_persona_matches_label_sets_rule():
    # a 13-char personal RFC is named as a person even when the name reads as a company
    assert is_named_persona(0, "PELJ800101AB1", "JUAN PEREZ SERVICIOS SA DE CV")
    # a 12-char company RFC is never a persona, whatever is_individual says
    assert not is_named_persona(1, "SHD940101AB1", "SIEMENS HEALTHCARE DIAGNOSTICS")
    # no RFC: flag + name model, as before
    assert is_named_persona(1, None, "MARCO ANTONIO GUARDIOLA SILLER")
    assert not is_named_persona(1, None, "CONSTRUCTORA DEL NORTE SA DE CV")


@pytest.mark.no_db
def test_pattern_counts_never_go_negative_after_a_new_run(conn):
    """Prod /aria/stats showed P7 = -30 (2026-11-05): label_sets was cached from the previous run's queue,
    and public_pattern_counts subtracted that stale suppressed set from the new run's raw counts."""
    from api.public_labels import public_pattern_counts
    conn.executescript(
        "CREATE TABLE aria_runs (id TEXT, started_at TEXT, completed_at TEXT, status TEXT);"
        "INSERT INTO aria_runs VALUES ('run-1', '2026-11-01', '2026-11-01', 'completed');"
    )
    label_sets(conn)  # cached against run-1: vendor 8 suppressed as an unverified P7
    # run-2 rewrites the queue: vendor 8 now carries P6, and no P7 is left but the documented vendor 1
    conn.executescript(
        "UPDATE aria_queue SET primary_pattern = 'P6' WHERE vendor_id = 8;"
        "INSERT INTO aria_runs VALUES ('run-2', '2026-11-05', '2026-11-05', 'completed');"
    )
    raw = dict(conn.execute(
        "SELECT primary_pattern, COUNT(*) FROM aria_queue WHERE primary_pattern IS NOT NULL GROUP BY 1").fetchall())
    out = public_pattern_counts(conn, raw)
    assert all(v >= 0 for v in out.values()), out
    assert out["P7"] == 1          # documented vendor 1 only
    assert out["P6"] == raw["P6"] - 2  # FP vendor 3 and public entity 6; vendor 8 (a company) keeps its P6


@pytest.mark.no_db
def test_pattern_counts_subtract_by_current_pattern(conn):
    """Even within one cache window, a vendor is subtracted from the pattern it carries now."""
    from api.public_labels import public_pattern_counts
    label_sets(conn)
    conn.execute("UPDATE aria_queue SET primary_pattern = 'P2' WHERE vendor_id = 3")  # FP vendor moves P6 → P2
    raw = dict(conn.execute(
        "SELECT primary_pattern, COUNT(*) FROM aria_queue WHERE primary_pattern IS NOT NULL GROUP BY 1").fetchall())
    out = public_pattern_counts(conn, raw)
    assert all(v >= 0 for v in out.values()), out
    assert out["P6"] == raw["P6"] - 1  # only public entity 6 left in P6


# ── security review 11-05: a no-RFC person is labelled; CURPs never ship; RFC masking; feed responses
_RFC_PF_RE = __import__("re").compile(r"(?<![A-Z0-9])[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}(?![A-Z0-9])")


@pytest.mark.no_db
@pytest.mark.parametrize("name, ind, want", [
    ("NORMA ALICIA RIOS GUTIERREZ/ SERVICIOS ENSENADA", 0, True),     # no RFC, flag 0: the name model decides
    ("NORMA ALICIA RIOS GUTIERREZ/ SERVICIOS ENSENADA", None, True),
    ("MARIA GUADALUPE TORRES / FERRETERIA", 0, True),
    ("SERVICIOS INTEGRALES DEL NORTE SA DE CV", 0, False),
    ("NALCO DE MEXICO", None, False),
    ("", 0, False),
])
def test_no_rfc_person_is_labelled(name, ind, want):
    assert is_named_persona(ind, None, name) is want
    assert public_vendor_name(name, ind, None)[1] is want


@pytest.mark.no_db
def test_clean_name_drops_curp_and_rfc_tokens():
    from api.public_labels import clean_name
    assert clean_name("JUAN PEREZ LOPEZ PELJ800101HDFRPN09") is None          # CURP embedded
    assert clean_name("PELJ800101MDFRPN0A".replace("A", "1")) is None
    assert clean_name("JUAN PEREZ PELJ800101AB1") is None                     # RFC embedded
    assert clean_name("JUAN PEREZ LOPEZ") == "JUAN PEREZ LOPEZ"
    assert clean_name("LOTE 2024 PARTIDA 800101") == "LOTE 2024 PARTIDA 800101"


@pytest.mark.no_db
@pytest.mark.parametrize("ind, rfc, kept", [
    (1, "PELJ800101AB1", None),            # persona física: masked
    (0, "PELJ800101AB1", None),            # the 13-char shape decides, whatever the flag
    (1, "SHD940101AB1", "SHD940101AB1"),   # company RFC with a stale flag: shown
    (0, "CSA010101AB1", "CSA010101AB1"),
])
def test_contract_models_mask_personal_rfc(ind, rfc, kept):
    from api.models.contract import ContractDetail, ContractListItem
    for M in (ContractListItem, ContractDetail):
        m = M(id=1, amount_mxn=1.0, vendor_id=7, vendor_name="X", vendor_rfc=rfc, vendor_is_individual=bool(ind))
        assert m.vendor_rfc == kept, M.__name__
        assert (rfc not in m.model_dump_json()) is (kept is None)


def _feed_ok(text: str, items: list, name_key: str):
    assert not _RFC_PF_RE.search(text) and '"vendor_rfc"' not in text and "curp" not in text.lower()
    assert all("persona_fisica" in it for it in items)
    assert all(it[name_key] for it in items if it["persona_fisica"])   # a labelled person is named


def test_alerts_feed_labels_personas_never_rfc(client, base_url):
    r = client.get(f"{base_url}/alerts/feed?limit=100")
    assert r.status_code == 200
    items = r.json().get("alerts") or r.json().get("items") or []
    _feed_ok(r.text, items, "vendor_name")


def test_senales_nuevos_labels_personas_never_rfc(client, base_url):
    r = client.get(f"{base_url}/senales/nuevos?limit=100")
    assert r.status_code == 200
    body = r.json()
    if not body.get("available"):
        pytest.skip("senales not built")
    _feed_ok(r.text, body["items"], "vendor_name")
