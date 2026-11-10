"""«Lo que se movió» — the dated events feed every live surface reads → precomputed_stats['events_feed'].

    python -m scripts.precompute_events --db <DB> [--dry-run]

Definition (read by GET /api/v1/events):
  window          contract_date (the register's start date) in (cut − 59 days .. cut], cut = newest ComprasMX
                  publication date (precompute_sexenio_actual.data_cut). Newest first.
  award           a contract ≥ 100 MDP.
  first_supplier  a contract ≥ 10 MDP that is its vendor's first in the register (canonical group when
                  vendor_canonical exists; an undated row counts as earlier). One per vendor.
  critical        risk_level 'critical' and ≥ 10 MDP — an indicador de riesgo, not proof.
  direct_spike    an institution whose direct-award share by value in the last 14 days beats its share in the
                  12 months before by ≥ 25 points, with ≥ 20 MDP awarded directly in those 14 days. Dated cut.
  weekly_refresh  WEEKLY_REFRESH.json (next to the DB) last_ok, when it falls in the window.
  month_close     per-month totals for each month that ends in the window ≥ 3 days before the cut.
  amounts         > 100B MXN rejected (in no event or total); > 10B MXN kept and flagged (detail.flagged).
  personas físicas are named and flagged (persona_fisica; owner policy 2026-10-29); no RFC is ever written.
Run by scripts/comprasmx_weekly.py after every refresh.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.config.constants import FLAG_THRESHOLD, MAX_CONTRACT_VALUE  # noqa: E402
from api.public_labels import public_vendor_name  # noqa: E402
from scripts.precompute_sexenio_actual import _has, data_cut  # noqa: E402

STAT_KEY = "events_feed"
DAYS, RECENT_DAYS, CLOSE_LAG = 60, 14, 3
AWARD_MIN, SMALL_MIN, SPIKE_MIN_DA, SPIKE_PTS = 100e6, 10e6, 20e6, 0.25
TYPES = ("award", "first_supplier", "critical", "direct_spike", "weekly_refresh", "month_close")
MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
         "noviembre", "diciembre")
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December")


def _mdp(v):
    return f"{(v or 0) / 1e6:,.0f} MDP"


def _mxn(v):
    return f"MXN {(v or 0) / 1e6:,.0f}M"


def _event(type_, day, es, en, amount=None, row=None, inst=None, vend=None, detail=None):
    """row = (id, date, amount, da, level, vendor_id, institution_id, sector_id, risk_score, procedure, category_id) or None."""
    i = inst or {}
    v, pf = vend.get(row[5], (None, False)) if row and vend else (None, False)  # v None for an RFC-shaped name
    return {
        "type": type_, "date": day, "title_es": es, "title_en": en, "amount": amount,
        "institution_id": row[6] if row else i.get("id"), "institution": i.get("name"),
        "institution_siglas": i.get("siglas"),  # the board prints siglas; the full name rides in the label
        "vendor_id": row[5] if v else None, "vendor": v, "persona_fisica": bool(v) and pf,
        "contract_id": row[0] if row else None, "risk_level": row[4] if row else None,
        "risk_score": row[8] if row else None,  # the de-saturated indicator (0–1), printed beside the level
        "sector_id": row[7] if row else i.get("sector_id"), "detail": detail or {},
    }


def compute(conn: sqlite3.Connection, cut_iso: str | None = None, status_path: Path | None = None) -> dict:
    cut_iso = cut_iso or data_cut(conn)
    cut = date.fromisoformat(cut_iso)
    start = cut - timedelta(days=DAYS - 1)
    recent = cut - timedelta(days=RECENT_DAYS - 1)
    trailing = recent - timedelta(days=365)
    scan_from = min(trailing, start.replace(day=1))
    cols = {c[1] for c in conn.execute("PRAGMA table_info(contracts)")}
    score = "risk_score" if "risk_score" in cols else "NULL"
    # directa / licitacion / invitacion / otro — the Portada board's procedure glyph (null on older schemas)
    proc = "procedure_type_normalized" if "procedure_type_normalized" in cols else "NULL"
    # the spending category (/categories/:id) — the board's «Categoría» column (null on older schemas)
    catcol = "category_id" if "category_id" in cols else "NULL"
    # only the site's 72 live categories (is_active = 1, the rows in category_stats): never a link to a dead page
    cats = {}
    if _has(conn, "categories"):
        live = " WHERE is_active = 1" if any(c[1] == "is_active" for c in conn.execute("PRAGMA table_info(categories)")) else ""
        cats = {i: (es, en) for i, es, en in conn.execute(f"SELECT id, name_es, name_en FROM categories{live}")}
    rows = [(r[0], r[1][:10], *r[2:]) for r in conn.execute(
        "SELECT id, contract_date, amount_mxn, is_direct_award, risk_level, vendor_id, institution_id, sector_id, "
        f"{score}, {proc}, {catcol} "
        "FROM contracts WHERE contract_date >= ? AND contract_date < ? AND (amount_mxn IS NULL OR amount_mxn <= ?)",
        (scan_from.isoformat(), (cut + timedelta(days=1)).isoformat(), MAX_CONTRACT_VALUE))]
    s0, s1 = start.isoformat(), cut_iso
    win = [r for r in rows if s0 <= r[1] <= s1]

    inst = {i: {"id": i, "name": n, "siglas": s, "sector_id": sec}
            for i, n, s, sec in conn.execute("SELECT id, name, siglas, sector_id FROM institutions")}
    short = lambda iid: (inst.get(iid) or {}).get("siglas") or (inst.get(iid) or {}).get("name") or "—"  # noqa: E731
    vids = list({r[5] for r in win if r[5] is not None})
    vend = {}
    for k in range(0, len(vids), 900):
        part = vids[k:k + 900]
        for vid, name, ind, rfc in conn.execute(
                f"SELECT id, name, is_individual, rfc FROM vendors WHERE id IN ({','.join('?' * len(part))})", part):
            vend[vid] = public_vendor_name(name, ind, rfc)  # (name, persona_fisica); rfc read, never kept

    def to_whom(r, es):
        v, pf = vend.get(r[5], (None, False))
        if v:
            return f"{v} (persona física)" if pf else v
        return "un proveedor" if es else "a supplier"

    events = []
    def flag(r):
        cat = cats.get(r[10])
        return {"flagged": (r[2] or 0) > FLAG_THRESHOLD, "direct_award": bool(r[3]), "procedure": r[9],
                "category_id": r[10] if cat else None, "category_es": cat[0] if cat else None,
                "category_en": cat[1] if cat else None}

    for r in win:
        if (r[2] or 0) >= AWARD_MIN:
            events.append(_event("award", r[1], f"{short(r[6])} adjudica {_mdp(r[2])} a {to_whom(r, True)}",
                                 f"{short(r[6])} awards {_mxn(r[2])} to {to_whom(r, False)}",
                                 r[2], r, inst.get(r[6]), vend, flag(r)))
        if r[4] == "critical" and (r[2] or 0) >= SMALL_MIN:
            events.append(_event("critical", r[1],
                                 f"Contrato de {_mdp(r[2])} en {short(r[6])} con indicador de riesgo crítico",
                                 f"{_mxn(r[2])} contract at {short(r[6])} with a critical risk indicator",
                                 r[2], r, inst.get(r[6]), vend, flag(r)))

    # first_supplier — the candidate's whole canonical group must have nothing earlier
    canon = _has(conn, "vendor_canonical")
    # «first federal contract»: the vendor's first contract anywhere in the register, and it is with a
    # federal buyer (institutions.is_federal when the column exists)
    fed = None
    if any(c[1] == "is_federal" for c in conn.execute("PRAGMA table_info(institutions)")):
        fed = {i for (i,) in conn.execute("SELECT id FROM institutions WHERE is_federal = 1")}
    firsts = {}
    for r in sorted((r for r in win if r[5] is not None and (r[2] or 0) >= SMALL_MIN and (fed is None or r[6] in fed)),
                    key=lambda r: (r[1], -(r[2] or 0))):
        if r[5] in firsts:
            continue
        group = [r[5]]
        if canon:
            group = [g for (g,) in conn.execute(
                "SELECT vendor_id FROM vendor_canonical WHERE canonical_id = "
                "(SELECT canonical_id FROM vendor_canonical WHERE vendor_id = ?)", (r[5],))] or group
        prior = any(conn.execute("SELECT 1 FROM contracts WHERE vendor_id = ? AND (contract_date IS NULL OR "
                                 "contract_date < ?) LIMIT 1", (g, r[1])).fetchone() for g in group)
        firsts[r[5]] = None if prior else r
    for r in filter(None, firsts.values()):
        events.append(_event("first_supplier", r[1],
                             f"Proveedor nuevo: {to_whom(r, True)} recibe su primer contrato ({_mdp(r[2])}, {short(r[6])})",
                             f"New supplier: {to_whom(r, False)} wins its first contract ({_mxn(r[2])}, {short(r[6])})",
                             r[2], r, inst.get(r[6]), vend, flag(r)))

    # direct_spike — [recent, cut] vs [trailing, recent)
    agg = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])  # recent v, recent da, trailing v, trailing da
    r0, t0 = recent.isoformat(), trailing.isoformat()
    for r in rows:
        if r[6] is None:  # rows start at `trailing` (the scan bound)
            continue
        a = agg[r[6]]
        j = 0 if r[1] >= r0 else 2
        a[j] += r[2] or 0
        a[j + 1] += (r[2] or 0) if r[3] else 0
    for iid, (rv, rda, tv, tda) in agg.items():
        if not rv or not tv or rda < SPIKE_MIN_DA:
            continue
        rs, ts = rda / rv, tda / tv
        if rs - ts >= SPIKE_PTS:
            events.append(_event(
                "direct_spike", s1,
                f"{short(iid)}: la adjudicación directa llega a {rs:.0%} del valor en 14 días (vs {ts:.0%} en 12 meses)",
                f"{short(iid)}: direct awards reach {rs:.0%} of value in 14 days (vs {ts:.0%} over 12 months)",
                rda, None, inst.get(iid) or {"id": iid},
                detail={"recent_share": rs, "trailing_share": ts, "recent_da_value": rda, "recent_value": rv,
                        "trailing_value": tv, "recent_from": r0, "trailing_from": t0}))

    # weekly_refresh
    try:
        st = json.loads(Path(status_path).read_text(encoding="utf-8")) if status_path else {}
    except (OSError, ValueError):
        st = {}
    # comprasmx_weekly runs this before it writes last_ok: a run in progress past integrate is the newest refresh
    in_progress = not st.get("result") and st.get("new_contracts") is not None and st.get("started")
    # files written before last_ok existed carry the success at top level (same rule as stats._weekly_status)
    legacy = {"new_contracts": st.get("new_contracts"), "finished": st["finished"]} if st.get("result") == "ok" and st.get("finished") else None
    last = {"new_contracts": st["new_contracts"], "finished": st["started"]} if in_progress else (st.get("last_ok") or legacy)
    # a refresh finishes after the cut it loads, so only the window start bounds it
    if last and last.get("finished") and s0 <= last["finished"][:10]:
        n = last.get("new_contracts")
        events.append(_event("weekly_refresh", last["finished"][:10],
                             f"Actualización semanal: {n or 0:,} contratos nuevos de ComprasMX",
                             f"Weekly refresh: {n or 0:,} new ComprasMX contracts",
                             detail={"new_contracts": n, "finished": last["finished"]}))

    # month_close
    months = defaultdict(list)
    for r in rows:
        months[r[1][:7]].append(r)
    m = start.replace(day=1)
    while m <= cut:
        nxt = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
        end = nxt - timedelta(days=1)
        if start <= end and end + timedelta(days=CLOSE_LAG) <= cut:
            mr = months.get(m.strftime("%Y-%m"), [])
            v = sum(r[2] or 0 for r in mr)
            events.append(_event(
                "month_close", end.isoformat(),
                f"Cierre de {MESES[m.month - 1]} {m.year}: {len(mr):,} contratos por {_mdp(v)}",
                f"{MONTHS[m.month - 1]} {m.year} closed: {len(mr):,} contracts worth {_mxn(v)}", v,
                detail={"month": m.strftime("%Y-%m"), "n": len(mr), "value": v,
                        "da_v": sum(r[2] or 0 for r in mr if r[3]) / v if v else None,
                        "critical": sum(1 for r in mr if r[4] == "critical"),
                        "high": sum(1 for r in mr if r[4] == "high"),
                        "flagged": sum(1 for r in mr if (r[2] or 0) > FLAG_THRESHOLD)}))
        m = nxt

    events.sort(key=lambda e: (e["date"], e["amount"] or 0), reverse=True)
    counts = defaultdict(int)
    for e in events:
        counts[e["type"]] += 1
    return {
        "meta": {"date_basis": "contract_date", "cut": s1, "start": s0, "days": DAYS, "recent_days": RECENT_DAYS,
                 "award_min": AWARD_MIN, "small_min": SMALL_MIN, "spike_points": SPIKE_PTS,
                 "spike_min_da": SPIKE_MIN_DA, "flag_threshold": FLAG_THRESHOLD,
                 "reject_threshold": MAX_CONTRACT_VALUE, "counts": {t: counts[t] for t in TYPES}},
        "events": events,
    }


def write(conn: sqlite3.Connection, data: dict) -> None:
    conn.execute("INSERT OR REPLACE INTO precomputed_stats(stat_key, stat_value, updated_at) VALUES (?, ?, datetime('now'))",
                 (STAT_KEY, json.dumps(data, ensure_ascii=False, separators=(",", ":"))))
    conn.commit()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", required=True)
    ap.add_argument("--dry-run", action="store_true", help="compute and print, write nothing")
    a = ap.parse_args(argv)
    t = time.time()
    conn = sqlite3.connect(f"file:{Path(a.db).as_posix()}?mode=ro", uri=True, timeout=120) if a.dry_run \
        else sqlite3.connect(a.db, timeout=120)
    data = compute(conn, status_path=Path(a.db).with_name("WEEKLY_REFRESH.json"))
    print(f"{data['meta']['start']}..{data['meta']['cut']} ({data['meta']['date_basis']}): {data['meta']['counts']}")
    for e in data["events"][:5]:
        print(json.dumps(e, ensure_ascii=False))
    if not a.dry_run:
        write(conn, data)
        print(f"wrote precomputed_stats['{STAT_KEY}']")
    conn.close()
    print(f"{time.time() - t:.1f}s")


if __name__ == "__main__":
    main()
