/**
 * /_dev/kit — the RUBLI kit, each element proven live (KIT_AUDIT.md).
 * Field · El Anaquel (the /categories instance) and Field · Focos Rojos
 * (the /aria instance). URL holds both views: ?sort= · ?fsort=&flit=&fpin=.
 */
import { Suspense, lazy } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { categoriesApi } from '@/api/client'
import { DocHead } from '@/components/contrato/DocHead'
import { useLang } from '@/components/contrato/nav'
import { Skeleton } from '@/components/ui/skeleton'
import { FOCOS_SORTS, type FocosLit, type FocosSort } from '@/components/aria/FocosField'
import type { FieldSort } from '@/lib/categories/field'
import '@/components/contrato/contrato.css'
import '@/components/kit/kit.css'

const CategoryAnaquel = lazy(() => import('@/components/categories/CategoryAnaquel'))
const FocosField = lazy(() => import('@/components/aria/FocosField'))
const CAT_SORTS: FieldSort[] = ['spend', 'risk', 'contracts', 'direct_award']

export default function Kit() {
  const lang = useLang()
  const en = lang === 'en'
  const [params, setParams] = useSearchParams()
  const set = (k: string, v: string | null) => setParams((p) => {
    const out = new URLSearchParams(p)
    if (v == null) out.delete(k)
    else out.set(k, v)
    return out
  }, { replace: true })

  const catSort = (CAT_SORTS as string[]).includes(params.get('sort') ?? '') ? (params.get('sort') as FieldSort) : 'spend'
  const fSort = (FOCOS_SORTS as string[]).includes(params.get('fsort') ?? '') ? (params.get('fsort') as FocosSort) : 'ips'
  const rawLit = params.get('flit')
  const fLit: FocosLit | null = rawLit === 'none' ? null : rawLit === 'efos' ? 'efos' : 'case'
  const fPin = params.get('fpin')

  const { data: cats } = useQuery({ queryKey: ['categories', 'summary'], queryFn: () => categoriesApi.getSummary(), staleTime: 600_000 })

  return (
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap">
        <DocHead trail={[{ label: 'Kit' }]} meta={en ? 'Internal · kit elements' : 'Interno · elementos del kit'} />

        <section className="mt-8" aria-labelledby="kit-anaquel">
          <h2 id="kit-anaquel" className="ct-h2 mb-6">Field · El Anaquel</h2>
          {cats?.data?.length ? (
            <Suspense fallback={<Skeleton className="h-[560px] w-full" />}>
              <CategoryAnaquel
                items={cats.data}
                sortKey={catSort}
                onSortKey={(k) => set('sort', k === 'spend' ? null : k)}
                activeSector={null}
                onSector={() => {}}
                lang={lang}
                focusCategory={null}
              />
            </Suspense>
          ) : <Skeleton className="h-[560px] w-full" />}
        </section>

        <section className="mt-10" aria-labelledby="kit-focos">
          <h2 id="kit-focos" className="ct-h2 mb-6">Field · Focos Rojos</h2>
          <Suspense fallback={<Skeleton className="h-[560px] w-full" />}>
            <FocosField
              lang={lang}
              sortKey={fSort}
              onSortKey={(k) => set('fsort', k === 'ips' ? null : k)}
              litKey={fLit}
              onLitKey={(k) => set('flit', k == null ? 'none' : k === 'case' ? null : k)}
              picked={fPin}
              onPick={(id) => set('fpin', id)}
            />
          </Suspense>
        </section>
      </div>
    </article>
  )
}
