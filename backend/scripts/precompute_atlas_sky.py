"""Precompute «El Atlas» sky — spec .claude/designs/atlas-2026-10-02-spec.md §2.8.

Writes ONLY atlas_sky_ties, atlas_sky_layout, atlas_sky_cobid, atlas_sky_meta.
numpy + stdlib. Stages:
  1 ties      one `FROM contracts NOT INDEXED` pass on canonical ids (F2/F13),
              excluding amount > 1e11 and suspect-decimal contracts
  2 sky set   ≥ 10 M MXN lifetime or ARIA T1–T3; public bits via label_sets() /
              excluded_from_rankings() (F7)
  3 layout    sector ring (12-node force → angle order, arc ∝ money, 3 % floor),
              disc radius √(Σ R_sys² / 0.45), push; stars = backbone FR inside
              each disc (phyllotaxis seed, fixed seed, collision gap R_sys + 4,
              Procrustes to the previous run) — `--phyllotaxis` = fallback
  4 bodies    host = top buyer, share, slots, cap 60 (hard 80), remainder by
              (star, year) on the primary-host basis (drawn + band = 100 % of the
              star's primary money; asserted), halo h_i, co-bid top-8
  5 asserts → tables + meta → wal_checkpoint(TRUNCATE) loop

Run:  python -m scripts.precompute_atlas_sky --db D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db

--years-backfill (spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §2): never reruns the layout.
One contracts pass into a packed-int accumulator, a drift guard against atlas_sky_ties / the layout's star
values, then ONE transaction: atlas_sky_star_years + atlas_sky_tie_years, layout columns period_v / period_nv /
year_mask, the year meta rows, bin_version = SKY3, payload_gz_bytes. layout_version is untouched (no 409).
"""
from __future__ import annotations

import argparse
import statistics
from array import array
import gzip
import json
import math
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.public_labels import excluded_from_rankings, label_sets, suspect_decimal_contracts  # noqa: E402
from api.services.institution_canonical import has_canonical as has_inst_canonical  # noqa: E402
from api.services.vendor_canonical import has_canonical as has_vendor_canonical  # noqa: E402

MAX_CONTRACT_VALUE = 1e11      # data-validation rule: > 100 B rejected
SKY_MIN_VALUE = 1e7            # ≥ 10 M MXN lifetime → body-eligible
CAP, HARD_CAP = 60, 80         # F1
W = 10_000.0                   # world square
RING_R = 3_600.0
GAP = 4.0
SEED = 20261002
# §3.8 period_q: backend ADMINISTRATION_KEYS order (fox, calderon, pena_nieto, amlo, sheinbaum), outgoing-president years
PERIOD_END = (2006, 2012, 2018, 2024, 9999)
T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:7.1f}s]", *a, flush=True)


def r_sys(v: float) -> float:
    return min(120.0, max(30.0, 30 + 15 * math.log10(max(v, 1.0) / 1e7)))


# ---------------------------------------------------------------- stage 1
def ties_pass(conn):
    vc = dict(conn.execute("SELECT vendor_id, canonical_id FROM vendor_canonical")) if has_vendor_canonical(conn) else {}
    ic = dict(conn.execute("SELECT institution_id, canonical_id FROM institution_canonical")) if has_inst_canonical(conn) else {}
    log("suspect-decimal scan …")
    suspect = set(suspect_decimal_contracts(conn))
    log(f"suspect-decimal contracts: {len(suspect)}")
    ties: dict[tuple[int, int], list] = {}
    hc = defaultdict(float)          # institution → Σ amount with risk ≥ 0.40 (high + critical)
    an = defaultdict(int)
    data_cut = ""
    n = 0
    for cid, vid, iid, amt, yr, risk, da, sb, pub in conn.execute(
        "SELECT id, vendor_id, institution_id, amount_mxn, contract_year, risk_score,"
        " is_direct_award, is_single_bid, publication_date FROM contracts NOT INDEXED"
    ):
        n += 1
        if pub and pub > data_cut:
            data_cut = pub
        if amt is None or amt <= 0:
            an["amount_le_0"] += 1
            continue
        if amt > MAX_CONTRACT_VALUE:
            an["over_100b_rejected"] += 1
            continue
        if cid in suspect:
            an["suspect_decimal_excluded"] += 1
            continue
        if vid is None or iid is None:
            an["no_vendor_or_institution"] += 1
            continue
        if amt > 1e10:
            an["over_10b_flagged"] += 1
        v = vc.get(vid, vid)
        i = ic.get(iid, iid)
        t = ties.get((v, i))
        if t is None:
            t = ties[(v, i)] = [0.0, 0, 9999, 0, 0.0, 0, 0, 0, 0.0, 0.0, 0.0, 0.0, 0.0]
        t[0] += amt
        t[1] += 1
        if yr:
            if yr < t[2]:
                t[2] = yr
            if yr > t[3]:
                t[3] = yr
            t[8 + next(p for p, end in enumerate(PERIOD_END) if yr <= end)] += amt
        else:
            an["no_year"] += 1
        if risk is not None:
            t[4] += risk
            t[5] += 1
            if risk >= 0.40:
                hc[i] += amt
        if da:
            t[6] += 1
        if sb:
            t[7] += 1
    log(f"ties pass: {n:,} contracts → {len(ties):,} ties")
    return ties, hc, dict(an), data_cut[:10], vc


# ---------------------------------------------------------------- layout helpers
def fr_layout(n, edges, w, pos, radius, iters=160):
    """Fruchterman–Reingold in a disc of `radius` (numpy, O(n²) per iteration)."""
    if n <= 1:
        return pos
    k = radius * math.sqrt(math.pi / n) * 0.9
    t = radius * 0.08
    ei, ej = edges[:, 0], edges[:, 1]
    for it in range(iters):
        d = pos[:, None, :] - pos[None, :, :]
        dist = np.sqrt((d ** 2).sum(-1)) + 1e-6
        np.fill_diagonal(dist, np.inf)
        disp = (d * (k * k / dist ** 2)[:, :, None]).sum(1)
        if len(edges):
            de = pos[ei] - pos[ej]
            dl = np.sqrt((de ** 2).sum(-1)) + 1e-6
            f = (de * (dl * w / k)[:, None])
            np.add.at(disp, ei, -f)
            np.add.at(disp, ej, f)
        ln = np.sqrt((disp ** 2).sum(-1)) + 1e-9
        pos = pos + disp / ln[:, None] * np.minimum(ln, t)[:, None]
        rr = np.sqrt((pos ** 2).sum(-1))
        over = rr > radius
        pos[over] *= (radius / rr[over])[:, None]
        t *= 0.97
    return pos


