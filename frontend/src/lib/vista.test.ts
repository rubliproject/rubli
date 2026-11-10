import { afterEach, describe, expect, it } from 'vitest'
import { ATLAS_PINS_KEY, cieloHref, cieloToLista, listaToCielo, readListaPin, selectionKey, switchVista, vistaOf, type ManifestLite } from './vista'
import { PINS_KEY, navigateQuery, writeSearch } from './atlas/sky/url-state'

// IMSS (251) in salud (1); a raw id 9001 canonicalised onto 251; CFE (311) in energia (4).
const MANIFEST: ManifestLite = {
  stars: { id: [251, 311], sector: [1, 4] },
  inst_map: { raw: [9001], canon: [251] },
}

describe('vistaOf / cieloHref', () => {
  it('reads the view and builds the sky address with the params kept', () => {
    expect(vistaOf('')).toBe('cielo')
    expect(vistaOf('?vista=cifras')).toBe('lista')
    expect(vistaOf('?s=salud')).toBe('lista')
    expect(vistaOf('?vista=lista&s=salud')).toBe('lista')
    expect(vistaOf('?vista=cielo')).toBe('cielo')
    expect(vistaOf('?vista=vinculos')).toBe('cielo')
    expect(cieloHref('?lens=sectors&year=2020')).toBe('/mapa?vista=vinculos&lens=sectors&year=2020')
    expect(cieloHref({ vuelo: 'imss', n: null })).toBe('/mapa?vista=vinculos&vuelo=imss')
    expect(cieloHref('?vista=cielo&star=1')).toBe('/mapa?vista=vinculos&star=1')
  })
})

describe('translation (spec § 3)', () => {
  it('Lista → Cielo', () => {
    expect(listaToCielo('s=salud').toString()).toBe('lens=sectors&pin=1')
    expect(listaToCielo('s=salud&i=251').toString()).toBe('star=251')
    expect(listaToCielo('s=salud&i=251&v=29277&c=5').toString()).toBe('star=251&planet=29277&moon=5')
    expect(listaToCielo('lens=risk').toString()).toBe('')
  })

  it('Cielo → Lista', () => {
    expect(cieloToLista('star=311', MANIFEST).toString()).toBe('s=energia&i=311')
    expect(cieloToLista('star=9001&planet=48&moon=7', MANIFEST).toString()).toBe('s=salud&i=9001&v=48&c=7')
    expect(cieloToLista('trail=h~g4', MANIFEST).toString()).toBe('s=energia')
    expect(cieloToLista('lens=sectors&pin=1', MANIFEST).toString()).toBe('s=salud')
    expect(cieloToLista('star=251', null).toString()).toBe('')
    expect(cieloToLista('star=77', MANIFEST).toString()).toBe('')
  })

  it('round-trips a position', () => {
    for (const lista of ['s=salud&i=251', 's=salud&i=251&v=29277', 's=salud&i=251&v=29277&c=5']) {
      expect(cieloToLista(listaToCielo(lista).toString(), MANIFEST).toString()).toBe(lista)
    }
    expect(selectionKey('cielo', 'star=251&cam=1,2,3&period=amlo')).toBe(selectionKey('cielo', 'star=251'))
  })
})

