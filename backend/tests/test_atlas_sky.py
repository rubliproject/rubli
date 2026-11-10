"""«El Atlas» sky — spec .claude/designs/atlas-2026-10-02-spec.md §2.8 asserts, §2.9 serving, §7 privacy.

Needs the precompute (scripts/precompute_atlas_sky.py) on the DB at DATABASE_PATH;
skips on the stub DB.
"""
import gzip
import json
import sqlite3
import struct

import numpy as np
import pytest

from api.dependencies import DB_PATH
from api.pii import _PERSON_RFC_TOKEN
from api.public_labels import excluded_from_rankings, label_sets
from api.services import atlas_sky

SKY = "/api/v1/atlas/sky"


@pytest.fixture(scope="module")
def db():
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    if not atlas_sky.sky_version(conn):
        pytest.skip("atlas_sky precompute not present on this DB")
    yield conn
    conn.close()


def decode(buf: bytes) -> dict:
    assert buf[:4] in (b"SKY2", b"SKY3")
    (n,) = struct.unpack_from("<I", buf, 4)
    off, out = 8, {}
    for name, dt, size in (("vendor_id", "<u4", 4), ("host_idx", "<u2", 2), ("share_q", "<u2", 2),
                           ("risk_q", "<u2", 2), ("year", "u1", 1), ("slot", "u1", 1), ("n_slots", "u1", 1),
                           ("y1", "u1", 1), ("size_q", "u1", 1), ("flags", "u1", 1), ("flags2", "u1", 1),
                           *((f"period_{p}", "u1", 1) for p in range(5)),
                           *((f"ym_{k}", "u1", 1) for k in range(4) if buf[:4] == b"SKY3")):
        out[name] = np.frombuffer(buf, dtype=dt, count=n, offset=off)
        off += n * size
    assert off == len(buf)
    return out


@pytest.fixture(scope="module")
def payload(client, db):
    m = client.get(f"{SKY}/manifest")
    b = client.get(f"{SKY}/planets.bin")
    assert m.status_code == 200 and b.status_code == 200
    return m, b


@pytest.mark.slow
def test_precompute_asserts(db):
    stars = {r[0] for r in db.execute("SELECT entity_id FROM atlas_sky_layout WHERE kind = 's'")}
    assert db.execute("SELECT COUNT(*) FROM atlas_sky_ties WHERE value_mxn <= 0").fetchone()[0] == 0
    assert all(i in stars for (i,) in db.execute("SELECT DISTINCT institution_id FROM atlas_sky_ties"))
    assert db.execute("SELECT MAX(s) FROM (SELECT SUM(t.value_mxn / l.value_mxn) s FROM atlas_sky_ties t"
                      " JOIN atlas_sky_layout l ON l.kind = 's' AND l.entity_id = t.institution_id"
                      " GROUP BY t.institution_id)").fetchone()[0] <= 1 + 1e-6
    lo, hi, dep = db.execute("SELECT MIN(share), MAX(share), MAX(dep) FROM atlas_sky_layout WHERE kind = 'v'").fetchone()
    assert 0 < lo and hi <= 1 + 1e-9 and dep <= 1 + 1e-9
    assert db.execute("SELECT MAX(c) FROM (SELECT COUNT(*) c FROM atlas_sky_layout WHERE kind = 'v'"
                      " GROUP BY host_id)").fetchone()[0] <= 80
    meta = dict(db.execute("SELECT key, value FROM atlas_sky_meta"))
    assert meta["dropped_ties"] == "0"
    assert meta["risk_basis"] == "risk_score (v0.9.1)"


def test_manifest_privacy(payload):
    m, _ = payload
    text = m.text
    assert '"rfc' not in text.lower()
    assert not _PERSON_RFC_TOKEN.search(text)
    body = m.json()
    for k in ("layout_version", "data_cut", "risk_basis", "basis", "sectors", "stars", "inst_map"):
        assert k in body
    assert len(body["sectors"]) == 12
    assert len(body["stars"]["id"]) == body["basis"]["n_stars"]


