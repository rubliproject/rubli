# Comunicado de prensa

**EMBARGO: no publicar antes del martes 17 de noviembre de 2026, [HORA] hora del centro de México.**

<!--
Fuentes: cada cifra se volvió a leer en producción (rubli.xyz, API de solo lectura) el 30-oct-2026.
Tabla de afirmaciones, endpoint por cifra y calificación: docs/press/FACTCHECK_2026-10-30.md (FC30).
Modelo: docs/SCORING.md + /api/v1/analysis/model/calibration (CAL-v92-asof-20261022).
Los documentos que citaba la versión anterior (FACTCHECK_2026-10-22/20, DATA_HORIZON, INSTITUTION_SCOPE)
no están en main; FC30 los sustituye. Las cifras se mueven con la recarga semanal de ComprasMX
(próxima: 1-nov-2026): volver a leerlas en FC30 § 4 la semana del lanzamiento.
-->

## RUBLI, una herramienta abierta y gratuita, ordena 3 millones de contratos federales para que el periodismo sepa dónde mirar

**Un indicador de riesgo, no un veredicto: señala qué contratos se parecen a los de proveedores vinculados después a casos documentados. No identifica contratos corruptos; la verificación sigue siendo trabajo de reporteo.**

MÉXICO, 17 de noviembre de 2026. RUBLI (rubli.xyz) es una plataforma independiente, gratuita y de código abierto que analiza **3,178,884 contratos federales con monto válido**: 3,055,805 registrados en CompraNet entre 2002 y 2025 y 123,079 de ComprasMX (2025–2026) [FC30 #1–3]. No pide registro. La hace un equipo que publica de forma seudónima para proteger la independencia del trabajo. No recibe dinero de partidos ni de dependencias de gobierno.

**Qué encontró** (cada cifra se puede revisar en la página indicada):

1. **3,912 empresas viven de un solo comprador federal.** Cada una recibió al menos 80 % de su dinero federal de una sola institución, con al menos 50 millones de pesos y en al menos tres años distintos. Son 149 compradores federales y 1.78 billones de pesos entre 2002 y 2025. De ellas, 831 siguen con contratos federales después del 28 de septiembre de 2025 (ComprasMX, hasta octubre de 2026). *Página: Un comprador, una empresa, rubli.xyz/captura* [FC30 #13–14].
2. **De cada 100 pesos que gastó el IMSS, 23 fueron a 1,114 empresas que dependen de él** en ese mismo sentido. *Página: Un comprador, una empresa, rubli.xyz/captura* [FC30 #15–16].
3. **871 contratos de más de 1,000 millones de pesos se llevan 26 % de todo el dinero registrado** (CompraNet y ComprasMX). *Página: El Archivo, rubli.xyz/contracts* [FC30 #17].
4. **Ninguna de las doce entidades del modelo Bienestar aprueba.** La mejor saca 5.7 de 10. Entre todas compraron 785 mil millones de pesos en 424,197 contratos (CompraNet y ComprasMX). *Página: Instituciones, rubli.xyz/institutions (la calificación de cada una)* [FC30 #18–19].

**Qué no es RUBLI**

- **Es un indicador, no una prueba.** Un indicador de riesgo alto significa que un contrato comparte rasgos estadísticos con los contratos de proveedores vinculados a casos documentados. No dice que ese contrato sea irregular; no es una probabilidad de corrupción ni una determinación de responsabilidad.
- **El modelo es la versión 0.9.2** (octubre de 2026): una regresión logística ElasticNet con corrección PU sobre 17 variables: el historial de cada proveedor solo mira años anteriores al contrato; las comparaciones con su sector usan los últimos tres años sin contar el propio contrato. Su métrica es un **AUC encadenado hacia adelante**: se entrena con años anteriores y se evalúa en el año siguiente (2019 a 2025, por proveedor y año). Mide qué tan bien el modelo ordena, por encima del resto, los proveedores-año de empresas que después quedaron vinculadas a casos documentados; no mide si detecta contratos corruptos. Vale **0.827**, con intervalo de confianza de 95 % de 0.763 a 0.883; controlando por el tamaño del proveedor, 0.741 [FC30 #25–28]. Es otra prueba, más dura, y no se compara con el 0.852 que se publicaba antes. **El modelo anterior (v0.9.1) usaba datos de años posteriores al contrato; una prueba pre-registrada mostró que su ventaja venía de ahí, y fue reemplazado** [FC30 #29]. Las etiquetas de entrenamiento no son contratos señalados uno por uno: marcan todos los contratos de un proveedor vinculado a un caso, dentro de los años del caso y con cualquier comprador. De los 1,417 casos, cerca de 9 % tiene una fuente independiente verificable (auditoría, sanción, expediente judicial o nota de prensa con documento); el resto se apoya en análisis propios de RUBLI o en fuentes que aún no verificamos [GT_LABEL_AUDIT_2026-10-31 § 2]. Reparto por nivel al 30 de octubre de 2026, de 3,178,884 contratos calificados: crítico 5.17 %, alto 4.78 % (alto y crítico juntos, 9.95 %), medio 12.48 %, bajo 77.57 % [FC30 #32].
- **CompraNet está congelado desde el 28 de septiembre de 2025**, cuando fue sustituido por ComprasMX [FC30 #7].
- **ComprasMX ya tiene indicador.** RUBLI carga cada semana los datos abiertos de ComprasMX: 123,079 contratos de 2025 y 2026 con monto válido al corte del 28 de octubre de 2026 [FC30 #3–4]. v0.9.2 los califica con la misma receta, porque todas sus variables existen sin mirar al futuro. «Sin indicador» queda solo para contratos pendientes de calificar y montos no válidos (vacíos, cero o de más de 100 mil millones de pesos) [FC30 #9].
- **Los datos oficiales traen errores.** 15 contratos con errores de decimales se corrigieron o excluyeron el 20 de octubre de 2026, y todo contrato de más de 100 mil millones de pesos se rechaza [FC30 #10].
- **No todos los compradores son federales.** Dependencias estatales y municipales también compran por CompraNet: son 88.2 % de los compradores, pero 10.2 % de los contratos y 12.0 % del dinero. Pesan mucho en cualquier conteo o promedio por institución; por eso RUBLI muestra solo compradores federales de forma predeterminada [FC30 #20].
- RUBLI ve la adjudicación, no la ejecución de la obra. Los registros de 2002 a 2010 son los de menor calidad.

**Cómo citarlo**

> RUBLI Project (2026). *RUBLI — Mexican Federal Procurement Dataset (2002–2026)* (versión 2026.11) [conjunto de datos]. Zenodo. https://doi.org/10.5281/zenodo.23694198

Datos: El sitio y las próximas versiones: CC BY-NC 4.0. Las versiones 2026.10 y 2026.11 en Zenodo se publicaron bajo CC BY 4.0 y conservan esa licencia. Código: Apache 2.0. La versión 2026.11 (publicada el 27 de octubre de 2026; corte del 17 de octubre de 2026) es una foto fija: el sitio se actualiza cada semana. Para citar siempre la versión más reciente: https://doi.org/10.5281/zenodo.23209797 [FC30 #44–47]. Metodología completa: rubli.xyz/methodology.

**Contacto**

Prensa: prensa@rubli.xyz · Plataforma: rubli.xyz (gratuita, sin registro) · Página de prensa: rubli.xyz/press

---

# Press release (EN)

**EMBARGO: not for publication before Tuesday 17 November 2026, [TIME] Mexico City time.**

## RUBLI, a free and open tool, sorts 3 million federal contracts so reporters know where to look

**A risk indicator, not a verdict: it flags which contracts resemble those of vendors later linked to documented cases. It does not identify corrupt contracts; verification is still reporting work.**

MEXICO, 17 November 2026. RUBLI (rubli.xyz) is an independent, free, open-source platform that analyses **3,178,884 federal contracts with a valid amount**: 3,055,805 recorded in CompraNet between 2002 and 2025 and 123,079 from ComprasMX (2025–2026). No sign-up. It is built by a team that publishes pseudonymously to protect the independence of the work. It takes no money from parties or government agencies.

**What it found** (each figure can be checked on the page named):

1. **3,912 companies live off a single federal buyer.** Each received at least 80 % of its federal money from one institution, with at least 50 million pesos and in at least three different years. That is 149 federal buyers and 1.78 trillion pesos between 2002 and 2025. Of these, 831 still hold federal contracts after 28 September 2025 (ComprasMX, through October 2026). *Page: One buyer, one supplier, rubli.xyz/captura*.
2. **Of every 100 pesos IMSS spent, 23 went to 1,114 companies that depend on it** in that same sense. *Page: One buyer, one supplier, rubli.xyz/captura*.
3. **871 contracts above 1 billion pesos take 26 % of all recorded money** (CompraNet and ComprasMX). *Page: The Archive, rubli.xyz/contracts*.
4. **None of the twelve Bienestar-model entities passes.** The best scores 5.7 out of 10. Together they bought 785 billion pesos in 424,197 contracts (CompraNet and ComprasMX). *Page: Institutions, rubli.xyz/institutions (each one's grade)*.

**What RUBLI is not**

- **It is an indicator, not proof.** A high risk indicator means a contract shares statistical traits with the contracts of vendors linked to documented cases. It does not say that contract is irregular, and it is not a probability of corruption or a finding of liability.
- **The model is version 0.9.2** (October 2026): ElasticNet logistic regression with PU correction over 17 features: each vendor's history looks only at years before the contract; comparisons with its sector use the last three years, leaving the contract itself out. Its metric is a **forward-chained AUC**: trained on earlier years and tested on the next year (2019 to 2025, per vendor and year). It measures how well the model ranks vendor-years of firms later linked to documented cases above the rest; it does not measure detection of corrupt contracts. It is **0.827**, with a 95% confidence interval of 0.763 to 0.883; holding vendor size fixed, 0.741. It is a different, harder test and is not comparable with the 0.852 published before. **The previous model (v0.9.1) used data from years after each contract; a pre-registered test showed its edge came from that, and it was replaced.** Training labels are not contracts flagged one by one: they mark every contract of a vendor linked to a case, within the case's years and with any buyer. Of 1,417 cases, about 9 % have an independently verifiable source (audit, sanction, court file or a press report with documents); the others rely on RUBLI's own analysis or on sources not yet verified. Share by level as of 30 October 2026, of 3,178,884 contracts scored: critical 5.17 %, high 4.78 % (high and critical together, 9.95 %), medium 12.48 %, low 77.57 %.
- **CompraNet has been frozen since 28 September 2025**, when ComprasMX replaced it.
- **ComprasMX now has an indicator.** RUBLI loads ComprasMX open data every week: 123,079 contracts from 2025 and 2026 with a valid amount at the 28 October 2026 cut-off. v0.9.2 scores them with the same recipe, since all its inputs exist without looking ahead. «Sin indicador» (no indicator) remains only for contracts pending scoring and invalid amounts (blank, zero or above 100 billion pesos).
- **Official data contains errors.** 15 contracts with decimal errors were corrected or excluded on 20 October 2026, and any contract above 100 billion pesos is rejected.
- **Not every buyer is federal.** State and municipal agencies also buy through CompraNet: 88.2 % of buyers, but 10.2 % of contracts and 12.0 % of money. They weigh heavily in any per-institution count or average, so RUBLI shows federal buyers only by default.
- RUBLI sees the award, not the execution of the work. 2002–2010 records are the weakest.

**How to cite**

> RUBLI Project (2026). *RUBLI — Mexican Federal Procurement Dataset (2002–2026)* (version 2026.11) [dataset]. Zenodo. https://doi.org/10.5281/zenodo.23694198

Data: The site and future releases: CC BY-NC 4.0. Releases 2026.10 and 2026.11 on Zenodo were published under CC BY 4.0 and keep that licence. Code: Apache 2.0. Release 2026.11 (published 27 October 2026; cut-off 17 October 2026) is a frozen snapshot: the site updates weekly. To always cite the latest release: https://doi.org/10.5281/zenodo.23209797. Full methodology: rubli.xyz/methodology.

**Contact**

Press: prensa@rubli.xyz · Platform: rubli.xyz (free, no sign-up) · Press page: rubli.xyz/press
