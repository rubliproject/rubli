# GFE — case 36 confidence: evidence for the owner's call (2026-11-04, ORANGE)

**Question:** raise `ground_truth_cases.id = 36` (GRUFESA / Grupo Fármacos Especializados, vendor 29277) from `medium` to `high`?

**What the change does (code, not opinion):**
- `backend/api/public_labels.py` `DOCUMENTED_LINK_SQL` only calls a link «documented» when `confidence_level IN ('high','confirmed_corrupt')`. Today GFE is linked but **not** «caso documentado» anywhere on the site. At `high` it becomes «caso documentado» on its dossier, Focos Rojos, Archivo filters, etc.
- Training is unaffected: the model reads `ground_truth_vendors` (GFE row 754: `evidence_strength = high`, `gt_split = train`, `gold_strict = 0`). No rescore needed.
- No `procurement_scandals` row and no `ground_truth_contracts` rows exist for case 36, so the Archivo contract seal («Caso documentado → …») would **not** appear either way.

**Sources recorded on the case (local DB):**
| Kind | Record |
|---|---|
| Legal / official | SFP inhabilitación, 2 years, 16/07/2019, IMSS procedure: stated under oath that all medicines were made in Mexico when one brand was foreign (`evidence_summary`, provenance tier A, origin `media_report`). |
| Official | COFECE monopoly investigation opened 2019 (as recorded; no file number stored). |
| Official | Presidential veto of the «big three» distributors, April 2019. |
| Press | El Universal; Sin Embargo; Animal Político (2019–20); Proceso; PODER Latam. |
| Data | 6,303 contracts, 133.2B MXN, 2007–2020; direct award 79 %; avg indicator 0.997 (`vendor_stats`). |

**Gaps (why it is `medium` today):**
- The SFP sanction is about **false information in a bid**, not about overpricing or bribery. It is a real, official sanction — but «false declaration» ≠ «corruption».
- COFECE: no resolution recorded (investigation ≠ finding). No file number or URL stored.
- No criminal case, no ASF observation recorded.
- Local `sfp_sanctions` has **no row** for GFE (table stops / name mismatch) — the SFP claim rests on the case note. BROWN's SFP 2019→2026 refresh should confirm it from the DOF circular before any change.
- No `source_url` on the case.

**Recommendation:** raise to `high` **only after** the SFP 16/07/2019 circular is matched in the refreshed `sfp_sanctions` (BROWN item 1) and its DOF URL is stored on the case. Then the public label rests on an official record, not on a press summary. Until then keep `medium`; the Focos Rojos default already excludes GFE (MORNING_2026-11-04 item 4).

**If the owner says yes**, the change is one row (claim the DB in ACTIVE_WORK first, back up):
```sql
UPDATE ground_truth_cases SET confidence_level = 'high',
  source_legal = source_legal || ' | DOF <url>' WHERE id = 36;
```
Then clear the `public_labels` cache (TTL 1 h) or restart the API. Same statement on prod (GRAPHITE).
