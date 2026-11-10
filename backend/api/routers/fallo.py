"""«Empezó antes del fallo» — competitive federal contracts whose work began before the award decision.

Source: `comprasmx_contracts` (ComprasMX 2025–2026 staging table), read-only. Ported from
`frontend/_ui_v4/concepts/fallo/extract.py` (NOTES_fallo.md: 1,025 contracts · 17,404 MDP of 53,512).

Universe: orden_gobierno = 'APF', competitive procedure (tipo starts LICITACI / INVITACI), fallo and inicio present.
Test: day(inicio) < day(fallo). Offsets are whole days relative to the fallo (0; negative = before).
TIMESTAMPS ARE UTC: fecha_publicacion / apertura / fallo carry a time of day that peaks in UTC office hours.
Mexico City is UTC−6 all year (no DST since 2022), so a stamp with a non-midnight time is shifted −6 h before
taking the date; midnight-exact stamps are plain dates. fecha_inicio / firma / fin are plain dates.
Amounts > 100B MXN are excluded (none today); > 10B are flagged (†). No RFC leaves this module. Names are public as
CompraNet publishes them (owner 2026-10-12 / 2026-10-29, transparency): a persona física is named and flagged `pf`;
only an RFC-shaped name is dropped (public_labels.clean_name; v='', counted in meta.unnamed_n).
"""
import logging
import sqlite3
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional

from fastapi import APIRouter, Depends

from ..cache import app_cache
from ..config.constants import FLAG_THRESHOLD, MAX_CONTRACT_VALUE
from ..dependencies import get_db_dep
from ..public_labels import clean_name, is_named_persona

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["analysis"])

COMP = "(tipo_procedimiento LIKE 'LICITACI%' OR tipo_procedimiento LIKE 'INVITACI%')"
SELECT = f"""SELECT siglas, institucion, tipo_procedimiento, numero_procedimiento, codigo_contrato, titulo_contrato,
  fecha_publicacion, fecha_apertura, fecha_fallo, fecha_inicio, fecha_firma, fecha_fin, amount_mxn, proveedor,
  caso_fortuito, vendor_id, institution_id, sector_id, is_persona_fisica, rfc
  FROM comprasmx_contracts WHERE orden_gobierno='APF' AND {COMP}
  AND fecha_fallo IS NOT NULL AND fecha_inicio IS NOT NULL"""
COLS = ['code', 'proc', 'i', 'v', 'vid', 'pf', 't', 'lp', 'amt', 'flag', 'fort', 'pub', 'ape', 'ini', 'fir', 'fin',
        'fallo', 'jan1', 'cid']


def mx_date(s: Optional[str]) -> Optional[date]:
    """ComprasMX stamp → Mexico City calendar date (UTC−6 when a time of day is present)."""
    try:
        if not s:
            return None
        if len(s) >= 19 and s[11:19] != '00:00:00':
            return (datetime.fromisoformat(s[:19]) - timedelta(hours=6)).date()
        return date(int(s[0:4]), int(s[5:7]), int(s[8:10]))
    except (ValueError, TypeError):
        return None


def _off(x: Optional[date], f: Optional[date]) -> Optional[int]:
    return (x - f).days if x and f else None


