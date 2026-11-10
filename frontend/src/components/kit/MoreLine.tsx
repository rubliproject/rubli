/**
 * MoreLine — a head line that shows ONE line and offers «más» only when the line is cut
 * (DESIGN.md §3.1 «Compact chrome», after El Mapa's ZKickerBand, owner 2026-11-02).
 * Open, it wraps in place; the full text is always in the DOM (screen readers read it whole), and the line
 * also opens while focus is inside it, so a link past the ellipsis is never focused unseen (CSS :focus-within).
 */
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLang } from '@/components/contrato/nav'

export function MoreLine({ children, className }: { children: ReactNode; className?: string }) {
  const lang = useLang()
  const ref = useRef<HTMLParagraphElement>(null)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setCut(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children, open])
  return (
    <div className={open ? 'ct-more-line is-open' : 'ct-more-line'}>
      <p ref={ref} id={id} className={className}>{children}</p>
      {(cut || open) && (
        <button
          type="button"
          className="ct-mas"
          aria-expanded={open}
          aria-controls={id}
          aria-label={open
            ? (lang === 'en' ? 'less: fold the summary to one line' : 'menos: plegar el resumen a una línea')
            : (lang === 'en' ? 'more: show the full summary' : 'más: mostrar el resumen completo')}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (lang === 'en' ? 'less' : 'menos') : (lang === 'en' ? 'more' : 'más')}
        </button>
      )}
    </div>
  )
}
