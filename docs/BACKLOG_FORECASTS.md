# Backlog: forecasts and trends (owner, 2026-11-03). LATER, after launch.

**The owner's ask:** «use our data for predictions… not so much risk but tendencies… predictions of these magnitudes». He mentioned TimesFM (Google Research's time-series foundation model, open weights).

## Ideas, most useful first
1. **Forecast as a baseline that detects anomalies.** Each month, predict what each institution and sector should spend and how much it should award directly. Then flag when reality leaves the forecast band («la Conagua gastó 3× lo esperado en octubre»). This feeds the rules engine and the board.
2. **Trends for the public:**
   - the expected December spending surge;
   - the direct-award share heading into 2026–27;
   - sector spending paths by sexenio.

   Always shown with an interval and labelled «tendencia, no promesa».
3. **The pre-registered forecast already exists** (`RUBLI_prereg/prereg_2026-11-02`). Keep it as the credibility anchor: we publish predictions before the data arrives, then score them.

## News-informed predictions (owner, 11-03: «if we know things in the news, predict who's going to get more contracts — not Palantir-like»)
- **The pieces we already have:**
  - media mining (`feat/media-mining`): articles linked to RUBLI vendors and institutions;
  - per-vendor contract histories;
  - the pre-registration habit.
- **The first version:** an event, such as a disaster, a new megaproject, a budget line, an emergency decree or a scandal, maps to the institution and sector. The model then predicts next-quarter contract money by institution and sector. The vendor-level output is «likely continuing winners», using incumbency, buyer share and the sector trend.
- **How we score it:** pre-register monthly, then score publicly. The baseline is «last quarter repeats». The news features must beat it out of sample, or the feature doesn't ship.
- **Care:** naming a specific company as «going to win» can read as an accusation or market advice.
  - Publish the vendor-level predictions as aggregates or ranges.
  - Never pair them with the risk indicator in a way that implies wrongdoing.
  - Use the legal and editor review before going public.

## Method guardrails
- **Backtest against simple baselines first** (seasonal naive, ETS). A foundation model only ships if it beats them out of sample.
- **Known breaks:** the December fiscal-year spikes; sexenio transitions; the CompraNet → ComprasMX change and the post-Sep-2025 data gap; Structure A (2002–10) data quality. Model monthly series 2011+ by default.
- **Free and local only.** TimesFM weights run locally on CPU or GPU, with no paid APIs. Check the model size and licence at the time of use.
- **Rules:** use `mle-workflow` and `eval-harness`, and run the `mle-reviewer` agent before anything is published.

## Unit-price overpricing (owner, 11-03: «is it overpriced or not?»). LATER
- **What we have now:** P5 «Precio fuera de rango» plus the model's price_ratio and price_volatility. Both compare a contract's amount with its partida and sector, not unit prices.
- **Start with medicines by clave del Cuadro Básico.** IMSS and ISSSTE consolidated purchases publish unit prices, so we can compare what each institution paid for the same key and presentation.
- **Then fuel, vehicles and standard goods,** through CUCoP codes plus public market prices.
- **Construction last.** It needs cost-per-m² benchmarks and contracts that actually state the m².
