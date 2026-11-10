/**
 * Atlas flights — the three narratives «El Atlas» flies the reader through.
 * Spec .claude/designs/atlas-2026-10-02-spec.md §3.11 (NYT camera-follows-narrative).
 *
 * Each chapter is a waypoint over the sky: `at` names the star system the camera
 * frames (canonical institution id), the planet the chapter is about and the
 * sexenio wedge that is lit. Targets were chosen by data lookup on
 * /atlas/sky/system (layout 2026-10-02): every planet named here is a drawn,
 * ranking-safe body of its host. At run time the compiler checks again against
 * the host's `ranked` list, so a body that later becomes withheld is never a
 * focal target or a name: the camera keeps the star frame and names nothing.
 *
 * No typed figures. A chapter's number comes from `stat` through the
 * flight-stats registry (lib/atlas/flight-stats.ts); a body may carry a `{stat}`
 * token that renders the same live value. If the figure cannot be fetched the
 * card says «Cifra no disponible · fuente: …». Prose was fact-passed against
 * the Story Days long-forms (el-monopolio-invisible, la-industria-del-intermediario)
 * and the case record /cases/estafa-maestra.
 */
import type { PeriodKey } from '@/lib/atlas/sky/url-state'
import type { StatRef } from '@/lib/atlas/flight-stats'

type Bi = { en: string; es: string }

export interface FlightAt {
  /** canonical institution id of the star system the camera frames */
  star?: number
  /** sector disc id, when the chapter frames a sector rather than a star */
  sector?: number
  /** the chapter's focal planet (vendor id), ringed and listed */
  planet?: number
  /** further planets of the same system to ring and list */
  highlight?: number[]
  /** the lit sexenio wedge (ADMINISTRATION_KEYS) */
  period: PeriodKey | null
}

export interface StoryChapter {
  id: string
  /** 1-indexed chapter number for display. */
  number: number
  yearLabel: Bi
  title: Bi
  /** 2–3 sentences; may contain one `{stat}` token. */
  body: Bi
  /** the chapter's live figure (registry key + params) and its caption */
  stat?: StatRef & { caption: Bi }
  at: FlightAt
  /** Milliseconds to dwell on this chapter before auto-advancing. */
  dwellMs: number
}

export interface Story {
  id: string
  title: Bi
  subtitle: Bi
  blurb: Bi
  duration: string
  /** accent hex for chapter rules (applied through style, never className) */
  accent: string
  chapters: StoryChapter[]
  closing: { headline: Bi; body: Bi }
  /** the /stories/:slug long-form this flight is the trailer for */
  longformSlug?: string
}

/** IMSS's four largest planets (data lookup, 2026-10-02): Grupo Fármacos Especializados, Maypo, PISA, Dimesa (vendor 13885). */
const FOUR = [29277, 2873, 4335, 13885]
const IMSS = 251

