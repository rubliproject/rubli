import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PatternDefs, SexenioBands, patUrl } from './Patterns'

describe('kit/patterns', () => {
  it('tints every other term from Fox = 0, clipped to the range', () => {
    const html = renderToStaticMarkup(<svg><SexenioBands x={(y) => (y - 2002) * 10} y={0} height={50} from={2002} to={2025} /></svg>)
    // Calderón 2007–2012 and AMLO 2019–2024; Fox, Peña Nieto, Sheinbaum stay paper
    expect(html.match(/<rect/g)?.length).toBe(2)
    expect(html).toContain('x="50" y="0" width="60"')
    expect(html).toContain('x="170" y="0" width="60"')
  })
  it('a range inside one tinted term gives one band, none inside an untinted one', () => {
    const one = (from: number, to: number) => renderToStaticMarkup(<svg><SexenioBands x={(y) => y} y={0} height={1} from={from} to={to} /></svg>).match(/<rect/g)?.length ?? 0
    expect(one(2008, 2010)).toBe(1)
    expect(one(2014, 2016)).toBe(0)
  })
  it('defs ids match the url a shape uses', () => {
    const html = renderToStaticMarkup(<svg><PatternDefs uid="t" kinds={['sin-dato']} /></svg>)
    expect(html).toContain('id="pat-t-sin-dato"')
    expect(patUrl('t', 'sin-dato')).toBe('url(#pat-t-sin-dato)')
  })
})
