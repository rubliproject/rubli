# Wording — «un solo adjudicado», not «un solo postor» (2026-10-30)

Branch `fix/single-bidder-wording` · decision **D20** (chair-plan §7, owner-approved, commit `eb50b966`, 2026-10-05).

## Why

`is_single_bid` = a competitive procedure (not a direct award) whose contracts went to exactly one distinct vendor
(`.claude/rules/data-validation.md` § Single Bid). That counts **winners**. CompraNet records winners, not bidders:
the database has no bidder or proposal table (only co-award stats), and
`docs/INVESTIGATION_TENDER_WINDOWS_2026-10-28.md` says the same. A procedure with one winner may have drawn one offer
or ten. So D20 named the flag «procedimiento con un solo adjudicado» / "single-award procedure", and the glossary and
methodology define it that way. API field names (`single_bid`, `is_single_bid`) were kept.

## The reversal

A brief on 2026-10-30 asked to rename «un solo adjudicado» to «un solo postor» site-wide. That would have reversed D20 and
claimed a bidder count the data cannot show. The coordinator chose the opposite: bring the outliers back to D20.
The outliers were `lib/model/featureLabels.ts` and commit `95216e4e` (/contracts row seal, filter chip, active tag),
plus a few other labels that read «postor» / «licitante» / «oferente» / "single bidder" for `is_single_bid`.

## Changed (→ D20 wording)

| file | old | new |
|---|---|---|
| `src/lib/model/featureLabels.ts` `single_bid` | Un solo postor / Single bidder | Un solo adjudicado / Single award |
| `src/lib/model/featureLabels.ts` `partida_single_bid_z_loo` | Un solo postor frente a su partida / Single bidder vs. budget line | Un solo adjudicado frente a su partida / Single award vs. budget line |
| `src/components/contracts/SenaladosBand.tsx` row seal | Un solo postor / Single bidder | Un solo adjudicado / Single award |
| `src/i18n/locales/es/contracts.json` `filters.singleBid` (filter chip) | Un solo postor | Un solo adjudicado |
| `src/i18n/locales/en/contracts.json` `filters.singleBid` | Single bidder | Single award |
| `src/i18n/locales/es/contracts.json` `filterTags.singleBidders` (active tag) | Un solo postor | Un solo adjudicado |
| `src/i18n/locales/en/contracts.json` `filterTags.singleBidders` | Single-bidder procedures | Single-award procedures |
| `src/lib/contracts/ficha.ts` reading line | Se licitó, pero solo hubo un postor. / It was tendered, but only one bidder came. | Se licitó, pero lo ganó un solo proveedor. / It was tendered, but a single vendor won. |
| `src/lib/contracts/ficha.test.ts` | pins «un solo postor»; test name "one bidder" | pins «un solo adjudicado»; "one awardee" |
| `src/components/contracts/ContractCard.tsx` procedure line | licitación con un solo postor / tender with a single bidder | procedimiento con un solo adjudicado / single-award procedure |
| `src/components/kit/motion/data.ts` `single_bid` | licitación con un solo postor / single bid | procedimiento con un solo adjudicado / single award |
| `src/components/administrations/SexenioEnCurso.tsx` column `sb` | Licitaciones con un solo postor / Tenders with a single bidder | Procedimientos con un solo adjudicado / Single-award procedures |
| `src/components/administrations/SexenioEnCurso.tsx` footnote (ES + EN) | Un solo postor = … un único participante / Single bid = … with one bidder | Un solo adjudicado = … que ganó un solo proveedor (CompraNet registra ganadores, no postores) / EN same |
| `src/pages/SectorDossier.tsx` stat | Licitación con un solo postor / Single bidder in tenders | Procedimientos con un solo adjudicado / Single-award procedures |
| `src/pages/ContractDossier.tsx` flag | un solo licitante / single bidder | un solo adjudicado / single award |
| `src/pages/PatternDossier.tsx` share sub-label | …con un solo oferente / …with one bidder | …que ganó un solo proveedor / …won by one vendor |
| `src/pages/PatternDossier.tsx` ARIA P1 signal (ES + EN) | tuvo un solo oferente / had a single bidder | tuvo un solo adjudicado / ended with a single winner |
| `src/pages/OfficialProfile.tsx` column + cell | Un solo oferente / single | Un solo adjudicado / single award |
| `src/components/aria/RayosX.tsx` stat | Un solo oferente / Single bid | Un solo adjudicado / Single award |
| `src/components/parejas/ParejasLens.tsx` stat + 2 sentences | un solo licitante (adjudicado) / single bidder, single awarded bidder | un solo adjudicado / single award |
| `src/lib/entity/verdict.ts` (ES + EN) | un solo licitante / single bidder | un solo adjudicado / single award |
| `src/lib/atlas/sky/copy.ts` `countsSmallSb`, `dialContractsLine`, `shareLine` | licitante único · un solo postor / single bidder · single bid | un solo adjudicado / single award |
| `src/components/RiskExplainer.tsx` `single_bid` title + mechanism (ES + EN) | Oferta única; «solo un proveedor presentó oferta» / "only one vendor submitted a bid" | Un solo adjudicado; «que ganó un solo proveedor (CompraNet registra ganadores, no postores)» / EN same |
| `src/i18n/locales/{es,en}/glossary.json` `single_bid.mexico_note` | un solo licitante / one bidder | un solo adjudicado / a single award |

