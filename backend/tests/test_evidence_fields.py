"""Evidence fields on the contract dossier and procedure-number search
(STORYMAP_L1_emergencias § 7, STORYMAP_L2_limpieza § 7)."""

# Structure D row with every evidence field recorded (ART. 43 · DESASTRE NATURAL · term)
CONTRACT_ID = 2706156
PROCEDURE = "AO-50-GYR-050GYR997-N-33-2023"


def test_detail_carries_legal_basis_and_term(client, base_url):
    r = client.get(f"{base_url}/contracts/{CONTRACT_ID}")
    assert r.status_code == 200
    d = r.json()
    assert d["exception_article"] == "ART. 43"
    assert d["caso_fortuito"] == "DESASTRE NATURAL"  # verbatim, as recorded
    assert (d["start_date"], d["end_date"]) == ("2023-09-18", "2023-10-17")


def test_detail_empty_fields_stay_null(client, base_url):
    # Structure A has no legal-basis fields: the API returns null, never a guess
    r = client.get(f"{base_url}/contracts", params={"year": 2005, "per_page": 1})
    cid = r.json()["data"][0]["id"]
    d = client.get(f"{base_url}/contracts/{cid}").json()
    assert d["exception_article"] is None and d["caso_fortuito"] is None


def test_list_search_exact_procedure_number(client, base_url):
    for q in (PROCEDURE, PROCEDURE.lower(), f"  {PROCEDURE} "):
        r = client.get(f"{base_url}/contracts", params={"search": q, "per_page": 100})
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()["data"]]
        assert CONTRACT_ID in ids, q


def test_list_procedure_number_filter(client, base_url):
    r = client.get(f"{base_url}/contracts", params={"procedure_number": PROCEDURE, "per_page": 100})
    assert r.status_code == 200
    data = r.json()["data"]
    assert data and CONTRACT_ID in [c["id"] for c in data]
    assert r.json()["pagination"]["total"] == len(data)


def test_federated_search_lands_on_procedure_contracts(client, base_url):
    r = client.get(f"{base_url}/search", params={"q": PROCEDURE})
    assert r.status_code == 200
    assert CONTRACT_ID in [c["id"] for c in r.json()["contracts"]]


def test_field_ladder_exact_procedure_number(client, base_url):
    # the /contracts «Visual» view draws the same procedure the list shows
    r = client.get(f"{base_url}/contracts/field", params={"search": PROCEDURE})
    assert r.status_code == 200
    assert r.json()["total"] >= 1 and CONTRACT_ID in r.json()["col"]["id"]
