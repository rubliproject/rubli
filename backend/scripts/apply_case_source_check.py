"""Apply the 2026-10-12 source check to the 30 unverified `procurement_scandals` rows.

Input was `_polish/sources/NOTES_SOURCES.md` (+ notes_sources.json): a verdict per
claim. Data below is generated from it, with a WebFetch re-verify pass of the
riskiest sources (figures the fetched pages don't carry were cut; the Goodreads
catalogue page was dropped as a source).

- 18 cases where the scandal is documented: SOURCED claims kept; REWORD claims
  replaced by the sourced Mexican-Spanish text; UNSUPPORTED claims emptied (or
  replaced, when the check found a sourced replacement). `amount_note` /
  `legal_status_note` edits go to the `*_es` column and blank the English one
  (the old English claim is gone; no sourced English text exists yet).
  `sources_json` is replaced by the verified sources only (all had URLs found).
  The fabricated AHMSA «Xavier Lozoya Castro» becomes Alonso Ancira Elizondo
  (sourced); GEDEFENSA (no such entity found) is dropped.
- 12 cases with no evidence the scandal occurred: not rewritten; only an internal
  `legal_status_note` saying not to publish.
Never touches is_verified. Idempotent. Dry run unless --apply; before writing,
the affected rows are backed up to a CSV next to the DB.

    python -m scripts.apply_case_source_check [--db PATH] [--apply]
"""
import argparse
import csv
import json
import sqlite3
from datetime import datetime
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent.parent / "RUBLI_NORMALIZED.db"

NO_EVIDENCE_NOTE = "Sin evidencia verificable (revisión de fuentes 2026-10-12) — no publicar"
RENAME_ACTORS = {("ahmsa-pemex-steel", "Xavier Lozoya Castro"): "Alonso Ancira Elizondo"}
DROP_ACTORS = {("guardia-nacional-sedena-construction", "Grupo Empresarial de la Defensa Nacional (GEDEFENSA)")}
COLS = ("key_actors_json", "sources_json", "amount_note", "amount_note_es",
        "legal_status_note", "legal_status_note_es")

# ── generated from notes_sources.json (_polish/sources/gen/gen_data.py) ──
UNSUPPORTED_CASES = ['cfe-solar-overpricing-amlo',
 'cfe-transmission-overpricing',
 'conagua-ghost-contractor-rotation',
 'conaliteg-printing-monopoly',
 'imss-ghost-company-network',
 'infrastructure-fraud-network',
 'pemex-exploration-subcontract-ring',
 'pgr-witness-protection-fraud',
 'sat-tender-rigging-sixsigma',
 'sedatu-land-registry-fraud',
 'sedena-military-overruns-fox',
 'semar-naval-construction']

