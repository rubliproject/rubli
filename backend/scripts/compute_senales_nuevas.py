"""«Señales nuevas» — a rule-based, label-free signal layer, separate from the supervised model.

Contract: docs/SENALES_NUEVAS.md (one frozen definition per signal, legal basis, coverage).
Architecture (owner-delegated decision 2026-10-16): these signals are NOT model features. The model
(v0.9.1) says "looks like documented cases"; these say "a rule with a legal or method basis fired".
The two tracks meet in ARIA «Nuevos» (aria_nuevos_signals): vendors with NO ground-truth link of any
kind, active 2019+, with >= 2 signals converging, ranked by n_signals then money. No GT in any rule.

Run from backend/:
    python -m scripts.compute_senales_nuevas            # compute + write the two tables
    python -m scripts.compute_senales_nuevas --dry-run  # compute + print counts, no write
    --cache DIR  keeps the read-only extract as parquet (slow disk; iteration only)

Reads the DB read-only (file:...?mode=ro). Writes ONLY vendor_signals and aria_nuevos_signals
(dropped and rebuilt), then a PASSIVE WAL checkpoint. Never writes contracts/vendors/scores/aria_queue.
No RFC, persona fisica name or official's name is written: personas fisicas and public bodies are
not scored at all; detail_json holds institution names, contract codes and numbers only.
"""
from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.config.constants import FLAG_THRESHOLD, MAX_CONTRACT_VALUE  # noqa: E402
from api.public_labels import _norm_name, is_persona_fisica, is_public_entity, label_sets  # noqa: E402
from api.routers import fallo  # noqa: E402

log = logging.getLogger("senales")
DB = Path(__file__).resolve().parent.parent / "RUBLI_NORMALIZED.db"

# Signal codes, labels and dossier sentences live in api/routers/senales.py (SIGNALS).

# (a) statutory FULL minimums, natural days, counted from the CompraNet publication day inclusive.
# LAASSP art. 32 / LOPSRM art. 33 (2009 text): internacional >= 20, nacional >= 15; reducible to
# >= 10 with a documented justification -> «plazo reducido» is legal, not an offence.
MIN_DAYS_NACIONAL, MIN_DAYS_INTERNACIONAL, FLOOR_REDUCED = 15, 20, 10

# (b) exception articles that invoke caso fortuito / fuerza mayor / urgencia. Crosswalk measured on
# ComprasMX open data, where every article arrives with ComprasMX's own reason label (one-to-one):
#   LAASSP (2009) 41 fr. II  & LAASSP (2025) 54 fr. II  -> CASO FORTUITO O FUERZA MAYOR
#   LAASSP (2009) 41 fr. V   & LAASSP (2025) 54 fr. V   -> URGENCIA Y EVENTUALIDAD
#   LOPSRM 42 fr. II -> caso fortuito; 42 fr. V -> urgencia; 45 BIS -> caso fortuito
URGENCY_ARTICLES = frozenset({
    "ART. 41 FR. II", "ART. 41 FR. V", "ART. 54 FR. II", "ART. 54 FR. V",
    "ART. 42 FR. II", "ART. 42 FR. V", "ART. 45 BIS",
})

ACTIVE_FROM = 2019  # «Nuevos» = active 2019+ (same filter as GET /aria/rosettes?set=nuevos)
FP_STATUSES = ("false_positive", "fp_excluded", "structural_fp")  # = routers/aria.py _FP_STATUSES
OUT_COLS = ["vendor_id", "n_contracts", "money_mxn", "first_year", "last_year", "detail"]


# ---------------------------------------------------------------------------
# Loading (read-only)
# ---------------------------------------------------------------------------

def _d(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s.astype("string").str[:10], format="%Y-%m-%d", errors="coerce")