def collide(pos, rad, radius, iters=600):
    """Push systems apart to a gap of R_sys + 4, keeping them inside the disc."""
    n = len(pos)
    if n <= 1:
        return pos, 0
    need = rad[:, None] + rad[None, :] + GAP
    bad = 0
    for _ in range(iters):
        d = pos[:, None, :] - pos[None, :, :]
        dist = np.sqrt((d ** 2).sum(-1)) + 1e-9
        np.fill_diagonal(dist, np.inf)
        ov = np.clip(need - dist, 0, None)
        np.fill_diagonal(ov, 0)
        bad = int((ov > 0.5).sum() // 2)
        if bad == 0:
            break
        pos = pos + (d / dist[:, :, None] * (ov * 0.5)[:, :, None]).sum(1)
        rr = np.sqrt((pos ** 2).sum(-1)) + 1e-9
        lim = np.maximum(radius - rad, 0)
        over = rr > lim
        pos[over] *= (lim[over] / rr[over])[:, None]
    return pos, bad


def phyllotaxis(n, radius):
    k = np.arange(n)
    r = radius * np.sqrt((k + 0.5) / n)
    th = k * math.pi * (3 - math.sqrt(5))
    return np.stack([r * np.cos(th), r * np.sin(th)], 1)


def procrustes(cur, prev):
    """Rotation (or reflection) about the origin that best maps cur → prev."""
    u, _, vt = np.linalg.svd(cur.T @ prev)
    return cur @ (u @ vt)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--phyllotaxis", action="store_true", help="fallback: no backbone FR (spec §2.2)")
    ap.add_argument("--years-backfill", action="store_true", help="year tables + columns only; keeps layout_version")
    args = ap.parse_args()
    conn = sqlite3.connect(args.db, timeout=60)
    conn.execute("PRAGMA busy_timeout = 60000")
    if args.years_backfill:
        return years_backfill(conn)

    ties, hc, anomalies, data_cut, vc = ties_pass(conn)

    # ---- stars & sectors
    stars = {}
    for iid, v_stat, sid, name in conn.execute(
        "SELECT s.institution_id, s.total_value_mxn, i.sector_id, i.name FROM institution_stats s"
        " JOIN institutions i ON i.id = s.institution_id WHERE s.total_value_mxn > 0"
    ):
        stars[iid] = {"sector": sid if sid else 12, "V": 0.0, "nv": 0}
    vendor_ok = {r[0] for r in conn.execute("SELECT id FROM vendors")}
    dropped = [k for k in ties if k[1] not in stars or k[0] not in vendor_ok]
    dropped_value = sum(ties[k][0] for k in dropped)
    for k in dropped:
        del ties[k]
    log(f"dropped ties (orphan ids): {len(dropped)} · {dropped_value:,.0f} MXN")

    vtot = defaultdict(float)
    vt_by = defaultdict(list)                       # vendor → [(inst, value)]
    for (v, i), t in ties.items():
        stars[i]["V"] += t[0]
        stars[i]["nv"] += 1
        vtot[v] += t[0]
        vt_by[v].append((i, t[0]))
    for i, s in stars.items():
        s["R"] = r_sys(s["V"])
        s["h"] = hc.get(i, 0.0) / s["V"] if s["V"] > 0 else 0.0

    # ---- stage 2: sky set + public bits
    tier_raw = dict(conn.execute("SELECT vendor_id, ips_tier FROM aria_queue WHERE ips_tier BETWEEN 1 AND 3"))
    ls = label_sets(conn)
    tier = {}
    for raw, t in tier_raw.items():
        c = vc.get(raw, raw)
        tier[c] = min(t, tier.get(c, 9))
    sky = {v for v, val in vtot.items() if val >= SKY_MIN_VALUE} | (set(tier) & set(vtot))
    members = defaultdict(list)                     # canonical → raw ids
    for raw, c in vc.items():
        members[c].append(raw)
    withheld = set()
    for c in tier:
        ids = members.get(c) or [c]
        if any(r in ls["suppressed"] or excluded_from_rankings(conn, r) for r in ids):
            withheld.add(c)
    pub_tier = {c: t for c, t in tier.items() if c not in withheld}
    documented = {vc.get(r, r) for r in ls["documented"]}
    # §3.6 glyphs (flags2): bit0 SAT EFOS definitivo · bit1 SFP sanction · bit2 verified corporate group.
    # Public registries, but a suppressed / FP / persona-física id carries no glyph (same rule as tiers).
    glyph = defaultdict(int)
    for raw, efos, sfp in conn.execute("SELECT vendor_id, is_efos_definitivo, is_sfp_sanctioned FROM aria_queue"
                                       " WHERE is_efos_definitivo = 1 OR is_sfp_sanctioned = 1"):
        glyph[vc.get(raw, raw)] |= (1 if efos else 0) | (2 if sfp else 0)
    # The deploy DB is a trimmed copy and may lack corporate_group_members (prod 2026-10-02): no twin rings, say so.
    has_cgm = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='corporate_group_members'").fetchone()
    if has_cgm:
        for (raw,) in conn.execute("SELECT DISTINCT vendor_id FROM corporate_group_members WHERE verification_source IS NOT NULL"):
            glyph[vc.get(raw, raw)] |= 4
    else:
        log("corporate_group_members absent on this DB → 0 verified-group twin rings")
    for c in list(glyph):
        if any(r in ls["suppressed"] or excluded_from_rankings(conn, r) for r in (members.get(c) or [c])):
            del glyph[c]
    log(f"sky set {len(sky):,} · tiered {len(tier):,} · withheld {len(withheld):,} · public T1–T3 {len(pub_tier):,}")

    # ---- stage 3a: sector ring
    sec_ids = sorted({s["sector"] for s in stars.values()} | set(range(1, 13)))
    sidx = {g: n for n, g in enumerate(sec_ids)}
    G = len(sec_ids)
    M = np.zeros(G)
    for s in stars.values():
        M[sidx[s["sector"]]] += s["V"]
    vg = defaultdict(lambda: np.zeros(G))
    for (v, i), t in ties.items():
        vg[v][sidx[stars[i]["sector"]]] += t[0]
    VG = np.array([a for a in vg.values() if (a > 0).sum() > 1]) if vg else np.zeros((0, G))
    Wg = np.zeros((G, G))
    for a in range(G):
        for b in range(a + 1, G):
            Wg[a, b] = Wg[b, a] = np.minimum(VG[:, a], VG[:, b]).sum() if len(VG) else 0
    rng = np.random.default_rng(SEED)
    gpos = rng.normal(size=(G, 2))
    e = np.array([(a, b) for a in range(G) for b in range(a + 1, G) if Wg[a, b] > 0]).reshape(-1, 2)
    ew = np.array([Wg[a, b] for a, b in e]) / (Wg.max() or 1)
    gpos = fr_layout(G, e, ew, gpos, 1.0, iters=300)
    order = np.argsort(np.arctan2(gpos[:, 1], gpos[:, 0]))
    frac = np.maximum(M / (M.sum() or 1), 0.03)
    frac /= frac.sum()
    Rg = np.zeros(G)
    for s in stars.values():
        Rg[sidx[s["sector"]]] += s["R"] ** 2
    Rg = np.sqrt(np.maximum(Rg, 30.0 ** 2) / 0.45)
    gc = np.zeros((G, 2))
    ang = -math.pi / 2
    for g in order:
        mid = ang + math.pi * frac[g]
        gc[g] = (RING_R * math.cos(mid), RING_R * math.sin(mid))
        ang += 2 * math.pi * frac[g]
    for _ in range(400):                            # iterative push (discs + 3 % gap)
        moved = False
        for a in range(G):
            for b in range(a + 1, G):
                d = gc[b] - gc[a]
                dist = math.hypot(*d) or 1e-6
                need = (Rg[a] + Rg[b]) * 1.03
                if dist < need:
                    push = d / dist * (need - dist) / 2
                    gc[a] -= push
                    gc[b] += push
                    moved = True
        if not moved:
            break
    # ---- stage 3b: stars inside discs
    prev = {}
    try:
        prev = {r[0]: (r[1], r[2], r[3]) for r in conn.execute(
            "SELECT entity_id, x - (SELECT x FROM atlas_sky_layout g WHERE g.kind='g' AND g.entity_id = l.host_id),"
            " y - (SELECT y FROM atlas_sky_layout g WHERE g.kind='g' AND g.entity_id = l.host_id), host_id"
            " FROM atlas_sky_layout l WHERE kind='s'")}
    except sqlite3.OperationalError:
        pass
    by_sec = defaultdict(list)
    for i, s in stars.items():
        by_sec[s["sector"]].append(i)
    share = {k: t[0] / stars[k[1]]["V"] for k, t in ties.items()}
    vend_sec = defaultdict(lambda: defaultdict(list))   # sector → vendor → [(local idx, share)]
    bb_total = bb_kept = 0.0
    overlaps = 0
    loc = {}
    for g, ids in by_sec.items():
        ids.sort(key=lambda i: (-stars[i]["V"], i))
        loc.update({i: k for k, i in enumerate(ids)})
    for (v, i), sh in share.items():
        vend_sec[stars[i]["sector"]][v].append((loc[i], sh))
    for g, ids in by_sec.items():
        n = len(ids)
        Wm = np.zeros((n, n))
        for lst in vend_sec[g].values():
            if len(lst) < 2:
                continue
            ix = np.array([a for a, _ in lst])
            sv = np.array([b for _, b in lst])
            m = np.minimum(sv[:, None], sv[None, :])
            np.fill_diagonal(m, 0)
            Wm[np.ix_(ix, ix)] += m
        deg = Wm.sum(1)
        nz = deg > 0
        Wn = np.zeros_like(Wm)
        if nz.any():
            Wn[np.ix_(nz, nz)] = Wm[np.ix_(nz, nz)] / np.sqrt(np.outer(deg[nz], deg[nz]))
        keep = np.zeros_like(Wn, dtype=bool)
        for a in range(n):
            top = np.argsort(-Wn[a])[:10]
            keep[a, top[Wn[a, top] > 0]] = True
        keep |= keep.T
        bb_total += Wm.sum() / 2
        bb_kept += Wm[keep].sum() / 2
        ea, eb = np.nonzero(np.triu(keep, 1))
        edges = np.stack([ea, eb], 1)
        ewt = Wn[ea, eb] / (Wn[ea, eb].max() if len(ea) else 1)
        rad = np.array([stars[i]["R"] for i in ids])
        R = Rg[sidx[g]]
        pos = phyllotaxis(n, R * 0.85)
        linked = keep.any(1)
        if not args.phyllotaxis and linked.sum() > 2:
            li = np.nonzero(linked)[0]
            remap = -np.ones(n, dtype=int)
            remap[li] = np.arange(len(li))
            pos_l = fr_layout(len(li), remap[edges], ewt, pos[li].copy(), R * 0.85)
            pos[li] = pos_l
            iso = np.nonzero(~linked)[0]            # «sin proveedores compartidos: en el borde», value order
            for rank, a in enumerate(iso):
                th = -math.pi / 2 + 2 * math.pi * rank / max(len(iso), 1)
                pos[a] = ((R - rad[a]) * math.cos(th), (R - rad[a]) * math.sin(th))
        pos, bad = collide(pos, rad, R)
        overlaps += bad
        shared = [k for k, i in enumerate(ids) if i in prev and prev[i][2] == g]
        if len(shared) >= 3:
            P = np.array([prev[ids[k]][:2] for k in shared])
            C = pos[shared]
            u, _, vt = np.linalg.svd(C.T @ P)
            pos = pos @ (u @ vt)
        for k, i in enumerate(ids):
            stars[i]["x"], stars[i]["y"] = pos[k]
            stars[i]["linked"] = bool(linked[k])
    # global fit into the world square (one uniform σ: positions AND R_sys)
    lo = (gc - Rg[:, None]).min(0)
    hi = (gc + Rg[:, None]).max(0)
    sigma = (W * 0.94) / (hi - lo).max()
    off = (W - (hi - lo) * sigma) / 2 - lo * sigma
    gw = gc * sigma + off
    for i, s in stars.items():
        gi = sidx[s["sector"]]
        s["x"] = gw[gi, 0] + s["x"] * sigma
        s["y"] = gw[gi, 1] + s["y"] * sigma
        s["R"] *= sigma
    log(f"layout: σ={sigma:.4f} · residual overlaps {overlaps} · backbone kept {100 * bb_kept / (bb_total or 1):.1f} %")

    # ---- stage 4: hosts, cap, slots, remainder
    host = {}
    for v, lst in vt_by.items():
        host[v] = min(lst, key=lambda p: (-p[1], p[0]))[0]
    prim = defaultdict(list)
    for v, i in host.items():
        prim[i].append(v)
    drawn = {}                                      # vendor → host
    band = defaultdict(lambda: [0.0, 0])            # (star, year) → [value, n]
    overflow = 0
    for i, vs in prim.items():
        vs.sort(key=lambda v: (-ties[(v, i)][0], v))
        elig = [v for v in vs if v in sky]
        chosen = elig[:CAP]
        pri = [v for v in elig[CAP:] if pub_tier.get(v, 9) <= 2 or v in documented]
        chosen += pri[: HARD_CAP - len(chosen)]
        cs = set(chosen)
        overflow += len(elig) - len(chosen)
        for v in vs:
            if v in cs:
                drawn[v] = i
            else:
                t = ties[(v, i)]
                b = band[(i, t[2] if t[2] != 9999 else 2002)]
                b[0] += t[0]
                b[1] += 1
    per_star = defaultdict(int)
    for v, i in drawn.items():
        per_star[i] += 1
    slots = defaultdict(list)
    for v, i in drawn.items():
        slots[(i, ties[(v, i)][2])].append(v)
    body = []
    for (i, yr), vs in slots.items():
        vs.sort(key=lambda v: (-ties[(v, i)][0], v))
        for s_, v in enumerate(vs):
            t = ties[(v, i)]
            sh = t[0] / stars[i]["V"]
            dep = t[0] / vtot[v]
            risk = t[4] / t[5] if t[5] else None
            flags = (1 if dep >= 0.5 else 0) | (2 if v in documented else 0) | (pub_tier.get(v, 0) << 2)
            size_q = int(round(min(max(math.log10(t[0] / 1e7), 0), 4) * 63.75))
            # period_q[5]: 0 = no money at this star in that sexenio, else 1 + the size_q scale on 1..255
            period_q = bytes(0 if t[8 + p] <= 0 else 1 + int(round(min(max(math.log10(t[8 + p] / 1e7), 0), 4) * 63.5))
                             for p in range(5))
            body.append((v, i, sh, yr if yr != 9999 else 2002, s_, len(vs), size_q,
                         t[2] if t[2] != 9999 else 2002, t[3] or 2002, flags, dep, risk, t[0], glyph.get(v, 0), period_q))
    log(f"drawn {len(body):,} bodies · overflow to band {overflow:,} · per-star max {max(per_star.values())}")

    # halo sector stats
    hstats = {}
    for g, ids in by_sec.items():
        hs = np.array([stars[i]["h"] for i in ids if stars[i]["V"] > 0])
        hstats[g] = (float(np.median(hs)) if len(hs) else 0.0, float(np.percentile(hs, 90)) if len(hs) else 0.0)

    # co-bid top-8 per drawn body
    cob = defaultdict(dict)
    for a, b, shp, col in conn.execute(
        "SELECT vendor_id_a, vendor_id_b, shared_procedures, is_potential_collusion FROM co_bidding_stats"
        " WHERE shared_procedures >= 3"
    ):
        a, b = vc.get(a, a), vc.get(b, b)
        if a == b:
            continue
        for x, y in ((a, b), (b, a)):
            if x in drawn:
                old = cob[x].get(y)
                if old is None or shp > old[0]:
                    cob[x][y] = (shp, col or 0)
    cob_rows = []
    for x, d in cob.items():
        for y, (shp, col) in sorted(d.items(), key=lambda kv: -kv[1][0])[:8]:
            cob_rows.append((x, y, shp, col))

    # ---- stage 5: asserts
    star_sum = defaultdict(float)
    for (v, i), t in ties.items():
        sh = t[0] / stars[i]["V"]
        assert 0 < sh <= 1 + 1e-9, (v, i, sh)
        star_sum[i] += sh
    assert all(s <= 1 + 1e-6 for s in star_sum.values()), "star share sum > 1"
    assert all(b[10] <= 1 + 1e-9 for b in body), "dependence > 1"
    assert len(dropped) == 0, f"{len(dropped)} dropped ties"
    assert max(per_star.values()) <= HARD_CAP
    # S5 A1: remainder on the primary-host basis — per star, drawn + band = the money of the vendors whose
    # top buyer it is; a multi-buyer vendor's ties at other stars (its ghosts) are counted once, at its host
    prim_v = defaultdict(float)
    for v, i in host.items():
        prim_v[i] += ties[(v, i)][0]
    drawn_s, band_s = defaultdict(float), defaultdict(float)
    for b in body:
        drawn_s[b[1]] += b[12]
    for (i, _), (val, _) in band.items():
        band_s[i] += val
    for i, pv in prim_v.items():
        assert abs(drawn_s[i] + band_s[i] - pv) <= 1e-6 * max(pv, 1.0), ("drawn + remainder != primary", i)
    sup_c = {vc.get(r, r) for r in ls["suppressed"]}
    assert not any((b[9] >> 2) and (b[0] in sup_c or b[0] in withheld) for b in body), "suppressed id carries tier bit"
    doc_bits = sum(1 for b in body if b[9] & 2)
    doc_sky = len(documented & set(drawn))
    assert doc_bits == doc_sky
    assert not any(b[13] and b[0] in sup_c for b in body), "suppressed id carries a glyph"

    # ---- write
    now = datetime.now(timezone.utc)
    lv = now.strftime("%Y%m%dT%H%M%SZ")
    conn.executescript("""
    DROP TABLE IF EXISTS atlas_sky_ties; DROP TABLE IF EXISTS atlas_sky_layout;
    DROP TABLE IF EXISTS atlas_sky_cobid; DROP TABLE IF EXISTS atlas_sky_meta;
    CREATE TABLE atlas_sky_ties (institution_id INTEGER NOT NULL, vendor_id INTEGER NOT NULL,
      value_mxn REAL, n_contracts INTEGER, first_year INTEGER, last_year INTEGER,
      avg_risk REAL, da_count INTEGER, sb_count INTEGER, PRIMARY KEY (institution_id, vendor_id));
    CREATE INDEX idx_ast_vendor ON atlas_sky_ties(vendor_id);
    CREATE TABLE atlas_sky_layout (kind TEXT NOT NULL, entity_id INTEGER NOT NULL, host_id INTEGER NOT NULL DEFAULT 0,
      x REAL, y REAL, r_sys REAL, share REAL, year INTEGER, slot INTEGER, n_slots INTEGER, size_q INTEGER,
      y0 INTEGER, y1 INTEGER, flags INTEGER, flags2 INTEGER, period_q BLOB, value_mxn REAL, n_vendors INTEGER,
      h REAL, dep REAL, risk REAL, layout_version TEXT NOT NULL, PRIMARY KEY (kind, entity_id, host_id));
    CREATE INDEX idx_asl_host ON atlas_sky_layout(host_id, kind);
    CREATE TABLE atlas_sky_cobid (vendor_id INTEGER, partner_id INTEGER, shared_procedures INTEGER,
      is_potential_collusion INTEGER, PRIMARY KEY (vendor_id, partner_id));
    CREATE TABLE atlas_sky_meta (key TEXT PRIMARY KEY, value TEXT);
    """)
    with conn:
        conn.executemany(
            "INSERT INTO atlas_sky_ties VALUES (?,?,?,?,?,?,?,?,?)",
            ((i, v, t[0], t[1], t[2] if t[2] != 9999 else None, t[3] or None,
              t[4] / t[5] if t[5] else None, t[6], t[7]) for (v, i), t in ties.items()))
        L = "INSERT INTO atlas_sky_layout (kind, entity_id, host_id, x, y, r_sys, share, year, slot, n_slots, size_q," \
            " y0, y1, flags, flags2, value_mxn, n_vendors, h, dep, risk, layout_version, period_q) VALUES" \
            " (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        conn.executemany(L, (("g", g, 0, float(gw[sidx[g], 0]), float(gw[sidx[g], 1]), float(Rg[sidx[g]] * sigma),
                              None, None, None, None, None, None, None, None, None, float(M[sidx[g]]),
                              len(by_sec.get(g, [])), hstats.get(g, (0, 0))[0], None, None, lv, None) for g in sec_ids))
        conn.executemany(L, (("s", i, s["sector"], s["x"], s["y"], s["R"], None, None, None, None, None, None, None,
                              int(s["linked"]), None, s["V"], s["nv"], s["h"], None, None, lv, None) for i, s in stars.items()))
        conn.executemany(L, (("v", b[0], b[1], None, None, None, b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[13],
                              b[12], None, None, b[10], b[11], lv, b[14]) for b in body))
        conn.executemany(L, (("r", yr, i, None, None, None, None, yr, None, None, None, None, None, None, None,
                              val, nn, None, None, None, lv, None) for (i, yr), (val, nn) in band.items()))
        conn.executemany("INSERT INTO atlas_sky_cobid VALUES (?,?,?,?)", cob_rows)
        total_v = sum(s["V"] for s in stars.values())
        drawn_v = sum(b[12] for b in body)
        primary_v = sum(prim_v.values())
        band_v = sum(val for val, _ in band.values())
        assert abs(drawn_v + band_v - primary_v) <= 1e-6 * primary_v, "drawn + remainder != 100 % of primary money"
        # label the basis from the scores actually read, not a literal (it said v0.9.1 after the v0.9.2 rescore)
        risk_ver = (conn.execute("SELECT risk_model_version FROM contracts WHERE risk_model_version LIKE 'v%' "
                                 "GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1").fetchone() or ["unknown"])[0]
        meta = {
            "layout_version": lv, "computed_at": now.isoformat(timespec="seconds"), "data_cut": data_cut,
            "risk_basis": f"risk_score ({risk_ver})", "layout_mode": "phyllotaxis" if args.phyllotaxis else "backbone_fr",
            "world": W, "sigma": round(float(sigma), 6),
            "n_stars": len(stars), "n_sky": len(sky), "n_drawn": len(body), "per_star_max": max(per_star.values()),
            "n_vendors_tied": len(vtot), "n_ties": len(ties), "dropped_ties": len(dropped),
            "overflow_to_band": overflow, "public_t1": sum(1 for t in pub_tier.values() if t == 1),
            "public_t2": sum(1 for t in pub_tier.values() if t == 2),
            "public_t3": sum(1 for t in pub_tier.values() if t == 3), "withheld_tiered": len(withheld),
            "documented_drawn": doc_bits, "total_value_mxn": total_v, "drawn_value_mxn": drawn_v,
            "primary_value_mxn": primary_v, "remainder_share": round(band_v / primary_v, 6), "backbone_kept_pct": round(100 * bb_kept / (bb_total or 1), 2),
            "residual_overlaps": overlaps, "anomalies": json.dumps(anomalies),
            "sector_halo": json.dumps({str(g): [round(a, 6), round(b, 6)] for g, (a, b) in hstats.items()}),
            "n_cobid": len(cob_rows),
            "glyph_efos": sum(1 for b in body if b[13] & 1), "glyph_sfp": sum(1 for b in body if b[13] & 2),
            "glyph_group": sum(1 for b in body if b[13] & 4),
            "bin_version": "SKY2",
            "period_lit": json.dumps([sum(1 for b in body if b[14][p]) for p in range(5)]),
        }
        conn.executemany("INSERT INTO atlas_sky_meta VALUES (?,?)", ((k, str(v)) for k, v in meta.items()))
    log("tables written")

    # payload gate — the same builders the endpoints serve
    from api.services.atlas_sky import build_bin, build_manifest
    man = json.dumps(build_manifest(conn), separators=(",", ":")).encode()
    binb = build_bin(conn)
    mg, bg = len(gzip.compress(man, 6)), len(gzip.compress(binb, 6))
    with conn:
        conn.execute("INSERT INTO atlas_sky_meta VALUES ('payload_gz_bytes', ?)", (str(mg + bg),))
    for _ in range(20):
        r = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        if r[0] == 0 and r[1] == r[2]:
            break
        time.sleep(1)
    print("\n=== ATLAS SKY ===")
    for k in ("layout_version", "layout_mode", "n_stars", "n_sky", "n_drawn", "per_star_max", "overflow_to_band",
              "remainder_share", "dropped_ties", "backbone_kept_pct", "residual_overlaps", "public_t1", "public_t2",
              "public_t3", "withheld_tiered", "documented_drawn", "n_cobid", "glyph_efos", "glyph_sfp",
              "glyph_group", "period_lit", "sigma", "data_cut", "anomalies"):
        print(f"{k:>20}: {meta[k]}")
    print(f"{'payload gz':>20}: manifest {mg:,} + bin {bg:,} = {mg + bg:,} B (gate ≤ 460,800)")
    print(f"{'wal_checkpoint':>20}: {tuple(r)}")
    assert mg + bg <= 450 * 1024, "payload gate"
    log("done")


