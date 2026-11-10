"""Public labeling guard (docs/PREPUB_AUDIT_2026-09-24.md § P1 B3/B4/B5).

The live site must not tag a real company or person as an offender without
evidence. Three rules, one module, every router routes through it:

  B3  GT membership. A vendor is "documented in a corruption case" only through
      a link that is not a false positive, not a `scandal_actor` fuzzy match,
      confidence high/confirmed_corrupt, and sourced (source_asf/news/legal
      filled, or case_origin official_record/media_report/audit_report).
      Other non-FP links are an "unverified lead" (neutral). FP and
      scandal_actor links are never shown.
  B4  ARIA pattern labels are suppressed for GT false positives, public
      entities, and personas físicas; P7 (= "is in GT") is only shown when
      the vendor is documented.
  B5  Contract amounts: > 10B is flagged for review (data-validation rule);
      a vendor-relative isolated spike is flagged `suspect_decimal` and kept
      out of capture/leader rankings.

Everything is computed from the DB read-only and cached; no table is written.
"""
from __future__ import annotations

import json
import re
import sqlite3
import statistics
from typing import Iterable, Optional

from .cache import app_cache
from .persona_fisica import rfc_shape

_CACHE = "public_labels"
_TTL = 3600

# ---------------------------------------------------------------------------
# B3 — ground-truth links
# ---------------------------------------------------------------------------

#: Link is safe to show at all (aliases: gtv = ground_truth_vendors).
PUBLIC_LINK_SQL = (
    "(COALESCE(gtv.is_false_positive, 0) = 0"
    " AND COALESCE(gtv.match_method, '') <> 'scandal_actor')"
)

#: Link may be called "documented" (aliases: gtv, gtc = ground_truth_cases).
DOCUMENTED_LINK_SQL = (
    "(" + PUBLIC_LINK_SQL[1:-1] +
    " AND gtc.confidence_level IN ('high', 'confirmed_corrupt')"
    " AND gtc.provenance_tier IN ('A', 'B')"
    " AND (TRIM(COALESCE(gtc.source_asf, '')) <> ''"
    "   OR TRIM(COALESCE(gtc.source_news, '')) <> ''"
    "   OR TRIM(COALESCE(gtc.source_legal, '')) <> ''"
    "   OR gtc.case_origin IN ('official_record', 'media_report', 'audit_report'))"
    # A case whose public scandal rows were ALL unpublished (weekend #10 fact-check,
    # is_verified = 0) no longer documents anyone. Cases with no scandal row, or with
    # at least one published row, are unaffected.
    " AND gtc.id NOT IN (SELECT ground_truth_case_id FROM procurement_scandals"
    "   WHERE ground_truth_case_id IS NOT NULL"
    "   GROUP BY ground_truth_case_id HAVING MAX(is_verified) = 0))"
)

# ---------------------------------------------------------------------------
# B4 — public entities (government bodies, public universities, state firms)
# ---------------------------------------------------------------------------

