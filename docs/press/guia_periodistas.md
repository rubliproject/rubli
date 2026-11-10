# Guía para periodistas: RUBLI en 10 minutos

<!-- Cifras: releídas en producción (API de solo lectura) el 30-oct-2026; tabla con endpoint y calificación por cifra:
docs/press/FACTCHECK_2026-10-30.md (FC30). Modelo: docs/SCORING.md. Reglas de grados: frontend/src/lib/tiers.ts.
Ejemplo del § 4: frontend/src/lib/moneyPaths/rastro.data.json (leído 2026-10-29) + /api/v1/contracts/2926346.
Las cifras se mueven con la recarga semanal de ComprasMX: releerlas la semana del lanzamiento (FC30 § 4). -->

RUBLI (rubli.xyz) es gratuito y no pide registro. Cubre 3,178,884 contratos federales con monto válido: 3,055,805 de CompraNet (2002 – 28 de septiembre de 2025) y 123,079 de ComprasMX (2025–2026, recarga semanal; corte del 28 de octubre de 2026). Todos tienen indicador de riesgo del modelo v0.9.2.

## 1. Dónde mirar (10 minutos)

| Minuto | Página | Para qué |
|---|---|---|
| 0–1 | **Portada** (`/`) | El panorama: cuánto dinero, en qué sectores, qué cambió. |
| 1–3 | **Un comprador, una empresa** (`/captura`) | Empresas que reciben al menos 80 % de su dinero federal de un solo comprador. Busque la institución que cubre. |
| 3–5 | **Focos Rojos** (`/aria`) | La fila de investigación: proveedores ordenados por prioridad, con su patrón. La sección «Nuevos» muestra proveedores que ningún caso público nombra todavía. |
| 5–6 | **Instituciones** (`/institutions`) | Calificaciones de 0 a 10 por sexenio. Compare con instituciones del mismo nivel. |
| 6–7 | **El Rastro de un Peso** (`/rastro`) | Siga un peso de una institución a una categoría, a un proveedor y a un contrato. |
| 7–8 | **El Archivo** (`/contracts`) | Todos los contratos, con filtros. Cada fila abre la ficha del contrato. |
| 8–9 | **A destiempo** (`/antes-del-fallo`) | Contratos que empezaron antes del fallo y, en su capítulo «El Mismo Día», lotes de contratos firmados el mismo día. |
| 9–10 | **Metodología** (`/methodology`) y **Prensa** (`/press`) | Cómo se calcula todo, límites que deben citarse, cómo citar. |

Cada proveedor, institución, categoría y contrato tiene su expediente propio (`/vendors/…`, `/institutions/…`, `/categories/…`, `/contracts/…`).

## 2. Cómo leer el indicador de riesgo

- Es un número de 0 a 1 por contrato. Mide cuánto se parece el contrato a los contratos de proveedores que después aparecen vinculados a casos documentados. El modelo ordena años-proveedor; no detecta contratos corruptos, y cerca del 9 % de los casos que lo etiquetan tiene una fuente independiente verificable.
- Niveles: **crítico** desde 0.60, **alto** desde 0.40, **medio** desde 0.25, **bajo** por debajo. Reparto por nivel al 30 de octubre de 2026, de 3,178,884 contratos calificados: crítico 5.17 %, alto 4.78 % (alto y crítico juntos, 9.95 %), medio 12.48 %, bajo 77.57 % (las cifras de v0.9.1 ya no aplican).
- **No es una probabilidad.** Un 0.70 no significa «70 % de probabilidad de corrupción».
- Por encima de 0.60 la escala se comprime para que los contratos críticos sigan ordenados: el máximo que muestra el sitio es 0.95. Un 0.95 es «lo más alto de crítico», no una certeza.
- Las variables que más pesan son la amplitud del proveedor (a cuántas instituciones había vendido antes), la volatilidad de precios, la concentración previa de sus compradores y la razón de precio frente al sector. Del proveedor, su historial solo mira años anteriores al contrato; las comparaciones con su sector usan los últimos tres años sin contar el propio contrato. La adjudicación directa se compara contra la norma del sector y el año.
- Modelo v0.9.2. AUC encadenado hacia adelante 0.827 (intervalo de 95 %: 0.763 a 0.883; 0.5 es azar, 1 es perfecto): se entrena con años anteriores y se prueba en el siguiente, 2019 a 2025. Controlando por tamaño del proveedor, 0.741. Mide qué tan bien ordena años-proveedor de empresas que después aparecen vinculadas a casos documentados, no si acierta con contratos corruptos. No lo compare con el 0.852 de antes: es otra prueba.
- **El modelo anterior (v0.9.1) usaba datos de años posteriores al contrato** y fue reemplazado tras una prueba pre-registrada. No cite una calificación de v0.9.1 como actual; vuelva a consultarla.
- **«Sin indicador»** queda para contratos pendientes de calificar y montos rechazados. No significa riesgo bajo. Significa que no se calculó.
- El indicador no detecta captura de un comprador: para eso está la página Un comprador, una empresa (`/captura`).

