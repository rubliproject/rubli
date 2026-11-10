"""«El Atlas» sky payloads — spec .claude/designs/atlas-2026-10-02-spec.md §2.9.

Shared by GET /atlas/sky/manifest, GET /atlas/sky/planets.bin and the
precompute's payload gate, so the measured bytes are the served bytes.
Reads only the atlas_sky_* tables (plus institution/sector names).

planets.bin (little-endian, columnar, widest first so every typed array is aligned):
  'SKY2' · u32 n
  vendor_id u32[n] · host_idx u16[n] · share_q u16[n] · risk_q u16[n]
  year u8[n] · slot u8[n] · n_slots u8[n] · y1 u8[n] · size_q u8[n] · flags u8[n] · flags2 u8[n]
  share   = 10^(−share_q / 10 000)      (5-decade scale lives in geometry.ts)
  risk    = risk_q / 10 000, 65 535 = none
  year/y1 = value + 2000
  flags   bit0 dependence ≥ 0.5 (solid) · bit1 documented (label_sets) · bits2-3 public ARIA tier (0 = none)
  flags2  bit0 SAT EFOS definitivo · bit1 SFP sanction · bit2 verified corporate group (0 for withheld ids)
  period_q u8[n] × 5, one column per sexenio (fox, calderon, pena_nieto, amlo, sheinbaum) — S3 §3.8:
           0 = no money at the host in that sexenio, else 1 + clamp(log10(v/1e7), 0, 4)·63.5
'SKY3' (instruments spec §2.6, after `--years-backfill`): the SKY2 block, then
  year_mask u8[n] × 4 — bytes 0..3 (little end first) of the 26-bit mask, bit y − 2000 = money at the host in y
"""
from __future__ import annotations

import gzip
import json
import math
import sqlite3
import struct
import threading

import numpy as np

from ..pii import redact_person_rfcs
from .institution_canonical import buyer_levels

_LOCK = threading.Lock()
_CACHE: dict[str, tuple] = {}       # layout_version → (manifest dict, bin gz bytes, bin raw bytes)


def sky_version(conn: sqlite3.Connection) -> str | None:
    try:
        row = conn.execute("SELECT value FROM atlas_sky_meta WHERE key = 'layout_version'").fetchone()
    except sqlite3.OperationalError:
        return None
    return row[0] if row else None


def has_years(conn: sqlite3.Connection) -> bool:
    """The years backfill ran (instruments spec §2.4): layout carries year_mask → SKY3 + year fields."""
    return any(r[1] == "year_mask" for r in conn.execute("PRAGMA table_info(atlas_sky_layout)"))


def sky_tag(conn: sqlite3.Connection) -> str | None:
    """ETag body: layout_version, + «-y1» once SKY3 is served, so a cached SKY2 response is never reused under
    the same lv (§2.6). Also the per-worker cache key — the backfill keeps lv, the tag still turns over."""
    lv = sky_version(conn)
    tag = f"{lv}-y1" if lv and has_years(conn) else lv
    # «-b1»: the manifest carries stars.lvl (buyer scope) — a cached manifest without it is never reused
    tag = f"{tag}-b1" if tag and buyer_levels(conn) else tag
    # «-r…»: the risk label turns the tag over too (relabelled v0.9.1 → v0.9.2 in place, 2026-10-27)
    rb = conn.execute("SELECT value FROM atlas_sky_meta WHERE key = 'risk_basis'").fetchone() if tag else None
    return f"{tag}-r{''.join(ch for ch in rb[0] if ch.isdigit())}" if rb else tag


# stars.lvl (docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md Phase 1): 0 federal · 1 estatal · 2 municipal · 3 otro
LEVEL_CODE = {"federal": 0, "estatal": 1, "municipal": 2}


YEAR_META = ("year_value", "year_contracts", "inst_reporting", "year_gaps", "thin_early", "coverage_drop", "breaks",
             "successors")


def _meta(conn) -> dict:
    return dict(conn.execute("SELECT key, value FROM atlas_sky_meta"))


def _star_order(conn) -> list[tuple]:
    return conn.execute(
        "SELECT l.entity_id, i.name, i.siglas, l.host_id, l.x, l.y, l.r_sys, l.value_mxn, l.h, l.n_vendors, l.flags"
        " FROM atlas_sky_layout l LEFT JOIN institutions i ON i.id = l.entity_id"
        " WHERE l.kind = 's' ORDER BY l.value_mxn DESC, l.entity_id"
    ).fetchall()


def _vendor_totals(conn: sqlite3.Connection, ids: list[int]) -> dict[int, tuple]:
    """vendor_id → (total_contracts, total_value_mxn, avg_risk_score) from vendor_stats, by PK."""
    if not ids:
        return {}
    return {v: (n, val, rk) for v, n, val, rk in conn.execute(
        f"SELECT vendor_id, total_contracts, total_value_mxn, avg_risk_score FROM vendor_stats"
        f" WHERE vendor_id IN ({_in(ids)})", ids)}


