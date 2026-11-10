# Los patrones — three leads (2026-11-05, MAGENTA)

Owner direction 2026-11-05: «Antes del fallo», «El mismo día» and «El rastro» are cases, not pages. Each is a short lead
for Casos and the deck: what we saw · who · how much · what to check next. Numbers re-run read-only on
`backend/RUBLI_NORMALIZED.db` on 2026-11-05 (filters `amount_mxn > 0 AND amount_mxn <= 100e9`); queries in
`frontend/_explore/patrones_concepts_2026-11-05/README.md` §§ 1, 2, 5. None of these is a finding of wrongdoing.
Never «fraccionar», «fantasma» or «ya corría» next to a company name.

## 1. Antes del fallo — SEDENA's tender dates

**What we saw.** In ComprasMX, some tendered federal contracts carry a start date earlier than the date the winner was
announced (the *fallo*). **Who.** SEDENA leads: 478 of its 3,443 tendered contracts (106 of 1,075 procedures, 10 %),
then ISSSTE (211, of which 165 are dated 1 January: its consolidated purchase). **How much.** Across the federal
government, 1,025 of 53,506 tendered contracts, 17,404 MDP (local cut; prod shows 1,042 of 54,076). **What to check
next.** Almost all of it is paperwork: 1,018 start within 30 days of the award and 173 on 1 January (the fiscal-year
convention). The lead is the **31 contracts that start before the bids were even opened** — pull those procedures'
actas (apertura, fallo) and ask the buying units why work was dated before the competition.

## 2. El mismo día — one buyer, one company, one day

**What we saw.** Lots of small direct awards signed the same day by the same buyer to the same company, each under the
legal cap for awarding without a tender. **Who.** The largest lot: Alen del Norte ← DICONSA, 24 April 2023: 45
contracts, 7.09 MDP together, the largest 266,100 pesos against a 270,000-peso cap. Next: Diagnocell Laboratorios ←
IMSS, 17 October 2024: 56 contracts, 5.90 MDP, the largest 282,240 pesos against a 284,000 cap. **How much.** 1,622
such lots, 19,304 contracts, 1,778 MDP, 2019–2025 (99 more lots are personas físicas, not listed). **What to check
next.** The method does not separate this from normal store-by-store buying: moving the cap (×0.75 → 1,550 lots, ×2 →
1,527) barely changes the count, so the count proves nothing by itself. Check single lots by hand: DICONSA's store
orders for 24 April 2023 and IMSS's 17 October 2024 lab orders — one requisition split, or many real ones?

## 3. El rastro de un peso — IMSS medicines, 2024

**What we saw.** Following the IMSS's 2024 medicine budget (partida 25301) from the official spending report to the
contracts: **81,892 MDP spent → 34,566 MDP in public contracts → 31,568 MDP of those without a tender.** Fewer than
half of the pesos leave a public contract, and most that do were direct awards. **Who.** 15,574 contracts to 819
suppliers. The three largest: Boehringer Ingelheim (1,863 MDP, 6 contracts, all direct — art. 41 fr. I, patent / sole
source), Infra (1,839 MDP, 11 contracts, 99.9 % tendered), Farmacéuticos Maypo (1,821 MDP, 638 contracts, nearly all
direct). **What to check next.** The local register gives 42 centavos per peso; prod, with ComprasMX rows, gives 47
(38,588 MDP, 17,132 contracts) — cite prod. 2025 would read differently (multi-year consolidated purchase). Ask the
IMSS where the other ~half of the 2024 medicine money is recorded (consolidated purchase via INSABI / IMSS-Bienestar,
transfers, or unpublished orders), and get the ASF audit result number for this partida.
