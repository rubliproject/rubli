/** `<DoorTag>` — tone tick + mono door code (+ the short gloss inline in rows). gap-relevo spec § doors. */
import { doorOf, doorColor } from '@/lib/gap/doors'

export function DoorTag({ art, isEs, row = false }: { art: string | null | undefined; isEs: boolean; row?: boolean }) {
  const d = doorOf(art)
  const c = doorColor(d.tone)
  return (
    <span
      className={d.tone === 'unverified' ? 'gap-door is-unv' : 'gap-door'}
      style={c ? { ['--c' as string]: c } : undefined}
      title={`${art ?? (isEs ? 'Sin excepción' : 'No exception')}: ${isEs ? d.meaning.es : d.meaning.en}`}
    >
      <b>{d.tone === 'none' ? (isEs ? d.short.es : d.short.en) : d.code}</b>
      {row && d.tone !== 'none' && <small>{isEs ? d.short.es : d.short.en}</small>}
    </span>
  )
}