describe('switchVista + stash', () => {
  it('a bare switch is a bare sky (the first-visit flight may run)', () => {
    const r = switchVista('cielo', '?vista=cifras', {})
    expect(r.search).toBe('?vista=vinculos')
    expect(r.stash).toEqual({ lista: '' })
  })

  it('there and back restores both views whole', () => {
    const a = switchVista('cielo', '?s=salud&i=251&v=29277', {}, { manifest: MANIFEST })
    expect(a.search).toBe('?vista=vinculos&star=251&planet=29277')
    // the sky moved the camera and set a period; same planet
    const sky = '?vista=vinculos&cam=1.0,2.0,3&star=251&planet=29277&period=amlo&pins=s311'
    const b = switchVista('lista', sky, a.stash, { manifest: MANIFEST })
    expect(b.search).toBe('?vista=cifras&s=salud&i=251&v=29277')
    expect(b.stash.cielo).toBe('cam=1.0%2C2.0%2C3&star=251&planet=29277&period=amlo&pins=s311')
    const c = switchVista('cielo', b.search, b.stash, { manifest: MANIFEST })
    expect(c.search).toBe('?vista=vinculos&cam=1.0%2C2.0%2C3&star=251&planet=29277&period=amlo&pins=s311')
  })

  it('a moved selection keeps the stashed period / year / pins, not the camera', () => {
    const stash = { cielo: 'cam=1,2,3&star=251&period=amlo&yr=2020&pins=s311' }
    const r = switchVista('cielo', '?s=energia&i=311', stash)
    expect(r.search).toBe('?vista=vinculos&star=311&period=amlo&yr=2020&pins=s311')
    const l = switchVista('lista', '?vista=cielo&star=311', { lista: 's=salud&lens=risk' }, { manifest: MANIFEST })
    expect(l.search).toBe('?vista=cifras&s=energia&i=311&lens=risk')
  })

  it('appends the Lista pin to the sky pins (session mirror wins as the base)', () => {
    const r = switchVista('cielo', '?vista=cifras', {}, { listaPin: { i: 251, v: 48 }, sessionPins: 's311' })
    expect(r.pins).toBe('s311~s251.p48')
    expect(r.search).toBe('?vista=vinculos&pins=s311~s251.p48'.replace('~', '%7E'))
    expect(switchVista('cielo', '?vista=cifras', {}, { listaPin: { i: 251 }, sessionPins: 's251' }).pins).toBe('s251')
  })
})

describe('storage glue', () => {
  afterEach(() => { window.localStorage.clear(); window.sessionStorage.clear() })

  it('the pin mirror key matches the sky', () => expect(ATLAS_PINS_KEY).toBe(PINS_KEY))

  it('reads the Lista pin path', () => {
    window.localStorage.setItem('rubli_explore_pin_v1', JSON.stringify([
      { level: 0, kind: 'system' }, { level: 1, kind: 'sector', sectorId: 1 },
      { level: 2, kind: 'institution', institutionId: 251 }, { level: 3, kind: 'vendor', vendorId: 48 },
    ]))
    expect(readListaPin()).toEqual({ i: 251, v: 48 })
  })
})

describe('sky writes keep vista (spec § 7 risk 1)', () => {
  it('navigateQuery and writeSearch carry vista (canonical and alias)', () => {
    window.history.replaceState(null, '', '/mapa?vista=vinculos&star=251')
    navigateQuery('?star=311', true)
    expect(window.location.search).toBe('?vista=vinculos&star=311')
    writeSearch({ vuelo: 'imss' })
    expect(new URLSearchParams(window.location.search).get('vista')).toBe('vinculos')
    window.history.replaceState(null, '', '/mapa?vista=cielo')
    navigateQuery('?star=311', false)
    expect(window.location.search).toBe('?vista=cielo&star=311')
    window.history.replaceState(null, '', '/mapa')
    navigateQuery('?star=311', false)
    expect(window.location.search).toBe('?star=311')
  })
})

describe('La Trama tab (merge § 5)', () => {
  it('parses tab=trama[.N] and nothing else', async () => {
    const { parseSkyQuery, tramaOf } = await import('./atlas/sky/url-state')
    expect(parseSkyQuery('?tab=trama').tab).toBe('trama')
    expect(parseSkyQuery('?tab=trama.333').tab).toBe('trama.333')
    expect(parseSkyQuery('?tab=trama.x').tab).toBeNull()
    expect(tramaOf('trama')).toEqual({ comm: null })
    expect(tramaOf('trama.333')).toEqual({ comm: 333 })
    expect(tramaOf('dial')).toBeNull()
    expect(cieloHref({ tab: 'trama.333' })).toBe('/mapa?vista=vinculos&tab=trama.333')
  })
})