# ---------------------------------------------------------------- --years-backfill (instruments spec §2)
Y0, NY = 2000, 27                                   # years 2000–2026 (ComprasMX 2026 rows) → column / bit y − 2000
PERIOD_KEYS = ("fox", "calderon", "pena_nieto", "amlo", "sheinbaum")
PERIOD_START = (2000, 2007, 2013, 2019, 2025)       # first year of each PERIOD_END sexenio
SUCCESSORS = ((345, 3671, 2021), (1327, 3785, 2023))  # declared (§2.5): SCT → SICT · DICONSA → Alimentación p/ el Bienestar
RSS_GATE_MB, CGROUP_FREE_MB = 600, 700


def _period(y):
    return next(p for p, end in enumerate(PERIOD_END) if y <= end)


def _peak_rss_mb():
    try:
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024   # Linux: KiB
    except ImportError:                                                   # Windows (local runs)
        import psutil
        return psutil.Process().memory_info().peak_wset / 2 ** 20


def _stage(name, t0):
    rss = _peak_rss_mb()
    log(f"stage {name}: {time.time() - t0:.1f} s · peak RSS {rss:.0f} MB (gate ≤ {RSS_GATE_MB})")
    if rss > RSS_GATE_MB:
        raise SystemExit(f"ABORT: peak RSS {rss:.0f} MB > {RSS_GATE_MB} MB after stage {name}")
    return time.time()


