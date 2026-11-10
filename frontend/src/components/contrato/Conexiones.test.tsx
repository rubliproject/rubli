import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Conexiones } from './Conexiones'

const doors = (ui: React.ReactElement) => {
  const { container } = render(<MemoryRouter>{ui}</MemoryRouter>)
  return { container, labels: [...container.querySelectorAll('dt')].map((d) => d.textContent) }
}

describe('Conexiones', () => {
  it('renders only the doors whose data exists', () => {
    const { container, labels } = doors(
      <Conexiones
        lang="es"
        sectorId={1}
        categories={[]}
        institutions={[{ id: 251, name: 'INSTITUTO MEXICANO DEL SEGURO SOCIAL' }]}
        vendors={[{ id: 9, name: null }]}
        pattern={null}
        cases={[]}
        contracts={{ to: '/contracts?vendor_id=9', count: 1234 }}
        mapa="/mapa?vista=vinculos&planet=9"
      />,
    )
    expect(labels).toEqual(['Sector', 'Instituciones', 'Contratos', 'El Mapa'])
    expect(container.querySelector('a[href="/sectors/1"]')).not.toBeNull()
    expect(container.querySelector('a[href="/institutions/251"]')).not.toBeNull()
    expect(container.querySelector('a[href="/contracts?vendor_id=9"]')?.textContent).toBe('1,234 en El Archivo')
  })

  it('caps entity doors at three and counts the rest; pattern and case chips link their dossiers', () => {
    const { container, labels } = doors(
      <Conexiones
        lang="en"
        vendors={[1, 2, 3, 4, 5].map((id) => ({ id, name: `Vendor ${id}` }))}
        pattern="P6"
        cases={[{ slug: 'estafa-maestra', name: 'La Estafa Maestra' }]}
        focos={{ to: '/aria/caso/1', label: 'Tier 1 · open the case' }}
      />,
    )
    expect(labels).toEqual(['Top vendors', 'Red Flags', 'Pattern', 'Documented cases'])
    expect(container.querySelectorAll('a[href^="/vendors/"]').length).toBe(3)
    expect(container.textContent).toContain('+2')
    expect(container.querySelector('a[href="/patterns/P6"]')).not.toBeNull()
    expect(container.querySelector('a[href="/cases/estafa-maestra"]')).not.toBeNull()
  })

  it('renders nothing without doors (captura slot absent)', () => {
    const { container } = doors(<Conexiones lang="es" categories={[]} contracts={null} mapa={null} />)
    expect(container.innerHTML).toBe('')
  })
})
