"""Contract titles ES -> EN with a local open-source MT model (docs/TITLE_TRANSLATION_2026-11-04.md).

    python -I backend/scripts/translate_titles.py --db backend/RUBLI_NORMALIZED.db            # dry run: counts + 20 samples
    python -I backend/scripts/translate_titles.py --db ... --out D:/Python/_mt/titles_en.sqlite --apply [--tier 3]

Model: Helsinki-NLP/opus-mt-es-en (Apache-2.0) converted to CTranslate2 int8, CPU only; no paid API.
Runs from the isolated venv D:/Python/_mt/venv (ctranslate2 + sentencepiece). The source DB is opened
READ-ONLY; output goes to its own sqlite table contract_title_en(title_hash PK ...) WITHOUT ROWID, never
to `contracts`. Resumable: titles already in the output are skipped. Priority tiers (site-visible first):
  1 category «p. ej.» examples (subcategory_stats.example_titles)
  2 ComprasMX titles (board feed / Lo más reciente; personas físicas skipped — their titles can carry the name)
  3 top 20,000 distinct titles by contract amount (<= 100B MXN)
  4 titles used by a 2023+ contract (newest first)
  5 everything else
Titles are keyed by sha1 of the exact stored text, so the API can look up title_en from c.title.
"""
import argparse
import hashlib
import heapq
import json
import re
import sqlite3
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

MAX_CONTRACT_VALUE = 100_000_000_000  # mirrors api.config.constants (script runs outside the backend venv)
MODEL_TAG = "opus-mt-es-en/ct2-int8"
DEFAULT_MODEL = "D:/Python/_mt/models/opus-mt-es-en-ct2"
DEFAULT_OUT = "D:/Python/_mt/titles_en.sqlite"
TOP_BY_AMOUNT = 20_000

DDL = """CREATE TABLE IF NOT EXISTS contract_title_en (
    title_hash TEXT PRIMARY KEY, title_es TEXT NOT NULL, title_en TEXT NOT NULL,
    model TEXT NOT NULL, created_at TEXT NOT NULL) WITHOUT ROWID"""

# Acronyms / units kept verbatim (casing restored after lowercasing ALL-CAPS titles). Extended at run
# time with institution siglas from the DB.
ACRONYMS = set("""IMSS ISSSTE PEMEX CFE SEDENA SEMAR SCT SICT SEP SSA SHCP SAT SFP ASF CONAGUA CONALEP
INE INAI IPN UNAM UAM CONACYT CONAHCYT SADER SAGARPA SEMARNAT SEDATU SEGOB SRE STPS SECTUR SENER
CAPUFE FONATUR BANCOMEXT BANJERCITO PRODECON CONDUSEF CNBV IFT COFECE BANOBRAS NAFIN BANSEFI LICONSA DICONSA SEGALMEX INSABI IMSS-BIENESTAR DIF
CENAPRECE CENSIDA COFEPRIS CRIT GN SSPC FGR PGR INEGI CONAPO INFONAVIT FOVISSSTE AICM ASA CINVESTAV
TIC TICS SAP ERP GPS LED UPS PC CPU USB VPN WAN LAN SAN CCTV HVAC GNL GLP UHF VHF RFID
CFDI IVA ISR MXN USD EUR KG KGS GR MG ML LT LTS MTS M2 M3 KM KW KVA MVA HP PZA PZAS PZ MCG
S.A. C.V. S.A.P.I. S.C. S.R.L. SAPI SRL""".split())
VOWELS = set("AEIOUÁÉÍÓÚÜaeiouáéíóúü")
TOKEN = re.compile(r"\S+")
# short quoted names in ALL-CAPS titles («"MIGUEL HIDALGO"») get Title Case so the model keeps them as names
QUOTED = re.compile(r'(["«“])([^"»”]{2,40}?)(["»”])')
# Abbreviations common in ALL-CAPS COMPRANET titles, expanded before MT («PROY EJEC EDIF» -> garbage otherwise).
ABBREV = {"adq": "adquisición", "adqu": "adquisición", "proy": "proyecto", "ejec": "ejecutivo", "edif": "edificio",
          "mtto": "mantenimiento", "mantto": "mantenimiento", "mto": "mantenimiento", "manto": "mantenimiento", "serv": "servicio", "servs": "servicios",
          "const": "construcción", "rehab": "rehabilitación", "sumin": "suministro", "equip": "equipo",
          "fed": "federales", "prev": "preventivo", "corr": "correctivo", "req": "requisición"}