def build_manifest(conn: sqlite3.Connection) -> dict:
    m = _meta(conn)
    stars = _star_order(conn)
    # primary-host basis (S5 A1): a star's «resto» is its band money over the money of the vendors whose
    # top buyer it is (drawn + band) — a multi-buyer vendor's ties at other stars are not «not drawn» here
    drawn = {h: (n, v or 0.0) for h, n, v in conn.execute(
        "SELECT host_id, COUNT(*), SUM(value_mxn) FROM atlas_sky_layout WHERE kind = 'v' GROUP BY host_id")}
    band = {h: (n or 0, v or 0.0) for h, n, v in conn.execute(
        "SELECT host_id, SUM(n_vendors), SUM(value_mxn) FROM atlas_sky_layout WHERE kind = 'r' GROUP BY host_id")}
    halo = json.loads(m.get("sector_halo", "{}"))
    years = has_years(conn)
    ym = dict(conn.execute("SELECT entity_id, year_mask FROM atlas_sky_layout WHERE kind = 's'")) if years else {}
    sectors = [
        {"id": g, "code": code, "name_es": es, "name_en": en, "x": round(x, 1), "y": round(y, 1),
         "r": round(r, 1), "value": round(v or 0), "n_stars": n,
         "h_med": halo.get(str(g), [0, 0])[0], "h_p90": halo.get(str(g), [0, 0])[1]}
        for g, code, es, en, x, y, r, v, n in conn.execute(
            "SELECT l.entity_id, s.code, s.name_es, s.name_en, l.x, l.y, l.r_sys, l.value_mxn, l.n_vendors"
            " FROM atlas_sky_layout l LEFT JOIN sectors s ON s.id = l.entity_id WHERE l.kind = 'g'"
            " ORDER BY l.entity_id")
    ]
    cols = {k: [] for k in ("id", "name", "siglas", "sector", "x", "y", "r", "v", "h", "nv", "drawn", "np", "rem",
                            "linked")}
    if years:
        cols["ym"] = []
    levels = buyer_levels(conn)
    if levels:
        cols["lvl"] = []
    for iid, name, siglas, sec, x, y, r, v, h, nv, linked in stars:
        n, dv = drawn.get(iid, (0, 0.0))
        bn, bv = band.get(iid, (0, 0.0))
        cols["id"].append(iid)
        cols["name"].append(name or "")
        cols["siglas"].append(siglas or "")
        cols["sector"].append(sec)
        cols["x"].append(round(x, 1))
        cols["y"].append(round(y, 1))
        cols["r"].append(round(r, 2))
        cols["v"].append(round(v or 0))
        cols["h"].append(round(h or 0, 4))
        cols["nv"].append(nv or 0)
        cols["drawn"].append(n)
        cols["np"].append(n + bn)
        cols["rem"].append(round(bv / (dv + bv), 4) if dv + bv > 0 else 0.0)
        cols["linked"].append(int(linked or 0))
        if years:
            cols["ym"].append(ym.get(iid) or 0)
        if levels:
            cols["lvl"].append(LEVEL_CODE.get(levels.get(iid), 3))
    raw, canon = [], []
    try:
        for a, b in conn.execute(
            "SELECT institution_id, canonical_id FROM institution_canonical WHERE institution_id <> canonical_id"
            " ORDER BY institution_id"):
            raw.append(a)
            canon.append(b)
    except sqlite3.OperationalError:
        pass
    basis_keys = ("n_stars", "n_sky", "n_drawn", "per_star_max", "n_vendors_tied", "n_ties", "dropped_ties",
                  "overflow_to_band", "public_t1", "public_t2", "public_t3", "documented_drawn", "residual_overlaps")
    out = {
        "layout_version": m.get("layout_version"),
        "computed_at": m.get("computed_at"),
        "data_cut": m.get("data_cut"),
        "risk_basis": m.get("risk_basis"),
        "layout_mode": m.get("layout_mode"),
        "world": float(m.get("world", 10000)),
        "basis": {k: int(m.get(k, 0)) for k in basis_keys} | {
            "total_value_mxn": float(m.get("total_value_mxn", 0)),
            "drawn_value_mxn": float(m.get("drawn_value_mxn", 0)),
            "remainder_share": float(m.get("remainder_share", 0)),
            "primary_value_mxn": float(m.get("primary_value_mxn", 0)),
            "backbone_kept_pct": float(m.get("backbone_kept_pct", 0)),
        },
        "anomalies": json.loads(m.get("anomalies", "{}")),
        "sectors": sectors,
        "stars": cols,
        "inst_map": {"raw": raw, "canon": canon},
    }
    if years:   # §2.2 meta rows; absent before the backfill → the client hides the rail histogram (never zeros)
        out["meta"] = {k: json.loads(m[k]) for k in YEAR_META if k in m}
    return out


def build_bin(conn: sqlite3.Connection) -> bytes:
    idx = {row[0]: n for n, row in enumerate(_star_order(conn))}
    years = has_years(conn)
    rows = conn.execute(
        "SELECT entity_id, host_id, share, risk, year, slot, n_slots, y1, size_q, flags, COALESCE(flags2, 0), period_q,"
        f" {'COALESCE(year_mask, 0)' if years else '0'} FROM atlas_sky_layout WHERE kind = 'v'").fetchall()
    rows.sort(key=lambda r: (idx[r[1]], -r[2], r[0]))
    n = len(rows)
    a = np.array([r[0] for r in rows], dtype="<u4")
    host = np.array([idx[r[1]] for r in rows], dtype="<u2")
    share_q = np.array([round(min(-math.log10(r[2]), 6.5535) * 10000) for r in rows], dtype="<u2")
    risk_q = np.array([65535 if r[3] is None else round(r[3] * 10000) for r in rows], dtype="<u2")
    u8 = [np.array([r[k] - 2000 if k in (4, 7) else r[k] for r in rows], dtype="u1") for k in (4, 5, 6, 7, 8, 9, 10)]
    per = np.frombuffer(b"".join(bytes(r[11] or b"")[:5].ljust(5, b"\0") for r in rows), dtype="u1").reshape(n, 5)
    cols = (a, host, share_q, risk_q, *u8, *(np.ascontiguousarray(per[:, p]) for p in range(5)))
    if years:
        ym = np.array([r[12] for r in rows], dtype="<u4")
        cols += tuple(((ym >> (8 * b)) & 0xFF).astype("u1") for b in range(4))
    return (b"SKY3" if years else b"SKY2") + struct.pack("<I", n) + b"".join(x.tobytes() for x in cols)


def cached(conn: sqlite3.Connection, lv: str) -> tuple:
    """(manifest dict, bin gz, bin raw) built once per worker per sky_tag (layout_version + year token)."""
    hit = _CACHE.get(lv)
    if hit:
        return hit
    with _LOCK:
        hit = _CACHE.get(lv)
        if not hit:
            raw = build_bin(conn)
            hit = (build_manifest(conn), gzip.compress(raw, 6), raw)
            _CACHE.clear()
            _CACHE[lv] = hit
    return hit


_WIRE: dict[str, tuple[bytes, bytes]] = {}  # sky_tag → (manifest JSON bytes, gzip of them)


def manifest_wire(conn: sqlite3.Connection, lv: str) -> tuple[bytes, bytes]:
    """The manifest serialised, RFC-redacted and gzipped once per worker per sky_tag, not per request.
    Served pre-encoded, so RfcRedactionMiddleware passes it through: the redaction runs here instead."""
    hit = _WIRE.get(lv)
    if hit:
        return hit
    manifest = cached(conn, lv)[0]
    with _LOCK:
        hit = _WIRE.get(lv)
        if not hit:
            # same encoding as starlette's JSONResponse
            text = json.dumps(manifest, ensure_ascii=False, allow_nan=False, indent=None, separators=(",", ":"))
            raw = redact_person_rfcs(text).encode("utf-8")
            hit = (raw, gzip.compress(raw, 6))
            _WIRE.clear()
            _WIRE[lv] = hit
    return hit


