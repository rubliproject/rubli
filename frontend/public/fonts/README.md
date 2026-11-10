# Self-hosted web fonts (RUBLI 1.0 «El Contrato», DESIGN.md §2, owner sampler pick 2026-10-28)

Unmodified variable `woff2` subsets as served by Google Fonts (css2 API, Oct 2026). Each
family is under the SIL Open Font License 1.1, see the `OFL-*.txt` beside the files.
Upright only, subsets latin + latin-ext. `@font-face` rules live in `src/fonts.css`,
which also aliases the retired names (Spectral, Spectral SC, IBM Plex Mono, Playfair Display,
EB Garamond, Inter, JetBrains Mono) to these files so legacy inline `fontFamily` callers keep rendering.

| family | axes / declared weights | files |
|---|---|---|
| Source Serif 4 | wght 400–700 · opsz 8–60 (auto) | source-serif-4-*-var.woff2 |
| Source Sans 3 | 600 only (labels; every request clamps to 600) | source-sans-3-*-var.woff2 |
| Source Code Pro | wght 400–700 | source-code-pro-*-var.woff2 |
