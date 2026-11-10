# Subcategories — one id per contract (2026-11-03)

`backend/scripts/classify_subcategories.py` stores the subcategory of every contract in
`contract_subcategory(contract_id PK, subcategory_id, source, is_consolidated)` (WITHOUT ROWID, index on
`subcategory_id`). `contracts` is never altered. `compute_subcategory_stats.py` only aggregates those ids.

| column | meaning |
|---|---|
| `subcategory_id` | NULL when the category has no definitions; the catch-all id when no rule decided |
| `source` | `regex` · `compendio` · `partida` · `catch_all` · NULL |
| `is_consolidated` | 1 when the text says «consolidada» or `contracts.is_consolidated = 1` — how it was bought, never a kind |

Rules, per contract, first that decides wins: (1) the subcategory regexes of `SUBCATEGORY_DEFS`, in order, on
title + description, upper-cased with accents stripped (before this, titles only and accented text never matched
the unaccented patterns); (2) Compendio supply-group codes cited in the text — every group cited must map to the
same subcategory; (3) `partida_especifica` (Structure D / ComprasMX) — every partida listed must map to the same
subcategory by prefix; (4) the catch-all.

Ids are stable: definitions are upserted on `(category_id, code)`; a removed definition is deleted with its stats
and vendor rows. `swap_category_precomputes.py` upserts the scratch definitions into live on the same key and
remaps `subcategory_id` in `subcategory_stats`, `subcategory_vendor_topn` and `contract_subcategory` through it
(codes alone repeat across categories: `other_*`).

«Los N mayores» (`subcategory_vendor_topn`) is one row per firm: the vendor group (`vendors.group_id`) when there
is one, else the name without legal suffix (`api.sanctions.normalize_name` + suffixes cut by the 60-character
field); personas físicas are never merged by name. The firm shows as its largest member.

## Fuentes

- **Compendio Nacional de Insumos para la Salud, supply groups** (first three digits of a clave): 010 medicamentos ·
  020 vacunas (e.g. clave 020.000.6521.00, dengue vaccine, DOF/Consejo de Salubridad General,
  https://sidof.segob.gob.mx/notas/docFuente/5796643) · 030 fórmulas · 040 estupefacientes y psicotrópicos
  (IMSS tender annex «grupos 010 (medicamentos), 030 (fórmulas) y 040 (estupefacientes y psicotrópicos),
  contenidos en el Compendio Nacional de Insumos para la Salud», reposipot.imss.gob.mx) · 060 material de
  curación · 070 material radiológico · 080 material de laboratorio (IMSS procedures AA-50-GYR-050GYR016-I-62-2024
  «grupos 060 material de curación y 080 material de laboratorio» and LA-50-GYR-050GYR016-N-82-2023 «grupos 060,
  070 y 080», reposipot.imss.gob.mx). 010 decides no class: it says «medicine», not which.
- **Partidas**: Clasificador por Objeto del Gasto, genéricas as named in `cucop_generica_map` (e.g. 255
  «Materiales, accesorios y suministros de laboratorio», 344 «Seguros de responsabilidad patrimonial y fianzas»,
  345 «Seguro de bienes patrimoniales», 351/353/355/357 mantenimiento, 347 fletes, 358/359 limpieza, 242/244/247
  materiales, 551/561/562/563/566 maquinaria). 338 (servicios de vigilancia) is used for Vigilancia y Seguridad.

## Definitions added 2026-11-03

Categories whose text genuinely separates kinds: 69 Seguros y Fianzas, 23 Laboratorio (earlier the same day), then
63 Servicios de Limpieza (cisternas · lavandería · residuos · fumigación/jardinería · artículos de aseo · terrenos y
desazolve · limpieza de inmuebles), 34 Servicios de TI (impresión administrada · centro de datos y nube ·
licenciamiento · redes y ciberseguridad · desarrollo de sistemas · soporte), 47 Impresión (libros de texto ·
fotocopiado · formas valoradas · publicaciones y difusión), 75 Uniformes (policial y balístico · lavado y renta ·
protección personal · uniformes · calzado). 72 Servicios Ambientales got none: its money is road conservation and
other works misfiled by the category regex — a `classify_categories.py` fix, not a subcategory.

Coverage (local DB, 2026-11-03): before, 18 categories had definitions and 19.8 % of all value sat in a named
subcategory (including the «compras consolidadas» pseudo-kind); after, 24 categories, 36.2 % of value
(814,398 contracts) in a named subcategory, 51.4 % in a catch-all, 12.4 % in categories without definitions.

«p. ej.» titles skip procedure folios («LA-019GYR047-E53-2017…», «CONSOLIDADO/INSABI/…») and bare words
(`good_example`).

## Limits

Medicines: most contracts name no therapeutic class in their text («ADQUISICIÓN DE MEDICAMENTOS», «COMPRA
CONSOLIDADA DE MEDICAMENTOS…»), and partida 25301 says only «medicinas». That value stays in «Medicamentos sin
clase en el texto»; no class is inferred from the vendor or the buyer. Several «*_misfiled» subcategories (offshore
oil works in Material de curación, coal in Maquinaria and Materiales, antiretrovirals in Material de curación) name
category-regex errors honestly; the fix belongs in `classify_categories.py`.
