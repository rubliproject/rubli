/**
 * Los datos / The data — the dataset page (Plataforma remake, 2026-10-28).
 *
 * The open release with a direct link to every file (sizes from its Zenodo MANIFEST), a link
 * builder for filtered exports (the page's one live thing), the public API, the horizon and
 * quality of the record (contracts per structure from DATASHEET_2026.11), and the model.
 * The live register count comes from the API; the release's own counts are frozen constants.
 * No RFC is ever printed here.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, Download } from 'lucide-react'
import {
  CURRENT_MODEL_VERSION, DATASET_DOI, DATASET_RELEASE, DATASET_VERSION, DATA_CUT_YEAR, MODEL_AUC, MODEL_AUC_CI, SECTORS,
} from '@/lib/constants'
import { useExecutiveData } from '@/hooks/useExecutiveData'
import { useDataCut } from '@/lib/useDataCut'
import { formatCut } from '@/lib/nav/toc'
import { formatNumber } from '@/lib/utils'
import { EXPORT_MAX_ROWS, EXPORT_UNFILTERED_ROWS, exportUrl, fmtBytes as bytes, type ExportQuery } from '@/lib/plataforma/figures'
import { useLang } from '@/components/contrato/nav'
import { PfShell, PfSection, PfProse, PfFlow } from '@/components/plataforma/Plataforma'
import { datosLectura } from '@/lib/plataforma/lectura'
import '@/components/datos/datos.css'

const DOI_URL = `https://doi.org/${DATASET_DOI}`
const ZENODO_FILES = `https://zenodo.org/records/${DATASET_DOI.split('zenodo.')[1]}/files`
const API = 'https://rubli.xyz/api/v1'

const CITATION = {
  es: `Proyecto RUBLI (2026). RUBLI — Mexican Federal Procurement Dataset (2002–2026), versión ${DATASET_VERSION} [conjunto de datos]. Zenodo. CC BY 4.0. ${DOI_URL}`,
  en: `RUBLI Project (2026). RUBLI — Mexican Federal Procurement Dataset (2002–2026), version ${DATASET_VERSION} [Data set]. Zenodo. CC BY 4.0. ${DOI_URL}`,
}


function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked: the text stays selectable */ }
  }
  return (
    <>
      <button type="button" onClick={copy} className="plt-btn">
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {label}
      </button>
      <span className="sr-only" role="status">{copied ? done : ''}</span>
    </>
  )
}

/** A URL line: the address (wraps anywhere, so long query strings never overflow at 390) and what it returns. */
function Url({ href, note }: { href: string; note: string }) {
  return (
    <div>
      <dt className="plt-mono"><a href={href} target="_blank" rel="noopener noreferrer" className="ct-link">{href.replace('https://', '')}</a></dt>
      <dd>{note}</dd>
    </div>
  )
}

// DATASHEET_2026.11 § composition: contracts per structure (sum = the release's 3,177,987) and the share
// whose vendor carries an RFC in the vendor registry.
const STRUCTURES = [
  { s: 'A', years: '2002–2010', n: 394_861, rfc: 37.1, es: 'Calidad más baja; sin fecha de publicación; el riesgo se subestima', en: 'Lowest quality; no publication date; risk is underestimated' },
  { s: 'B', years: '2010–2017', n: 1_329_057, rfc: 45.5, es: 'Texto en mayúsculas; ~72% adjudicación directa', en: 'Uppercase text; ~72% direct award' },
  { s: 'C', years: '2018–2022', n: 931_183, rfc: 68.3, es: 'Mayúsculas y minúsculas; ~78% adjudicación directa', en: 'Mixed case; ~78% direct award' },
  { s: 'D', years: '2023–2025', n: 402_042, rfc: 80.0, es: 'La mejor de CompraNet; 100% con partida presupuestal', en: 'CompraNet’s best; 100% budget-line (partida) codes' },
  { s: 'E', years: '2025–2026', n: 120_844, rfc: 85.5, es: 'Datos abiertos de ComprasMX que no estaban en CompraNet', en: 'ComprasMX open data not already in CompraNet' },
]

const ROWS = [1_000, 10_000, EXPORT_MAX_ROWS] as const
const YEARS = Array.from({ length: DATA_CUT_YEAR - 2002 + 1 }, (_, i) => DATA_CUT_YEAR - i)

