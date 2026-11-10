# Spanish fixes pending — 2026-11-03

Fixes from the 2026-11-03 Spanish site audit that sit in files owned tonight by other branches or agents. Pass 1 (branch `copy/spanish-pass-1`) left them alone. Apply each one when the owning branch merges. Format: `file:line` · current → proposed. Paths start at `frontend/src/`. Line numbers are as of `origin/main` e6867c5d.

The owner-level glossary applies to all of them:

- «indicador de riesgo», never puntuación or puntaje.
- «sin licitación», never «sin concurso» or «sin competencia».
- «la fila de investigación» on first mention.
- usted.
- «Patrones de riesgo».
- «desviación», never «desvío».
- «contratado», never «cobrado».
- No GT, LEAD, DISC, T1 or pipeline in reader copy.
- No em-dash chains and no all-caps sentences.
- «el cierre de CompraNet (28 sep 2025)», never «apagón».
- AUC 0.827 (v0.9.2), written as «en años que el modelo no vio».
- 3.18 millones de contratos.

## common.json (changed by `fix/p5-amount-not-price`)

These were prepared and checked in pass 1, then reverted to keep the P5 merge clean. They touch different keys from P5's `price_*` lines, so they can be reapplied unchanged.

- `i18n/locales/es/common.json:47` · «"avgScore": "Puntaje promedio"» → «"avgScore": "Indicador de riesgo promedio"»
- `i18n/locales/es/common.json:55` · «La página que buscas no está en nuestra base de datos. Busca un proveedor, institución o contrato — o salta a una investigación abierta.» → «La página que busca no está en el registro. Busque un proveedor, una institución o un contrato, o consulte una investigación publicada.»
- `i18n/locales/es/common.json:104` · «"statusSoloDatos": "Solo datos — pista sin reportar"» → «"statusSoloDatos": "Solo datos: pista sin reportar"»
- `i18n/locales/es/common.json:109` · «producido por la plataforma RUBLI, que califica"» → «producido por la plataforma RUBLI, que asigna un indicador de riesgo a"»
- `i18n/locales/es/common.json:111` · «Los puntajes de riesgo son generados por el modelo v0.9.2, entrenado con la base de casos etiquetados de RUBLI» → «Los indicadores de riesgo los genera el modelo v0.9.2, entrenado con la base de casos documentados de RUBLI»
- `i18n/locales/es/common.json:111` · «obtiene un AUC encadenado hacia adelante de 0.827 — el AUC es la proporción de veces que el modelo coloca a un proveedor con caso por encima de uno sin caso. Los puntajes miden similitud con casos etiquetados — no constituyen prueba de irregularidad.» → «obtiene un AUC de 0.827 en años que el modelo no vio. El AUC es la proporción de veces que el modelo coloca a un proveedor con caso por encima de uno sin caso. El indicador mide la similitud con casos documentados: es un indicador de riesgo, no una prueba.»
- `i18n/locales/es/common.json:112` · «se basan en el campo procedure_type del registro oficial» → «se basan en el tipo de procedimiento del registro oficial»
- `i18n/locales/es/common.json:124` · «"ariaDesc": "Colas de investigación automatizada"» → «"ariaDesc": "La fila de investigación de RUBLI"»
- `i18n/locales/es/common.json:128` · «"exploreContractsDesc": "Buscar en 3M+ contratos"» → «"exploreContractsDesc": "Buscar en 3.18 millones de contratos"»
- `i18n/locales/es/common.json:143` · «Red Unificada de Búsqueda de Licitaciones Irregulares — detección» → «Red Unificada de Búsqueda de Licitaciones Irregulares: detección»
- `i18n/locales/es/common.json:145` · «ARIA clasifica cada proveedor en 4 niveles por prioridad de investigación. El Nivel 1 muestra 61 proveedores marcados para revisión inmediata — combinando puntuaciones de riesgo, detección de anomalías y registros externos de sanciones (SAT EFOS, SFP, ASF) en un puntaje IPS único.» → «ARIA ordena a cada proveedor en 4 niveles de prioridad en la fila de investigación. El nivel 1 muestra 61 proveedores para revisión inmediata: combina indicadores de riesgo, detección de anomalías y registros externos de sanciones (SAT EFOS, SFP, ASF) en un solo indicador de prioridad (IPS).»
- `i18n/locales/es/common.json:147` · «3.1 millones de contratos puntuados por una regresión logística entrenada con la base de casos etiquetados de RUBLI, con información anterior a cada contrato. AUC encadenado hacia adelante 0.827, tasa de alto riesgo cercana a 10% — dentro de la meta de calibración propia de RUBLI de 2–15%. Los puntajes miden similitud con casos etiquetados, no prueba de corrupción.» → «3.18 millones de contratos con indicador de riesgo, calculado por una regresión logística entrenada con la base de casos documentados de RUBLI con información anterior a cada contrato. AUC de 0.827 en años que el modelo no vio; tasa de alto riesgo cercana al 10%, dentro de la meta de calibración propia de RUBLI (2–15%). El indicador mide la similitud con casos documentados: es un indicador de riesgo, no una prueba.»
- `i18n/locales/es/common.json:152` · «Puntuación alta = fuerte similitud con patrones de fraude documentados. Es clasificación para investigación, no prueba.» → «Un indicador alto significa una fuerte similitud con patrones de riesgo documentados. Sirve para ordenar la investigación: es un indicador de riesgo, no una prueba.»
- `i18n/locales/es/common.json:154` · «10 narrativas de análisis profundo — desde» → «10 narrativas de análisis profundo, desde»
- `i18n/locales/es/common.json:178,203` · «Pista enviada — nuestro equipo investigará» → «Pista enviada. RUBLI la revisará.»
- `i18n/locales/es/common.json:187` · «¿Tienes información sobre presunto fraude en contrataciones? Compártela con nuestro equipo.» → «¿Tiene información sobre un presunto fraude en contrataciones? Compártala con RUBLI.»
- `i18n/locales/es/common.json:194` · «Describe el patrón de fraude sospechado, lo observado, datos o patrones de soporte…» → «Describa el patrón de fraude sospechado, lo que observó y los datos que lo respaldan…»
- `i18n/locales/es/common.json:218` · «Los puntajes de riesgo son calculados por un modelo de aprendizaje automático entrenado con la base de casos etiquetados de RUBLI» → «Los indicadores de riesgo los calcula un modelo de aprendizaje automático entrenado con la base de casos documentados de RUBLI»
- `i18n/locales/es/common.json:218` · «Los puntajes miden la similitud estadística con esos casos — no son determinaciones legales ni prueba de ilegalidad.» → «El indicador mide la similitud estadística con esos casos: es un indicador de riesgo, no una prueba ni una determinación legal.»
- `i18n/locales/es/common.json:273` · «"groupContracts": "Contratos — mayor riesgo primero"» → «"groupContracts": "Contratos: mayor riesgo primero"»
- `i18n/locales/es/common.json:318` · «"desc": "Nivel 1 — 61 proveedores para revisión inmediata"» → «"desc": "Nivel 1: 61 proveedores para revisión inmediata"»
- `i18n/locales/es/common.json:338` · «"desc": "Procedimientos competitivos con un solo adjudicado"» → «"desc": "Licitaciones e invitaciones con un solo adjudicado"»
- `i18n/locales/es/common.json:424` · «Definitivo: La autoridad fiscal ha confirmado formalmente que es una empresa fantasma. Presunto: En investigación.» → «Definitivo: aparece en la lista definitiva del SAT de empresas que facturan operaciones simuladas (EFOS). Presunto: en revisión del SAT.»
- `i18n/locales/es/common.json:441` · «Generado automáticamente — requiere verificación periodística» → «Generado automáticamente; requiere verificación periodística»
- `i18n/locales/es/common.json:468` · «"tooltipAvgRisk": "Puntuación de riesgo promedio"» → «"tooltipAvgRisk": "Indicador de riesgo promedio"»
- `i18n/locales/es/common.json:532` · «"copied": "¡Copiado!"» → «"copied": "Copiado"»
- `i18n/locales/es/common.json:555` · «Error al enviar — vuelva a intentarlo.» → «Error al enviar. Vuelva a intentarlo.»
- `i18n/locales/es/common.json:566` · «¿Qué ocurrió? ¿Qué esperabas? Incluye IDs o valores relevantes.» → «¿Qué ocurrió? ¿Qué esperaba? Incluya los identificadores o valores relevantes.»
- `i18n/locales/es/common.json:569` · «"emailNote": "(opcional — para seguimiento)"» → «"emailNote": "(opcional, para seguimiento)"»
- `i18n/locales/es/common.json:571` · «"success": "Gracias, lo recibimos."» → «"success": "Gracias, su reporte se recibió."»
- `i18n/locales/es/common.json:572` · «"successDetail": "Lo revisaremos. Si dejó un correo, le escribiremos cuando se resuelva."» → «"successDetail": "Se revisará. Si dejó un correo, recibirá un mensaje cuando se resuelva."»
- `i18n/locales/es/common.json:576` · «Inicia sesión para enviar comentarios» → «Inicie sesión para enviar comentarios»
- `i18n/locales/es/common.json:584` · «una alerta que consideres incorrecta» → «una alerta que considere incorrecta»
- `i18n/locales/es/common.json:604` · «Generado por RUBLI v0.9.2 — Las puntuaciones de riesgo son indicadores estadísticos, no prueba de corrupción.» → «Generado por RUBLI v0.9.2. Es un indicador de riesgo, no una prueba.»
- `i18n/locales/en/common.json:115` · «"ariaDesc": "Automated investigation queues"» → «"ariaDesc": "RUBLI's investigation queue"»
- `i18n/locales/en/common.json:119` · «"exploreContractsDesc": "Search 3M+ contracts"» → «"exploreContractsDesc": "Search 3.18M contracts"»
- `i18n/locales/en/common.json:138` · «"step2Desc": "3.1 million contracts scored» → «"step2Desc": "3.18 million contracts scored»
- `i18n/locales/en/common.json:415` · «Definitivo: Tax authority has formally confirmed this is a ghost company. Presunto: Under investigation.» → «Definitivo: on the SAT's definitive list of companies invoicing simulated operations (EFOS). Presunto: under SAT review.»
- `i18n/locales/es/common.json:294` · «Explorar 3.2 millones de contratos» → «Explorar 3.18 millones de contratos»

