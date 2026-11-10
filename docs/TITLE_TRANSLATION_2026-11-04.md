# Contract titles ES → EN — local machine translation (2026-11-04)

Owner approval (Nov 4): a free, local, open-source MT model to translate contract titles (what was bought)
for the English site. No paid APIs. Everything on `D:\Python\_mt\`.

## 1. Model

| Item | Value |
|---|---|
| Model | `Helsinki-NLP/opus-mt-es-en` (MarianMT, OPUS-MT, Univ. of Helsinki) |
| Source | https://huggingface.co/Helsinki-NLP/opus-mt-es-en (revision `c96e2c5399ebfae4fc43d9669556b9afa74bb69d`) |
| Licence | Apache-2.0 (per the Hub model card) — commercial use, redistribution of outputs OK; keep attribution |
| Download | 301 MB (PyTorch weights + SentencePiece) → `D:\Python\_mt\models\opus-mt-es-en-hf` |
| Runtime | converted to CTranslate2 int8 (`ct2-transformers-converter --quantization int8`), **79 MB** → `D:\Python\_mt\models\opus-mt-es-en-ct2` (+ `source.spm`/`target.spm`) |
| Env | `D:\Python\_mt\venv` (Python 3.11; torch 2.15 CPU only for the one-off conversion, ctranslate2 4.8.5, sentencepiece 0.2.2, transformers 5.22). Caches `HF_HOME`/`PIP_CACHE_DIR`/`TMP` under `D:\Python\_mt\`. Scripts run with `python -I`. |

Why this model: the standard permissive ES→EN model, CPU-friendly (≈77 M params), and CTranslate2 int8 makes it
fast without a GPU. Argos-translate ships the same OPUS-MT family but pulls stanza/torch at runtime; going
direct to CT2 is smaller. Bigger models (NLLB-200, Madlad) are CC-BY-NC or much slower — not worth it for titles.

## 2. Pipeline (`backend/scripts/translate_titles.py`)

1. **Normalise** (`normalize`): collapse whitespace; ALL-CAPS titles (>70 % upper letters) → sentence case;
   restore `-ción/-sión` accents dropped by CompraNet (`ADQUISICION` → `adquisición`); expand frequent
   abbreviations (`PROY EJEC EDIF` → `proyecto ejecutivo edificio`, `ADQ`, `MTTO`, `SERV`, `REQ`…);
   Title-Case short quoted names (`"MIGUEL HIDALGO"`) so the model keeps them as names.
2. **Protect** codes and acronyms verbatim: any token with a digit (`IA-050GYR012-E254-2019`, `25301`,
   `010.000.0104.00`, `TPH700`), vowel-less tokens (`KG`, `CFDI`), a curated list (IMSS, ISSSTE, PEMEX, CFE,
   SEDENA, BANCOMEXT, units…) plus every `siglas` value in `comprasmx_contracts` (730 in total).
3. **Translate** with CT2 beam 2. Titles where a protected token is missing from the output are re-run at
   beam 5; anything still dropped is appended in parentheses, so codes are never lost (2.5 % of titles hit
   the retry in the sample).
4. **Post-edit glossary** (EN side) for recurring procurement jargon: *Acquisition of* → *Purchase of*;
   *direct adjudication* → *direct award*; *public bidding* → *public tender*; *invitation to at least three
   persons* → *restricted invitation (3+ bidders)*; *departure/game N* (partida) → *line item*;
   *healing material* (material de curación) → *medical and wound-care supplies*; *injectable solution* →
   *solution for injection*; *maintenance and maintenance* (mantenimiento y conservación) → *maintenance and
   upkeep*; *tassels* (garrafones) → *jugs*; *mediatic* → *media*; *inflated wheat* → *puffed wheat*.
   The list lives in `GLOSSARY`; add a line per new recurring error.

## 3. Throughput

Measured on this machine (8 logical CPUs, CT2 int8, batch 256, beam 2), on 2,000 distinct real titles:

| Condition | titles/s |
|---|---|
| 2,000-title random sample (all eras), machine shared with other agents | **18–20** |
| real run, tiers 1–2 (69,988 titles, shorter ComprasMX titles), 50 min | **23.3** (peaks 49) |
| machine + D: disk saturated by other jobs | 5–6 |

Greedy decoding (beam 1) was not faster here and changed 40 % of outputs — keep beam 2.

**Reading the DB is the real bottleneck on the shared D: disk**: index walks cost ~150 ms per row under
contention (300 random rows = 45 s), so the script uses only sequential `NOT INDEXED` scans (one pass over
`contracts`, one over `comprasmx_contracts`). The full scan of `contracts` took ~2 h while other agents were reading the same disk (~6 MB/s).

### Volume and time

| Set | Distinct titles (new per tier) | @ 23 t/s | @ 6 t/s |
|---|---|---|---|
| Tier 1 category «p. ej.» examples (`subcategory_stats.example_titles`) | 1,000 | 1 min | 3 min |
| Tier 2 ComprasMX titles (board feed, «Lo más reciente»), personas físicas excluded | 68,988 | 50 min (measured) | 3.2 h |
| Tier 3 top 20,000 titles by contract amount (≤ 100B MXN) | 18,727 | 14 min (+ ~2 h DB scan) | 52 min |
| Tier 4 titles used by a 2023+ contract | 123,809 | 1.5 h | 5.7 h |
| Tier 5 everything else | 1,263,935 | 15.3 h | 58 h |
| **All distinct titles** (1,437,689 in `contracts` + ComprasMX-only) | **1,476,459** | **≈ 18 h** | **≈ 68 h** |

**Run so far (Nov 4):** tiers 1–2 = **69,988 titles written** to `D:\Python\_mt	itles_en.sqlite`
(17 MB) in 50 min, then the later glossary lines re-applied to the stored rows (902 rows changed; the glossary
is EN→EN so this is safe). Tier 3 was **not** run: it needs the 2 h full scan of `contracts` on the shared disk,
which breaks the < 2 h budget. The main DB was only read.

A second spot-check of 30 ComprasMX outputs added: *Recruitment of* (contratación) → *Contracting of*,
*deserted* (claves desiertas) → *unawarded*, *routine storage* (conservación rutinaria) → *routine upkeep*,
*side rails* (carriles) → *side lanes*, *manifestation of environmental impact* → *environmental impact
statement*, *office tools* (útiles) → *office supplies*, plus `MTO`/`MANTO` → mantenimiento.

## 4. Quality (hand check)

60 titles (every 33rd of the 2,000-title random sample, all eras A–E) checked by hand after the glossary pass:

| Verdict | n | % |
|---|---|---|
| Correct and idiomatic | 44 | 73 % |
| Understandable, minor flaw (lower-cased place/brand, literal phrasing) | 10 | 17 % |
| Wrong / misleading | 6 | 10 % |

**Usable ≈ 90 %, fully correct ≈ 73 %.** The glossary pass alone moved 4 titles from wrong to correct
(material de curación ×3, garrafones) and fixed 6 more phrasings.

Remaining error classes:
- **Proper nouns in ALL-CAPS text get translated**: `GÓMEZ PALACIO` → *gomez palace*, `RÍO NUEVO` → *rio new*,
  harina `MI MASA` → *my dough*, person names (`MAYRA KARINA GUERRERO` → *Mayra Karina warrior*). Casing
  information is gone in CAPS sources, so the model cannot tell a name from a word.
- **Unknown acronyms with vowels** (`ENCB`, `UPIICSA`, `POA`) are lower-cased or dropped.
- **Domain words** (`desarenadores` → *de-removers*, `gravados` = taxed → *gravity*).
- Source truncation/typos (`OMPRA DE…`) propagate.

Sample with all outputs: `D:\Python\_mt\proto\sample_2000_v2.json` (local only, not committed).

## 5. Storage (does not touch `contracts`)

```sql
CREATE TABLE contract_title_en (
  title_hash TEXT PRIMARY KEY,   -- sha1(utf-8 of the exact stored title)
  title_es   TEXT NOT NULL,
  title_en   TEXT NOT NULL,
  model      TEXT NOT NULL,      -- 'opus-mt-es-en/ct2-int8'
  created_at TEXT NOT NULL
) WITHOUT ROWID;
```

One row per distinct title, keyed by hash of the exact text, so any surface that has `c.title` can look up
the English with no join on `contracts`. Built into `D:\Python\_mt\titles_en.sqlite`; later copied into
`RUBLI_NORMALIZED.db` / `RUBLI_DEPLOY.db` with `ATTACH` + `INSERT OR IGNORE` (a separate step with its own
ACTIVE_WORK claim). A model upgrade = new `model` value + re-run with `--out` on a fresh file.

### Script

```
# dry run (default): tier counts + 20 sample translations, writes nothing
D:\Python\_mt\venv\Scripts\python.exe -I backend/scripts/translate_titles.py --db backend/RUBLI_NORMALIZED.db --tier 4
# real run, resumable (rows already present are skipped), commits every batch
... --out D:/Python/_mt/titles_en.sqlite --tier 3 --apply
```

Refuses `--out` equal to `--db`; the source DB is opened `mode=ro`. Test: `backend/tests/test_translate_titles.py`
(normalisation, code protection, glossary, table shape; no model needed).

## 6. API / frontend integration plan (not built)

**Privacy first.** ComprasMX titles of personas físicas are withheld today («the title can carry the name»,
`precompute_recent.py`); the batch skips them, and the API must apply the same gate: **return `title_en`
only where `title` (ES) is returned, and never for a persona-física contract** — show the Spanish title
there (names in titles get mangled anyway: *Guerrero* → *warrior*). No RFC is ever involved.

Backend:
1. Copy `contract_title_en` into the serving DB (step above). Add a helper in `api/` —
   `title_en_for(conn, titles) -> dict[str, str]` — one `SELECT title_hash, title_en FROM contract_title_en
   WHERE title_hash IN (…)` per page (≤ 100 rows; PK lookups, no scan).
2. Contract list/detail endpoints (`contracts.py`, `categories.py` contract lists, `vendors.py`,
   `institutions.py`, `search.py`) add `title_en: str | null` next to `title`. Precomputed blobs
   (`precompute_recent`, `precompute_events`, `compute_subcategory_stats.example_titles`) add `title_en` /
   `example_titles_en` at build time — the API stays a passthrough.
3. Weekly ComprasMX refresh (`comprasmx_weekly.py`) runs `translate_titles.py --tier 2 --apply` after
   ingest: a week is a few thousand new titles = minutes.

Frontend:
- One helper, e.g. `contractTitle(c, lang)` → `lang === 'en' && c.title_en ? c.title_en : c.title`,
  used wherever a title is rendered (contract tables, dossier headers, Portada board, category «p. ej.»).
- English titles carry a quiet marker (`machine-translated` tooltip / «traducción automática» note in the
  methodology), and the original Spanish is one hover/tap away — the Spanish text stays the source of record.
- Keep `sentenceCaseCaps()` for the Spanish fallback only; MT output is already sentence case.

## 7. Next steps

1. ✅ Tiers 3 + 4 done 2026-11-05 (BROWN): 142,536 titles (tier 3 18,727 · tier 4 123,809) at 11.8 titles/s; `D:/Python/_mt/titles_en.sqlite` now holds **212,524** titles (56 MB). Not yet copied into any DB.
2. Grow `GLOSSARY` + `ABBREV` from a second 60-title check on tier-2 (ComprasMX) titles.
3. Gazetteer of states/municipalities + institution siglas from `institutions.siglas` (once
   `apply_institution_acronyms` lands) as protected tokens — fixes most proper-noun errors.
4. Then the API/frontend integration above (its own branch; `rubli-ui` + bilingual audit).