EDITS = {'ahmsa-pemex-steel': [(0,
                        'title',
                        'Fundador y expresidente de AHMSA',
                        'Dueño de Altos Hornos de México (AHMSA)'),
                       (0,
                        'note',
                        'Padre de Emilio Lozoya; señalado en proceso FGR',
                        'Alonso Ancira Elizondo firmó un acuerdo reparatorio con Pemex en el caso '
                        'Agronitrogenados.'),
                       (1,
                        'note',
                        'Contratos concentrados de acero para PEMEX Gasoductos y Ductos',
                        'Vendió a Pemex la planta Agronitrogenados en 2014; la FGR sostiene que hubo '
                        'sobreprecio.'),
                       (None,
                        'amount_note',
                        'Steel pipe and infrastructure contracts for PEMEX pipeline networks; billions in '
                        'concentrated awards',
                        'Compra de la planta Agronitrogenados por Pemex (2014); según la defensa de Lozoya, '
                        'Ancira pagó 216 millones de dólares como reparación del daño.'),
                       (None,
                        'legal_status_note',
                        "AHMSA's founder Xavier Lozoya Castro (father of Emilio Lozoya) implicated; company "
                        'in financial difficulties but no criminal conviction',
                        'Alonso Ancira firmó un acuerdo reparatorio; en julio de 2026 un tribunal federal '
                        'ordenó reactivar el proceso penal contra Emilio Lozoya, quien no puede beneficiarse '
                        'de ese acuerdo.')],
 'conacyt-fund-capture': [(0,
                           'note',
                           'Investigada por FGR por abuso de autoridad; captura político-ideológica del '
                           'fondo científico',
                           'La ASF presentó en 2025 una denuncia penal por presunta malversación de unos 57 '
                           'millones de pesos durante su gestión; la FGR abrió una carpeta de investigación. '
                           'Álvarez-Buylla rechazó las acusaciones. En 2022, diputados del PAN la '
                           'denunciaron ante la FGR por presunto tráfico de influencias, abuso de autoridad '
                           'y corrupción.'),
                          (1, 'title', 'Instituciones receptoras de contratos concentrados', ''),
                          (1,
                           'note',
                           'Afines a la corriente ideológica de la 4T; recibieron desproporcionadamente los '
                           'fondos',
                           ''),
                          (None,
                           'amount_note',
                           'Conacyt/Conahcyt research grants and procurement redirected to ideologically '
                           'aligned institutions; estimated MXN 2B diverted from competitive research',
                           'La ASF denunció penalmente presuntas irregularidades por unos 57 millones de '
                           'pesos en pagos a empresas de servicios del Conahcyt.'),
                          (None,
                           'legal_status_note',
                           'FGR investigation of former director María Elena Álvarez-Buylla for abuse of '
                           'authority; ongoing under Sheinbaum',
                           'La FGR abrió una carpeta de investigación tras la denuncia penal de la ASF '
                           '(junio de 2025) por presunta malversación en el extinto Conacyt; en 2022, '
                           'diputados del PAN presentaron una denuncia por abuso de autoridad y tráfico de '
                           'influencias. No se conoce resolución judicial.')],
 'covid-emergency-procurement': [(0, 'title', 'Proveedor de equipo médico de emergencia', ''),
                                 (0, 'note', 'Sin historial en salud; contratos COVID de alto valor', ''),
                                 (1, 'title', 'Intermediario de insumos médicos', ''),
                                 (1,
                                  'note',
                                  'Concentración anómala de contratos de emergencia',
                                  'Concentración de contratos de emergencia según el análisis de RUBLI sobre '
                                  'datos de CompraNet (indicador de riesgo, no hallazgo de autoridad).'),
                                 (2,
                                  'note',
                                  'Procedimientos de emergencia sin licitación',
                                  'Procedimientos de emergencia por adjudicación directa, observados por la '
                                  'ASF en la Cuenta Pública 2020.'),
                                 (None,
                                  'amount_note',
                                  'Conservative estimate of COVID emergency funds diverted through irregular '
                                  'direct awards; total emergency health procurement was 80B+',
                                  ''),
                                 (None,
                                  'legal_status_note',
                                  'SFP and FGR investigations ongoing; procurement waived competition under '
                                  'health emergency decree',
                                  'La ASF formuló observaciones sobre compras de emergencia COVID-19; no se '
                                  'localizaron denuncias penales de la FGR vinculadas a estos proveedores.')],
 'cyber-robotic-it-overpricing': [(0,
                                   'title',
                                   'Proveedor de tecnología',
                                   'Proveedor de equipo médico y tecnológico'),
                                  (0,
                                   'note',
                                   'Contratos TI a precio anomalo; caso de referencia v5.0',
                                   'La SFP la inhabilitó y multó en 2020 por irregularidades en la venta de '
                                   '20 ventiladores con sobreprecio al IMSS en Hidalgo; la empresa negó el '
                                   'sobreprecio.'),
                                  (None,
                                   'amount_note',
                                   '139 IT procurement contracts at significantly above-market prices',
                                   ''),
                                  (None,
                                   'legal_status_note',
                                   'SFP administrative investigation; no criminal charges',
                                   'Sanción administrativa de la SFP (2020): dos inhabilitaciones de 24 y 27 '
                                   'meses y multas por más de 2 millones de pesos. No se encontraron cargos '
                                   'penales.')],
 'decoaro-ghost-cleaning': [(0,
                             'title',
                             'Empresa de limpieza fantasma',
                             'Empresa de limpieza calificada por la ASF como «presunta evasora»'),
                            (0,
                             'note',
                             'Registrada en EFOS SAT; sin instalaciones ni personal real',
                             'Según la ASF, no inscribió al IMSS a 110 trabajadores asignados a la limpieza '
                             'de oficinas públicas; MCCI reportó que su domicilio fiscal era un departamento '
                             'en Iztacalco.'),
                            (None,
                             'amount_note',
                             '46 cleaning and maintenance contracts across multiple federal agencies',
                             'Según MCCI, 23 contratos por 185 millones de pesos en 2019-2020, incluida la '
                             'limpieza de Palacio Nacional.'),
                            (None,
                             'legal_status_note',
                             'SFP investigation for ghost company operation; RFC flagged by SAT as '
                             'non-existent taxpayer',
                             'La ASF la calificó como «presunta evasora» y recomendó al IMSS y al SAT '
                             'auditarla; no se halló registro de investigación de la SFP ni de inclusión en '
                             'listas EFOS.')],
 'edenred-voucher-monopoly': [(0,
                               'title',
                               'Líder del mercado de vales de despensa',
                               'Principal proveedor de vales de despensa del gobierno federal (según El CEO, '
                               '2019)'),
                              (0,
                               'note',
                               '2,939 contratos; ~70% de participación de mercado en vales gubernamentales',
                               '2,939 contratos en COMPRANET (datos RUBLI); según El CEO (2019), Edenred, Sí '
                               'Vale, Toka y Valemex concentraban 95% de los contratos públicos de vales.'),
                              (1, 'title', 'Segundo proveedor de vales', ''),
                              (1, 'note', 'Duopolio con Edenred; ~20% del mercado', ''),
                              (None,
                               'amount_note',
                               '2,939 meal voucher contracts across government agencies; ~90% market share '
                               'in PEMEX/IMSS employee benefits',
                               '2,939 contratos de vales de despensa en dependencias federales (COMPRANET); '
                               'según El CEO, cuatro emisoras concentraron 95% de los contratos públicos del '
                               'rubro desde 2016.'),
                              (None,
                               'legal_status_note',
                               'COFECE reviewed market concentration; regulation allows Edenred/Sodexo '
                               'duopoly in employee benefits sector',
                               '')],
 'estancias-infantiles-sedesol': [(0,
                                   'title',
                                   'Secretaria de SEDESOL 2012-2015',
                                   'Secretaria de Desarrollo Social (dic. 2012 – ago. 2015)'),
                                  (0,
                                   'note',
                                   'Responsable ejecutiva; señalada en múltiples casos de la SEDESOL/SEDATU',
                                   'Titular de Sedesol, dependencia que operaba el programa en ese periodo; '
                                   'no fue señalada personalmente en las auditorías del programa. Fue '
                                   'procesada por la «Estafa Maestra» (caso distinto); el proceso se canceló '
                                   'en 2023.'),
                                  (1,
                                   'title',
                                   'Guarderías subvencionadas (parte fantasma)',
                                   'Estancias infantiles subsidiadas (parte señaladas por el gobierno en '
                                   '2019)'),
                                  (1,
                                   'note',
                                   'Miles de centros sin operaciones reales registrando niños inexistentes',
                                   'Según la Secretaría de Bienestar (2019), con base en supervisiones del '
                                   'DIF, había una diferencia de unos 80,000 niños registrados que no fueron '
                                   'localizados; 4% de las estancias estaba cerrado.'),
                                  (None,
                                   'amount_note',
                                   'Estimated billions in the 10B+ annual program diverted through '
                                   'non-existent or under-operating daycare centers',
                                   'El programa tenía un presupuesto de 4,070 millones de pesos en 2018. La '
                                   'ASF observó anomalías por 69.4 millones (1.8% de los recursos) en 2016.'),
                                  (None,
                                   'legal_status_note',
                                   'Program cancelled by AMLO in 2019; ASF investigations found significant '
                                   'phantom beneficiaries; Rosario Robles implicated (cf. Estafa Maestra '
                                   'case)',
                                   'El gobierno de López Obrador recortó el presupuesto en 2019 y sustituyó '
                                   'el subsidio a estancias por apoyos directos a madres y padres. La ASF '
                                   'señaló irregularidades, pero su titular aclaró que nunca recomendó '
                                   'suspender el programa.')],
 'fovissste-housing-fraud': [(0, 'title', 'Constructoras de vivienda sin operaciones reales', ''),
                             (0,
                              'note',
                              'Recibieron anticipos de FOVISSSTE por desarrollos nunca ejecutados',
                              'Afectados denunciaron viviendas inconclusas y sin servicios entregadas con '
                              'créditos del FOVISSSTE (Guerrero, 2011).'),
                             (None,
                              'amount_note',
                              'Ghost housing developers in FOVISSSTE portfolio collected advance payments '
                              'for homes never built',
                              ''),
                             (None,
                              'legal_status_note',
                              'SFP investigation; FOVISSSTE internal audit; no criminal charges against main '
                              'beneficiaries',
                              'La SFP investigó créditos irregulares otorgados en 2007-2008; en 2012 la '
                              'investigación seguía sin concluir.')],
 'guardia-nacional-sedena-construction': [(0,
                                           'note',
                                           'Construye sin licitación por excepción de seguridad nacional',
                                           'Pagó y es propietaria de los cuarteles de la Guardia Nacional; '
                                           'en noviembre de 2021 el Ejecutivo declaró de interés público y '
                                           'seguridad nacional sus obras de infraestructura, acuerdo que la '
                                           'SCJN invalidó en 2023.'),
                                          (None,
                                           'amount_note',
                                           'SEDENA-controlled construction of GN barracks, airports, and '
                                           'facilities estimated MXN 15B+; most without COMPRANET '
                                           'transparency',
                                           ''),
                                          (None,
                                           'legal_status_note',
                                           'AMLO exempted many SEDENA construction projects from competitive '
                                           'procurement under national security provisions; under review by '
                                           'SHCP',
                                           'En noviembre de 2021 el Ejecutivo publicó un acuerdo que declaró '
                                           'de interés público y seguridad nacional sus obras de '
                                           'infraestructura; la SCJN lo invalidó en mayo de 2023 y el '
                                           'gobierno emitió después un decreto para obras específicas.')],
 'imss-prospera-pharma-bid-rigging': [(0,
                                       'note',
                                       'Coordinación de precios en licitaciones IMSS-Prospera anuales',
                                       'La COFECE sancionó acuerdos colusorios en licitaciones de salud del '
                                       'IMSS e ISSSTE.'),
                                      (None,
                                       'amount_note',
                                       'Annual pharmaceutical procurement for Seguro Popular/IMSS-Prospera '
                                       'with evidence of coordinated pricing',
                                       ''),
                                      (None,
                                       'legal_status_note',
                                       'COFECE investigation for collusive practices; fines issued to some '
                                       'pharmaceutical companies',
                                       'La COFECE multó con 626.5 MDP a 11 empresas y 14 personas por '
                                       'colusión en licitaciones del IMSS e ISSSTE (2020); no se identificó '
                                       'una resolución sobre IMSS-Prospera.')],
 'ipn-cartel-limpieza': [(0,
                          'title',
                          'Proveedor dominante de servicios de limpieza IPN',
                          'Proveedor del servicio integral de limpieza del IPN (contrato 2025–2028, según '
                          'columna de Quadratín)'),
                         (0, 'note', 'Ganador consistente; evidencia de cartel con co-licitantes', ''),
                         (None,
                          'amount_note',
                          '48 cleaning service contracts at the Instituto Politécnico Nacional with evidence '
                          'of coordinated bidding',
                          '48 contratos de servicios de limpieza del IPN en COMPRANET; en 2022 y 2023 hubo '
                          'denuncias públicas de simulación de competencia en licitaciones de limpieza del '
                          'instituto, sin resolución conocida.'),
                         (None,
                          'legal_status_note',
                          'SFP administrative investigation; referred to FGR',
                          'Denuncias presentadas ante la Función Pública y el OIC del IPN (2022–2025); no se '
                          'encontró resolución ni remisión a la FGR.')],
 'issste-ambulance-leasing': [(0,
                               'title',
                               'Proveedor dominante de arrendamiento de ambulancias ISSSTE',
                               'Principal arrendador de ambulancias del ISSSTE, según datos de CompraNet'),
                              (0,
                               'note',
                               'Concentración anómala; tarifas fuera de mercado',
                               'Inhabilitada por la SFP en 2022 por irregularidades en la renta de '
                               'ambulancias al ISSSTE, señaladas en prensa como sobreprecio; recibió una '
                               'segunda inhabilitación de 30 meses en 2023.'),
                              (None,
                               'amount_note',
                               '603 ambulance leasing contracts at rates 2-3x market comparables identified '
                               'by ASF',
                               'La SFP sancionó a la empresa por incumplir el contrato '
                               'AD-CS-DNAF-SRMS-024/2022 de arrendamiento de ambulancias para el ISSSTE; el '
                               'recuento de contratos proviene de datos de CompraNet analizados por RUBLI.'),
                              (None,
                               'legal_status_note',
                               'ASF denuncias; SFP administrative investigation ongoing',
                               'La SFP inhabilitó a la empresa por 45 meses y le impuso una multa de 2.16 '
                               'MDP (2022); la empresa obtuvo una suspensión en amparo; en 2023 el OIC del '
                               'ISSSTE le impuso otra inhabilitación de 30 meses.')],
 'naicm-airport-texcoco': [(0,
                            'note',
                            'Contratos concentrados en pocos consorcios sin transparencia',
                            'La ASF observó irregularidades en 17 procesos de licitación de obras del NAIM '
                            '(Cuenta Pública 2018).'),
                           (1,
                            'title',
                            'Consorcios constructores principales',
                            'Integrantes del consorcio que ganó el edificio terminal (Carso, ICA, Prodemex, '
                            'La Peninsular, Acciona, FCC)'),
                           (None,
                            'amount_note',
                            'Total NAICM budget grew from MXN 120B to MXN 185B+ before cancellation; '
                            'estimated overpricing MXN 15-40B',
                            'En 2018, Javier Jiménez Espriú estimó el costo de la obra en unos 285 mil '
                            'millones de pesos; entre 2014 y mediados de 2018 se registraron 461 '
                            'procedimientos de contratación por 153,769 mdp.'),
                           (None,
                            'legal_status_note',
                            'AMLO cancelled NAICM in 2018; ASF audit found MXN 23B in irregular '
                            'expenditures; ongoing FGR investigation',
                            'El gobierno entrante canceló el proyecto tras la consulta de octubre de 2018. '
                            'La ASF observó 44.1 mdp sin aclarar en tres obras (Cuenta Pública 2018) y '
                            'estimó el costo de la cancelación en 113,327 mdp tras corregir su cifra '
                            'inicial. No se encontró investigación de la FGR.')],
 'pemex-cartel-pipeline-infiltration': [(0,
                                         'title',
                                         'Organizaciones criminales con empresas subcontratistas PEMEX',
                                         'Organizaciones criminales señaladas por robo de combustible a '
                                         'Pemex'),
                                        (0,
                                         'note',
                                         'Front companies en registros de proveedores de PEMEX; habilitaron '
                                         'huachicoleo',
                                         ''),
                                        (1,
                                         'note',
                                         'Controles insuficientes de debida diligencia en subcontratistas',
                                         'Empleados de Pemex han sido señalados como piezas clave del robo '
                                         'de combustible; 123 trabajadores y 12 extrabajadores fueron '
                                         'detenidos entre 2006 y 2015.'),
                                        (2, 'title', 'Investigadores del vínculo crimen-contratistas', ''),
                                        (2,
                                         'note',
                                         'Identificaron empresas vinculadas a carteles en registros PEMEX',
                                         ''),
                                        (None,
                                         'amount_note',
                                         'Security, maintenance, and transportation subcontracts for PEMEX '
                                         'pipeline network awarded to companies controlled or co-opted by '
                                         'organized crime; fuel theft enabled estimated MXN 2B+ annually',
                                         'El robo de combustible a Pemex, impulsado en buena medida por '
                                         'grupos criminales como los Zetas, se estimaba en unos 10,000 '
                                         'barriles diarios a mediados de la década de 2010.'),
                                        (None,
                                         'legal_status_note',
                                         'DEA and SEIDO investigations identified cartel-linked contractors; '
                                         'PEMEX cancelled contracts but no prosecutions of officials who '
                                         'authorized them',
                                         'Entre 2006 y 2015 fueron detenidos 123 empleados y 12 '
                                         'extrabajadores de Pemex por su relación con el robo de '
                                         'combustible; no se encontró documentación de cancelación de '
                                         'contratos con empresas ligadas a cárteles.')],
 'pemex-cotemar': [(0,
                    'note',
                    'Contratista recurrente con cargos inflados detectados en auditoría',
                    'Contratista recurrente de Pemex; la ASF revisó contratos que se le adjudicaron de forma '
                    'directa (Cuentas Públicas 2016 y 2019).'),
                   (None,
                    'amount_note',
                    '51 marine and offshore service contracts with inflated service charges and questionable '
                    'deliverables',
                    ''),
                   (None,
                    'legal_status_note',
                    'PEMEX internal audit findings not escalated to FGR; company continues operating',
                    '')],
 'sagarpa-subsidies-diversion': [(0, 'title', 'Organizaciones fantasma de beneficiarios', ''),
                                 (0,
                                  'note',
                                  'Registradas sin miembros reales para cobrar apoyos PROCAMPO',
                                  'La ASF detectó apoyos a beneficiarios fallecidos y pagos duplicados en '
                                  'programas de SAGARPA.'),
                                 (1,
                                  'note',
                                  'Controles insuficientes que permitieron el desvío sistemático',
                                  'Según la ASF, auditorías de años previos observaron irregularidades '
                                  'recurrentes en la aplicación de subsidios a supuestos beneficiarios.'),
                                 (None,
                                  'amount_note',
                                  'PROCAMPO and SAGARPA subsidy programs diverted through phantom producer '
                                  'organizations over Fox and Calderón administrations',
                                  'Auditorías de la ASF y padrones públicos de PROCAMPO (Fundar, Subsidios '
                                  'al Campo) documentaron apoyos indebidos y concentración de subsidios.'),
                                 (None,
                                  'legal_status_note',
                                  'SEIDO investigations; some low-level prosecutions; main beneficiaries in '
                                  'political parties escaped consequence',
                                  '')],
 'segob-mainbit-it-monopoly': [(0, 'title', 'Proveedor dominante de TI en SEGOB', ''),
                               (0,
                                'note',
                                '604 contratos 2013-2018; acuerdos exclusivos de distribución',
                                'La ASF cuestionó contratos de arrendamiento de equipo de cómputo de Mainbit '
                                'con la CNBV, por los que cobró 246 millones de pesos.'),
                               (None,
                                'amount_note',
                                '604 IT service contracts at SEGOB (Interior Ministry) with near-monopoly '
                                'concentration',
                                ''),
                               (None,
                                'legal_status_note',
                                'COFECE and SFP review of market concentration practices',
                                '')],
 'toka-it-monopoly': [(0,
                       'title',
                       'Proveedor de TI con posición dominante',
                       'Emisora de vales y monederos electrónicos; una de las cuatro empresas que concentran '
                       'los contratos federales de vales'),
                      (0,
                       'note',
                       'Acuerdos exclusivos de distribución; 1,954 contratos 2013-2018',
                       'Según El CEO, obtuvo 139 contratos por 1,985 mdp en los últimos tres años del '
                       'sexenio de Peña Nieto.'),
                      (None,
                       'amount_note',
                       '1,954 IT service contracts across education and governance agencies',
                       'Contratos de vales de despensa y monederos electrónicos con dependencias federales '
                       '(no servicios de TI).'),
                      (None,
                       'legal_status_note',
                       'COFECE investigation for monopolistic practices; administrative proceedings',
                       '')]}

