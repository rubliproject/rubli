// docs/NAME_PRESENTATION_2026-10-31.md — real titles/names from the 2026-10-31 survey
// (contracts A–D + comprasmx_contracts, institutions table). Display only.
import { describe, expect, it } from 'vitest'
import { formatContractTitle, presentInstitutionName, rawText, shortenContractName, splitInstitutionState } from '../lib/utils'
import { formatEntityName } from '../lib/entity/format'

describe('formatContractTitle — ALL-CAPS → Spanish sentence case', () => {
  const cases: Array<[string, string]> = [
    ['ADQUISICION DE MATERIAL ELECTRICO Y DE FERRETERIA', 'Adquisición de material eléctrico y de ferretería'],
    ['PROYECTO EJECUTIVO PARA LA CONSTRUCCION DE VIALIDAD INTERTERMINALES', 'Proyecto ejecutivo para la construcción de vialidad interterminales'],
    ['SERVICIO DE LABORATORIOS MEDICOS', 'Servicio de laboratorios médicos'],
    ['DESARROLLO DEL SISTEMA DE INFORMACION MEDICO FINANCIERO (SIMEF) DEL ISSSTE', 'Desarrollo del sistema de información médico financiero (SIMEF) del ISSSTE'],
    ['CONTRATO SA-019GYR002-N180-2011  IMSS CDA 230 11 MEDICAMENTOS', 'Contrato SA-019GYR002-N180-2011  IMSS cda 230 11 medicamentos'],
    ['SERVICIO DE SEGURIDAD Y VIGILANCIA PARA AEROPUERTO INTERNACIONAL DE LA CIUDAD DE MEXICO, S.A. DE C.V.', 'Servicio de seguridad y vigilancia para aeropuerto internacional de la Ciudad de México, S.A. de C.V.'],
    ['LA-019GYR018-N171-2012 / CONTRATO C251684', 'LA-019GYR018-N171-2012 / contrato C251684'],
    ['AA-018TOQ807-N44-2012 DOTACION DE UTILES DE LIMPIEZA PARA PERSONAL DE CAMPO ZONA TULANCINGO', 'AA-018TOQ807-N44-2012 dotación de útiles de limpieza para personal de campo zona tulancingo'],
    ['CONSTRUCCION DE 0+123, CAMBIO DE AISLAMIENTO Y RECALIBRADO DE 1+464 KM DE LINEA', 'Construcción de 0+123, cambio de aislamiento y recalibrado de 1+464 km de línea'],
    ['C.T. CARBON II 500464124', 'C.T. carbon II 500464124'],
    ['OBRA CIVIL Y SUMINISTRO PARA LA ESTACION DE BOMBEO NUEVA CASTILLA III, EN EL MUNICIPIO DE  APODACA, N.L.', 'Obra civil y suministro para la estación de bombeo nueva castilla III, en el municipio de  apodaca, N.L.'],
    ['ADJUDICACIÓN DIRECTA PARA LA ADQUISICIÓN DE "MEDICAMENTOS" FOL. 338, 339 Y 349  COVID-19', 'Adjudicación directa para la adquisición de "medicamentos" fol. 338, 339 y 349  COVID-19'],
    ['SERVICIO DE MANTENIMIENTO PREVENTIVO Y/O CORRECTIVO A UNIDADES VEHICULARES CON MOTORES A GASOLINA.', 'Servicio de mantenimiento preventivo y/o correctivo a unidades vehiculares con motores a gasolina.'],
    ['CONSTRUCCIÓN DE 4 REDES DE DISTRIBUCIÓN EN EL MUNICIPIO DE SAN FELIPE TEJALAPAM, EN EL ESTADO DE OAXACA.', 'Construcción de 4 redes de distribución en el municipio de san felipe tejalapam, en el estado de Oaxaca.'],
    ['REPARACIÓN TOTAL DE PUENTE, CALLE PRINCIPAL CRUCE CON RÍO, PARÁS, NUEVO LEÓN.', 'Reparación total de puente, calle principal cruce con río, parás, Nuevo León.'],
    ['APLICACION DE PINTURA, SELLADO Y TRABAJOS COMPLEMENTARIOS EN EL AEROPUERTO INTERNACIONAL DE CHETUMAL, QUINTANA ROO', 'Aplicación de pintura, sellado y trabajos complementarios en el aeropuerto internacional de Chetumal, Quintana Roo'],
    ['FRAXIPARINE 2 850 U.I. 3 ML. (NADROPARINA)', 'Fraxiparine 2 850 U.I. 3 ml. (nadroparina)'],
    ['REGENERACION DE LA 2DA ETAPA DE LA CALLE INTEGRAL BUGAMBILIAS COL VISTA BELLA', 'Regeneración de la 2da etapa de la calle integral bugambilias col vista bella'],
    ['SERVICIO DE PRODUCCION DE 2018 DOVELAS EN ESTACIONES DEL METRO CDMX', 'Servicio de producción de 2018 dovelas en estaciones del metro CDMX'],
    ['ARNESES CFE TRN DDN 2011 (500404292)', 'Arneses CFE TRN DDN 2011 (500404292)'],
    ['SERVICIO DE VIGILANCIA, SEGURIDAD Y CONTROL DE ACCESO EN EL RECINTO PORTUARIO DE COATZACOALCOS, VERACRUZ.', 'Servicio de vigilancia, seguridad y control de acceso en el recinto portuario de Coatzacoalcos, Veracruz.'],
    ['MANTENIMIENTO AL SISTEMA ELECTRICO, SUBESTACIONES Y ALUMBRADO EN EL RECINTO PORTUARIO DE LÁZARO CÁRDENAS, MICH.', 'Mantenimiento al sistema eléctrico, subestaciones y alumbrado en el recinto portuario de lázaro cárdenas, MICH.'],
    ['SUPERVISION Y CONTROL DE OBRA DE LA UMF CON UMAA EN HERMOSILLO, SON.', 'Supervisión y control de obra de la UMF con umaa en Hermosillo, son.'],
    ['SERVICIO MÉDICO SUBROGADO DE ANATOMÍA PATOLÓGICA PARA EL HGZ #2 HERMOSILLO', 'Servicio médico subrogado de anatomía patológica para el HGZ #2 Hermosillo'],
    ['SERVICIOS PROFESIONALES PARA LA ASESORÍA FISCAL, FINANCIERA Y CONTABLE PARA LOS', 'Servicios profesionales para la asesoría fiscal, financiera y contable para los'],
    ['ESCUELA PRIMARIA "REYES AZTECAS", CCT 15DPR1477Q', 'Escuela primaria "reyes aztecas", CCT 15DPR1477Q'],
    ['CONSERVACION PERIODICA META 4.0 KM LIBRAMIENTO SURPONIENTE, QUERETARO', 'Conservación periódica meta 4.0 km libramiento surponiente, Querétaro'],
    ['CPT KM 16+000 AL 18+000 EN EL ESTADO DE QRO', 'CPT km 16+000 al 18+000 en el estado de QRO'],
    ['TRABAJOS EMERGENTES CONSISTENTES EN REMOCIÓN DE DERRUMBES, QRO', 'Trabajos emergentes consistentes en remoción de derrumbes, QRO'],
    ['SUMINISTRO DE MEDICAMENTOS PSICOTROPICOS Y ESTUPEFACIENTES PARA EL IMSS', 'Suministro de medicamentos psicotrópicos y estupefacientes para el IMSS'],
    ['MATERIAL DE CURACION', 'Material de curación'],
    ['ADQUISICION DE EQUIPO MEDICO Y DE LABORATORIO, FASE II', 'Adquisición de equipo médico y de laboratorio, fase II'],
    ['SERVICIO DE LAVANDERIA HOSPITALARIA', 'Servicio de lavandería hospitalaria'],
    ['MANTENIMIENTO A LA RED DE ENERGIA ELECTRICA EN BAJA TENSION', 'Mantenimiento a la red de energía eléctrica en baja tensión'],
    ['LA-012M7B997-E12-2024', 'LA-012M7B997-E12-2024'],
    ['ADQUISICIóN DE MATERIAL', 'Adquisición de material'],
    ['SERVICIO DE DRAGADO EN ASIPONA COATZACOALCOS, VERACRUZ', 'Servicio de dragado en ASIPONA Coatzacoalcos, Veracruz'],
    ['HOSPITAL GENERAL DE TIZAYUCA', 'Hospital general de Tizayuca'],
    ['PAVIMENTACION EN MONTERREY, NUEVO LEON', 'Pavimentación en Monterrey, Nuevo León'],
    ['CALLE BELISARIO DOMINGUEZ', 'Calle Belisario Domínguez'], // SQLite UPPER() left the ó lowercase
  ]
  it.each(cases)('%s', (raw, want) => {
    expect(formatContractTitle(raw)).toBe(want)
  })

  it('leaves mixed-case titles untouched', () => {
    for (const t of ['Vigilancia, custodia y seguridad portuaria', 'Servicio de Agencia de viajes', 'Suministro de papelería IMSS']) {
      expect(formatContractTitle(t)).toBe(t)
    }
  })

  it('rawText returns the source text the normaliser kept, for exports', () => {
    expect(rawText({ title: 'Material de curación', title_raw: 'MATERIAL DE CURACION' }, 'title')).toBe('MATERIAL DE CURACION')
    expect(rawText({ title: 'Ya mixto' }, 'title')).toBe('Ya mixto')
    expect(rawText({}, 'title')).toBe('')
  })

  it('is idempotent and null-safe', () => {
    const once = formatContractTitle('ADQUISICION DE MATERIAL DE CURACION')
    expect(formatContractTitle(once)).toBe(once)
    expect(formatContractTitle(null)).toBe('')
  })

  it('shortenContractName keeps siglas and a mixed-case title\'s own casing', () => {
    expect(shortenContractName('SERVICIO DE LIMPIEZA PARA EL INSTITUTO MEXICANO DEL SEGURO SOCIAL EN OAXACA', Infinity))
      .toBe('Limpieza para el IMSS en Oaxaca')
    expect(shortenContractName('Servicio de limpieza en el Hospital Juárez', Infinity)).toBe('Limpieza en el Hospital Juárez')
  })
})