## 3. Cómo leer las calificaciones de instituciones

- Escala de **0 a 10**, por sexenio. **Aprobada** desde 6.0, **reprobada** por debajo. El número se redondea antes de decidir, así que un 6.0 nunca es reprobada.
- Bandas por debajo del aprobado: 4.4 y 2.8 marcan los cortes intermedios.
- Cada institución se califica contra sus pares (mismo nivel de gobierno, tipo y tamaño). Lea la calificación junto con su intervalo: si el intervalo cruza el 6.0, la institución está en la línea.
- **Cuidado con los rankings mezclados.** La página muestra solo compradores federales de forma predeterminada. Si elige «todos», los compradores estatales y municipales, muchos con pocos contratos, llenan los extremos de la tabla: de las 229 instituciones en la banda más alta (7.6 o más), 203 son estatales o municipales; en la más baja (menos de 2.8), 159 de 168.

## 4. Cómo verificar un hallazgo hasta el contrato

Ejemplo real, IMSS en El Rastro de un Peso:

1. Abra `/rastro`. Siga 100 pesos que el IMSS ejerció en medicinas en 2024 según la Cuenta Pública: 47 aparecen en el registro de contratos, 42 se asignaron sin concurso, 14 fueron a los proveedores que RUBLI revisaría primero y 2 a un solo proveedor, Farmacéuticos Maypo, por adjudicación directa.
2. El rastro termina en un contrato: **rubli.xyz/contracts/2926346** (601,252,745 pesos, adjudicación directa del 23 de diciembre de 2024).
3. En la ficha del contrato copie el **número de procedimiento** y el **expediente**.
4. Búsquelos en los archivos de datos abiertos de CompraNet (datos.gob.mx) y confirme comprador, proveedor, monto y fecha.
5. Pida el contrato, el fallo y los entregables por transparencia (Plataforma Nacional de Transparencia).
6. Busque a la empresa en el listado del SAT (artículo 69-B) y en el directorio de sancionados de la Función Pública.
7. Pida su versión a la institución y a la empresa antes de publicar.

Si un número de RUBLI no coincide con la fuente oficial, escríbanos a prensa@rubli.xyz: lo corregimos y lo anotamos.

## 5. Qué no afirmar

| Incorrecto | Correcto |
|---|---|
| «La empresa X tiene 70 % de probabilidad de ser corrupta.» | «Según RUBLI, los contratos de la empresa X tienen un indicador de riesgo de 0.70: comparten rasgos estadísticos con los contratos de proveedores vinculados a casos documentados. No es prueba de conducta ilícita.» |
| «RUBLI detectó 3,912 casos de captura.» | «RUBLI identifica 3,912 empresas que recibieron al menos 80 % de su dinero federal de un solo comprador.» |
| «El modelo de RUBLI se entrenó con contratos corruptos» o «detecta contratos corruptos». | «El modelo ordena contratos según su parecido con los de proveedores vinculados a casos documentados, en los años del caso.» |
| «831 empresas capturadas siguen firmando contratos.» | «831 de esas empresas siguen con contratos federales después del 28 de septiembre de 2025 (ComprasMX, hasta octubre de 2026).» |
| «El Mismo Día encontró 1,622 casos de fraccionamiento.» | «El Mismo Día agrupa 1,622 lotes de contratos el mismo día. Agrupamientos parecidos aparecen con topes ficticios, así que no prueban fraccionamiento.» |
| «Salud pasó de 16 % a 43 % del gasto federal.» | «En CompraNet, salud pasó de 16 % del dinero registrado con Fox a 43 % con AMLO, en parte porque Pemex y CFE salieron del sistema.» |
| «Un contrato sin indicador tiene riesgo bajo.» | «Ese contrato aún no tiene indicador de riesgo.» |
| «El gasto del gobierno en 2025 fue…» (con datos de CompraNet) | «El dinero registrado en CompraNet hasta el 28 de septiembre de 2025 fue…» |
| «El Arranque muestra empresas nuevas que…» | «El Arranque muestra proveedores que recibieron al menos 100 millones de pesos en su primer año de contratos.» |

En el sitio, los proveedores que son personas físicas aparecen con el nombre que publicó CompraNet o ComprasMX, siempre con la etiqueta «persona física». Su RFC, CURP, domicilio o cualquier otro dato que los identifique nunca se muestran. El RFC de las empresas sí puede aparecer. En el archivo de datos descargable, las personas físicas aparecen como «PERSONA FISICA <id>».