## Kept (on purpose)

| where | why |
|---|---|
| `src/components/category/CategoryCover.tsx:510–511` | Already D20: «un único adjudicatario, no un solo postor». |
| `src/i18n/locales/{es,en}/contracts.json` `dictionary.singleBid`, `compare.singleBid` (data dictionary, compare panel) | Already D20. |
| `src/lib/constants.ts:316` comment | Explains why the EU single-*bidder* line is not drawn. Correct. |
| `src/lib/category/verdict.ts:27` comment | "one awarded supplier (not one bidder)". Correct. |
| `src/components/RiskExplainer.tsx:272–273` theory | Charron et al. (2017) measure single-*bidder* rates in the EU. Correct as a citation. |
| `src/lib/gap/doors.ts:29`, `src/lib/moneyPaths/rastro.data.json:64–65` | LAASSP art. 41 fr. I (sole supplier / single bidder in the market): legal text, not `is_single_bid`. |
| `src/lib/model/featureLabels.ts` `cobid_herfindahl` «co-postores» | Separate feature (co-bidding stats). Not this flag; out of scope. |
| All «un solo adjudicado» / "single award" strings (~300) | Already D20. |

## Story / film copy — untouched, listed for the owner

| where | note |
|---|---|
| `src/lib/story-content.ts`, `src/lib/story-index.ts:49–50` | Already explain "records winners, not bidders"; «oferentes» appears in the hook only. EU Scoreboard citations are correct. |
| `src/components/stories/live/CompetitionFigures.tsx:438–439` | Correct: the EU single-*bidder* line is mentioned to explain why it is not drawn. |
| `src/components/gallery/filmData.ts:19` | Code comment only ("single award %"). Already D20. |

## Truth fixes (owner-delegated, 2026-11-02)

### 1. `glossary.json` `single_bid.mexico_note` — "rare" replaced with the measured share

The note said competitive procedures with a single award are "rare" in Mexico. They are not. Verified read-only on
`backend/RUBLI_NORMALIZED.db`:

```sql
SELECT count(*), sum(is_direct_award=0), sum(is_single_bid=1 AND is_direct_award=0),
       count(DISTINCT CASE WHEN is_direct_award=0 THEN procedure_number END),
       count(DISTINCT CASE WHEN is_direct_award=0 AND is_single_bid=1 THEN procedure_number END)
FROM contracts
WHERE contract_date >= :a AND contract_date < :b AND coalesce(amount_mxn,0) <= 100e9;
```

| term (window) | competitive contracts | of which single award | **share by contract** | share by procedure |
|---|---|---|---|---|
| Peña Nieto (2012-12-01 to 2018-11-30) | 332,262 | 205,889 | **62.0 %** | 88.7 % (199,843 / 225,356) |
| López Obrador (2018-12-01 to 2024-09-30) | 213,785 | 101,227 | **47.3 %** | 84.7 % (95,511 / 112,737) |

**Verification run:** 2026-11-02, read-only (`file:backend/RUBLI_NORMALIZED.db?mode=ro`, main checkout `D:\Python\yangwenli`), Python `sqlite3`. One query per term with the windows `[2012-12-01, 2018-12-01)` and `[2018-12-01, 2024-10-01)` on `contract_date`, amounts ≤ 100B MXN. It scans about 2.3M rows and took over 10 minutes on the cold D: disk, so a re-run needs a long timeout or a background job. Raw output:
`EPN (1231418, 332262, 205889, 225356, 199843)` · `AMLO (1030058, 213785, 101227, 112737, 95511)`. The columns are: all contracts, competitive contracts, single-award competitive contracts, distinct competitive procedures, distinct single-award competitive procedures.