# ---------------------------------------------------------------------------
# GET /atlas/sky/system — one star system (spec §2.9 row 3, §3.5, §3.6).
# Reads atlas_sky_* plus names / vendor_stats / aria_queue / corporate groups,
# all by primary key or the idx_ast_vendor / idx_asl_host indexes. No RFC.
# ---------------------------------------------------------------------------
GHOST_CAP = 60
ALSO_CAP = 12          # memberships listed per body; the rest bundle into a count
_SYS_CACHE: dict[tuple, dict] = {}
_SYS_LOCK = threading.Lock()


def _in(ids) -> str:
    return ",".join("?" * len(ids)) or "NULL"


def _has(conn, name: str) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE name = ?", (name,)).fetchone() is not None


def resolve_vendor(conn: sqlite3.Connection, vendor_id: int) -> tuple[int, int | None, bool]:
    """(canonical vendor, host star, drawn?) — host = the drawn body's host, else its top buyer by ties."""
    row = None
    if _has(conn, "vendor_canonical"):
        row = conn.execute("SELECT canonical_id FROM vendor_canonical WHERE vendor_id = ?", (vendor_id,)).fetchone()
    v = row[0] if row else vendor_id
    body = conn.execute("SELECT host_id FROM atlas_sky_layout WHERE kind = 'v' AND entity_id = ?", (v,)).fetchone()
    if body:
        return v, body[0], True
    top = conn.execute("SELECT institution_id FROM atlas_sky_ties WHERE vendor_id = ?"
                       " ORDER BY value_mxn DESC, institution_id LIMIT 1", (v,)).fetchone()
    return v, (top[0] if top else None), False