def load(db: Path, cache: Path | None = None) -> dict:
    if cache and (cache / "K.parquet").exists():
        log.info("cache hit %s", cache)
        out = {k: pd.read_parquet(cache / f"{k}.parquet") for k in ("K", "V", "I")}
        out["F"] = json.loads((cache / "F.json").read_text())
        out["meta"] = json.loads((cache / "meta.json").read_text())
        return out
    conn = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
    leg = pd.read_sql(
        """SELECT id, source_structure st, vendor_id, institution_id inst, sector_id sector, procedure_number proc,
                  procedure_type ptype, contract_type_normalized ctn, procedure_character pchar, contract_date,
                  contract_year year, publication_date, opening_date, amount_mxn amount, is_direct_award is_da,
                  exception_article article
           FROM contracts""", conn)
    leg["src"] = "compranet"
    leg["date"] = _d(leg.pop("contract_date"))
    leg["pub"] = _d(leg.pop("publication_date"))
    leg["ape"] = _d(leg.pop("opening_date"))
    leg["obra"] = leg.pop("ctn") == "obra_publica"
    leg["intl"] = leg.pop("pchar").fillna("").str.upper().str.startswith("INTERNACIONAL")
    leg["code"] = None

    # ComprasMX open data 2025-26, federal (APF) rows NOT already in `contracts` (in_contracts = 0).
    cmx = pd.read_sql(
        """SELECT codigo_contrato code, vendor_id, institution_id inst, sector_id sector,
                  numero_procedimiento proc, tipo_procedimiento ptype, ley, caracter, fecha_publicacion,
                  fecha_apertura, fecha_firma, fecha_inicio, amount_mxn amount, is_direct_award is_da,
                  articulo_excepcion article
           FROM comprasmx_contracts WHERE orden_gobierno = 'APF' AND COALESCE(in_contracts, 0) = 0""", conn)
    cmx["src"], cmx["st"], cmx["id"] = "comprasmx", "X", None
    cmx["pub"] = pd.to_datetime(cmx.pop("fecha_publicacion").map(fallo.mx_date))
    cmx["ape"] = pd.to_datetime(cmx.pop("fecha_apertura").map(fallo.mx_date))
    firma, inicio = cmx.pop("fecha_firma"), cmx.pop("fecha_inicio")
    cmx["date"] = _d(firma.fillna(inicio))
    cmx["year"] = cmx.date.dt.year
    cmx["obra"] = cmx.pop("ley") == "LOPSRM"
    cmx["intl"] = cmx.pop("caracter").fillna("").str.upper().str.startswith("INTERNACIONAL")
    K = pd.concat([leg, cmx], ignore_index=True)
    K["ptype"] = K.ptype.fillna("").str.upper()
    K["id"] = K.id.astype("Int64")

    V = pd.read_sql("SELECT id vendor_id, rfc, name, is_individual, last_contract_date FROM vendors", conn)
    I = pd.read_sql("SELECT id inst, siglas, name FROM institutions", conn)
    F = [list(r) for r in conn.execute(fallo.SELECT)]
    ls = label_sets(conn)
    meta = {
        "gt_vendor_ids": sorted({r[0] for r in conn.execute(
            "SELECT DISTINCT vendor_id FROM ground_truth_vendors WHERE vendor_id IS NOT NULL")}),
        "label_known": sorted(ls["documented"] | ls["leads"] | ls["fp"] | set(ls["suppressed"])),
        "aria_known": sorted(r[0] for r in conn.execute(
            f"""SELECT vendor_id FROM aria_queue WHERE COALESCE(in_ground_truth, 0) = 1
                OR review_status IN {FP_STATUSES}""")),
    }
    conn.close()
    out = {"K": K, "V": V, "I": I, "F": F, "meta": meta}
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
        for k in ("K", "V", "I"):
            out[k].to_parquet(cache / f"{k}.parquet")
        (cache / "F.json").write_text(json.dumps(F))
        (cache / "meta.json").write_text(json.dumps(meta))
    return out


def clean(K: pd.DataFrame) -> pd.DataFrame:
    """100B rule: > 100B MXN is a data error -> out of every signal. NaN amounts count as 0."""
    K = K.copy()
    K["amount"] = K.amount.fillna(0.0).astype(float)
    return K[K.amount <= MAX_CONTRACT_VALUE]


