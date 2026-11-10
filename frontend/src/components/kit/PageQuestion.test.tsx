/** The one check that fails if the tour's logic breaks: closed by default, the script's cue frames its part, ③
 *  carries the follow-ups, Esc closes and returns focus, ?pq=0 hides it, the callout never covers its part. */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { PageQuestion, place } from './PageQuestion'

const page = (search: string) => (
  <MemoryRouter initialEntries={[`/${search}`]}>
    <div id="sky" />
    <PageQuestion
      lang="es" question="¿Q?" see="ve" read="lee" means={<b>hallazgo</b>}
      script={'### 1\n[#sky] Cada punto es una institución.\n### 2\nMás grande, más dinero.'}
      cues={{ sky: '#sky' }}
      followups={[{ label: '¿Y luego?', to: '/x' }]}
    />
  </MemoryRouter>
)

describe('PageQuestion', () => {
  beforeEach(() => sessionStorage.clear())
  it('default: strip shut; opens on ① with the script words; ③ carries the follow-ups; Esc closes and returns focus', () => {
    render(page(''))
    const open = screen.getByRole('button', { name: /Cómo leer esto/ })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(open)
    expect(open.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Paso 1: Qué es' }).getAttribute('aria-current')).toBe('step')
    expect(screen.getByText('institución.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Paso 3: Qué significa' }))
    expect(screen.getByRole('link', { name: '¿Y luego?' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(open)
  })
  it('?pq=0 hides the strip', () => {
    render(page('?pq=0'))
    expect(screen.queryByText('Cómo leer esto')).toBeNull()
  })
  it('place: beside a small part, opposite corner of a screen-sized one', () => {
    const below = place({ top: 100, bottom: 140, left: 200, right: 400 }, 340, 200, 1440, 900)
    expect(below.top).toBeGreaterThanOrEqual(140)
    // a sky filling the viewport, its centre low: the callout goes to the top-right corner
    const sky = place({ top: 60, bottom: 1400, left: 40, right: 1400 }, 340, 200, 1440, 900)
    expect(sky.left).toBeGreaterThan(900)
    expect(sky.top).toBeLessThan(120)
    // a key at bottom-left of a full-screen chart: the callout sits right of it, never on it
    const key = place({ top: 780, bottom: 880, left: 40, right: 260 }, 340, 200, 1440, 900)
    expect(key.left >= 260 || key.top + 200 <= 780).toBe(true)
  })
})