def build_system(conn: sqlite3.Connection, inst: int, lv: str) -> dict | None:
    years = has_years(conn)
    hit = _SYS_CACHE.get((lv, inst, years))
    if hit is not None:
        return hit
    from ..public_labels import capture_pair_excluded, excluded_from_rankings, label_sets, ranking_safe

    star = conn.execute(
        "SELECT l.entity_id, i.name, i.siglas, l.host_id, l.value_mxn, l.n_vendors, l.h"
        " FROM atlas_sky_layout l LEFT JOIN institutions i ON i.id = l.entity_id"
        " WHERE l.kind = 's' AND l.entity_id = ?", (inst,)).fetchone()
    if not star:
        return None
    V = star[4] or 0.0
    rows = conn.execute(
        "SELECT l.entity_id, l.share, l.year, l.y1, l.dep, l.risk, l.flags, COALESCE(l.flags2, 0), l.value_mxn,"
        f" t.n_contracts, t.da_count, t.sb_count, {'l.period_v' if years else 'NULL'} FROM atlas_sky_layout l"
        " JOIN atlas_sky_ties t ON t.institution_id = l.host_id AND t.vendor_id = l.entity_id"
        " WHERE l.host_id = ? AND l.kind = 'v' ORDER BY l.share DESC, l.entity_id", (inst,)).fetchall()
    ids = [r[0] for r in rows]

    # ghosts: bodies drawn at another star but tied here — placed at THIS star's share / first year
    g_all = conn.execute(
        "SELECT t.vendor_id, l.host_id, t.value_mxn, t.first_year, t.last_year FROM atlas_sky_ties t"
        " JOIN atlas_sky_layout l ON l.kind = 'v' AND l.entity_id = t.vendor_id"
        " WHERE t.institution_id = ? AND l.host_id <> ? ORDER BY t.value_mxn DESC, t.vendor_id",
        (inst, inst)).fetchall()
    ghosts = g_all[:GHOST_CAP]
    every = ids + [g[0] for g in ghosts]

    names, size = {}, {}
    if every:
        for v, nm, sz in conn.execute(f"SELECT id, name, size_stratification FROM vendors WHERE id IN ({_in(every)})", every):
            names[v], size[v] = nm, sz

    # canonical members: labels are keyed on raw ids, a canonical id inherits any member's label
    members: dict[int, list[int]] = {v: [v] for v in ids}
    if ids and _has(conn, "vendor_canonical"):
        for raw, c in conn.execute(
                f"SELECT vendor_id, canonical_id FROM vendor_canonical WHERE canonical_id IN ({_in(ids)})", ids):
            if raw not in members[c]:
                members[c].append(raw)
    ls = label_sets(conn)
    withheld = {v for v, ms in members.items()
                if any(m in ls["suppressed"] or excluded_from_rankings(conn, m) for m in ms)}

    # «El Expediente» lifetime totals = vendor_stats by PK, the numbers /vendors/:id prints (S5 A2);
    # the «here» fields (value_mxn, n_contracts_here, dep, risk_here) stay on the sky's tie basis
    tot, sec, pc = _vendor_totals(conn, ids), {}, {}
    if ids:
        for v, code, es, en in conn.execute(
                f"SELECT vs.vendor_id, s.code, s.name_es, s.name_en FROM vendor_stats vs"
                f" LEFT JOIN sectors s ON s.id = vs.primary_sector_id WHERE vs.vendor_id IN ({_in(ids)})", ids):
            sec[v] = (code, es, en)
        for v, conf in conn.execute(
                f"SELECT vendor_id, pattern_confidences FROM aria_queue WHERE vendor_id IN ({_in(ids)})", ids):
            try:
                pc[v] = json.loads(conf) if conf else None
            except (TypeError, ValueError):
                pc[v] = None

    # memberships at other stars (≤ 12 per body by value, then a count) → ghost threads on focus
    also: dict[int, list] = {v: [] for v in ids}
    n_also: dict[int, int] = {v: 0 for v in ids}
    if ids:
        for v, i, val, fy in conn.execute(
                f"SELECT vendor_id, institution_id, value_mxn, first_year FROM atlas_sky_ties"
                f" WHERE vendor_id IN ({_in(ids)}) AND institution_id <> ? ORDER BY value_mxn DESC", (*ids, inst)):
            n_also[v] += 1
            if len(also[v]) < ALSO_CAP:
                also[v].append([i, round(val, 2), fy])

    # verified corporate groups only (verification_source IS NOT NULL); vendor_aliases never (X4)
    sib: dict[int, list[int]] = {}
    if ids and _has(conn, "corporate_group_members"):
        canon_of = {m: c for c, ms in members.items() for m in ms}
        raw_ids = list(canon_of)
        grp = conn.execute(
            f"SELECT vendor_id, corporate_group_id FROM corporate_group_members"
            f" WHERE verification_source IS NOT NULL AND vendor_id IN ({_in(raw_ids)})", raw_ids).fetchall()
        gset = sorted({g for _, g in grp})
        if gset:
            mates = conn.execute(
                f"SELECT corporate_group_id, vendor_id FROM corporate_group_members"
                f" WHERE verification_source IS NOT NULL AND corporate_group_id IN ({_in(gset)})", gset).fetchall()
            for raw, g in grp:
                c = canon_of[raw]
                s = sib.setdefault(c, [])
                s.extend(m for gg, m in mates if gg == g and m not in members[c] and m not in s)

    bodies = []
    for v, share, y0, y1, dep, risk, flags, flags2, val, n_c, da, sb, pv in rows:
        n, total, vrisk = tot.get(v, (n_c, val, risk))
        code, s_es, s_en = sec.get(v, (None, None, None))
        bodies.append({
            # withheld bodies (suppressed labels, GT false positives, personas físicas) carry no name:
            # the canvas rim labels must print the public label like every ranked list does (§7)
            "vendor_id": v, "name": "" if v in withheld else (names.get(v) or ""), "share": round(share, 7), "value_mxn": round(val or 0, 2),
            "first_year": y0, "last_year": y1, "dep": round(dep or 0, 4), "risk_here": risk,
            "n_contracts_here": n_c, "da_here": da, "sb_here": sb, "flags": flags, "flags2": flags2,
            "n_also": n_also.get(v, 0), "also": also.get(v, []), "siblings": sib.get(v, []),
            # AtlasClusterVendorItem shape for «El Expediente» (risk_level is derived client-side)
            "total_contracts": n or 0, "total_amount_mxn": round(total or 0, 2), "risk_score": vrisk,
            "tier": (flags >> 2) & 3, "is_gt": bool(flags & 2), "size_category": size.get(v),
            "primary_sector_code": code, "primary_sector_name_es": s_es, "primary_sector_name_en": s_en,
            "pattern_confidences": None if v in withheld else pc.get(v),
            "period_v": json.loads(pv) if pv else None,
        })

    # share order through ranking_safe(): the dock's top-5 + «Otros proveedores aquí»; capture via capture_pair_excluded() (§7)
    ranked = [d["vendor_id"] for d in ranking_safe(conn, [{"vendor_id": b["vendor_id"]} for b in bodies])]
    capture = [b["vendor_id"] for b in bodies if b["share"] >= 0.5 and b["vendor_id"] not in withheld
               and not capture_pair_excluded(conn, b["vendor_id"], inst)]

    safe = set(ids) - withheld
    cobid = []
    if ids:
        for a, p, shp, col in conn.execute(
                f"SELECT vendor_id, partner_id, shared_procedures, is_potential_collusion FROM atlas_sky_cobid"
                f" WHERE vendor_id IN ({_in(ids)}) ORDER BY vendor_id, shared_procedures DESC", ids):
            # the red «posible colusión» stroke reads as an accusation: only between ranking-safe vendors
            red = bool(col) and a in safe and p not in ls["suppressed"] and not excluded_from_rankings(conn, p)
            cobid.append([a, p, shp, int(red)])

    remainder = [[y, round(val or 0, 2), n] for y, val, n in conn.execute(
        "SELECT entity_id, value_mxn, n_vendors FROM atlas_sky_layout WHERE kind = 'r' AND host_id = ?"
        " ORDER BY entity_id", (inst,))]

    out = {
        "layout_version": lv,
        "star": {"id": star[0], "name": star[1] or "", "siglas": star[2] or "", "sector_id": star[3],
                 "value_mxn": round(V, 2), "n_vendors": star[5] or 0, "h": star[6] or 0.0,
                 "n_drawn": len(bodies), "drawn_share": round(sum(b["share"] for b in bodies), 6)},
        "bodies": bodies,
        "ranked": ranked,
        "capture": capture,
        "ghosts": [{"vendor_id": v, "host_id": h,
                    "name": "" if (v in ls["suppressed"] or excluded_from_rankings(conn, v)) else (names.get(v) or ""),
                    "share": round(val / V, 7) if V else 0.0, "first_year": fy, "last_year": ly}
                   for v, h, val, fy, ly in ghosts],
        "n_ghosts": len(g_all),
        "cobid": cobid,
        "remainder": remainder,
    }
    if years:
        _star_years(conn, inst, out["star"], out)
    with _SYS_LOCK:
        if len(_SYS_CACHE) > 256:
            _SYS_CACHE.clear()
        _SYS_CACHE[(lv, inst, years)] = out
    return out


def _star_years(conn: sqlite3.Connection, inst: int, star: dict, out: dict) -> None:
    """Instruments spec §2.6: the star's coverage (first / last data year, own gap years — global source gaps
    such as 2004 excluded, they carry their own stamp), money per sexenio and the ≤ 26 star-year rows on the sky
    basis. A withheld top vendor is sent with no name (public-label rule)."""
    from ..pii import redact_person_rfcs

    pv, pnv = conn.execute("SELECT period_v, period_nv FROM atlas_sky_layout WHERE kind = 's' AND entity_id = ?",
                           (inst,)).fetchone()
    rows = conn.execute(
        "SELECT y.year, y.value_mxn, y.n_contracts, y.n_vendors, y.hhi, y.top_share, y.top_vendor_id, y.top_withheld,"
        " y.thin, v.name FROM atlas_sky_star_years y LEFT JOIN vendors v ON v.id = y.top_vendor_id"
        " WHERE y.institution_id = ? ORDER BY y.year", (inst,)).fetchall()
    row = conn.execute("SELECT value FROM atlas_sky_meta WHERE key = 'year_gaps'").fetchone()
    global_gaps = set(json.loads(row[0])) if row else set()
    present = {r[0] for r in rows}
    first, last = (min(present), max(present)) if present else (None, None)
    star.update({
        "first_data_year": first, "last_data_year": last,
        "gap_years": [y for y in range(first, last + 1) if y not in present and y not in global_gaps] if present else [],
        "period_v": json.loads(pv) if pv else None, "period_nv": json.loads(pnv) if pnv else None,
    })
    out["years"] = [{
        "year": y, "value_mxn": round(val or 0, 2), "n_contracts": n, "n_vendors": nv,
        "hhi": None if hhi is None else round(hhi, 1), "top_share": round(ts or 0, 4), "top_vendor_id": tv,
        "top_name": None if tw else redact_person_rfcs(nm or ""), "thin": bool(thin),
    } for y, val, n, nv, hhi, ts, tv, tw, thin, nm in rows]