## 6. Preguntas frecuentes

**¿Esto prueba corrupción?** No. Es un indicador que dice dónde mirar. La prueba sale de documentos, auditorías y reporteo.

**¿Los contratos después de septiembre de 2025 tienen indicador?** Sí, desde v0.9.2. CompraNet se congeló el 28 de septiembre de 2025; los contratos posteriores vienen de ComprasMX y se califican con el mismo modelo.

**¿Qué tan confiables son los datos viejos?** Los de 2002 a 2010 son los más débiles: casi no traen RFC, y su riesgo está subestimado.

**¿Hay errores en los datos oficiales?** Sí. Corregimos o excluimos 15 contratos con errores de decimales el 20 de octubre de 2026 y rechazamos todo contrato de más de 100 mil millones de pesos.

**¿Por qué cambian las cifras?** El modelo se reentrena y los datos se corrigen. Cite la fecha de consulta y la versión del conjunto de datos.

**¿Cómo cito el conjunto de datos?** RUBLI Project (2026), *RUBLI — Mexican Federal Procurement Dataset (2002–2026)*, versión 2026.11, Zenodo, https://doi.org/10.5281/zenodo.23694198 (publicada bajo CC BY 4.0, que conserva; el sitio y las próximas versiones: CC BY-NC 4.0). La versión más reciente siempre: https://doi.org/10.5281/zenodo.23209797.

**¿Quién está detrás?** Un equipo independiente que publica de forma seudónima. Contacto: prensa@rubli.xyz.

---

# Reporter's guide: RUBLI in 10 minutes (EN)

RUBLI (rubli.xyz) is free and needs no sign-up. It covers 3,178,884 federal contracts with a valid amount: 3,055,805 from CompraNet (2002 – 28 September 2025) and 123,079 from ComprasMX (2025–2026, reloaded weekly; cut-off 28 October 2026). All carry a risk indicator from model v0.9.2.

## 1. Where to look (10 minutes)

| Minute | Page | What for |
|---|---|---|
| 0–1 | **Front page** (`/`) | The overview: how much money, which sectors, what changed. |
| 1–3 | **One buyer, one supplier** (`/captura`) | Companies that get at least 80 % of their federal money from one buyer. Look up the institution you cover. |
| 3–5 | **Red Flags** (`/aria`) | The investigation queue: vendors ranked by priority, with their pattern. «Nuevos» lists vendors no public case names yet. |
| 5–6 | **Institutions** (`/institutions`) | 0–10 grades per sexenio. Compare against peers at the same level. |
| 6–7 | **The Trail of a Peso** (`/rastro`) | Follow a peso from an institution to a category, a vendor and a contract. |
| 7–8 | **The Archive** (`/contracts`) | Every contract, with filters. Each row opens the contract record. |
| 8–9 | **Out of time** (`/antes-del-fallo`) | Contracts that started before the award and, in its «The Same Day» chapter, lots of contracts signed on the same day. |
| 9–10 | **Methodology** (`/methodology`) and **Press** (`/press`) | How everything is computed, limits to cite, how to cite. |

Every vendor, institution, category and contract has its own dossier.

## 2. Reading the risk indicator

- A number from 0 to 1 per contract. It measures how much a contract resembles the contracts of vendors linked to documented cases. Labels mark every contract of those vendors in the case's years, with any buyer: they are not irregular contracts flagged one by one, and only about 9 % of cases have an independently verifiable source.
- Levels: **critical** from 0.60, **high** from 0.40, **medium** from 0.25, **low** below. Share by level as of 30 October 2026, of 3,178,884 contracts scored: critical 5.17 %, high 4.78 % (high and critical together, 9.95 %), medium 12.48 %, low 77.57 % (the v0.9.1 figures no longer apply).
- **It is not a probability.** 0.70 does not mean «70 % chance of corruption».
- Above 0.60 the scale is compressed so critical contracts stay ranked: the highest the site shows is 0.95. Read 0.95 as «top of critical», not as certainty.
- The heaviest features are vendor breadth (how many institutions it had sold to before), price volatility, the prior concentration of its buyers and price ratio to the sector. For the vendor, its history looks only at years before the contract; comparisons with its sector use the last three years, leaving the contract itself out. Direct award is compared to the sector-year norm.
- Model v0.9.2. Forward-chained AUC 0.827 (95% interval 0.763 to 0.883; 0.5 is chance, 1 is perfect): trained on earlier years, tested on the next, 2019 to 2025. Holding vendor size fixed, 0.741. It measures how well the model ranks vendor-years of suppliers later linked to documented cases, not whether it finds corrupt contracts. Do not compare it with the earlier 0.852: it is a different test.
- **The previous model (v0.9.1) used data from years after each contract** and was replaced after a pre-registered test. Do not quote a v0.9.1 score as current; look it up again.
- **«Sin indicador»** remains for contracts pending scoring and rejected amounts. That does not mean low risk. It means not computed.
- The indicator does not detect buyer capture: use the One buyer, one supplier page (`/captura`) for that.

