/**
 * CategoryDossier — /categories/:id and its subcategory mode /categories/:id/sub/:code (owner 11-06; content doc
 * docs/PROFILE_CONTENT_CATEGORY_2026-11-05.md). One template: the body lives in components/category/b2/CategoryB2;
 * this route keeps the record lookup, the not-found state and the Conexiones footer.
 */
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { categoriesApi } from '@/api/client'
import { CategoryB2 } from '@/components/category/b2/CategoryB2'
import { DossierOriginProvider } from '@/lib/nav/WayfindingProviders'
import { DocHead } from '@/components/contrato/DocHead'
import { Conexiones } from '@/components/contrato/Conexiones'
import { useLang } from '@/components/contrato/nav'
import { cieloHref } from '@/lib/vista'
import { formatEntityName } from '@/lib/entity/format'
import { HOY_FROM, catPanoramaApi } from '@/lib/categories/panorama'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { NoIndex, clip } from '@/lib/seo/routeMeta'
import { formatCompactMXN, formatNumber } from '@/lib/utils'

interface SummaryRow { category_id: number; name_es: string; name_en: string; total_value: number; total_contracts: number; sector_id: number | null }

export default function CategoryDossier() {
  const { id, code } = useParams<{ id: string; code?: string }>()
  const categoryId = Number(id)
  const validId = Number.isFinite(categoryId) && categoryId > 0
  const sub = code && /^[a-z0-9_]{1,64}$/.test(code) ? code : null
  const lang = useLang()
  const en = lang === 'en'

  const { data: summary, isLoading, isError } = useQuery({
    queryKey: ['cat-dossier', 'summary'],
    queryFn: () => categoriesApi.getSummary(),
    staleTime: 5 * 60 * 1000,
  })
  // the footer's doors: the same cut the body opens with (shared cache)
  const { data: hoy, error: hoyErr } = useQuery({
    queryKey: ['category-b2', categoryId, sub, HOY_FROM],
    queryFn: () => catPanoramaApi.get(categoryId, { since: HOY_FROM, sub }),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
  const rows = (summary?.data ?? []) as SummaryRow[]
  const cat = rows.find((c) => c.category_id === categoryId)
  const ranked = [...rows].filter((c) => c.total_value > 0).sort((a, b) => b.total_value - a.total_value)
  const rank = cat ? ranked.findIndex((c) => c.category_id === categoryId) + 1 : 0
  const subMissing = sub != null && (hoyErr as { response?: { status?: number } } | null)?.response?.status === 404
  const catName = cat ? (en ? cat.name_en || cat.name_es : cat.name_es) : ''
  const title = hoy?.sub ? (en ? hoy.sub.name_en || hoy.sub.name_es : hoy.sub.name_es) : catName

  useDocumentTitle(
    cat ? `${title} — RUBLI` : null,
    cat ? clip(en
      ? `${title}: ${formatNumber(cat.total_contracts)} federal contracts worth ${formatCompactMXN(cat.total_value)} in the category: who sells it, who buys it, how.`
      : `${title}: ${formatNumber(cat.total_contracts)} contratos federales por ${formatCompactMXN(cat.total_value)} en la categoría: quién vende, quién compra, cómo.`, 160) : null,
  )

  const crumbs = [{ label: en ? 'Categories' : 'Categorías', to: '/categories' }]
  if (!validId || isError || (!isLoading && !cat) || subMissing) {
    return (
      <article className="ct ct-page ct-sheet">
        <div className="ct-wrap">
          {!isError && <NoIndex />}
          <DocHead trail={[...crumbs, { label: en ? 'Not found' : 'No encontrada' }]} />
          <div className="cd-error" role="alert">
            <h1 className="ct-h2">{isError ? (en ? 'The categories did not load' : 'Las categorías no cargaron') : subMissing ? (en ? 'Mini-category not found' : 'Minicategoría no encontrada') : !validId ? (en ? 'Invalid category id' : 'Identificador de categoría inválido') : (en ? 'Category not found' : 'Categoría no encontrada')}</h1>
            <Link to={subMissing && validId ? `/categories/${categoryId}` : '/categories'} className="ct-link">{subMissing ? (en ? 'Back to the category' : 'Volver a la categoría') : (en ? 'Back to categories' : 'Volver a categorías')}</Link>
          </div>
        </div>
      </article>
    )
  }
  if (isLoading || !cat) {
    return (
      <article className="ct ct-page ct-sheet">
        <div className="ct-wrap"><DocHead trail={[...crumbs, { label: '…' }]} /><div className="cd-hold" aria-busy="true" /></div>
      </article>
    )
  }

  return (
    <DossierOriginProvider value={{ route: sub ? `/categories/${categoryId}/sub/${sub}` : `/categories/${categoryId}`, label: formatEntityName('category', title, 'sm') }}>
      <article className="ct ct-page ct-sheet">
        <div className="ct-wrap">
          <CategoryB2 key={`${categoryId}-${sub}`} cat={{ id: categoryId, name_es: cat.name_es, name_en: cat.name_en, rank: rank || null, of: ranked.length }} sub={sub} lang={lang} />
          <Conexiones
            lang={lang}
            sectorId={cat.sector_id}
            institutions={(hoy?.buyers ?? []).map((b) => ({ id: b.institution_id, name: b.name ?? '' }))}
            vendors={(hoy?.suppliers ?? []).map((v) => ({ id: v.vendor_id, name: v.vendor_name ?? '' }))}
            contracts={{ to: `/contracts?category_id=${categoryId}`, count: cat.total_contracts }}
            mapa={cat.sector_id != null ? cieloHref({ lens: 'sectors', pin: cat.sector_id }) : null}
          />
        </div>
      </article>
    </DossierOriginProvider>
  )
}