function ExportBuilder({ es }: { es: boolean }) {
  const [q, setQ] = useState<ExportQuery>({ format: 'csv', sectorId: 1, year: 2025, riskMin: null, limit: 1_000 })
  const url = exportUrl(API, q, DATA_CUT_YEAR)
  const set = (patch: Partial<ExportQuery>) => setQ((prev) => ({ ...prev, ...patch }))
  const num = (v: string) => (v ? Number(v) : null)
  // the API refuses unfiltered exports above 10,000 rows; exportUrl caps them, the menu greys the option out
  const filtered = Boolean(q.sectorId || q.year || q.riskMin)
  return (
    <div className="dt-builder">
      <div className="dt-fields">
        <label>
          <span>{es ? 'Sector' : 'Sector'}</span>
          <select value={q.sectorId ?? ''} onChange={(e) => set({ sectorId: num(e.target.value) })}>
            <option value="">{es ? 'Todos' : 'All'}</option>
            {SECTORS.map((s) => <option key={s.id} value={s.id}>{es ? s.name : s.nameEN}</option>)}
          </select>
        </label>
        <label>
          <span>{es ? 'Año' : 'Year'}</span>
          <select value={q.year ?? ''} onChange={(e) => set({ year: num(e.target.value) })}>
            <option value="">{es ? 'Todos' : 'All'}</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label>
          <span>{es ? 'Indicador de riesgo' : 'Risk indicator'}</span>
          <select value={q.riskMin ?? ''} onChange={(e) => set({ riskMin: (e.target.value || null) as ExportQuery['riskMin'] })}>
            <option value="">{es ? 'Cualquiera' : 'Any'}</option>
            <option value="medium">{es ? 'Medio o más' : 'Medium or above'}</option>
            <option value="high">{es ? 'Alto o más' : 'High or above'}</option>
            <option value="critical">{es ? 'Solo crítico' : 'Critical only'}</option>
          </select>
        </label>
        <label>
          <span>{es ? 'Filas' : 'Rows'}</span>
          <select value={q.limit} onChange={(e) => set({ limit: Number(e.target.value) })}>
            {ROWS.map((r) => (
              <option key={r} value={r} disabled={!filtered && r > EXPORT_UNFILTERED_ROWS}>{r.toLocaleString(es ? 'es-MX' : 'en-US')}</option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>{es ? 'Formato' : 'Format'}</legend>
          {(['csv', 'excel'] as const).map((f) => (
            <label key={f} className="dt-radio">
              <input type="radio" name="dt-format" value={f} checked={q.format === f} onChange={() => set({ format: f })} />
              {f === 'csv' ? 'CSV' : 'Excel'}
            </label>
          ))}
        </fieldset>
      </div>
      <output className="dt-url">{url.replace('https://', '')}</output>
      <div className="dt-actions">
        <a href={url} className="plt-btn" rel="noopener noreferrer"><Download aria-hidden="true" />{es ? 'Descargar' : 'Download'}</a>
        <CopyButton text={url} label={es ? 'Copiar enlace' : 'Copy link'} done={es ? 'Enlace copiado' : 'Link copied'} />
      </div>
    </div>
  )
}

export default function Datos() {
  const L = useLang()
  const es = L === 'es'
  const loc = es ? 'es-MX' : 'en-US'
  const cut = formatCut(useDataCut(), L)
  const total = useExecutiveData().executiveSummary?.headline?.total_contracts ?? null
  const R = DATASET_RELEASE

  return (
    <PfShell
      className="datos-page"
      title={es ? 'Los datos' : 'The data'}
      lede={es
        ? 'De dónde vienen los datos de RUBLI, hasta cuándo llegan, cómo se validan y cómo descargarlos.'
        : 'Where RUBLI’s data comes from, how far it reaches, how it is validated and how to download it.'}
      guide={es
        ? { q: '¿De dónde salen los datos y cómo los descargo?', see: 'Las fuentes, cómo se revisan y tres formas de bajarlos.', read: 'Cada apartado responde una pregunta. Los enlaces bajan el archivo.', means: `Todo sale de registros públicos. La versión ${DATASET_VERSION} se puede bajar entera.` }
        : { q: 'Where does the data come from, and how do I download it?', see: 'The sources, how they are checked and three ways to get them.', read: 'Each section answers one question. The links download the file.', means: `It all comes from public records. Release ${DATASET_VERSION} can be downloaded whole.` }}
      lectura={datosLectura(L, { total, release: R.contracts, version: DATASET_VERSION })}
      meta={<>DOI <a href={DOI_URL} target="_blank" rel="noopener noreferrer">{DATASET_DOI}</a> · {es ? 'versión' : 'version'} {DATASET_VERSION}</>}
      index={[
        { id: 'dt-open', label: es ? 'El conjunto abierto' : 'The open dataset' },
        { id: 'dt-build', label: es ? 'Arme su descarga' : 'Build a download' },
        { id: 'dt-api', label: es ? 'La API' : 'The API' },
        { id: 'dt-horizon', label: es ? 'Horizonte y calidad' : 'Horizon and quality' },
        { id: 'dt-model', label: es ? 'El modelo' : 'The model' },
      ]}
      facts={[
        { k: es ? 'Contratos en el registro' : 'Contracts on record', v: total != null ? formatNumber(total) : '—', n: es ? 'hoy, en el sitio' : 'today, on the site' },
        { k: es ? 'Corte del sitio' : 'Site cut-off', v: cut, n: `${es ? 'la versión' : 'the release'}: ${formatCut(DATASET_RELEASE.cutIso, L)}` },
        { k: es ? 'Licencia del sitio' : 'Site licence', v: 'CC BY-NC 4.0', n: es ? '2026.10 y 2026.11: CC BY 4.0' : '2026.10 and 2026.11: CC BY 4.0' },
      ]}
    >
      <PfSection
        id="dt-open"
        title={es ? 'El conjunto abierto' : 'The open dataset'}
        claim={es
          ? `Toda la base del sitio, ${R.tables} tablas sin RFC, en Zenodo con DOI. El sitio y lo que venga: CC BY-NC 4.0. Las versiones 2026.10 y 2026.11 conservan CC BY 4.0.`
          : `The whole database behind the site, ${R.tables} tables with no RFCs, on Zenodo with a DOI. The site and what comes next: CC BY-NC 4.0. Releases 2026.10 and 2026.11 keep CC BY 4.0.`}
      >
        <PfFlow
          label={es ? 'Del registro público a su descarga, en cuatro pasos' : 'From the public record to your download, in four steps'}
          steps={[
            { name: es ? 'Dos fuentes públicas' : 'Two public sources', note: es ? 'CompraNet, de 2002 al 28 de septiembre de 2025. ComprasMX, desde entonces.' : 'CompraNet, 2002 to 28 September 2025. ComprasMX, since then.' },
            { via: es ? 'se revisa' : 'checked', name: es ? 'Cada monto' : 'Every amount', note: es ? 'Más de 100 mil millones: se descarta. Más de 10 mil millones: se marca.' : 'Above 100 billion pesos: discarded. Above 10 billion: flagged.' },
            { via: es ? 'se califica' : 'scored', name: es ? 'La base de RUBLI' : 'RUBLI’s database', note: es ? 'Cada contrato con sector recibe su indicador de riesgo.' : 'Every contract with a sector gets its risk indicator.' },
            {
              via: es ? 'se publica' : 'published', focal: true, name: es ? 'Tres salidas' : 'Three ways out',
              children: (
                <ul className="plt-flow-lv">
                  <li><a href={DOI_URL} target="_blank" rel="noopener noreferrer" className="ct-link">{es ? 'Zenodo, con DOI' : 'Zenodo, with a DOI'}<span className="sr-only">{es ? ' (se abre en otra pestaña)' : ' (opens in a new tab)'}</span></a></li>
                  <li><a href="#dt-build" className="ct-link">{es ? 'Su descarga a la medida' : 'A download built for you'}</a></li>
                  <li><a href="#dt-api" className="ct-link">{es ? 'La API pública' : 'The public API'}</a></li>
                </ul>
              ),
            },
          ]}
        />
        <dl className="plt-ledger">
          <div>
            <dt className="plt-mono"><a href={`${ZENODO_FILES}/RUBLI_PUBLIC.db?download=1`} className="ct-link">RUBLI_PUBLIC.db</a></dt>
            <dd>{es ? `SQLite completa, ${bytes(R.dbBytes)}: ${R.contracts.toLocaleString(loc)} contratos y las ${R.tables} tablas` : `full SQLite, ${bytes(R.dbBytes)}: ${R.contracts.toLocaleString(loc)} contracts and all ${R.tables} tables`}</dd>
          </div>
          <div>
            <dt className="plt-mono"><a href={`${ZENODO_FILES}/RUBLI_PUBLIC_lite.db?download=1`} className="ct-link">RUBLI_PUBLIC_lite.db</a></dt>
            <dd>{es ? `versión ligera, ${bytes(R.liteBytes)}, sin las tablas de contratos` : `lite version, ${bytes(R.liteBytes)}, without the contract tables`}</dd>
          </div>
          <div>
            <dt className="plt-mono"><a href={`${ZENODO_FILES}/csv.zip?download=1`} className="ct-link">csv.zip</a></dt>
            <dd>{es ? `${R.csvTables} tablas principales en CSV (UTF-8), ${bytes(R.csvZipBytes)} comprimido; los contratos van en la SQLite` : `${R.csvTables} main tables as CSV (UTF-8), ${bytes(R.csvZipBytes)} zipped; the contracts are in the SQLite`}</dd>
          </div>
          <div>
            <dt className="plt-mono">
              <a href={`${ZENODO_FILES}/DATASHEET.md?download=1`} className="ct-link">DATASHEET.md</a>{' · '}
              <a href={`${ZENODO_FILES}/DATA_DICTIONARY.md?download=1`} className="ct-link">DATA_DICTIONARY.md</a>
            </dt>
            <dd>{es ? 'hoja de datos (qué contiene, cómo se hizo, para qué no sirve) y diccionario de cada columna' : 'datasheet (what it holds, how it was made, what not to use it for) and a dictionary of every column'}</dd>
          </div>
          <div>
            <dt className="plt-mono">
              <a href={`${ZENODO_FILES}/MANIFEST.json?download=1`} className="ct-link">MANIFEST.json</a>{' · '}
              <a href={`${ZENODO_FILES}/LICENSE.md?download=1`} className="ct-link">LICENSE.md</a>
            </dt>
            <dd>{es ? 'tamaño y SHA-256 de cada archivo, filas por tabla; la licencia con la que se publicó esta versión (CC BY 4.0)' : 'size and SHA-256 of every file, rows per table; the licence this release was published under (CC BY 4.0)'}</dd>
          </div>
        </dl>
        <p className="ct-note">
          {es
            ? 'Privacidad: sin RFC; en el conjunto descargable las personas físicas aparecen como «PERSONA FISICA <id>».'
            : 'Privacy: no RFCs; in the downloadable set individuals appear as «PERSONA FISICA <id>».'}
        </p>
        <figure className="dt-cite">
          <blockquote className="plt-pull">{CITATION[L]}</blockquote>
          <CopyButton text={CITATION[L]} label={es ? 'Copiar cita' : 'Copy citation'} done={es ? 'Cita copiada' : 'Citation copied'} />
        </figure>
      </PfSection>

      <PfSection
        id="dt-build"
        title={es ? 'Arme su descarga' : 'Build a download'}
        claim={es
          ? `Elija sector, año y nivel. El enlace baja hasta ${EXPORT_MAX_ROWS.toLocaleString(loc)} contratos, en CSV o Excel. Hasta 10 veces por minuto.`
          : `Pick a sector, year and level. The link fetches up to ${EXPORT_MAX_ROWS.toLocaleString(loc)} contracts, as CSV or Excel. Up to 10 times a minute.`}
      >
        <ExportBuilder es={es} />
        <p className="ct-note">
          {es
            ? 'Las exportaciones aceptan los mismos filtros que la lista de contratos (institution_id, vendor_id, category_id, is_direct_award…). Proveedores con sus totales:'
            : 'Exports take the same filters as the contract list (institution_id, vendor_id, category_id, is_direct_award…). Vendors with their totals:'}
        </p>
        <dl className="plt-ledger">
          <Url href={`${API}/export/vendors/csv?sector_id=1&min_contracts=10&limit=1000`} note={es ? 'Proveedores de salud con 10 contratos o más, con sus totales, CSV' : 'Health-sector vendors with 10+ contracts and their totals, CSV'} />
        </dl>
      </PfSection>

      <PfSection
        id="dt-api"
        title={es ? 'La API pública' : 'The public API'}
        claim={es
          ? <>JSON en <span className="plt-mono">{API}</span>, sin registro ni clave, hasta 100 consultas por minuto por IP.</>
          : <>JSON at <span className="plt-mono">{API}</span>, no sign-up or key, up to 100 requests a minute per IP.</>}
      >
        <dl className="plt-ledger">
          <Url href={`${API}/sectors`} note={es ? 'Los 12 sectores con contratos, monto y valor en riesgo' : 'The 12 sectors with contracts, value and value at risk'} />
          <Url href={`${API}/contracts?sector_id=1&year=2025&per_page=50`} note={es ? 'Contratos paginados, con su indicador de riesgo' : 'Paginated contracts, each with its risk indicator'} />
          <Url href={`${API}/vendors/top?by=value&limit=10`} note={es ? 'Los 10 proveedores con mayor monto contratado' : 'The 10 vendors with the most contracted value'} />
          <Url href={`${API}/institutions?per_page=50`} note={es ? 'Instituciones compradoras, paginadas' : 'Buying institutions, paginated'} />
        </dl>
      </PfSection>

      <PfSection
        id="dt-horizon"
        title={es ? 'Horizonte y calidad' : 'Horizon and quality'}
        claim={es
          ? <>CompraNet llega al <b>28 de septiembre de 2025</b>. Después, ComprasMX hasta el <b>{cut}</b>. Por eso {DATA_CUT_YEAR} está incompleto.</>
          : <>CompraNet reaches <b>September 28, 2025</b>. After that, ComprasMX up to <b>{cut}</b>. So {DATA_CUT_YEAR} is partial.</>}
      >
        <PfProse>
          <p>
            {es
              ? 'CompraNet dejó de publicar su archivo federal tras su abolición legal. Los contratos de ComprasMX se califican con el mismo modelo y cuentan en los totales. Las gráficas marcan el día del cambio de fuente.'
              : 'CompraNet stopped publishing its federal feed after its legal abolition. ComprasMX contracts are scored with the same model and count in the totals. The charts mark the day the source changes.'}
          </p>
          <p>
            {es ? (
              <>Más de <b>100 mil millones de pesos</b> es un error de captura. Su monto queda en 0, fuera de los totales. Uno de más de <b>10 mil millones</b> se conserva, marcado para revisión. Hoy son 40 contratos.</>
            ) : (
              <>A contract above <b>100 billion pesos</b> is treated as a capture error: amount set to 0, out of the totals. One above <b>10 billion</b> is kept, flagged for review. Today there are 40.</>
            )}
          </p>
        </PfProse>
        <div className="ct-table-wrap" tabIndex={0} role="region" aria-label={es ? 'Las estructuras del registro' : 'The structures of the record'}>
          <table className="ct-table">
            <caption className="sr-only">{es ? 'Las estructuras del registro' : 'The structures of the record'}</caption>
            <thead>
              <tr>
                <th scope="col">{es ? 'Estructura' : 'Structure'}</th>
                <th scope="col">{es ? 'Años' : 'Years'}</th>
                <th scope="col" className="num">{es ? 'Contratos' : 'Contracts'}</th>
                <th scope="col" className="num">{es ? 'Proveedor con RFC' : 'Vendor with RFC'}</th>
                <th scope="col">{es ? 'Notas' : 'Notes'}</th>
              </tr>
            </thead>
            <tbody>
              {STRUCTURES.map((r) => (
                <tr key={r.s}>
                  <td className="font-semibold">{r.s}</td>
                  <td className="mono nowrap">{r.years}</td>
                  <td className="num">{r.n.toLocaleString(loc)}</td>
                  <td className="num">{r.rfc.toFixed(1)}%</td>
                  <td>{es ? r.es : r.en}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ct-note">
          {es
            ? `Versión ${DATASET_VERSION}. «Proveedor con RFC»: contratos cuyo proveedor tiene RFC en el padrón de proveedores. La calidad sube con el tiempo: el riesgo de 2002–2010 se subestima y la adjudicación directa solo se codifica de forma confiable desde 2011.`
            : `Release ${DATASET_VERSION}. «Vendor with RFC»: contracts whose vendor has an RFC in the vendor registry. Quality rises with time: 2002–2010 risk is underestimated and direct award is coded reliably only from 2011.`}
        </p>
      </PfSection>

      <PfSection
        id="dt-model"
        title={es ? 'El modelo' : 'The model'}
        claim={es
          ? `Indicador de riesgo ${CURRENT_MODEL_VERSION}: el parecido estadístico de cada contrato con casos documentados, no la probabilidad de un delito.`
          : `Risk indicator ${CURRENT_MODEL_VERSION}: each contract’s statistical resemblance to documented cases, not the likelihood of wrongdoing.`}
      >
        <p>
          {es
            ? `Entrenado con años anteriores y probado en el siguiente (2019–2025), su AUC encadenado hacia adelante es ${MODEL_AUC} (IC 95% ${MODEL_AUC_CI}). Las calificaciones de v0.9.1 del conjunto 2026.10 usaban datos posteriores al contrato y están reemplazadas. `
            : `Trained on earlier years and tested on the next (2019–2025), its forward-chained AUC is ${MODEL_AUC} (95% CI ${MODEL_AUC_CI}). The v0.9.1 scores in dataset 2026.10 used data from after each contract and are superseded. `}
          <Link to="/methodology" className="ct-link">
            {es ? 'Variables, límites y método completo en Metodología' : 'Features, limits and full method in Methodology'}
          </Link>.
        </p>
      </PfSection>
    </PfShell>
  )
}
