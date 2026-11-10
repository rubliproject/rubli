/**
 * ExpedienteSpine — § III, the term's case file: documented scandals (GET /analysis/admin-scandals) and key events
 * (props.events) merged into one year-ordered list, in the Portada's list look (kit/BoardList, owner 11-09).
 * A scandal carries its severity chip and opens its case; an event carries its kind.
 */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { BoardList, type BoardCol } from '@/components/kit/BoardList'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import type { SEVERITY_COLORS } from './data'
import { useAdminScandals } from './useAdminScandals'
import type { AdminName } from './types'

export interface ExpedienteSpineProps {
  adminName: AdminName
  isEs: boolean
  gtCaseCount?: number
  events: Array<{
    year: number
    title: string
    titleEs: string
    type: 'reform' | 'scandal' | 'audit' | 'crisis'
    impact: 'high' | 'medium' | 'low'
    /** When set, this curated event restates an API scandal (by slug) of this
     *  key — it is dropped from the spine when that scandal is present, so the
     *  richer (case-linked) scandal entry is the single source of truth. */
    dupScandal?: string
  }>
}

type EventType = ExpedienteSpineProps['events'][number]['type']
type Severity = keyof typeof SEVERITY_COLORS

/** A scandal entry from the admin-scandals API. */
interface ScandalSpineEntry {
  kind: 'scandal'
  year: number
  severity: Severity
  caseId?: string
  text: string
}

/** An event entry merged from props.events. */
interface EventSpineEntry {
  kind: 'event'
  year: number
  type: EventType
  impact: 'high' | 'medium' | 'low'
  text: string
}

type SpineEntry = ScandalSpineEntry | EventSpineEntry

export function ExpedienteSpine(props: ExpedienteSpineProps): JSX.Element {
  const { adminName, isEs, events } = props
  const { t } = useTranslation('administrations')

  // (b) tier A/B GT scandals (API) → spine entries, at the case's start year
  const scandals = useAdminScandals(adminName)

  // (a) events → spine entries. Drop any curated event that merely restates a
  // scandal present here (dupScandal) — otherwise every major affair renders
  // twice (curated event + GT scandal). The scandal carries the case link, so
  // it wins. DC4.
  const scandalKeys = new Set(scandals.map((s) => s.slug))
  const eventEntries: EventSpineEntry[] = events
    .filter((e) => !(e.dupScandal && scandalKeys.has(e.dupScandal)))
    .map((e) => ({
      kind: 'event',
      year: e.year,
      type: e.type,
      impact: e.impact,
      text: isEs ? e.titleEs : e.title,
    }))

  const scandalEntries: ScandalSpineEntry[] = scandals.map((s) => ({
    kind: 'scandal',
    year: s.year,
    severity: s.severity,
    caseId: s.slug,
    text: isEs ? s.name_es : s.name_en,
  }))

  // Merge + sort: ascending by year, scandals before events within the same year.
  const entries: SpineEntry[] = [...scandalEntries, ...eventEntries].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    if (a.kind === b.kind) return 0
    return a.kind === 'scandal' ? -1 : 1
  })

  const lang = isEs ? 'es' : 'en'
  const note = t('groundTruthNote')
  if (entries.length === 0) return <p className="ct-note">{t('eventsNoData')} {note}</p>
  const cols: BoardCol[] = [
    { label: isEs ? 'Año' : 'Year', w: '56px', cls: 'bd-age', phone: true },
    { label: isEs ? 'Tipo' : 'Kind', w: '130px', cls: 'bd-risk' },
    { label: isEs ? 'Qué pasó' : 'What happened', w: 'minmax(0, 1fr)', cls: 'bd-say', phone: true },
  ]
  return (
    <BoardList id="adm-exp" lang={lang} cols={cols} label={isEs ? 'El expediente, año por año' : 'The case file, year by year'} note={note}
      rows={entries.map((e, i) => ({
        key: `${e.kind}-${e.year}-${i}`,
        cells: [
          String(e.year),
          e.kind === 'scandal'
            ? <span className={`bd-st is-${e.severity}`}>{t(`dossier.severityLabels.${e.severity}`)}</span>
            : <span className="bd-tag is-flag">{t(`eventTypes.${e.type}`)}</span>,
          e.kind === 'scandal' && e.caseId
            ? <EntityIdentityChip type="case" id={e.caseId} name={e.text} variant="name" className="bd-chip" fullName />
            : e.text,
        ],
      }))} />
  )
}

export default ExpedienteSpine