The site figure is the **contract** share: `single_award_of_competitive` (`backend/api/helpers/analysis_helpers.py`) =
single-bid contracts / non-direct-award contracts. The note now states that denominator ("of the contracts signed in
competitive procedures … counted by contract, not by procedure"). The story copy's 47.4 % differs by 0.1 pt, from the
term window.

**For the owner:** `story-content.ts:3140/3146` (and the /administrations copy from `eb50b966`) says
"62.0 percent **of competitive procedures**". The number is a share of *contracts* in competitive procedures. Counted
by procedure it is 88.7 % / 84.7 %. Story copy is left untouched; the wording needs an owner decision.

### 2. `src/lib/moneyPaths/rastro.ts` (/rastro money path, not a story)

| line | old | new |
|---|---|---|
| 125 prose | …se quedaron con un solo competidor. / …ended up with a single bidder. | …terminaron con un solo adjudicado. / …ended with a single winner. |
| 131 rail | de los concursos, con un solo competidor. / of tenders, with just one bidder. | de los concursos, con un solo adjudicado. / of tenders, with a single winner. |
| 131 source | procedimientos con un solo postor / procedures with one bidder | procedimientos con un solo adjudicado / procedures with one winner |
| 180 comment | tenders with a single bidder | tenders with a single winner |

### 3. 62.0 % / 47.4 % are contracts, not procedures (owner-delegated, 2026-11-02)

The figure is a share of **contracts** in competitive procedures (see table above). These places named
"procedures" as the denominator and now say "contracts in competitive procedures" / «contratos de procedimientos competitivos»:

| file | where | change |
|---|---|---|
| `src/i18n/locales/{en,es}/administrations.json` `procurement` (/administrations) | single-award rate note | "of competitive procedures" → "of contracts in competitive procedures"; «sobre procedimientos competitivos» → «sobre los contratos de procedimientos competitivos» |
| `src/lib/story-content.ts:3107–3108` (hidden story) | stat suffix «62.0% → 47.4%» | same wording fix |
| `src/lib/story-content.ts:3140, 3146` (hidden story) | prose «bajaron del 62.0 por ciento…» | same wording fix |

### 4. Site-wide denominator pass (owner-delegated, 2026-11-02)

Every place below reports a contract-based rate: `single_bid` contracts over non-direct-award contracts. That covers `singleAwardOfCompetitive`, `procurement_health.single_bid_rate`, vendor `single_award_pct`, `readSectors`/`readYears`, and the story's `single_bid_count` rankings. Each place called the denominator "competitive procedures" or tenders, and some claimed bidder counts. Wording is now «de los contratos de procedimientos competitivos» / "of contracts in competitive procedures". The counts (362,000; 6,236 of 6,623; 196,649 of 220,969; 45,234 → 42,850) are now called contracts, not procedures or tenders. There are no bidder-count claims left.

| file | lines | change |
|---|---|---|
| `src/pages/Sectors.tsx` | 455–456 | infrastructure deck sentence (es/en) |
| `src/pages/SectorProfile.tsx` | 1054 | wording, and the value now uses `singleAwardOfCompetitive(...)`. It used to print the raw share of *all* contracts as if it were the share of competitive ones. The page is unrouted (kept on disk) and its insights are English-only. |
| `src/i18n/locales/{en,es}/sectors.json` | 195, 212 | PHI benchmark and insight body. ES «recibió solo un licitante» → «vino de un procedimiento con un solo adjudicado» |
| `src/components/explore/ExploreCanvas.tsx` | 2088–2089 | vendor SB column tooltip |
| `src/components/stories/live/CompetitionFigures.tsx` | 217, 225, 322, 329–330, 390, 430, 438–439, 480–481 | anchors, annotations, footlines. «ofertas únicas» → «contratos con un solo adjudicado» |
| `src/components/stories/live/useCompetitionData.ts` | 271 | code comment |
| `src/lib/story-content.ts` | 2218–2491 | hook, sublabels, «Un oferente, 362,000 veces» → «Un solo adjudicado, 362,000 veces», 2242 «un oferente», «atrajo exactamente una oferta», «cuando solo se presenta un oferente», «las mismas ofertas únicas», "the only bidder who can make it work" → "only supplier", all denominators and counts |
| `src/lib/story-index.ts` | 49–50 | the same hook sentence as story-content 2218/2220 |

Left as is:
- Code comments in `useCompetitionData.ts:35, 193` and `CompetitionFigures.tsx:14` (not visible).
- The short «de competitivos» / "of competitive" labels in category and sector panels (ambiguous, not wrong).
- `story-content.ts:2482` "The corruption lies in the pattern…". This is a risk-copy question, not a denominator one; flag for the owner.

### 5. Reviewer follow-ups on `44dc6767`

| file | change |
|---|---|
| `src/lib/atlas/sky/copy.ts:412` `moonKeySb` | licitante único / single bid → un solo adjudicado / single award |
| `src/i18n/locales/es/common.json:338` `single-bid-contracts.desc` | «…con solo 1 licitante» → «Procedimientos competitivos con un solo adjudicado» |
| `src/components/capture/MajorityLedger.tsx:351` | con oferta única / single-bid → con un solo adjudicado / single-award |
| `src/components/RiskExplainer.tsx:268–269` `single_bid.mechanism` | dropped «En México es menos común…» / "In Mexico, this is less common…" (contradicted the measured share) |
| `src/lib/story-content.ts:2338, 2344` (hidden story) | «ofertas únicas» ×2 / "single-award procedures" ×2 → contracts with a single award |
| `src/lib/story-content.ts:3140, 3146` (hidden story) | subject is now the contracts: «los contratos de procedimientos competitivos con un solo adjudicado bajaron del 62.0 al 47.4 por ciento…» / "contracts from competitive procedures with a single winner fell from 62.0 to 47.4 percent…" |