def test_bin_public_bits(payload, db):
    m, b = payload
    body = m.json()
    d = decode(b.content)
    assert len(d["vendor_id"]) == body["basis"]["n_drawn"]
    assert d["host_idx"].max() < body["basis"]["n_stars"]
    ls = label_sets(db)
    vc = dict(db.execute("SELECT vendor_id, canonical_id FROM vendor_canonical"))
    members: dict[int, list[int]] = {}
    for raw, c in vc.items():
        members.setdefault(c, []).append(raw)
    tiered = d["vendor_id"][(d["flags"] >> 2) & 3 > 0]
    for v in tiered.tolist():
        for raw in members.get(v, [v]):
            assert raw not in ls["suppressed"] and not excluded_from_rankings(db, raw), v
    documented = {vc.get(r, r) for r in ls["documented"]}
    doc_bit = set(d["vendor_id"][(d["flags"] & 2) > 0].tolist())
    assert doc_bit == documented & set(d["vendor_id"].tolist())


def test_payload_gate(db):
    lv = atlas_sky.sky_version(db)
    manifest, gz, _ = atlas_sky.cached(db, lv)
    mg = len(gzip.compress(json.dumps(manifest, separators=(",", ":")).encode(), 6))
    assert mg + len(gz) <= 450 * 1024


def test_etag_304_and_cache(client, payload):
    m, b = payload
    # manifest: 5 min fresh + a day stale-while-revalidate (step 11b); the bin stays revalidate-always
    for r, path, cc in ((m, "manifest", "public, max-age=300, stale-while-revalidate=86400"),
                        (b, "planets.bin", "public, no-cache")):
        etag = r.headers["etag"]
        assert r.headers["cache-control"] == cc
        again = client.get(f"{SKY}/{path}", headers={"If-None-Match": etag})
        assert again.status_code == 304
        assert again.headers["cache-control"] == cc
    assert b.headers.get("content-encoding") == "gzip"


def test_manifest_served_pregzipped_and_plain(client, payload):
    """The manifest is serialised + gzipped once per worker; both encodings carry the same JSON."""
    m, _ = payload
    assert m.headers.get("content-encoding") == "gzip" and m.headers.get("vary") == "Accept-Encoding"
    plain = client.get(f"{SKY}/manifest", headers={"Accept-Encoding": "identity"})
    assert plain.headers.get("content-encoding") is None
    assert plain.json() == m.json()


def test_bin_pinned_to_manifest_lv(client, payload):
    """Stale-cache trap: the bin is requested with the manifest's lv; a mismatch is a 409, never a mixed pair."""
    lv = payload[0].json()["layout_version"]
    assert client.get(f"{SKY}/planets.bin", params={"lv": lv}).status_code == 200
    assert client.get(f"{SKY}/planets.bin", params={"lv": "20000101T000000Z"}).status_code == 409
    assert client.get(f"{SKY}/planets.bin", params={"lv": "x"}).status_code == 422


# ── §2.9 row 3: GET /atlas/sky/system (S2) ─────────────────────────────────
IMSS = 251


@pytest.fixture(scope="module")
def system(client, db):
    r = client.get(f"{SKY}/system", params={"inst": IMSS})
    assert r.status_code == 200, r.text
    return r


def test_system_named_columns_no_rfc(system):
    src = open(atlas_sky.__file__, encoding="utf-8").read()
    assert "SELECT *" not in src.upper().replace("COUNT(*)", "")
    assert '"rfc' not in system.text.lower()
    assert not _PERSON_RFC_TOKEN.search(system.text)


def test_system_shape_and_caps(system, db):
    d = system.json()
    assert d["star"]["id"] == IMSS
    assert 0 < len(d["bodies"]) <= 80 and len(d["ghosts"]) <= 60 and d["n_ghosts"] >= len(d["ghosts"])
    ids = {b["vendor_id"] for b in d["bodies"]}
    assert all(g["host_id"] != IMSS and g["vendor_id"] not in ids for g in d["ghosts"])
    for k in ("total_contracts", "risk_score", "tier", "is_gt", "total_amount_mxn", "primary_sector_name_es"):
        assert k in d["bodies"][0]
    assert all(len(b["also"]) <= 12 for b in d["bodies"])
    assert all(a in ids for a, *_ in d["cobid"])
    assert d["star"]["n_drawn"] == len(d["bodies"])


