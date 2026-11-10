/**
 * SectionIndex — a one-line sticky index of a long dossier's sections (owner 2026-10-20:
 * «it's hard to navigate these pages»). Anchors keep their href (middle-click, copy link);
 * a click scrolls below the sticky line without touching history state, so the
 * wayfinding origin in location.state survives. The section whose top has passed the
 * line is marked (aria-current="location").
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react'

export interface IndexItem { id: string; label: string }

export function SectionIndex({ items, label }: { items: IndexItem[]; label: string }) {
  const ref = useRef<HTMLElement>(null)
  const [active, setActive] = useState<string | null>(null)
  const key = items.map((i) => i.id).join('|')

  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const line = (ref.current?.getBoundingClientRect().bottom ?? 0) + 24
      let cur: string | null = null
      for (const it of items) {
        const el = document.getElementById(it.id)
        if (el && el.getBoundingClientRect().top <= line) cur = it.id
      }
      // the last section can be too short to reach the line: the page bottom marks it
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) cur = items[items.length - 1]?.id ?? cur
      setActive(cur)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `items`
  }, [key])

  // phones: the index scrolls sideways — keep the active section's link in view (audit #11)
  useEffect(() => {
    const nav = ref.current
    const a = active ? nav?.querySelector<HTMLElement>(`a[href="#${CSS.escape(active)}"]`) : null
    if (!nav || !a || nav.scrollWidth <= nav.clientWidth) return
    const left = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    nav.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' })
  }, [active])

  function go(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id)
    if (!el || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    const top = el.getBoundingClientRect().top + window.scrollY - (ref.current?.offsetHeight ?? 0) - 8
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    const h = el.querySelector<HTMLElement>('h2')
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }) }
  }

  if (items.length < 2) return null
  return (
    <nav ref={ref} className="ct-index" aria-label={label}>
      {items.map((it) => (
        <a key={it.id} href={`#${it.id}`} onClick={(e) => go(e, it.id)} aria-current={active === it.id ? 'location' : undefined}>
          {it.label}
        </a>
      ))}
    </nav>
  )
}