## 3. Reading institution grades

- **0 to 10**, per sexenio. **Aprobada** (passed) from 6.0, **reprobada** (failed) below. The number is rounded first, so 6.0 is never a fail.
- Bands below the pass mark: 4.4 and 2.8 are the intermediate cuts.
- Each institution is graded against peers (same level of government, type and size). Read the grade with its interval: if the interval crosses 6.0, the institution is on the line.
- **Beware mixed rankings.** The page shows federal buyers only by default. If you choose «all», state and municipal buyers, many with few contracts, fill both ends of the table: of the 229 institutions in the top band (7.6 or more), 203 are state or municipal; in the bottom band (below 2.8), 159 of 168.

## 4. Verifying a finding back to the contract

Real example, IMSS on The Trail of a Peso:

1. Open `/rastro`. It follows 100 pesos IMSS spent on medicines in 2024 according to the Cuenta Pública (federal public accounts): 47 appear in the contract register, 42 were awarded without a tender, 14 went to the suppliers RUBLI would look at first, and 2 to one supplier, Farmacéuticos Maypo, by direct award.
2. The trail ends on one contract: **rubli.xyz/contracts/2926346** (601,252,745 pesos, a direct award of 23 December 2024).
3. On the contract record, copy the **procedure number** and the **file number**.
4. Look them up in CompraNet's open-data files (datos.gob.mx) and confirm buyer, vendor, amount and date.
5. Request the contract, the award ruling and deliverables through the National Transparency Platform.
6. Check the company against the SAT 69-B list and the Public Administration ministry's sanctions register.
7. Ask the institution and the company for comment before publishing.

If a RUBLI number does not match the official source, write to prensa@rubli.xyz: we correct it and log the correction.

## 5. What not to claim

| Wrong | Right |
|---|---|
| «Company X has a 70 % probability of being corrupt.» | «According to RUBLI, company X's contracts have a risk indicator of 0.70: they share statistical traits with documented cases. This is not proof of wrongdoing.» |
| «RUBLI found 3,912 capture cases.» | «RUBLI identifies 3,912 companies that received at least 80 % of their federal money from one buyer.» |
| «831 captured firms keep signing contracts.» | «831 of those companies still hold federal contracts after 28 September 2025 (ComprasMX, through October 2026).» |
| «The Same Day found 1,622 cases of contract splitting.» | «The Same Day groups 1,622 same-day contract lots. Similar groupings appear with fictitious caps, so they do not prove splitting.» |
| «Health went from 16 % to 43 % of federal spending.» | «In CompraNet, health went from 16 % of recorded money under Fox to 43 % under AMLO, partly because Pemex and CFE left the system.» |
| «A contract without an indicator is low risk.» | «That contract has no risk indicator yet.» |
| «Government spending in 2025 was…» (from CompraNet) | «Money recorded in CompraNet through 28 September 2025 was…» |
| «The Head Start shows new companies that…» | «The Head Start shows vendors that received at least 100 million pesos in their first year of contracts.» |

On the site, individual suppliers (personas físicas) appear under the name CompraNet or ComprasMX published, always labelled «persona física». Their RFC, CURP, address or any other identifier is never shown. Company RFCs may appear. In the downloadable data file, individuals appear as «PERSONA FISICA <id>».

## 6. FAQ

**Does this prove corruption?** No. It is an indicator of where to look. Proof comes from documents, audits and reporting.

**Do contracts after September 2025 have an indicator?** Yes, since v0.9.2. CompraNet froze on 28 September 2025; later contracts come from ComprasMX and are scored by the same model.

**How reliable is the old data?** 2002–2010 is the weakest: almost no RFCs, and risk is underestimated.

**Are there errors in the official data?** Yes. We corrected or excluded 15 contracts with decimal errors on 20 October 2026 and reject any contract above 100 billion pesos.

**Why do figures change?** The model is retrained and data is corrected. Cite the access date and the dataset version.

**How do I cite the dataset?** RUBLI Project (2026), *RUBLI — Mexican Federal Procurement Dataset (2002–2026)*, version 2026.11, Zenodo, https://doi.org/10.5281/zenodo.23694198 (published under CC BY 4.0, which it keeps; the site and future releases: CC BY-NC 4.0). Always the latest release: https://doi.org/10.5281/zenodo.23209797.

**Who is behind it?** An independent team that publishes pseudonymously. Contact: prensa@rubli.xyz.