def focus_row(conn: sqlite3.Connection, v: int, inst: int) -> dict:
    """A searched vendor with no body (spec §3.9): is it in the sky set (band member) or off the chart,
    the year segment to pulse, and an «El Expediente» row over the same tie basis. No RFC."""
    from ..public_labels import excluded_from_rankings, label_sets

    total, = conn.execute("SELECT SUM(value_mxn) FROM atlas_sky_ties WHERE vendor_id = ?", (v,)).fetchone()
    n, vs_total, rk = _vendor_totals(conn, [v]).get(v, (0, total, None))
    here = conn.execute("SELECT value_mxn, first_year, last_year FROM atlas_sky_ties"
                        " WHERE vendor_id = ? AND institution_id = ?", (v, inst)).fetchone() or (0, None, None)
    members = [v]
    if _has(conn, "vendor_canonical"):
        members += [r for (r,) in conn.execute("SELECT vendor_id FROM vendor_canonical WHERE canonical_id = ?", (v,))
                    if r != v]
    ls = label_sets(conn)
    withheld = any(m in ls["suppressed"] or excluded_from_rankings(conn, m) for m in members)
    tiers = [t for (t,) in conn.execute(
        f"SELECT ips_tier FROM aria_queue WHERE ips_tier BETWEEN 1 AND 3 AND vendor_id IN ({_in(members)})", members)]
    name, size = conn.execute("SELECT name, size_stratification FROM vendors WHERE id = ?", (v,)).fetchone() or ("", None)
    sec = conn.execute("SELECT s.code, s.name_es, s.name_en FROM vendor_stats vs LEFT JOIN sectors s"
                       " ON s.id = vs.primary_sector_id WHERE vs.vendor_id = ?", (v,)).fetchone() or (None, None, None)
    tier = 0 if withheld or not tiers else min(tiers)
    return {
        "vendor_id": v, "drawn": False,
        # the sky set: ≥ 10 M MXN lifetime on the tie basis, or any ARIA T1–T3 (same rule as the precompute)
        "sky": bool((total or 0) >= 1e7 or tiers), "year": here[1],
        "row": {
            "vendor_id": v, "name": name or "", "share": 0.0, "value_mxn": round(here[0] or 0, 2),
            "first_year": here[1], "last_year": here[2], "dep": round((here[0] or 0) / total, 4) if total else 0.0,
            "risk_here": None, "n_contracts_here": 0, "da_here": 0, "sb_here": 0, "flags": 0, "flags2": 0,
            "n_also": 0, "also": [], "siblings": [], "total_contracts": n or 0, "total_amount_mxn": round(vs_total or 0, 2),
            "risk_score": rk, "tier": tier, "is_gt": any(m in ls["documented"] for m in members),
            "size_category": size, "primary_sector_code": sec[0], "primary_sector_name_es": sec[1],
            "primary_sector_name_en": sec[2], "pattern_confidences": None,
        },
    }


def build_kin(conn: sqlite3.Connection, vendor_id: int) -> dict | None:
    """«Parientes» of one planet (instruments spec §3.5, F15): its buyers, its years at the host, its co-bid
    partners. PK / index reads only (idx_ast_vendor, tie_years PK, cobid PK, layout kind='v'). Every vendor name
    goes through ranking_safe(): suppressed labels, GT false positives and personas físicas get name null.
    Co-bid partners with no body fly to their main buyer (host_id); partners with no tie at all are dropped and
    counted in n_cobid_not_drawn. Named columns only; no RFC."""
    from ..pii import redact_person_rfcs
    from ..public_labels import excluded_from_rankings, label_sets, ranking_safe

    v, host, drawn = resolve_vendor(conn, vendor_id)
    if host is None:
        return None
    ls = label_sets(conn)

    def safe(ids: list[int]) -> set[int]:
        return {d["vendor_id"] for d in ranking_safe(conn, [{"vendor_id": i} for i in ids])}

    withheld = v not in safe([v])
    buyers = [{"inst_id": i, "name": nm or "", "siglas": sg or "", "value": round(val or 0, 2), "first_year": fy}
              for i, nm, sg, val, fy in conn.execute(
                  "SELECT t.institution_id, i.name, i.siglas, t.value_mxn, t.first_year FROM atlas_sky_ties t"
                  " LEFT JOIN institutions i ON i.id = t.institution_id WHERE t.vendor_id = ?"
                  " ORDER BY t.value_mxn DESC, t.institution_id", (v,))]
    out = {"vendor_id": v, "drawn": drawn, "host_id": host, "withheld": withheld, "years_here": [],
           "buyers": buyers[:ALSO_CAP], "n_buyers": len(buyers), "cobid": [], "n_cobid_not_drawn": 0}
    if not drawn:   # «sin tabla anual: proveedor no dibujado» — tie_years holds drawn vendors only
        return out
    out["years_here"] = [[y, round(val or 0, 2), n] for y, val, n in conn.execute(
        "SELECT year, value_mxn, n_contracts FROM atlas_sky_tie_years WHERE vendor_id = ? AND institution_id = ?"
        " ORDER BY year", (v, host))]

    pairs = conn.execute("SELECT partner_id, shared_procedures, is_potential_collusion FROM atlas_sky_cobid"
                         " WHERE vendor_id = ? ORDER BY shared_procedures DESC, partner_id", (v,)).fetchall()
    ids = [p for p, _, _ in pairs]
    ok = safe(ids + [v])
    names = dict(conn.execute(f"SELECT id, name FROM vendors WHERE id IN ({_in(ids)})", ids)) if ids else {}
    for p, shared, col in pairs:
        body = conn.execute("SELECT host_id FROM atlas_sky_layout WHERE kind = 'v' AND entity_id = ?", (p,)).fetchone()
        top = body or conn.execute("SELECT institution_id FROM atlas_sky_ties WHERE vendor_id = ?"
                                   " ORDER BY value_mxn DESC, institution_id LIMIT 1", (p,)).fetchone()
        if top is None:
            out["n_cobid_not_drawn"] += 1
            continue
        # red only between ranking-safe vendors, as the system's cobid (§7): a stroke reads as an accusation
        red = bool(col) and v in ok and p in ok and p not in ls["suppressed"] and not excluded_from_rankings(conn, p)
        out["cobid"].append({"vendor_id": p, "name": redact_person_rfcs(names.get(p) or "") if p in ok else None,
                             "shared": shared, "red": red, "drawn": body is not None, "host_id": top[0]})
    return out