def eligible_vendors(V: pd.DataFrame, inst_names: set) -> set:
    """Companies only: personas fisicas (flag or 13-char RFC) and public bodies are never scored."""
    rfc = V.rfc.astype(object).where(V.rfc.notna(), None)  # NaN would crash; bool(NaN) is True
    ind = V.is_individual.fillna(0).astype(int)
    name = V.name.astype(object).where(V.name.notna(), None)
    return {vid for vid, r, n, i in zip(V.vendor_id, rfc, name, ind)
            if not is_persona_fisica(i, r) and not is_public_entity(n, inst_names)}


def _rows(df: pd.DataFrame, detail_cols: list) -> pd.DataFrame:
    """Normalise a per-vendor frame to the vendor_signals shape."""
    out = df[OUT_COLS[:-1]].copy()
    out["detail"] = [dict(zip(detail_cols, vals)) for vals in df[detail_cols].itertuples(index=False, name=None)]
    return out


def _empty() -> pd.DataFrame:
    return pd.DataFrame(columns=OUT_COLS)


# ---------------------------------------------------------------------------
# (a) plazo_reducido
# ---------------------------------------------------------------------------

def tender_days(pub: pd.Series, ape: pd.Series) -> pd.Series:
    """Natural days publication -> apertura, publication day inclusive (CompraNet's own count: the
    shortest D / ComprasMX call is 9 calendar days apart = 10 counted, exactly the reduced floor)."""
    return (ape - pub).dt.days + 1


def sig_plazo_reducido(K: pd.DataFrame, inst_name: dict) -> pd.DataFrame:
    """Vendor won >= 3 licitaciones publicas whose call ran fewer days than the FULL legal minimum
    (15 nacional / 20 internacional); they are >= half of its licitaciones, and >= 2x what its buyers'
    own reduced-period rate (same institution-year, leave-one-out) predicts."""
    L = K[K.ptype.str.startswith("LICITACI") & K.pub.notna() & K.ape.notna() & K.vendor_id.notna()].copy()
    if L.empty:
        return _empty()
    L["days"] = tender_days(L.pub, L.ape)
    L = L[(L.days >= 1) & (L.days <= 365)]
    L["reduced"] = L.days < np.where(L.intl, MIN_DAYS_INTERNACIONAL, MIN_DAYS_NACIONAL)
    L["proc"] = L.proc.fillna(L.code).fillna(L.id.astype("string"))
    procs = L.groupby("proc").agg(inst=("inst", "first"), year=("year", "first"), reduced=("reduced", "first"))
    base = procs.groupby(["inst", "year"]).reduced.agg(["sum", "count"])
    glob = float(procs.reduced.mean())
    P = L.groupby(["vendor_id", "proc"]).agg(
        inst=("inst", "first"), year=("year", "first"), reduced=("reduced", "first"), days=("days", "first"),
        amount=("amount", "sum"), n=("amount", "size")).reset_index()
    b = base.reindex(pd.MultiIndex.from_arrays([P.inst, P.year])).to_numpy(dtype=float)
    s, c = b[:, 0], b[:, 1]
    with np.errstate(invalid="ignore", divide="ignore"):
        loo = np.where(c > 1, (s - P.reduced.to_numpy(dtype=float)) / (c - 1), glob)
    P["p_red"] = np.nan_to_num(loo, nan=glob)
    g = P.groupby("vendor_id")
    A = pd.DataFrame({"n_lic": g.size(), "n_red": g.reduced.sum(), "expected": g.p_red.sum()})
    A = A[(A.n_red >= 3) & (A.n_red >= 0.5 * A.n_lic) & (A.n_red >= 2 * A.expected)]
    if A.empty:
        return _empty()
    rg = P[P.reduced & P.vendor_id.isin(A.index)].groupby("vendor_id")
    A = A.join(pd.DataFrame({
        "n_contracts": rg.n.sum(), "money_mxn": rg.amount.sum(), "first_year": rg.year.min(),
        "last_year": rg.year.max(), "min_days": rg.days.min(),
        "below_floor": rg.days.agg(lambda x: int((x < FLOOR_REDUCED).sum()))})).reset_index()
    ex = {vid: [[int(r.year), inst_name.get(r.inst), int(r.days), round(r.amount)]
                for r in grp.nlargest(5, "amount").itertuples()] for vid, grp in rg}
    A["examples"] = A.vendor_id.map(ex)
    A["expected"] = A.expected.round(1)
    for k in ("n_lic", "n_red", "min_days", "below_floor"):
        A[k] = A[k].astype(int)
    return _rows(A, ["n_lic", "n_red", "expected", "min_days", "below_floor", "examples"])


