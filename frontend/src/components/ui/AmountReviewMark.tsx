import { useTranslation } from 'react-i18next'
import { validateAmount } from '@/lib/utils'

/** † after an amount above FLAG_THRESHOLD (10B MXN, .claude/rules/data-validation.md): included, under review. */
export function amountUnderReview(amount: number | null | undefined): boolean {
  return amount != null && validateAmount(amount).isFlagged
}

export function AmountReviewMark({ amount }: { amount: number | null | undefined }) {
  const { i18n } = useTranslation()
  if (!amountUnderReview(amount)) return null
  const lang = i18n.language?.startsWith('en') ? 'en' : 'es'
  const tip = lang === 'en'
    ? 'Amount under review: above 10B MXN, kept in totals pending manual check'
    : 'Monto en revisión: más de 10,000 MDP, se cuenta en los totales hasta su revisión manual'
  return (
    <sup className="text-text-muted" title={tip}>
      <span aria-hidden="true">†</span>
      <span className="sr-only">{tip}</span>
    </sup>
  )
}
