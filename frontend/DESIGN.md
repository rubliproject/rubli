# RUBLI 1.0 UI — «El Contrato» (template M)

**Status**: LOCKED 2026-10-13 after 7 proposals + grading; §0 philosophy + §7 live motion added 2026-10-28 (owner: «it must be defined before we design anything»). **Template v3 «El Contrato · en vivo» locked 2026-10-28** (owner «Ok» to all 8 changes of `_explore/live_template_v3_2026-10-28/`; its `sistema.html` §5 is the change table): §2 sizes, §3 space, §4 cover, §5 shell, §6.7 night set, §7 ticker, §8 Clause/Table rewritten below. **Faces (§2) and palette (§6) picked by the owner in the style sampler (2026-10-28, `_explore/style_sampler_2026-10-28/`)**: Source Serif 4 · Source Sans 3 · Source Code Pro, «Sala de redacción» day palette, «ajustados» categorical, density compacta, 1px rules, radius 0, chip «cuadro», night opt-in. Every face, colour, size, space and radius is a CSS custom property in `index.css`. Sizes, spacing and structure are locked. Mock of record: `frontend/_ui_v4/proposals/M-contrato-instrumento.html` (desktop/mobile PNGs beside it). Grader: 63/100 before the cover fixes; fixes 1, 2, 4, 5 applied; measurements pass; detector 2 kept.
**Read by**: `/rubli-ui`, `impeccable context`, humans. PRODUCT.md holds product truth.

The site is set as a Mexican federal public contract: the record's own anatomy (DECLARACIONES, CLÁUSULAS, anexos, signature block) is the page grammar, and every risk score is read as a needle on a calibrated scale. White paper, black ink, the canonical palette for meaning, red reserved for the pulled record.

## 0. Philosophy — what every screen must be (2026-10-28, owner rules gathered in one place)

Read this before §1–§10. When a rule below conflicts with a later section, this section wins; the later sections are how it is done today. Every UI task goes through `/rubli-ui` (it invokes the real design skills and an independent reviewer) and is judged against these nine lines.

