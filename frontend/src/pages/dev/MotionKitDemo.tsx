/**
 * Dev-only demo of the motion kit on real data (route /dev/motion-kit, DEV builds only):
 * vendor 2873 (Maypo), institution 251 (IMSS), the sexenio aggregates, contract 2271271.
 * Captures: _explore/motion_kit_2026-10-29/. `?rm=1` forces the reduced-motion path for review.
 */
import { Suspense, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { categoriesApi, contractApi, institutionApi, vendorApi } from '@/api/client'
import { Constellation, ParticleFlow, TimeTerrain, Unfold, flowFromExpediente, graphFromTimeline, terrainFromExpediente, terrainFromSexenios, unfoldContract } from '@/components/kit/motion'
import { SECTOR_COLORS } from '@/lib/constants'
import { formatCompactMXN } from '@/lib/utils'
import { buildExpediente, toTimeline } from '@/lib/vendor/expediente'

const Block = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} style={{ margin: '0 0 40px', padding: '0 16px', maxWidth: 1100 }}>
    <h2 style={{ font: '600 13px/1.4 var(--font-sc)', letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)', margin: '0 0 8px' }}>{title}</h2>
    <Suspense fallback={<div style={{ minHeight: 300 }} />}>{children}</Suspense>
  </section>
)

export default function MotionKitDemo() {
  const { i18n } = useTranslation()
  const lang = i18n.language.startsWith('en') ? 'en' : 'es'
  const vendor = useQuery({ queryKey: ['mk', 'vendor', 2873], queryFn: () => vendorApi.getInstitutionsTimeline(2873), staleTime: Infinity })
  const inst = useQuery({ queryKey: ['mk', 'inst', 251], queryFn: () => institutionApi.getVendorsTimeline(251), staleTime: Infinity })
  const sex = useQuery({ queryKey: ['mk', 'sexenio'], queryFn: () => categoriesApi.getSexenio(), staleTime: Infinity })
  const contract = useQuery({ queryKey: ['mk', 'contract', 2271271], queryFn: () => contractApi.getById(2271271), staleTime: Infinity })

  const mV = useMemo(() => (vendor.data ? buildExpediente(vendor.data) : null), [vendor.data])
  const mI = useMemo(() => (inst.data ? buildExpediente(inst.data) : null), [inst.data])
  const flow = useMemo(() => (mV ? flowFromExpediente(mV, 'MAYPO') : null), [mV])
  const terrainV = useMemo(() => (mV ? terrainFromExpediente(mV) : null), [mV])
  const terrainS = useMemo(() => (sex.data ? terrainFromSexenios(sex.data.data.map((r) => ({
    id: r.category_id, label: lang === 'en' ? r.name_en : r.name_es, color: r.sector_code ? SECTOR_COLORS[r.sector_code] : undefined, administrations: r.administrations,
  })), 8) : null), [sex.data, lang])
  const graph = useMemo(() => (inst.data ? graphFromTimeline(toTimeline(inst.data), { label: 'IMSS' }, 60) : null), [inst.data])
  const unfold = useMemo(() => (contract.data ? unfoldContract(contract.data, lang, formatCompactMXN) : null), [contract.data, lang])

  return (
    <main style={{ padding: '24px 0', background: 'var(--color-background)', minHeight: '100vh' }}>
      <p style={{ padding: '0 16px', font: '400 12px/1.5 var(--font-mono)', color: 'var(--color-text-muted)' }}>motion kit · dev · {lang}</p>
      <Block id="flow" title="(a) ParticleFlow — Maypo: who pays, by year (vendor 2873)">
        {flow && <ParticleFlow data={flow} lang={lang} />}
      </Block>
      <Block id="terrain" title="(b) TimeTerrain — Maypo: years × buyers × money (vendor 2873)">
        {terrainV && <TimeTerrain data={terrainV} lang={lang} />}
      </Block>
      <Block id="terrain-sexenios" title="(b′) TimeTerrain — top categories × sexenio (categories/sexenio)">
        {terrainS && <TimeTerrain data={terrainS} lang={lang} height={340} title={lang === 'en' ? 'Money by term and category' : 'Dinero por sexenio y categoría'} />}
      </Block>
      <Block id="constellation" title="(c) Constellation — IMSS and its suppliers (institution 251)">
        {graph && <Constellation data={graph} lang={lang} />}
      </Block>
      <Block id="unfold" title="(d) Unfold — contract 2271271">
        {unfold && <Unfold data={unfold} lang={lang} />}
      </Block>
      {mI && <p style={{ padding: '0 16px', font: '400 12px/1.5 var(--font-mono)', color: 'var(--color-text-muted)' }}>IMSS total {formatCompactMXN(mI.total)} · {mI.lanes.length} lanes</p>}
    </main>
  )
}
