"""
Tests for GET /gap/plate, /gap/plate/door/{k}, /gap/plate/award — the /gap «La placa».

Pins: the four buckets and twenty doors cover every award once; one mark ≈ 10 awards and
the marks add up to the table; the money equals /gap/summary to the peso (> 100B rejected,
> 10B flagged); part=head drops only the marks; a door payload has exactly that door's
awards; the award card never names a persona física and no RFC travels; the door rule
puts procedure before article.

Data assertions skip on the dataless default run; exercise them with
    DATABASE_PATH=D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db \\
      python -m pytest tests/test_gap_plate.py -q -p no:cacheprovider
"""
import pytest

from api.routers.gap import PLATE_DOORS, is_company_name, letter_vendor, plate_door


def test_door_rule_procedure_first():
    assert plate_door("INVITACIÓN A CUANDO MENOS TRES PERSONAS", "Art. 55 párrafo primero") == "inv"
    assert plate_door("LICITACIÓN PÚBLICA", None) == "lp"
    assert plate_door("CONTRATO ESPECÍFICO DERIVADO DE ACUERDO MARCO", None) == "marco"
    assert plate_door("ADJUDICACIÓN DIRECTA", "Art. 55 párrafo primero") == "55-1"
    assert plate_door("ADJUDICACIÓN DIRECTA", "Art. 55 p\ufffdrrafo primero") == "55-1"  # mojibake accent
    assert plate_door("ADJUDICACIÓN DIRECTA", "Art. 42 fr. VII Bis") == "42-VII"
    assert plate_door("ADJUDICACIÓN DIRECTA", "Art. 41 fr. V") == "41"
    assert plate_door("ADJUDICACIÓN DIRECTA", "Art. 2") == "otros"
    assert plate_door("ADJUDICACIÓN DIRECTA", None) == "otros"


def test_company_names_only():
    assert is_company_name("GRUPO FARMACOS ESPECIALIZADOS, S.A. DE C.V.")
    assert is_company_name("SERVICIOS ABC SA DE CV")
    assert is_company_name("CONSTRUCTORA XYZ S. DE R.L. DE C.V.")
    assert not is_company_name("JUAN PEREZ LOPEZ")
    assert not is_company_name("MARIA SAAVEDRA")


@pytest.mark.no_db
def test_letter_vendor_names_companies_only():
    """/gap/field big awards and the /plate/award card share this rule."""
    assert letter_vendor("ACME SA DE CV", "", "0", None) == "ACME SA DE CV"
    assert letter_vendor("GRUPO NORTE", "GNO800101AB1", "0", None) == "GRUPO NORTE"   # 12-char RFC
    assert letter_vendor("JUAN PEREZ LOPEZ", "", "0", None) is None                    # no company form
    assert letter_vendor("ACME SA DE CV", "PELJ800101AB1", "0", None) is None          # 13-char RFC
    assert letter_vendor("ACME SA DE CV", "", "1", None) is None                       # PF flag
    assert letter_vendor("IMSS SA DE CV", "", "0", "self_buyer") is None
    assert letter_vendor("ACM800101AB1 SA DE CV", "", "0", None) is None               # name embeds an RFC


@pytest.fixture(scope="module")
def plate(client, base_url):
    r = client.get(f"{base_url}/gap/plate")
    assert r.status_code == 200
    body = r.json()
    if not body.get("available"):
        pytest.skip("gap_contracts absent in the configured database")
    return body


@pytest.fixture(scope="module")
def summary(client, base_url):
    return client.get(f"{base_url}/gap/summary").json()


def test_buckets_and_doors_cover_every_award(plate, summary):
    n = summary["total_contracts"]
    assert plate["meta"]["n"] == n
    assert [b["k"] for b in plate["buckets"]] == ["concurso", "pequena", "discrecion", "emergencia"]
    assert sum(b["n"] for b in plate["buckets"]) == n
    assert sum(d["n"] for d in plate["doors"]) == n
    assert {d["k"] for d in plate["doors"]} == set(PLATE_DOORS)
    for b in plate["buckets"]:
        assert sum(d["n"] for d in plate["doors"] if d["b"] == b["k"]) == b["n"]
        assert set(b["doors"]) == {d["k"] for d in plate["doors"] if d["b"] == b["k"]}
        assert b["n"] == b["datos_n"] + b["ocr_n"] + b["est_n"] + b["none_n"]


def test_marks_are_ten_awards_each(plate):
    m, per = plate["marks"], plate["per"]
    assert per == 10
    k = len(m["d"])
    assert all(len(m[c]) == k for c in "dkqmsc")
    assert sum(m["c"]) == plate["meta"]["n"]
    assert all(1 <= c <= per for c in m["c"])
    assert all(0 <= d < len(plate["doors"]) for d in m["d"])
    assert all((q == -1) == (kind == 2) for q, kind in zip(m["q"], m["k"]))
    assert all(-1 <= q <= 255 for q in m["q"])
    assert all(-1 <= mi < len(plate["months"]) for mi in m["m"])
    assert len(plate["months"]) <= 16