# ---------------------------------------------------------------------------
# (b) urgencia
# ---------------------------------------------------------------------------

def sig_urgencia(K: pd.DataFrame, inst_name: dict) -> pd.DataFrame:
    """Coverage = rows that record the exception article (CompraNet D 2023-25 + ComprasMX 2025-26).
    Vendor: >= 3 contracts under a caso-fortuito/urgency article, they carry >= 50% of its money in the
    window, and that share is >= 3x what its own buyers pay the OTHER vendors that way (buyer-weighted,
    leave-one-out), so a buyer's general emergency practice does not make all its suppliers fire."""
    W = K[((K.st == "D") | (K.src == "comprasmx")) & K.vendor_id.notna() & K.inst.notna() & (K.amount > 0)].copy()
    if W.empty:
        return _empty()
    W["urg"] = W.article.isin(URGENCY_ARTICLES)
    W["urg_amt"] = W.amount.where(W.urg, 0.0)
    vi = W.groupby(["vendor_id", "inst"]).agg(u=("urg_amt", "sum"), a=("amount", "sum"), n=("urg", "sum")).reset_index()
    ins = vi.groupby("inst")[["u", "a"]].sum()
    vi = vi.join(ins.rename(columns={"u": "iu", "a": "ia"}), on="inst")
    with np.errstate(invalid="ignore", divide="ignore"):
        vi["expected"] = np.where(vi.ia > vi.a, (vi.iu - vi.u) / (vi.ia - vi.a), 0.0) * vi.a
    g = vi.groupby("vendor_id")
    A = pd.DataFrame({"tot": g.a.sum(), "money_mxn": g.u.sum(), "n_contracts": g.n.sum(), "exp": g.expected.sum()})
    A["share"], A["buyer_share"] = A.money_mxn / A.tot, A.exp / A.tot
    A = A[(A.n_contracts >= 3) & (A.share >= 0.5) & (A.share >= 3 * A.buyer_share)]
    if A.empty:
        return _empty()
    ug = W[W.urg & W.vendor_id.isin(A.index)].groupby("vendor_id")
    A = A.join(pd.DataFrame({"first_year": ug.year.min(), "last_year": ug.year.max()})).reset_index()
    arts = {vid: grp.article.value_counts().head(3).to_dict() for vid, grp in ug}
    ex = {vid: [[int(r.year), inst_name.get(r.inst), r.article, round(r.amount), r.code]
                for r in grp.nlargest(5, "amount").itertuples()] for vid, grp in ug}
    A["articles"], A["examples"] = A.vendor_id.map(arts), A.vendor_id.map(ex)
    A["share"], A["buyer_share"] = A.share.round(3), A.buyer_share.round(3)
    A["n_contracts"] = A.n_contracts.astype(int)
    return _rows(A, ["share", "buyer_share", "articles", "examples"])


# ---------------------------------------------------------------------------
# (c) antes_del_fallo: the published definition, reused verbatim from routers/fallo.py
# ---------------------------------------------------------------------------