# Names arrive with mojibake (ó → U+FFFD), so accents are matched with `.`
# after every non-ASCII char is folded to '.'. Anchored at the start of the
# name so private firms that merely mention "GOBIERNO" are not caught.
_PUBLIC_ENTITY = re.compile(
    r"^(LA |EL |H\.? )?("
    r"SECRETAR.A (DE|DEL) |GOBIERNO (DEL?|DE LA) |PODER (JUDICIAL|LEGISLATIVO|EJECUTIVO)"
    r"|UNIVERSIDAD (AUT.NOMA|NACIONAL|TECNOL.GICA|POLIT.CNICA|PEDAG.GICA|VERACRUZANA"
    r"|MICHOACANA|JU.REZ|INTERCULTURAL|DE [A-Z]+$|DE GUADALAJARA|DE SONORA|DE GUANAJUATO"
    r"|DE COLIMA|DE QUINTANA)"
    r"|INSTITUTO (POLIT.CNICO NACIONAL|NACIONAL|MEXICANO DEL (SEGURO|PETR.LEO|TRANSPORTE)"
    r"|DE SEGURIDAD Y SERVICIOS|POTOSINO DE INVESTIGACI|TECNOL.GICO (SUPERIOR )?DE )"
    r"|TECNOL.GICO NACIONAL|COMISI.N (FEDERAL DE ELECTRICIDAD|NACIONAL|ESTATAL|DEL AGUA)"
    r"|CFE |PETR.LEOS MEXICANOS|PEMEX|CASA DE MONEDA|COLEGIO DE POSTGRADUADOS|EL COLEGIO DE "
    r"|CENTRO DE INVESTIGACI.N (Y DOCENCIA|CIENT.FICA|EN ALIMENTACI|Y ESTUDIOS|EN MATEM"
    r"|Y DE ESTUDIOS AVANZADOS)|CINVESTAV|INFOTEC|AYUNTAMIENTO|MUNICIPIO DE"
    r"|TELECOMUNICACIONES DE M.XICO|DICONSA|LICONSA|BIRMEX|LABORATORIOS DE BIOL.GICOS Y REACTIVOS"
    r"|SISTEMA (PARA EL|ESTATAL|MUNICIPAL) (DESARROLLO INTEGRAL|DIF)|SERVICIO POSTAL MEXICANO"
    r"|CORREOS DE M.XICO|FERROCARRIL DEL ISTMO|AEROPUERTOS Y SERVICIOS AUXILIARES"
    r"|BANCO NACIONAL DE OBRAS|NACIONAL FINANCIERA|POLIC.A (AUXILIAR|BANCAR.A|FEDERAL)"
    r"|FISCAL.A GENERAL|ADMINISTRACI.N PORTUARIA INTEGRAL|ASIPONA|TALLERES GR.FICOS DE M.XICO"
    r"|IMPRESORA Y ENCUADERNADORA PROGRESO|LOTER.A NACIONAL|PRON.STICOS PARA LA ASISTENCIA"
    r"|SERVICIO DE (ADMINISTRACI.N Y ENAJENACI.N|PROTECCI.N FEDERAL)|GUARDIA NACIONAL"
    r"|SERVICIOS DE SALUD DE|SOCIEDAD HIPOTECARIA FEDERAL)"
)


def _norm_name(name: Optional[str]) -> str:
    s = re.sub(r"[^\x00-\x7f]", ".", (name or "").upper())
    return re.sub(r"\s+", " ", s).strip()


def is_public_entity(name: Optional[str], institution_names: Iterable[str] = ()) -> bool:
    """Name matches a public-body pattern, or equals a buyer institution's name."""
    n = _norm_name(name)
    return bool(n) and (bool(_PUBLIC_ENTITY.search(n)) or n in institution_names)


def is_persona_fisica(is_individual, rfc: Optional[str]) -> bool:
    """The one persona-física rule (docs/LEGAL_RESEARCH_PERSONAS_FISICAS_2026-10-30.md): a well-formed
    RFC decides — 13 chars = person, 12 = company, whatever vendors.is_individual says (1,443 companies
    locally / 841 on prod, e.g. SIEMENS HEALTHCARE DIAGNOSTICS, carry is_individual=1). No usable RFC → the stored flag, or
    any 13-char string (conservative). SQL twin: pf_sql()."""
    shape = rfc_shape(rfc)
    if shape:
        return shape == "person"
    return bool(is_individual) or len((rfc or "").strip()) == 13


_L, _D, _X = "[A-Z&Ñ]", "[0-9]", "[A-Z0-9]"
_RFC_NORM = "UPPER(REPLACE(REPLACE(TRIM(COALESCE({p}rfc, '')), ' ', ''), '-', ''))"


