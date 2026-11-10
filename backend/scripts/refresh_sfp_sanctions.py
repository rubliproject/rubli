"""Refresh `sfp_sanctions` with 2019-2026 federal debarments from the Diario Oficial de la Federación.

Why: the SFP «Directorio de Proveedores y Contratistas Sancionados» CSV feed (last row Jan 2021,
loaded from backend/data/proveedores_sancionados.csv) is gone — datosabiertos.funcionpublica.gob.mx
no longer resolves, datos.gob.mx carries no proveedores dataset for SABG (only public servants),
and directoriosancionados.buengobierno.gob.mx drops non-Mexican connections. Every debarment
(inhabilitación) is by law published in the DOF as a «Circular por la que se comunica ... que
deberán abstenerse de aceptar propuestas o celebrar contratos con la empresa / persona física X».
The DOF's public JSON service (SIDOF, robots-allowed) lists each day's notes and serves each note:
    https://sidof.segob.gob.mx/dof/sidof/notas/DD-MM-YYYY        (day index → titles)
    https://sidof.segob.gob.mx/dof/sidof/notas/nota/<codNota>    (note body → plazo, multa)
Fines WITHOUT debarment are not published there — a known gap (docs/SFP_REFRESH_2026-11-04.md).

The table is rebuilt by scripts.load_sfp_sanctions.save_to_db (legacy CSV + DOF rows, same schema,
ISO dates, end = start + plazo). Personas físicas: name kept as published, is_persona_fisica = 1,
RFC never stored (company RFCs only).

Usage (from backend/):
    python -m scripts.refresh_sfp_sanctions fetch --start 2019-01-01 --cache D:/Python/_sfp/dof
    python -m scripts.refresh_sfp_sanctions fetch-notes --cache D:/Python/_sfp/dof
    python -m scripts.refresh_sfp_sanctions apply --cache D:/Python/_sfp/dof            # dry run
    python -m scripts.refresh_sfp_sanctions apply --cache D:/Python/_sfp/dof --write    # backup + rebuild
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import logging
import re
import sqlite3
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.persona_fisica import classify_persona_fisica, rfc_shape  # noqa: E402
from api.sanctions import normalize_name  # noqa: E402
from scripts.load_sfp_sanctions import add_months, load_from_file, parse_plazo_months, save_to_db  # noqa: E402

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

BACKEND = Path(__file__).resolve().parent.parent
DB_PATH = BACKEND / "RUBLI_NORMALIZED.db"
LEGACY_CSV = BACKEND / "data" / "proveedores_sancionados.csv"
SIDOF = "https://sidof.segob.gob.mx/dof/sidof/notas/{}"
SIDOF_NOTE = "https://sidof.segob.gob.mx/dof/sidof/notas/nota/{}"
NOTE_URL = "https://www.dof.gob.mx/nota_detalle.php?codigo={}&fecha={}"
UA = "RUBLI-research/1.0 (open procurement analysis; +https://rubli.xyz)"
MAX_AMOUNT = 100_000_000_000  # data-validation rule: > 100B MXN is a parse error, drop it

ABSTAIN = re.compile(r"abstenerse\s+de\s+aceptar\s+propuestas", re.I)
LIFT = re.compile(r"sin\s+efectos?|nulidad|sentencia|ejecutoria", re.I)
# Lift / annulment circulars name the firm as «impuesta a la empresa X, para …» — no «con».
LIFT_SUBJECT = re.compile(
    r"(?<![A-Za-z])(?:a|al)\s+(?:la\s+)?(?:empresa|licitante|proveedor[a]?|contratista|persona\s+moral|moral|"
    r"persona\s+f[ií]sica(?:\s+con\s+actividad\s+empresarial)?(?:\s+(?:el|la)\s+C\.)?|C\.)\s+"
    r"(.+?)(?:,\s+(?=(?-i:[a-záéíóú]))|\s+(?=(?:para|mediante|por|en|dictad[ao]|publicad[ao])\s)|$)", re.I | re.S)
# Subject follows «con (la empresa|el licitante|la persona física ...|el C.)» in the title.
SUBJECT = re.compile(
    r"(?:(?<![A-Za-z])con|contratos\s+al?)\s+(?:las?\s+empresas?|licitante|proveedor|contratista|(?:el|los)\s+licitantes?|(?:el|los)\s+proveedor(?:es)?|la\s+proveedora|"
    r"(?:el|los)\s+contratistas?|la\s+(?:persona\s+)?moral|las\s+personas\s+morales|"
    r"la\s+persona\s+jur[ií]dic[oa]\s+colectiva|"
    r"la\s+persona\s+f[ií]sica(?:\s+con\s+actividad\s+empresarial)?(?:\s+(?:el|la)\s+C\.|\s+(?:el|la)\s+ciudadan[oa])?|"
    r"el\s+ciudadano|la\s+ciudadana|el\s+C\.|la\s+C\.)\s+(.+)$", re.I | re.S)
# no label at all: «... celebrar contratos con Grupo Inetsa, S.A. de C.V.»
FALLBACK = re.compile(r"contratos\s+con\s+(?:(?:el|la)\s+)?([A-ZÁÉÍÓÚÑ0-9].+)$", re.S)
PF_PHRASE = re.compile(r"persona\s+f[ií]sica|(?<![A-Za-z])C\.|ciudadan[oa]", re.I)
# «X, S.A. de C.V. y la persona física que la representó el ciudadano Y, incluso cuando …»
JOIN = re.compile(r",?\s+(?:y(?:/o)?|así\s+como)\s+(?:a\s+)?(?:la|el|su|sus)\s+", re.I)
# second company after a legal suffix: «X, S.A. de C.V. y Y, S. de R.L. de C.V.»
CO_JOIN = re.compile(r"(?<=C\.V\.|R\.L\.|S\.A\.|S\.C\.|A\.C\.)\s*,?\s+y\s+(?=[A-ZÁÉÍÓÚÑ0-9])")
PERSON_TAIL = re.compile(r"(?:ciudadan[oa]|C\.)\s+(.+)$", re.I)
LEAD = re.compile(r"^(?:(?:con\s+)?(?:raz[oó]n\s+social|denominad[ao])\s+)+", re.I)
RFC_IN = re.compile(r",?\s+(?:con\s+)?(?:R\.?\s?F\.?\s?C\.?|Registro\s+Federal\s+de\s+Contribuyentes)[:\s]*([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})\.?", re.I)
TRAIL = re.compile(r"[,;]?\s+(?:incluso|por\s+(?:conducto|haber)|en\s+virtud|quien(?:es)?)(?![A-Za-z]).*$", re.I)


# ── parse ─────────────────────────────────────────────────────────────────────
def subjects_of(title: str) -> list[tuple[str, bool, str | None]]:
    """[(name, is_persona_fisica_by_phrase, rfc_in_title)] named in a DOF circular title — the
    sanctioned party first, then any representative person named alongside it."""
    t = " ".join(title.split())
    m = SUBJECT.search(t) or FALLBACK.search(t)
    if not m:
        return []
    label = m.group(0)[: len(m.group(0)) - len(m.group(1))]
    tail = m.group(1)
    rm = RFC_IN.search(tail)
    rfc = rm.group(1).upper() if rm else None
    tail = TRAIL.sub("", RFC_IN.sub("", tail))
    parts = JOIN.split(tail)
    pf_label = bool(PF_PHRASE.search(label))
    out = [(clean(n), pf_label, rfc) for n in CO_JOIN.split(LEAD.sub("", parts[0]))]
    for p in parts[1:]:
        pm = PERSON_TAIL.search(p)
        if pm:
            out.append((clean(pm.group(1)), True, None))
    return [o for o in out if o[0]]


def clean(name: str) -> str:
    """Trim the sentence's final period but keep an abbreviation's («S.A. de C.V.»)."""
    n = re.sub(r"\s*\((?:expediente|exp\.)[^)]*\)", "", " ".join(name.split()), flags=re.I).strip(" ,;")
    n = re.sub(r"^(?:(?:el|la)\s+)?C\.\s+|,?\s+persona\s+f[ií]sica\.?$", "", n, flags=re.I).strip(" ,;")
    if n.endswith(".") and "." not in n[:-1].split(" ")[-1]:
        n = n[:-1]
    return n.strip(" ,;")


# ── fetch ─────────────────────────────────────────────────────────────────────
def fetch(start: date, end: date, cache: Path, delay: float = 1.0) -> int:
    """Cache one JSON per DOF day. Polite: 1 request/s, skips days already cached."""
    cache.mkdir(parents=True, exist_ok=True)
    n = 0
    d = start
    while d <= end:
        out = cache / f"{d.isoformat()}.json"
        if not out.exists():
            url = SIDOF.format(d.strftime("%d-%m-%Y"))
            for attempt in range(3):
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": UA})
                    with urllib.request.urlopen(req, timeout=60) as r:
                        body = r.read()
                    json.loads(body)  # validate before caching
                    out.write_bytes(body)
                    n += 1
                    break
                except Exception as e:  # network blip → back off, retry, then log and move on
                    logger.warning("%s attempt %d: %s", d, attempt + 1, e)
                    time.sleep(5 * (attempt + 1))
            time.sleep(delay)
        d += timedelta(days=1)
    logger.info("fetched %d new days into %s", n, cache)
    return n



def _get_json(url: str) -> bytes | None:
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            json.loads(body)  # validate before caching
            return body
        except Exception as e:  # network blip → back off, retry, then give up on this one
            logger.warning("%s attempt %d: %s", url, attempt + 1, e)
            time.sleep(5 * (attempt + 1))
    return None


def iter_circulars(cache: Path):
    """(day_iso, note, kind) for every debarment ('ban') or lift/annulment ('lift') circular."""
    for f in sorted(cache.glob("????-??-??.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        for k in ("NotasMatutinas", "NotasVespertinas", "NotasExtraordinarias"):
            for n in d.get(k) or []:
                t = " ".join((n.get("titulo") or "").split())
                if ABSTAIN.search(t):
                    yield f.stem, n, ("lift" if re.search(r"sin\s+efecto", t, re.I) else "ban")
                elif t.lower().startswith("circular") and LIFT.search(t) and LIFT_SUBJECT.search(t):
                    yield f.stem, n, "lift"


def fetch_notes(cache: Path, delay: float = 1.0) -> int:
    """Cache the body of every circular found in the day indexes (notes/<codNota>.json)."""
    notes = cache / "notes"
    notes.mkdir(exist_ok=True)
    n = 0
    for _, note, kind in iter_circulars(cache):
        if kind != "ban":
            continue
        out = notes / f"{note['codNota']}.json"
        if out.exists():
            continue
        body = _get_json(SIDOF_NOTE.format(note["codNota"]))
        if body:
            out.write_bytes(body)
            n += 1
        time.sleep(delay)
    logger.info("fetched %d new note bodies", n)
    return n


# ── body fields ───────────────────────────────────────────────────────────────
PLAZO = re.compile(r"por\s+(?:el|un)\s+(?:plazo|t[ée]rmino|periodo)\s+de\s+([^.;,]{3,60}?(?:a[ñn]os?|mes(?:es)?))", re.I)
MULTA = re.compile(r"multa[^$]{0,200}?\$\s?([\d,]+(?:\.\d{1,2})?)", re.I)
EXPEDIENTE = re.compile(r"expediente(?:\s+(?:de\s+sanci[oó]n|administrativo))?(?:\s+n[uú]mero)?[:\s]+([A-Z0-9][A-Z0-9/._-]{4,40})", re.I)
OIC = re.compile(r"([ÓO]rgano\s+Interno\s+de\s+Control\s+en\s+[^.]{3,120}?|Unidad\s+de\s+Responsabilidades\s+en\s+[^.]{3,120}?)(?:\.-|\.\s|,\s+[ÁA]rea)", re.I)


def body_text(note_json: Path) -> str:
    if not note_json.exists():
        return ""
    n = json.loads(note_json.read_text(encoding="utf-8")).get("Nota") or {}
    t = re.sub(r"<style.*?</style>", " ", n.get("cadenaContenido") or "", flags=re.S | re.I)
    return html.unescape(" ".join(re.sub(r"<[^>]+>", " ", t).split()))


def body_fields(text: str) -> dict:
    out = {"plazo_text": None, "plazo_months": None, "amount_mxn": None, "expediente": None, "oic": None}
    if m := PLAZO.search(text):
        out["plazo_text"] = " ".join(m.group(1).split())
        out["plazo_months"] = parse_plazo_months(re.sub(r"\(.*?\)", "", out["plazo_text"]))
    if m := MULTA.search(text):
        try:
            v = float(m.group(1).replace(",", ""))
            out["amount_mxn"] = v if 0 < v <= MAX_AMOUNT else None
        except ValueError:
            pass
    if m := EXPEDIENTE.search(text):
        out["expediente"] = m.group(1).rstrip(".,")
    if m := OIC.search(text):
        out["oic"] = " ".join(m.group(1).split())
    return out


# ── rows ──────────────────────────────────────────────────────────────────────
def is_pf(name: str, by_phrase: bool, rfc: str | None = None) -> bool:
    return by_phrase or rfc_shape(rfc) == "person" or classify_persona_fisica(name)


def parse_dof(cache: Path) -> tuple[list[dict], list[dict]]:
    """→ (debarment rows, lift rows) from the cached day indexes (+ bodies when cached)."""
    rows, lifts = [], []
    for day, n, kind in iter_circulars(cache):
        t = " ".join((n.get("titulo") or "").split())
        if kind == "lift" and not ABSTAIN.search(t):
            for m in LIFT_SUBJECT.finditer(t):
                lifts.append({"company_name": clean(m.group(1)), "sanction_start": day, "codNota": n["codNota"]})
            continue
        subs = subjects_of(t)
        if not subs:
            logger.warning("no subject parsed: %s %s", n.get("codNota"), t[-160:])
            continue
        b = body_fields(body_text(cache / "notes" / f"{n['codNota']}.json"))
        # the ban runs from the day after publication
        start = (date.fromisoformat(day) + timedelta(days=1)).isoformat()
        for name, by_phrase, rfc in subs:
            pf = is_pf(name, by_phrase, rfc)
            rec = {
                "rfc": None if pf else rfc,  # company RFCs only — a persona física RFC is never kept
                "company_name": name,
                "is_persona_fisica": int(pf),
                "sanction_type": "INHABILITACIÓN (CIRCULAR DOF)",
                "sanction_start": start,
                "sanction_end": add_months(start, b["plazo_months"]) if b["plazo_months"] else None,
                "resolution_date": None,
                "plazo_text": b["plazo_text"],
                "plazo_months": b["plazo_months"],
                "expediente": b["expediente"],
                "amount_mxn": b["amount_mxn"],
                "authority": b["oic"] or n.get("codOrgaDos"),
                "source_url": NOTE_URL.format(n["codNota"], (n.get("fecha") or "").replace("-", "/")),
            }
            (lifts if kind == "lift" else rows).append(rec)
    return rows, lifts


def drop_lifted(rows: list[dict], lifts: list[dict]) -> list[dict]:
    """Remove a debarment when a LATER «sin efectos» circular names the same subject."""
    last = {}
    for r in lifts:
        k = normalize_name(r["company_name"])
        last[k] = max(last.get(k, ""), r["sanction_start"])
    return [r for r in rows
            if not (r.get("sanction_start") and last.get(normalize_name(r["company_name"]), "") >= r["sanction_start"])]


def drop_overlap(legacy: list[dict], dof: list[dict], days: int = 180) -> list[dict]:
    """DOF rows already in the 2021 archive (same normalized name, notification ≤ `days` before)."""
    seen: dict[str, list[date]] = {}
    for r in legacy:
        if r.get("sanction_start"):
            seen.setdefault(normalize_name(r["company_name"]), []).append(date.fromisoformat(r["sanction_start"]))
    out = []
    for r in dof:
        pub = date.fromisoformat(r["sanction_start"])
        if not any(0 <= (pub - d).days <= days for d in seen.get(normalize_name(r["company_name"]), [])):
            out.append(r)
    return out


def build(cache: Path, legacy_csv: Path) -> tuple[list[dict], dict]:
    rows, lifts = parse_dof(cache)
    kept = drop_lifted(rows, lifts)
    legacy = load_from_file(str(legacy_csv)) if legacy_csv.exists() else []
    for r in legacy:  # the archive has no RFC column; label personas físicas by name
        r["is_persona_fisica"] = int(is_pf(r["company_name"], False, r.get("rfc")))
        if r["is_persona_fisica"]:
            r["rfc"] = None
    new = drop_overlap(legacy, kept)
    legacy_kept = drop_lifted(legacy, lifts)  # a 2019+ lift can annul an archive-era ban too
    stats = {"dof_circular_rows": len(rows), "dof_lift_rows": len(lifts),
             "dof_after_lifts": len(kept), "dof_new_vs_archive": len(new), "archive_rows": len(legacy),
             "archive_lifted": len(legacy) - len(legacy_kept)}
    return legacy_kept + new, stats


# ── apply ─────────────────────────────────────────────────────────────────────
def backup_table(db: Path) -> str | None:
    conn = sqlite3.connect(str(db), timeout=60)
    try:
        if not conn.execute("SELECT 1 FROM sqlite_master WHERE name='sfp_sanctions'").fetchone():
            return None
        bak = f"_sfp_sanctions_backup_{datetime.now():%Y%m%d_%H%M%S_%f}"  # generated, not input
        conn.execute(f"CREATE TABLE {bak} AS SELECT * FROM sfp_sanctions")
        conn.commit()
        return bak
    finally:
        conn.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--start", default="2019-01-01")
    f.add_argument("--end", default=date.today().isoformat())
    f.add_argument("--cache", required=True)
    f.add_argument("--delay", type=float, default=1.0)
    fn = sub.add_parser("fetch-notes")
    fn.add_argument("--cache", required=True)
    fn.add_argument("--delay", type=float, default=1.0)
    a = sub.add_parser("apply")
    a.add_argument("--cache", required=True)
    a.add_argument("--legacy", default=str(LEGACY_CSV), help="2021 SFP archive CSV")
    a.add_argument("--db", default=str(DB_PATH))
    a.add_argument("--write", action="store_true", help="back up + rebuild the table (default: dry run)")
    a.add_argument("--dump", help="write the rows to this CSV for review")
    args = ap.parse_args()

    if args.cmd == "fetch":
        fetch(date.fromisoformat(args.start), date.fromisoformat(args.end), Path(args.cache), args.delay)
        return
    if args.cmd == "fetch-notes":
        fetch_notes(Path(args.cache), args.delay)
        return
    rows, stats = build(Path(args.cache), Path(args.legacy))
    stats["total_rows"] = len(rows)
    stats["persona_fisica_rows"] = sum(r["is_persona_fisica"] for r in rows)
    stats["persona_fisica_with_rfc"] = sum(1 for r in rows if r["is_persona_fisica"] and r.get("rfc"))
    assert stats["persona_fisica_with_rfc"] == 0
    if args.dump:
        with open(args.dump, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0]), extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
    if args.write:
        stats["backup_table"] = backup_table(Path(args.db))
        stats["written"] = save_to_db(rows, Path(args.db))
    print(json.dumps(stats, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
