/**
 * AriaMemoPanel — displays LLM-generated investigation memos for a vendor
 *
 * Fetches from GET /aria/memos/{vendorId} and renders it as a § block in the
 * dossier's own voice (PARALLAX D10b § Change 3): SubSectionTitle kicker, mono
 * provenance seals, one EB Garamond reading column at the 640 measure, sources +
 * actions in a right rail when the panel itself is ≥ 64rem wide (container
 * query — the same panel also renders inside the narrow /aria row expand).
 * Chrome is bilingual (`aria` namespace); the memo text stays as written.
 * The vendor's RFC is never rendered or copied (.claude/rules/security.md § 1).
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ariaApi } from '@/api/client'
import type { AriaMemoResponse } from '@/api/client'
import { cn } from '@/lib/utils'
import { RISK_TEXT_COLORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { redactRfc } from '@/lib/redact'
import { Skeleton } from '@/components/ui/skeleton'
import { SubSectionTitle } from '@/components/dossier/SubSectionTitle'
import { Copy, Check, AlertCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AriaMemoProps {
  vendorId: number
  vendorName: string
  tier?: number
  /** Vendor flagged as structural false positive (e.g. multinational pharma OEM).
   *  Per docs/DATA_INTEGRITY_PLAN.md task N.2 — defamation guard. */
  isFalsePositive?: boolean
  fpReason?: string
  /** The public GT label is "unverified lead": the memo's own "Incorporado a
   *  Ground Truth (Caso N …)" line is redacted to the same standing
   *  (PARALLAX D13b § Change 7). */
  gtUnverified?: boolean
  className?: string
  /** Render nothing when there is no memo (instead of the «not available» line). */
  hideEmpty?: boolean
}

// Heuristic: detect templated/auto-generated memos so the UI can demote them
// honestly. Per docs/DATA_INTEGRITY_PLAN.md task N.3 — 38% of memos are
// template strings whose "FUENTES" block is a search prompt, not citations.
function isTemplatedMemo(text: string): boolean {
  if (!text) return false
  return (
    text.includes('Buscar manualmente') ||
    text.includes('PREGUNTAS DE INVESTIGACIÓN') ||
    /Hipótesis Alternativas?:/.test(text) ||
    text.includes('Animal Político / Proceso / Latinus')
  )
}

// Heuristic: detect memos written before the Mar 25 v0.8.5 rescore.
// Per docs/DATA_INTEGRITY_PLAN.md task N.4.
function hasStaleModelReference(text: string): boolean {
  if (!text) return false
  return /\bv5\.[01]\b/.test(text) || /modelo v5\b/i.test(text)
}

// ---------------------------------------------------------------------------
// Shared type
// ---------------------------------------------------------------------------

const SERIF = 'var(--font-family-editorial)'
const MEMO_OCHRE = 'var(--color-accent)'
// Kickers in the muted ink: darker than the page's own h3s pulled the memo's
// sub-sections above the dossier's (PARALLAX D13b § Change 8, M11).
const KICKER_STYLE = { fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 } as const

// Corner crop marks — the plate the memo sits in (same local pattern as
// ActaLedger / SpectralRegister).
type CropPos = 'tl' | 'tr' | 'bl' | 'br'
function CropMark({ position }: { position: CropPos }) {
  const stroke = 'rgba(160, 104, 32, 0.55)'
  const edge = `1px solid ${stroke}`
  const pos: Record<CropPos, CSSProperties> = {
    tl: { top: 8, left: 8, borderTop: edge, borderLeft: edge },
    tr: { top: 8, right: 8, borderTop: edge, borderRight: edge },
    bl: { bottom: 8, left: 8, borderBottom: edge, borderLeft: edge },
    br: { bottom: 8, right: 8, borderBottom: edge, borderRight: edge },
  }
  return <span aria-hidden="true" style={{ position: 'absolute', width: 14, height: 14, pointerEvents: 'none', ...pos[position] }} />
}
const BODY_STYLE = { fontFamily: SERIF, fontSize: 15, lineHeight: 1.55, color: 'var(--color-text-secondary)' } as const

// Mono seal — the dossier's provenance stamp (hairline border, ink only).
function Seal({ children, ink }: { children: ReactNode; ink: string }) {
  return (
    <span
      className="inline-flex items-center font-mono font-bold uppercase rounded-sm"
      style={{ fontSize: 12, letterSpacing: '0.12em', padding: '1px 6px', color: ink, border: '1px solid currentColor', lineHeight: 1.4 }}
    >
      {children}
    </span>
  )
}

