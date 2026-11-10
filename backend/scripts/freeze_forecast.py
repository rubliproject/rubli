"""Freeze the ranked vendor list and the buyer-level predictor for pre-registration 3 (docs/PREREGISTRATION_2026-11.md).

Read-only on --db. Writes to --out:
  forecast_vendors_<date>.csv   one row per vendor in the population (definitions in the manifest)
  forecast_vendors_companies_<date>.csv  the same rows minus personas fisicas (the file published at O24)
  forecast_buyers_<date>.csv    buyer-level co-primary: top-vendor share / HHI per institution, 365 days to the freeze
  sfp_source_<date>.csv         byte copy of the SFP source CSV that sfp_sanctions was loaded from
  forecast_manifest_<date>.json model run, ARIA run, data cut, counts, definitions, outcome-list snapshots, file sha256s
  SHA256SUMS                    sha256 of every file (`sha256sum -c SHA256SUMS`)
Deterministic: rows sorted by id, fixed float format, seeded control draw, no wall-clock time in any file —
the same DB + arguments give the same hashes.

  cd backend && python -m scripts.freeze_forecast --db RUBLI_NORMALIZED.db --out ../_prereg/<D> --freeze-date <D> \
      --sfp-source-csv data/proveedores_sancionados.csv
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import platform
import random
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.public_labels import _norm_name, is_persona_fisica, is_public_entity  # noqa: E402
from api.persona_fisica import rfc_shape  # noqa: E402
from api.sanctions import normalize_name  # noqa: E402

MAX_CONTRACT_VALUE = 100_000_000_000  # > 100B MXN rejected (.claude/rules/data-validation.md)
MODEL_VERSION = "v0.9.2"
FOCAL_TIERS = (1, 2)
BUYER_MIN_MXN = 100_000_000  # >= 100 MDP in the window (docs/FRONTIER_STUDY_2026-10-31.md § C)
COLUMNS = ["vendor_id", "name", "entity_kind", "company_rfc", "primary_sector_id", "size_decile", "first_year_band", "stratum",
           "n_contracts", "n_scored", "total_value_mxn", "mean_risk", "max_risk", "rank_mean_risk",
           "aria_tier", "ips", "rank_ips", "primary_pattern",
           "gt_at_freeze", "efos_def_at_freeze", "sfp_at_freeze", "focal", "control"]
BUYER_COLUMNS = ["institution_id", "institution_name", "window_total_mxn", "n_vendors", "top_vendor_id", "top_share", "hhi",
                 "majority_now"]

DEFINITIONS = {
    "population": "Vendors with >= 1 contract scored by the active model (contracts.risk_score NOT NULL, amount <= 100B MXN), "
                  "excluding public entities (vendors.vendor_kind <> 'private' or api.public_labels.is_public_entity).",
    "entity_kind": "persona_fisica | company, by api.public_labels.is_persona_fisica (RFC shape first, else vendors.is_individual).",
    "company_rfc": "vendors.rfc only when its shape is a company RFC (12 chars); always empty for personas fisicas.",
    "n_contracts": "Contracts with amount_mxn <= 100B MXN (NULL amount counted); > 100B rejected everywhere.",
    "n_scored": "Of those, contracts with a non-NULL risk_score.",
    "total_value_mxn": "SUM(amount_mxn) over n_contracts.",
    "mean_risk / max_risk": "AVG / MAX of contracts.risk_score (the published indicator) over n_scored.",
    "rank_mean_risk": "1 = highest mean_risk; ties broken by vendor_id ascending.",
    "aria_tier / ips / primary_pattern": "aria_queue.ips_tier / ips_final / primary_pattern of the latest ARIA run (max computed_at); empty if absent.",
    "rank_ips": "1 = highest ips among vendors with an ARIA row; ties by vendor_id.",
    "size_decile": "0-9 decile of total_value_mxn within the population (sorted by value, then vendor_id).",
    "first_year_band": "Year of the vendor's first contract (MIN contract_date): A <= 2010, B 2011-2017, C 2018-2022, D >= 2023.",
    "stratum": "s<primary_sector_id (vendor_stats, default 12)>-d<size_decile>-<first_year_band>.",
    "gt_at_freeze": "aria_queue.in_ground_truth.",
    "efos_def_at_freeze": "1 if vendors.rfc is in sat_efos_vendors with stage 'definitivo' or aria_queue.is_efos_definitivo.",
    "sfp_at_freeze": "1 if vendors.rfc is in sfp_sanctions, or api.sanctions.normalize_name(vendors.name) equals the normalised "
                     "name of any sfp_sanctions row (every vendor sharing that name is flagged: conservative for an at-risk set), "
                     "or aria_queue.is_sfp_sanctioned.",
    "focal": "aria_tier in (1, 2).",
    "control": "Seeded random draw of non-focal vendors, controls_per_focal x (focal count) per stratum (capped at what the stratum has); "
               "strata visited in sorted order, candidates sorted by vendor_id, one random.Random(seed).",
    "buyers": "Institutions with SUM(amount_mxn) >= 100 MDP over contracts dated in (freeze_date - 365 days, freeze_date], "
              "0 < amount <= 100B. top_share = largest vendor's share of that sum (ties: lowest vendor_id); hhi = sum of squared "
              "vendor shares; majority_now = top_share >= 0.5. Pre-registered predictor of the buyer outcome: top_share.",
}


def _band(first_date) -> str:
    """First-contract year band = COMPRANET structure: A <= 2010, B 2011-17, C 2018-22, D >= 2023."""
    y = int(str(first_date)[:4]) if first_date else 0
    return "A" if y <= 2010 else "B" if y <= 2017 else "C" if y <= 2022 else "D"


def _connect_ro(db: str) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{Path(db).resolve().as_posix()}?mode=ro", uri=True)


def _f(x) -> str:
    return "" if x is None else f"{x:.6f}"


def _rfc(r) -> str:
    return (r or "").strip().upper()


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _rfc_snapshot(conn, sql: str) -> dict:
    rows = sorted({_rfc(r[0]) for r in conn.execute(sql) if _rfc(r[0])})
    return {"distinct_rfcs": len(rows), "sha256_sorted_rfcs": _sha("\n".join(rows).encode())}


def _write_csv(header: list, rows: list) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    w.writerows(rows)
    return buf.getvalue().encode("utf-8")


def _buyers(conn, freeze_date: str) -> tuple[list, dict]:
    end = dt.date.fromisoformat(freeze_date) + dt.timedelta(days=1)   # exclusive
    start = end - dt.timedelta(days=365)                               # inclusive: (D - 365 d, D]
    per: dict = {}
    for inst, vid, amt in conn.execute(
            "SELECT institution_id, vendor_id, SUM(amount_mxn) FROM contracts WHERE institution_id IS NOT NULL "
            "AND vendor_id IS NOT NULL AND amount_mxn > 0 AND amount_mxn <= ? AND contract_date >= ? AND contract_date < ? "
            "GROUP BY institution_id, vendor_id", (MAX_CONTRACT_VALUE, start.isoformat(), end.isoformat())):
        per.setdefault(inst, []).append((amt, vid))
    names = dict(conn.execute("SELECT id, name FROM institutions"))
    out = []
    for inst in sorted(per):
        tot = sum(a for a, _ in per[inst])
        if tot < BUYER_MIN_MXN:
            continue
        top_amt, top_vid = max(per[inst], key=lambda x: (x[0], -x[1]))
        share = top_amt / tot
        out.append([inst, (names.get(inst) or "").strip(), f"{tot:.2f}", len(per[inst]), top_vid, _f(share),
                    _f(sum((a / tot) ** 2 for a, _ in per[inst])), int(share >= 0.5)])
    window = {"from_inclusive": start.isoformat(), "to_inclusive": freeze_date, "min_total_mxn": BUYER_MIN_MXN}
    return out, window


def freeze(db: str, out: str, freeze_date: str, sfp_source_csv: str, seed: int = 20261101, controls_per_focal: int = 5,
           model_version: str = MODEL_VERSION) -> dict:
    sfp_src = Path(sfp_source_csv).read_bytes()
    conn = _connect_ro(db)
    model_run = conn.execute("SELECT run_id FROM model_calibration WHERE model_version = ? ORDER BY created_at DESC, id DESC LIMIT 1",
                             (model_version,)).fetchone()
    if not model_run:
        raise SystemExit(f"no model_calibration row for {model_version}: this DB does not carry that model's scores")
    if "plazo_months" not in {r[1] for r in conn.execute("PRAGMA table_info(sfp_sanctions)")}:
        raise SystemExit("sfp_sanctions is the pre-2026-10-31 table (no plazo_months): apply fix/sfp-sanctions-dates first")
    aria_run = conn.execute("SELECT aria_run_id FROM aria_queue ORDER BY computed_at DESC LIMIT 1").fetchone()
    aria_run = aria_run[0] if aria_run else None
    aria = {r[0]: r[1:] for r in conn.execute(
        "SELECT vendor_id, ips_tier, ips_final, primary_pattern, in_ground_truth, is_efos_definitivo, is_sfp_sanctioned "
        "FROM aria_queue WHERE aria_run_id = ?", (aria_run,))}
    vend = {r[0]: r[1:] for r in conn.execute("SELECT id, name, rfc, is_individual, vendor_kind FROM vendors")}
    sector = dict(conn.execute("SELECT vendor_id, primary_sector_id FROM vendor_stats"))
    instnames = {_norm_name(r[0]) for r in conn.execute("SELECT name FROM institutions")}
    efos = {_rfc(r[0]) for r in conn.execute("SELECT rfc FROM sat_efos_vendors WHERE stage = 'definitivo'")} - {""}
    sfp_rows = conn.execute("SELECT rfc, company_name, sanction_start FROM sfp_sanctions").fetchall()
    sfp = {_rfc(r[0]) for r in sfp_rows} - {""}  # blank RFC rows match nothing
    sfp_names = {normalize_name(r[1]) for r in sfp_rows} - {""}
    agg = conn.execute(
        "SELECT vendor_id, COUNT(*), SUM(COALESCE(amount_mxn, 0)), COUNT(risk_score), AVG(risk_score), MAX(risk_score), "
        "MAX(contract_date), MIN(contract_date) FROM contracts WHERE vendor_id IS NOT NULL AND COALESCE(amount_mxn, 0) <= ? "
        "GROUP BY vendor_id", (MAX_CONTRACT_VALUE,)).fetchall()
    data_cut = max((a[6] for a in agg if a[6]), default=None)

    rows, excluded_public = [], 0
    for vid, n, value, n_scored, mean, mx, _, first in agg:
        if not n_scored or vid not in vend:
            continue
        name, rfc, is_ind, kind = vend[vid]
        if (kind not in (None, "private")) or is_public_entity(name, instnames):
            excluded_public += 1
            continue
        a = aria.get(vid, (None,) * 6)
        pf = is_persona_fisica(is_ind, rfc)
        rows.append({
            "vendor_id": vid, "name": (name or "").strip(), "entity_kind": "persona_fisica" if pf else "company",
            "company_rfc": _rfc(rfc) if not pf and rfc_shape(rfc) == "company" else "",
            "primary_sector_id": sector.get(vid) or 12, "first_year_band": _band(first), "n_contracts": n, "n_scored": n_scored,
            "total_value_mxn": round(value or 0.0, 2), "mean_risk": mean, "max_risk": mx,
            "aria_tier": a[0], "ips": a[1], "primary_pattern": a[2] or "", "gt_at_freeze": int(bool(a[3])),
            "efos_def_at_freeze": int(bool(a[4]) or _rfc(rfc) in efos),
            "sfp_at_freeze": int(bool(a[5]) or _rfc(rfc) in sfp or normalize_name(name) in sfp_names),
            "focal": int(a[0] in FOCAL_TIERS), "control": 0,
        })
    if not any(r["sfp_at_freeze"] for r in rows):
        raise SystemExit("SFP matching flagged no vendor: the sfp_sanctions table or the name rule is not active")

    for i, r in enumerate(sorted(rows, key=lambda r: (-r["mean_risk"], r["vendor_id"]))):
        r["rank_mean_risk"] = i + 1
    for i, r in enumerate(sorted((r for r in rows if r["ips"] is not None), key=lambda r: (-r["ips"], r["vendor_id"]))):
        r["rank_ips"] = i + 1
    for i, r in enumerate(sorted(rows, key=lambda r: (r["total_value_mxn"], r["vendor_id"]))):
        r["size_decile"] = i * 10 // len(rows)
        r["stratum"] = f"s{r['primary_sector_id']}-d{r['size_decile']}-{r['first_year_band']}"

    rng, strata = random.Random(seed), {}
    for r in sorted(rows, key=lambda r: r["vendor_id"]):
        strata.setdefault(r["stratum"], []).append(r)
    for s in sorted(strata):
        n_focal = sum(r["focal"] for r in strata[s])
        pool = [r for r in strata[s] if not r["focal"]]
        for r in rng.sample(pool, min(len(pool), controls_per_focal * n_focal)):
            r["control"] = 1

    rows.sort(key=lambda r: r["vendor_id"])
    lines = [[_f(r[c]) if c in ("mean_risk", "max_risk", "ips") else f"{r[c]:.2f}" if c == "total_value_mxn"
              else "" if r.get(c) is None else r[c] for c in COLUMNS] for r in rows]
    csv_bytes = _write_csv(COLUMNS, lines)
    co_bytes = _write_csv(COLUMNS, [ln for ln, r in zip(lines, rows) if r["entity_kind"] == "company"])
    buyers, window = _buyers(conn, freeze_date)
    buyer_bytes = _write_csv(BUYER_COLUMNS, buyers)

    outdir = Path(out)
    outdir.mkdir(parents=True, exist_ok=True)
    csv_name, man_name = f"forecast_vendors_{freeze_date}.csv", f"forecast_manifest_{freeze_date}.json"
    buyer_name, sfp_name = f"forecast_buyers_{freeze_date}.csv", f"sfp_source_{freeze_date}.csv"
    co_name = f"forecast_vendors_companies_{freeze_date}.csv"
    for fname, b in ((csv_name, csv_bytes), (co_name, co_bytes), (buyer_name, buyer_bytes), (sfp_name, sfp_src)):
        (outdir / fname).write_bytes(b)
    focal = [r for r in rows if r["focal"]]
    manifest = {
        "freeze_date": freeze_date, "preregistration": "docs/PREREGISTRATION_2026-11.md",
        "model_version": model_version, "model_run_id": model_run[0], "aria_run_id": aria_run, "data_cut_date": data_cut,
        "files": {"vendors_csv": csv_name, "vendors_companies_csv": co_name, "buyers_csv": buyer_name, "sfp_source_csv": sfp_name},
        "sha256": _sha(csv_bytes), "sha256_companies": _sha(co_bytes), "sha256_buyers": _sha(buyer_bytes), "sha256_sfp_source": _sha(sfp_src),
        "buyer_window": window,
        "counts": {
            "population": len(rows), "excluded_public_entities": excluded_public,
            "personas_fisicas": sum(r["entity_kind"] == "persona_fisica" for r in rows),
            "by_aria_tier": {str(t): sum(r["aria_tier"] == t for r in rows) for t in (1, 2, 3, 4)},
            "no_aria_row": sum(r["aria_tier"] is None for r in rows),
            "focal": len(focal), "control": sum(r["control"] for r in rows),
            "focal_already_efos_def": sum(r["efos_def_at_freeze"] for r in focal),
            "focal_already_sfp": sum(r["sfp_at_freeze"] for r in focal),
            "population_already_efos_def": sum(r["efos_def_at_freeze"] for r in rows),
            "population_already_sfp": sum(r["sfp_at_freeze"] for r in rows),
            "strata": len(strata), "buyers": len(buyers), "buyers_majority_now": sum(b[-1] for b in buyers),
        },
        "control_sample": {"seed": seed, "controls_per_focal": controls_per_focal, "rng": "random.Random(seed).sample",
                           "python": platform.python_version()},
        "outcome_snapshots_at_freeze": {
            "sat_efos_definitivo": _rfc_snapshot(conn, "SELECT rfc FROM sat_efos_vendors WHERE stage = 'definitivo'"),
            "sfp_sanctions_rfc": _rfc_snapshot(conn, "SELECT rfc FROM sfp_sanctions"),
            "sfp_sanctions_name_date": {
                "rows": len(sfp_rows), "distinct_normalised_names": len(sfp_names), "normaliser": "api.sanctions.normalize_name",
                "sha256_sorted_rows": _sha("\n".join(sorted(f"{normalize_name(r[1])}\t{r[2] or ''}" for r in sfp_rows)).encode("utf-8")),
            },
        },
        "outcomes": "Vendor: new listing after freeze_date on SAT 69-B definitivo (DOF), SFP/SABG sanction, ASF observation naming "
                    "the vendor; 12 and 24 months. Buyer: top_share >= 0.5 in the target calendar year. "
                    "Matching rules, metrics and analysis: docs/PREREGISTRATION_2026-11.md.",
        "definitions": DEFINITIONS,
    }
    conn.close()
    man_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
    (outdir / man_name).write_bytes(man_bytes)
    (outdir / "SHA256SUMS").write_text("".join(f"{h}  {n}\n" for h, n in (
        (manifest["sha256"], csv_name), (manifest["sha256_companies"], co_name), (manifest["sha256_buyers"], buyer_name),
        (manifest["sha256_sfp_source"], sfp_name), (_sha(man_bytes), man_name))), encoding="utf-8", newline="\n")
    return manifest


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--freeze-date", required=True, help="YYYY-MM-DD (UTC) — goes into file names and the manifest")
    ap.add_argument("--sfp-source-csv", required=True, help="the CSV sfp_sanctions was loaded from (archived + hashed)")
    ap.add_argument("--seed", type=int, default=20261101)
    ap.add_argument("--controls-per-focal", type=int, default=5)
    ap.add_argument("--model-version", default=MODEL_VERSION, help="only for dry runs on a DB without v0.9.2")
    a = ap.parse_args()
    m = freeze(a.db, a.out, a.freeze_date, a.sfp_source_csv, a.seed, a.controls_per_focal, a.model_version)
    print(json.dumps({k: m[k] for k in ("model_version", "model_run_id", "aria_run_id", "data_cut_date", "buyer_window",
                                        "counts")}, indent=2))
    print((Path(a.out) / "SHA256SUMS").read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