## El Mapa · Cifras: `components/explore/ExploreCanvas.tsx` (changed by `fix/p5-amount-not-price`)

- `:352` · «Cómo México reparte» → «Cómo reparte México su gasto»
- `:465` · «No pudimos cargar el reparto. El servidor no respondió.» → «No se pudo cargar el reparto del gasto: el servidor no respondió.»
- `:260` · «Mayor gasto. Menor riesgo. La paradoja energética.» → «Es el sector que más gasta y tiene uno de los indicadores de riesgo promedio más bajos.»
- `:1243,1822` · «CRÍTICO · INVESTIGAR» → «Riesgo crítico»
- `:1255,1823` · «ALTA PRIORIDAD · REVISAR» → «Riesgo alto»
- `:1279` · «ACTIVIDAD REGULAR · RIESGO BAJO» → «Riesgo bajo»
- `:2058` · «Etiquetas de investigación: DOMINANTE (…), GT (…), T1 (Nivel 1 de ARIA…), patrones P1-P7 detectados.» → «Etiquetas: «dominante» (recibe el 10% o más del gasto de la institución), «caso documentado», «nivel 1 de la fila de investigación» y el nombre del patrón de riesgo.»
- `:1462,2223` · «… — AR 23% — AD 12% — indicador de riesgo prom. …» → «… · alto riesgo 23% · adjudicación directa 12% · indicador de riesgo promedio …»
- `:1810` · «… % en casos GT documentados.» → «… % en casos documentados.»
- `:3375` · «El desvío — frente a la norma del sector» → «La desviación frente a la mediana del sector»
- `:3381` · «interpretar los desvíos con cautela» → «interprete las desviaciones con cautela»
- `:3793` · «Por qué el modelo lo puntuó» → «Qué sube o baja su indicador de riesgo»
- `:3651` · «Sin puntuación» → «Sin indicador de riesgo»
- `:3527` · «El modelo lo califica {n}/100 — {nivel}.» → «Su indicador de riesgo es {n} de 100 ({nivel}).»
- `:2404` · «SAT: EFOS definitivo — facturación de operaciones simuladas» → «En la lista definitiva del SAT de empresas que facturan operaciones simuladas (EFOS)»
- `:2914,2931,3255` · «{n} de {N} sin competencia» → «{n} de {N} sin licitación»

