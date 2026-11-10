import { folioFor } from '@/lib/nav/toc'
import { DATA_CUT_ISO } from '@/lib/constants'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeAll } from 'vitest'
import i18n from '@/i18n'
import { PageMasthead } from './PageMasthead'
import { formatCut } from '@/lib/nav/toc'
import type { DataQualityResponse } from '@/api/types'

beforeAll(async () => { await i18n.changeLanguage('es') })

function renderAt(path: string, ui: React.ReactElement, dq?: Partial<DataQualityResponse>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seed the shared query; with no seed the count must simply be absent.
  if (dq) qc.setQueryData(['data-quality'], dq)
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PageMasthead', () => {
  it('prints the route numeral, the kicker and the edition count', () => {
    const { container } = renderAt('/administrations',
      <PageMasthead variant="portada" kicker="Seis sexenios" range="2002–2025" title="Título" />,
      { analyzed_contracts: 3055837 })
    expect(container.querySelector('.mh-num')?.textContent).toBe('III')
    expect(screen.getByText('Seis sexenios')).toBeInTheDocument()
    expect(container.textContent).toContain('3,055,837 CONTRATOS CON IMPORTE VÁLIDO')
    expect(container.textContent).toContain(`DATOS AL ${formatCut(DATA_CUT_ISO, 'es')}`)
    expect(screen.getByRole('navigation', { name: 'Índice de la edición' })).toBeInTheDocument()
    expect(container.querySelector('[aria-current="page"]')?.textContent).toContain('Sexenios')
  })

  it('omits the count (and its separator) while it is missing', () => {
    const { container } = renderAt('/',
      <PageMasthead variant="portada" kicker="K" title="T" />)
    const facts = container.querySelector('.mh-edition-facts')!
    expect(facts.textContent).not.toMatch(/CONTRATOS/)
    expect(facts.textContent!.trim().endsWith('·')).toBe(false)
    expect(container.textContent).not.toContain('—')
  })

  it('applies tidyNodes glue to the title', () => {
    const { container } = renderAt('/',
      <PageMasthead variant="portada" kicker="K" title="Más de la mitad evita la licitación" />)
    // the last two words are glued (no one-word last line)
    expect(container.querySelector('h1')!.textContent).toContain('la licitación')
  })

  it('sets words in Garamond, never Playfair, unless titleStyle is figure', () => {
    const { container, rerender } = renderAt('/',
      <PageMasthead variant="indice" kicker="K" title="T" />)
    expect(container.querySelector('h1')!.className).not.toContain('figure')
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/contracts/1']}>
          <PageMasthead variant="expediente" kicker="K" folio="CONT · #1" title={<span>$1 MXN</span>} titleStyle="figure" />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(container.querySelector('h1')!.className).toContain('mh-h1--figure')
  })

  it('prints RUBLI off-TOC, and no range unless the caller passes one', () => {
    const { container } = renderAt('/settings',
      <PageMasthead variant="indice" kicker="Configuración" title="Ajustes" />)
    expect(container.querySelector('.mh-num')?.textContent).toBe('RUBLI')
    expect(container.querySelector('.mh-eyebrow')?.textContent).toBe('RUBLI·Configuración')
    expect(container.querySelector('.mh-edition')).toBeNull()
  })

  it('keeps a caller range on a numbered page', () => {
    const { container } = renderAt('/cases',
      <PageMasthead variant="indice" kicker="Películas" range="7 piezas" title="T" />)
    expect(container.querySelector('.mh-num')?.textContent).toBe(folioFor('/cases'))
    expect(container.querySelector('.mh-eyebrow')?.textContent).toContain('7 piezas')
  })

  it('drops a leading «RUBLI » from the kicker when the address is the brand', () => {
    const { container } = renderAt('/journalists',
      <PageMasthead variant="portada" kicker="RUBLI reporte ejecutivo" range="2002–2025" title="T" />)
    expect(container.querySelector('.mh-eyebrow')?.textContent).toBe('RUBLI·reporte ejecutivo·2002–2025')
    // the numbered route keeps the kicker verbatim
    const again = renderAt('/administrations',
      <PageMasthead variant="indice" kicker="RUBLI reporte ejecutivo" title="T" />)
    expect(again.container.querySelector('.mh-eyebrow')?.textContent).toBe('III·RUBLI reporte ejecutivo')
  })

  it('formats the data cut from the constant in UTC', () => {
    expect(formatCut('2025-09-28', 'en')).toBe('Sep 28, 2025')
    expect(formatCut('2025-09-28', 'es')).toMatch(/^28 sept? 2025$/)
  })
})
