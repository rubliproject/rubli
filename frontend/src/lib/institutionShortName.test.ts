import { describe, expect, it } from 'vitest'
import { compactInstitutionName, institutionShortName } from './institutionShortName'

// Real long buyer names from the DB (institutions, 2026-11-03), before → after.
const CASES: Array<[string, string]> = [
  // (1)/(2) siglas: published acronyms, never invented initials
  ['INSTITUTO POTOSINO DE INVESTIGACIÓN CIENTÍFICA Y TECNOLÓGICA, A.C.', 'IPICyT'],
  ['Administración del Sistema Portuario Nacional Guaymas, S.A. de C.V.', 'ASIPONA Guaymas'],
  ['LABORATORIOS DE BIOLÓGICOS Y REACTIVOS DE MÉXICO, S. A. DE C. V.', 'BIRMEX'],
  ['GTO-Universidad de Guanajuato', 'UG'],
  ['Comisión Nacional Forestal Organismo Público Descentralizado', 'CONAFOR'],
  ['COMISIÓN NACIONAL PARA LA PROTECCIÓN Y DEFENSA DE LOS USUARIOS DE SERVICIOS FINANCIEROS', 'CONDUSEF'],
  ['INSTITUTO MEXICANO DEL PETRÓLEO', 'IMP'],
  // (3) compaction: boilerplate dropped, standard abbreviations, nothing invented
  ['INSTITUTO PARA LA CONSTRUCCIÓN, EQUIPAMIENTO, MANTENIMENTO Y REHABILITACIÓN  DE ESCUELAS DE YUCATÁN', 'Inst. para la Construcción, Equipamiento, Mantenimento y Rehabilitación de Escuelas de Yucatán'],
  ['FIDEICOMISO DE FORMACIÓN Y CAPACITACIÓN PARA EL PERSONAL DE LA MARINA MERCANTE NACIONAL', 'Fid. de Formación y Capacitación para el Personal de la Marina Mercante Nacional'],
  ['SECRETARÍA DE PLANEACIÓN URBANA E INFRAESTRUCTURA DEL ESTADO DE BAJA CALIFORNIA SUR', 'Sría. de Planeación Urbana e Infraestructura del Edo. de Baja California Sur'],
  ['SECRETARÍA DE COMUNICACIONES, ASENTAMIENTOS Y OBRAS PÚBLICAS DEL ESTADO DE TABASCO', 'Sría. de Comunicaciones, Asentamientos y Obras Públicas del Edo. de Tabasco'],
  ['COLEGIO DE ESTUDIOS CIENTÍFICOS Y TECNOLÓGICOS DEL ESTADO DE GUANAJUATO', 'Colegio de Estudios Científicos y Tecnológicos del Edo. de Guanajuato'],
  ['COORDINACIÓN NACIONAL DEL PROGRAMA DE DESARROLLO HUMANO OPORTUNIDADES', 'Coord. Nacional del Programa de Desarrollo Humano Oportunidades'],
  ['PATRONATO DE OBRAS E INSTALACIONES DEL INSTITUTO POLITÉCNICO NACIONAL', 'Patronato de Obras e Instalaciones del Inst. Politécnico Nacional'],
  ['SERVICIOS DE AGUA POTABLE Y ALCANTARILLADO DEL ESTADO DE TABASCO', 'Servicios de Agua Potable y Alcantarillado del Edo. de Tabasco'],
  ['FIDEICOMISO PARA LA CINETECA NACIONAL', 'Fid. para la Cineteca Nacional'],
  ['UNIVERSIDAD AUTÓNOMA AGRARIA ANTONIO NARRO', 'Univ. Autónoma Agraria Antonio Narro'],
  ['HOSPITAL GENERAL DR. MANUEL GEA GONZÁLEZ', 'Hosp. General Dr. Manuel Gea González'],
  // short names stay whole; a state prefix becomes the «· Estado» tail
  ['SERVICIOS DE SALUD DE MORELOS', 'Servicios de Salud de Morelos'],
  ['GOBIERNO DEL ESTADO DE SONORA', 'Gob. del Edo. de Sonora'],
  ['JAL-Secretaría de Salud', 'Secretaría de Salud · Jalisco'],
]

describe('institutionShortName', () => {
  it.each(CASES)('%s → %s', (raw, short) => {
    const r = institutionShortName(raw)
    expect(r.short).toBe(short)
    expect(r.full.length).toBeGreaterThanOrEqual(r.short.length) // the full name always rides along
  })
  it('prefers the data: siglas, then short_name, then the map', () => {
    expect(institutionShortName('INSTITUTO MEXICANO DEL SEGURO SOCIAL', 'IMSS')).toMatchObject({ short: 'IMSS', isSiglas: true })
    expect(institutionShortName('SERVICIOS DE SALUD DE MORELOS', null, 'SS Morelos')).toMatchObject({ short: 'SS Morelos', isSiglas: false })
    expect(institutionShortName('INSTITUTO MEXICANO DEL PETRÓLEO', 'IMP-DB', 'x').short).toBe('IMP-DB')
  })
  it('drops boilerplate and collapses a repeated state', () => {
    expect(compactInstitutionName('Órgano Desconcentrado de Prevención y Readaptación Social')).toBe('Prevención y Readaptación Social')
    expect(compactInstitutionName('Exportadora Ejemplo, S.A. de C.V.')).toBe('Exportadora Ejemplo')
    expect(compactInstitutionName('Servicios de Salud del Estado de Puebla del Estado de Puebla')).toBe('Servicios de Salud del Edo. de Puebla')
  })
})