const TIER_INK: Record<number, string> = {
  1: RISK_TEXT_COLORS.critical,
  2: RISK_TEXT_COLORS.high,
  3: RISK_TEXT_COLORS.medium,
  4: 'var(--color-text-muted)',
}

// Folio marginal note — mono kicker + serif body, hairline rule on the left.
function MarginNote({ title, children, rule }: { title?: string; children: ReactNode; rule: string }) {
  return (
    <div className="mb-4 max-w-[640px]" style={{ borderLeft: `1px solid ${rule}`, paddingLeft: 12 }}>
      {title && (
        <p className="ct-sc mb-1" style={{ fontSize: 12, color: rule, fontWeight: 600 }}>
          {title}
        </p>
      )}
      <div style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{children}</div>
    </div>
  )
}

function MemoSkeleton() {
  return (
    <div className="space-y-3 py-2 max-w-[640px]">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  )
}

// No memo → one plain empty state. (The former "algorithmic profile" stub read
// the retired v5.2 SHAP table under a v0.8.5 label — PARALLAX D13 § Change 1.)
function MemoEmptyState({ vendorName }: { vendorName: string }) {
  const { t } = useTranslation('aria')
  return (
    <div className="max-w-[640px] py-2">
      <p style={BODY_STYLE}>
        {t('memo.emptyTitle')}{' '}
        <span className="font-semibold text-text-primary">{formatEntityName('vendor', vendorName, 'full')}</span>.
      </p>
      <p className="mt-1" style={{ ...BODY_STYLE, fontSize: 14, color: 'var(--color-text-muted)' }}>{t('memo.emptyBody')}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FormattedMemo — turns the raw ARIA memo text (ALL-CAPS headers underlined with
// "====", "•" bullets, "Key: value" preamble) into editorial structure. The
// memo's own first line becomes a mono sub-line under the vendor title; sub-
// sections become mono § kickers; FUENTES / ACCIONES go to the rail.
// ---------------------------------------------------------------------------

const RAIL_SECTION = /^(FUENTES|ACCIONES)/i

// Inline markdown subset: **bold** → <strong>; a lone *emphasis* loses its
// asterisks (no italic on this site). Nothing else is interpreted.
function inline(text: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  if (parts.length === 1) return text.replace(/\*(\S[^*]*?)\*/g, '$1')
  return parts.map((p, i) =>
    i % 2 === 1
      ? <strong key={i} className="text-text-primary font-semibold">{p}</strong>
      : p.replace(/\*(\S[^*]*?)\*/g, '$1'),
  )
}

/** Rough language call for the "as generated" notice — most memos are Spanish, some LLM ones English. */
function memoLanguage(text: string): 'es' | 'en' | null {
  // lower-case only: UPPERCASE company names ("… DEL SUR SA DE CV") are not prose.
  // A tie (incl. 0–0) is "unknown" — the memo declares no language, so say nothing.
  const es = (text.match(/\b(de|la|el|los|las|que|por|con|del|una)\b/g) ?? []).length
  const en = (text.match(/\b(the|and|of|to|with|for|is|was|from)\b/g) ?? []).length
  return en > es ? 'en' : es > en ? 'es' : null
}

function FormattedMemo({ text, vendorName }: { text: string; vendorName: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const main: ReactNode[] = []
  const rail: ReactNode[] = []
  let target = main
  let bullets: Array<[string, string]> = []
  let asides: string[] = []
  let para: string[] = []
  let kvs: Array<[string, string]> = []
  let memoTitle: string | null = null
  let k = 0

  const isUnderline = (s: string) => /^[=_~–—-]{3,}$/.test(s.trim())
  const flushPara = () => {
    if (para.length) {
      target.push(<p key={`p${k++}`} style={BODY_STYLE}>{inline(para.join(' '))}</p>)
      para = []
    }
  }
  const flushBullets = () => {
    if (bullets.length) {
      target.push(
        <ul key={`u${k++}`} className="space-y-1.5">
          {bullets.map(([mark, b], i) => (
            <li key={i} className="flex gap-2.5" style={BODY_STYLE}>
              <span aria-hidden="true" className="tabular-nums" style={{ color: MEMO_OCHRE, flexShrink: 0 }}>{mark}</span>
              <span className="min-w-0">{inline(b)}</span>
            </li>
          ))}
        </ul>,
      )
      bullets = []
    }
  }
  const flushKvs = () => {
    if (kvs.length) {
      target.push(
        <dl
          key={`d${k++}`}
          className="grid gap-x-4 gap-y-1 font-mono py-2"
          style={{ gridTemplateColumns: 'max-content minmax(0, 1fr)', fontSize: 12, borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}
        >
          {kvs.map(([kk, vv], i) => (
            <div key={i} className="contents">
              <dt className="uppercase" style={{ letterSpacing: '0.12em', color: 'var(--color-text-muted)' }}>{kk}</dt>
              <dd style={{ color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>{inline(vv)}</dd>
            </div>
          ))}
        </dl>,
      )
      kvs = []
    }
  }
  const flushAsides = () => {
    if (asides.length) {
      target.push(
        <aside key={`q${k++}`} style={{ ...BODY_STYLE, borderLeft: '2px solid var(--color-border-hover, var(--color-border))', paddingLeft: 12 }}>
          {inline(asides.join(' '))}
        </aside>,
      )
      asides = []
    }
  }
  const flushAll = () => { flushBullets(); flushPara(); flushKvs(); flushAsides() }
  const pushHeader = (label: string) => {
    flushAll()
    target = RAIL_SECTION.test(label) ? rail : main
    target.push(
      <p key={`h${k++}`} role="heading" aria-level={4} className="ct-sc pt-2" style={KICKER_STYLE}>
        § {label}
      </p>,
    )
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const next = lines[i + 1]?.trim()
    if (isUnderline(line)) continue
    if (!line) { flushAll(); continue }

    // Markdown table row → a key/value pair (header row and |---| rule skipped).
    // redactRfc() has already stripped each line's leading pipe, so a row is
    // "a | b |" here — matched by its trailing pipe and ≥ 2 pipes.
    if (/\|$/.test(line) && (line.match(/\|/g) ?? []).length >= 2) {
      const isRule = (s?: string) => !!s && /^\|?[\s:|-]+\|$/.test(s)
      if (isRule(line) || isRule(next)) continue
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
      if (cells.length >= 2) { flushBullets(); flushPara(); flushAsides(); kvs.push([cells[0], cells.slice(1).join(' · ')]) }
      continue
    }

    // Markdown heading (## X) → a mono kicker; never the memo's title line.
    const md = /^#{1,6}\s+(.+)$/.exec(line)
    if (md) { if (memoTitle == null) memoTitle = ''; pushHeader(md[1].replace(/\*\*/g, '').trim()); continue }

    // First non-empty line → the memo's own title (kept verbatim as a sub-line).
    if (memoTitle == null) { memoTitle = line; continue }

    // > quote → a ruled aside.
    const q = /^>\s?(.*)$/.exec(line)
    if (q) { flushBullets(); flushPara(); flushKvs(); asides.push(q[1]); continue }

    // Section header: ALL-CAPS short line, or any line immediately underlined.
    const looksHeader =
      (next != null && isUnderline(next)) ||
      (/^[^a-záéíóúñü]+$/.test(line) && line.length >= 3 && line.length <= 46 && !/^[•·\-*✓→]/.test(line))
    if (looksHeader) {
      pushHeader(line.replace(/[=_~–—-]+$/, '').trim())
      continue
    }

    // Bullet (• keeps the › mark; ✓ / → keep their own glyph; "- " / "* " need
    // the space so a **bold** line is not read as a bullet). "1. " keeps its number.
    const bm = /^(?:([•·✓→])\s*|([-*])\s+)(.+)$/.exec(line)
    if (bm) { flushPara(); flushKvs(); flushAsides(); const g = bm[1] ?? bm[2]; bullets.push([/[✓→]/.test(g) ? g : '›', bm[3]]); continue }
    const nm = /^(\d{1,2})[.)]\s+(.+)$/.exec(line)
    if (nm) { flushPara(); flushKvs(); flushAsides(); bullets.push([`${nm[1]}.`, nm[2]]); continue }

    // Key: value preamble (Tipo, Confianza, Vendor ID) — only before prose/bullets begin.
    const kv = /^([A-Za-zÁÉÍÓÚÑ][^:]{1,22}):\s+(.+)$/.exec(line)
    if (kv && bullets.length === 0 && para.length === 0 && main.length === 0) { kvs.push([kv[1], kv[2]]); continue }

    // Prose. In the rail (sources, actions) every line stays its own line.
    flushBullets(); flushKvs(); flushAsides(); para.push(line)
    if (target === rail) flushPara()
  }
  flushAll()

  return (
    <div data-memo-body className="@container">
      <div className="mb-3">
        <p className="text-text-primary" style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 21, lineHeight: 1.2, letterSpacing: '-0.005em' }}>
          {formatEntityName('vendor', vendorName, 'full')}
        </p>
        {memoTitle && (
          <p className="font-serif mt-1" style={{ fontSize: 12, color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>
            {memoTitle}
          </p>
        )}
      </div>
      {/* no width cap (DESIGN.md §4): the memo fills its track; two tracks only when there is a rail */}
      <div className={rail.length > 0 ? '@5xl:grid @5xl:gap-x-10' : undefined} style={rail.length > 0 ? { gridTemplateColumns: '7fr 5fr' } : undefined}>
        <div className="space-y-3 min-w-0">{main}</div>
        {rail.length > 0 && (
          <div className="space-y-3 min-w-0 mt-3 @5xl:mt-0">{rail}</div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AriaMemoPanel({ vendorId, vendorName, tier, isFalsePositive, fpReason, gtUnverified, className, hideEmpty }: AriaMemoProps) {
  const { t, i18n } = useTranslation('aria')
  const isEs = (i18n.language ?? 'es').startsWith('es')
  const [copied, setCopied] = useState(false)
  const [memoOpen, setMemoOpen] = useState<boolean | null>(null) // null = the default for this memo type

  const { data: memo, isLoading, error } = useQuery<AriaMemoResponse | null>({
    queryKey: ['aria-memo', vendorId],
    queryFn: () => ariaApi.getMemo(vendorId),
    staleTime: 600_000, // 10 min
    enabled: vendorId > 0,
  })

  // Provenance — prefer the canonical memo_type column from S.3 classification,
  // fall back to text heuristic if API doesn't return it (e.g. older deploys).
  const rawText = memo?.memo_text ?? ''
  const memoText = gtUnverified
    ? redactRfc(rawText).replace(/Incorporado a Ground Truth(\s*\([^)]*\))?/gi, 'En la base de casos (pista sin verificar)')
    : redactRfc(rawText)
  const memoType = memo?.memo_type
  const isTemplated = memoType === 'template' || memoType === 'duplicate' || isTemplatedMemo(rawText)
  const hasStaleScore = hasStaleModelReference(rawText)

  async function handleCopy() {
    if (!memoText) return
    try {
      await navigator.clipboard.writeText(memoText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API may fail in some contexts
    }
  }

  const effectiveTier = memo?.tier ?? tier
  const stamp = memo?.generated_at ?? memo?.created_at
  const dateLabel = stamp
    ? new Intl.DateTimeFormat(isEs ? 'es-MX' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(stamp))
    : undefined
  const titleId = `aria-memo-title-${vendorId}`
  const words = memoText.trim() ? memoText.trim().split(/\s+/).length : 0
  const memoLang = memoLanguage(rawText)
  // The memo is the longest block on the dossier: a door, open by default only
  // for an LLM narrative — a template opened 1,200 px of boilerplate before the
  // model's reading (PARALLAX D13b § Change 8, M12).
  const openByDefault = memoType === 'llm_narrative'
  // The badge says what kind of memo this is ("AI-generated" sat on template
  // and stub memos whose last line says "sin LLM" — M8).
  const kindLabel = memoType === 'llm_narrative'
    ? t('memo.aiGenerated')
    : memoType === 'template' || memoType === 'duplicate' || (!memoType && isTemplated)
      ? t('memo.kindTemplate')
      : memoType === 'stub'
        ? t('memo.kindStub')
        : null

  // The dossier shows nothing rather than a «not available» placeholder (owner 2026-11-04).
  if (hideEmpty && !isLoading && !error && !memo?.memo_text) return null

  return (
    <section data-memo-panel aria-labelledby={titleId} className={cn('min-w-0', className)}>
      <SubSectionTitle id={titleId}>
        {t('memo.kicker')}
      </SubSectionTitle>

      {/* Provenance seals */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {effectiveTier != null && <Seal ink={TIER_INK[effectiveTier] ?? TIER_INK[4]}>T{effectiveTier}</Seal>}
        {memoType === 'llm_narrative' && <Seal ink="var(--color-accent-data)">LLM</Seal>}
        {(memoType === 'template' || memoType === 'duplicate') && <Seal ink={RISK_TEXT_COLORS.medium}>{t('memo.template')}</Seal>}
        {memoType === 'stub' && <Seal ink="var(--color-text-muted)">STUB</Seal>}
        {memo?.memo_text && (
          <span className="font-mono" style={{ fontSize: 12, letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>
            {kindLabel}
            {dateLabel && <>{kindLabel ? ' · ' : ''}{t('memo.generatedOn', { date: dateLabel })}</>}
            {memoLang === 'es' && !isEs && <> · {t('memo.sourceLanguage')}</>}
            {memoLang === 'en' && isEs && <> · {t('memo.sourceLanguageEnglish')}</>}
          </span>
        )}
      </div>

      {isLoading ? (
        <MemoSkeleton />
      ) : error ? (
        <div className="flex items-center gap-2 text-sm py-2" style={{ color: RISK_TEXT_COLORS.critical }}>
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('memo.loadError')}
        </div>
      ) : memo?.memo_text ? (
        <>
          {/* === Provenance notes (docs/DATA_INTEGRITY_PLAN.md N.2-N.4) === */}
          {isFalsePositive && (
            <MarginNote title={t('memo.fpTitle')} rule="var(--color-text-primary)">
              {t('memo.fpBody')} <strong className="text-text-primary">{t('memo.fpStrong')}</strong> {t('memo.fpTail')}
              {fpReason && (
                <span className="block mt-1 font-serif text-text-muted" style={{ fontSize: 12 }}>
                  {t('memo.fpReason')}: {fpReason}
                </span>
              )}
            </MarginNote>
          )}
          {isTemplated && !isFalsePositive && (
            <MarginNote title={t('memo.tplTitle')} rule={RISK_TEXT_COLORS.medium}>
              {t('memo.tplBody')} <strong className="text-text-primary">{t('memo.tplStrong')}</strong> {t('memo.tplTail')}
            </MarginNote>
          )}
          {hasStaleScore && (
            <p
              className="font-serif mb-4 max-w-[640px]"
              style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-accent-hover)', borderLeft: '1px solid var(--color-accent-hover)', paddingLeft: 12 }}
            >
              ⓘ {t('memo.stale')}
            </p>
          )}
          {/* the body mounts only when open: a closed <details> still lays out its content (content-visibility), which the spacing gate reads as ink */}
          <details open={memoOpen ?? openByDefault} onToggle={(e) => setMemoOpen(e.currentTarget.open)} className="group">
            <summary className="cursor-pointer select-none font-serif text-text-secondary hover:text-text-primary rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 py-1 mb-3" style={{ fontSize: 12 }}>
              {memoLang
                ? t('memo.readMemo', { n: words.toLocaleString(isEs ? 'es-MX' : 'en-US'), language: t(memoLang === 'es' ? 'memo.langEs' : 'memo.langEn') })
                : t('memo.readMemoNoLang', { n: words.toLocaleString(isEs ? 'es-MX' : 'en-US') })}
            </summary>
          {(memoOpen ?? openByDefault) && (
          <div className="relative rounded-sm px-5 md:px-6 pt-5 pb-4" style={{ border: '1px solid var(--color-border)', boxShadow: 'inset 0 0 0 1px rgba(160, 104, 32, 0.06)' }}>
            <CropMark position="tl" />
            <CropMark position="tr" />
            <CropMark position="bl" />
            <CropMark position="br" />
          <FormattedMemo text={memoText} vendorName={vendorName} />

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-4 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={t('memo.copyAria')}
              className="inline-flex items-center gap-1.5 min-h-6 font-serif text-text-muted hover:text-text-primary transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
              style={{ fontSize: 12 }}
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? t('memo.copied') : t('memo.copy')}
            </button>
            <span className="font-serif" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {t('memo.footer')}
            </span>
          </div>
          </div>
          )}
          </details>
        </>
      ) : (
        <MemoEmptyState vendorName={vendorName} />
      )}
    </section>
  )
}

export default AriaMemoPanel
