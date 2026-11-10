/**
 * El Mapa — one page, two views (merge spec _polish/merge/SPEC.md § 2–4).
 *
 * `/` renders Lista («Cifras», SpatialMap) or, behind `vista=vinculos` (alias `cielo`), Cielo («Vínculos», the
 * Atlas sky). Only one is mounted: both bind Esc, the sky owns wheel/zoom and runs
 * a canvas loop, so the inactive view must not linger. Each view is its own lazy
 * chunk — SkyEngine and d3 never ride `/` until «Cielo» is asked for.
 *
 * The view comes from React Router's location. The sky writes its URL with raw
 * history calls (RR goes stale while it flies) but every write keeps `vista`
 * (url-state.ts `withVista`), so the stale location still names the right view.
 */
import { lazy } from 'react'
import { useLocation } from 'react-router-dom'
import { SuspenseBoundary } from '@/components/SuspenseBoundary'
import { MapShellSkeleton } from '@/components/LoadingSkeleton'
import { loadCielo, loadLista, vistaOf } from '@/lib/vista'

const Lista = lazy(loadLista)
const Cielo = lazy(loadCielo)

export default function Mapa() {
  const { search } = useLocation()
  return (
    <SuspenseBoundary fallback={<MapShellSkeleton />}>
      {vistaOf(search) === 'cielo' ? <Cielo /> : <Lista />}
    </SuspenseBoundary>
  )
}