SOURCES = {'ahmsa-pemex-steel': [{'date': '2026-07-23',
                        'outlet': 'EFE / Swissinfo',
                        'title': 'Un tribunal federal ordena reactivar el proceso penal contra el exdirector '
                                 'de Pemex',
                        'type': 'journalism',
                        'url': 'https://www.swissinfo.ch/spa/un-tribunal-federal-ordena-reactivar-el-proceso-penal-contra-el-exdirector-de-pemex/91792831'}],
 'conacyt-fund-capture': [{'date': '2025-10-07',
                           'outlet': 'Uno TV',
                           'title': 'ASF presenta denuncia penal por irregularidades en Conacyt; exdirectora '
                                    'las niega',
                           'type': 'journalism',
                           'url': 'https://www.unotv.com/nacional/asf-presenta-denuncia-penal-por-irregularidades-en-conacyt-exdirectora-las-niega/'},
                          {'date': '2025-10-10',
                           'outlet': 'SDP Noticias',
                           'title': 'Denuncia penal contra María Elena Álvarez-Buylla: esto se sabe del caso',
                           'type': 'journalism',
                           'url': 'https://www.sdpnoticias.com/mexico/denuncia-penal-contra-maria-elena-alvarez-buylla-esto-se-sabe-del-caso/'},
                          {'date': '2022-04-29',
                           'outlet': 'El Financiero',
                           'title': 'Panistas acusan tráfico de influencias en el Conacyt',
                           'type': 'journalism',
                           'url': 'https://www.elfinanciero.com.mx/nacional/2022/04/29/panistas-acusan-trafico-de-influencias-en-el-conacyt/'}],
 'covid-emergency-procurement': [{'date': '2022-02-20',
                                  'outlet': 'Expansión Política',
                                  'title': 'ASF detecta irregularidades por 2,561.2 mdp en el manejo de la '
                                           'pandemia',
                                  'type': 'journalism',
                                  'url': 'https://politica.expansion.mx/mexico/2022/02/20/asf-detecta-irregularidades-por-2-561-2-mdp-en-el-manejo-de-la-pandemia'},
                                 {'date': '',
                                  'outlet': 'Milenio',
                                  'title': 'Diputada del PAN presenta denuncia por compras millonarias del '
                                           'Insabi',
                                  'type': 'journalism',
                                  'url': 'https://www.milenio.com/politica/diputada-pan-presenta-denuncia-compras-millonarias-insabi'}],
 'cyber-robotic-it-overpricing': [{'date': '2020-07-06',
                                   'outlet': 'Expansión Política',
                                   'title': 'La SFP sanciona a la empresa del hijo de Bartlett por la venta '
                                            'de ventiladores',
                                   'type': 'journalism',
                                   'url': 'https://politica.expansion.mx/presidencia/2020/07/06/la-sfp-sanciona-a-la-empresa-del-hijo-de-bartlett-por-la-venta-de-ventiladores'},
                                  {'date': '2020-07-06',
                                   'outlet': 'El Universal (English)',
                                   'title': 'Authorities ban Cyber Robotics Solutions from working with '
                                            'Mexican government',
                                   'type': 'journalism',
                                   'url': 'https://www.eluniversal.com.mx/english/authorities-ban-cyber-robotics-solutions-working-mexican-government/'}],
 'decoaro-ghost-cleaning': [{'date': '2021-11-09',
                             'outlet': 'El Universal',
                             'title': 'Contrata el SAT a empresa evasora',
                             'type': 'journalism',
                             'url': 'https://www.eluniversal.com.mx/nacion/contrata-el-sat-empresa-evasora/'}],
 'edenred-voucher-monopoly': [{'date': '2019-04-29',
                               'outlet': 'El CEO',
                               'title': 'Edenred, Sí Vale, Toka y Valemex acaparan los contratos de vales '
                                        'con el gobierno desde 2016',
                               'type': 'journalism',
                               'url': 'https://elceo.com/politica/edenred-si-vale-toka-y-valemex-acaparan-los-contratos-de-vales-con-el-gobierno-desde-2016/'}],
 'estancias-infantiles-sedesol': [{'date': '2019-02-18',
                                   'outlet': 'Expansión',
                                   'title': 'Estancias infantiles y niños fantasma, entre las fallas que '
                                            'acusa el gobierno',
                                   'type': 'journalism',
                                   'url': 'https://politica.expansion.mx/mexico/2019/02/18/estancias-infantiles-y-ninos-fantasma-entre-las-fallas-que-acusa-el-gobierno'},
                                  {'date': '2019-08',
                                   'outlet': 'Zeta Tijuana (citing Reforma)',
                                   'title': 'Rosario Robles la libra otra vez: pagará 100 mil pesos y un '
                                            'juez le otorga suspensión provisional',
                                   'type': 'journalism',
                                   'url': 'https://zetatijuana.com/2019/08/rosario-robles-la-libra-otra-vez-pagara-100-mil-pesos-y-un-juez-le-otorga-suspension-provisional/'},
                                  {'date': '',
                                   'outlet': 'Excélsior',
                                   'title': 'Rosario Robles firmó solo un contrato irregular: FGR',
                                   'type': 'journalism',
                                   'url': 'https://www.excelsior.com.mx/nacional/rosario-robles-firmo-solo-un-contrato-irregular-fgr/1329883'},
                                  {'date': '2019-02-21',
                                   'outlet': 'Expansión',
                                   'title': 'La Auditoría advierte deficiencias en el programa de estancias '
                                            'infantiles',
                                   'type': 'journalism',
                                   'url': 'https://politica.expansion.mx/mexico/2019/02/21/la-auditoria-advierte-deficiencias-en-el-programa-de-estancias-infantiles'},
                                  {'date': '2019',
                                   'outlet': 'Quadratín',
                                   'title': 'Nada justifica que estancias infantiles dejen de ser '
                                            'subsidiadas: ASF',
                                   'type': 'journalism',
                                   'url': 'https://mexico.quadratin.com.mx/nada-justifica-que-estancias-infantiles-dejen-de-ser-subsidiadas-asf'}],
 'fovissste-housing-fraud': [{'date': '2012-01-13',
                              'outlet': 'La Jornada',
                              'title': 'FOVISSSTE: créditos irregulares y vulnerabilidad del sistema (nota)',
                              'type': 'journalism',
                              'url': 'https://www.jornada.com.mx/2012/01/13/sociedad/045n1soc'},
                             {'date': '2011-06-23',
                              'outlet': 'La Jornada',
                              'title': 'Afectados por viviendas del FOVISSSTE en Guerrero (nota)',
                              'type': 'journalism',
                              'url': 'https://www.jornada.com.mx/2011/06/23/estados/035n2est'}],
 'guardia-nacional-sedena-construction': [{'date': '2021-09-27',
                                           'outlet': 'El Universal (columna de Alejandro Hope, citando a '
                                                     'MCCI)',
                                           'title': 'Guardia Nacional: los costos de la simulación (columna)',
                                           'type': 'journalism',
                                           'url': 'https://www.eluniversal.com.mx/opinion/alejandro-hope/guardia-nacional-los-costos-de-la-simulacion/'},
                                          {'date': '2021-11-22',
                                           'outlet': 'Expansión Política',
                                           'title': 'AMLO declara de seguridad nacional sus proyectos de '
                                                    'infraestructura',
                                           'type': 'journalism',
                                           'url': 'https://politica.expansion.mx/mexico/2021/11/22/amlo-seguridad-nacional-proyectos-de-infraestructura'},
                                          {'date': '2021-09-22',
                                           'outlet': 'Expansión (citando a MCCI)',
                                           'title': '¿En qué gasta su presupuesto la Guardia Nacional? Esto '
                                                    'encontró MCCI',
                                           'type': 'journalism',
                                           'url': 'https://politica.expansion.mx/mexico/2021/09/22/en-que-gasta-su-presupuesto-la-guardia-nacional-esto-encontro-mcci'}],
 'imss-prospera-pharma-bid-rigging': [{'date': '2020-08-10',
                                       'outlet': 'El CEO',
                                       'title': 'Cofece multa a empresas por colusión en licitaciones '
                                                'médicas del IMSS e ISSSTE por 626.5 millones de pesos',
                                       'type': 'journalism',
                                       'url': 'https://elceo.com/negocios/cofece-multa-empresas-por-colusion-en-licitaciones-medicas-del-imss-e-issste-por-626-millones-de-pesos/'}],
 'ipn-cartel-limpieza': [{'date': '2023-08-14',
                          'outlet': 'Quadratín (columna Visión Financiera)',
                          'title': 'Visión financiera (columna de Georgina Howard)',
                          'type': 'journalism',
                          'url': 'https://mexico.quadratin.com.mx/vision-financiera-georgina-howard-474/'},
                         {'date': '2025-09-17',
                          'outlet': 'Quadratín (columna Visión Financiera)',
                          'title': 'Visión financiera (columna de Georgina Howard)',
                          'type': 'journalism',
                          'url': 'https://mexico.quadratin.com.mx/vision-financiera-206/'},
                         {'date': '2022-02-24',
                          'outlet': 'La Razón',
                          'title': 'Piden al OIC del IPN invalidar licitación de servicios de limpieza por '
                                   'irregularidades',
                          'type': 'journalism',
                          'url': 'https://www.razon.com.mx/mexico/piden-oic-ipn-invalide-licitacion-servicios-limpieza-irregularidades-472415'}],
 'issste-ambulance-leasing': [{'date': '2022-11-14',
                               'outlet': 'Eje Central',
                               'title': 'Inhabilitación contra Casanova Vallejo sigue vigente, dice SFP y va '
                                        'por recurso contra amparo',
                               'type': 'journalism',
                               'url': 'https://www.ejecentral.com.mx/inhabilitacion-contra-casanova-vallejo-sigue-vigente-dice-sfp-y-va-por-recurso-contra-amparo'},
                              {'date': '',
                               'outlet': 'Eje Central',
                               'title': 'Pese a estar inhabilitada, Casanova Vallejo recibe millonarios '
                                        'contratos',
                               'type': 'journalism',
                               'url': 'https://www.ejecentral.com.mx/pese-a-estar-inhabilitada-casanova-vallejo-recibe-millonarios-contratos'},
                              {'date': '2023-12-01',
                               'outlet': 'La Razón',
                               'title': 'Revés a Casanova Vallejo: queda inhabilitada para obtener contratos '
                                        'con recursos públicos',
                               'type': 'journalism',
                               'url': 'https://www.razon.com.mx/mexico/2023/12/01/reves-a-casanova-vallejo-queda-inhabilitada-para-obtener-contratos-con-recursos-publicos/'},
                              {'date': '2022-11-08',
                               'outlet': 'Eje Central',
                               'title': 'Licita ISSSTE el arrendamiento de más de 400 ambulancias',
                               'type': 'journalism',
                               'url': 'https://www.ejecentral.com.mx/licita-issste-el-arrendamiento-de-mas-de-400-ambulancias'}],
 'naicm-airport-texcoco': [{'date': '2019-07-02',
                            'outlet': 'Expansión',
                            'title': 'La Auditoría señala pagos duplicados y falta de estudios previos en el '
                                     'NAIM',
                            'type': 'journalism',
                            'url': 'https://expansion.mx/empresas/2019/07/02/la-auditoria-senala-pagos-duplicados-y-falta-de-estudios-previos-en-el-naim'},
                           {'date': '2017-01-06',
                            'outlet': 'Expansión',
                            'title': 'Carso e ICA ganan construcción de terminal del NAICM',
                            'type': 'journalism',
                            'url': 'https://expansion.mx/empresas/2017/01/06/carso-e-ica-ganan-construccion-de-terminal-del-naicm'},
                           {'date': '2018-07-23',
                            'outlet': 'ADN40',
                            'title': 'Equipo de AMLO revisará esta semana el tema del NAICM',
                            'type': 'journalism',
                            'url': 'https://www.adn40.mx/politica/2018-07-23-13-34/equipo-de-amlo-revisara-esta-semana-el-tema-del-naicm/'},
                           {'date': '2021-05',
                            'outlet': 'Zeta Tijuana',
                            'title': 'ASF señala que cancelación del NAICM costó 113 mil mdp',
                            'type': 'journalism',
                            'url': 'https://zetatijuana.com/2021/05/asf-senala-que-cancelacion-del-naicm-costo-113-mil-mdp/'}],
 'pemex-cartel-pipeline-infiltration': [{'date': '2017-05-26',
                                         'outlet': 'InSight Crime',
                                         'title': 'Layers of Corruption Facilitate Fuel Theft in Mexico',
                                         'type': 'journalism',
                                         'url': 'https://insightcrime.org/news/brief/layers-of-corruption-facilitate-fuel-theft-in-mexico/'},
                                        {'date': '',
                                         'outlet': 'InSight Crime',
                                         'title': 'Million-Liter Fuel Find in Zetas Territory Highlights Oil '
                                                  'Theft in Mexico',
                                         'type': 'journalism',
                                         'url': 'https://insightcrime.org/news/brief/million-liter-fuel-find-in-zetas-territory-highlights-oil-theft-in-mexico/'},
                                        {'date': '',
                                         'outlet': 'InSight Crime (citando a VICE News)',
                                         'title': 'Robo de combustible en México, fuente importante de '
                                                  'ingresos de los Zetas',
                                         'type': 'journalism',
                                         'url': 'https://insightcrime.org/noticias/noticias-del-dia/robo-combustible-mexico-fuente-importante-ingresos-zetas'}],
 'pemex-cotemar': [{'date': '',
                    'outlet': 'ASF',
                    'title': 'ASF, Auditoría 2019-0403 (Cuenta Pública 2019): contratos de Pemex con Cotemar',
                    'type': 'audit',
                    'url': 'https://www.asf.gob.mx/Trans/Informes/IR2019b/Documentos/Auditorias/2019_0403_a.pdf'},
                   {'date': '2016-03-14',
                    'outlet': 'Expansión',
                    'title': 'Cotemar confía salir a flote de recorte en Pemex',
                    'type': 'journalism',
                    'url': 'https://expansion.mx/negocios/2016/03/14/cotemar-confia-salir-a-flote-de-recorte-en-pemex'}],
 'sagarpa-subsidies-diversion': [{'date': '2017-11-02',
                                  'outlet': 'El Universal',
                                  'title': 'Irregularidades en Sagarpa de 43 mdp',
                                  'type': 'journalism',
                                  'url': 'https://www.eluniversal.com.mx/nacion/politica/irregularidades-en-sagarpa-de-43-mdp/'},
                                 {'date': '',
                                  'outlet': 'ASF',
                                  'title': 'ASF, Auditoría 2017-0312 (Cuenta Pública 2017): subsidios de '
                                           'SAGARPA',
                                  'type': 'audit',
                                  'url': 'https://www.asf.gob.mx/trans/informes/ir2017c/Documentos/Auditorias/2017_0312_d.pdf'},
                                 {'date': '',
                                  'outlet': 'Fundar',
                                  'title': 'Subsidios al Campo en México (Fundar)',
                                  'type': 'report',
                                  'url': 'https://fundar.org.mx/mexico/pdf/subsidiosalcampo.pdf'},
                                 {'date': '',
                                  'outlet': 'ASF',
                                  'title': 'ASF, Auditoría 2012-0378 (Cuenta Pública 2012): SAGARPA',
                                  'type': 'audit',
                                  'url': 'https://www.asf.gob.mx/Trans/Informes/IR2012i/Documentos/Auditorias/2012_0378_a.pdf'}],
 'segob-mainbit-it-monopoly': [{'date': '2023-02-22',
                                'outlet': 'Vanguardia (citando a la ASF)',
                                'title': 'SAT y la CNBV rentan equipo obsoleto, informa la ASF',
                                'type': 'journalism',
                                'url': 'https://vanguardia.com.mx/noticias/sat-y-la-cnbv-rentan-equipo-obsoleto-informa-la-asf-EB6517547'}],
 'toka-it-monopoly': [{'date': '2019-04-29',
                       'outlet': 'El CEO',
                       'title': 'Edenred, Sí Vale, Toka y Valemex acaparan los contratos de vales con el '
                                'gobierno desde 2016',
                       'type': 'journalism',
                       'url': 'https://elceo.com/politica/edenred-si-vale-toka-y-valemex-acaparan-los-contratos-de-vales-con-el-gobierno-desde-2016/'}]}