1. **An information instrument, not a poster.** Small letters and a lot of good information. Body 15, data 13, nothing under 12, and **no hero numerals**: nothing is set above 24px (the h1 sentence), and every figure uses the `fig` token (17; story clauses 24). A screen is measured by the facts it carries, not by its drama. (Owner 2026-10-28: «no big numbers … it's an information site».)
2. **The record is alive.** RUBLI is no longer an archive of 2002–2025: ComprasMX arrives every week. Every surface says when its data last moved and when it moves next, and new things *arrive visibly*: a new row slides into its table, a new contract lands in the El Mapa sky, a ticker carries the week's critical readings. Motion carries information or it does not exist (§7 «Live motion»).
3. **Object first.** The data object (the sky, the table, the dossier's first chapter) is in the first screen; explanation follows it (§5.1). Compact heads, no wasted vertical space, fix space before content.
4. **One story per block.** A claim sentence, ONE visual, one plain sentence — then the drill layer (entity → years → records → dossier). No chart stacks, no bar-chart default; each visual chosen with `dataviz`.
5. **Everything is a door.** Every name is an `EntityIdentityChip`, every figure links to the records behind it, every page ends in its connections.
6. **Honest by construction.** «Indicador de riesgo», never «probabilidad»; crítico prints «≥ 0.60», never a saturated 1.00; personas físicas are counted, never named; no RFC; every figure carries its source and cut; a stored or stale figure says so.
7. **Plain Spanish first.** Short sentences a reader outside procurement understands (one idea, one number per clause); English is the twin, never an afterthought. Never «cola» (la fila de investigación).
8. **Enhance, don't rebuild.** The pages the owner loves are the reference and are enhanced in place: the dossier «El expediente por sexenios» (/vendors/2873, /institutions/251, /aria/caso/2873), /captura, El Mapa, /aria (the density reference).
9. **Paper, ink, red — by day and by night.** Source Serif 4 / Source Sans 3 / Source Code Pro, the canonical palette for meaning (§6), red only for crítico and the pulled record. A night edition is the same tokens inverted, not a second design.

## 1. Measured problems this fixes (baseline 2026-10-13)

| Owner complaint | Baseline | Rule |
|---|---|---|
| Letters too small | 2,371 sub-12px sites + 1,064 `text-xs` | floor 12 · body 15 (§2) |
| Text leaves spaces | 122 paragraph `max-w-*` in wide columns | measure = grid track, never a paragraph cap (§4) |
| Gaps between cells | 133 spacings > 48 | ladder 4–48, sections 32/48 (§3) |
| Uneven pages | 44 h1 styles, 2 shells | one shell, one dochead, one colophon (§5) |

## 2. Type — v3 scale (locked 2026-10-28) · faces picked 2026-10-28

**Faces — owner sampler pick, 2026-10-28.** **Source Serif 4** (text + display; variable, optical size 8–60 follows the font size, weights 400–700) · **Source Sans 3** (the label voice: semibold 600, sentence case, tracking 0 — not small caps) · **Source Code Pro** (data, 400/700). Self-hosted variable woff2, latin + latin-ext (`src/fonts.css`, files + OFL in `public/fonts/`); the retired names (Spectral, Spectral SC, IBM Plex Mono…) alias the new files so inline and canvas callers keep rendering. Tokens: `--font-serif` · `--font-sc` (name kept; it is the label voice) · `--font-mono` in `index.css @theme`, plus `--track-sc: 0`. The Source Sans face declares only weight 600, so every label renders semibold whatever its rule asks. Replaced: Spectral · Spectral SC · IBM Plex Mono (2026-10-13 → 2026-10-28).

| Token (`index.css`) | px / lh | Role · weight | Use |
|---|---|---|---|
| `--text-h1` | 24 / 1.2 (22 phone) | serif 600, −.01em, balance | the page's one headline: a sentence that carries the facts (was 30, 44 in the first lock) |
| `--text-h2` | 14 / 1.4 | label (sans) 600, ink rule under | section and Anexo heads — sections are registers, not chapters (was 19 serif) |
| `--text-fig` | 17 / 1.2 | serif 600, tabular | a clause figure, a verdict reading, any live figure (was 24) |
| `--text-fig-story` | 24 / 1.1 (20 phone) | serif 600, tabular | story clauses only (`<Clause size="story">`) |
| `--text-lede` | 15 / 1.5 | serif 400 | a page lede = body size; it is a paragraph of facts (was 17) |
| `--text-body` | 15 / 1.6 | serif 400 | prose, table text |
| `--text-chip` | 14 / 1.3 | serif 600 | an entity name in a chip or a dense table |
| `--text-label` | 12 / 1.4 (tabs 13) | label (sans) 600 | kickers, th, clause labels, the wire's label |
| `--text-data` | 13 / 1.45 | mono 400, tabular | numerals, amounts, IPS, procedure numbers |
| `--text-meta` | 12 / 1.45 | mono 400, gray | dochead, deltas, wire items, ticks, the status line — figures and data labels only |
| note (`.ct-note`) | 13 / 1.45 | serif 400, gray | notes, captions, footers, any sentence under a figure |

**Mono rule (owner 2026-10-29, phone photo: «the monospace … doesn't go with this project»).** Source Code Pro sets **figures and data labels only**: numbers, scores, amounts, codes, folios, axis ticks, the dochead/status metadata. Every **sentence** (notes, captions, ledes, footers, empty states) and every **link or link-button** is the body face (Source Serif 4) or the label face — never mono, even inside a mono line (`:where(.ct) a` takes the serif; a link inside a figure cell keeps the figure's face). A line that mixes both keeps the figures tabular in the serif.

**No hero numerals.** Nothing on a page is set above 24px; on live pages no figure is above 17 (the h1 sentence is the largest text). Three sizes do the work: 24 · 15 · 12–13.

Rules: nothing under 12px (SVG ticks 12 mono). No tracking (`--track-sc` = 0 on labels; was .04em on Spectral SC). One line-height per role. A paragraph alone on a full-width track caps at 72ch; two-column prose fills its track (§4). Uppercase never; the label voice (Source Sans 3 semibold, sentence case) carries kickers, th and clause labels. No accent-colored word inside headlines. `text-wrap: balance` on h1/h2, `pretty` on prose. Numbers `tabular-nums`. Links (`.ct-link`): body face, **ink**, 1px gray underline at offset 3px that turns ink on hover (owner 2026-10-29: no bright default blue); nav, vendor names, brand inherit ink. An amount that links to its record is ink with no underline until hover.

## 3. Space — ladder 4 · 8 · 12 · 16 · 24 · 32 (v3, locked 2026-10-28)

| Context | px | Token |
|---|---|---|
| inside a chip / between inline marks | 4–8 | |
| table cell (`.ct-table`) | **4 × 12** (th 6 / 12 / 6) — a 14px row reads ≈ 28 tall | `--pad-td-y` · `--pad-td-x` |
| clause (`.ct-clause`) | **8** top and bottom | `--pad-clause` |
| ruled-bar row (`.ct-brow`) · ledger row | 4 · 3 | |
| lede after h1 · section rule to h2 · annex lede · plate label | 4–8 | |
| h2 row to section body · sub-block heading to its body | 8 · 8 | |
| section to section · sub-block to sub-block | **24** (phone 16) | `--space-section` |
| column gap (cover, paired columns, `.ct-duo`, `.ct-cols2`) | 32 | `--space-col` |
| sheet padding | 8 top · 24 bottom (phone 20) | |

Nothing above 32 anywhere (was 48); a vertical gap above 32 is a layout error. Gutters 48 (16 phone) stay.

**Compaction v2 (owner 2026-10-21, «the elements still look super far apart»).** The rhythm above is the template; pages inherit it from `contrato.css`, `dossier.css`, `vendor.css`, `institution-dossier.css` and the `Panel` primitive. Three template devices carry the rest, in this order: (1) **fold** — a ledger longer than 12 rows shows 10 (secondary pair/register tables 6) and opens in place (`useRowFold` + `FoldToggle`); a paged ledger pages by 10; (2) **pair** — two short sections sit side by side at ≥1280 in `.ct-duo` (stacked below), only when both exist and their ink ends within 64px (proof:ui RAGGED); (3) **flow** — a ranked list of short items (largest contracts, subcategories, a year ladder) runs down two columns at ≥1280 in `.ct-cols2` (CSS columns, so ranks read down and odd counts never leave an empty cell). Compacting one column of a pair buys nothing — the taller column sets the height; shorten both or neither. Charts take the height their data needs: an object with a floor taller than its content (the «Después del apagón» relevo had a 700px floor) is a void.

**Phone is first-class (owner 2026-10-21, ≤760, `contrato.css`).** Numbers instead of drawn rulers: a `RuledBar` row is name · value on one line (no track, no axis); a figure row is 2-up (only an odd last figure spans) with no ruler end labels; a dossier ledger is `.ct-table.ct-stack` — one record per row, the `.ct-key` cell takes the line, the reading (`td.gauge`, number only) rides on it, the other cells wrap under it labelled from `data-l`; no sideways scroll. Phone-only folds use `.ct-phone-cut` rows + a `.ct-phone-only` `FoldToggle`. A section named by the sticky `SectionIndex` carries its h2 as `sr-only` (the index already says it); an aside sits on the section's ink rule (`.ct-sec-aside`). Decompositions are one line per factor (`.ct-wf`). Body ≥ 14 on phone, line-height ≥ 1.35, controls ≥ 44.

**Dense rhythm (owner 2026-10-20, «I still have to scroll down so much»).** Long pages carry a one-line sticky section index under the cover (`SectionIndex`), pair short blocks side by side where both columns end within 64px, flow short prose in CSS columns (`.mt-cols`, never a multi-row grid), and fold long secondary ledgers in place (`RuledBar fold`, `useRowFold` + `FoldToggle`: «Ver los N restantes»). Chip toolbars fit one line at 1920: segmented sort, a native select for long filter sets, «ver todas» at the row end.

Gutters 48 (16 mobile), measure fluid to 1,760 (§5.1). Nothing above 32 between blocks. Rules (1px `--color-border`) separate rows; ink rules (1px `--color-text-primary`) open a section and sit above a signature. No cards, no boxes, no shadows, no textures.

### 3.1 Compact chrome — the object gets ≥ 80 % of the screen (owner 2026-11-02, «Can we implement this philosophy in every tab?»)

After El Mapa's Cifras drill (ui/mapa-compact 324c75c4: list share 58 % → 84 % at 1440) the owner asked for the same on every tab, overriding the template freeze. The rule: **below the top bar, the page's object (list, chart, table, the dossier's first chapter) starts within 20 % of the viewport on an operate page and within the first screen on a read page.** Measured by `node scripts/proof-share.mjs /route` (head px, share %, head rule lines, duplicated controls, bottom bars) at 1440×900 and 390×844; audit of record `docs/COMPACTION_AUDIT_2026-11-02.md`.

1. **One toolbar row** (`DocHead` = the page toolbar): trail left; the page's switches (`views`) and small actions (`actions`: copy, export, CSV — `.ct-tool` buttons, label 12, 32px tall, 44 on touch) right. It wraps on a phone and on a narrow desktop (< 1280), one row at ≥ 1280. The default «Corte · Modelo» meta prints only when the row carries no switches or actions (the top bar already shows the cut). `sticky` pins the row under the shell on a list page (≥ 761); it publishes its measured height (ResizeObserver) as `--ct-stick` on `<html>` so column heads stick under it, and the page gets `scroll-padding-top` so a focused row never hides under it (WCAG 2.4.11).
2. **One-line head** (`Cover`): an optional `kicker` rides the h1's line (label face 12, never its own row); the h1 is 20 (phone 18), one line where it fits; the lede is **one line + «más»** (`kit/MoreLine`: the button appears only when the line is actually cut, opens in place, the whole text is always in the DOM). `fullLede` keeps a lede wrapped only on document pages where the lede is the reading. Cover top padding 8.
3. **Sticky column heads** (§8.1): every `.ct-table` th sticks at `top: var(--ct-stick, 0)` on desktop (≥ 1024; the wrapper stops being a scroll box there, so heads stick to the page), ink rule drawn as an inset shadow (borders vanish on sticky cells). 12 px label face, aligned over their own columns (they are the table's own th, never a separate header strip). On a dossier the sticky `SectionIndex` publishes the same variable.
4. **No bottom action bars.** A page's exits (copy link, export, «ver el expediente completo») are toolbar buttons, never a band at the foot of the object; a door that duplicates a switch in the toolbar is deleted.
5. **Dossiers keep their structure** («El expediente por sexenios» is loved): only the chrome compacts (toolbar row, one-line lede, notes behind the existing disclosure). Chapters, ribbon, lanes, lens and «La lectura» are untouched.
6. **Document pages** (methodology, datos, press): masthead compaction only (toolbar row + one-line head); their sections are the reading.
7. **Phone shell, two rows not four** (2026-11-02, owner on the Portada: «look at that white space between everything»): at ≤ 600 brand + tools share the first row (4 top padding), the live status rides the items row's right end (`ItemsRow`, where the row was empty), items row 44. Section gaps on the Portada use `--space-section` (24, phone 16), never a local 32.

## 4. Measure

Cover is `7fr 5fr` with 32 gap: h1 24 (the week's facts in one sentence) + meta + lede 15 | **side column = a ledger with deltas** (v3, locked 2026-10-28): «Esta semana» Δ vs last week, «La corrida» Δ vs last run, one row per figure (label · value · Δ), so the far side of the cover carries data, never a twin of the lede. The chain → mini Atlas → Declaraciones stack is retired from the cover; the Atlas is the full sky below. Prose fills its track; no `max-width` on paragraphs. Mobile: single column, headline → lede → ledger.

**Risk-3 rule (2026-10-28): live chrome only where something moves.** The wire (§5) and the Δ ledgers appear ONLY on a page that has a feed scoped to it — the site's events (Portada), an entity's signatures (dossier), a run's deltas (ARIA register). A page whose data does not move between cuts (a 2019 story, a category dossier, methodology) carries neither: its dochead alone says the cut. Live chrome on a still page is a promise the page cannot keep.

### 4.1 Enforcement (added 2026-10-14 after the cap came back twice)

- `lint:tokens` FAILS on any paragraph cap (`max-width: Nch`, inline `maxWidth: 'Nch'`, `max-w-prose|2xl|3xl|[Nch]`) in migrated surfaces (`components/{contrato,aria,cases,sectors,atlas}`, the migrated pages); WARN elsewhere until that wave lands.
- **`npm run proof:ui [/route …]`** (frontend/scripts/proof-ui.mjs) is the spacing gate. It measures the RENDERED page on the dev server at 1440 and 390 and FAILS on: VOID (text block with ≥ 160px slack and nothing beside it), CHASM (≥ 56px with no ink inside the measure), RAGGED (side-by-side columns whose bottoms differ ≥ 64px), OVERFLOW (page wider than 390). It runs with the other three gates on every migrated page before a commit and before anything is shown to the owner. Thresholds are not tuned to pass; the layout is fixed.
- A paragraph alone on a wide track is a layout error, not a measure problem: give it a sibling (figure, aside, second column) or let it fill. Never cap it.

### 4.2 «En cifras», not «Cláusulas» (owner, 2026-10-14)

The numbered-clause conceit («Primera. Del monto adjudicado · § Citar») read as noise without context. The headline row is now **En cifras / In figures**: a plain label that says what the number is and over which years, the figure, an optional ruler whose end labels carry units, and a one-line note. No ordinals, no § Citar on figures (citation stays on dossier records). The `Clause` component keeps its name and props; `ordinal`, `cite`, `doc` are ignored.

## 5. Shell — every route (v3, locked 2026-10-28)

```
top bar 48   logo (locked mark) RUBLI 1.0 · 5 group tabs (SC, hue underline) · LIVE STATUS · ES/EN · Modo oscuro / Modo claro · Buscar Ctrl K
items 48     (< 900 only) active group's pages, 4px hue bar at left, aria-current=page
dochead      Registro › sección › página          corte · modelo     (12 mono, ink rule below)
WIRE 32      the week's events, scoped to the page — only where a feed exists (§4 risk-3 rule)
cover        h1 24 + lede 15 | ledger with deltas (§4)
fichas       clauses (§8): label SC 12 · fig 17 · ruler 12 · note 12 · Δ in the label row
object       the page's one visual (sky, spine, register)
anexos       h2 14 SC + lede + table / ruled list
conexiones   every page ends in its doors (§0.5), before the firmas
firmas       site footer (2026-11-02): tinted band, no rules · project line | 5 link groups from NAV_GROUPS · one meta line + ES/EN · Modo oscuro / Modo claro
```

- **Live status** (top bar, right cluster): a dot · «corte {fecha}» · «próximo {fecha}» from `GET /stats/data-cut` (`useDataCutInfo`). The dot breathes only while the cut is ≤ 7 days old. `weekly_status: degraded` reads «actualización parcial» (amber dot), `failed` «actualización fallida» (red dot). On a phone the dates go; the dot stays (its word read to screen readers), and an alert keeps its word.
- **Night toggle**: a «Modo oscuro» / «Modo claro» button (`aria-pressed`), persisted in `localStorage` (`rubli-edition`); with nothing stored it follows the reader's `prefers-color-scheme`. It sets `<html data-theme="night">`; §6.7 re-values the tokens.
- **The wire** (`<Wire>`, ≥ 32px, rule below): label «▲ Última hora» · ONE event at a time from `GET /events`, newest date first (award, first_supplier, critical, direct_spike, weekly_refresh, month_close), each with its own date («1 nov · ayer») and a plain what-happened clause after the buyer (siglas chip + its sector square). Every item is a link: institutions through `EntityIdentityChip`, the words to the contract or the record. Vendors are not named on the wire (the feed does not say which ones are personas físicas). Stepped (2026-11-02, owner «it goes by so fast I can't even read it»): see §7. Mounted on the Portada only (wave 1).

Group hues: Descubrir `#2563eb` · Investigar `#be123c` · Explorar `#16a34a` · Análisis `#1e3a5f` · Plataforma `#6f6a63`. Surfaces: **folio** (landings, dossiers, stories: full shell) · **ledger** (queue, rankings, compare: shell + Anexo table) · **tool** (settings, auth: top bar + dochead only).

### 5.1 Object first (owner, 2026-10-15: «minimal or no headers»)

- **Measure is fluid**: `.ct-wrap` fills to 1760px with 48px gutters. Tables and charts take the track; nothing is sized in fixed px widths.
- **Operate pages** (ledgers, El Mapa, El Anaquel, Focos Rojos, dashboard search): DocHead line → h1 ONE line at 24px (`<Cover className="is-op">`, no side column) → THE OBJECT at full measure, starting within 200px of the top at 1440×900 → «En cifras» → the rest → the foot: the former lede (15, visible) + ONE `<FootNotes>` (OWNER_REVIEW 2026-10-28 § G1; the «Declaraciones» list is retired).
- **Read pages** (dossiers, stories, methodology): a compact cover — h1 24 (one line where possible), one-line lede, the entity's key figure as the lead; side column only when it carries data, never prose.
- Chrome is one 48px bar. Nothing in the first screen is explanation; the explanation follows the object.

## 6. Color — canonical palette, used for meaning (v2, 2026-10-14) · «Sala de redacción» picked 2026-10-28

**Palette — owner sampler pick, 2026-10-28: «Sala de redacción · alto contraste»** (pure white, pure black, neutral gray, darker rules) with the **«ajustados»** categorical set; Salud keeps `#dc2626` (owner's choice); links stay blue. Replaced the warm set (ink `#141414`, gray `#6f6a63`, rule `#d9d6d2`, tint `#f5f4f2`, seal `#c4161c`). The *roles* are locked. Every value is a token in `index.css` (marks read by charts also in `lib/constants.ts`) and is re-valued in one place for night (§6.7).

Paper and ink carry the page; color carries meaning. Four families, nothing else. Every hex below is the only place it is allowed to come from (`lib/constants.ts` + `index.css @theme`); `lint:tokens` fails on any other literal.

### 6.1 Base

| Hex | Role |
|---|---|
| `#ffffff` · `#000000` · `#444444` · `#bfbfbf` · `#ececec` | paper · ink · gray (text-muted, 9.7:1) · rule · tint / row hover |
| `#d0021b` | seal red: the pulled record, the cited clause, the logo pull. Nothing else. |
| `#2563eb` | categorical C2 (links were this blue until 2026-10-29; they are ink now, §2) |

### 6.2 Severity (risk) — unchanged

`#dc2626` crítico · `#d97706` alto (`#b45309` as text) · `#a16207` medio (`#854d0e` as text) · `#71717a` bajo. Gray, never green. Needle, reading, gauge zone, risk chips. Red and amber are **reserved** for severity: no categorical series may use them.

### 6.3 Categorical — ONE set of 8, indexed

Replaces the six competing identity sets (eras 5, patterns 7, compare 2, tiers 5, OECD cyan, signal). Series, legends, small marks and chips all draw from this list **by index**; a surface never invents a hue.

| # | token | mark | text twin (≥4.5:1 on paper) | note |
|---|---|---|---|---|
| C1 | `cat-ink` | `#000000` | `#000000` | first series is always ink (sampler c8 «la entidad») |
| C2 | `cat-blue` | `#2563eb` | `#1d4ed8` | = link blue |
| C3 | `cat-teal` | `#0f9f8a` | `#115e59` | chroma raised (sampler) |
| C4 | `cat-violet` | `#6d28d9` | `#5b21b6` | |
| C5 | `cat-magenta` | `#be185d` | `#9d174d` | |
| C6 | `cat-cyan` | `#0e8fb5` | `#155e75` | chroma raised (sampler) |
| C7 | `cat-brown` | `#9a4a0a` | `#78350f` | re-stepped (sampler) |
| C8 | `cat-slate` | `#64748b` | `#475569` | "other / rest" |

**Sampler → app mapping (2026-10-28).** The sampler numbered «ajustados» c1 blue · c2 teal · c3 violet · c4 magenta · c5 cyan · c6 brown · c7 slate · c8 ink. The app keeps its own index order and maps **by hue, not by number**: sampler c1→C2, c2→C3, c3→C4, c4→C5, c5→C6, c6→C7, c7→C8, c8→C1. So every meaning below keeps its hue family; only three hexes moved (C3, C6, C7). Validated (`dataviz validate_palette.js`, 2026-10-28): the six hues C2–C7 PASS on `#ffffff` (band, chroma, worst adjacent CVD ΔE 13.4 deutan, normal floor 24.7, ≥ 3:1); ink and slate are neutral by design (entity / «otros»).

Assignments (fixed, so a thing keeps its color across pages):
- **Administrations**: Fox C2 · Calderón C6 · Peña Nieto C7 · AMLO C4 · Sheinbaum C5 (same hue families as today's `ADMIN_COLORS`, so the 13 stories keep their meaning).
- **ARIA patterns** P1–P7 → C2…C8 in order.
- **Compare A vs B**: A = C1 ink, B = C2 blue (replaces amber/cyan).
- **Procedure type**: licitación C2 · invitación C6 · adjudicación directa C1.
- **Transparency tiers**: keep the steel-blue sequential ramp in `lib/tiers.ts` (it is a scale, not categories).
- **Sectors**: the 12 sector hexes stay as they are, sector surfaces only (10px square before the name).

Two series on one chart → C1 + C2. Three → + C3. Never more than 6 categorical hues on one figure; the rest collapse into C8 "otros".

### 6.4 Sequential and diverging ramps (density, intensity, heat)

| ramp | steps (light → dark) | use |
|---|---|---|
| `ramp-ink` | `#ececec` `#bfbfbf` `#8c8c8c` `#444444` `#000000` | density, counts, share (mini Atlas, marimekko, heat tables) |
| `ramp-red` | `#fde8e8` `#f5b5b5` `#e57373` `#dc2626` `#991b1b` | risk intensity, indicator ≥ 0.40 only |
| `ramp-amount` | `#ccebe6` `#6cc3bb` `#2a9bb8` `#3b5fd9` `#3b1a8f` | money intensity on a page whose red is the flag (Empezó antes del fallo, 2026-10-20) |
| `diverge` | `ramp-red[3]` ↔ paper ↔ `#2563eb` | above/below a baseline (UE 10%, sector mean) |

Ramps use `color-mix(in oklab, …)` for intermediate steps in CSS; chart code reads the 5 stops from `constants.ts`.

### 6.5 Small things — tints and states

- **Tint**: any categorical or severity hue at **8%** on paper (`color-mix(in srgb, var(--hue) 8%, white)`) for chip backgrounds, row highlight, legend swatch wells. Text on a tint uses the hue's text twin.
- **Status** (live/warn/danger dots in the top bar only): live `#16a34a` (the only green on the site; never near a risk number), warn `#d97706`, danger `#dc2626`.
- **Focus ring** 2px ink. **Selection** `#fde8e8`. **Disabled** `#b0b0b0`.
- Group hues (§5) stay nav-only.

### 6.7 Night — the same tokens, re-valued (v3, locked 2026-10-28)

`<html data-theme="night">` re-values the SAME roles in `index.css` (one stylesheet, no second design, no `dark:` variants). **Opt-in only** (owner 2026-10-28, «high contrast and also day»): the «Noche» toggle sets it; the site never follows `prefers-color-scheme` (charts are not yet night-safe). Values = the sampler's «Sala de redacción» night (OLED black) + «ajustados» night. Validated with the `dataviz` validator against ground `#000000` (categorical marks C2–C7: lightness band 0.48–0.67, worst adjacent CVD ΔE 9.2, contrast ≥ 3:1) and WCAG text contrast ≥ 4.5:1.

| Role | Day | Night | Note |
|---|---|---|---|
| paper · ink | `#ffffff` · `#000000` | `#000000` · `#ffffff` | swap |
| gray (text-muted) · rule · tint | `#444444` · `#bfbfbf` · `#ececec` | `#b3b3b3` (10:1) · `#3a3a3a` · `#121212` | |
| seal red | `#d0021b` | `#ff4d4d` (text `#ff6b6b`) | lifted |
| crítico · alto (text) · medio · bajo | `#dc2626` · `#b45309` · `#a16207` · `#71717a` | `#f05252` · `#f2b35a` · `#d4a72c` · `#8b8680` | bajo stays gray, never green |
| categorical marks C2–C7 | §6.3 | `#4d82f0` `#1aa892` `#8b6cf0` `#e0558f` `#1599b8` `#d97706` | C1 = ink, C8 = slate `#94a3b8` |
| categorical text twins | §6.3 | `#7aa2ff` `#2dd4bf` `#a78bfa` `#f472b6` `#22d3ee` `#e0a46a` | |
| sector `defensa` | `#1e3a5f` | `#60a5fa` | the only sector hex that changes (unreadable on ink) |
| live dot | `#16a34a` | `#22c55e` | links are ink in both themes (§2) |

Arrival tint is 8 % seal in both themes. Charts that read hexes from `constants.ts` at draw time keep their day colours until migrated to tokens (later waves); a chart unreadable at night is a bug to fix on that chart, not a reason for a second palette.

### 6.6 Banned

Random Tailwind hues (`emerald`, `lime`, `sky`, `fuchsia`…), green for anything that reads as "good" or "low risk", gradients, glows, hex literals outside `constants.ts`/`index.css`, more than one categorical set per page.

## 7. Data vocabulary (from J)

- **Needle gauge** (risk): 200×24, ticks every .05, ink rulers at .25/.40, red ruler at .60, zones tinted ochre/amber/red, needle colored by level, reading `0.81` mono 700 + level word in small caps. "Leer contra umbral" moves a dashed ruler across the table and fades rows below it. Header carries the scale 0 · .25 · .40 · .60 · 1.
- **Ruled bar** (shares, amounts): axis with mono ticks, 16px ruled track, 2px bar with an end-cap tick, value right-aligned mono; critical rows red with "indicador ≥ 0.60".
- **Clause ruler** (a stat with a ceiling): `.mini` 16px scale with filled share or pointer, ends labeled; **dimension line** for a span (2002 – 2025).
- **Pulled record**: 12px translateX + 3px red inset rule + dashed ghost; used for the cited clause, the selected row, the chain's flagged vendor.
- Existing primitives keep their geometry (Atlas constellation, DotStrip/DotBar, EditorialTimeline, BenchmarkRow) and take these tokens.

**Motion tokens** (R1, 2026-10-14; `index.css @theme static`): `--ease-out: cubic-bezier(.23,1,.32,1)` · `--ease-draw: cubic-bezier(.2,.7,.2,1)` · `--ease-pull: cubic-bezier(.3,.7,.2,1.25)` · `--ease-settle: cubic-bezier(.34,1.5,.6,1)` · `--ease-exit: cubic-bezier(.4,0,1,1)` · `--dur-press: 120ms` · `--dur-state: 200ms` · `--dur-pull: 420ms` · `--dur-reveal: 700ms` · `--dur-settle: 900ms` · `--stagger: 60ms`.
- Bounce curves (`--ease-pull`, `--ease-settle`) only on the pulled record and the needle settle; everything else `--ease-out` / `--ease-draw`.
- One load sequence per session (sessionStorage), t0 = the cover's data, ends ≤ 2.0 s, the page interactive beneath from 0 ms, skippable, once per session (owner-approved intro 2026-10-29); repeat visits render the final state; nothing loops (the logo's idle loops are owner-locked).
- **The intro «El expediente»** (`contrato/IntroOverlay.tsx`, spec `_explore/intro_2026-10-28/README.md` A): a fixed sheet on the first route of the session only; the locked mark plays its own mount animation at 112 px, one 13 px mono line types with its scan at 850 ms («N contratos · 2002–2026 · corte …» from `/executive/summary` + `/stats/data-cut`; what has not loaded by then is left out), and at 1500 ms the mark FLIPs (400 ms `--ease-out`) onto the top-bar mark, which shares its t0; gone at 2000 ms. Click, wheel or any key skips (150 ms) until the hand-off; during it the sheet lets clicks through. Reduced motion: no intro. Transform, opacity and clip-path only; CLS 0.
- Reveals play once (`useInView({ once: true, amount: .4 })` sets `data-in`; CSS plays off it): figures count up 700ms into a ref, rulers fill/settle with them, ruled bars fill with 40ms stagger capped at 300ms. Never in tables or Anexo rows.
- Interactions are CSS transitions (interruptible): color 120ms, `:active` scale(.97) 120ms, row background 80ms, hover underline gated by `(hover:hover) and (pointer:fine)`, focus ring instant. Pull: translateX(12px) 420ms `--ease-pull`, red rule scaleY 220ms, ghost to .55 from 120ms, release 200ms `--ease-exit`.
- Still: prose, headline, lede, Declaraciones, shell, tables, route changes. Reduced motion: final states, no translate/scale, color/opacity transitions kept.

**Live motion (2026-10-28, §0.2).** The record now moves weekly, so three motions are allowed that the rules above forbid — each only when it reports a real new fact, each once per fact:
- **Arrival**: a row that is new since the reader's last visit (or since the last refresh) slides into its table (translateY 8px → 0, 420ms `--ease-out`) and keeps a 8% tint for the session. Existing rows never animate.
- **Landing**: a contract new this week lands in the El Mapa sky at its institution (a dot drawing in, 700ms `--ease-draw`) with a pulled label; ringed red only at crítico.
- **Ticker = the wire** (§5), **stepped, never rolled** (2026-11-02): a marquee moves text while it is read. One item holds still for `dwellMs` (≈ 15 characters a second + 1.5 s, clamped 4–8 s), then swaps in 240 ms (opacity + 6 px rise, `--ease-out`, CSS); the strip reserves its height (phone: three lines) so a swap never moves the page. Holds on hover, focus, touch, a hidden tab and «detener» (`aria-pressed`); ‹ › step by hand (and hold); `aria-live` is polite only while held. **Reduced motion: the six newest as a still list (four on a phone).** It exists only where the page has a scoped feed (§4 risk-3 rule).
- **«Contratos recientes» board** (was «Contratos de la semana»; Portada only, owner 2026-11-02: «an airport dashboard … a big scoreboard»; v2 2026-11-03: no airplane, more columns, a legend, a light board by day): the week's contracts under El Mapa's sky as a split-flap board (`--board-*` tokens: plate paper by day, the dark board by night; every text role ≥ 4.5:1 in both), one group at a time (12 rows at desktop, 8 on the phone — owner 2026-11-03; fixed row heights); every 20 s (`BOARD_CYCLE_MS`) the window steps one contract down the group and every cell split-flaps without ever going blank (2026-11-03: the new face, opaque on the board colour, falls over the old one, rotateX −90° → −4° on `--ease-swap` then a small settle to 0 on `--ease-out`, 750 ms, rows 75 ms · cells 30 ms stagger, a full 12-row step ≈ 1.8 s; the old face stays whole until its own flap lands; rows keyed by position). The contract groups (100 MDP+, crítico, primer contrato) roll on past the week into older contracts, newest first, paged lazily (`GET /events?type&limit=24&offset`, up to 200); a heavy rule marks the first row older than the week; **the week's rows stay pinned above that rule and only the older rows under it roll, so the rows above the rule always equal the tab's count** (2026-11-03 fix: «9 in the tab, 8 above the line»; `lib/wire.ts boardWindow`, tested; a week that fills the board — the phone's 8 rows — rolls as one window); the date column is bold board ink; tab counts and the header line stay the week's. At the end of a group's pool the next group; holds on hover/focus/touch/«detener», a hidden tab or off-screen. Board voice (mono caps) on dates, labels, amounts and chips; buyer, vendor and category names in the reading face, normal case, 14 px (phone 13). Amounts: MDP in Spanish, US$ at the year's Banxico FIX in English. Phone: three lines per row — buyer … amount · vendor … indicator · date, procedure glyph and category. Columns: date · sector (dot + name; ≤ 1279 px the dot leads the buyer) · buyer (`institutionShortName`: data siglas → data short_name → vetted map → compaction, one line with «…»; full name in title/label; board ink, never sector-tinted text) · vendor · category (`lib/categoryShortName`: a vetted ≤ 26-character ES/EN label for each of the 72 active categories, full name in title/label; whole at 1440, two lines below 1280, never «…») · amount · procedure glyph (■ directa · ● licitación · ◐ invitación · ○ other tender) · indicator chip (low = muted outline) · status tag (NUEVO since the last visit · REVISAR > 10,000 MDP), and a legend row that names every symbol. Tabs name their subject in plain words (owner 2026-11-03): «Contratos grandes» · «Contratos de riesgo crítico» · «Empresas nuevas» · «Dependencias que licitan menos» · «Focos Rojos sin caso público»; above the phone they wrap to a second row, never «…»; the selected tab's one-line description sits under the tabs and says only what the group's query selects (never «alerta»: reserved for the rules engine). The category column header reads «Qué se compró» (title: «Categoría de gasto…»). «Dependencias que licitan menos» reads buyer · no-tender share «antes → ahora» (12-month average → last 14 days, as numbers and a thin before/after bar pair) · the value awarded directly in those 14 days; no procedure or indicator columns (any column empty for a whole group drops out: «Focos Rojos sin caso público» has no sector or procedure); the legend names only the symbols on screen. The one approved exception to §0.1's «no big numerals» and §9's uppercase ban. Reduced motion = no flip, no cycling. The board keeps the tallest group's height so the page never jumps.
- **Page question + «Cómo leer esto»** (2026-11-03, `docs/PAGE_QUESTIONS.md`): every page opens with `kit/PageQuestion` — its guiding question as one label line (13, not a headline), then «Qué ves · Cómo se lee · Qué significa», one sentence each, ≤ ~60 words, ≤ 1 number, the finding computed from live data (Portada: the sky's top buyer and its share + the top supplier). A figure whose making a newcomer cannot guess gets `kit/HowToRead`: three numbered steps over ONE real record (≈ 3.3 s each, plays once at 40 % in view, holds off-screen; each step a button, «Ver todo» / «Repetir»; bodies always in the DOM; CSS transitions on transform + opacity, marks on `--ease-swap`; reduced motion = three static panels). Portada: «¿Cómo se mide el riesgo?» under the board (`portada/RiskHowTo`) — the week's newest critical contract → its three strongest upward model reasons in plain words, each a ruler (grey band = ±1 SD of its sector-year baseline, ink mark = this contract) → the needle on the 0–1 scale, «se parece a casos documentados; no prueba nada». Never «precio».
- **Arrival in code**: `useArrivals(rows, getKey, getDate, scope)` (`lib/arrivals.ts`) compares each row's date with the reader's last-visit stamp (`localStorage`, try/catch) and returns the keys new since then; `<tbody className="live">` + `tr.is-new` plays `ct-arrive` (translateY 8 → 0, 420 ms `--ease-out`, once) and keeps the 8 % tint for the session. Reduced motion: no travel, the tint stays.
- One moving thing per screen. A status dot may breathe only while its data is ≤ 7 days old.

### 7.x Ruled lists — reference mark, compact rows, paired lists (added 2026-10-14, dashboard Anexos 1–2)

- `RuledBar mark={{ at, label }}` draws ONE red 1px rule through every row and labels it on a second axis line (axis grows 24 → 40px). Use for the EU 10 % line, the national mean, a threshold. Never more than one mark per list.
- `.ct-rb-compact` wrapper: name · track · value on one line (`minmax(160px,2fr) 3fr 88px`, row padding 6). For lists of ≤ 12 short names beside a side column or paired with another list. Falls back to two-line rows ≤ 760px.
- `.ct-ledger2`: two ruled lists side by side in the SAME row order (`1fr 1fr`, gap 48, both axes 40px). The dashboard's «Los doce sectores» pairs monto (sector hexes) with the flagged share (ink + national mark). Stacks ≤ 760px.
- Old `ObservatoryScatter` orbs and `MacroArc` are retired from the dashboard: the Atlas is now El Mapa › Vínculos (sky engine) and the per-term direct-award share reads as a ruled list on the EU mark.

### 7.p Patrones — `components/kit/patterns` (2026-11-04, owner: «some of those shapes/patterns… not eccentric, just something»)

Six quiet patterns, our own, generated in code (`Patterns.tsx` + `patterns.css`). Nothing is copied from a pattern library: Book of Shapes' licence forbids redistributing its patterns and this repo is public. **Each pattern has ONE meaning.** A pattern on a mark states that meaning, so a pattern is never ornament on data. Specimen: `/_dev/patterns` (dev builds only).

| Pattern | Looks like | Means (only this) | How |
|---|---|---|---|
| `sin-dato` | «/» hatch, 1 px every ~4 px | **sin clasificar / sin dato**: the mark has no value or no class | SVG `fill={patUrl(uid,'sin-dato')}` · HTML `.pat-sin-dato` · legend `<PatternSwatch kind="sin-dato"/>` |
| `estimado` | 1 × 1 px squares every 4 px | **estimado / dato débil**: the value is estimated or weakly sourced (Structure A, 2002–2010) | SVG fill · HTML `.pat-estimado`; keep an ink outline so the mark's size still reads |
| `consolidada` | basket weave, 6 px cells | **compra consolidada**: the slice bought once for several agencies | SVG fill on that slice only |
| `campo` | one soft sine per 16 px, ink at 10 % | **nothing**: the background field behind a plot area | SVG fill on a rect BEHIND the marks; never inside a mark, never behind body text |
| `foco` | 3 concentric rings, fading out | **foco**: the one finding the sentence names | `<Foco cx cy r/>`, one per figure · HTML `.pat-foco` (`--pat-x/--pat-y`) |
| `sexenio` | every other term tinted 4 % (night 7 %) | **sexenio ranges** on a year axis | `<SexenioBands x={year→px} y height from to/>`; parity from Fox = 0, so a term keeps its tone on every chart |

Tokens (`patterns.css`, light and night): `--pat-ink` (text-muted 62 %, night 58 %), `--pat-ground` (transparent), `--pat-field`, `--pat-band`, `--pat-foco`, `--pat-w` (1 px), `--pat-step` (4 px). Re-tint one use with `style={{ '--pat-ink': hue }}` on the element (HTML) or on the `<svg>` holding the `<PatternDefs>` (SVG pattern content inherits from where it is defined, not from the shape using it). Categorías' «sin tipo» rows are `sin-dato` in the row hue (`--pat-w: 2px; --pat-step: 6px`).

**Do**
- One `<PatternDefs uid>` per SVG (`uid` unique on the page); shapes reference it. No per-mark pattern DOM.
- Draw the figure at its rendered pixel width (no `viewBox` scaling) so tiles stay on whole pixels, crisp at 1× and 2×.
- Name every pattern on screen in the legend or the «cómo leer» line, in both languages (`PATTERN_MEANING`).
- Text over any pattern gets a paper halo (`paint-order: stroke; stroke: var(--color-background)`); `campo` and `sexenio` are light enough to sit under axis labels.

**Don't**
- Give a pattern a second meaning on one page or across pages (the persona-física hatch in `CategoryCover` / `GapAfterBlackout` is a known second use, to migrate to a meaning of its own).
- Use a pattern to separate series (that is §6.3 categorical colour) or to fill a mark «for texture».
- Animate a pattern. They are static, so reduced motion needs nothing.
- Put red, amber or a categorical hue in a pattern unless it is the row's own hue (as in Categorías).

## 8. Components (v3, locked 2026-10-28)

| Primitive | Spec |
|---|---|
| Clause «ficha» (`Clause`) | no ordinal, no § Citar · **label SC 12** gray · **Δ in the label row** (`delta` prop; mono 12, ▲ red / ▼ gray, never a coloured pill) · **fig 17** (`--text-fig`; story clauses opt into 24 with `size="story"`) · unit mono 12 · **ruler 12** with an optional reference pointer · **note 13** body face · padding **8** |
| View switch (`ViewSwitch`, kit) | OWNER_REVIEW 2026-10-28 § G3 · the page's views ride the DocHead row, right (`<DocHead views={…}>`) · each page names its own views by what the reader sees («El muro · La fila», never «Visualización · Lista») · segmented: 1px ink frame, 32px segments (44 on touch), label 13, pressed = ink fill · `role=group` + `aria-pressed` · every other choice group (sort, lens, in-section tabs) is the quiet form: no frame, pressed = ink + 2px rule under, so the two never look alike |
| Notes (`FootNotes`, kit) | OWNER_REVIEW 2026-10-28 § G1 · one per page, at the foot, never mid-page · native `<details>` collapsed to one line «Notas y fuentes · N» / «Notes and sources · N» · open = one run-on paragraph of numbered notes, body face 12 (§2 mono rule) · `lead` = the one line that stays visible (the «indicador de riesgo, no prueba» disclaimer) |
| Table / list (`.ct-table`, `.ls`) | see **§8.1 «Listas»** — the one list standard, after /aria |
| Page question (`PageQuestion`, kit; docs/PAGE_QUESTIONS.md) | the one explanation template, every page (owner 11-03/11-04: «maintain an explanation and play with the graphic itself… why are we having another graphic?»). STRIP always on: the question as a mono 12 caps kicker in the board's voice (the one place uppercase is allowed, as the board), the finding («qué significa») under it as the only ink sentence, serif 15, a ③ mark before it; control «Cómo leer esto ▸» SC 12 (~64px on a desktop). TOUR on demand, never auto: a short narration over the page's OWN chart, the risk explainer's variant B method (script first, each word timed by a reading pace, `lib/narration.ts`; ghost .22 → ink word by word), smaller and with no second figure. ① qué es → ② cómo se lee are the script's two scenes, ③ qué significa is the finding; a `[#cue]` before a word frames the part it names (`cues`: name → selector): the viewport dims (`--color-bg-base` 62 %) around a 2px ink ring, the callout (label plate: engraved mono numeral, sans label, serif caption) sits beside it — inside the top-right corner of a big part, below or above a small one — on a 1px leader with a dot at the part (the anatomy / diagram explainers' annotation style). ‹ 1 2 3 › with a 2px progress rule under the playing dot, Pausar · Listo, ← → Esc, focus in and back, Tab wraps; chips under ③ (`followups`) = the page's next questions (a link or an action the page already has). Phone: bottom sheet, ring stays. Reduced motion: no clock, all inked, steps by hand. Callout placement (`place`): beside the part — below, above, right, left, the first that fits without touching the ring — else, for a part as big as the screen (the sky), the viewport corner opposite the part's centre (owner 11-04). ON BY DEFAULT on every page (owner 11-04: one look; the three ruled columns are retired); `?pq=0` hides it for the session (testing). A page that prints its finding as its h1 passes `findingAt` (one finding, not two: /aria, El Arranque, El Archivo); a page with no chart (Plataforma) gets the question + finding, no tour. Scripts (owner 11-04 «dumb it down»): Spanish first, usted, ≤ 45 words, ≤ 15 words a sentence, 3 cues on the page's real chart, ≤ 1 number, plain words («señales de alerta», never bare «indicador / patrón / prioridad»), never «precio». /aria: the strip IS the question bar — `aria/AskBar` sentence-builder (tokens open a sexenio strip · sector chips · buyer search · plain kinds; sheet on a phone). |
| Notes on a figure (`FootNotes title={…}`) | a figure whose reading needs more than its key (the Anaquel) folds its notes right under it, named for what they explain («Cómo se lee el anaquel · N»); never a mono paragraph wall |
| Tabs | SC 13, 44px, 2px ink underline, counts mono 12 |
| Chip / Button | 40px; chip 1px rule border; button ink fill SC 13; `:active` scale .97; focus 2px ink ring |
| Top bar status / night toggle | §5; mono 12; toggle 32px tall inside a 40px target, `aria-pressed` |
| Wire (`Wire`) | §5/§7; stepped; label SC 12 + red ▲; date mono 12 + item serif 14; ‹ n/N › «detener» |
| Search (lead) | 2px ink border, 4px inset, 44px input serif 15, ink button, example chips; Ctrl K |
| Site footer (`Firmas`, owner 2026-11-02: «look at all those lines») | one `--color-background-elevated` band, NO rules · left: «RUBLI 1.0» 15 600 + one 13 serif sentence (indicators are not proof) · right: 5 link groups (Explorar · Investigar · Análisis · Datos y método · Proyecto), heads label 12, links serif 13 gray → ink on hover, ≥ 28 px rows (32 on phone), pages read from `NAV_GROUPS` so the footer and the top bar never disagree · then ONE meta line, serif 12 tabular: © Proyecto RUBLI · modelo + AUC · corte · dataset + DOI · licences · prensa@ — with ES/EN + Modo oscuro / Modo claro at its right · 6 → 1+3 → 2 columns at 1280 / 760. The «Declaraciones III–IV · Por el autor · Testigo» signature conceit is retired. |

### 8.1 Listas — the one list standard (owner 2026-10-29: «The lists are not so good on most pages. The one in Red Flags (Focos Rojos) is the best we have: it has more life, it's properly numbered. Adapt it.»)

Model: **La fila of /aria** (`components/aria/RegisterRow.tsx`). Every register, ranking and record list is ONE of two forms with ONE row anatomy. Code: `components/kit/ListRow.tsx` (`RankTh`, `RankCell`, `rankNo`, `ListRow`), CSS in `contrato.css` (`.ct-table`, `.ct-stack`, `.ls`).

| Form | Use for | Code |
|---|---|---|
| **Table** | a register with columns the reader compares or sorts (≥ 3 figures per row) | `.ct-table.ct-stack` in `.ct-table-wrap`; `<RankTh>` / `<RankCell n>` first (`role` passes through for tables that spell out ARIA roles) |
| **List** | a list that is not a grid: a feed, a short ranked list beside a figure | `<ul className="ls">` + `<ListRow rank name meta amount reading>` |

**Row anatomy (both forms).** One row = one record.

- **№** (`RankCell` / `rank`): `001` — padded to three digits (`rankNo`), mono 13 tabular, **ink**, one width (28px) on every page; th «Nº» (`RankTh`, read aloud «Número» / «Rank»). A case file keeps its folio in the same cell. /aria adds its provenance mark beside it (gt · lead · disc, label face 12).
- **Name** (`td.ct-key` / `name`): the entity through `EntityIdentityChip size="inherit"` (full name, never truncated) — **15 · 600, body face**; every chip in the key cell takes the cell's size (one name size per table, enforced in CSS). A persona física reads «Persona física (no se publica el nombre)», never a blank. A second entity (contract → supplier) is a second, muted line.
- **Inline mini-visual** where the page has one: the /aria signals, the case severity dots, the Captura lock strip, the sector square. Never more than one per row.
- **Figures** (`td.num`, `.ct-amt`, `amount`): right, mono 13 tabular, ink; currency through `formatCompactMXN`; † > 10,000 MDP. A linked amount is ink, no underline until hover.
- **Indicator** (`td.gauge` / `reading`): `<RiskGauge>` (0.00 + level word, coloured by level; red only for crítico). A list that is all one level (the Portada's «crítico» feed) drops the repeated word (`.ls.no-lvl`): its head already says it.
- **Meta** (list form): buyer by its **siglas** when it has them (`inferSiglasFromName`, `lib/entity/siglas.ts`) · date · procedure — body face 13, gray (dates are figures but read in the sentence face here).
- **Header**: th = label face 12 gray on the ink rule; sortable th = `SortHeaderTh`.
- **Rhythm**: td 8 × 12 (`--pad-td-y` 8, as /aria); every cell on its first line's baseline; rows ruled 1px `--color-border`, the table opens on an ink rule. No zebra, no cards.
- **Hover / focus**: the whole row tints `--ct-tint` in 80 ms (pointer-fine); focus = 2px ink ring on the link/button. A row that opens (ARIA, contracts) is the pulled record (§7): its toggle is a `<button aria-expanded aria-controls>` in the № cell.
- **Fold / empty / loading / arrivals**: > 12 rows show 10 (`useRowFold` + `FoldToggle`); empty = one spanning row «Quitar filtros · Esc»; skeleton rows of the real height + `aria-busy`; `tbody.live` / `.ls-row.is-new` for arrivals (§7). No other motion in lists.

**Column presets (owner 2026-10-29: «all the tables on the website, with some special columns depending on what we are showing»)** — `components/kit/ListCells.tsx` `PRESET` + cells (`ListHead`, `NameCell`, `NumCell`, `AmountCell`, `PctCell`, `IndicatorCell`, `TextCell`, `SparkCell`). A table picks its preset and adds its own special columns:

| Preset | Columns |
|---|---|
| vendor | № · name (persona física label) · contracts · amount · share without tender · indicator · by-year sparkline |
| contract | date · vendor → buyer (siglas) · procedure / exception article · amount · indicator · flags († suspect decimal, caso fortuito) |
| institution | siglas + name · level (federal / estatal / municipal) · amount · grade · top-vendor share |
| category | category · amount · share without tender · top vendor |
| pair (captura) | buyer ↔ vendor · dependence % · years · status |
| case | case · fraud type · years · outcome · amount |
| term (sexenio) | term · amount · without tender · high / critical share |

Numbered only where order means something (not alphabetical or reference tables, which take the type only). Inventory and status of every table: `docs/TABLES.md`.

**Desktop** — one line per record: № · name · meta · figures · indicator (list columns are fixed-width on the right so every row's columns align).

**Phone (≤ 760)** — one record, two lines, one left edge: the № hangs in a 28px gutter; line 1 = name · amount, line 2 = meta (or the `data-l`-labelled cells) · indicator (number only; colour stays). Never a stack of loose lines, never sideways scroll, never `min-width` on a phone table. Chips stay at text height: their tap target grows through a pseudo-element (`EntityIdentityChip`, ≥ 32px, WCAG 2.5.8), never through row height.

**On the standard (2026-10-29)**: /aria La fila (the model) · Portada «Lo más reciente» (list form, the showcase) · /institutions La liga · /contracts El registro (№ before the title; keeps its two-line phone grid) · /cases El padrón (folio as №) · /categories «La hoja de conteo» · /administrations «En curso» rankings · /captura evidence + register · institution dossier ledgers; every other `.ct-table` (vendor dossier, sectors, gap…) inherits the row type sizes, padding and hover from the CSS.

## 9. Banned

Cream paper · slab serif · hairline card grids · shadows · gradients (the wire's edge mask is the one exception) · textures (except the six `kit/patterns`, §7.p, each in its one meaning) · italics · cards with gaps · `text-[≤11px]` · tracking > .05em · uppercase · accent word in headlines · green for low risk · truncation · pies/donuts · colored pills on deltas · `transition: all` · scroll reveals in tables · Courier · any text above 24px · live chrome (wire, Δ ledger) on a page without a scoped feed.

## 10. Migration

P0 tokens (`index.css @theme`: fonts, text scale, colors) → P1 shell (`Contrato` layout: TopBar, ItemsRow, DocHead, Cover, Clause, Firmas) → Executive first (gate 2 with owner) → waves: W1 landings (Atlas, Sectors, AriaQueue, CaseLibrary) · W2 dossiers (9) · W3 ledgers (12) · W4 rest (17; 11 unrouted pages deleted). Gold pages + stories: reskin, keep charts and chapter layouts.