def test_money_matches_the_summary(plate, summary):
    meta = plate["meta"]
    known = meta["datos_v"] + meta["ocr_v"] + meta["est_v"]
    assert abs(known - summary["best_available_sum_mxn"]) < 10  # nothing in the table is > 100B today
    assert meta["flag_n"] == sum(b["flag_n"] for b in plate["buckets"])
    assert meta["flag_v"] <= known


def test_head_drops_only_the_marks(client, base_url, plate):
    head = client.get(f"{base_url}/gap/plate?part=head").json()
    assert "marks" not in head
    assert head["meta"] == plate["meta"] and head["buckets"] == plate["buckets"]


def test_buyers_are_indexed(plate):
    nb = len(plate["buyers"])
    rows = plate["top"] + [t for b in plate["buckets"] for t in b["top"]] + [t for d in plate["doors"] for t in d["top"]]
    assert rows and all(0 <= t[0] < nb for t in rows)
    assert all(len(t[3]) == 4 for t in plate["top"])
    v = [t[2] for t in plate["top"]]
    assert v == sorted(v, reverse=True)


def test_door_payload_is_that_door(client, base_url, plate):
    d = next(x for x in plate["doors"] if x["k"] == "54-II")
    r = client.get(f"{base_url}/gap/plate/door/54-II")
    assert r.status_code == 200
    body = r.json()
    col = body["col"]
    assert body["n"] == d["n"] == len(col["v"]) == len(col["m"])
    assert sum(1 for s in col["s"] if s == 3) == d["none_n"]
    assert all((v is None) == (s == 3) for v, s in zip(col["v"], col["s"]))
    assert all(0 <= b < len(body["buyers"]) for b in col["b"])
    assert client.get(f"{base_url}/gap/plate/door/nope").status_code == 404


def test_award_card_names_a_persona_fisica_only_when_no_firm(client, base_url, plate):
    seen = 0
    for i in range(40):
        a = client.get(f"{base_url}/gap/plate/award?door=54-XIV&i={i}").json()
        assert a["door"] == "54-XIV" and a["bucket"] == "discrecion" and a["i"] == i
        if a["n_persona_fisica"] and a["n_persona_fisica"] == a["n_contracts"]:
            assert a["vendor"] and a["persona_fisica"] and a["vendor_note"] is None   # named + labelled (10-29)
            seen += 1
        elif a["vendor"]:
            assert a["n_contracts"] > a["n_persona_fisica"] or is_company_name(a["vendor"])
    assert seen, "expected personas físicas among individual-services awards"
    one = client.get(f"{base_url}/gap/plate/award?door=54-XIV&i=7").json()
    by_uuid = client.get(f"{base_url}/gap/plate/award", params={"uuid": one["uuid"]}).json()
    assert by_uuid == one
    assert client.get(f"{base_url}/gap/plate/award").status_code == 422


def test_no_rfc_travels(client, base_url, plate):
    assert "rfc" not in client.get(f"{base_url}/gap/plate").text.lower()
    assert "rfc" not in client.get(f"{base_url}/gap/plate/door/55-1").text.lower()
    assert "rfc" not in client.get(f"{base_url}/gap/plate/award?door=55-1&i=0").text.lower()


def test_award_card_names_a_persona_fisica_with_the_label(client):
    """Policy 10-29: when only personas físicas hold a procedure, the card names the largest and labels it;
    the RFC never travels."""
    import re
    from api.dependencies import DB_PATH
    import sqlite3
    with sqlite3.connect(f'file:{DB_PATH}?mode=ro', uri=True) as db:
        if db.execute("SELECT 1 FROM sqlite_master WHERE name='gap_contracts'").fetchone() is None:
            pytest.skip('gap table absent')
        row = db.execute("""SELECT g.uuid_procedimiento FROM gap_contracts g
            WHERE g.uuid_procedimiento IS NOT NULL AND EXISTS (SELECT 1 FROM comprasmx_contracts c
                  WHERE c.numero_procedimiento = g.procedure_number AND c.is_persona_fisica = 1)
              AND NOT EXISTS (SELECT 1 FROM comprasmx_contracts c WHERE c.numero_procedimiento = g.procedure_number
                  AND c.is_persona_fisica = 0 AND COALESCE(c.vendor_match,'') <> 'persona_fisica')
            LIMIT 1""").fetchone()
    if row is None:
        pytest.skip('no persona-física-only procedure')
    r = client.get('/api/v1/gap/plate/award', params={'uuid': row[0]})
    d = r.json()
    assert d['persona_fisica'] and d['vendor'] and d['n_persona_fisica'] >= 1
    assert not re.search(r'(?<![A-Z0-9])[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}(?![A-Z0-9])', r.text) and '"rfc' not in r.text
