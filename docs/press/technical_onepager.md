# RUBLI — Technical One-Pager / Ficha Tecnica

> **SUPERSEDED 2026-10-23** — describes v0.9.1 (look-ahead, replaced). Current model: `docs/MODEL_CARD_v0.9.2.md`; checked claims: `docs/FACTCHECK_V092_2026-10-23.md`.
> **DO NOT SEND (fact-check 2026-10-30, `docs/press/FACTCHECK_2026-10-30.md` § 3):** every model figure below is v0.9.1; `rubli.xyz/api-explorer` is not a route; `github.com/rubliproject/rubli` names the owner (breaks pseudonymity). Owner: rewrite from the model card or delete.
## rubli.xyz | github.com/rubliproject/rubli | Apache 2.0

---

## QUE HACE EL MODELO / WHAT THE MODEL DOES

**ES:** RUBLI (modelo v0.9.1, corrida CAL-v91-202610131004, 13 de octubre de 2026) aplica una sola regresion logistica global con regularizacion ElasticNet sobre 27 indicadores calculados a nivel de contrato y proveedor (21 puntuaciones Z de comportamiento, variables de partida y un conteo de amplitud); 21 tienen peso distinto de cero. Cada indicador se normaliza respecto a la media y desviacion estandar del sector y año correspondiente, de modo que un contrato de adjudicacion directa en Defensa (donde es la norma) no recibe la misma penalizacion que uno en Educacion (donde es la excepcion). El modelo produce una puntuacion entre 0 y 1 que refleja similitud estadistica con contratos de casos etiquetados. No es una probabilidad de corrupcion.

**EN:** RUBLI (model v0.9.1, run CAL-v91-202610131004, October 13, 2026) applies a single global ElasticNet logistic regression over 27 indicators computed at the contract and vendor level (21 behavioural z-scores, budget-line features and a breadth count); 21 carry non-zero weight. Each indicator is normalized against the sector-year mean and standard deviation, so a direct award in Defense (where it is the norm) is not penalized the same as one in Education (where it is the exception). The model produces a score from 0 to 1 reflecting statistical similarity to contracts in labelled cases. It is not a probability of corruption.

**Coeficientes mas grandes / Largest coefficients:**
- `price_volatility` — varianza del tamaño de contratos del proveedor vs. norma sectorial (coef. +0.729)
- `price_ratio` — monto del contrato / mediana sectorial (coef. +0.449)
- `rt4_log` (amplitud) — instituciones federales atendidas antes del año del contrato, en escala logaritmica: los proveedores de un solo comprador puntuan MAS BAJO. Va en contra del patron de captura; limitacion conocida (coef. +0.290)
- `vendor_concentration` — participacion de mercado del proveedor en su sector (coef. +0.242)
- `cobid_herfindahl` — concentracion de relaciones de co-licitacion (coef. +0.193)
- `amount_residual_z` — residuo del monto frente a lo esperado (coef. -0.142)
- `recency_z` — dias desde el contrato anterior del proveedor; contratar con frecuencia sube la puntuacion (coef. -0.092)

**Arquitectura:** un solo modelo global; las diferencias entre sectores entran por la normalizacion Z por sector y año. Correccion PU-learning (Elkan & Noto 2008), c=0.439. No se publican intervalos de confianza por contrato.

---

## VALIDACION / VALIDATION METHODOLOGY

| Metrica | Valor |
|---|---|
| Casos etiquetados (ground truth) | 1,417 hoy (1,417 al entrenar): 361 de prensa, 25 de registros oficiales, 1 de auditoria, 989 pistas surgidas del modelo o de ARIA y documentadas por analistas, 41 de otro origen. La mayoria no son resoluciones. |
| AUC-ROC en la prueba apartada | 0.852 — 3,566 contratos, dentro de la ventana de su caso, de 106 proveedores de casos que nunca entraron al entrenamiento |
| AUC-ROC de entrenamiento | 0.843 |
| Modelo anterior (v0.8.5) | 0.807 en la misma prueba apartada; su AUC de prueba de 0.785 no pudo reproducirse y ya no se cita |
| Tasa de alto riesgo | 9.9% — 302,640 contratos (meta de calibracion propia de RUBLI: 2-15%; no es un rango de la OCDE) |
| Contratos riesgo critico (≥0.60) | 147,550 (4.83%) |

Casos de prensa usados en entrenamiento incluyen: Segalmex, compras COVID-19, La Estafa Maestra, Odebrecht-PEMEX, Grupo Higa/Casa Blanca.

---

## FUENTES DE DATOS / DATA SOURCES

| Fuente | Registros | Uso |
|---|---|---|
| COMPRANET (SE) | 3,051,294 contratos puntuados 2002-2025 | Base principal de analisis |
| SAT EFOS (Art. 69-B definitivo) | 13,960 empresas | Cruce para deteccion de factureras |
| SFP — Sistema de Proveedores Sancionados | 2,395 registros | Bandera de inhabilitados (coincidencia por nombre salvo que ambos lados tengan RFC) |

---

## LIMITACIONES CONOCIDAS / KNOWN LIMITATIONS (importantes para citar correctamente)

1. **Fraude en ejecucion es invisible.** RUBLI analiza datos de adjudicacion (COMPRANET). No tiene acceso a informacion sobre ejecucion: sobreprecios durante obra, trabajadores fantasma, sustitucion de materiales. Infraestructura y construccion estan sistematicamente subestimados.

2. **Correlacion no es causalidad.** Una puntuacion alta indica similitud estadistica con patrones conocidos. No es determinacion de responsabilidad ni prueba de conducta ilicita.

3. **Las etiquetas son proveedores, no contratos probados.** Cada contrato de un proveedor vinculado a un caso, dentro de los años del caso y con cualquier comprador, cuenta como positivo; cerca del 9 % de los casos tiene una fuente independiente verificable y solo 8 contratos en toda la base estan nombrados por una fuente externa. El modelo ordena años-proveedor de empresas que despues aparecen vinculadas a casos documentados; no detecta contratos corruptos. Puede no ver corrupcion de pequeña escala o con mecanismos distintos.

4. **Calidad de datos varia por periodo.** Los registros 2002-2010 tienen cobertura de RFC de 0.1%. Los puntajes de ese periodo son menos confiables.

5. **No hay identificacion definitiva de proveedores.** El mismo proveedor puede aparecer bajo multiples grafias en distintos años.

---

## ACCESO TECNICO / TECHNICAL ACCESS

- Interfaz web: **rubli.xyz**
- Explorador de API: **rubli.xyz/api-explorer**
- Codigo fuente: **github.com/rubliproject/rubli** (Apache 2.0)
- Documentacion metodologica: **rubli.xyz** (seccion Metodologia)