// ─────────────────────────────────────────────────────────────────────────────
// CONCENTRATION IN IMSS MEDICINE PURCHASING — 6 chapters (trailer for /stories/el-monopolio-invisible)
// ─────────────────────────────────────────────────────────────────────────────
const IMSS_MEDICINES: Story = {
  id: 'imss_medicines',
  title: { en: 'Concentration in IMSS Medicine Purchasing', es: 'Concentración en las compras de medicamentos del IMSS' },
  subtitle: {
    en: 'How four distributors came to dominate Mexico\'s largest public buyer. And what the data showed before anyone acted.',
    es: 'Cómo cuatro distribuidoras llegaron a dominar al mayor comprador público de México. Y lo que los datos mostraban antes de que alguien actuara.',
  },
  blurb: {
    en: '6 chapters · the captive market → the consolidation → the 2019 veto → COVID → what persists',
    es: '6 capítulos · el mercado cautivo → la consolidación → el veto de 2019 → COVID → lo que persiste',
  },
  duration: '~60s',
  accent: '#dc2626',
  chapters: [
    {
      id: 'before',
      number: 1,
      yearLabel: { en: '2010–2013', es: '2010–2013' },
      title: { en: 'A Captive Market', es: 'Un mercado cautivo' },
      body: {
        en: 'IMSS is the largest buyer in the whole register. It is the biggest agency on this map. Federal drug buying runs through a handful of public health institutions. In the early 2010s, many distributors still competed for its contracts. That picture was about to change.',
        es: 'El IMSS es el mayor comprador de todo el registro. Es la dependencia más grande de este mapa. La compra federal de medicamentos pasa por un puñado de instituciones públicas de salud. A inicios de la década de 2010, muchos distribuidores aún competían por sus contratos. Ese panorama estaba por cambiar.',
      },
      stat: {
        key: 'star.value', params: { inst: IMSS },
        caption: { en: 'recorded at IMSS, 2002–2025 · the largest agency on the map', es: 'registrados en el IMSS, 2002–2025 · la dependencia más grande del mapa' },
      },
      at: { star: IMSS, period: 'calderon' },
      dwellMs: 9000,
    },
    {
      id: 'consolidation',
      number: 2,
      yearLabel: { en: '2014–2017', es: '2014–2017' },
      title: { en: 'The Consolidation', es: 'La Consolidación' },
      body: {
        en: 'Four distributors are the four largest suppliers of IMSS. They are Grupo Fármacos Especializados, Farmacéuticos Maypo, Laboratorios PISA and Distribuidora Internacional de Medicamentos y Equipo Médico (Dimesa). Together they hold {stat} of everything IMSS recorded. Their arcs run straight through the Peña Nieto wedge.',
        es: 'Cuatro distribuidoras son los cuatro mayores proveedores del IMSS. Son Grupo Fármacos Especializados, Farmacéuticos Maypo, Laboratorios PISA y Distribuidora Internacional de Medicamentos y Equipo Médico (Dimesa). Juntas suman {stat} de todo lo que registró el IMSS. Sus arcos cruzan de lleno la cuña de Peña Nieto.',
      },
      stat: {
        key: 'star.share_of', params: { inst: IMSS, vendors: FOUR },
        caption: { en: 'of IMSS\'s recorded spending went to these {n}, 2002–2025', es: 'del gasto registrado del IMSS fue a estas {n}, 2002–2025' },
      },
      at: { star: IMSS, planet: 2873, highlight: FOUR.filter((v) => v !== 2873), period: 'pena_nieto' },
      dwellMs: 11000,
    },
    {
      id: 'cofece',
      number: 3,
      yearLabel: { en: '2018', es: '2018' },
      title: { en: 'The Competition Question', es: 'La pregunta de la competencia' },
      body: {
        en: 'The supplier ringed here is Farmacéuticos Maypo. Of the four, it has the most contracts at IMSS. Its arc runs from 2002 into 2026: it is still selling. Mexico\'s competition law already holds the instrument for a market like this. It is Article 53, on absolute monopolistic practices. COFECE can open it.',
        es: 'El proveedor marcado aquí es Farmacéuticos Maypo. De los cuatro, es el de más contratos en el IMSS. Su arco corre de 2002 a 2026: sigue vendiendo. La ley de competencia de México ya tiene el instrumento para un mercado así. Es el Artículo 53, sobre prácticas monopólicas absolutas. La COFECE puede abrirlo.',
      },
      stat: {
        key: 'body.value_here', params: { inst: IMSS, vendor: 2873 },
        caption: { en: 'recorded by Farmacéuticos Maypo at IMSS', es: 'registrados por Farmacéuticos Maypo en el IMSS' },
      },
      at: { star: IMSS, planet: 2873, period: 'pena_nieto' },
      dwellMs: 9500,
    },
    {
      id: 'veto',
      number: 4,
      yearLabel: { en: '2019', es: '2019' },
      title: { en: 'The Veto', es: 'El Veto' },
      body: {
        en: 'The new government publicly vetoes the large distributors. It does so from its morning press conferences. It also changes how the consolidated drug purchase is run. Watch the AMLO wedge. Which of the four still shine in it? The chart answers that, not a press conference.',
        es: 'El nuevo gobierno veta públicamente a las grandes distribuidoras. Lo hace desde sus conferencias matutinas. También cambia la forma de hacer la compra consolidada de medicamentos. Mire la cuña de AMLO. ¿Cuáles de las cuatro siguen brillando ahí? La respuesta la da la gráfica, no una conferencia.',
      },
      at: { star: IMSS, highlight: FOUR, period: 'amlo' },
      dwellMs: 8500,
    },
    {
      id: 'covid',
      number: 5,
      yearLabel: { en: '2020', es: '2020' },
      title: { en: 'The Emergency Window', es: 'La ventana de la emergencia' },
      body: {
        en: 'COVID arrives. Federal agencies invoke the emergency provisions of the procurement law. Across the whole register, the share of contracts without competition ends 2020 at {stat}. The emergency did not open a new door for the distributors. The old one was already open.',
        es: 'Llega COVID. Las dependencias federales invocan las disposiciones de emergencia de la ley de adquisiciones. En todo el registro, la proporción de contratos sin competencia cierra 2020 en {stat}. La emergencia no abrió una puerta nueva a las distribuidoras. La vieja ya estaba abierta.',
      },
      stat: {
        key: 'year.da_rate', params: { year: 2020, other: 2019 },
        caption: { en: '2020 direct-award rate · 2019: {other}', es: 'tasa de adjudicación directa 2020 · 2019: {other}' },
      },
      at: { star: IMSS, highlight: FOUR, period: 'amlo' },
      dwellMs: 11000,
    },
    {
      id: 'persistence',
      number: 6,
      yearLabel: { en: '2023–2025', es: '2023–2025' },
      title: { en: 'What Persists', es: 'Lo que persiste' },
      body: {
        en: 'Grupo Fármacos Especializados\' arc stops in 2020. The other three still sell to IMSS. Look at the Sheinbaum wedge, years past the veto. The register shows that the pattern persists. It cannot show why.',
        es: 'El arco de Grupo Fármacos Especializados se detiene en 2020. Las otras tres le siguen vendiendo al IMSS. Mire la cuña de Sheinbaum, años después del veto. El registro muestra que el patrón persiste. No puede mostrar por qué.',
      },
      at: { star: IMSS, highlight: FOUR, period: 'sheinbaum' },
      dwellMs: 11000,
    },
  ],
  closing: {
    headline: { en: 'The data was always there.', es: 'Los datos siempre estuvieron ahí.' },
    body: {
      en: 'The four distributors were visible in federal procurement data for years. The 2019 veto changed the rules. The map shows who kept selling. RUBLI exists so the next pattern does not need years before someone acts.',
      es: 'Las cuatro distribuidoras fueron visibles en los datos de contratación federal durante años. El veto de 2019 cambió las reglas. El mapa muestra quién siguió vendiendo. RUBLI existe para que el próximo patrón no necesite años antes de que alguien actúe.',
    },
  },
  longformSlug: 'el-monopolio-invisible',
}

