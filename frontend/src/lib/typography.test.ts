import { describe, expect, it } from 'vitest'
import { createElement, Fragment, isValidElement, type ReactElement } from 'react'
import { PROSE, noOrphan, tidy, tidyNodes } from './typography'

const NB = String.fromCharCode(0xa0) // U+00A0 no-break space

describe('typography glue', () => {
  it('glues a dash to the word before it (dash never leads a line), leaves ranges alone', () => {
    expect(tidy('on the table — 56.0% of value', 'en')).toBe(`on${NB}the${NB}table${NB}— 56.0% of${NB}value`)
    expect(tidy('COMPRANET 2002–2025', 'en')).toBe('COMPRANET 2002–2025')
    // prose mode: dash glue only — words and accents stay breakable
    const em = createElement('em', null, '3 contracts')
    const out = tidyNodes(createElement(Fragment, null, 'an aberration — it is the ', em), 'en', PROSE) as unknown[]
    expect(out[0]).toBe(`an aberration${NB}— it is the `)
    expect((out[1] as ReactElement<{ children: string }>).props.children).toBe('3 contracts')
  })

  it('glues Spanish function words to the next word', () => {
    expect(tidy('evitan la licitación de los contratos', 'es')).toBe(`evitan la${NB}licitación de${NB}los${NB}contratos`)
    // English-only words are not glued in Spanish
    expect(tidy('the mesa', 'es')).toBe('the mesa')
  })

  it('glues English articles and prepositions to the next word', () => {
    expect(tidy('One vendor locks a ministry of the state', 'en')).toBe(`One vendor locks a${NB}ministry of${NB}the${NB}state`)
    expect(tidy('Theatre and', 'en')).toBe('Theatre and') // whole words only; no next word
  })

  it('noOrphan joins the last two words, within a 16-char no-break run', () => {
    expect(noOrphan('bypass the bidding.')).toBe(`bypass the${NB}bidding.`)
    expect(noOrphan('one')).toBe('one')
    expect(noOrphan(noOrphan('bypass the bidding.'))).toBe(`bypass the${NB}bidding.`)
    // a function word + one word is still a 2-word stub: it takes one more
    expect(noOrphan(tidy('then lost in the fog', 'en'))).toBe(`then lost${NB}in${NB}the${NB}fog`)
    // the guard measures the whole no-break run, including glue `tidy` already added
    // run too long: the article glue is released so balance can break before the last two words
    expect(noOrphan(tidy('evitan la licitación competitiva.', 'es'))).toBe('evitan la licitación competitiva.')
    expect(noOrphan(tidy('vimos la licitación roja', 'es'))).toBe(`vimos la licitación${NB}roja`)
    expect(noOrphan('x Internacionalización Desconcentrada')).toBe('x Internacionalización Desconcentrada')
  })

  it('keeps accent spans and glues their short phrase whole', () => {
    const span = createElement('span', { style: { color: 'red' } }, 'nine trillion pesos')
    const out = tidyNodes(createElement(Fragment, null, 'The Cash Count: ', span, ' on the table.'), 'en') as unknown[]
    expect(out[0]).toBe(`The${NB}Cash Count: `) // trailing ': ' stays breakable — no lead-in glue after punctuation
    const el = out[1] as ReactElement<{ style: object; children: string }>
    expect(isValidElement(el) && el.type).toBe('span')
    expect(el.props.style).toEqual({ color: 'red' })
    expect(el.props.children).toBe(`nine${NB}trillion${NB}pesos`)
    expect(out[2]).toBe(` on${NB}the${NB}table.`)
  })

  it('long spans keep their element and only glue their first pair; nested spans untouched; lead-in glue only before a whole accent', () => {
    const long = createElement('span', null, 'a phrase that is far too long to glue whole')
    const nested = createElement('span', null, createElement('b', null, 'x y'))
    const out = tidyNodes(['More than ', long, ' and ', nested], 'en') as unknown[]
    expect(out[0]).toBe('More than ') // long accent may wrap — no lead-in glue
    expect((out[1] as ReactElement<{ children: string }>).props.children).toBe(`a${NB}phrase that is far too long to glue whole`)
    expect((out[3] as ReactElement).props).toBe(nested.props)
    // JSX `{' '}` arrives as its own child: merged before gluing
    const stat = createElement('span', null, '7 in 10')
    expect((tidyNodes(['More than', ' ', stat], 'en') as unknown[])[0]).toBe(`More than${NB}`)
  })
})