BAND_CAP = 60   # named band members per (star, year); the rest stay a count (spec §6 Phase 2)


def build_band(conn: sqlite3.Connection, inst: int, year: int) -> dict:
    """The «resto» band of one star for one arrival year, by name (weekend E2).

    Members are the precompute's band on its own basis (stage 4): vendors whose primary host
    (largest tie, lowest institution id on a tie) is this star, that have no drawn body, and
    whose first year here is `year`. Totals cover every member so they equal the star's
    remainder row; the named list is ranking-safe (no suppressed label, no GT false positive,
    no persona física), by value, capped at BAND_CAP. Named columns only; no RFC.
    """
    from ..pii import redact_person_rfcs
    from ..public_labels import excluded_from_rankings, label_sets

    rows = conn.execute(
        "SELECT t.vendor_id, t.value_mxn, t.n_contracts, t.first_year, t.last_year, v.name"
        " FROM atlas_sky_ties t LEFT JOIN vendors v ON v.id = t.vendor_id"
        " WHERE t.institution_id = ? AND COALESCE(t.first_year, 2002) = ?"
        "   AND NOT EXISTS (SELECT 1 FROM atlas_sky_layout l WHERE l.kind = 'v' AND l.entity_id = t.vendor_id)"
        "   AND NOT EXISTS (SELECT 1 FROM atlas_sky_ties o WHERE o.vendor_id = t.vendor_id"
        "       AND o.institution_id <> t.institution_id"
        "       AND (o.value_mxn > t.value_mxn OR (o.value_mxn = t.value_mxn AND o.institution_id < t.institution_id)))"
        " ORDER BY t.value_mxn DESC, t.vendor_id",
        (inst, year)).fetchall()
    suppressed = label_sets(conn)["suppressed"]
    named = []
    for v, val, n_c, fy, ly, name in rows:
        if len(named) == BAND_CAP:
            break
        if v in suppressed or excluded_from_rankings(conn, v):
            continue
        named.append({"vendor_id": v, "name": redact_person_rfcs(name or ""), "value_mxn": round(val or 0, 2),
                      "n_contracts": n_c or 0, "first_year": fy, "last_year": ly})
    return {
        "inst": inst, "year": year, "n_vendors": len(rows), "value_mxn": round(sum(r[1] or 0 for r in rows), 2),
        "members": named,
    }


SELECTION_CAP = 5000   # bodies per lasso (weekend E1); the sky draws ≤ 60 per star


def build_selection(conn: sqlite3.Connection, ids: list[int]) -> dict:
    """A lasso over drawn bodies, on the public basis (weekend E1, spec §6 Phase-2 flag).

    Rows are the drawn bodies among `ids` (their host-star tie: value, contracts, years,
    risk indicator), minus anything ranking_safe() withholds (suppressed labels, GT false
    positives, personas físicas). Named columns only; no RFC. Sorted by value.
    """
    from ..pii import redact_person_rfcs
    from ..public_labels import excluded_from_rankings, label_sets

    uniq = sorted(set(ids))[:SELECTION_CAP]
    rows = conn.execute(
        "SELECT l.entity_id, v.name, l.host_id, i.name, l.value_mxn, t.n_contracts, l.y0, l.y1, l.risk"
        " FROM json_each(?) j"
        " JOIN atlas_sky_layout l ON l.kind = 'v' AND l.entity_id = CAST(j.value AS INTEGER)"
        " JOIN atlas_sky_ties t ON t.institution_id = l.host_id AND t.vendor_id = l.entity_id"
        " LEFT JOIN vendors v ON v.id = l.entity_id LEFT JOIN institutions i ON i.id = l.host_id",
        (json.dumps(uniq),)).fetchall()
    suppressed = label_sets(conn)["suppressed"]
    out = [{"vendor_id": v, "name": redact_person_rfcs(nm or ""), "institution_id": h, "institution_name": inm or "",
            "value_mxn": round(val or 0, 2), "n_contracts": n_c or 0, "first_year": y0, "last_year": y1,
            "risk_score": None if rk is None else round(rk, 4)}
           for v, nm, h, inm, val, n_c, y0, y1, rk in rows
           if v not in suppressed and not excluded_from_rankings(conn, v)]
    out.sort(key=lambda r: (-r["value_mxn"], r["vendor_id"]))
    return {"n_requested": len(uniq), "n_drawn": len(rows), "n_public": len(out),
            "value_mxn": round(sum(r["value_mxn"] for r in out), 2), "rows": out}



# ---------------------------------------------------------------------------
# GET /atlas/sky/layers — sky-dive data layers (frontend/_ui_v4/build/sky-dive/LAYERS.md).
# A companion to the manifest + bin under the same sky_tag: per-star arrays in manifest star order,
# and bits per drawn body (host-specific ones at the body's own host star). Every per-agency join
# goes raw → canonical through institution_canonical (vendors through vendor_canonical). Withheld
# bodies (suppressed labels, GT false positives, personas físicas) carry no bits. No names, no RFC.
# ---------------------------------------------------------------------------
LAYER_BITS = {"sigue": 1, "captura": 2, "pareja": 4, "mismo_dia": 8, "senal": 16, "arranque": 32}
_LAYERS_CACHE: dict[str, dict] = {}
_LAYERS_LOCK = threading.Lock()   # not _LOCK: a layers build must not block the sky manifest