def test_system_is_gt_documented_only(system, db):
    ls = label_sets(db)
    vc = dict(db.execute("SELECT vendor_id, canonical_id FROM vendor_canonical"))
    documented = {vc.get(r, r) for r in ls["documented"]}
    for b in system.json()["bodies"]:
        assert b["is_gt"] == (b["vendor_id"] in documented), b["vendor_id"]


def test_system_top5_ranking_safe(system, db):
    d = system.json()
    ls = label_sets(db)
    safe = [b["vendor_id"] for b in d["bodies"]
            if b["vendor_id"] not in ls["suppressed"] and not excluded_from_rankings(db, b["vendor_id"])]
    assert d["ranked"][:5] == safe[:5] and d["ranked"] == safe
    for v in d["capture"]:
        assert not excluded_from_rankings(db, v)
    for a, p, _, red in d["cobid"]:
        if red:
            assert not excluded_from_rankings(db, p) and not excluded_from_rankings(db, a)


def test_system_vendor_resolves_host(client, system):
    body = system.json()["bodies"][0]
    r = client.get(f"{SKY}/system", params={"vendor": body["vendor_id"]})
    assert r.status_code == 200
    assert r.json()["star"]["id"] == IMSS and r.json()["focus"] == {"vendor_id": body["vendor_id"], "drawn": True}
    assert client.get(f"{SKY}/system").status_code == 422


def test_glyph_bits_withheld(payload, db):
    _, b = payload
    d = decode(b.content)
    ls = label_sets(db)
    vc = dict(db.execute("SELECT vendor_id, canonical_id FROM vendor_canonical"))
    sup = {vc.get(r, r) for r in ls["suppressed"]}
    assert not set(d["vendor_id"][d["flags2"] > 0].tolist()) & sup


def test_contract_list_amount_flag(client):
    r = client.get("/api/v1/contracts", params={"sort_by": "amount_mxn", "sort_order": "desc", "per_page": 5,
                                               "max_amount": 100_000_000_000})
    assert r.status_code == 200
    rows = r.json()["data"]
    assert all("amount_flag" in x for x in rows)
    assert any(x["amount_flag"] in ("review", "suspect_decimal") for x in rows if x["amount_mxn"] > 1e10)


def test_period_q(payload, db):
    """§3.8: every body has money at its host in at least one sexenio; lit counts match the meta."""
    _, b = payload
    d = decode(b.content)
    per = np.stack([d[f"period_{p}"] for p in range(5)])
    assert (per.max(axis=0) > 0).mean() > 0.99
    meta = dict(db.execute("SELECT key, value FROM atlas_sky_meta"))
    assert json.loads(meta["period_lit"]) == [int((per[p] > 0).sum()) for p in range(5)]


def test_system_vendor_focus_row(client, db):
    """§3.9: a searched vendor with no body gets sky/year/an Expediente row — and no RFC."""
    v = db.execute("SELECT t.vendor_id FROM atlas_sky_ties t LEFT JOIN atlas_sky_layout l ON l.kind = 'v'"
                   " AND l.entity_id = t.vendor_id WHERE l.entity_id IS NULL LIMIT 1").fetchone()[0]
    r = client.get(f"{SKY}/system", params={"vendor": v})
    assert r.status_code == 200 and "rfc" not in r.text.lower()
    f = r.json()["focus"]
    assert f["drawn"] is False and isinstance(f["sky"], bool) and f["row"]["vendor_id"] == f["vendor_id"]


# ── S5 sweep ────────────────────────────────────────────────────────────────
def test_remainder_primary_basis(payload, db):
    """A1: per star, band money ÷ (drawn + band money) — ghosts (ties at a non-host star) never count."""
    d = dict(db.execute("SELECT host_id, SUM(value_mxn) FROM atlas_sky_layout WHERE kind = 'v' GROUP BY host_id"))
    b = dict(db.execute("SELECT host_id, SUM(value_mxn) FROM atlas_sky_layout WHERE kind = 'r' GROUP BY host_id"))
    S = payload[0].json()["stars"]
    for i, iid in enumerate(S["id"][:50]):
        dv, bv = d.get(iid, 0.0), b.get(iid, 0.0)
        assert S["rem"][i] == pytest.approx(bv / (dv + bv) if dv + bv else 0.0, abs=1e-4)
    basis = payload[0].json()["basis"]
    if basis["primary_value_mxn"]:  # set from S5 on; an older precompute omits it
        assert basis["remainder_share"] == pytest.approx(sum(b.values()) / basis["primary_value_mxn"], abs=1e-5)
        assert sum(d.values()) + sum(b.values()) == pytest.approx(basis["primary_value_mxn"], rel=1e-6)