def sig_antes_del_fallo(fallo_rows: list) -> pd.DataFrame:
    """Vendor holds >= 1 competitive federal ComprasMX contract whose start date (CDMX) precedes the
    award (fallo) date. fallo.build(): APF, licitacion/invitacion, UTC->CDMX, > 100B excluded."""
    early = [r for r in fallo.build(fallo_rows)["early"] if r.get("vid") is not None]
    if not early:
        return _empty()
    E = pd.DataFrame(early)
    E["year"] = E.fallo.str[:4].astype(int)
    E["money"] = E.amt * 1e6
    g = E.groupby("vid")
    A = pd.DataFrame({"n_contracts": g.size(), "money_mxn": g.money.sum(), "first_year": g.year.min(),
                      "last_year": g.year.max(), "max_days_early": -g.ini.min(),
                      "jan1": g.jan1.sum(), "emergency": g.fort.sum()})
    ex = {vid: [[r.code, -int(r.ini), r.fallo, round(r.money), bool(r.lp)]
                for r in grp.nlargest(5, "money").itertuples()] for vid, grp in g}
    A = A.reset_index().rename(columns={"vid": "vendor_id"})
    A["examples"] = A.vendor_id.map(ex)
    for k in ("max_days_early", "jan1", "emergency"):
        A[k] = A[k].astype(int)
    return _rows(A, ["max_days_early", "jan1", "emergency", "examples"])


# ---------------------------------------------------------------------------
# (g) empresa_joven
# ---------------------------------------------------------------------------

RFC_MORAL = r"^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$"


def incorporation_date(rfc: pd.Series, pivot: int = 26) -> pd.Series:
    """12-char persona-moral RFC -> date encoded in positions 4-9 (YYMMDD); YY > pivot -> 1900s.
    Invalid / 13-char (persona fisica = birth date) -> NaT. Only the date leaves this function."""
    r = rfc.fillna("").astype(str).str.strip().str.upper()
    ok = r.str.match(RFC_MORAL)
    yy = pd.to_numeric(r.str[3:5].where(ok), errors="coerce")
    year = pd.Series(np.where(yy > pivot, 1900, 2000) + yy, index=r.index).astype("Int64").astype("string")
    return pd.to_datetime(year + r.str[5:9], format="%Y%m%d", errors="coerce").where(ok)


def sig_empresa_joven(K: pd.DataFrame, V: pd.DataFrame, max_days: int = 180) -> pd.DataFrame:
    """Company RFC whose encoded incorporation date falls 0-179 days before its first recorded contract
    (CompraNet 2002-2025 or ComprasMX 2025-26). Money/contracts = the vendor's whole record."""
    inc = pd.Series(incorporation_date(V.rfc).to_numpy(), index=V.vendor_id.to_numpy())
    X = K[K.vendor_id.notna()]
    g = X.groupby("vendor_id")
    A = pd.DataFrame({"first": g.date.min(), "money_mxn": g.amount.sum(), "n_contracts": g.size(),
                      "first_year": g.year.min(), "last_year": g.year.max()})
    A["inc"] = inc.reindex(A.index)
    A["gap_days"] = (A["first"] - A.inc).dt.days
    A = A[(A.gap_days >= 0) & (A.gap_days < max_days)].copy()
    if A.empty:
        return _empty()
    fy = X.join(A["first"], on="vendor_id", how="inner")
    A["first_year_money"] = fy[fy.date < fy["first"] + pd.Timedelta(days=365)].groupby("vendor_id").amount.sum()
    A = A.reset_index()
    A["first_year_money"] = A.first_year_money.fillna(0).round()
    A["gap_days"] = A.gap_days.astype(int)
    return _rows(A, ["gap_days", "first_year_money"])


# ---------------------------------------------------------------------------
# (h) comprador_dominado
# ---------------------------------------------------------------------------