def _canon_sql(conn: sqlite3.Connection, kind: str, col: str) -> str:
    """SQL expression mapping a raw institution ('i') or vendor ('v') id column to its canonical id."""
    table = "institution_canonical" if kind == "i" else "vendor_canonical"
    key = "institution_id" if kind == "i" else "vendor_id"
    if not _has(conn, table):
        return col
    return f"COALESCE((SELECT canonical_id FROM {table} WHERE {key} = {col}), {col})"


def build_layers(conn: sqlite3.Connection, tag: str) -> dict:
    """Built once per worker per tag (~10 scans); concurrent cold requests wait for that one build."""
    hit = _LAYERS_CACHE.get(tag)
    if hit is not None:
        return hit
    with _LAYERS_LOCK:
        hit = _LAYERS_CACHE.get(tag)
        if hit is None:
            hit = _build_layers(conn)
            _LAYERS_CACHE.clear()
            _LAYERS_CACHE[tag] = hit
    return hit


def _build_layers(conn: sqlite3.Connection) -> dict:
    from ..public_labels import is_persona_fisica, label_sets

    star_ids = [r[0] for r in _star_order(conn)]
    pos = {iid: k for k, iid in enumerate(star_ids)}
    n = len(star_ids)
    ic = _canon_sql(conn, "i", "x.institution_id")
    vc = _canon_sql(conn, "v", "x.vendor_id")
    have = lambda t: _has(conn, t)  # noqa: E731

    # contract-weighted average indicator, direct-award and single-bid shares over the canonical members
    avg, da, sb = [None] * n, [None] * n, [None] * n
    if have("institution_stats"):
        for cid, k, a, d, s in conn.execute(
                f"SELECT {ic} AS cid, SUM(x.total_contracts), SUM(x.avg_risk_score * x.total_contracts),"
                " SUM(x.direct_award_pct * x.total_contracts), SUM(x.single_bid_pct * x.total_contracts)"
                " FROM institution_stats x WHERE x.total_contracts > 0 GROUP BY cid"):
            j = pos.get(cid)
            if j is not None and k:
                avg[j] = round(a / k, 4) if a is not None else None
                da[j] = round(d / k, 1) if d is not None else None
                sb[j] = round(s / k, 1) if s is not None else None

    # current grade 0–10 (score / 10); several members → the largest by value
    grade = [None] * n
    if have("institution_grades_v3"):
        best: dict[int, tuple] = {}
        for cid, score, val in conn.execute(
                f"SELECT {ic} AS cid, x.score, x.total_value_mxn FROM institution_grades_v3 x"
                " WHERE x.is_historical = 0 AND x.score IS NOT NULL"):
            if cid not in best or (val or 0) > (best[cid][1] or 0):
                best[cid] = (score, val)
        for cid, (score, _) in best.items():
            j = pos.get(cid)
            if j is not None:
                grade[j] = round(score / 10, 1)

    def counts(table: str, where: str = "") -> list[int]:
        out = [0] * n
        if not have(table):
            return out
        for cid, k in conn.execute(f"SELECT {ic} AS cid, COUNT(*) FROM {table} x"
                                   f" WHERE x.institution_id IS NOT NULL {where} GROUP BY cid"):
            j = pos.get(cid)
            if j is not None:
                out[j] += k
        return out

    post = counts("comprasmx_contracts", "AND x.post_blackout = 1")
    cap = counts("captura_pairs")
    par = counts("newtabs_parejas")
    md = counts("newtabs_mismo_dia")

    bodies = dict(conn.execute("SELECT entity_id, host_id FROM atlas_sky_layout WHERE kind = 'v'"))
    bits: dict[int, int] = {}

    def at_host(table: str, bit: int, where: str = "") -> None:
        if not have(table):
            return
        for v, i in conn.execute(f"SELECT DISTINCT {vc}, {ic} FROM {table} x WHERE x.vendor_id IS NOT NULL"
                                 f" AND x.institution_id IS NOT NULL {where}"):
            if bodies.get(v) == i:
                bits[v] = bits.get(v, 0) | bit

    def anywhere(table: str, bit: int) -> None:
        if not have(table):
            return
        for (v,) in conn.execute(f"SELECT DISTINCT {vc} FROM {table} x WHERE x.vendor_id IS NOT NULL"):
            if v in bodies:
                bits[v] = bits.get(v, 0) | bit

    at_host("comprasmx_contracts", LAYER_BITS["sigue"], "AND x.post_blackout = 1")
    at_host("captura_pairs", LAYER_BITS["captura"])
    at_host("newtabs_parejas", LAYER_BITS["pareja"])
    at_host("newtabs_mismo_dia", LAYER_BITS["mismo_dia"])
    anywhere("vendor_signals", LAYER_BITS["senal"])
    anywhere("newtabs_arranque", LAYER_BITS["arranque"])

    # withheld bodies carry nothing — the excluded_from_rankings() test, in bulk
    ls = label_sets(conn)
    ids = sorted(bits)
    persons: set[int] = set()
    for k in range(0, len(ids), 900):
        chunk = ids[k:k + 900]
        persons |= {v for v, ind, rfc in conn.execute(
            f"SELECT id, is_individual, rfc FROM vendors WHERE id IN ({_in(chunk)})", chunk)
            if is_persona_fisica(ind, rfc)}
    keep = [v for v in ids if v not in ls["suppressed"] and v not in ls["fp"] and v not in persons]
    # drawn public suppliers with señales nuevas, per host star (the phone list has no bin to count them)
    senal = [0] * n
    for v in keep:
        if bits[v] & LAYER_BITS["senal"]:
            j = pos.get(bodies[v])
            if j is not None:
                senal[j] += 1

    out = {
        "layout_version": sky_version(conn),
        "bits": LAYER_BITS,
        "stars": {"avg": avg, "grade": grade, "da": da, "sb": sb, "post": post, "cap": cap,
                  "pareja": par, "mismo_dia": md, "senal": senal},
        "bodies": {"id": keep, "bits": [bits[v] for v in keep]},
    }
    return out


# ---------------------------------------------------------------------------
# GET /atlas/sky/apagon?vendor= — a supplier's ComprasMX contracts after the federal feed froze
# (comprasmx_contracts.post_blackout = 1). Unscored until v0.10, so no indicator. > 100 B rejected,
# > 10 B flagged (.claude/rules/data-validation.md). No RFC, no supplier name, no title; a withheld
# supplier gets its counts only.
# ---------------------------------------------------------------------------
APAGON_CAP = 100
MAX_CONTRACT_VALUE = 100_000_000_000
FLAG_THRESHOLD = 10_000_000_000


