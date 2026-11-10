# Compaction audit — every tab, 2026-11-02

Owner, 2026-11-02, after El Mapa's Cifras drill (ui/mapa-compact 324c75c4, list share 58 % → 84 %):
«Can we implement this philosophy in every tab?» (template freeze overridden for this). Rule of record:
`frontend/DESIGN.md` §3.1 «Compact chrome». Branch `ui/compaction-sitewide` (from ui/mapa-compact).

## How it was measured

`node frontend/scripts/proof-share.mjs /route …` (dev server on this worktree, API = prod read-only), at
1440×900 and 390×844, after load, scroll 0:

- **head** — px between the bottom of the top bar (+ the phone items row) and the top of the page's object;
- **share** — % of the viewport below the top bar from the object's top to the fold (the owner's «content gets ≥ 80 %»);
- **rules** — horizontal rule lines inside the head band; **dupes** — control labels repeated in main's first two screens;
  **bottom** — fixed/sticky bars on the viewport's bottom edge; **offscreen** — text pushed past the right edge.

The object per route is fixed in the script (`PRIMARY`): the dossier's expediente (`.vd-exp`), the sector's top-vendor list,
the category's money chart, the registers' tables, the ladders/plots/figures of the analysis pages, the first section of a
document page. Before = commit 324c75c4 on the same dev server (lista / hoja before = prod, same code). Screenshots:
`_explore/compaction_2026-11-02/{before,after}/`; raw numbers `before.json`, `after.json`.

## Ranked table (worst first at 1440, before → after)

| # | Route | 1440 before (head · share) | 1440 after | head rules | 390 before | 390 after |
|---|---|---|---|---|---|---|
| 1 | `/aria/caso/2873` | 1656 · 0 % | **1643 · 0 %** | 17 → 16 | 2806 · 0 % | **2773 · 0 %** |
| 2 | `/antes-del-fallo` | 622 · 27 % | **518 · 39 %** | 7 → 7 | 1327 · 0 % | **1108 · 0 %** |
| 3 | `/institutions/251` | 486 · 43 % | **364 · 57 %** | 3 → 2 | 819 · 0 % | **631 · 2 %** |
| 4 | `/vendors/2873` | 435 · 49 % | **329 · 61 %** | 4 → 4 | 796 · 0 % | **688 · 0 %** |
| 5 | `/arranque` | 382 · 55 % | **337 · 60 %** | 4 → 4 | 878 · 0 % | **808 · 0 %** |
| 6 | `/rastro` | 375 · 56 % | **265 · 69 %** | 3 → 3 | 779 · 0 % | **389 · 40 %** |
| 7 | `/captura` | 353 · 58 % | **262 · 69 %** | 3 → 3 | 665 · 0 % | **447 · 31 %** |
| 8 | `/methodology` | 320 · 62 % | **256 · 70 %** | 9 → 9 | 550 · 15 % | **400 · 38 %** |
| 9 | `/datos` | 292 · 66 % | **229 · 73 %** | 8 → 8 | 540 · 16 % | **361 · 44 %** |
| 10 | `/press` | 292 · 66 % | **229 · 73 %** | 8 → 8 | 543 · 16 % | **374 · 42 %** |
| 11 | `/cases/estafa-maestra` | 285 · 66 % | **131 · 85 %** | 5 → 3 | 449 · 30 % | **137 · 79 %** |
| 12 | `/cases` | 251 · 71 % | **183 · 78 %** | 2 → 2 | 355 · 45 % | **342 · 47 %** |
| 13 | `/administrations` | 236 · 72 % | **201 · 76 %** | 2 → 2 | 418 · 35 % | **287 · 56 %** |
| 14 | `/categories` | 231 · 73 % | **189 · 78 %** | 1 → 1 | 309 · 52 % | **253 · 61 %** |
| 15 | `/aria` | 220 · 74 % | **218 · 74 %** | 2 → 2 | 376 · 42 % | **364 · 44 %** |
| 16 | `/contracts?vista=lista` | 210 · 75 % | **143 · 83 %** | 4 → 4 | 198 · 69 % | **163 · 75 %** |
| 17 | `/contracts/2111601` | 175 · 79 % | **154 · 82 %** | 2 → 2 | 261 · 60 % | **162 · 75 %** |
| 18 | `/institutions` | 171 · 80 % | **169 · 80 %** | 1 → 1 | 256 · 60 % | **254 · 61 %** |
| 19 | `/sectors/1` | 165 · 81 % | **124 · 85 %** | 2 → 2 | 224 · 65 % | **130 · 80 %** |
| 20 | `/categories?vista=hoja` | 150 · 82 % | **99 · 88 %** | 2 → 2 | 278 · 57 % | **218 · 66 %** |
| 21 | `/contracts` | 138 · 84 % | **136 · 84 %** | 2 → 2 | 221 · 66 % | **219 · 66 %** |
| 22 | `/categories/20` | 136 · 84 % | **117 · 86 %** | 1 → 1 | 249 · 61 % | **218 · 66 %** |
| 23 | `/` | 84 · 90 % | **84 · 90 %** | 1 → 1 | 200 · 69 % | **200 · 69 %** |
| 24 | `/gasto-a-ciegas` | 69 · 92 % | **60 · 93 %** | 1 → 1 | 575 · 11 % | **461 · 29 %** |
| 25 | `/mapa` | 59 · 93 % | **59 · 93 %** | 1 → 1 | 646 · 0 % | **646 · 0 %** |