def _cgroup_gate():
    """The backend container is 1536M with 6 workers: an OOM kill takes the API down (§2.3 gate 1)."""
    cg = Path("/sys/fs/cgroup")
    try:
        cur = int((cg / "memory.current").read_text())
        mx = (cg / "memory.max").read_text().strip()
    except (OSError, ValueError):
        log("cgroup: no /sys/fs/cgroup memory files (local run) → headroom check skipped")
        return
    if mx == "max":
        log(f"cgroup: {cur / 2 ** 20:.0f} MB used, no limit")
        return
    free = (int(mx) - cur) / 2 ** 20
    log(f"cgroup: {cur / 2 ** 20:.0f} MB used of {int(mx) / 2 ** 20:.0f} MB → {free:.0f} MB free (gate ≥ {CGROUP_FREE_MB})")
    if free < CGROUP_FREE_MB:
        raise SystemExit(f"ABORT: {free:.0f} MB cgroup headroom < {CGROUP_FREE_MB} MB")


def years_backfill(conn):
    row = conn.execute("SELECT value FROM atlas_sky_meta WHERE key = 'layout_version'").fetchone()
    assert row, "no atlas_sky layout on this DB: run the full precompute first"
    lv = row[0]
    log(f"years backfill on layout_version {lv} (kept)")
    _cgroup_gate()
    t = time.time()

    # ---- stage 1: the ties pass's filters (ties_pass above; the drift guard proves they agree), packed keys (§2.3)
    vc = dict(conn.execute("SELECT vendor_id, canonical_id FROM vendor_canonical")) if has_vendor_canonical(conn) else {}
    ic = dict(conn.execute("SELECT institution_id, canonical_id FROM institution_canonical")) if has_inst_canonical(conn) else {}
    suspect = set(suspect_decimal_contracts(conn))
    idx: dict[int, int] = {}                        # (v << 32) | (i << 8) | (y − 2000) → row in val / cnt
    val, cnt = array("d"), array("I")
    an = defaultdict(int)
    for cid, vid, iid, amt, yr in conn.execute(
        "SELECT id, vendor_id, institution_id, amount_mxn, contract_year FROM contracts NOT INDEXED"
    ):
        if amt is None or amt <= 0 or amt > MAX_CONTRACT_VALUE or cid in suspect or vid is None or iid is None:
            continue
        if not yr:
            an["no_year"] += 1
            yr = 2002                               # as period_q does
        if not Y0 <= yr < Y0 + NY:
            an["year_out_of_range"] += 1
            continue
        k = (vc.get(vid, vid) << 32) | (ic.get(iid, iid) << 8) | (yr - Y0)
        j = idx.get(k)
        if j is None:
            idx[k] = len(val)
            val.append(amt)
            cnt.append(1)
        else:
            val[j] += amt
            cnt[j] += 1
    del suspect, ic
    log(f"years pass: {len(idx):,} (vendor, institution, year) keys · anomalies {dict(an)}")
    assert an["no_year"] == 0, f"{an['no_year']} contracts with no year (spec §2.1: must be 0)"
    assert an["year_out_of_range"] == 0, f"{an['year_out_of_range']} contracts outside 2000–2026"
    t = _stage("1 accumulate", t)

    # ---- stage 2: fold by tie (keys sorted → each tie contiguous, years ascending) + drift guard (§2.4)
    stars = {i: (V, g) for i, g, V in conn.execute(
        "SELECT entity_id, host_id, value_mxn FROM atlas_sky_layout WHERE kind = 's'")}
    host = dict(conn.execute("SELECT entity_id, host_id FROM atlas_sky_layout WHERE kind = 'v'"))
    tie_v = {(v << 32) | (i << 8): x for i, v, x in conn.execute(
        "SELECT institution_id, vendor_id, value_mxn FROM atlas_sky_ties")}
    sp_v = defaultdict(lambda: [0.0] * 5)          # star → money per sexenio
    sp_n = defaultdict(lambda: [0] * 5)            # star → contracts per sexenio
    sp_nv = defaultdict(lambda: [0] * 5)           # star → distinct vendors per sexenio
    smask, vmask = defaultdict(int), defaultdict(int)
    vp_v = defaultdict(lambda: [0.0] * 5)          # drawn body → money at its host per sexenio
    sy: dict[int, list] = {}                       # (i << 8) | yo → [value, n, n_vendors, Σ value², top value, top vendor]
    ty_keys: list[int] = []                        # tie_years rows: every tie of a drawn vendor
    offenders = []

    def flush(tk, s, pset):
        ref = tie_v.pop(tk, None)
        if ref is None or abs(s - ref) > 1e-6 * max(ref, 1.0):
            offenders.append(f"tie v{tk >> 32} @ i{(tk >> 8) & 0xFFFFFF}: Σ years {s:,.2f} vs ties {ref}")
        for p in pset:
            sp_nv[(tk >> 8) & 0xFFFFFF][p] += 1

    cur, s, pset = None, 0.0, set()
    for k in sorted(idx):
        tk = k & ~0xFF
        if tk != cur:
            if cur is not None:
                flush(cur, s, pset)
            cur, s, pset = tk, 0.0, set()
        j = idx[k]
        x, n = val[j], cnt[j]
        v, i, yo = k >> 32, (k >> 8) & 0xFFFFFF, k & 0xFF
        p = _period(Y0 + yo)
        s += x
        pset.add(p)
        smask[i] |= 1 << yo
        sp_v[i][p] += x
        sp_n[i][p] += n
        r = sy.get((i << 8) | yo)
        if r is None:
            sy[(i << 8) | yo] = [x, n, 1, x * x, x, v]
        else:
            r[0] += x
            r[1] += n
            r[2] += 1
            r[3] += x * x
            if x > r[4] or (x == r[4] and v < r[5]):
                r[4], r[5] = x, v
        h = host.get(v)
        if h is not None:
            ty_keys.append(k)
            if h == i:
                vmask[v] |= 1 << yo
                vp_v[v][p] += x
    if cur is not None:
        flush(cur, s, pset)
    offenders += [f"tie v{tk >> 32} @ i{(tk >> 8) & 0xFFFFFF}: no contracts in the years pass (ties {x:,.2f})"
                  for tk, x in tie_v.items()]
    del tie_v
    for i, (V, _) in stars.items():
        got = sum(sp_v[i]) if i in sp_v else 0.0
        if abs(got - V) > 1e-6 * max(V, 1.0):
            offenders.append(f"star {i}: Σ years {got:,.2f} vs layout {V:,.2f}")
    offenders += [f"star {i}: money in the years pass but no layout star" for i in sp_v if i not in stars]
    if offenders:
        print(f"\nDRIFT GUARD: {len(offenders)} mismatches — nothing written, layout untouched (§2.4 fallback:"
              " full rerun on a copy, swapped in after the WAL loop):")
        for o in offenders[:200]:
            print("  ", o)
        raise SystemExit(1)
    log(f"drift guard: {len(idx):,} keys fold to every tie (rel 1e-6) and every star value — 0 mismatches")
    t = _stage("2 fold + drift guard", t)

    # ---- stage 3: star-years (sky-basis HHI, thin, top_withheld), meta rows
    top_ids = {r[5] for r in sy.values()}
    members = defaultdict(list)
    for raw, c in vc.items():
        if c in top_ids:
            members[c].append(raw)
    del vc
    ls = label_sets(conn)
    withheld = {c for c in top_ids
                if any(m in ls["suppressed"] or excluded_from_rankings(conn, m) for m in (members.get(c) or [c]))}
    star_rows = []
    for key, (x, n, nv, sq, topv, topid) in sy.items():
        i, yo = key >> 8, key & 0xFF
        thin = int(nv < 3 or x < 0.01 * stars[i][0])
        star_rows.append((i, Y0 + yo, x, n, nv, None if thin else sq / (x * x) * 10_000, topv / x, topid,
                          int(topid in withheld), thin))
    year_value, year_contracts, inst_rep = [0.0] * NY, [0] * NY, [0] * NY
    for i, y, x, n, *_ in star_rows:
        year_value[y - Y0] += x
        year_contracts[y - Y0] += n
        inst_rep[y - Y0] += 1
    med = statistics.median(year_contracts)
    ok = [c >= 0.01 * med for c in year_contracts]
    first = ok.index(True)
    last = NY - 1 - ok[::-1].index(True)
    thin_early = [Y0 + yo for yo in range(first)]
    year_gaps = [Y0 + yo for yo in range(first, last + 1) if not ok[yo]]
    coverage_drop = []                              # vs the median of the four reporting years before
    for yo in range(first, NY):
        base = [inst_rep[b] for b in range(yo - 1, first - 1, -1)
                if Y0 + b not in year_gaps and Y0 + b not in coverage_drop][:4]
        if len(base) == 4 and inst_rep[yo] < 0.5 * statistics.median(base):
            coverage_drop.append(Y0 + yo)

    # decline dagger (§2.5): per sector and ordered sexenio pair (A, B), a star with ≥ 5 % of its disc's money whose
    # money in B < 10 % of A and contracts fell > 80 %, or that has no money from B's start on
    succ = {a: b for a, b, _ in SUCCESSORS}
    assert all(a in stars and b in stars for a, b, _ in SUCCESSORS), "declared successor not on the chart"
    sec_v = defaultdict(float)
    for V, g in stars.values():
        sec_v[g] += V
    breaks: dict[str, dict] = {}
    for i, (V, g) in sorted(stars.items(), key=lambda kv: -kv[1][0]):
        if V < 0.05 * sec_v[g] or i not in sp_v:
            continue
        pv, pn = sp_v[i], sp_n[i]
        last_y = Y0 + smask[i].bit_length() - 1
        for a in range(5):
            for b in range(a + 1, 5):
                if pv[a] <= 0:
                    continue
                stop = last_y < PERIOD_START[b]
                if stop or (pv[b] < 0.1 * pv[a] and pn[b] < 0.2 * pn[a]):
                    breaks.setdefault(str(g), {}).setdefault(f"{PERIOD_KEYS[a]}>{PERIOD_KEYS[b]}", []).append(
                        [i, "stop" if stop else "decline", succ.get(i)])
    # §2.6 «760 stars / 94.1 %» was on institution_hhi; the sky-basis count, printed, never cited
    readable = defaultdict(int)
    for i, *_, thin in star_rows:
        readable[i] += 1 - thin
    total_v = sum(V for V, _ in stars.values())
    r5 = [i for i, c in readable.items() if c >= 5]
    r10 = sum(1 for c in readable.values() if c >= 10)
    t = _stage("3 star-years + meta", t)

    # ---- stage 4: ONE transaction — tables, columns, meta, payload gate (§2.4); layout_version untouched
    period_rows = [(json.dumps([round(x, 2) for x in sp_v[i]]), json.dumps(sp_nv[i]), smask[i], i) for i in stars]
    # Σ period_v = value_mxn (§2.2 «within 1 peso»; float summation order differs from the layout's, so the hard
    # assert is rel 1e-9 and the count beyond 1 peso is printed)
    pdiff = [abs(sum(round(x, 2) for x in sp_v[i]) - V) for i, (V, _) in stars.items()]
    assert all(d <= max(1.0, 1e-9 * V) for d, (V, _) in zip(pdiff, stars.values())), "Σ period_v != star value"
    log(f"Σ period_v = star value: {sum(d > 1.0 for d in pdiff)} stars beyond 1 peso (max {max(pdiff):.4f})")
    body_rows = [(json.dumps([round(x, 2) for x in vp_v[v]]), vmask[v], v, h) for v, h in host.items()]
    assert all(m for _, m, _, _ in body_rows), "a drawn body with no year at its host"
    meta = {
        "year_value": json.dumps([round(x, 2) for x in year_value]), "year_contracts": json.dumps(year_contracts),
        "inst_reporting": json.dumps(inst_rep), "year_gaps": json.dumps(year_gaps), "thin_early": json.dumps(thin_early),
        "coverage_drop": json.dumps(coverage_drop), "breaks": json.dumps(breaks, separators=(",", ":")),
        "successors": json.dumps([list(s) for s in SUCCESSORS]), "years_basis": f"{Y0}-{Y0 + NY - 1}",
        "years_backfill_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "bin_version": "SKY3",
    }
    conn.isolation_level = None
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DROP TABLE IF EXISTS atlas_sky_star_years")
        conn.execute("DROP TABLE IF EXISTS atlas_sky_tie_years")
        conn.execute(
            "CREATE TABLE atlas_sky_star_years (institution_id INTEGER NOT NULL, year INTEGER NOT NULL,"
            " value_mxn REAL, n_contracts INTEGER, n_vendors INTEGER, hhi REAL, top_share REAL, top_vendor_id INTEGER,"
            " top_withheld INTEGER, thin INTEGER, PRIMARY KEY (institution_id, year)) WITHOUT ROWID")
        conn.execute(
            "CREATE TABLE atlas_sky_tie_years (vendor_id INTEGER NOT NULL, institution_id INTEGER NOT NULL,"
            " year INTEGER NOT NULL, value_mxn REAL, n_contracts INTEGER,"
            " PRIMARY KEY (vendor_id, institution_id, year)) WITHOUT ROWID")
        conn.executemany("INSERT INTO atlas_sky_star_years VALUES (?,?,?,?,?,?,?,?,?,?)", sorted(star_rows))
        conn.executemany("INSERT INTO atlas_sky_tie_years VALUES (?,?,?,?,?)",
                         ((k >> 32, (k >> 8) & 0xFFFFFF, Y0 + (k & 0xFF), val[idx[k]], cnt[idx[k]]) for k in ty_keys))
        have = {r[1] for r in conn.execute("PRAGMA table_info(atlas_sky_layout)")}
        for col, ty in (("period_v", "TEXT"), ("period_nv", "TEXT"), ("year_mask", "INTEGER")):
            if col not in have:
                conn.execute(f"ALTER TABLE atlas_sky_layout ADD COLUMN {col} {ty}")
        conn.executemany("UPDATE atlas_sky_layout SET period_v = ?, period_nv = ?, year_mask = ?"
                         " WHERE kind = 's' AND entity_id = ?", period_rows)
        conn.executemany("UPDATE atlas_sky_layout SET period_v = ?, year_mask = ?"
                         " WHERE kind = 'v' AND entity_id = ? AND host_id = ?", body_rows)
        conn.executemany("INSERT OR REPLACE INTO atlas_sky_meta VALUES (?, ?)", meta.items())
        assert conn.execute("SELECT value FROM atlas_sky_meta WHERE key = 'layout_version'").fetchone()[0] == lv
        from api.services.atlas_sky import build_bin, build_manifest
        man = json.dumps(build_manifest(conn), separators=(",", ":")).encode()
        binb = build_bin(conn)
        assert binb[:4] == b"SKY3", "build_bin did not emit SKY3 after the backfill"
        mg, bg = len(gzip.compress(man, 6)), len(gzip.compress(binb, 6))
        assert mg + bg <= 450 * 1024, f"payload gate: {mg + bg:,} B > 460,800"
        conn.execute("INSERT OR REPLACE INTO atlas_sky_meta VALUES ('payload_gz_bytes', ?)", (str(mg + bg),))
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        log("ROLLED BACK — nothing written")
        raise
    n_sy, n_ty = len(star_rows), len(ty_keys)
    t = _stage("4 write (one transaction)", t)
    for _ in range(60):
        r = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        if r[0] == 0 and r[1] == r[2]:
            break
        time.sleep(1)

    sig = dict(conn.execute("SELECT id, COALESCE(NULLIF(siglas, ''), substr(name, 1, 40)) FROM institutions"))
    print("\n=== ATLAS SKY · YEARS BACKFILL ===")
    print(f"{'layout_version':>22}: {lv} (unchanged)")
    print(f"{'atlas_sky_star_years':>22}: {n_sy:,} rows")
    print(f"{'atlas_sky_tie_years':>22}: {n_ty:,} rows ({len(host):,} drawn vendors, every tie)")
    print(f"{'year_contracts':>22}: {dict(zip(range(Y0, Y0 + NY), year_contracts))}")
    print(f"{'inst_reporting':>22}: {dict(zip(range(Y0, Y0 + NY), inst_rep))}")
    print(f"{'thin_early':>22}: {thin_early}")
    print(f"{'year_gaps':>22}: {year_gaps}")
    print(f"{'coverage_drop':>22}: {coverage_drop}")
    print(f"{'successors':>22}: {[(sig.get(a), a, sig.get(b), b, y) for a, b, y in SUCCESSORS]}")
    print(f"{'readable stars':>22}: {len(r5)} with ≥ 5 non-thin years ({100 * sum(stars[i][0] for i in r5) / total_v:.1f} %"
          f" of sky money) · {r10} with ≥ 10")
    print(f"{'breaks':>22}:")
    for g in sorted(breaks, key=int):
        for pair, lst in breaks[g].items():
            print(f"    sector {g:>2} {pair:<22} " + " · ".join(
                f"{sig.get(i)} {i} {kind}" + (f" → {sig.get(sc)} {sc}" if sc else "") for i, kind, sc in lst))
    print(f"{'payload gz':>22}: manifest {mg:,} + bin {bg:,} = {mg + bg:,} B (gate ≤ 460,800)")
    print(f"{'wal_checkpoint':>22}: {tuple(r)}")
    log("done")


if __name__ == "__main__":
    main()
