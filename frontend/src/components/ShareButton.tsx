/**
 * ShareButton — share the current page via WhatsApp, X/Twitter, or clipboard.
 * Uses i18n for all labels. URL includes nuqs-synced filter state automatically.
 */

import { useState, useRef, useEffect } from 'react'
import { Share2, Check, MessageCircle, Twitter, Link } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ShareButtonProps {
  /** Short summary text for social share messages. Defaults to document.title */
  summary?: string
  /** Override URL to share. Defaults to window.location.href (includes filter params) */
  url?: string
  /** Override button label text */
  label?: string
  className?: string
}

export function ShareButton({ summary, url, label, className = '' }: ShareButtonProps) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const shareUrl = url ?? window.location.href
  const shareSummary = summary ?? document.title

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      const input = document.createElement('input')
      input.value = shareUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setCopied(true)
    setOpen(false)
    const tid = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(tid)
  }

  function handleWhatsApp() {
    const message = t('share.template', { summary: shareSummary, url: shareUrl })
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  function handleX() {
    const text = t('share.template', { summary: shareSummary, url: shareUrl })
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    )
    setOpen(false)
  }

  // «El Contrato» chip (DESIGN.md §8): outlined 40px .ct-chip; the menu is an ink-ruled list, no shadow, no hue.
  const item = 'flex w-full min-h-10 items-center gap-2 px-3 text-left text-sm text-text-primary transition-colors hover:bg-background-elevated'
  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ct-chip"
        aria-label={t('share.title')}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-text-muted" aria-hidden="true" />
            <span>{t('share.copied')}</span>
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span>{label ?? t('share.title')}</span>
          </>
        )}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 min-w-[200px] border border-text-primary bg-background">
          <button type="button" role="menuitem" onClick={handleWhatsApp} className={item}>
            <MessageCircle className="h-4 w-4 flex-shrink-0 text-text-muted" aria-hidden="true" />
            {t('share.whatsapp')}
          </button>
          <button type="button" role="menuitem" onClick={handleX} className={`${item} border-t border-border`}>
            <Twitter className="h-4 w-4 flex-shrink-0 text-text-muted" aria-hidden="true" />
            {t('share.postOnX')}
          </button>
          <button type="button" role="menuitem" onClick={handleCopyLink} className={`${item} border-t border-border`}>
            <Link className="h-4 w-4 flex-shrink-0 text-text-muted" aria-hidden="true" />
            {t('share.copyLink')}
          </button>
        </div>
      )}
    </div>
  )
}