Duplicated controls: none that are real (the counted ones are per-section «Citar» on /sectors/:id and the two «ver en plano»
toggles of two dossier objects on /contracts/:id). Bottom action bars: none left on these routes (the /cases phone sheet is
off-screen until a case opens; El Mapa's jumpline bars went in 324c75c4).

## What changed (template first)

1. **DocHead = the page toolbar** — trail left; the page's switches (`views`) and small actions (`actions`, `.ct-tool`) right,
   one row; the default «Corte · Modelo» meta only when the row has no tools; `sticky` on list pages publishes its measured
   height (`--ct-stick`) and adds `scroll-padding-top`. Same component the /aria agent wraps in its own sticky bar.
2. **Cover** — optional `kicker` on the h1 line; h1 20 (phone 18); lede = one line + «más» (`kit/MoreLine`; opens on
   focus too; `fullLede` keeps a disclaimer lede wrapped).
3. **Sticky column heads** — every `.ct-table` th at ≥ 1024, under the toolbar / SectionIndex.
4. Pages: sectors (kicker), vendors (export → toolbar, figures beside the orbit), categories (sort/sector/«ver las 72» in the
   toolbar; dossier h1 28 → 20), contracts (h1 on the search row, sticky toolbar + heads), institutions dossier (figures
   beside the orbit), cases (thesis one line, key one row), captura (h1 30 → 20, definitions + verdict why one line),
   rastro (h1 20, lede/defs one line, ladder step · place one line), antes-del-fallo + arranque (views in the toolbar, h1/claims
   20–24), methodology/datos/press (masthead only).

## Not touched (owned elsewhere)

`/mapa` (done in ui/mapa-compact), `/aria` (ui/aria-navigation — reuses DocHead), the footer (ui/footer-pro).
`/aria/caso/:id` only inherits VendorCover (its lede stays wrapped: it carries «no es una prueba»).

## Still far from 80 % — needs a design pass, not chrome

- **Phone dossiers** (/vendors, /institutions, /aria/caso): the shell (top bar + items row ≈ 200 px) plus the cover put the
  expediente below the fold; the cover's figures are content the owner wants in the head.
- **/antes-del-fallo, /arranque**: a page summary + a chapter claim + a five-figure row precede the figure; the 10.1 % figure
  appears three times above the fold. A Fable concept round should decide what the first screen is.
- **/aria/caso/2873**: the case layer (IPS ledger, signals, VerdictBar) sits above the expediente by design.
- Pre-existing: a RAGGED Δ70 in `.vd-obj-b` (DossierObjects, below the fold) on /vendors/2873 at 1440 — prod shows the same.