// ─────────────────────────────────────────────────────────────────────────────
// LA ESTAFA MAESTRA — 6 chapters (trailer for /stories/la-industria-del-intermediario)
// The universities that took the contracts are not ranking-safe bodies (data lookup,
// 2026-10-02), so this flight frames the agencies the case record names
// (ground_truth_institutions, role = source) and names no supplier.
// ─────────────────────────────────────────────────────────────────────────────
const SEDATU = 1759
const BANSEFI = 1205
const PEMEX_CORP = 1201

const ESTAFA_MAESTRA: Story = {
  id: 'estafa_maestra',
  title: { en: 'La Estafa Maestra', es: 'La Estafa Maestra' },
  subtitle: {
    en: 'One of the largest diversions reported by the ASF and MCCI. It involves federal agencies and public universities as the channel. It also involves companies whose services the ASF could not verify as delivered.',
    es: 'Uno de los mayores desvíos reportados por la ASF y MCCI. Involucra a dependencias federales y a universidades públicas como canal. También a empresas cuyos servicios la ASF no pudo verificar como entregados.',
  },
  blurb: {
    en: '6 chapters · the loophole → the mechanism → the scale → publication → acquittal → the lesson',
    es: '6 capítulos · el vacío legal → el mecanismo → la escala → la publicación → la absolución → la lección',
  },
  duration: '~60s',
  accent: '#a06820',
  chapters: [
    {
      id: 'origin',
      number: 1,
      yearLabel: { en: 'Before 2013', es: 'Antes de 2013' },
      title: { en: 'The Loophole', es: 'El vacío legal' },
      body: {
        en: 'An agency could route a contract through a university without a tender. The university would subcontract the actual work to whomever it chose. Article 1 of the federal procurement law made this possible. It exempted contracts between public bodies from competitive bidding. Public universities were included.',
        es: 'Una dependencia podía canalizar un contrato por una universidad sin licitar. La universidad subcontrataba el trabajo a quien quisiera. El Artículo 1 de la ley federal de adquisiciones lo permitía. Eximía de licitación los contratos entre entes públicos. Las universidades públicas estaban incluidas.',
      },
      at: { period: 'calderon' },
      dwellMs: 9000,
    },
    {
      id: 'mechanism',
      number: 2,
      yearLabel: { en: '2013–2014', es: '2013–2014' },
      title: { en: 'The Mechanism', es: 'El Mecanismo' },
      body: {
        en: 'A federal agency pays a public university. The university pays private firms that deliver little or nothing. Those firms were often registered weeks before the contract. RUBLI\'s pattern P3, the single-use intermediary, describes the signature. In frame: SEDATU, one of the agencies the case record names.',
        es: 'Una dependencia federal le paga a una universidad pública. La universidad le paga a empresas privadas que entregan poco o nada. A menudo esas empresas se registraron semanas antes del contrato. El patrón P3 de RUBLI, la intermediaria de uso único, describe la firma. En cuadro: la SEDATU, una de las dependencias que nombra el expediente del caso.',
      },
      stat: {
        key: 'pattern.vendors', params: { code: 'P3' },
        caption: { en: 'suppliers in RUBLI\'s P3 intermediary cohort today', es: 'proveedores en la cohorte P3 de intermediarias de RUBLI hoy' },
      },
      at: { star: SEDATU, period: 'pena_nieto' },
      dwellMs: 11000,
    },
    {
      id: 'scale',
      number: 3,
      yearLabel: { en: '2013–2014', es: '2013–2014' },
      title: { en: 'The Scale', es: 'La Escala' },
      body: {
        en: 'The audit trail names eleven federal agencies. It also names 186 companies that delivered nothing. Animal Político and Mexicanos contra la Corrupción put the money at {stat}. In frame: Bansefi, another agency the case record names.',
        es: 'El rastro de auditoría nombra once dependencias federales. También nombra 186 empresas que no entregaron nada. Animal Político y Mexicanos contra la Corrupción calcularon el monto en {stat}. En cuadro: Bansefi, otra de las dependencias que nombra el expediente.',
      },
      stat: {
        key: 'case.amount', params: { slug: 'estafa-maestra' },
        caption: { en: 'documented amount · RUBLI case record', es: 'monto documentado · expediente del caso en RUBLI' },
      },
      at: { star: BANSEFI, period: 'pena_nieto' },
      dwellMs: 11000,
    },
    {
      id: 'publication',
      number: 4,
      yearLabel: { en: 'September 2017', es: 'Septiembre 2017' },
      title: { en: 'Animal Político', es: 'Animal Político' },
      body: {
        en: 'On September 5, 2017, the investigation "La Estafa Maestra" is published. Animal Político and Mexicanos contra la Corrupción publish it. The mechanism finally has a public name. The pattern had been in the data for years before it was named in print. In frame: PEMEX\'s corporate office, another source agency.',
        es: 'El 5 de septiembre de 2017 se publica la investigación "La Estafa Maestra". La publican Animal Político y Mexicanos contra la Corrupción. El mecanismo por fin tiene nombre público. El patrón llevaba años en los datos antes de aparecer impreso. En cuadro: el corporativo de PEMEX, otra dependencia de origen.',
      },
      at: { star: PEMEX_CORP, period: 'pena_nieto' },
      dwellMs: 9000,
    },
    {
      id: 'sanctions',
      number: 5,
      yearLabel: { en: '2019–2024', es: '2019–2024' },
      title: { en: 'The Slow Aftermath', es: 'El lento desenlace' },
      body: {
        en: 'The minister at the centre of the case was detained in 2019. The Supreme Court acquitted her in 2024. Audits flag billions and administrative sanctions follow. Not one conviction came out of it.',
        es: 'La secretaria en el centro del caso fue detenida en 2019. La Suprema Corte la absolvió en 2024. Las auditorías detectan miles de millones y llegan sanciones administrativas. No salió de ahí una sola condena.',
      },
      at: { star: SEDATU, period: 'amlo' },
      dwellMs: 9500,
    },
    {
      id: 'lesson',
      number: 6,
      yearLabel: { en: 'Now', es: 'Ahora' },
      title: { en: 'The Lesson', es: 'La Lección' },
      body: {
        en: 'The next Estafa Maestra is detectable the moment its contracts enter the register. P3 is one of the patterns RUBLI\'s ARIA queue flags. It is the single-use intermediary. The technical question has been answered. The political one remains.',
        es: 'La próxima Estafa Maestra es detectable en cuanto sus contratos entran al registro. P3 es uno de los patrones que marca la fila ARIA de RUBLI. Es la intermediaria de uso único. La pregunta técnica está respondida. La política sigue en pie.',
      },
      at: { period: 'sheinbaum' },
      dwellMs: 11000,
    },
  ],
  closing: {
    headline: { en: 'The next one is detectable in real time.', es: 'La próxima es detectable en tiempo real.' },
    body: {
      en: 'The intermediary signature was in COMPRANET years before it had a name. This platform exists to close the gap between "visible" and "named".',
      es: 'La firma de la intermediaria estuvo en COMPRANET años antes de tener nombre. Esta plataforma existe para cerrar la brecha entre "visible" y "nombrado".',
    },
  },
  longformSlug: 'la-industria-del-intermediario',
}