LOWER_KEEP = {"de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "a", "en", "para", "por", "con", "sin", "al"}

# EN-side post-edit for recurring procurement terms the model gets wrong or renders unidiomatically.
GLOSSARY = [
    (r"\b[Aa]cquisition of\b", "Purchase of"),
    (r"\b[Pp]urchase of the purchase\b", "Purchase"),
    (r"\b[Dd]irect [Aa]djudication\b", "direct award"),
    (r"\b[Aa]djudication\b", "award"),
    (r"\b[Pp]ublic [Bb]idding\b", "public tender"),
    (r"\b[Bb]idding\b", "tender"),
    (r"\b[Ii]nvitation to at least three (persons|people)\b", "restricted invitation (3+ bidders)"),
    (r"\b[Dd]eparture\b", "line item"),
    (r"\b[Gg]ame (\d)", r"line item \1"),
    (r"\b[Ii]njectable solution\b", "solution for injection"),
    (r"\b[Ss]ubrogated services?\b", "outsourced (subrogated) services"),
    (r"\b[Tt]ablets?\b(?= of)", "tablets"),
    (r"\b[Pp]ieces?\b(?=\s*$)", "units"),
    (r"\b[Hh]ealing (materials?|supplies)\b", "medical and wound-care supplies"),
    (r"\b([Mm]aintenance) and maintenance\b", r"\1 and upkeep"),
    (r"\b[Mm]aintenance to\b", "Maintenance of"),
    (r"\btassels\b", "jugs"),
    (r"\b[Mm]ediatic\b", "media"),
    (r"\b[Ii]nflated wheat\b", "puffed wheat"),
    (r"^[Rr]ecruitment of (?!(staff|personnel|people))", "Contracting of "),
    (r"\b[Dd]eserted\b", "unawarded"),
    (r"\b[Rr]outine storage\b", "Routine upkeep"),
    (r"\bside rails\b", "side lanes"),
    (r"\b[Mm]anifestation of environmental impact\b", "Environmental impact statement"),
    (r"\boffice tools\b", "office supplies"),
    (r"\binformation consumables\b", "IT consumables"),
    (r"\s{2,}", " "),
]
GLOSSARY = [(re.compile(p), r) for p, r in GLOSSARY]


def title_hash(title: str) -> str:
    return hashlib.sha1(title.encode("utf-8")).hexdigest()


def _accent(word: str) -> str:
    # ALL-CAPS COMPRANET text often drops accents; Spanish -cion/-sion nouns always carry one.
    return re.sub(r"(c|s)ion(es)?\b", lambda m: m.group(1) + ("ión" if not m.group(2) else "iones"), word)


def normalize(title: str, acronyms=ACRONYMS):
    """Collapse whitespace; sentence-case ALL-CAPS text while keeping codes/units/acronyms verbatim,
    expanding common abbreviations and Title-Casing short quoted names.
    Returns (text_for_mt, protected_tokens)."""
    t = unicodedata.normalize("NFC", " ".join(title.split()))
    letters = [c for c in t if c.isalpha()]
    caps = bool(letters) and sum(c.isupper() for c in letters) / len(letters) > 0.7
    protected, out = [], []
    for tok in TOKEN.findall(t):
        core = tok.strip(".,;:()[]\"'«»“”")
        up = core.upper()
        is_code = any(ch.isdigit() for ch in core) or (len(core) >= 2 and core.isalpha() and not (set(core) & VOWELS))
        if core and (up in acronyms or (is_code and up == core)):
            protected.append(core)
            out.append(tok)
        elif caps:
            w, lw = tok.lower(), core.lower()
            if lw in ABBREV:
                w = w.replace(lw, ABBREV[lw], 1).replace(ABBREV[lw] + ".", ABBREV[lw], 1)
            out.append(_accent(w) if lw not in LOWER_KEEP else w)
        else:
            out.append(tok)
    s = " ".join(out)
    if caps and s:
        s = s[0].upper() + s[1:]
        s = QUOTED.sub(lambda m: m.group(1) + " ".join(
            w if w in LOWER_KEEP else w[:1].upper() + w[1:] for w in m.group(2).split(" ")) + m.group(3), s)
    return s, protected


def translate_all(tr, titles, acronyms=ACRONYMS):
    """normalize -> MT (beam 2) -> retry lost codes/acronyms at beam 5 -> append any still lost -> glossary."""
    norm = [normalize(t, acronyms) for t in titles]
    ens = tr([n for n, _ in norm])
    lost = [i for i, ((_, prot), en) in enumerate(zip(norm, ens)) if any(p not in en for p in prot)]
    if lost:
        for i, en in zip(lost, tr([norm[i][0] for i in lost], beam=5)):
            ens[i] = en
            miss = [p for p in norm[i][1] if p not in en]
            if miss:  # ponytail: tokens the model dropped ride along at the end, so codes are never lost
                ens[i] = f"{en} ({' '.join(miss)})"
    return [post_edit(en) for en in ens]


def post_edit(en: str) -> str:
    for p, r in GLOSSARY:
        en = p.sub(r, en)
    return en.strip()


class Translator:
    def __init__(self, model_dir: str, threads: int = 0):
        import ctranslate2  # noqa: lazy so the tiny test runs without the MT venv
        import sentencepiece as spm
        self.tr = ctranslate2.Translator(model_dir, device="cpu", compute_type="int8", intra_threads=threads)
        self.src = spm.SentencePieceProcessor(model_file=str(Path(model_dir) / "source.spm"))
        self.tgt = spm.SentencePieceProcessor(model_file=str(Path(model_dir) / "target.spm"))

    def __call__(self, texts, beam=2):
        toks = [self.src.encode(x, out_type=str)[:400] + ["</s>"] for x in texts]
        res = self.tr.translate_batch(toks, beam_size=beam, max_decoding_length=256, max_batch_size=64,
                                      batch_type="examples")
        return [self.tgt.decode([t for t in r.hypotheses[0] if t != "</s>"]) for r in res]


def load_acronyms(src):
    acr = set(ACRONYMS)
    try:
        acr |= {r[0].upper() for r in src.execute("SELECT DISTINCT siglas FROM comprasmx_contracts WHERE siglas IS NOT NULL")
                if r[0] and 2 < len(r[0]) <= 15 and r[0].lower() not in LOWER_KEEP}
    except sqlite3.Error:
        pass
    return acr


def tiers(src, max_tier: int):
    """Yield (tier, title) in priority order; duplicates are removed by the caller.
    Sequential scans only (NOT INDEXED): on the shared D: disk an index walk costs ~150 ms per row."""
    for (j,) in src.execute("SELECT example_titles FROM subcategory_stats WHERE example_titles IS NOT NULL"):
        for t in json.loads(j or "[]"):
            yield 1, t
    if max_tier < 2:
        return
    rows = src.execute("SELECT titulo_contrato, fecha_publicacion FROM comprasmx_contracts NOT INDEXED "
                       "WHERE COALESCE(is_persona_fisica, 0) = 0").fetchall()
    for t, _ in sorted(rows, key=lambda r: r[1] or "", reverse=True):
        yield 2, t
    if max_tier < 3:
        return
    # one pass over contracts: distinct title -> (max year, max amount <= 100B)
    best = {}
    for t, amt, yr in src.execute("SELECT title, amount_mxn, contract_year FROM contracts NOT INDEXED"):
        if not t:
            continue
        amt = amt if amt is not None and amt <= MAX_CONTRACT_VALUE else 0
        y0, a0 = best.get(t, (0, 0))
        best[t] = (max(y0, yr or 0), max(a0, amt))
    print(f"contracts: {len(best):,} distinct titles", flush=True)
    top = heapq.nlargest(TOP_BY_AMOUNT, best, key=lambda t: best[t][1])
    for t in top:
        yield 3, t
    if max_tier < 4:
        return
    for t in sorted((t for t, (y, _) in best.items() if y >= 2023), key=lambda t: -best[t][0]):
        yield 4, t
    if max_tier < 5:
        return
    for t in best:
        yield 5, t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True, help="source DB (opened read-only)")
    ap.add_argument("--out", default=DEFAULT_OUT, help="output sqlite (never the main DB)")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--tier", type=int, default=4, help="highest priority tier to include (1-5)")
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--apply", action="store_true", help="write translations (default: dry run)")
    a = ap.parse_args()
    if Path(a.out).resolve() == Path(a.db).resolve():
        sys.exit("--out must not be the source DB")

    src = sqlite3.connect(f"file:{Path(a.db).as_posix()}?mode=ro", uri=True)
    out = sqlite3.connect(a.out)
    out.execute(DDL)
    done = {r[0] for r in out.execute("SELECT title_hash FROM contract_title_en")}
    acr = load_acronyms(src)

    todo, seen, per_tier = [], set(done), {}
    for tier, t in tiers(src, a.tier):
        if not t or not t.strip():
            continue
        h = title_hash(t)
        if h in seen:
            continue
        seen.add(h)
        todo.append((h, t))
        per_tier[tier] = per_tier.get(tier, 0) + 1
    print(f"already done {len(done):,}; to translate {len(todo):,} by tier {per_tier}", flush=True)

    tr = Translator(a.model, a.threads)
    if not a.apply:
        sample = todo[:20]
        for (h, t), en in zip(sample, translate_all(tr, [t for _, t in sample], acr)):
            print(f"  {t[:90]!r}\n  -> {en[:90]!r}")
        print("dry run: nothing written (pass --apply)")
        return

    t0, n = time.time(), 0
    for i in range(0, len(todo), a.batch):
        chunk = todo[i:i + a.batch]
        ens = translate_all(tr, [t for _, t in chunk], acr)
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        out.executemany("INSERT OR IGNORE INTO contract_title_en VALUES (?,?,?,?,?)",
                        [(h, t, en, MODEL_TAG, now) for (h, t), en in zip(chunk, ens)])
        out.commit()
        n += len(chunk)
        el = time.time() - t0
        print(f"{n:,}/{len(todo):,} · {n / el:.1f} titles/s · eta {(len(todo) - n) / max(n / el, 1e-9) / 60:.0f} min",
              flush=True)


if __name__ == "__main__":
    main()
