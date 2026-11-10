# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product

RUBLI — an open procurement-intelligence platform over Mexican federal contracting. 3.1M contracts (2002–2025, CompraNet, frozen Sep 2025), ~9.9T MXN validated value, a calibrated risk-indicator model (v0.9.1, ElasticNet + PU correction, trained on 1,417 documented corruption cases), an investigation queue (ARIA, 248,944 vendors in 4 tiers), 1,287 linked ground-truth cases, 13 long-form data stories, and a constellation atlas of the whole record.

## Primary user and job

**Confirmed by owner 2026-10-13.** An investigative journalist at a Mexican outlet (MCCI, Animal Político, Quinto Elemento, ICIJ-style partners) who has a tip about a vendor or institution and opens RUBLI to find and document a lead before publishing. She needs: an evidence trail she can retrace, numbers she can cite with their source and date, exportable facts, and a clear line between "indicator" and "proof".

Secondary (not optimized for): anticorruption analysts triaging the queue; curious citizens reading the stories.

## Mechanism / position

Every number is a counted, sourced thing. The platform does not accuse; it ranks and documents. "Indicador de riesgo" is a similarity score to documented cases, never a probability of corruption. The differentiator versus news graphics and versus government portals: the full record is here, filterable, linked entity-to-entity, with the model's reasoning exposed (methodology, calibration log, feature weights).

## Durable constraints (preserve in all future work)

- **Bilingual**: every visible string in Spanish and English; Spanish is the primary voice; Spanish § kickers for editorial sections; Mexican currency conventions (MDP, billones).
- **Risk copy**: "indicador de riesgo" / "risk indicator". Never "X% probability of corruption". Low risk is never green.
- **Entity names are never truncated**; entities outside their own dossier render through one identity chip component.
- **Thresholds and colors come from `frontend/src/lib/constants.ts`** (risk 0.60 / 0.40 / 0.25; 12 sector colors).
- **Logo is locked** (owner, 2026-10-07): «El Expediente Abierto» — three ink ledger bars, the middle one pulled out of line in risk red. `frontend/src/components/ui/RubliLogoMark.tsx` is the only mark; never inline a new one. It animates on mount (rows draw, scan line, pull with overshoot).
- **The Atlas constellation engine stays** (dot-allocation logic in `ConcentrationConstellation.tsx`); surfaces re-skin around it.
- **Data rules**: contracts > 100B MXN rejected, > 10B flagged (CLAUDE.md).
- **Version**: platform is RUBLI 1.0 (owner, 2026-10-13); the model version (v0.9.1) is shown separately.
- Type floor 12px, body 15px, spacing ladder 4/8/12/16/24/32/48, one light theme (owner, 2026-10-13).

## Visual constraints volunteered by the owner (recorded, not expanded)

- "It looks like the Financial Times beat for beat … needs something else to differentiate it, otherwise it's AI slop." (2026-10-13)
- "Be really careful with the spacing." (2026-10-13)
- "Add our logo on top." (2026-10-13)
- Earlier: loves the dashboard, El Mapa, El Anaquel, the Atlas, the Hallazgos pages; "gold pages: enhance in place, never rebuild".

## Open decisions

- Final visual world: five fresh proposals requested 2026-10-13 (see `frontend/_ui_v4/proposals/`).
- Navigation form (two-tier folder tabs was decided under the Expediente assumption; open again).