def pf_sql(p: str = "") -> str:
    """is_persona_fisica() as a SQL expression over {p}is_individual / {p}rfc (p = table alias + '.').
    ponytail: SQLite UPPER/TRIM are ASCII/space-only, so a lowercase «ñ» or tab-padded RFC falls to
    the stored-flag branch; Python normalises those — the parity test pins the real shapes."""
    r = _RFC_NORM.format(p=p)
    return (f"(CASE WHEN {r} GLOB '{_L * 4}{_D * 6}{_X * 3}' THEN 1"
            f" WHEN {r} GLOB '{_L * 3}{_D * 6}{_X * 3}' THEN 0"
            f" ELSE ({p}is_individual = 1 OR length(TRIM(COALESCE({p}rfc, ''))) = 13) END)")


#: Legal-entity markers, matched only as whole tokens (2026-10-29: the unbounded pattern read «SA» in
#: ESPINOSA, «AC» in ACOSTA, «CO» in FRANCISCO, so real people lost the persona física label).
_B, _E = r"(?<![A-Z0-9Ñ])", r"(?![A-Z0-9Ñ])"
_COMPANY_MARK = re.compile(
    _B + r"(S\.?\s?A\.?\s?P\.?\s?I\.?|S\.?\s?A\.?\s?B\.?|S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|S\.?\s?DE\s+R\.?\s?L\.?|S\.?\s?C\.?|A\.?\s?C\.?"
    r"|S\.?\s?R\.?\s?L\.?|C\.?\s?V\.?|INC|LLC|L\.L\.C|LTD|LIMITED|CORP|CORPORATION|GMBH|AG|B\.?V|N\.?V|PLC|SPA"
    r"|CORPORATIVO|CORPORACI(O|Ó)N|GRUPO|COMERCIALIZADORA|DISTRIBUIDORA|CONSTRUCTORA|SERVICIOS|INDUSTRIAS|LABORATORIOS)" + _E
    + r"|(&\s*|" + _B + r")CO\.?\s*$|" + _B + r"CO\.|" + _B + r"CO," + r"|" + _B + r"DE\s+M(E|É|.)XICO\W*$",
    re.IGNORECASE)


def looks_like_company(name: Optional[str]) -> bool:
    """A whole-token legal-entity mark, or the persona_fisica name model at its company gate (p >= 0.99,
    100 % hold-out precision; catches suffix-less firms such as NALCO DE MEXICO). The model never vetoes
    an explicit mark: it scored «MACHADO GARCIA-SERRA LLC.» as a person."""
    if not name:
        return False
    if _COMPANY_MARK.search(name):
        return True
    try:
        from .persona_fisica import _model, company_prob
        return company_prob(name) >= _model()["t_company"]
    except (OSError, ValueError, KeyError):  # weights missing/corrupt -> regex alone
        return False


def is_named_persona(is_individual, rfc: Optional[str], name: Optional[str]) -> bool:
    """The persona física label as ARIA applies it (label_sets()["pf"]): is_persona_fisica, and the name
    model only where no RFC decides (a 13-char RFC is a person whatever the name). With no RFC and no
    is_individual flag, a name the model reads as a person (company_prob < 0.5, as categories.persona_flag)
    is labelled too: «NORMA ALICIA RIOS GUTIERREZ/ SERVICIOS ENSENADA» must never show unlabelled
    (security review 11-05; ~83K no-RFC vendors carry is_individual 0/NULL)."""
    shape = rfc_shape(rfc)
    if shape:
        return shape == "person"
    if is_persona_fisica(is_individual, rfc):
        return not looks_like_company(name)
    if not name:
        return False
    try:
        from .persona_fisica import company_prob
        return company_prob(name) < 0.5
    except (OSError, ValueError, KeyError):  # weights missing/corrupt -> the stored flag alone
        return False


_RFC_TOKEN = re.compile(r"(?<![A-Z0-9])[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}(?![A-Z0-9])")
#: CURP: 4 letters, birth date, sex H/M (X = non-binary since 2022), state, 3 consonants, homoclave + digit
_CURP_TOKEN = re.compile(r"(?<![A-Z0-9])[A-ZÑ]{4}\d{6}[HMX][A-ZÑ]{5}[A-Z0-9]\d(?![A-Z0-9])")