def test_expediente_totals_are_vendor_stats(system, client, db):
    """A2: «El Expediente» prints the numbers /vendors/:id prints (vendor_stats by PK)."""
    for body in system.json()["bodies"][:20]:
        row = db.execute("SELECT total_contracts, total_value_mxn, avg_risk_score FROM vendor_stats"
                         " WHERE vendor_id = ?", (body["vendor_id"],)).fetchone()
        assert row is not None
        assert body["total_contracts"] == row[0]
        assert body["total_amount_mxn"] == pytest.approx(row[1], abs=0.01)
        assert body["risk_score"] == pytest.approx(row[2])
    v = db.execute("SELECT t.vendor_id FROM atlas_sky_ties t LEFT JOIN atlas_sky_layout l ON l.kind = 'v'"
                   " AND l.entity_id = t.vendor_id JOIN vendor_stats s ON s.vendor_id = t.vendor_id"
                   " WHERE l.entity_id IS NULL LIMIT 1").fetchone()[0]
    f = client.get(f"{SKY}/system", params={"vendor": v}).json()["focus"]["row"]
    n, val = db.execute("SELECT total_contracts, total_value_mxn FROM vendor_stats WHERE vendor_id = ?", (v,)).fetchone()
    assert f["total_contracts"] == n and f["total_amount_mxn"] == pytest.approx(val, abs=0.01)


def test_system_withheld_bodies_have_no_name(system, db):
    """Public-label rule on the canvas: a withheld body (suppressed label, GT false positive,
    persona física) must arrive nameless so the rim label prints the public label, exactly as
    the band, the CSV and `ranked` already withhold it (2026-10-04 ruling)."""
    d = system.json()
    ls = label_sets(db)
    ranked = set(d["ranked"])
    for b in d["bodies"]:
        if b["vendor_id"] not in ranked:
            assert b["name"] == "", b["vendor_id"]
    for g in d["ghosts"]:
        if g["vendor_id"] in ls["suppressed"] or excluded_from_rankings(db, g["vendor_id"]):
            assert g["name"] == "", g["vendor_id"]


# ── instruments I-S2 «El año» (spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §2) ──
@pytest.fixture(scope="module")
def years(db):
    if not atlas_sky.has_years(db):
        pytest.skip("years backfill (--years-backfill) not run on this DB")
    return dict(db.execute("SELECT key, value FROM atlas_sky_meta"))


def test_years_sum_to_stars_and_ties(db, years):
    """§2.4 drift guard, re-checked: Σ star-years = star V; Σ tie-years = tie value (every tie of a drawn vendor)."""
    assert db.execute(
        "SELECT COUNT(*) FROM atlas_sky_layout l JOIN (SELECT institution_id, SUM(value_mxn) v FROM atlas_sky_star_years"
        " GROUP BY institution_id) y ON y.institution_id = l.entity_id WHERE l.kind = 's'"
        " AND ABS(y.v - l.value_mxn) > 1e-6 * l.value_mxn").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM atlas_sky_layout WHERE kind = 's' AND value_mxn > 0 AND entity_id NOT IN"
                      " (SELECT institution_id FROM atlas_sky_star_years)").fetchone()[0] == 0
    assert db.execute(
        "SELECT COUNT(*) FROM (SELECT vendor_id, institution_id, SUM(value_mxn) v FROM atlas_sky_tie_years"
        " GROUP BY vendor_id, institution_id) y JOIN atlas_sky_ties t USING (vendor_id, institution_id)"
        " WHERE ABS(y.v - t.value_mxn) > 1e-6 * t.value_mxn").fetchone()[0] == 0
    drawn_ties = db.execute("SELECT COUNT(*) FROM atlas_sky_ties WHERE vendor_id IN"
                            " (SELECT entity_id FROM atlas_sky_layout WHERE kind = 'v')").fetchone()[0]
    assert db.execute("SELECT COUNT(*) FROM (SELECT DISTINCT vendor_id, institution_id FROM atlas_sky_tie_years)"
                      ).fetchone()[0] == drawn_ties
    lo, hi = db.execute("SELECT MIN(year), MAX(year) FROM atlas_sky_star_years").fetchone()
    assert 2000 <= lo and hi <= 2025
    assert not [i for i, pv, v in db.execute("SELECT entity_id, period_v, value_mxn FROM atlas_sky_layout WHERE kind = 's'")
                if abs(sum(json.loads(pv)) - v) > max(1.0, 1e-9 * v)]
    assert json.loads(years["anomalies"]).get("no_year", 0) == 0