def build_apagon(conn: sqlite3.Connection, vendor_id: int) -> dict:
    from ..public_labels import excluded_from_rankings, label_sets

    members = [vendor_id]
    if _has(conn, "vendor_canonical"):
        members += [r[0] for r in conn.execute(
            "SELECT vendor_id FROM vendor_canonical WHERE canonical_id = ? AND vendor_id <> ?", (vendor_id, vendor_id))]
    ph = _in(members)
    valid = "x.post_blackout = 1 AND COALESCE(x.amount_mxn, 0) > 0 AND x.amount_mxn <= ?"
    n, total, flagged = conn.execute(
        f"SELECT COUNT(*), COALESCE(SUM(x.amount_mxn), 0), COALESCE(SUM(x.amount_mxn > ?), 0)"
        f" FROM comprasmx_contracts x WHERE x.vendor_id IN ({ph}) AND {valid}",
        (FLAG_THRESHOLD, *members, MAX_CONTRACT_VALUE)).fetchone()
    withheld = any(m in label_sets(conn)["suppressed"] or excluded_from_rankings(conn, m) for m in members)
    rows: list[dict] = []
    if not withheld and n:
        ic = _canon_sql(conn, "i", "x.institution_id")
        for code, date, amt, cid, proc, direct, apf, fallo, inicio in conn.execute(
                "SELECT x.codigo_contrato, COALESCE(x.fecha_firma, x.fecha_inicio, x.fecha_fallo, x.fecha_publicacion),"
                f" x.amount_mxn, {ic}, x.tipo_procedimiento, x.is_direct_award, x.orden_gobierno = 'APF', x.fecha_fallo, x.fecha_inicio"
                f" FROM comprasmx_contracts x WHERE x.vendor_id IN ({ph}) AND {valid}"
                " ORDER BY x.amount_mxn DESC LIMIT ?", (*members, MAX_CONTRACT_VALUE, APAGON_CAP)):
            tu = (proc or "").upper()
            competitive = apf and (tu.startswith("LICITACI") or tu.startswith("INVITACI"))
            rows.append({"code": code, "date": (date or "")[:10], "amount_mxn": round(amt, 2),
                         "review": amt > FLAG_THRESHOLD, "institution_id": cid, "procedure": proc,
                         "direct_award": bool(direct),
                         # routers/fallo.py: competitive APF work that began before the award
                         "early_days": early_days(fallo, inicio) if competitive else None})
        ids = sorted({r["institution_id"] for r in rows if r["institution_id"] is not None})
        names = {i: (nm, sg) for i, nm, sg in conn.execute(
            f"SELECT id, name, siglas FROM institutions WHERE id IN ({_in(ids)})", ids)} if ids else {}
        for r in rows:
            nm, sg = names.get(r["institution_id"], (None, None))
            r["institution_name"], r["siglas"] = nm or "", sg or ""
    return {"vendor_id": vendor_id, "n_contracts": n, "value_mxn": round(total, 2), "n_review": int(flagged),
            "withheld": withheld, "scored": False, "contracts": rows}



# ---------------------------------------------------------------------------
# GET /atlas/sky/contract-signals?id= — the two per-contract señales the contract card can carry.
#   antes_del_fallo: a competitive APF ComprasMX contract whose work began before its fallo
#                    (routers/fallo.py: Mexico City dates, offset = inicio − fallo < 0), matched by number;
#   plazo_reducido:  a licitación pública whose call ran fewer natural days (publication day inclusive)
#                    than the full legal minimum — 15 nacional / 20 internacional, and at least the 10-day
#                    reduced floor (docs/SENALES_NUEVAS.md a).
# Legal with a justification the bulk data does not carry: a reading, never "illegal". No names, no RFC.
# ---------------------------------------------------------------------------
MIN_DAYS_NACIONAL, MIN_DAYS_INTERNACIONAL = 15, 20


def early_days(fallo, inicio) -> int | None:
    """Days the work began before the fallo (positive), or None when it began on/after it or dates are missing."""
    from ..routers.fallo import mx_date
    F, I = mx_date(fallo), mx_date(inicio)
    if not (F and I) or not (2020 <= I.year <= 2027):
        return None
    d = (F - I).days
    return d if d > 0 else None


def contract_signals(conn: sqlite3.Connection, contract_id: int) -> dict | None:
    row = conn.execute(
        "SELECT contract_number, procedure_number, procedure_type, procedure_character, publication_date, opening_date,"
        " amount_mxn FROM contracts WHERE id = ?", (contract_id,)).fetchone()
    if row is None:
        return None
    number, proc, ptype, pchar, pub, ape, amt = row
    out: dict = {"contract_id": contract_id, "antes_del_fallo": None, "plazo_reducido": None}
    if (amt or 0) > MAX_CONTRACT_VALUE:
        return out
    tu = (ptype or "").upper()
    if tu.startswith("LICITACI") and pub and ape:
        from datetime import date
        try:
            days = (date.fromisoformat(str(ape)[:10]) - date.fromisoformat(str(pub)[:10])).days + 1
        except ValueError:
            days = None
        intl = (pchar or "").upper().startswith("INTERNACIONAL")
        floor = MIN_DAYS_INTERNACIONAL if intl else MIN_DAYS_NACIONAL
        # below the 10-day reduced floor is a Structure C field-semantics artefact (SENALES_NUEVAS.md a), not a reading
        if days is not None and 10 <= days < floor:
            out["plazo_reducido"] = {"days": days, "minimum": floor, "international": intl}
    if number and proc and _has(conn, "comprasmx_contracts"):
        # by procedure number (indexed), then the contract number within it
        r = conn.execute(
            "SELECT fecha_fallo, fecha_inicio FROM comprasmx_contracts WHERE numero_procedimiento = ? AND codigo_contrato = ?"
            " AND orden_gobierno = 'APF' AND (tipo_procedimiento LIKE 'LICITACI%' OR tipo_procedimiento LIKE 'INVITACI%')"
            " LIMIT 1", (proc, number)).fetchone()
        if r:
            d = early_days(r[0], r[1])
            if d:
                out["antes_del_fallo"] = {"days": d}
    return out