def clean_name(name: Optional[str]) -> Optional[str]:
    """Some CompraNet vendor names are (or embed) the RFC or the CURP itself — such names are never shipped."""
    if not isinstance(name, str):
        return None
    u = name.upper()
    return None if _RFC_TOKEN.search(u) or _CURP_TOKEN.search(u) else name


def public_vendor_name(name: Optional[str], is_individual=None, rfc: Optional[str] = None) -> tuple[Optional[str], bool]:
    """The one gate for a vendor name leaving the API → (name, persona_fisica).

    Owner policy 2026-10-29 (.claude/rules/security.md): a persona física's NAME, as CompraNet publishes it,
    may show, always labelled «persona física» — so callers ship the flag beside the name. An RFC-shaped name
    never ships (clean_name). `rfc` only decides the label; it never leaves this function."""
    return clean_name(name), is_named_persona(is_individual, rfc, name)


#: Public names for the ARIA pattern codes — signals, not offences.
#: P2 is a missing-RFC heuristic, P4 is built on co-award (not co-bid) data,
#: P6 is a single-buyer count ratio, P7 only means "linked to a GT case".
PATTERN_LABELS: dict[str, tuple[str, str]] = {
    "P1": ("Large share of its sector", "Peso en su sector"),
    "P2": ("Low-footprint supplier (no RFC)", "Proveedor de baja huella (sin RFC)"),
    "P3": ("Intermediary", "Intermediario"),
    "P4": ("Co-award pattern", "Patrón de coadjudicación"),
    "P5": ("Amount out of range", "Monto fuera de rango"),
    "P6": ("Single-buyer dependence", "Dependencia de un solo comprador"),
    "P7": ("Linked to a documented case", "Vinculado a un caso documentado"),
}


# ---------------------------------------------------------------------------
# Cached vendor sets
# ---------------------------------------------------------------------------

def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def _aria_run_key(conn: sqlite3.Connection) -> Optional[tuple]:
    """(id, status, completed_at) of the newest ARIA run: a new run rewrites aria_queue, so the sets go stale."""
    if not _table_exists(conn, "aria_runs"):
        return None
    r = conn.execute("SELECT id, status, completed_at FROM aria_runs ORDER BY started_at DESC LIMIT 1").fetchone()
    return tuple(r) if r else None


def label_sets(conn: sqlite3.Connection) -> dict:
    """{documented, leads, fp: set[int], suppressed: {vendor_id: (pattern, reason)}}.

    Cached per ARIA run (not only by TTL): a set built from the previous run's queue made
    /aria/stats print P7 = -30 on prod (2026-11-05)."""
    run = _aria_run_key(conn)
    cached = app_cache.get(_CACHE, "sets")
    if cached is not None and cached.get("run") == run:
        return cached

    documented: set[int] = set()
    leads: set[int] = set()
    fp: set[int] = set()
    if _table_exists(conn, "ground_truth_vendors") and _table_exists(conn, "ground_truth_cases"):
        for vid, is_doc, is_pub in conn.execute(
            f"""SELECT gtv.vendor_id, {DOCUMENTED_LINK_SQL}, {PUBLIC_LINK_SQL}
                FROM ground_truth_vendors gtv
                LEFT JOIN ground_truth_cases gtc ON gtc.id = gtv.case_id
                WHERE gtv.vendor_id IS NOT NULL"""
        ):
            if is_doc:
                documented.add(vid)
            elif is_pub:
                leads.add(vid)
            else:
                fp.add(vid)
    leads -= documented
    fp -= documented | leads

    suppressed: dict[int, tuple[str, str]] = {}
    if _table_exists(conn, "aria_queue"):
        inst = {_norm_name(r[0]) for r in conn.execute("SELECT name FROM institutions")}
        for vid, pattern, name, is_ind, rfc in conn.execute(
            """SELECT q.vendor_id, q.primary_pattern, v.name, v.is_individual, v.rfc
               FROM aria_queue q JOIN vendors v ON v.id = q.vendor_id
               WHERE q.primary_pattern IS NOT NULL"""
        ):
            if vid in fp:
                reason = "false_positive"
            elif is_public_entity(name, inst):
                reason = "public_entity"
            elif is_persona_fisica(is_ind, rfc):
                reason = "persona_fisica"
            elif pattern == "P7" and vid not in documented:
                reason = "unverified_case_link"
            else:
                continue
            suppressed[vid] = (pattern, reason)

    # every persona física in the queue: named in full (owner 2026-10-12 / 2026-10-29: transparency),
    # flagged so the UI can label them «persona física»
    pf: set[int] = set()
    if _table_exists(conn, "aria_queue"):
        # name model only where no RFC decides (a 13-char RFC is a person whatever the name); a company-shaped
        # RFC is never a person, so only those rows are skipped
        pf = {vid for vid, name, ind, rfc in conn.execute(
            f"""SELECT q.vendor_id, v.name, v.is_individual, v.rfc FROM aria_queue q JOIN vendors v ON v.id = q.vendor_id
               WHERE {pf_sql('v.')} OR {_RFC_NORM.format(p='v.')} NOT GLOB '{_L * 3}{_D * 6}{_X * 3}'""")
              if is_named_persona(ind, rfc, name)}
    result = {"documented": documented, "leads": leads, "fp": fp, "suppressed": suppressed, "pf": pf, "run": run}
    app_cache.set(_CACHE, "sets", result, maxsize=2, ttl=_TTL)
    return result


