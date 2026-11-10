import { useTranslation } from 'react-i18next'
import { ScrollReveal } from '@/components/ui/Reveal'
import { cn } from '@/lib/utils'

interface ChapterBannerProps {
  number: number
  title: string
  subtitle?: string
  era?: string
  color?: string
  /** Ink for the small type (kicker, era pill); defaults to `color`. */
  ink?: string
  className?: string
}

export default function ChapterBanner({
  number,
  title,
  subtitle,
  era,
  color = 'var(--color-sector-salud)',
  ink,
  className,
}: ChapterBannerProps) {
  const { t } = useTranslation('common')
  const paddedNumber = String(number).padStart(2, '0')

  return (
    <ScrollReveal className={cn('st-fig st-banner', className)}>
      {/* The band is a figure-width block under a 2px rule in the story's
          categorical accent (DESIGN.md §6.3). The inner <h2> IS the heading. */}
      <div className="relative w-full" style={{ borderTop: `2px solid ${color}` }}>
        {/* Content sits on the reading track, centred inside the band exactly
            as the body prose is centred in the frame. */}
        <div className="st-read flex items-start justify-between gap-4 pt-4 pb-3">
          <div className="space-y-2 min-w-0">
            <p
              className="text-[13px] ct-sc"
              style={{ color: ink ?? color }}
            >
              {t('storyType.chapter', 'Chapter')} {paddedNumber}
            </p>
            <h2 className="st-h2-open text-text-primary text-balance">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[17px] leading-[1.6] text-text-secondary text-pretty">
                {subtitle}
              </p>
            )}
          </div>

          {era && (
            <span className="hidden md:inline font-mono text-[13px] text-text-muted shrink-0 pt-0.5">
              {era}
            </span>
          )}
        </div>
      </div>
    </ScrollReveal>
  )
}