def sig_comprador_dominado(K: pd.DataFrame, inst_name: dict, min_suppliers: int = 5,
                           min_money: float = 1e8, min_share: float = 0.5) -> pd.DataFrame:
    """Vendor took > 50% of a buyer's money in a calendar year where that buyer-year had >= 5 suppliers
    and >= 100 MDP (methodology audit sec. 3; CompraNet A-D + ComprasMX 2025-26)."""
    X = K[K.vendor_id.notna() & K.inst.notna() & K.year.notna() & (K.amount > 0)]
    by = X.groupby(["inst", "year", "vendor_id"]).agg(amount=("amount", "sum"), n=("amount", "size")).reset_index()
    tot = by.groupby(["inst", "year"]).agg(ns=("vendor_id", "size"), tot=("amount", "sum"))
    by = by.join(tot, on=["inst", "year"])
    by["share"] = by.amount / by.tot
    hit = by[(by.ns >= min_suppliers) & (by.tot >= min_money) & (by.share > min_share)]
    if hit.empty:
        return _empty()
    g = hit.groupby("vendor_id")
    A = pd.DataFrame({"n_contracts": g.n.sum(), "money_mxn": g.amount.sum(), "first_year": g.year.min(),
                      "last_year": g.year.max(), "n_buyer_years": g.size()}).reset_index()
    ex = {vid: [[int(r.year), inst_name.get(r.inst), round(r.share, 3), round(r.tot), int(r.ns)]
                for r in grp.nlargest(5, "amount").itertuples()] for vid, grp in g}
    A["examples"] = A.vendor_id.map(ex)
    return _rows(A, ["n_buyer_years", "examples"])


# ---------------------------------------------------------------------------
# (d)(e)(f): frozen definitions owned by newtabs-data (docs/NEWTABS_DEFINITIONS.md); read, never redefined
# ---------------------------------------------------------------------------

def sig_arranque(ar: pd.DataFrame) -> pd.DataFrame:
    """(d) Every newtabs_arranque row: first CompraNet contract >= 2011 and >= 100 MDP in the 365 days
    from it (day 0 included); re-incorporations by base_name already dropped upstream."""
    if ar.empty:
        return _empty()
    A = ar.rename(columns={"y1_n": "n_contracts", "y1_mxn": "money_mxn"}).copy()
    A["last_year"] = A.first_year
    for k in ("censored", "flag_10b"):
        A[k] = A[k].astype(bool)
    return _rows(A, ["days_to_threshold", "y1_da_share", "censored", "flag_10b"])


def sig_mismo_dia(md: pd.DataFrame, inst_name: dict) -> pd.DataFrame:
    """(e) Vendor appears in >= 1 newtabs_mismo_dia lot: same federal buyer x vendor x date x legal schedule,
    >= 2 direct awards each below the LOWEST PEF cap, summing above the HIGHEST cap + IVA (2019-2025)."""
    if md.empty:
        return _empty()
    g = md.groupby("vendor_id")
    A = pd.DataFrame({"n_contracts": g.n.sum(), "money_mxn": g.sum_mxn.sum(), "first_year": g.year.min(),
                      "last_year": g.year.max(), "n_lots": g.size(), "max_pieces": g.n.max()}).reset_index()
    ex = {vid: [[r.contract_date, inst_name.get(r.institution_id), int(r.n), round(r.sum_mxn)]
                for r in grp.nlargest(5, "sum_mxn").itertuples()] for vid, grp in g}
    A["examples"] = A.vendor_id.map(ex)
    return _rows(A, ["n_lots", "max_pieces", "examples"])


def sig_pareja(pa: pd.DataFrame, inst_name: dict) -> pd.DataFrame:
    """(f) Vendor holds >= 1 frozen newtabs_parejas pair: same buyer >= 10 consecutive years AND >= 80% of
    the pair's 2011+ money by direct award or single bid."""
    F = pa[pa.frozen.astype(bool)] if len(pa) else pa
    if F.empty:
        return _empty()
    g = F.groupby("vendor_id")
    A = pd.DataFrame({"n_contracts": g.n_years.sum(), "money_mxn": g.money_mxn.sum(), "first_year": g.first_year.min(),
                      "last_year": g.last_year.max(), "n_pairs": g.size()}).reset_index()
    ex = {vid: [[inst_name.get(r.institution_id), int(r.n_years), int(r.first_year), int(r.last_year),
                 round(float(r.noncomp_share), 3), round(r.money_mxn)]
                for r in grp.nlargest(5, "money_mxn").itertuples()] for vid, grp in g}
    A["examples"] = A.vendor_id.map(ex)
    return _rows(A, ["n_pairs", "examples"])