def suppressed_ids_json(conn: sqlite3.Connection) -> str:
    """JSON array for `vendor_id NOT IN (SELECT value FROM json_each(?))`."""
    return json.dumps(sorted(label_sets(conn)["suppressed"]))


#: Drop-in SQL guard for queries over aria_queue that bind suppressed_ids_json().
NOT_SUPPRESSED_SQL = "vendor_id NOT IN (SELECT value FROM json_each(?))"


def public_pattern_counts(conn: sqlite3.Connection, raw: dict) -> dict:
    """Subtract suppressed vendors from a {pattern: count} map read from aria_queue now.

    Each suppressed vendor is subtracted from the pattern it carries in the queue today, not the one it had
    when the sets were built; an unverified-P7 suppression only applies while the vendor is still P7."""
    sup = label_sets(conn)["suppressed"]
    out = dict(raw)
    if not sup or not _table_exists(conn, "aria_queue"):
        return out
    ids = json.dumps(sorted(sup))
    for vid, pattern in conn.execute(
        "SELECT vendor_id, primary_pattern FROM aria_queue "
        "WHERE primary_pattern IS NOT NULL AND vendor_id IN (SELECT value FROM json_each(?))", (ids,)
    ):
        if sup[vid][1] == "unverified_case_link" and pattern != "P7":
            continue
        if pattern in out:
            out[pattern] -= 1
    return out


#: Per-pattern scores that would restate a suppressed label.
_PATTERN_DETAIL_KEYS = ("pattern_confidence", "pattern_confidences", "ghost_score", "capture_score")


#: Internal reviewer verdicts in aria_queue.review_status. They are an analyst's
#: triage note, not a public finding.
CONFIRMED_STATUSES = ("confirmed", "confirmed_corrupt")


def public_review_status(raw: Optional[str], vendor_id, documented: set) -> Optional[str]:
    """'confirmed' is shown only for a documented vendor (DOCUMENTED_LINK_SQL:
    tier A/B, sourced, not a false positive); any other confirmed row reads 'reviewed'."""
    if raw in CONFIRMED_STATUSES and vendor_id not in documented:
        return "reviewed"
    return raw


def public_status_counts(conn: sqlite3.Connection, rows: Iterable[tuple]) -> dict:
    """{status: count} from (vendor_id, raw_status) pairs, after public_review_status."""
    documented = label_sets(conn)["documented"]
    out: dict = {}
    for vid, raw in rows:
        k = public_review_status(raw or "pending", vid, documented)
        out[k] = out.get(k, 0) + 1
    return out


