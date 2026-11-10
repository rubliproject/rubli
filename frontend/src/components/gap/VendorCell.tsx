/**
 * The counterparty of a post-blackout award, by how well it was identified
 * (gap-relevo spec § VendorCell). Without `gap_vendor_resolution` loaded the
 * source is null and the raw OCR string prints with an OCR badge.
 */
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatVendorName } from '@/lib/vendor/formatName'
import type { GapContractItem } from '@/api/types'

function Badge({ children, title }: { children: string; title: string }) {
  return <span className="gap-tag" title={title}>{children}</span>
}

export function VendorCell({ item, isEs }: { item: GapContractItem; isEs: boolean }) {
  const name = item.vendor_display ?? item.vendor
  const raw = item.vendor ?? ''
  switch (item.vendor_source) {
    case 'canonical':
      return item.vendor_id
        ? <EntityIdentityChip type="vendor" id={item.vendor_id} name={item.vendor_display} variant="name" fullName className="font-semibold text-text-primary" />
        : <span>{formatVendorName(name, 999)}</span>
    case 'self_buyer':
      return <span className="text-text-muted" title={raw}>{isEs ? 'El oficio nombra al comprador, no al vendedor' : 'Letter names the buyer, not the seller'}</span>
    case 'illegible':
      return <span className="text-text-muted" title={raw}>{isEs ? 'No legible en el oficio' : 'Not legible in the letter'}</span>
    case 'rfc_only':
      return item.vendor_rfc
        ? <span className="ct-mono">{item.vendor_rfc}<Badge title={isEs ? 'Solo el RFC se leyó del oficio' : 'Only the tax ID was read from the letter'}>RFC</Badge></span>
        : <span className="text-text-muted">{isEs ? 'Persona física (RFC reservado)' : 'Individual (RFC withheld)'}</span>
    case 'rfc_sibling':
      return (
        <span>{formatVendorName(name, 999)}
          <Badge title={isEs ? 'Nueva para el corpus de RUBLI, identificada por RFC' : "New to RUBLI's corpus, identified by tax ID"}>RFC</Badge>
        </span>
      )
    case 'segmented':
      return (
        <span>{formatVendorName(name, 999)}
          <Badge title={`${raw}: ${isEs ? 'palabras separadas del oficio escaneado' : 'word-segmented from the scanned letter'}`}>OCR·SEG</Badge>
        </span>
      )
    default:
      if (!name) return <span className="text-text-muted ct-mono" title={isEs ? 'Sin proveedor en el oficio' : 'No vendor in the letter'}>—</span>
      return (
        <span>{formatVendorName(name, 999)}
          <Badge title={isEs ? 'Texto leído por OCR del oficio' : 'Text read by OCR from the letter'}>OCR</Badge>
        </span>
      )
  }
}