NEWTABS = {"arranque": "newtabs_arranque", "mismo_dia": "newtabs_mismo_dia", "pareja": "newtabs_parejas"}


def sig_from_newtabs(conn: sqlite3.Connection, inst_name: dict, db: Path | None = None) -> dict:
    """{signal: frame} from the newtabs-data tables (docs/NEWTABS_DEFINITIONS.md). If they are not built yet
    and `db` is given, the same frozen functions are run from scripts/precompute_newtabs.py (no redefinition)."""
    have = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if set(NEWTABS.values()) <= have:
        ar = pd.read_sql("SELECT vendor_id, first_year, y1_n, y1_mxn, days_to_threshold, y1_da_share, censored,"
                         " flag_10b FROM newtabs_arranque", conn)
        md = pd.read_sql("SELECT vendor_id, institution_id, contract_date, year, n, sum_mxn FROM newtabs_mismo_dia",
                         conn)
        pa = pd.read_sql("SELECT vendor_id, institution_id, n_years, first_year, last_year, money_mxn, noncomp_share,"
                         " frozen FROM newtabs_parejas WHERE frozen = 1", conn)
    elif db is not None:
        log.warning("newtabs tables missing -> running scripts/precompute_newtabs.py functions in memory")
        from scripts import precompute_newtabs as nt
        ar, _, md, _, pa, _ = nt.build(db.as_posix())
    else:
        log.warning("newtabs tables missing -> signals arranque/mismo_dia/pareja skipped")
        return {}
    return {"arranque": sig_arranque(ar), "mismo_dia": sig_mismo_dia(md, inst_name), "pareja": sig_pareja(pa, inst_name)}


# ---------------------------------------------------------------------------
# «Nuevos»
# ---------------------------------------------------------------------------

def build_nuevos(S: pd.DataFrame, K: pd.DataFrame, V: pd.DataFrame, known: set, eligible: set,
                 active_from: int = ACTIVE_FROM) -> pd.DataFrame:
    """Vendors with >= 2 distinct signals, NO ground-truth link of any kind (`known`), companies only
    (`eligible`), with a contract in `active_from` or later. Rank: n_signals desc, then money desc."""
    cnt = S.groupby("vendor_id").signal.agg(lambda s: sorted(set(s)))
    N = pd.DataFrame({"signals": cnt, "n_signals": cnt.map(len)})
    g = K[K.vendor_id.notna()].groupby("vendor_id")
    N["money_mxn"] = g.amount.sum().reindex(N.index).fillna(0.0)
    vl = pd.Series(pd.to_numeric(V.last_contract_date.astype("string").str[:4], errors="coerce").to_numpy(),
                   index=V.vendor_id.to_numpy())
    N["last_year"] = np.fmax(g.year.max().reindex(N.index).to_numpy(dtype=float),
                             vl.reindex(N.index).to_numpy(dtype=float))
    N = N[(N.n_signals >= 2) & (N.last_year >= active_from)]
    N = N[N.index.isin(list(eligible)) & ~N.index.isin(list(known))].rename_axis("vendor_id").reset_index()
    N = N.sort_values(["n_signals", "money_mxn"], ascending=[False, False]).reset_index(drop=True)
    N["rank"] = np.arange(1, len(N) + 1)
    N["novel"] = 1
    return N


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def compute(data: dict, newtabs: dict | None = None) -> tuple:
    K = clean(data["K"])
    V, I = data["V"], data["I"]
    inst_name = dict(zip(I.inst, I.siglas.fillna(I.name)))
    eligible = eligible_vendors(V, {_norm_name(n) for n in I.name.dropna()})
    frames = {
        "plazo_reducido": sig_plazo_reducido(K, inst_name),
        "urgencia": sig_urgencia(K, inst_name),
        "antes_del_fallo": sig_antes_del_fallo([tuple(r) for r in data["F"]]),
        "empresa_joven": sig_empresa_joven(K, V),
        "comprador_dominado": sig_comprador_dominado(K, inst_name),
    }
    frames.update(newtabs or {})
    parts = []
    for code, f in frames.items():
        f = f[f.vendor_id.isin(list(eligible))].copy()
        f["signal"] = code
        parts.append(f)
        log.info("%-20s vendors=%6d contracts=%8d money=%10.0f MDP", code, len(f), f.n_contracts.sum(),
                 f.money_mxn.sum() / 1e6)
    S = pd.concat(parts, ignore_index=True)
    S["vendor_id"] = S.vendor_id.astype(int)
    meta = data["meta"]
    known = set(meta["gt_vendor_ids"]) | set(meta["label_known"]) | set(meta["aria_known"])
    return S, build_nuevos(S, K, V, known, eligible)


