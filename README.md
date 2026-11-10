<p align="center">
  <img src="docs/brand/rubli-logo.svg" alt="RUBLI" width="96" height="96">
</p>

<h1 align="center">RUBLI</h1>

<p align="center"><em>Inteligencia abierta sobre las compras del gobierno federal de México.</em></p>

<p align="center">
  <a href="https://rubli.xyz">rubli.xyz</a> ·
  <a href="https://doi.org/10.5281/zenodo.23694198">Dataset (DOI 10.5281/zenodo.23694198)</a> ·
  <a href="docs/SCORING.md">Methodology</a>
</p>

---

RUBLI is an open-source platform that rebuilds Mexican federal procurement records into one consistent register and ranks contracts, suppliers and buying institutions by a statistical risk indicator. It is built for journalists, auditors and researchers who need to decide where to look first. The live site is **[rubli.xyz](https://rubli.xyz)**.

## The data

- **3.1 million federal contracts, 2002–2026**, about 10.4 trillion MXN in validated value, with 332,000 suppliers and 4,700 institutions.
- **Sources:** CompraNet bulk files (four record layouts, 2002–2025) and the ComprasMX open-data contract files (2025–2026), cross-referenced with SAT's Article 69-B list, the SFP sanctioned-supplier registry and ASF audit reports.
- **Data horizon:** the CompraNet federal bulk feed stopped on 28 September 2025. Later contracts come from ComprasMX open data and are less complete.
- **Amount rules:** values above 100 billion MXN are rejected as decimal errors; values above 10 billion MXN are flagged for review.
- Record quality rises over time; findings before 2011 carry wider caveats. See [`docs/DATASHEET_2026.11.md`](docs/DATASHEET_2026.11.md).

## The risk indicator

1. Each contract is scored by a regularised logistic regression (ElasticNet) with positive-unlabelled correction, using only information available at the time of the contract.
2. Labels come from documented cases (press, official records, audits) and analyst write-ups; the model learns how closely a contract resembles them.
3. Scores are grouped into critical (≥ 0.60), high (≥ 0.40), medium (≥ 0.25) and low, and feed an investigation list of suppliers (ARIA).
4. **It is a risk indicator, not proof of wrongdoing** and not a probability of corruption. Use it to choose what to check, never to name anyone as corrupt.

Full method: [`docs/SCORING.md`](docs/SCORING.md) and [`docs/RISK_METHODOLOGY_v6.md`](docs/RISK_METHODOLOGY_v6.md).

## Repository layout

| Path | Contents |
|---|---|
| `backend/` | FastAPI service (`api/`), ETL, scoring and ARIA pipelines (`scripts/`), tests |
| `frontend/` | React + TypeScript site (Vite) |
| `docs/` | Methodology, datasheet, data model, deployment and operations notes |
| `scripts/` | Operations helpers (backups, checks) |

## Quick start

Requires Python 3.11 and Node 20+. The SQLite database is not in the repository; download it from the [dataset record](https://doi.org/10.5281/zenodo.23694198).

```bash
# Backend (from backend/) - first start scans the full contract table, allow ~1 minute
pip install -r requirements.txt
uvicorn api.main:app --port 8001

# Frontend (from frontend/)
npm install
npm run dev
```

More detail: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## How to cite

Use the metadata in [`CITATION.cff`](CITATION.cff) (GitHub shows a "Cite this repository" button). For the data, cite the dataset: RUBLI Project, *RUBLI public dataset*, Zenodo, [doi:10.5281/zenodo.23694198](https://doi.org/10.5281/zenodo.23694198).

## Licence

- Code: Apache License 2.0, see [`LICENSE`](LICENSE).
- Dataset release 2026.11: Creative Commons Attribution 4.0 (CC BY 4.0), as stated on the Zenodo record.

## Contact

RUBLI Project · [rubli-project@proton.me](mailto:rubli-project@proton.me) · [rubli.xyz](https://rubli.xyz)
