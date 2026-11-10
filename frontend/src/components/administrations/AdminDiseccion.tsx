/**
 * «La disección» — one government's money cut the way /sectors/:id cuts a sector (owner 2026-11-08), at a smaller scale,
 * in the Portada's list look (kit/BoardList, owner 11-09). A sector opens in place (dossier/layers: DrillToggle + useLayer,
 * ?sec=diseccion&row=<sector>): its categories under this government and the doors to the sector dossier and to La bodega
 * filtered to this government + sector. (No «largest contracts» list: GET /contracts has no year-range filter.)
 * Data: GET /categories/cube (lib/sexenios/diseccion), no new endpoint.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { categoriesApi } from '@/api/client'
import { DrillToggle, useLayer, useLayerRestore } from '@/components/dossier/layers'
import { BoardList, type BoardCol } from '@/components/kit/BoardList'
import { Dot } from '@/components/portada/Tablero'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { SECTORS } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { catsOf, findingCat, type CubeRow, type Slice } from '@/lib/sexenios/diseccion'

type Lang = 'es' | 'en'

const pct1 = (x: number, lang: Lang) => `${(100 * x).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: 1 })} %`
const pct0 = (x: number | null) => (x == null ? '—' : `${Math.round(100 * x)} %`)

export const sectorLabel = (id: number, lang: Lang) => {
  const s = SECTORS.find((x) => x.id === id)
  return s ? (lang === 'es' ? s.name : s.nameEN) : '—'
}

function SectorOpen({ id, rows, sx, lang, onClose }: { id: number; rows: CubeRow[]; sx: string; lang: Lang; onClose: () => void }) {
  const en = lang === 'en'
  const summ = useQuery({ queryKey: ['categories', 'summary'], queryFn: () => categoriesApi.getSummary(), staleTime: 600_000 })
  const names = useMemo(() => new Map(((summ.data?.data ?? []) as { category_id: number; name_es: string; name_en: string }[]).map((c) => [c.category_id, en ? c.name_en || c.name_es : c.name_es])), [summ.data, en])
  const name = (c: number) => names.get(c) ?? (en ? `Category ${c}` : `Categoría ${c}`)
  const cats = useMemo(() => catsOf(rows, sx, id).slice(0, 6), [rows, sx, id])
  const sec = sectorLabel(id, lang)
  const line = names.size ? findingCat(cats, sec, name, lang) : null
  const cols: BoardCol[] = [
    { label: en ? 'What it bought' : 'Qué compró', w: 'minmax(0, 1fr)', cls: 'bd-buyer', phone: true },
    { label: en ? 'Amount' : 'Monto', w: '130px', r: true, cls: 'bd-amt', phone: true },
    { label: en ? 'Of the sector' : 'Del sector', w: '96px', r: true, cls: 'bl-num' },
  ]
  return (
    <div className="adm-dis-open" id={`dl-diseccion-${id}`} data-drill={`diseccion:${id}`} role="region" aria-label={en ? `${sec}: what it bought` : `${sec}: en qué se gastó`}>
      {line && <p className="bd-desc"><b>{line}</b></p>}
      <BoardList className="bl-in" lang={lang} cols={cols} label={en ? `${sec}: what it bought` : `${sec}: en qué se gastó`}
        rows={cats.map((c) => ({ key: c.id, cells: [
          <EntityIdentityChip key="n" type="category" id={c.id} name={name(c.id)} variant="name" className="bd-chip" />,
          formatCompactMXN(c.value),
          pct1(c.share, lang),
        ] }))} />
      <p className="adm-dis-doors">
        <Link className="bd-link" to={`/sectors/${id}`}>{en ? `The whole ${sec.toLowerCase()} sector, 2002 to today →` : `El sector ${sec.toLowerCase()} completo, de 2002 a hoy →`}</Link>
        <Link className="bd-link" to={`/categories?sx=${sx}&sector=${id}`}>{en ? 'This slice in La bodega →' : 'Esta parte en La bodega →'}</Link>
        <button type="button" className="bd-link" onClick={() => { onClose(); document.getElementById(`dl-diseccion-${id}-t`)?.focus() }}>{en ? 'Close' : 'Cerrar'}</button>
      </p>
    </div>
  )
}

export function AdminDiseccion({ sectors, rows, sx, who, lang }: { sectors: Slice[]; rows: CubeRow[]; sx: string; who: string; lang: Lang }) {
  const en = lang === 'en'
  const layer = useLayer()
  useLayerRestore() // a shared ?sec=diseccion&row= link scrolls to its open sector
  const cols: BoardCol[] = [
    { label: 'Nº', w: '28px', cls: 'bd-age bl-rk', phone: true },
    { label: en ? 'Sector' : 'Sector', w: 'minmax(0, 1fr)', cls: 'bd-buyer', phone: true },
    { label: en ? 'Contracts' : 'Contratos', w: '110px', r: true, cls: 'bl-num' },
    { label: en ? 'Amount' : 'Monto', w: '170px', r: true, cls: 'bd-amt', phone: true },
    { label: en ? 'Share' : 'Parte', w: '96px', r: true, cls: 'bl-num' },
    { label: en ? 'No tender' : 'Sin concurso', w: '128px', r: true, cls: 'bl-num' },
  ]
  return (
    <BoardList id="adm-dis-t" lang={lang} cols={cols} label={en ? `${who}: money by sector` : `${who}: el dinero por sector`}
      rows={sectors.map((s, i) => {
        const sec = sectorLabel(s.id, lang)
        const open = layer.isOpen('diseccion', s.id)
        return {
          key: s.id,
          cells: [
            String(i + 1).padStart(2, '0'),
            <><Dot id={s.id} lang={lang} /><EntityIdentityChip type="sector" id={s.id} name={sec} variant="name" className="bd-chip" /></>,
            formatNumber(s.contracts),
            <DrillToggle sec="diseccion" row={s.id} open={open} onToggle={() => layer.toggle('diseccion', s.id)} lang={lang}
              what={en ? `${sec.toLowerCase()} under ${who}` : `${sec.toLowerCase()} con ${who}`}>
              {formatCompactMXN(s.value)}
            </DrillToggle>,
            pct1(s.share, lang),
            pct0(s.da),
          ],
          open: open ? <SectorOpen id={s.id} rows={rows} sx={sx} lang={lang} onClose={layer.close} /> : undefined,
        }
      })} />
  )
}
