# Cómo nombramos las cosas en RUBLI · Naming standards

> Norma para todo texto visible: páginas, títulos, botones, gráficas, cifras. Español de México primero; el inglés se escribe aparte, no se traduce palabra por palabra. Complementa `CLAUDE.md` (reglas duras de frontend) y `frontend/DESIGN.md`.

## 1 · Reglas (español)

**Palabras sencillas.** Escribimos como una redacción mexicana imprime: la palabra que usaría un lector, no la del modelo ni la de la ley. Si un término técnico es inevitable, va una vez, explicado entre paréntesis: «sin concurso (adjudicación directa)».

| Elemento | Regla | Bien | Mal |
|---|---|---|---|
| Página | Sustantivo o frase corta que diga qué hay; el número lo pone `toc.ts` | «Focos Rojos», «Captura» | «Módulo ARIA v2» |
| Kicker de sección | «§» + frase corta en minúscula inicial | «§ Quién cobra» | «§ ANÁLISIS DE CONCENTRACIÓN HHI» |
| Botón / interruptor | Verbo o nombre del estado, ≤ 3 palabras, convención conocida | «Modo oscuro», «Descargar CSV», «Buscar» | «Noche», «Ejecutar drill» |
| Título de gráfica | Una pregunta o una afirmación llana | «¿Quién se llevó el dinero de las medicinas?» | «Distribución HHI por ramo» |
| Etiqueta de eje / columna | Qué se mide + unidad | «Dinero (MDP)», «Contratos» | «Σ amt» |
| Mensaje de error / vacío | Qué pasó + qué hacer, sin tutear | «No se pudieron cargar los datos. Reintentar.» | «Ups, intenta de nuevo» |

**Dinero.** Toda cifra en pesos que ve el lector lleva su equivalente en dólares **en la edición en inglés**; **la edición en español muestra solo pesos (MXN / MDP)**, decisión del dueño del 2026-10-31 (regla 10 de `CLAUDE.md`). Los helpers ya lo hacen: en español devuelven solo MXN. Encabezados, tarjetas, fichas y la primera cifra de una frase: `formatDualCurrency` (componentes) o `moneyDual` / `mxnDual` (texto armado en `lib/`), con la tasa del año (`MXN_USD_RATES`) cuando la cifra es de un solo año. Tablas, ejes y tooltips: `formatCompactMXN` en la celda; el USD va como `title` (`AmountCell` ya lo hace) o en columna propia. En español: MDP y billones, nunca «B MXN»; «MDP = millones de pesos» la primera vez en cada página.

**Números (es-MX).** 1,234.5 · 47% (sin espacio) · 28 sep 2025 · 2019–25 (guion largo) · años sin separador (2024). Una cifra por frase cuando se pueda; dicha como se habla: «cinco de cada cien», no «4.8 %».

**Entidades.** Proveedores con `formatVendorName` / `formatEntityName`; fuera de su expediente, solo con `<EntityIdentityChip>`. Personas físicas: nombre tal como lo publica CompraNet/ComprasMX + la etiqueta «persona física»; nunca su RFC, CURP ni domicilio. Instituciones: siglas conocidas (IMSS, CFE) o nombre corto; la primera vez, el nombre completo.

**Tono.** Neutro e impersonal; usted solo si hay que dirigirse al lector. Sin tuteo: «Haga clic», «Vuelva a intentarlo», «Recargue la página», «su» en vez de «tu»; mejor aún, una frase sin imperativo cuando suene natural («Conviene comparar seis años», «La investigación comienza aquí»). Nada de signos de exclamación ni adjetivos de alarma: los datos indican, no acusan.

**Mayúsculas.** Tipo oración en español: «Focos rojos del sector salud», salvo nombres propios de páginas ya registrados («Focos Rojos», «El Mapa»). Nunca TODO EN MAYÚSCULAS (la voz de etiqueta de DESIGN.md ya da el peso).

**Términos fijos.** «indicador de riesgo» (nunca probabilidad) · «un solo adjudicado» (licitación con un único participante; D20, se mantiene) · «sin concurso» / «adjudicación directa» · «la fila de investigación» · «Modo claro» / «Modo oscuro».

### Palabras prohibidas

«cola» (usar «fila») · «probabilidad de corrupción» / «X% de probabilidad» · «corrupto», «fraude», «desvío» como afirmación sobre una entidad · «B MXN» en español · «Noche» / «Día» como nombre del tema · siglas del modelo en texto de lectura (AUC, PU, ElasticNet, Mahalanobis, OOD) fuera de Metodología.

### Jerga actual → propuesta llana (no aplicada; decidir caso por caso)

| Hoy en el sitio | Propuesta | Nota |
|---|---|---|
| «hallazgo» / «Hallazgos» (80 usos) | «lo que encontramos» en botones; «Hallazgos» puede quedar como nombre de pestaña | claro en prensa, opaco en un botón |
| «captura», «cautiva» | «empresa que vive de un solo comprador» la primera vez | el nombre de página «Captura» se queda |
| HHI / Herfindahl | «concentración: cuántas empresas se reparten el dinero» | sigla solo en Metodología |
| z-score, percentil 99.5 | «qué tan lejos del promedio», «el 0.5% más alto» | |
| IPS (indicador de prioridad) | «prioridad de revisión» | |
| EFOS / 69-B | «empresa fantasma según el SAT (lista 69-B)» | |
| partida, ramo | «tipo de gasto (partida)», «dependencia (ramo)» | |
| AD (abreviatura) | «directa» | |
| corte | «datos al 28 sep 2025» | |
| apagón | «desde que CompraNet dejó de publicar (28 sep 2025)» la primera vez | |
| señal | «indicador» | |
| tuteo: «Intenta de nuevo», «Haz clic», «tu/tus» | «Vuelva a intentarlo», «Haga clic», «su/sus» | **aplicado** 2026-10-31 (§ 4) |