def _same_json(a, b):
    return json.loads(a or "[]") == json.loads(b or "[]")


def plan(db: sqlite3.Connection):
    """Yield (id, slug, original row, {col: new value}) for rows that would change; warn on mismatches."""
    for slug in sorted(set(UNSUPPORTED_CASES) | set(EDITS) | set(SOURCES)):
        row = db.execute(f"SELECT id, {', '.join(COLS)} FROM procurement_scandals WHERE slug=?", (slug,)).fetchone()
        if not row:
            print(f"SKIP {slug}: no such case")
            continue
        cur = dict(zip(COLS, row[1:]))
        new = dict(cur)
        if slug in UNSUPPORTED_CASES:
            new["legal_status_note"] = new["legal_status_note_es"] = NO_EVIDENCE_NOTE
        else:
            actors = json.loads(cur["key_actors_json"] or "[]")
            for idx, field, old, text in EDITS.get(slug, []):
                if idx is None:
                    es = field + "_es"
                    if new[field] == old:
                        new[field], new[es] = None, text or None
                    elif not (new[field] is None and new[es] == (text or None)):
                        print(f"SKIP {slug}.{field}: text differs from the checked claim")
                elif idx < len(actors) and actors[idx].get(field) in (old, text):
                    actors[idx][field] = text
                else:
                    print(f"SKIP {slug}[{idx}].{field}: text differs from the checked claim")
            for a in actors:
                a["name"] = RENAME_ACTORS.get((slug, a.get("name")), a.get("name"))
            actors = [a for a in actors if (slug, a.get("name")) not in DROP_ACTORS]
            if json.loads(cur["key_actors_json"] or "[]") != actors:
                new["key_actors_json"] = json.dumps(actors, ensure_ascii=False)
            if not _same_json(cur["sources_json"], json.dumps(SOURCES.get(slug, []))):
                new["sources_json"] = json.dumps(SOURCES.get(slug, []), ensure_ascii=False)
        changes = {c: new[c] for c in COLS if new[c] != cur[c]}
        if changes:
            yield row[0], slug, cur, changes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--apply", action="store_true", help="write (default: dry run)")
    args = ap.parse_args()
    db = sqlite3.connect(args.db)
    changes = list(plan(db))
    for _, slug, _, ch in changes:
        print(f"  {slug}: {', '.join(ch)}")
    print(f"{len(changes)} cases to update")
    if not args.apply or not changes:
        print("dry run — nothing written" if not args.apply else "nothing to do")
        return
    backup = Path(args.db).with_name(f"case_source_check_backup_{datetime.now():%Y%m%d_%H%M%S}.csv")
    with open(backup, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "slug", *COLS])
        w.writerows((i, s, *(cur[c] for c in COLS)) for i, s, cur, _ in changes)
    print(f"backup: {backup}")
    with db:
        for i, _, _, ch in changes:
            db.execute(f"UPDATE procurement_scandals SET {', '.join(f'{c}=?' for c in ch)}, "
                       "last_updated=datetime('now') WHERE id=?", (*ch.values(), i))
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(f"updated {len(changes)} cases")


if __name__ == "__main__":
    main()
