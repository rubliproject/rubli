import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface MetodologiaTooltipProps {
  title: string
  body: string
  link?: string
  className?: string
}

export function MetodologiaTooltip({ title, body, link, className }: MetodologiaTooltipProps) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
  const tipId = useId()
  // WCAG 1.4.13: hoverable (the pointer can cross the 8px gap onto the tip and
  // reach its link) and dismissable (Escape) — joker review 08 #1.
  const closeTimer = useRef<number | undefined>(undefined)
  const show = () => { window.clearTimeout(closeTimer.current); setOpen(true) }
  const hide = () => { window.clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => setOpen(false), 150) }
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      // Capture + stopImmediatePropagation: Escape closes only the tip, not also a
      // page-level Escape handler (Focos clears its filters on Escape).
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false) } }
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', onKey, true)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', onKey, true)
      }
    }
  }, [open, handleClickOutside])

  return (
    <span ref={containerRef} className={cn('relative inline-flex', className)} onPointerEnter={(e) => { if (e.pointerType === 'mouse') show() }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') hide() }}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-label={title}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        // 24px target around the 16px glyph (PARALLAX D8 § Change 5): same look, larger hit area.
        // Phones get 44px; the negative block margin keeps the line box at 24 (weekend D3).
        className={cn(
          'group inline-flex items-center justify-center min-w-11 min-h-11 -my-2.5 sm:my-0 sm:min-w-6 sm:min-h-6 rounded-full ml-0.5',
          'cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex items-center justify-center w-4 h-4 rounded-full text-xs',
            'border border-border text-text-muted',
            'group-hover:border-border-hover group-hover:text-text-primary',
            'transition-colors duration-150'
          )}
        >
          ?
        </span>
      </button>
      {open && (
        <div
          role="tooltip"
          id={tipId}
          className={cn(
            'absolute z-50 w-64 p-3 rounded-sm shadow-xl text-xs',
            'bg-background-card border border-border text-text-secondary',
            'bottom-full left-1/2 -translate-x-1/2 mb-2'
          )}
        >
          <div className="font-semibold text-text-primary mb-1">{title}</div>
          <div className="leading-relaxed">{body}</div>
          {link && (
            <a
              href={link}
              className="block mt-2 text-accent-data hover:underline"
            >
              {t('readMethodology')}
            </a>
          )}
          {/* Arrow */}
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 rotate-45 bg-background-card border-r border-b border-border"
          />
        </div>
      )}
    </span>
  )
}

export default MetodologiaTooltip