## 2 · Rules (English)

Plain words, the ones a reader would use. Page names are nouns or plain phrases ("Red Flags", "One buyer, one supplier"); buttons are verbs or the platform convention ("Dark mode", "Download CSV"); chart titles are a question or a plain statement. Every peso figure carries USD next to MXN through the helpers above ("1.2B MXN · ≈US$70M"), at the year's rate when the figure is one year. Say "risk indicator", never "probability of corruption"; "no tender" / "direct award"; "individual" for persona física. Sentence case; no all caps; no exclamation marks. Numbers en-US (1,234.5 · 47% · Sep 28, 2025). Avoid model acronyms outside Methodology, "dossier" and "ledger" in buttons ("profile", "table"), "drill" ("open").

## 3 · Checklist for every new element

1. Is the name a word a reader would say out loud? Is the button the convention (dark mode, download, search)?
2. Spanish written first, natively; English written separately; both present (`rubli-bilingual-audit`).
3. Every peso figure: MXN + USD in English (headline/card: `formatDualCurrency` / `moneyDual`; table: USD as `title` or column).
4. No forbidden word (grep `\b[Cc]ola\b`, «probabilidad»); «indicador de riesgo».
5. Persona física labelled, no identifiers; entities through the chip.
6. Sentence case, es-MX numbers, one figure per sentence where possible.

## 4 · Applied in this change (fix/naming-usd, 2026-10-31)

**Theme switch** — `components/contrato/LiveStatus.tsx` `EditionToggle`: «Noche» / "Night" → shows the mode it switches to: «Modo oscuro» / "Dark mode" (light now) and «Modo claro» / "Light mode" (dark now); `aria-pressed` dropped (the label carries the state); under 480px it shows «Oscuro» / «Claro» ("Dark" / "Light") with the full name as `aria-label`; the stale `[aria-pressed]` style removed from `contrato.css`. Storage key `rubli-edition` and values `day`/`night` unchanged (saved preferences and `theme-boot.js` keep working). Code comments in `kit/motion/scene.ts`, `moneyPaths/MuroScene.tsx` renamed.

**USD sweep** (components added or changed since 2026-10-28). Helpers: `formatDualCurrency(mxn, year?)` gained the optional year; new `moneyDual(v, lang, year?)` (`lib/captura/lectura.ts`, re-exported by destiempo / noSeVe / moneyPaths) and `mxnDual(x, l, year?)` (`lib/moneyPaths/fmt.ts`). Spanish output is unchanged in all of them (MDP), as with `formatDualCurrency`.

| Surface | File | Change |
|---|---|---|
| Kit tables | `kit/ListCells.tsx` `AmountCell` | USD hover `title` on every amount cell (English edition only) |
| Focos Rojos wall | `aria/FocosWall.tsx` | tier totals, «Detrás» line, hover vendor → dual |
| Categoría · hallazgos | `categories/hallazgos/Hallazgos.tsx` | medicine total, ComprasMX total → dual |
| Contrato card | `contracts/ContractCard.tsx` | headline amount (contract-year rate), pair total → dual |
| Vendor dossier objects | `vendor/DossierObjects.tsx` | chapter money → dual |
| Category cover | `category/CategoryCover.tsx` | hero sentence total, «Monto» spec row → dual |
| Kardex | `category/KardexCinta.tsx` | term summary line → dual |
| Rastro del registro | `pages/RastroRegistro.tsx`, `newtabs/RastroPlate.tsx` | recorded spend, the record, featured record → dual |
| Captura | `pages/Captura.tsx`, `captura/Diseccion.tsx`, `lib/captura/lectura.ts` | AMLO majority money, dock stats + captive money, lectura sentences → dual |
| A destiempo | `lib/destiempo/lectura.ts` | lead amounts in four lectura sentences → dual |
| Gasto a ciegas | `pages/NoSeVe.tsx`, `noSeVe/Flujos.tsx` | Tren Maya exercised, 2020–21 contracts, SEDENA 2024, budget per year (year rate) → dual |
| Money paths | `lib/moneyPaths/captura.ts`, `lib/moneyPaths/muro.ts` | contract prose and ficha «Monto» (contract-year rate), ComprasMX line → dual |

**Not changed (known limit):** fixed-width numeral rails (`b.n`, `.dt-n`, `.mp-rail b`, max ~120px, nowrap) and chart axis/labels keep MXN only, where USD would overflow; their sentences carry the USD where they cite money. Spanish shows MXN only: owner decision 2026-10-31, USD belongs to the English edition.

**Usted / neutral pass (2026-10-31).** About 200 «tú» forms in UI copy and `i18n/locales/es` (83 files) converted to usted or neutral phrasing: retries («Vuelva a intentarlo», «Recargue la página»), interaction hints («Haga clic», «Pase el cursor», «Arrastre», «Toque», «Señale»), choices («Elija», «Seleccione», «Escriba»), possessives («su», «los filtros»), account copy («¿No tiene cuenta?», «correo@ejemplo.com»), workspace/watchlist onboarding, «estás aquí» → «página actual». **Skipped (stories/films copy, owner rule):** `lib/story-content.ts`, `lib/story-index.ts`, `lib/atlas-stories.ts` («La plataforma que estás leyendo…»), `pages/StoryNarrative.tsx` («Mira esta investigación…», «Explora los datos…», «Abre los patrones… lleva tu propia investigación»), `pages/Gallery.tsx` («Sigue viendo»), `components/gallery/films/*`.