def apply_public_labels(
    conn: sqlite3.Connection,
    rows: list[dict],
    *,
    vendor_key: str = "vendor_id",
    pattern_key: str = "primary_pattern",
    gt_keys: tuple[str, ...] = ("in_ground_truth", "is_gt", "gt_overlay"),
) -> list[dict]:
    """Rewrite serialized rows in place so they carry only public-safe labels.

    - `pattern_key` → None (+ `pattern_suppressed` reason) when suppressed.
    - each present `gt_keys` field → documented-case membership only; an
      unverified GT link is reported as `gt_lead` instead.
    - `vendor_name` → RFC-like names dropped; `persona_fisica` flags individuals (named in full).
    - `review_status` → public_review_status (no "confirmed" for undocumented vendors).
    """
    if not rows:
        return rows
    s = label_sets(conn)
    for d in rows:
        vid = d.get(vendor_key)
        if vid is None:
            continue
        if "vendor_name" in d:
            d["vendor_name"] = clean_name(d["vendor_name"])
            d["persona_fisica"] = vid in s["pf"]
        hit = s["suppressed"].get(vid)
        if hit and d.get(pattern_key):
            d[pattern_key] = None
            for k in _PATTERN_DETAIL_KEYS:
                if k in d:
                    d[k] = None
            d["pattern_suppressed"] = hit[1]
        if "review_status" in d:
            d["review_status"] = public_review_status(d["review_status"], vid, s["documented"])
        present = [k for k in gt_keys if k in d]
        if present:
            documented = vid in s["documented"]
            for k in present:
                d[k] = int(documented) if type(d[k]) is int else documented
            d["gt_lead"] = vid in s["leads"]
    return rows


def excluded_from_rankings(conn: sqlite3.Connection, vendor_id) -> bool:
    """Never shown as an offender in a leaderboard: GT false positives and
    personas físicas (is_persona_fisica)."""
    if vendor_id in label_sets(conn)["fp"]:
        return True
    row = conn.execute(
        "SELECT is_individual, rfc FROM vendors WHERE id = ?", (vendor_id,)
    ).fetchone()
    return row is not None and is_persona_fisica(row[0], row[1])


def ranking_safe(conn: sqlite3.Connection, rows: list[dict], **label_kw) -> list[dict]:
    """Drop rows that must not appear on a named "suspicious"/leader list
    (suppressed labels, GT FPs, personas físicas), then relabel the rest."""
    key = label_kw.get("vendor_key", "vendor_id")
    suppressed = label_sets(conn)["suppressed"]
    kept = [
        d for d in rows
        if d.get(key) not in suppressed and not excluded_from_rankings(conn, d.get(key))
    ]
    return apply_public_labels(conn, kept, **label_kw)


def label_persona_names(conn: sqlite3.Connection, rows: list[dict],
                        id_key: str = "vendor_id", name_key: str = "vendor_name") -> list[dict]:
    """Flag rows held by a persona física (`persona_fisica`) so the UI labels the name; the name stays
    (owner policy 2026-10-29) unless it is an RFC (clean_name). The RFC is read here, never returned."""
    ids = sorted({r.get(id_key) for r in rows if r.get(id_key) is not None})
    if not ids:
        return rows
    persons = {
        vid for vid, is_ind, rfc, name in conn.execute(
            f"SELECT id, is_individual, rfc, name FROM vendors WHERE id IN ({','.join('?' * len(ids))})", ids
        )
        if is_named_persona(is_ind, rfc, name)
    }
    return [{**r, name_key: clean_name(r.get(name_key)) or "", "persona_fisica": r.get(id_key) in persons}
            for r in rows]


# ---------------------------------------------------------------------------
# B5 — amount flags
# ---------------------------------------------------------------------------

REVIEW_THRESHOLD = 10_000_000_000   # .claude/rules/data-validation.md: > 10B → flag
SPIKE_FLOOR = 1_000_000_000         # only spikes above 1B matter for rankings
SPIKE_X_MEDIAN = 1000               # > 1000× the vendor's median contract
SPIKE_X_NEXT = 100                  # and > 100× its next-largest contract (isolated)


