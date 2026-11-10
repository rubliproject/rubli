# Datasheet: RUBLI public dataset v2026.11

**Owner:** RUBLI (pseudonymous; prensa@rubli.xyz) · **Built:** 2026-10-27 from prod snapshot `rubli_export_20261027.db` (quick_check ok), after the institution-classification and ramo fixes of that day · **License:** this release (2026.11) was published under CC BY 4.0 and keeps it; from 2026-10-28 the site and future releases are CC BY-NC 4.0 (owner decision). Applies to RUBLI's derived tables; source records are Mexican federal open data **[owner: confirm the CompraNet / ComprasMX reuse terms and cite them on Zenodo]** · **Previous:** 2026.10, DOI 10.5281/zenodo.23209798.

Figures below were measured on the snapshot the export was built from.

## 1. Motivation
Mexican federal procurement records are public but scattered across formats that changed four times in 23 years, and the federal bulk feed stopped on 2025-09-28. RUBLI rebuilds them into one register and adds a statistical risk indicator and an investigation queue so journalists, auditors and researchers can find patterns worth reporting. Built and funded by an independent team; no party or government money.

## 2. Composition
- **Instance:** one federal contract (`contracts`, 3,177,987 rows). Around it: vendors (332,283), institutions, categories, per-entity aggregates, the ARIA queue (201,533 vendors), the case register used as labels, and model features. 112 tables in total (`MANIFEST.json`, `DATA_DICTIONARY.md`).
- **Time and structure:** CompraNet structure A 2002–10 (394,861 contracts) · B 2010–17 (1,329,057) · C 2018–22 (931,183) · D 2023–25 (402,042) · ComprasMX open data E 2025–26 (120,844 not already in CompraNet). The CompraNet feed ends 2025-09-28; ComprasMX runs to 2026-10-17. The staging table `comprasmx_contracts` (213,392) also ships and overlaps CompraNet for 92,761 rows.
- **Amounts:** 3,176,621 with a valid amount (10.44 trillion MXN, 9.58 of it CompraNet A–D). 1,366 rows have no valid amount; 40 are between 10 and 100 billion MXN (flagged, kept); none above 100 billion (rejected by rule). 15 decimal errors were corrected and are listed in `contract_amount_corrections`.
- **Risk indicator (model v0.9.2):** 3,176,621 contracts scored: critical (≥ 0.60) 5.17 % · high (≥ 0.40) 4.77 % · medium (≥ 0.25) 12.48 % · low 77.58 %. The score measures statistical similarity to contracts of documented cases. **It is not a probability of corruption.**
- **Labels:** 1,417 cases, 1,556 linked vendors (171 marked false positive). By origin: 989 model or ARIA leads written up by analysts, 361 press reports, 25 official records, 1 audit report, 41 other or unrecorded. By provenance tier: A 65 · B 61 · C 1,291. **Most labels are analyst write-ups, not court or audit findings.**
- **Skews:** record quality rises with time. The share of contracts whose vendor has an RFC in the registry is A 37.1 % · B 45.5 % · C 68.3 % · D 80.0 % · E 85.5 %. 2002–2010 risk is underestimated. Direct award is coded reliably only from 2011.
- **Sensitive data:** suppliers can be individuals (personas físicas; `vendors.is_individual` flags 192,821, a noisy over-inclusive flag). RFCs are dropped from every table; individuals' names are replaced with `PERSONA FISICA <id>` in every cell and inside free text; RFC-derived birth dates are nulled. 63,512 ComprasMX supplier cells are masked (55,951 flagged rows plus RFC-shape detection; 0 flagged rows left unmasked). Company names, institution names and amounts are kept: they are public record and the point of the dataset.

## 3. Collection
Bulk files of CompraNet (Secretaría de la Función Pública / Hacienda, 2002–2025) and the ComprasMX open-data contract CSVs (2025–2026), downloaded from official portals. Cross-references come from SAT's Art. 69-B list (EFOS), SFP's sanctioned-supplier registry, ASF audit reports and press archives for the case register. All sources are published by the Mexican state; no private or scraped personal data is used.

## 4. Preprocessing and labels
ETL normalises the four CompraNet layouts and ComprasMX into one schema, assigns 12 sectors by ramo, resolves institution and vendor identities, and applies the amount rules above. The model, v0.9.2 (ElasticNet logistic regression with PU correction, 17 as-of features, forward-chained vendor-year AUC 0.827 [0.763–0.883]), only uses information from before each contract. v0.9.1's 0.852 AUC was withdrawn for look-ahead. Labels were written by RUBLI analysts from public sources; inter-annotator agreement was **not measured**. ARIA builds its queue from the score, anomaly detectors and the registries.

## 5. Uses
- **Good for:** finding leads to report (concentration, captive buyers, direct-award patterns, price anomalies); comparing institutions and periods with the stated caveats; reproducing RUBLI's figures.
- **Do not use for:** naming any company or person as corrupt on the strength of the score; per-contract legal or administrative decisions; precise trends before 2011 or comparisons across structures without the quality caveat; training models without a time-aware split (the labels follow RFC coverage and can leak the vendor's identity); claims about state or municipal spending (the register is federal, plus some ComprasMX state buyers).

## 6. Distribution
Zenodo (versioned DOI), CC BY 4.0 for this release (future releases: CC BY-NC 4.0). Formats: `RUBLI_PUBLIC.db` (SQLite, 5.3 GB), `RUBLI_PUBLIC_lite.db` (418 MB), CSVs of the main tables (380 MB), `DATA_DICTIONARY.md`, `MANIFEST.json` (sha256 of every file). Built by `backend/scripts/export_public_dataset.py`, deny-first. The post-export scan for RFCs, emails, local paths and individuals' names must come back clean, and it did for this build.

## 7. Maintenance
Released after each model or data change (monthly at most), each as a new Zenodo version. Report errors at prensa@rubli.xyz or through the issue form on rubli.xyz. Corrections are logged in `contract_amount_corrections` and in the release notes.

**Changes since 2026.10:** ComprasMX open data through 2026-10-17 in the scored register; the 288 ComprasMX buyers that arrived unclassified now carry a type, sector and federal flag; ramo claves 40–44 map to INEGI / COFECE / INEE / IFT / INAI (40 was mislabelled INFONAVIT); 35 institution sector labels and 88 state-ministry types corrected (see `docs/INSTITUTION_CLASSIFICATION_AUDIT_2026-10-27.md` in the code repository); captura pairs no longer count late-2025 ComprasMX money twice; new table `institution_vendor_year` (buyer × supplier × year cells, ids and amounts only). Title: «RUBLI — Mexican Federal Procurement Dataset (2002-2026)», version 2026.11, data cut 2026-10-17.