## Pattern pages and methodology (changed by `fix/p5-amount-not-price` and/or `copy/methodology-a-privacy`)

- `pages/PatternDossier.tsx:151–285` · 14 imperatives use ustedes («Verifiquen», «Mapeen», «Abran», «Crucen») → usted («Verifique», «Mapee», «Abra», «Cruce»). Also «lead T1 automático» → «nivel 1 automático de la fila de investigación», «ground-truth» → «base de casos documentados», and «lista negra por fraude fiscal» → «lista definitiva del SAT de empresas que facturan operaciones simuladas (EFOS)».
- `components/RiskExplainer.tsx` (whole file) · the audit counts 21 substantive strings and 17 em-dash strings: change puntuación → indicador de riesgo and replace the em-dash chains with a colon or a full stop. Apply after `copy/methodology-a-privacy` merges, since that branch rewrites this file.
- `i18n/locales/es/methodology.json:276,304` · «debes usar», «Nunca uses» → «debe usar», «Nunca use»
- `i18n/locales/es/methodology.json:168,190` · «Lo encontramos», «Reconstruimos», «aplicamos» → impersonal («Se encontró», «Se reconstruyó», «se aplica»)
- `i18n/locales/es/methodology.json:88,260,267`, `i18n/locales/es/procurementCalendar.json:90`, `pages/VendorProfile.tsx:467` · «AUC encadenado hacia adelante 0.827» → «AUC de 0.827 en años que el modelo no vio»
- `i18n/locales/es/glossary.json:48` · «una constructora ganando contratos de salud. Sugiere empresa fantasma» → «una constructora que gana contratos de salud. Puede indicar una empresa fachada o favoritismo»
- `i18n/locales/es/sectors.json:334` · «Dónde el riesgo se vuelve costoso» → «Donde el riesgo cuesta más». At `:287`, an English string sits in the ES file («Ten years past the EU line»): translate it.

