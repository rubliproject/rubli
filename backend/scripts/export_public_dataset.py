"""
export_public_dataset.py — Build a PUBLIC, PII-scrubbed, identity-clean export
of the RUBLI dataset for open release.

Policy follows the rubli-open-release-audit (2026-06-30):
  * RFC RULE: every rfc / tax-id column is DROPPED wholesale (company and
    persona-fisica RFCs are mixed; individual RFCs are PII). Hashing is opt-in
    per column via the overrides file, never the default.
  * NAME RULE: in tables flagged with an `is_individual`-style column, the
    individual (persona fisica) display names are replaced with
    "PERSONA FISICA <n>"; company / juridical names are kept.
  * SENSITIVE TABLES (users, user_issues, every *_backup / _l*_ / temp) are
    dropped entirely by deny-first rules.
  * VERIFIED: after export, the output is scanned for author-identity markers
    and raw Mexican RFC patterns; any hit ABORTS (exit 1).

Outputs (under --out, default backend/dist_public/):
  RUBLI_PUBLIC.db        scrubbed SQLite (published tables only)
  csv/<table>.csv        one CSV per published table
  DATA_DICTIONARY.md     tables, row counts, per-column scrub notes
  MANIFEST.json          sha256 of every artifact + run metadata

Usage:
  python -m scripts.export_public_dataset --dry-run    # classify only, write nothing
  python -m scripts.export_public_dataset              # full export + verify

Reads the source DB; writes only under --out. Never mutates the source.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
import unicodedata
from datetime import datetime, timezone

# CSV cells can hold large JSON / free-text (risk_factors, memos, evidence).
# Raise the reader field-size limit so the leak scan can parse them; back off
# until it fits a C long (Windows sys.maxsize overflows the default int).
_csv_max = sys.maxsize
while True:
    try:
        csv.field_size_limit(_csv_max)
        break
    except OverflowError:
        _csv_max = int(_csv_max / 10)

# --- classification rules (deny-first) --------------------------------------

# Tables that must NEVER ship (case-insensitive regex over the table name).
DROP_TABLE_PATTERNS = [
    r"^_",  # leading underscore = internal (migration snapshots, temp, backups)
    r"^users$", r"^user$", r"^accounts?$", r"user_issues", r"sessions?",
    r"auth", r"login", r"(^|_)token(s)?$", r"password",
    r"_backup", r"^_l1b", r"^_l5_", r"^_l\d", r"_bak$", r"_old$",
    r"staging", r"_tmp$", r"^tmp_", r"_temp$", r"^temp_", r"scratch",
    # date-stamped rollback copies (e.g. aria_queue_pre_rerun_20261005 leaked into the 2026.10 build)
    r"_pre_rerun", r"_(19|20)\d{6}$",
    # model rollback copies (aria_queue_pre_b3b / _pre_v091 reached the 2026.11 dry run)
    r"_pre_(b3b|v\d+)$",
]

# Post-freeze supplier names read by OCR from award documents: a private individual there may not be
# in the vendor registry, so registry-based masking cannot catch them. Any value without a legal form
# or an institution word is replaced (over-masking some small firms is deliberate).
OCR_NAME_COLUMNS = {"gap_contracts": {"vendor"}, "gap_vendor_resolution": {"name", "raw"}}
OCR_NAME_MASK = "PROVEEDOR NO IDENTIFICADO (OCR)"
_OCR_KEEP_RE = re.compile(
    r"(SADECV|SAPI|SDERL|SRL|SAB|SPR|SCDE|SDE|SOCIEDAD|COOPERATIV|ASOCIACION|INSTITUTO|UNIVERSIDAD|FUNDACION|IAP|"
    r"PERSONAFISICA|GOBIERNO|SECRETARIA|MUNICIPIO|AYUNTAMIENTO|COMISION|HOSPITAL|TRIBUNAL|TESORERIA)|(SA|SC|AC|SACV|CV)$")


def ocr_name_ok(v) -> bool:
    """True when an OCR supplier name may ship as-is (has a legal form / institution word)."""
    if v is None:
        return True
    k = re.sub(r"[^A-Z]", "", str(v).upper().translate(str.maketrans("ÁÉÍÓÚÑ", "AEIOUN")))
    return bool(_OCR_KEEP_RE.search(k))

# Multi-word / unambiguous PII substrings. Bare "token"/"phone"/"email" are
# NOT here — they false-matched first_token / phonetic_tokens / phonetic_code.
DROP_COLUMN_SUBSTR = [
    "password", "user_agent", "persona_fisica", "secret", "celular",
    "telefono", "curp", "csrf", "ip_address", "client_ip",
    "auth_token", "access_token", "refresh_token", "session_token", "api_token",
]

# Whole "_"-delimited tokens that are PII (token-aware so "phone" never matches
# "phonetic" and "token" never matches "first_token").
DROP_COLUMN_TOKENS = {"email", "emails", "mail", "phone", "telephone"}

# Names that end in _rfc but are FLAGS, not RFC values — keep them.
KNOWN_RFC_FLAGS = {"sig_invalid_rfc"}


def _is_rfc_column(name: str) -> bool:
    n = name.lower()
    if n in KNOWN_RFC_FLAGS or "persona_fisica" in n:
        return False
    return n == "rfc" or n == "rfc_source" or n.endswith("_rfc")


# Author-identity markers that must not appear anywhere in the public output.
# Operator-specific markers (handle, home path, server IP) live in an untracked
# file so the public repo does not itself carry them: one marker per line in
# $RUBLI_IDENTITY_MARKERS_FILE or backend/scripts/.identity_markers (gitignored).
IDENTITY_MARKERS = ["@gmail.com", "rubli_jwt_secret"]
_markers_file = os.environ.get("RUBLI_IDENTITY_MARKERS_FILE",
                               os.path.join(os.path.dirname(os.path.abspath(__file__)), ".identity_markers"))
if os.path.exists(_markers_file):
    with open(_markers_file, encoding="utf-8") as _f:
        IDENTITY_MARKERS += [ln.strip() for ln in _f if ln.strip() and not ln.startswith("#")]

# Mexican RFC: persona moral (3) or fisica (4) initials + 6 date digits + 3 homoclave.
RFC_RE = re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b")
# Persona fisica RFC (13 chars, 4 initials) — the row-level individual signal.
PF_RFC_RE = re.compile(r"^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$")
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+", re.IGNORECASE)
# Local filesystem path (Windows drive or UNC) — ingestion artifacts that leak
# OS / drive / project name even when no listed marker is present. The
# lookbehind keeps URL schemes ("https://") from matching as a drive letter.
WIN_PATH_RE = re.compile(r"(?<![A-Za-z])[A-Za-z]:[\\/][^\s,;\"']*")
IPV4_RE = re.compile(r"(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])")
_IDENT_LOWER = [m.lower() for m in IDENTITY_MARKERS]

# Columns that hold a vendor / person display name (masked when the row is an
# individual). first_token / phonetic_* are name fragments of the same person.
NAME_COLUMNS = {
    "name", "name_normalized", "normalized_name", "base_name", "first_token",
    "phonetic_code", "phonetic_tokens", "company_name", "variant_name",
    "alias_name", "vendor", "vendor_name", "vendor_name_source", "canonical_name",
    "entity_name", "item_name", "razon_social",
    "proveedor",  # comprasmx_contracts: persona-física suppliers, rfc/flag dropped on export
}
# Columns that, for a persona fisica, encode the date of birth (the RFC date
# block is the birth date for individuals) — nulled on individual rows.
BIRTHDATE_COLUMNS = {"rfc_inc_year", "rfc_inc_date", "rfc_age_years", "rfc_date",
                     "vendor_incorp_year", "rfc_date_conflict"}
# Row-level "this is an individual" flags. vendors.is_individual is NOT used
# row-wise: it mislabels ~137 S.A./A.C. companies, so vendors rows are matched
# by id against the suffix-filtered individual set instead.
INDIVIDUAL_FLAG_COLUMNS = {"is_persona_fisica", "vendor_rfc_persona_fisica"}

# Legal-entity tokens: a name carrying one is a company, never masked by the
# RFC-shape rule (guards against a mis-shaped RFC hiding a company name).
CORP_TOKENS = {
    "SA", "CV", "SC", "AC", "RL", "SAPI", "SAS", "SPR", "SAB", "SCL", "IAP", "ABP",
    "SOCIEDAD", "INC", "LLC", "LTD", "GMBH", "CORP", "CORPORATION", "COMPANY",
    "ASOCIACION", "COOPERATIVA", "FUNDACION", "INSTITUTO", "UNIVERSIDAD", "GRUPO",
    "CONSTRUCTORA", "SERVICIOS", "COMERCIALIZADORA", "LABORATORIOS", "DISTRIBUIDORA",
}


_NAME_STOP = {"DE", "LA", "DEL", "LOS", "LAS", "Y", "E", "EL", "O"}
# Honorifics / labels that prefix a person's name; ignored when classifying.
_NAME_PREFIX = {"ING", "ARQ", "LIC", "DR", "DRA", "C", "CP", "MVZ", "QFB", "MTRO", "MTRA",
                "PROF", "SR", "SRA", "PERSONA", "FISICA", "FISICAS"}


def _name_tokens(s):
    s = unicodedata.normalize("NFKD", str(s).upper())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return [t for t in re.split(r"[^A-Z0-9Ñ]+", s) if t]


class PersonNameClassifier:
    """Is this vendor name a natural person's name, or a business / public body?

    vendors.is_individual is unreliable (it flags ~184K rows incl. hospitals,
    institutes, municipalities and generic phrases), so a name is only treated
    as personal when its vocabulary says so. Vocabulary is learned from the
    data itself: tokens of names carrying a persona-fisica RFC (verified
    people) vs. tokens of names with a legal suffix (companies) and of
    institution names (public bodies).
      * business token  : common in company/institution names, >=8x rarer in people's names
      * institution token: appears in >=3 institution names, never in a person's name
      * strong name token: in >=20 people's names and at least as common there as in companies
    See is_person for the decision rule."""

    def __init__(self, conn):
        pf, co, inst = {}, {}, {}
        npf = nco = 0
        for name, rfc, suf in conn.execute("SELECT name, rfc, legal_suffix FROM vendors"):
            if not name:
                continue
            ts = set(_name_tokens(name)) - _NAME_STOP
            if rfc and PF_RFC_RE.match(str(rfc).strip().upper()) and not suf:
                npf += 1
                for t in ts:
                    pf[t] = pf.get(t, 0) + 1
            elif suf:
                nco += 1
                for t in ts:
                    co[t] = co.get(t, 0) + 1
        for (n,) in conn.execute("SELECT name FROM institutions"):
            for t in set(_name_tokens(n or "")) - _NAME_STOP:
                inst[t] = inst.get(t, 0) + 1
        npf, nco = max(npf, 1), max(nco, 1)
        self.business, self.institution, self.strong = set(), set(), set()
        for t in set(co) | set(inst):
            p, q, i = pf.get(t, 0) / npf, co.get(t, 0) / nco, inst.get(t, 0)
            if (co.get(t, 0) >= 15 or i >= 3) and p < max(q, i / 5000) / 8:
                self.business.add(t)
            if i >= 3 and pf.get(t, 0) == 0:
                self.institution.add(t)
        for t, k in pf.items():
            if k >= 20 and k / npf >= co.get(t, 0) / nco:
                self.strong.add(t)
        self.business -= _NAME_PREFIX
        print(f"  name classifier: {npf:,} verified-person names; business={len(self.business):,} "
              f"institution={len(self.institution):,} strong-name={len(self.strong):,}")

    def is_person(self, name, flagged=False) -> bool:
        ts = [t for t in _name_tokens(name)
              if t not in _NAME_STOP and t not in _NAME_PREFIX and not t.isdigit()]
        if len(ts) < 2:
            return False
        strong = sum(t in self.strong for t in ts)
        inst = sum(t in self.institution for t in ts)
        # >=2 given-name/surname tokens = a person, even with a commercial name
        # attached ("ARACELI ALVAREZ OLVERA Y/O D&C") or a surname that is also
        # a place ("ESPINOSA", "GUADALAJARA"); 2+ institution words still veto
        # ("UNIVERSIDAD TECNOLOGICA EMILIANO ZAPATA").
        if strong >= 2 and inst <= 1:
            return True
        if any(t in self.business for t in ts) or re.search(r"\d", str(name)):
            return False
        # is_individual=1 is independent evidence: one place-like surname
        # ("VALENZUELA HERMOSILLO") does not veto it.
        if flagged:
            return inst == 0 or (inst == 1 and strong >= 1)
        return inst == 0


def _norm_name(v) -> str:
    return " ".join(str(v).upper().split())


def _is_corporate(name: str) -> bool:
    toks = set(re.sub(r"[.,]", "", name).split())
    return bool(toks & CORP_TOKENS)


class NameRedactor:
    """Replace any individual's name that appears INSIDE free text (contract
    titles, notes, JSON) with its surrogate. Only names of >=3 tokens are used
    in-text — 2-token names collide with ordinary phrases; they are still
    masked when they are a whole cell (exact-match map)."""

    def __init__(self, name_map, min_tokens=3, max_tokens=8):
        self.by_len = {}
        for k, label in name_map.items():
            n = len(k.split())
            if min_tokens <= n <= max_tokens:
                self.by_len.setdefault(n, {})[k] = label
        self.first = {k.split()[0] for d in self.by_len.values() for k in d}
        self.lens = sorted(self.by_len, reverse=True)

    def find(self, text):
        toks = text.upper().split()
        hits = []
        i = 0
        while i < len(toks):
            if toks[i] in self.first:
                for n in self.lens:
                    if i + n <= len(toks):
                        k = " ".join(toks[i:i + n])
                        lab = self.by_len[n].get(k)
                        if lab:
                            hits.append((k, lab))
                            i += n - 1
                            break
            i += 1
        return hits

    def sub(self, text):
        if not self.first:
            return text
        hits = self.find(text)
        for k, lab in hits:
            pat = r"\s+".join(re.escape(t) for t in k.split())
            text = re.sub(pat, lab, text, flags=re.IGNORECASE)
        return text


def _redact_text(v):
    """Scrub PII (RFC/email) AND author-identity markers (local paths, handle,
    IP, gmail) that live INSIDE a value — JSON blobs, ingestion source paths,
    free-text notes — which the column-name rules cannot see."""
    if "@" in v:
        v = EMAIL_RE.sub("[EMAIL]", v)
    if any(c.isdigit() for c in v):
        v = RFC_RE.sub("[RFC]", v)
        if v.count(".") >= 3:
            v = IPV4_RE.sub("[IP]", v)
    if ":\\" in v or ":/" in v:
        v = WIN_PATH_RE.sub("[PATH]", v)
    low = v.lower()
    if any(m in low for m in _IDENT_LOWER):
        for m in IDENTITY_MARKERS:
            v = re.sub(re.escape(m), "[REDACTED]", v, flags=re.IGNORECASE)
    return v


def classify_table(name: str, override) -> str:
    if isinstance(override, str) and override in ("publish", "publish_masked", "drop"):
        return override
    low = name.lower()
    for pat in DROP_TABLE_PATTERNS:
        if re.search(pat, low):
            return "drop"
    return "publish"


def classify_columns(cols, extra_drop, extra_hash, rfc_policy, mask_names, table=""):
    drop, hash_, keep = [], [], []
    for c in cols:
        low = c.lower()
        if low in mask_names:
            keep.append(c)  # explicit keep; conditionally masked at export time
            continue
        toks = set(low.split("_"))
        if (low in extra_drop or f"{table.lower()}.{low}" in extra_drop or any(s in low for s in DROP_COLUMN_SUBSTR)
                or (toks & DROP_COLUMN_TOKENS)):
            drop.append(c)
        elif _is_rfc_column(c):
            if rfc_policy == "hash" or low in extra_hash:
                hash_.append(c)
            else:
                drop.append(c)  # default: drop RFC wholesale (audit rule)
        elif low in extra_hash:
            hash_.append(c)
        else:
            keep.append(c)
    return drop, hash_, keep


# --- helpers ----------------------------------------------------------------

def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _hash_value(salt: bytes, value):
    if value is None:
        return None
    raw = salt + str(value).strip().upper().encode("utf-8", "ignore")
    return "rfc_" + hashlib.sha256(raw).hexdigest()[:16]


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_overrides(path):
    cfg = {}
    if path and os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    tov = dict(cfg.get("table_overrides") or {})
    edc = {c.lower() for c in (cfg.get("extra_drop_columns") or [])}
    ehc = {c.lower() for c in (cfg.get("extra_hash_columns") or [])}
    rfc_policy = (cfg.get("rfc_policy") or "drop").lower()
    indiv = cfg.get("individual_mask") or {}
    return tov, edc, ehc, rfc_policy, indiv, cfg


def list_tables(conn):
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    return [r[0] for r in rows]


def table_columns(conn, table):
    return [r[1] for r in conn.execute(f"PRAGMA table_info({_quote_ident(table)})")]


def quick_count(conn, table):
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {_quote_ident(table)}").fetchone()[0]
    except sqlite3.Error:
        return -1


# --- core -------------------------------------------------------------------

def _row_is_individual(rfc_vals, flag_vals):
    for v in rfc_vals:
        if v and PF_RFC_RE.match(str(v).strip().upper()):
            return True
    for v in flag_vals:
        if v in (1, "1", True, "fisica", "FISICA"):
            return True
    return False


def _signal_columns(cols):
    low = [c.lower() for c in cols]
    rfc_i = [i for i, c in enumerate(cols) if _is_rfc_column(c)]
    flag_i = [i for i, c in enumerate(low) if c in INDIVIDUAL_FLAG_COLUMNS or c == "rfc_entity_type"]
    return rfc_i, flag_i


def build_individual_name_map(conn, plan):
    """Map every individual's (persona fisica) name -> a stable surrogate, applied
    to EVERY string cell (whole-cell and in-text) so the name is masked wherever
    it appears (denormalized vendor_name copies, case names, notes).

    A vendor (without a legal suffix) is an individual when it has a
    persona-fisica-shaped RFC, is_individual=1, or a person-classified name
    with >=2 strong given-name/surname tokens; all of these are masked on
    their own rows (ind_ids). Only names that PersonNameClassifier confirms as
    a person's enter the global whole-cell / in-text map — vendors.is_individual
    also flags hospitals, institutes and generic phrases, which must not be
    masked inside other tables' text.
    Rows of other tables with a persona-fisica RFC or flag add their names too
    (e.g. sanctioned individuals in sfp_sanctions, which have no vendors row).
    Returns (name_map, ind_vendor_ids).
    """
    clf = PersonNameClassifier(conn)
    m, ids = {}, set()
    for vid, rfc, suf, flag, *names in conn.execute(
            "SELECT id, rfc, legal_suffix, is_individual, name, name_normalized, "
            "normalized_name, base_name FROM vendors"):
        if suf:
            continue
        nm = names[0] or next((n for n in names if n), "")
        pf_rfc = bool(rfc and PF_RFC_RE.match(str(rfc).strip().upper()))
        person = bool(nm) and clf.is_person(nm, flagged=(flag == 1))
        strong = sum(t in clf.strong for t in _name_tokens(nm)) if nm else 0
        # ponytail: flagged-but-business-looking vendors (~11K, mostly mislabelled
        # companies, ~5% rare/foreign person names) are masked on their own rows
        # rather than risk a leak; only classifier-confirmed names go global.
        if not (pf_rfc or flag == 1 or (person and strong >= 2)):
            continue
        ids.add(vid)
        if person:
            for v in names:
                if v and str(v).strip():
                    m.setdefault(_norm_name(v), f"PERSONA FISICA {vid}")
    n_extra = 0
    for p in plan:
        if p["action"] == "drop" or p["table"] == "vendors":
            continue
        cols = p["all_columns"]
        rfc_i, flag_i = _signal_columns(cols)
        name_i = [i for i, c in enumerate(cols) if c.lower() in NAME_COLUMNS]
        if not name_i or not (rfc_i or flag_i):
            continue
        k = len(rfc_i) + len(flag_i)
        sel = ", ".join(_quote_ident(cols[i]) for i in rfc_i + flag_i + name_i)
        for row in conn.execute(f"SELECT {sel} FROM {_quote_ident(p['table'])}"):
            if not _row_is_individual(row[:len(rfc_i)], row[len(rfc_i):k]):
                continue
            for v in row[k:]:
                if v and str(v).strip():
                    key = _norm_name(v)
                    if key not in m and not _is_corporate(key) and clf.is_person(key):
                        n_extra += 1
                        m[key] = f"PERSONA FISICA X{n_extra}"
    print(f"  individual names: {len(m):,} ({n_extra:,} from RFC-shape/flags outside vendors); "
          f"individual vendor ids: {len(ids):,}")
    return m, ids


def build_plan(conn, overrides, extra_drop, extra_hash, rfc_policy, indiv):
    plan = []
    for t in list_tables(conn):
        action = classify_table(t, overrides.get(t))
        cols = table_columns(conn, t)
        mi = indiv.get(t)
        mask_names = {n.lower() for n in (mi.get("name_columns") if mi else [])}
        drop, hash_, keep = classify_columns(cols, extra_drop, extra_hash, rfc_policy, mask_names, t)
        plan.append({
            "table": t,
            "action": action,
            "rows": quick_count(conn, t),
            "all_columns": cols,
            "drop_columns": drop,
            "hash_columns": hash_,
            "keep_columns": keep,
            "mask_individual": indiv.get(t),  # {flag_column, name_columns} | None
        })
    return plan


def print_dry_run(plan, row_filters):
    pub = [p for p in plan if p["action"] != "drop"]
    drp = [p for p in plan if p["action"] == "drop"]
    print(f"\n=== CLASSIFICATION: {len(plan)} tables "
          f"({len(pub)} publish, {len(drp)} drop) ===\n")
    print("-- DROPPED (never shipped) --")
    for p in sorted(drp, key=lambda x: x["table"]):
        print(f"  DROP   {p['table']:<42} ({p['rows']:>10,} rows)")
    print("\n-- PUBLISHED (scrubbed) --")
    for p in sorted(pub, key=lambda x: x["table"]):
        notes = []
        if p["drop_columns"]:
            notes.append("drop[" + ",".join(p["drop_columns"]) + "]")
        if p["hash_columns"]:
            notes.append("hash[" + ",".join(p["hash_columns"]) + "]")
        if p["table"] in row_filters:
            notes.append("where[" + row_filters[p["table"]] + "]")
        note = ("  " + " ".join(notes)) if notes else ""
        print(f"  PUB    {p['table']:<42} ({p['rows']:>10,} rows){note}")


def _cast(v, typ):
    """TEXT-typed numbers in the source (gap_contracts) -> REAL / INTEGER."""
    if v is None or not isinstance(v, str):
        return v
    v = v.strip()
    if not v:
        return None
    try:
        f = float(v)
    except ValueError:
        return v
    return int(f) if typ == "INTEGER" and f.is_integer() else f


def export(conn, plan, out_dir, indiv_map, ind_ids, row_filters, csv_tables, strict_text_tables,
           only_tables=None, cast_columns=None):
    os.makedirs(out_dir, exist_ok=True)
    csv_dir = os.path.join(out_dir, "csv")
    os.makedirs(csv_dir, exist_ok=True)
    pub_db_path = os.path.join(out_dir, "RUBLI_PUBLIC.db")
    if os.path.exists(pub_db_path) and not only_tables:
        os.remove(pub_db_path)
    salt = secrets.token_bytes(32)  # discarded at exit -> hashes not reversible
    redactor = NameRedactor(indiv_map)
    strict_redactor = NameRedactor(indiv_map, min_tokens=2)

    out = sqlite3.connect(pub_db_path)
    out.execute("PRAGMA journal_mode=OFF")
    out.execute("PRAGMA synchronous=OFF")
    dictionary, masked_cells = [], {}
    for p in plan:
        if p["action"] == "drop" or (only_tables and p["table"] not in only_tables):
            continue
        t = p["table"]
        ship_cols = p["keep_columns"] + p["hash_columns"]
        if not ship_cols:
            continue
        out.execute(f"DROP TABLE IF EXISTS {_quote_ident(t)}")  # --tables refresh
        print(f"  exporting {t} ({p['rows']:,} rows)...", flush=True)
        red = strict_redactor if t in strict_text_tables else redactor
        all_cols = p["all_columns"]
        low = [c.lower() for c in all_cols]
        src_idx = [all_cols.index(c) for c in ship_cols]
        hash_pos = set(range(len(p["keep_columns"]), len(ship_cols)))
        rfc_i, flag_i = _signal_columns(all_cols)
        vid_i = low.index("vendor_id") if "vendor_id" in low else (
            low.index("id") if t == "vendors" else None)
        # positions (in ship_cols) to mask / null on an individual's row
        name_pos = [j for j, c in enumerate(ship_cols) if c.lower() in NAME_COLUMNS]
        bday_pos = [j for j, c in enumerate(ship_cols) if c.lower() in BIRTHDATE_COLUMNS]
        ocr_pos = [j for j, c in enumerate(ship_cols) if c.lower() in OCR_NAME_COLUMNS.get(t, ())]

        casts = (cast_columns or {}).get(t, {})
        cast_pos = [(j, casts[c]) for j, c in enumerate(ship_cols) if c in casts]
        col_defs = ", ".join(_quote_ident(c) + (f" {casts[c]}" if c in casts else "") for c in ship_cols)
        out.execute(f"CREATE TABLE {_quote_ident(t)} ({col_defs})")
        ins = f"INSERT INTO {_quote_ident(t)} VALUES ({', '.join('?' for _ in ship_cols)})"
        where = f" WHERE {row_filters[t]}" if t in row_filters else ""
        cur = conn.execute(
            f"SELECT {', '.join(_quote_ident(c) for c in all_cols)} FROM {_quote_ident(t)}{where}")

        fcsv = writer = None
        if t in csv_tables:
            fcsv = open(os.path.join(csv_dir, f"{t}.csv"), "w", newline="", encoding="utf-8")
            writer = csv.writer(fcsv)
            writer.writerow(ship_cols)
        n, batch = 0, []
        for src in cur:
            row = [src[i] for i in src_idx]
            for i, v in enumerate(row):
                if isinstance(v, str) and v:
                    hit = indiv_map.get(_norm_name(v))
                    if hit:
                        row[i] = hit
                    else:
                        v = _redact_text(v)
                        if len(v) > 8:
                            v = red.sub(v)
                        row[i] = v
            vid = src[vid_i] if vid_i is not None else None
            if (vid in ind_ids) or _row_is_individual(
                    [src[i] for i in rfc_i], [src[i] for i in flag_i]):
                label = f"PERSONA FISICA {vid}" if vid in ind_ids else "PERSONA FISICA"
                for j in name_pos:
                    if row[j] is not None and not str(row[j]).startswith("PERSONA FISICA"):
                        row[j] = label
                        key = f"{t}.{ship_cols[j]}"
                        masked_cells[key] = masked_cells.get(key, 0) + 1
                for j in bday_pos:
                    row[j] = None
            for j in ocr_pos:
                if not ocr_name_ok(row[j]):
                    row[j] = OCR_NAME_MASK
            for j in hash_pos:
                row[j] = _hash_value(salt, row[j])
            for j, typ in cast_pos:
                row[j] = _cast(row[j], typ)
            batch.append(row)
            if writer:
                writer.writerow(row)
            if len(batch) >= 5000:
                out.executemany(ins, batch)
                batch.clear()
            n += 1
        if batch:
            out.executemany(ins, batch)
        if fcsv:
            fcsv.close()
        out.commit()
        dictionary.append((t, n, p["keep_columns"], p["hash_columns"], p["drop_columns"],
                           bool(p["mask_individual"])))
    out.commit()
    out.close()
    print("  row-level individual masks beyond the exact-name map (table.column: cells):")
    for key, k in sorted(masked_cells.items()):
        print(f"    {key}: {k:,}")
    return pub_db_path, csv_dir, dictionary


def build_lite(out_dir, lite_tables, max_bytes=500 * 1024 * 1024):
    """Journalist tier: a subset of the already-scrubbed full DB."""
    full = os.path.join(out_dir, "RUBLI_PUBLIC.db")
    lite = os.path.join(out_dir, "RUBLI_PUBLIC_lite.db")
    if os.path.exists(lite):
        os.remove(lite)
    c = sqlite3.connect(lite)
    c.execute("ATTACH DATABASE ? AS f", (full,))
    have = {r[0] for r in c.execute("SELECT name FROM f.sqlite_master WHERE type='table'")}
    shipped = [t for t in lite_tables if t in have]
    for t in shipped:
        c.execute(f"CREATE TABLE {_quote_ident(t)} AS SELECT * FROM f.{_quote_ident(t)}")
    c.commit()
    c.execute("DETACH DATABASE f")
    c.execute("VACUUM")
    c.close()
    size = os.path.getsize(lite)
    print(f"  lite: {len(shipped)} tables, {size / 1e6:,.0f} MB")
    if size > max_bytes:
        raise SystemExit(f"lite DB {size:,} bytes exceeds the {max_bytes:,}-byte journalist-tier cap")
    return lite


def _scan_value(val, real_names, redactor):
    """Return a leak label for one output cell, or None."""
    low = val.lower()
    for m in _IDENT_LOWER:
        if m in low:
            return f"IDENTITY MARKER '{m}'"
    if any(ch.isdigit() for ch in val):
        if not val.startswith("rfc_") and RFC_RE.search(val):
            return "RAW RFC"
        if val.count(".") >= 3 and IPV4_RE.search(val):
            return "IPV4"
    if "@" in val and EMAIL_RE.search(val):
        return "EMAIL"
    if (":\\" in val or ":/" in val) and WIN_PATH_RE.search(val):
        return "LOCAL PATH"
    if _norm_name(val) in real_names:
        return "PERSONA FISICA NAME (whole cell)"
    if len(val) > 8 and redactor.find(val):
        return "PERSONA FISICA NAME (in text)"
    return None


def verify_output(out_dir, indiv_map, strict_text_tables=(), only_tables=None):
    """Scan EVERY string cell of the published DB and every CSV for identity
    markers, raw RFCs, emails, local paths, IPv4, and real individual names
    (whole-cell and in-text). Returns a list of leak descriptions."""
    leaks = []
    real_names = set(indiv_map)
    redactor = NameRedactor(indiv_map)
    strict_redactor = NameRedactor(indiv_map, min_tokens=2)
    path = os.path.abspath(os.path.join(out_dir, "RUBLI_PUBLIC.db")).replace(os.sep, "/")
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    for (t,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall():
        if only_tables and t not in only_tables:
            continue
        cols = [r[1] for r in db.execute(f"PRAGMA table_info({_quote_ident(t)})")]
        print(f"  scanning {t} ...", flush=True)
        red = strict_redactor if t in strict_text_tables else redactor
        sel = ", ".join(_quote_ident(c) for c in cols)
        for rowid, *vals in db.execute(f"SELECT rowid, {sel} FROM {_quote_ident(t)}"):
            for c, v in zip(cols, vals):
                if isinstance(v, str) and v:
                    lab = _scan_value(v, real_names, red)
                    if lab:
                        leaks.append(f"{t}.{c} rowid={rowid}: {lab}")
    db.close()
    csv_dir = os.path.join(out_dir, "csv")
    for fn in sorted(os.listdir(csv_dir)) if os.path.isdir(csv_dir) else []:
        if only_tables and fn[:-4] not in only_tables:
            continue
        with open(os.path.join(csv_dir, fn), "r", encoding="utf-8", newline="") as f:
            rdr = csv.reader(f)
            next(rdr, None)
            for lineno, fields in enumerate(rdr, start=2):
                for v in fields:
                    if v:
                        lab = _scan_value(v, real_names, redactor)
                        if lab:
                            leaks.append(f"csv/{fn}:{lineno}: {lab}")
    return leaks


def write_dictionary(out_dir, descriptions):
    """Per-table, per-column dictionary of the PUBLISHED DB (types + null share
    measured on the output, descriptions from the curated descriptions file)."""
    path_db = os.path.abspath(os.path.join(out_dir, "RUBLI_PUBLIC.db")).replace(os.sep, "/")
    lite_path = os.path.join(out_dir, "RUBLI_PUBLIC_lite.db")
    lite = set()
    if os.path.exists(lite_path):
        lc = sqlite3.connect(lite_path)
        lite = {r[0] for r in lc.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        lc.close()
    db = sqlite3.connect(f"file:{path_db}?mode=ro", uri=True)
    tdesc = descriptions.get("tables", {})
    cdesc = descriptions.get("columns", {})
    tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    counts = {t: db.execute(f"SELECT COUNT(*) FROM {_quote_ident(t)}").fetchone()[0] for t in tables}
    lines = [
        "# RUBLI Public Dataset — Data Dictionary",
        "",
        "Generated from the published `RUBLI_PUBLIC.db` (not the internal source).",
        "Null % and inferred type are measured on the published rows. "
        "**Lite** = table also ships in `RUBLI_PUBLIC_lite.db`.",
        "",
        "Privacy conventions used everywhere: RFC (tax-ID) columns are removed; an",
        "individual's (persona física) name is replaced by `PERSONA FISICA <vendor_id>`",
        "(or `PERSONA FISICA X<n>` / `PERSONA FISICA` when no vendor id exists); RFC-derived",
        "dates are NULL on individual rows (the RFC date block is a birth date); emails,",
        "RFCs, IPs and local paths found inside text are replaced by `[EMAIL]`, `[RFC]`,",
        "`[IP]`, `[PATH]`.",
        "",
        "## Tables",
        "",
        "| Table | Rows | Lite | Description |",
        "|---|---:|:---:|---|",
    ]
    for t in tables:
        lines.append(f"| [`{t}`](#{t}) | {counts[t]:,} | {'yes' if t in lite else ''} | {tdesc.get(t, '')} |")
    for t in tables:
        info = db.execute(f"PRAGMA table_info({_quote_ident(t)})").fetchall()
        cols = [r[1] for r in info]
        n = counts[t]
        nulls, types = {}, {}
        if n:
            exprs = ", ".join(f"SUM({_quote_ident(c)} IS NULL), "
                              f"(SELECT typeof({_quote_ident(c)}) FROM {_quote_ident(t)} "
                              f"WHERE {_quote_ident(c)} IS NOT NULL LIMIT 1)" for c in cols)
            res = db.execute(f"SELECT {exprs} FROM {_quote_ident(t)}").fetchone()
            for i, c in enumerate(cols):
                nulls[c] = (res[2 * i] or 0) / n
                types[c] = res[2 * i + 1] or "null"
        lines += ["", f"### {t}", "", tdesc.get(t, ""), "",
                  f"Rows: {n:,}", "", "| Column | Type | Null % | Description |", "|---|---|---:|---|"]
        for c in cols:
            d = cdesc.get(f"{t}.{c}") or cdesc.get(c, "")
            lines.append(f"| `{c}` | {types.get(c, '')} | {nulls.get(c, 0) * 100:.1f} | {d} |")
    db.close()
    path = os.path.join(out_dir, "DATA_DICTIONARY.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return path


def write_manifest(out_dir, source, plan, verified, row_counts, scan_scope="all tables"):
    artifacts = {}
    for root, _, files in os.walk(out_dir):
        for fn in files:
            if fn == "MANIFEST.json":
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, out_dir).replace(os.sep, "/")
            artifacts[rel] = {"sha256": _sha256_file(full), "bytes": os.path.getsize(full)}
    manifest = {
        "dataset": "RUBLI — Mexican Federal Procurement Dataset (2002-2026)",
        "version": "2026.11",
        # CompraNet to 2025-09-28, then ComprasMX open data; last ComprasMX publication date
        "data_cut": "2026-10-17",
        "license": "CC-BY-NC-4.0",  # owner 2026-10-28; releases up to 2026.11 went out as CC BY 4.0
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "source": os.path.basename(source),
        "policy": ("RFC columns dropped; individual names masked in every cell (exact and in-text); "
                   "RFC-derived dates nulled on individual rows; content-redacted; "
                   "internal/workspace/backup tables excluded"),
        "published_tables": {t: row_counts[t] for t in sorted(row_counts)},
        "dropped_tables": sorted(p["table"] for p in plan if p["action"] == "drop"),
        "leak_scan_passed": verified,
        "leak_scan_scope": scan_scope,
        "artifacts": artifacts,
    }
    path = os.path.join(out_dir, "MANIFEST.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    return path


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    backend = os.path.dirname(here)
    ap.add_argument("--source", default=os.path.join(backend, "RUBLI_NORMALIZED.db"))
    ap.add_argument("--out", default=os.path.join(backend, "dist_public"))
    ap.add_argument("--overrides", default=os.path.join(here, "public_dataset_config.json"))
    ap.add_argument("--descriptions", default=os.path.join(here, "public_dataset_descriptions.json"))
    ap.add_argument("--tables", help="comma list: re-export only these tables into an existing --out "
                    "(then lite, leak scan, dictionary and manifest are rebuilt in full)")
    ap.add_argument("--dry-run", action="store_true", help="classify only; write nothing")
    ap.add_argument("--verify-only", action="store_true",
                    help="skip export; re-scan existing --out and write dictionary/manifest")
    args = ap.parse_args()

    if not os.path.exists(args.source):
        print(f"ERROR: source DB not found: {args.source}", file=sys.stderr)
        return 2

    overrides, extra_drop, extra_hash, rfc_policy, indiv, cfg = load_overrides(args.overrides)
    row_filters = cfg.get("row_filters") or {}
    csv_tables = set(cfg.get("csv_tables") or [])
    lite_tables = cfg.get("lite_tables") or []
    # Curated-text tables (case names, notes) get 2-token in-text name masking.
    strict_text_tables = set(cfg.get("strict_text_tables") or [])

    # Read-only: the exporter must never be able to write the source DB.
    src_uri = "file:" + os.path.abspath(args.source).replace(os.sep, "/") + "?mode=ro"
    conn = sqlite3.connect(src_uri, uri=True)
    conn.text_factory = lambda b: b.decode("utf-8", "ignore")
    plan = build_plan(conn, overrides, extra_drop, extra_hash, rfc_policy, indiv)

    if args.dry_run:
        print_dry_run(plan, row_filters)
        print(f"\n[dry-run] rfc_policy={rfc_policy}; no files written. Overrides: {args.overrides}")
        conn.close()
        return 0

    print_dry_run(plan, row_filters)
    indiv_map, ind_ids = build_individual_name_map(conn, plan)
    if not args.verify_only:
        print(f"Exporting -> {args.out}  (rfc_policy={rfc_policy})")
        only = set(args.tables.split(",")) if args.tables else None
        export(conn, plan, args.out, indiv_map, ind_ids, row_filters, csv_tables, strict_text_tables, only,
               cfg.get("cast_columns"))
        build_lite(args.out, lite_tables)
    conn.close()

    print("Verifying output: identity markers / RFC / email / path / IPv4 / individual names ...")
    # --tables: the untouched tables were scanned by the full run; scan the refreshed ones.
    only = set(args.tables.split(",")) if args.tables else None
    leaks = verify_output(args.out, indiv_map, strict_text_tables, only)
    with open(os.path.join(args.out, "..", "leak_scan.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(leaks) + "\n")
    descriptions = {}
    if os.path.exists(args.descriptions):  # read late: may be edited during a long run
        with open(args.descriptions, "r", encoding="utf-8") as f:
            descriptions = json.load(f)
    write_dictionary(args.out, descriptions)
    out_db = sqlite3.connect(os.path.join(args.out, "RUBLI_PUBLIC.db"))
    row_counts = {t: out_db.execute(f"SELECT COUNT(*) FROM {_quote_ident(t)}").fetchone()[0]
                  for (t,) in out_db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    out_db.close()
    scope = ("refreshed tables " + ", ".join(sorted(only)) + "; all other tables by the preceding full run"
             if only else "all tables")
    prev = os.path.join(args.out, "MANIFEST.json")
    if only and os.path.exists(prev):
        with open(prev, encoding="utf-8") as f:
            pm = json.load(f)
        if not pm.get("leak_scan_passed"):
            leaks.append("preceding full-run leak scan did not pass")
        scope = pm.get("leak_scan_scope_history", [pm.get("leak_scan_scope", "all tables")]) + [scope]
    write_manifest(args.out, args.source, plan, not leaks, row_counts, scope)

    if leaks:
        print(f"\n!! LEAK SCAN FAILED — {len(leaks)} issue(s). Output NOT safe to publish "
              f"(full list: leak_scan.txt next to --out):", file=sys.stderr)
        for lk in leaks[:60]:
            print(f"   {lk}", file=sys.stderr)
        return 1
    print(f"\nOK — {len(row_counts)} tables exported, leak scan clean.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