def test_years_thin_rule(db, years):
    """§2.1: thin = < 3 vendors or < 1 % of the star's lifetime money; thin rows carry no HHI."""
    rows = db.execute("SELECT y.n_vendors, y.value_mxn, l.value_mxn, y.thin, y.hhi, y.top_share FROM atlas_sky_star_years y"
                      " JOIN atlas_sky_layout l ON l.kind = 's' AND l.entity_id = y.institution_id").fetchall()
    for nv, v, V, thin, hhi, ts in rows:
        assert thin == int(nv < 3 or v < 0.01 * V)
        assert (hhi is None) == bool(thin)
        assert hhi is None or 0 < hhi <= 10_000 + 1e-6
        assert 0 < ts <= 1 + 1e-9


def test_years_coverage_meta(years):
    """§2.5: the global source gap, the leading thin years, the sky-wide 2019–2022 drop, the successors."""
    assert json.loads(years["year_gaps"]) == [2004]
    assert json.loads(years["thin_early"]) == [2000, 2001]
    assert json.loads(years["coverage_drop"]) == [2019, 2020, 2021, 2022]
    assert json.loads(years["successors"]) == [[345, 3671, 2021], [1327, 3785, 2023]]
    assert years["bin_version"] == "SKY3" and len(json.loads(years["inst_reporting"])) == 26


def test_years_daggers(years):
    """§2.5 dagger list: PEP's decline Calderón → Peña Nieto; CFE + PEMEX after 2018; SCT → SICT; DICONSA → 3785."""
    br = json.loads(years["breaks"])
    assert 311 in {i for i, _, _ in br["4"]["calderon>pena_nieto"]}
    assert {104, 1201} <= {i for i, _, _ in br["4"]["pena_nieto>amlo"]}
    sct = [s for rows in br["3"].values() for i, _, s in rows if i == 345]
    assert sct and all(s == 3671 for s in sct)
    dic = [s for rows in br["9"].values() for i, _, s in rows if i == 1327]
    assert dic and all(s == 3785 for s in dic)


def test_years_system_fields(client, years):
    """§2.6 system: coverage (1326 stops reporting 2019–2022), period_v, years[]; ETag carries the year token."""
    d = client.get(f"{SKY}/system", params={"inst": 1326}).json()
    assert {2019, 2020, 2021, 2022} <= set(d["star"]["gap_years"])
    assert 2004 not in d["star"]["gap_years"]           # the global source gap has its own stamp
    for k in ("first_data_year", "last_data_year", "period_v", "period_nv"):
        assert k in d["star"]
    assert all(b["period_v"] and len(b["period_v"]) == 5 for b in d["bodies"])
    r = client.get(f"{SKY}/system", params={"inst": IMSS})
    assert '-y1' in r.headers["etag"]
    yrs = r.json()["years"]
    assert 0 < len(yrs) <= 26 and [y["year"] for y in yrs] == sorted(y["year"] for y in yrs)
    assert "rfc" not in r.text.lower() and not _PERSON_RFC_TOKEN.search(r.text)


def test_years_withheld_top_name_null(client, db, years):
    """Public-label rule on years[]: a withheld top vendor arrives nameless; a named one passes the label sets."""
    ls = label_sets(db)
    stars = [i for (i,) in db.execute("SELECT DISTINCT institution_id FROM atlas_sky_star_years WHERE top_withheld = 1"
                                      " ORDER BY institution_id LIMIT 5")]
    assert stars
    for inst in stars:
        for y in client.get(f"{SKY}/system", params={"inst": inst}).json()["years"]:
            w = db.execute("SELECT top_withheld FROM atlas_sky_star_years WHERE institution_id = ? AND year = ?",
                           (inst, y["year"])).fetchone()[0]
            assert (y["top_name"] is None) == bool(w)
            if not w:
                assert y["top_vendor_id"] not in ls["suppressed"] and not excluded_from_rankings(db, y["top_vendor_id"])