## Portada (Tablero, Campo, board: owned by another agent)

- `components/portada/Tablero.tsx:514` · «desde tu última visita» → «desde su última visita»
- `components/portada/Tablero.tsx:475` · «Cobrado en ComprasMX» → «Contratado en ComprasMX»
- `components/portada/Campo.tsx:127,134` · «monto de la fila» → «monto de la franja»
- `components/portada/Campo.tsx:215` · «Proveedores por fila del campo» → «Proveedores por franja»
- `components/portada/Campo.tsx:146` · «… {n} cargan indicador crítico.» → «… {n} tienen un indicador de riesgo crítico.»
- `components/portada/Campo.tsx:161` · «… {pct}% carga indicador crítico.» → «… el {pct}% tiene un indicador de riesgo crítico.»
- `components/portada/Campo.tsx:192` · «… los {n} de nivel medio o bajo suman en el total de la fila» → «… los {n} de nivel medio o bajo se suman al total de la franja»
- `components/portada/PortadaCards.tsx:105` · «… cada uno como una roseta de señales» → «… cada uno con un diagrama de sus señales»
- `components/portada/PortadaCards.tsx:99` · «Más del registro» → «Otras secciones del registro»
- `pages/Executive.tsx:69` · «anillo: gasto más riesgoso del sector» → «anillo: concentra el gasto con mayor indicador de riesgo de su sector»

The audit's Tablero items 11 and 12 («Corrida de Focos Rojos», «Alza = puntos») are already fixed on main.

## Focos Rojos (`/aria`, `aria.json`: owned by another agent)