def build(rows: Iterable[tuple]) -> Dict[str, Any]:
    """Pure: SELECT-shaped rows → the page payload (minus side cases and CompraNet ids)."""
    rows = list(rows)
    dist: Counter = Counter()
    early: List[Dict[str, Any]] = []
    insts: Dict[str, Dict[str, Any]] = {}
    tot: Counter = Counter()
    procs: Dict[str, set] = defaultdict(set)   # the tender unit: distinct numero_procedimiento per institution
    pop_n, pop_v = 0, 0.0
    meds: Dict[str, List[int]] = {'pub': [], 'ape': [], 'fir': []}
    for (sig, inst, tipo, proc, code, tit, pub, ape, fal, ini, fir, fin, amt, prov, fort,
         vid, iid, sid, *pii) in rows:  # pii = (is_persona_fisica, rfc) when selected
        amt = float(amt or 0.0)
        if amt > MAX_CONTRACT_VALUE:  # REJECT rule: out of every figure
            continue
        F, I = mx_date(fal), mx_date(ini)
        if not (F and I) or not (2020 <= I.year <= 2027):
            continue
        key = sig or inst
        tot[key] += 1
        procs[key].add(proc)
        o = _off(I, F)
        pop_n += 1
        pop_v += amt
        dist[max(-400, min(400, o))] += 1
        P, A, S = mx_date(pub), mx_date(ape), mx_date(fir)
        for k, x in (('pub', P), ('ape', A), ('fir', S)):
            if x:
                meds[k].append(_off(x, F))
        if o >= 0:
            continue
        rec = insts.setdefault(key, dict(k=key, sig=sig, name=inst, iid=Counter(), sid=Counter()))
        if iid:
            rec['iid'][iid] += 1
        if sid:
            rec['sid'][sid] += 1
        tu = (tipo or '').upper()
        name = clean_name(prov)
        early.append(dict(
            code=code, proc=proc, k=key, v=name or '', vid=vid, pf=bool(pii) and is_named_persona(*pii, prov), t=(tit or '').strip(),
            lp=tu.startswith('LICITACI'),
            amt=round(amt / 1e6, 3), flag=amt > FLAG_THRESHOLD,
            fort=(fort or 'NO') != 'NO' or 'FORTUITO' in tu or 'URGENCIA' in tu,
            pub=_off(P, F), ape=_off(A, F), ini=o, fir=_off(S, F), fin=_off(mx_date(fin), F),
            fallo=F.isoformat(), jan1=I.month == 1 and I.day == 1, cid=None))

    cnt, val = Counter(), defaultdict(float)
    for r in early:
        cnt[r['k']] += 1
        val[r['k']] += r['amt']
    inst_out = []
    for k, n in cnt.most_common():
        x = insts[k]
        inst_out.append(dict(k=k, sig=x['sig'], name=x['name'], n=n, v=round(val[k], 1), pop=tot[k],
                             pop_proc=len(procs[k]), early_proc=len({r['proc'] for r in early if r['k'] == k}),
                             iid=x['iid'].most_common(1)[0][0] if x['iid'] else None,
                             sid=x['sid'].most_common(1)[0][0] if x['sid'] else 12))
    idx = {x['k']: i for i, x in enumerate(inst_out)}
    early.sort(key=lambda r: (idx[r['k']], r['ini'], -r['amt']))
    for r in early:
        r['i'] = idx[r['k']]
        del r['k']

    def median(xs: List[int]) -> Optional[int]:
        xs = sorted(xs)
        return xs[len(xs) // 2] if xs else None

    ini_all = sorted(k for k, n in dist.items() for _ in range(n))
    prepub = [r for r in early if r['pub'] is not None and r['ini'] < r['pub']]
    sig_n = lambda f: sum(1 for r in early if f(r))  # noqa: E731
    meta = dict(
        pop_n=pop_n, pop_v=round(pop_v / 1e6), n=len(early),
        pop_proc=len(set().union(*procs.values())), early_proc=len({r['proc'] for r in early}), v=round(sum(r['amt'] for r in early)),
        lp_n=sig_n(lambda r: r['lp']), prepub_n=len(prepub), prepub_v=round(sum(r['amt'] for r in prepub)),
        fort_n=sig_n(lambda r: r['fort']), unnamed_n=sig_n(lambda r: not r['v']), pf_n=sig_n(lambda r: r['pf']), jan1_n=sig_n(lambda r: r['jan1']),
        nofirma_n=sig_n(lambda r: r['fir'] is None), flag_n=sig_n(lambda r: r['flag']),
        signed_before_fallo=sig_n(lambda r: r['fir'] is not None and r['fir'] < 0),
        med=dict(pub=median(meds['pub']), ape=median(meds['ape']), fir=median(meds['fir']),
                 ini=ini_all[len(ini_all) // 2] if ini_all else None),
    )
    return dict(meta=meta, inst=inst_out, dist=sorted(dist.items()), cols=COLS, early=early)


def _side_cases(db: sqlite3.Connection) -> Dict[str, Any]:
    """The «Además» line: reconocimiento de trabajos extraordinarios + direct awards signed > 180 d after starting."""
    recon = db.execute("""SELECT siglas, count(*), sum(amount_mxn) FROM comprasmx_contracts WHERE orden_gobierno='APF'
      AND tipo_procedimiento LIKE '%RECONOCIMIENTO DE TRABAJOS EXTRAORDINARIOS%'
      AND COALESCE(amount_mxn,0) <= ? GROUP BY siglas ORDER BY 2 DESC""", (MAX_CONTRACT_VALUE,)).fetchall()
    lag = []
    for sig, inst, prov, vid, iid, amt, ini, fir, code, fort, rfc, pf in db.execute(
            """SELECT siglas, institucion, proveedor, vendor_id, institution_id, amount_mxn, fecha_inicio, fecha_firma,
            codigo_contrato, caso_fortuito, rfc, is_persona_fisica FROM comprasmx_contracts WHERE orden_gobierno='APF' AND is_direct_award=1
            AND fecha_inicio IS NOT NULL AND fecha_firma IS NOT NULL AND COALESCE(amount_mxn,0) <= ?""",
            (MAX_CONTRACT_VALUE,)):
        I, S = mx_date(ini), mx_date(fir)
        name = clean_name(prov)
        if name and I and S and (S - I).days > 180 and (fort or 'NO') == 'NO' and 2020 <= I.year <= 2027:
            lag.append(dict(sig=sig, name=inst, v=name, vid=vid, pf=is_named_persona(pf, rfc, prov), iid=iid, amt=round((amt or 0) / 1e6, 1),
                            lag=(S - I).days, code=code, flag=(amt or 0) > FLAG_THRESHOLD))
    lag.sort(key=lambda r: -r['amt'])
    return dict(
        recon=dict(n=sum(r[1] for r in recon), v=round(sum(r[2] or 0 for r in recon) / 1e6),
                   top=[recon[0][0], recon[0][1]] if recon else None),
        ad_lag=lag[:4],
    )


def _compranet_ids(db: sqlite3.Connection, codes: List[str]) -> Dict[str, int]:
    """ComprasMX code → `contracts.id` where the contract also reached the CompraNet-era corpus."""
    if not codes:
        return {}
    out: Dict[str, int] = {}
    for i in range(0, len(codes), 500):
        chunk = codes[i:i + 500]
        q = f"SELECT contract_number, id FROM contracts WHERE contract_year >= 2024 AND contract_number IN ({','.join('?' * len(chunk))})"
        out.update({c: cid for c, cid in db.execute(q, chunk)})
    return out


def _relink(db: sqlite3.Connection, early: List[Dict[str, Any]]) -> int:
    """A named row with no ComprasMX vendor id takes the id of its CompraNet contract's vendor."""
    need = {r['cid']: r for r in early if r['vid'] is None and r['v'] and r['cid']}
    cids, n = list(need), 0
    for i in range(0, len(cids), 500):
        chunk = cids[i:i + 500]
        for cid, vid in db.execute(f"""SELECT c.id, c.vendor_id FROM contracts c JOIN vendors v ON v.id = c.vendor_id
                WHERE c.id IN ({','.join('?' * len(chunk))})""", chunk):
            need[cid]['vid'] = vid
            n += 1
    return n


@router.get("/antes-del-fallo")
def antes_del_fallo(db: sqlite3.Connection = Depends(get_db_dep)) -> Dict[str, Any]:
    """Competitive APF contracts whose work began before the award (ComprasMX, Mexico City dates)."""
    cached = app_cache.get("fallo", "v4")
    if cached is not None:
        return cached
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='comprasmx_contracts'").fetchone() is None:
        return {"available": False}
    out = build(db.execute(SELECT).fetchall())
    ids = _compranet_ids(db, [r['code'] for r in out['early'] if r['code']])
    for r in out['early']:
        r['cid'] = ids.get(r['code'])
    out['meta']['relinked_n'] = _relink(db, out['early'])
    out['meta'].update(_side_cases(db))
    out['rows'] = [[r[k] for k in COLS] for r in out.pop('early')]
    out['available'] = True
    app_cache.set("fallo", "v4", out, maxsize=2, ttl=6 * 3600)
    return out
