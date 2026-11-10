import { DATASET_DOI, DATASET_RELEASE, DATASET_VERSION, DATA_CUT_YEAR } from '@/lib/constants'
import { fmtBytes } from '@/lib/plataforma/figures'

/** The public dataset release (Zenodo, CC BY-NC 4.0) on «El Contrato» (DESIGN.md §2): fills its track, no paragraph cap. */
export function OpenDataNote({ lang }: { lang: string }) {
  const es = lang !== 'en'
  const url = `https://doi.org/${DATASET_DOI}`
  return (
    <div className="border-l-[3px] border-text-primary pl-4 space-y-2">
      <p className="ct-sc text-[13px] leading-[1.45] text-text-muted">
        {es ? 'Datos abiertos · descarga' : 'Open data · download'}
      </p>
      <p className="text-[15px] leading-[1.6] text-text-primary">
        {es
          ? `Toda la base que usa este sitio se puede descargar: los contratos federales 2002–${DATA_CUT_YEAR}, las entidades resueltas, los sectores y categorías, los registros externos, los casos documentados y el indicador de riesgo con sus variables. El sitio y las próximas versiones: CC BY-NC 4.0. Las versiones 2026.10 y 2026.11 en Zenodo se publicaron bajo CC BY 4.0 y conservan esa licencia.`
          : `The whole database behind this site can be downloaded: federal contracts 2002–${DATA_CUT_YEAR}, resolved entities, sectors and categories, external registries, documented cases and the risk indicator with its features. The site and future releases: CC BY-NC 4.0. Releases 2026.10 and 2026.11 on Zenodo were published under CC BY 4.0 and keep that licence.`}
      </p>
      <p className="text-[15px] leading-[1.6] text-text-primary">
        <a href={url} target="_blank" rel="noopener noreferrer" className="ct-link text-[13px]">
          DOI {DATASET_DOI}
        </a>
        {es
          ? ` · SQLite completa (${fmtBytes(DATASET_RELEASE.dbBytes)}) y versión ligera (${fmtBytes(DATASET_RELEASE.liteBytes)}) · tablas principales en CSV · hoja de datos y diccionario.`
          : ` · full SQLite (${fmtBytes(DATASET_RELEASE.dbBytes)}) and lite version (${fmtBytes(DATASET_RELEASE.liteBytes)}) · main tables as CSV · datasheet and data dictionary.`}
      </p>
      <p className="font-serif text-[13px] leading-[1.45] text-text-muted">
        {es
          ? `Privacidad: sin RFC. En el archivo ${DATASET_VERSION} los proveedores que son personas físicas aparecen como «PERSONA FISICA <id>» y los nombres leídos por OCR sin forma jurídica, como «PROVEEDOR NO IDENTIFICADO (OCR)»; en el sitio las personas físicas se nombran con la etiqueta «persona física» y su RFC personal nunca se muestra. Las puntuaciones son indicadores de riesgo, no pruebas.`
          : `Privacy: no RFCs. In the ${DATASET_VERSION} file individual suppliers appear as «PERSONA FISICA <id>» and OCR-read names without a legal form as «PROVEEDOR NO IDENTIFICADO (OCR)»; on the site individuals are named with the label «persona física» and their personal RFC is never shown. Scores are risk indicators, not proof.`}
      </p>
    </div>
  )
}