- `components/aria/FocosWall.tsx:241` and `components/contracts/ContractsLadder.tsx:216` · «No se pudo cargar la mesa. Prueba la vista Lista.» → «No se pudo cargar esta vista. Pruebe la vista de lista.»
- `components/aria/FocosWall.tsx:354` · «Toca una tarjeta o una fila para abrir su Rayos X; …» → «Toque una tarjeta o un renglón para abrir su detalle; …»
- `pages/AriaQueue.tsx:361` · «El pipeline ARIA aún no se ha ejecutado contra esta base de datos.» → «ARIA todavía no se ha calculado sobre esta base de datos.»
- `pages/AriaQueue.tsx:439,695` · «P5 sobreprecio: no se calcula en producción» → reword once the P5 rename lands (for example «El patrón P5 todavía no se calcula en el sitio.»)
- `pages/AriaQueue.tsx:516` · «Selección trazada en El Atlas · …» → «Selección hecha en El Mapa (Vínculos) · …»
- `pages/AriaQueue.tsx:575` · «Registro de la fila ARIA, ordenado por IPS» → «La fila de investigación, ordenada por el indicador de prioridad (IPS)»
- `components/aria/RegisterRow.tsx:46` · «Rango · GT caso documentado / LEAD vínculo sin verificar / DISC descubrimiento del modelo» → «Origen: caso documentado · vínculo sin verificar · señalado por el modelo»
- `components/aria/RegisterRow.tsx:55` · «E efos sat definitivo · S sanción · W prensa» → «Registros: E = lista EFOS del SAT · S = sanción de la SFP · P = prensa»
- `components/aria/QueueRegisterHeader.tsx:110,114,117` · «{n} descubrimientos del modelo: sin caso documentado, en calibración.» → «{n} señalados por el modelo, sin caso documentado (en calibración).»
- `components/aria/QueueRegisterHeader.tsx:124` · «… proveedores bajo el umbral de triaje. Aparecen por transparencia del método.» → «… proveedores por debajo del umbral de revisión. Se muestran para que el método sea transparente.»
- `components/aria/GhostSuspectsPanel.tsx:126` · «No hay sospechosos en este nivel» → «Ningún proveedor en este nivel»
- `components/aria/GhostSuspectsPanel.tsx:76` · «11 señales independientes — convergen para producir una fila de investigación defendible» → «11 señales independientes; cuando varias coinciden, el proveedor sube en la fila de investigación»
- `components/aria/VerdictBar.tsx:63` · «Confianza para promover a GT» → «Confianza para agregarlo a la base de casos documentados»
- `components/aria/VerdictBar.tsx:79` · «Promover a GT» → «Agregar a la base de casos»
- `i18n/locales/es/aria.json:111` · «Úsalo solo como punto de partida» → «Úselo solo como punto de partida»
- `i18n/locales/es/aria.json:105–106` · «Este proveedor es multinacional o estructural. La concentración refleja su posición de mercado, no evidencia de fraude.» → «Es una empresa multinacional o un proveedor estructural: su concentración refleja su posición en el mercado y no indica fraude.»

## Institutions index, administrations, categories (owned by other agents)

- `components/institutions/TamizTiempo.tsx:562–563` · «Pasa sobre una fila…» → «Pase el cursor sobre un renglón…»
- `components/administrations/ComparePeriodView.tsx:111–125,164` · «El riesgo sistémico es estructural, no cíclico», «deterioro estructural», «Sin diferencia significativa» → plain descriptions with no statistical claim; «Compara…» → «Compare…»
- `i18n/locales/es/administrations.json:148` · «indicador principal de colusión» → «una de las señales de colusión» (the methodology says this signal weighs little)
- `i18n/locales/es/administrations.json:50` · «asumió… heredando» → «asumió… y heredó»
- `i18n/locales/es/administrations.json:228` · «adjudicados sin competencia» → «adjudicados sin licitación»
- `pages/Administrations.tsx:496` · «adjudicaron más de la mitad sin competencia» → «adjudicaron más de la mitad sin licitación»
- `pages/CategoryDossier.tsx:301` · «Después del apagón» → «Después del cierre de CompraNet (28 sep 2025)»
- `pages/CategoryProfile.tsx:1827` · «contratos sin competencia — patrón consistente con captura de mercado» → «contratos sin licitación, un patrón compatible con captura de mercado»

## Outside the pass-1 allowed set (no owner named; pass 2)

- `pages/SpatialMap.tsx:187` · «Sigue:» → «Continúe en:»
- `pages/Atlas.tsx:850` · «Firmas co-adjudicadas: quién ganó partes del mismo procedimiento» → «Empresas que ganaron partes del mismo procedimiento»
- `components/captura/CapturaDock.tsx:58`, `components/captura/Diseccion.tsx:295`, `components/captura/Gravedad.tsx:619` · «Sigue firmando después del apagón» → «Sigue firmando desde el cierre de CompraNet (28 sep 2025)»
- `components/captura/Gravedad.tsx:619` · «cobra el … de su ingreso federal» → «recibe el … de lo que le contrata el gobierno federal»
- `components/captura/Relevo.tsx:39` · «apagón: 28 sep» → «cierre de CompraNet: 28 sep»
- `i18n/locales/es/watchlist.json:27–28,45–46` · «Vigilando» / «Investigando» → «En vigilancia» / «En investigación»
- `i18n/locales/es/journalists.json:12`, `i18n/locales/es/yearinreview.json:61`, `pages/Journalists.tsx:123,235` · «sin competencia» → «sin licitación»
- `pages/Journalists.tsx:123` · «cobraron» → «se les contrataron»
- `i18n/locales/es/nav.json:54,116` · the page name «El Apagón» (the Gap page, hidden behind `GAP_LIVE`) → rename it before the page goes live. The owner decides the name.