def test_sky3_bin_masks(payload, db, years):
    """§2.6: SKY3 = SKY2 + 4 u8 year-mask columns equal to the layout's year_mask; manifest ym per star."""
    m, b = payload
    assert b.content[:4] == b"SKY3" and '-y1' in m.headers["etag"]
    d = decode(b.content)
    ym = (d["ym_0"].astype(np.uint32) | d["ym_1"].astype(np.uint32) << 8 | d["ym_2"].astype(np.uint32) << 16
          | d["ym_3"].astype(np.uint32) << 24)
    ref = dict(db.execute("SELECT entity_id, year_mask FROM atlas_sky_layout WHERE kind = 'v'"))
    assert all(int(x) == ref[int(v)] and x for v, x in zip(d["vendor_id"], ym))
    assert ((ym & (np.uint32(1) << d["year"].astype(np.uint32))) > 0).all()   # money at the host in its first year
    body = m.json()
    assert len(body["stars"]["ym"]) == body["basis"]["n_stars"]
    for k in ("year_value", "year_contracts", "inst_reporting", "year_gaps", "coverage_drop", "breaks", "successors"):
        assert k in body["meta"]


def test_sky2_when_column_absent(db, years):
    """SKY2 shim: a layout without year_mask (pre-backfill) serves SKY2, byte-identical to SKY3's head."""
    mem = sqlite3.connect("file::memory:", uri=True)
    mem.execute("ATTACH DATABASE ? AS src", (f"file:{DB_PATH}?mode=ro",))
    cols = [r[1] for r in db.execute("PRAGMA table_info(atlas_sky_layout)") if r[1] not in ("period_v", "period_nv", "year_mask")]
    mem.execute(f"CREATE TABLE atlas_sky_layout AS SELECT {', '.join(cols)} FROM src.atlas_sky_layout")
    assert not atlas_sky.has_years(mem)
    b2, b3 = atlas_sky.build_bin(mem), atlas_sky.build_bin(db)
    n = struct.unpack_from("<I", b3, 4)[0]
    assert b2[:4] == b"SKY2" and b2[4:] == b3[4:len(b3) - 4 * n]
    man = atlas_sky.build_manifest(mem)
    assert "meta" not in man and "ym" not in man["stars"]
    mem.close()


def test_years_institution_hhi_outliers(db, years, capsys):
    """Audit 4.2: stars whose sky-basis HHI differs > 1.5× from institution_hhi in some year — printed, not asserted."""
    rows = db.execute(
        "SELECT y.institution_id, y.year, y.hhi, h.hhi, l.value_mxn FROM atlas_sky_star_years y"
        " JOIN institution_hhi h ON h.institution_id = y.institution_id AND h.contract_year = y.year"
        " JOIN atlas_sky_layout l ON l.kind = 's' AND l.entity_id = y.institution_id"
        " WHERE y.hhi IS NOT NULL AND h.hhi > 0").fetchall()
    out: dict[int, tuple] = {}
    for i, yr, a, b, v in rows:
        if max(a, b) / min(a, b) > 1.5:
            out.setdefault(i, (v, []))[1].append(yr)
    with capsys.disabled():
        print(f"\n  institution_hhi vs sky-basis HHI > 1.5x: {len(out)} stars; top 12 by value:")
        for i, (v, yrs) in sorted(out.items(), key=lambda kv: -kv[1][0])[:12]:
            print(f"    star {i}: {len(yrs)} years {yrs[:6]}")


# ── instruments I-S3 «Parientes» — GET /atlas/sky/kin/{planet} (spec §3.5, F15) ──
def _kin_planet(db, withheld_partner: bool):
    """A drawn planet with co-bid partners; with a withheld partner when asked."""
    ls = label_sets(db)
    for v, p in db.execute("SELECT c.vendor_id, c.partner_id FROM atlas_sky_cobid c JOIN atlas_sky_layout l"
                           " ON l.kind = 'v' AND l.entity_id = c.vendor_id ORDER BY c.vendor_id"):
        if not withheld_partner or p in ls["suppressed"] or excluded_from_rankings(db, p):
            return v
    pytest.skip("no such planet on this DB")