describe('presentInstitutionName — state prefix → «· Estado» qualifier', () => {
  const cases: Array<[string, string]> = [
    ['JAL-Secretaría de Planeación, Administración y Finanzas', 'Secretaría de Planeación, Administración y Finanzas · Jalisco'],
    ['MICH-Secretaría de Salud', 'Secretaría de Salud · Michoacán'],
    ['PUE-Presidencia Municipal de Tlacotepec de Benito Juárez', 'Presidencia Municipal de Tlacotepec de Benito Juárez · Puebla'],
    ['MEX-Presidencia Municipal de Tlalnepantla de Baz', 'Presidencia Municipal de Tlalnepantla de Baz · Estado de México'],
    ['NL-Servicios de Salud de Nuevo León, O.P.D.', 'Servicios de Salud de Nuevo León, O.P.D. · Nuevo León'],
    ['CDMX-Secretaría del Medio Ambiente', 'Secretaría del Medio Ambiente · Ciudad de México'],
    ['TAMPS-Secretaría de Obras Públicas', 'Secretaría de Obras Públicas · Tamaulipas'],
    ['BCS-Instituto Sudcaliforniano de la Infraestructura Física Educativa', 'Instituto Sudcaliforniano de la Infraestructura Física Educativa · Baja California Sur'],
    ['SLP-Sistema para el Desarrollo Integral de la Familia', 'Sistema para el Desarrollo Integral de la Familia · San Luis Potosí'],
    ['YUC-IDEFEY', 'IDEFEY · Yucatán'],
    ['DGO-AGUAS DEL MUNICIPIO DE DURANGO', 'Aguas del Municipio de Durango · Durango'],
    ['SIN-JUNTA DE AGUA POTABLE Y ALCANTARILLADO DE AHOME', 'Junta de Agua Potable y Alcantarillado de Ahome · Sinaloa'],
    ['DGO- Organismo de Agua y Alcantarillado de Nuevo Ideal', 'Organismo de Agua y Alcantarillado de Nuevo Ideal · Durango'],
    ['OAX-Secretaría de las Culturas y Artes de Oaxaca', 'Secretaría de las Culturas y Artes de Oaxaca · Oaxaca'],
    ['QRO-Oficialía Mayor', 'Oficialía Mayor · Querétaro'],
    // federal: not a state code → unchanged apart from casing
    ['Pemex-Refinación', 'Pemex-Refinación'],
    ['XE-IPN Canal 11', 'XE-IPN Canal 11'],
    ['INSTITUTO MEXICANO DEL SEGURO SOCIAL', 'Instituto Mexicano del Seguro Social'],
    ['IMSS', 'IMSS'],
    ['H. AYUNTAMIENTO CONSTITUCIONAL DE CENTLA, TABASCO', 'H. Ayuntamiento Constitucional de Centla, Tabasco'],
  ]
  it.each(cases)('%s', (raw, want) => {
    expect(presentInstitutionName(raw)).toBe(want)
  })

  it('is idempotent (the API interceptor and formatEntityName both run it)', () => {
    const once = presentInstitutionName('JAL-Secretaría de Salud')
    expect(presentInstitutionName(once)).toBe(once)
    expect(formatEntityName('institution', once, 'full')).toBe('Secretaría de Salud · Jalisco')
  })

  it('splits the qualifier back out for the quieter rendering', () => {
    expect(splitInstitutionState('Secretaría de Salud · Jalisco')).toEqual({ name: 'Secretaría de Salud', state: 'Jalisco' })
    expect(splitInstitutionState('JAL-Secretaría de Salud')).toEqual({ name: 'Secretaría de Salud', state: 'Jalisco' })
    expect(splitInstitutionState('Pemex-Refinación')).toEqual({ name: 'Pemex-Refinación', state: null })
  })

  it('prints the whole name with its state at every size — never «…» (owner 11-07)', () => {
    const md = formatEntityName('institution', 'OAX-Secretaría de las Infraestructuras y el Ordenamiento Territorial Sustentable', 'md')
    expect(md.includes('…')).toBe(false)
    expect(md.endsWith(' · Oaxaca')).toBe(true)
    expect(md.startsWith('Secretaría de las Infraestructuras')).toBe(true)
  })
})

describe('presentInstitutionName — legal suffixes', () => {
  it('keeps «A.C.» (asociación civil) in capitals', () => {
    expect(presentInstitutionName('INSTITUTO POTOSINO DE INVESTIGACION CIENTIFICA Y TECNOLOGICA, A.C.')).toMatch(/, A\.C\.$/)
  })
})