def _jsonable(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return None if np.isnan(o) else float(o)
    if isinstance(o, np.bool_):
        return bool(o)
    if o is pd.NA:
        return None
    raise TypeError(type(o))


def _int(x):
    return None if pd.isna(x) else int(x)


def write(db: Path, S: pd.DataFrame, N: pd.DataFrame) -> None:
    conn = sqlite3.connect(str(db), timeout=120, isolation_level=None)
    conn.execute("PRAGMA busy_timeout = 120000")
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DROP TABLE IF EXISTS vendor_signals")
        conn.execute("""CREATE TABLE vendor_signals (vendor_id INTEGER NOT NULL, signal TEXT NOT NULL,
            n_contracts INTEGER, money_mxn REAL, first_year INTEGER, last_year INTEGER, detail_json TEXT,
            PRIMARY KEY (vendor_id, signal))""")
        conn.executemany("INSERT INTO vendor_signals VALUES (?,?,?,?,?,?,?)", [
            (int(r.vendor_id), r.signal, int(r.n_contracts), float(r.money_mxn), _int(r.first_year),
             _int(r.last_year), json.dumps(r.detail, ensure_ascii=False, default=_jsonable))
            for r in S.itertuples()])
        conn.execute("CREATE INDEX ix_vendor_signals_signal ON vendor_signals(signal)")
        conn.execute("DROP TABLE IF EXISTS aria_nuevos_signals")
        conn.execute("""CREATE TABLE aria_nuevos_signals (vendor_id INTEGER PRIMARY KEY, n_signals INTEGER,
            signals_json TEXT, money_mxn REAL, rank INTEGER, novel INTEGER DEFAULT 1)""")
        conn.executemany("INSERT INTO aria_nuevos_signals VALUES (?,?,?,?,?,?)", [
            (int(r.vendor_id), int(r.n_signals), json.dumps(list(r.signals)), float(r.money_mxn), int(r.rank), 1)
            for r in N.itertuples()])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    log.info("checkpoint(PASSIVE) %s", conn.execute("PRAGMA wal_checkpoint(PASSIVE)").fetchone())
    conn.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Senales nuevas: rule-based vendor signals + ARIA Nuevos")
    ap.add_argument("--db", type=Path, default=DB)
    ap.add_argument("--cache", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    data = load(a.db, a.cache)
    conn = sqlite3.connect(f"file:{a.db.as_posix()}?mode=ro", uri=True)
    newtabs = sig_from_newtabs(conn, dict(zip(data["I"].inst, data["I"].siglas.fillna(data["I"].name))), a.db)
    conn.close()
    S, N = compute(data, newtabs)
    log.info("vendor_signals rows=%d vendors=%d; nuevos=%d by n_signals %s", len(S), S.vendor_id.nunique(),
             len(N), N.n_signals.value_counts().sort_index().to_dict())
    log.info("source rows > 10B MXN (kept, flagged): %d", int((data["K"].amount.fillna(0) > FLAG_THRESHOLD).sum()))
    if not a.dry_run:
        write(a.db, S, N)


if __name__ == "__main__":
    main()
