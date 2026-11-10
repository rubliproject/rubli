/**
 * The small «Captura» door on a dossier (owner 2026-10-27: «interconnect stuff from the website»):
 * a vendor that is dominant of one buyer, or a buyer with dominant suppliers, links to its /captura
 * dissection (?inst=…&pair=…). GET /captura/door; a null pair/buyer (not dominant) or an error renders nothing.
 */
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { capturaApi } from '@/api/captura'
import { formatNumber } from '@/lib/utils'

export function CapturaDoor({ vendorId, institutionId, lang }: { vendorId?: number; institutionId?: number; lang: 'en' | 'es' }) {
  const en = lang === 'en'
  const key = vendorId != null ? { vendor_id: vendorId } : { institution_id: institutionId! }
  const q = useQuery({
    queryKey: ['captura', 'door', key],
    queryFn: () => capturaApi.door(key),
    enabled: (vendorId ?? institutionId ?? 0) > 0,
    staleTime: 3_600_000,
    retry: false,
  })
  const p = q.data?.pair, b = q.data?.buyer
  if (p) {
    const who = p.siglas || p.buyer || '—'
    return (
      <p className="ct-note">
        <Link className="ct-link relative inline-block py-1 -my-1" to={`/captura?inst=${p.institution_id}&pair=${p.vendor_id}`}>
          {en ? `Dominant supplier: ${Math.round(p.sh * 100)}% of its federal income comes from ${who} →` : `Proveedor dominante: ${Math.round(p.sh * 100)}% de su ingreso federal viene de ${who} →`}
        </Link>
      </p>
    )
  }
  if (b) {
    return (
      <p className="ct-note">
        <Link className="ct-link relative inline-block py-1 -my-1" to={`/captura?inst=${b.institution_id}`}>
          {en ? `One buyer, one supplier: ${formatNumber(b.n)} companies live off this buyer →` : `Un comprador, una empresa: ${formatNumber(b.n)} empresas viven de este comprador →`}
        </Link>
      </p>
    )
  }
  return null
}