// ─────────────────────────────────────────────────────────────────────────────
// THE COVID YEAR — 5 chapters (trailer for /stories/el-ano-de-la-emergencia)
// ─────────────────────────────────────────────────────────────────────────────
const COVID_YEAR: Story = {
  id: 'covid_year',
  title: { en: 'The COVID Year', es: 'El año COVID' },
  subtitle: {
    en: '2020 was a public health emergency. It was also a procurement event. The exception it allowed became the floor.',
    es: '2020 fue una emergencia de salud pública. También fue un evento de contratación. La excepción que permitió se volvió el piso.',
  },
  blurb: {
    en: '5 chapters · 2019 baseline → emergency procurement → the cohort → after the wave → the new normal',
    es: '5 capítulos · base 2019 → compras de emergencia → la cohorte → después de la ola → la nueva normalidad',
  },
  duration: '~50s',
  accent: '#dc2626',
  chapters: [
    {
      id: 'baseline',
      number: 1,
      yearLabel: { en: '2019', es: '2019' },
      title: { en: 'Before', es: 'Antes' },
      body: {
        en: 'Mexican federal procurement entered 2020 already awarding {stat} of its contracts without competition. That is far above the 10% line. The EU Single Market Scoreboard rates that line unsatisfactory. The pattern was bad. It was also stable.',
        es: 'La contratación federal mexicana entró a 2020 adjudicando ya {stat} de sus contratos sin competencia. Eso está muy por encima de la línea del 10%. El Tablero del Mercado Único de la UE la considera insatisfactoria. El patrón era malo. También era estable.',
      },
      stat: {
        key: 'year.da_rate', params: { year: 2019 },
        caption: { en: '2019 direct-award rate · whole register', es: 'tasa de adjudicación directa 2019 · todo el registro' },
      },
      at: { period: 'amlo' },
      dwellMs: 8500,
    },
    {
      id: 'emergency',
      number: 2,
      yearLabel: { en: 'March 2020', es: 'Marzo 2020' },
      title: { en: 'The Emergency Provisions', es: 'Las disposiciones de emergencia' },
      body: {
        en: 'On March 30, 2020, COVID-19 is declared a national health emergency. Article 41 of the procurement law permits direct award in emergency conditions. The share of contracts awarded without competition ends the year at {stat}. The emergency did not open the door. It was already open.',
        es: 'El 30 de marzo de 2020, COVID-19 se declara emergencia sanitaria nacional. El artículo 41 de la LAASSP permite la adjudicación directa en condiciones de emergencia. La proporción de contratos sin licitación cierra el año en {stat}. La emergencia no abrió la puerta. Ya estaba abierta.',
      },
      stat: {
        key: 'year.da_rate', params: { year: 2020, other: 2019 },
        caption: { en: '2020 · 2019 was {other} · the register\'s peak is {peakYear}, at {peak}', es: '2020 · 2019 fue {other} · el pico del registro es {peakYear}, con {peak}' },
      },
      at: { star: IMSS, period: 'amlo' },
      dwellMs: 11000,
    },
    {
      id: 'cohort',
      number: 3,
      yearLabel: { en: '2020', es: '2020' },
      title: { en: 'The Cohort', es: 'La Cohorte' },
      body: {
        en: 'HEMOSER, the supplier ringed here at IMSS, books {stat} in contracts in 2020 alone. It is part of a cohort of suppliers that receives extraordinary volume.',
        es: 'HEMOSER, el proveedor marcado aquí en el IMSS, registra {stat} en contratos solo en 2020. Es parte de una cohorte de proveedores que recibe un volumen extraordinario.',
      },
      stat: {
        key: 'vendor.year_value', params: { vendor: 6038, year: 2020 },
        caption: { en: 'HEMOSER contracts in 2020 · every buyer', es: 'contratos de HEMOSER en 2020 · todos los compradores' },
      },
      at: { star: IMSS, planet: 6038, period: 'amlo' },
      dwellMs: 11000,
    },
    {
      id: 'sustained',
      number: 4,
      yearLabel: { en: '2021–2022', es: '2021–2022' },
      title: { en: 'After the Wave', es: 'Después de la ola' },
      body: {
        en: 'In 2021, direct award stands at {stat}. The acute phase of the emergency passes, but the procurement adjustment does not. The channels that opened in March 2020 do not fully close.',
        es: 'En 2021, la adjudicación directa está en {stat}. La fase aguda de la emergencia pasa, pero el ajuste de la contratación no. Los canales que se abrieron en marzo de 2020 no se cierran del todo.',
      },
      stat: {
        key: 'year.da_rate', params: { year: 2021, other: 2022 },
        caption: { en: '2021 direct-award rate · 2022: {other}', es: 'tasa de adjudicación directa 2021 · 2022: {other}' },
      },
      at: { period: 'amlo' },
      dwellMs: 9000,
    },
    {
      id: 'legacy',
      number: 5,
      yearLabel: { en: '2024', es: '2024' },
      title: { en: 'The New Normal', es: 'La nueva normalidad' },
      body: {
        en: 'Four years after the emergency, direct award stands at {stat}. What was supposed to be an exception became the floor. The COVID year is not over in the data.',
        es: 'Cuatro años después de la emergencia, la adjudicación directa está en {stat}. Lo que debía ser una excepción se volvió el piso. El año COVID no ha terminado en los datos.',
      },
      stat: {
        key: 'year.da_rate', params: { year: 2024 },
        caption: { en: '2024 direct-award rate · last complete year', es: 'tasa de adjudicación directa 2024 · último año completo' },
      },
      at: { period: 'amlo' },
      dwellMs: 10000,
    },
  ],
  closing: {
    headline: { en: 'The exception became the floor.', es: 'La excepción se volvió el piso.' },
    body: {
      en: 'COVID-19 was a justifiable suspension of competitive procurement. The data shows that the suspension never fully reversed. The next emergency will inherit this floor.',
      es: 'COVID-19 fue una suspensión justificable de la licitación competitiva. Los datos muestran que la suspensión nunca se revirtió por completo. La próxima emergencia heredará este piso.',
    },
  },
  longformSlug: 'el-ano-de-la-emergencia',
}

export const ATLAS_STORIES: Story[] = [IMSS_MEDICINES, ESTAFA_MAESTRA, COVID_YEAR]

/** Retired flight ids that shared links still carry → their current id. */
const LEGACY_IDS: Record<string, string> = { pharma_cartel: 'imss_medicines' }

/** Look up a story by id (or a retired alias), or null if not found. */
export function findStory(id: string): Story | null {
  const key = LEGACY_IDS[id] ?? id
  return ATLAS_STORIES.find((s) => s.id === key) ?? null
}

/** Reverse lookup: the flight that is the visual trailer for a /stories/:slug long-form. */
export function findStoryByLongformSlug(slug: string): Story | null {
  return ATLAS_STORIES.find((s) => s.longformSlug === slug) ?? null
}