def test_kin_shape_no_rfc(client, db, years):
    v = _kin_planet(db, False)
    r = client.get(f"{SKY}/kin/{v}")
    assert r.status_code == 200, r.text
    assert '-y1' in r.headers["etag"]
    assert '"rfc' not in r.text.lower() and not _PERSON_RFC_TOKEN.search(r.text)
    d = r.json()
    assert d["drawn"] is True and d["host_id"] and d["buyers"] and d["years_here"]
    assert {b["inst_id"] for b in d["buyers"]} >= {d["host_id"]} or d["n_buyers"] > len(d["buyers"])
    host_v = db.execute("SELECT value_mxn FROM atlas_sky_ties WHERE vendor_id = ? AND institution_id = ?",
                        (v, d["host_id"])).fetchone()[0]
    assert sum(x[1] for x in d["years_here"]) == pytest.approx(host_v, rel=1e-6)
    n_pairs = db.execute("SELECT COUNT(*) FROM atlas_sky_cobid WHERE vendor_id = ?", (v,)).fetchone()[0]
    assert len(d["cobid"]) + d["n_cobid_not_drawn"] == n_pairs
    assert client.get(f"{SKY}/kin/{v}", headers={"If-None-Match": r.headers["etag"]}).status_code == 304


def test_kin_withheld_names_null(client, db, years):
    v = _kin_planet(db, True)
    ls = label_sets(db)
    for c in client.get(f"{SKY}/kin/{v}").json()["cobid"]:
        if c["vendor_id"] in ls["suppressed"] or excluded_from_rankings(db, c["vendor_id"]):
            assert c["name"] is None and c["red"] is False, c


def test_kin_undrawn_partners_carry_host(client, db, years):
    """drawn:false partners fly to their main buyer; partners with no tie are only counted."""
    rows = db.execute("SELECT c.vendor_id FROM atlas_sky_cobid c JOIN atlas_sky_layout l ON l.kind = 'v'"
                      " AND l.entity_id = c.vendor_id WHERE c.partner_id NOT IN"
                      " (SELECT entity_id FROM atlas_sky_layout WHERE kind = 'v') LIMIT 20").fetchall()
    if not rows:
        pytest.skip("every partner is drawn")
    seen = dropped = 0
    for (v,) in rows:
        d = client.get(f"{SKY}/kin/{v}").json()
        for c in d["cobid"]:
            if not c["drawn"]:
                seen += 1
                assert c["host_id"] == db.execute(
                    "SELECT institution_id FROM atlas_sky_ties WHERE vendor_id = ? ORDER BY value_mxn DESC,"
                    " institution_id LIMIT 1", (c["vendor_id"],)).fetchone()[0]
        dropped += d["n_cobid_not_drawn"]
        tieless = db.execute("SELECT COUNT(*) FROM atlas_sky_cobid WHERE vendor_id = ? AND partner_id NOT IN"
                             " (SELECT vendor_id FROM atlas_sky_ties)", (v,)).fetchone()[0]
        assert d["n_cobid_not_drawn"] == tieless
    assert seen + dropped > 0


def test_kin_undrawn_vendor(client, db, years):
    v = db.execute("SELECT t.vendor_id FROM atlas_sky_ties t LEFT JOIN atlas_sky_layout l ON l.kind = 'v'"
                   " AND l.entity_id = t.vendor_id WHERE l.entity_id IS NULL LIMIT 1").fetchone()[0]
    d = client.get(f"{SKY}/kin/{v}").json()
    assert d["drawn"] is False and d["host_id"] and d["years_here"] == [] and d["cobid"] == []
    assert client.get(f"{SKY}/kin/999999999").status_code == 404


def test_manifest_carries_buyer_level(client):
    # docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md Phase 1: stars.lvl, 0 federal · 1 estatal · 2 municipal · 3 otro
    m = client.get("/api/v1/atlas/sky/manifest").json()
    lvl = m["stars"].get("lvl")
    if lvl is None:
        pytest.skip("institution_canonical.buyer_level not on this DB")
    assert len(lvl) == len(m["stars"]["id"]) and set(lvl) <= {0, 1, 2, 3} and 0 in lvl and 1 in lvl