def vendor_suspect_contracts(conn: sqlite3.Connection, vendor_id) -> dict[int, dict]:
    """{contract_id: {...}} for this vendor's isolated spikes — the signature of
    a ×1000 decimal error (e.g. 2604968: 4.2B vs a 0.9M median, next 6.9M)."""
    key = f"spikes:{vendor_id}"
    cached = app_cache.get(_CACHE + "_spikes", key)
    if cached is not None:
        return cached
    rows = conn.execute(
        "SELECT id, amount_mxn, institution_id, contract_year FROM contracts"
        " WHERE vendor_id = ? AND amount_mxn > 0 ORDER BY amount_mxn DESC",
        (vendor_id,),
    ).fetchall()
    out: dict[int, dict] = {}
    if rows and rows[0][1] > SPIKE_FLOOR:
        med = statistics.median(r[1] for r in rows)
        for i, (cid, amt, inst, yr) in enumerate(rows):
            if amt <= SPIKE_FLOOR:
                break
            nxt = rows[i + 1][1] if i + 1 < len(rows) else 0
            if amt > SPIKE_X_MEDIAN * med and amt > SPIKE_X_NEXT * nxt:
                out[cid] = {
                    "vendor_id": vendor_id, "institution_id": inst, "contract_year": yr,
                    "amount_mxn": amt, "vendor_median": med, "next_largest": nxt,
                }
    app_cache.set(_CACHE + "_spikes", key, out, maxsize=4096, ttl=3600)  # not "sets"' 2-slot namespace
    return out


def suspect_decimal_contracts(conn: sqlite3.Connection) -> dict[int, dict]:
    """Full scan over every vendor with a > 1B contract (~500). For audits and
    scripts — request paths use vendor_suspect_contracts()."""
    out: dict[int, dict] = {}
    for (vid,) in conn.execute(
        "SELECT DISTINCT vendor_id FROM contracts WHERE amount_mxn > ? AND vendor_id IS NOT NULL",
        (SPIKE_FLOOR,),
    ).fetchall():
        out.update(vendor_suspect_contracts(conn, vid))
    return out


def amount_flag(conn: sqlite3.Connection, contract_id: int, amount, vendor_id) -> Optional[str]:
    """'suspect_decimal' | 'review' (> 10B) | None."""
    if amount is None or amount <= SPIKE_FLOOR:
        return None
    if vendor_id is not None and contract_id in vendor_suspect_contracts(conn, vendor_id):
        return "suspect_decimal"
    if amount > REVIEW_THRESHOLD:
        return "review"
    return None


def flagged_amounts(conn: sqlite3.Connection, where: str = "1=1", args: Iterable = ()) -> dict[int, tuple]:
    """{contract_id: (flag, vendor_id, institution_id, amount)} for the rows matching `where` (alias c, constant SQL)
    that amount_flag marks. A flagged amount stays listed («Revisar») but never makes a leader (AUDIT_DATA 11-07 A3)."""
    out: dict[int, tuple] = {}
    for cid, amt, vid, iid in conn.execute(
        f"SELECT c.id, c.amount_mxn, c.vendor_id, c.institution_id FROM contracts c WHERE ({where}) AND c.amount_mxn > ?",
        [*args, SPIKE_FLOOR],
    ).fetchall():
        f = amount_flag(conn, cid, amt, vid)
        if f:
            out[cid] = (f, vid, iid, amt)
    return out


def capture_pair_excluded(conn: sqlite3.Connection, vendor_id, institution_id) -> bool:
    """A capture/leader row is withheld when its vendor is excluded from
    rankings or its share rests on a suspect-decimal contract at that buyer."""
    if excluded_from_rankings(conn, vendor_id):
        return True
    return any(
        c["institution_id"] == institution_id
        for c in vendor_suspect_contracts(conn, vendor_id).values()
    )
