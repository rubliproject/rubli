"""Spanish versions of the three case-file notes (amount / legal status / COMPRANET)
for the 13 verified `procurement_scandals` rows (docs: casos-compact spec § bilingual).

Adds `amount_note_es`, `legal_status_note_es`, `compranet_note_es` if missing and
fills them by slug. Idempotent; touches nothing else.

    python -m scripts.add_case_notes_es [--db PATH]
"""
import argparse
import sqlite3
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent.parent / "RUBLI_NORMALIZED.db"

# slug: (amount_note_es, legal_status_note_es, compranet_note_es)
NOTES_ES = {
    "segalmex-food-distribution": (
        "SFP (sept. 2024): 2,700 millones de pesos desviados según su estimación, 156 denuncias. Las observaciones de la ASF a la Cuenta Pública 2020 (8,636 millones) no son determinaciones de daño.",
        "156 denuncias presentadas ante la FGR (SFP, sept. 2024); un exdirector de Administración y Finanzas fue vinculado a proceso en 2022. Las fuentes citadas no reportan sentencia firme.",
        "Los contratos directos de LICONSA y DICONSA son visibles; el modelo de riesgo usa 6,326 contratos vinculados.",
    ),
    "odebrecht-pemex-bribery": (
        "Alrededor de 10.5 millones de dólares en sobornos a funcionarios mexicanos, 2010-2014 (acuerdo con el DOJ, dic. 2016). Sin conversión a pesos.",
        "Odebrecht S.A. se declaró culpable en Estados Unidos (21 dic. 2016). El proceso en México se documenta en el caso Lozoya.",
        "Contratos de subsidiarias de PEMEX parcialmente visibles; las obras costa afuera tienen poca exposición en COMPRANET.",
    ),
    "estafa-maestra": (
        "7,670 millones de pesos canalizados por 8 universidades (2013-2014); 3,433 millones sin rastro (Animal Político / MCCI, con base en auditorías de la ASF).",
        "La FGR acusó en 2019 a la exsecretaria de SEDESOL/SEDATU por ejercicio indebido del servicio público; un juez cerró el caso en 2022 y la SCJN lo confirmó el 30 de octubre de 2024. Los procesos contra otros funcionarios se reportan por separado.",
        "Los convenios directos entre dependencias y universidades aparecen en COMPRANET; las subcontrataciones de las universidades a empresas fachada son invisibles.",
    ),
    "grupo-higa-casa-blanca": (
        "Casa valuada en alrededor de 86 millones de pesos (avalúo independiente encargado por Aristegui Noticias, 2014). No hay un total documentado de los contratos públicos de Higa.",
        "La investigación de la SFP (ago. 2015) no encontró conflicto de interés; no hubo proceso penal.",
        "Contratos muy visibles en COMPRANET; el indicador de riesgo responde a la concentración del proveedor y a indicadores de red.",
    ),
    "oceanografia-pemex-fraud": (
        "Presunto fraude de alrededor de 400 millones de dólares contra Banamex (El País, 2025). Sin conversión a pesos.",
        "La fuente citada no reporta sentencia penal firme; el litigio civil contra Citigroup seguía en curso en 2025.",
        "Los contratos de servicios marinos costa afuera son parcialmente visibles; la capa de subsidiarias y subcontratos oculta el panorama completo.",
    ),
    "pemex-emilio-lozoya": (
        "No hay un total en pesos documentado. Los sobornos que Odebrecht admitió en México fueron de alrededor de 10.5 millones de dólares (ver caso Odebrecht).",
        "En juicio; sin sentencia según la fuente más reciente citada (feb. 2024).",
        "Los pagos de sobornos ocurrieron fuera de COMPRANET; los contratos subyacentes son parcialmente visibles a través de subsidiarias de PEMEX.",
    ),
    "linea-12-metro-collapse": (
        "No hay un monto de fraude documentado; la cifra anterior de 26,600 millones de pesos era el costo del proyecto, no una pérdida.",
        "Cargos de la FGJCDMX (2021) por homicidio culposo, lesiones y daño a la propiedad; no hay cargos por fraude.",
        "Las compras de la Ciudad de México no aparecen en el COMPRANET federal; la ciudad usa su propio Sistema de Adquisiciones.",
    ),
    "fertinal-pemex-acquisition": (
        "PEMEX reconoció un sobreprecio de 4,000 millones de pesos en Fertinal (Proceso, 2019, con base en hallazgos de la ASF). PEMEX gastó 26,564 millones en ambas compras.",
        "Agro Nitrogenados forma parte del caso de la FGR contra Lozoya (juicio pendiente); el exdueño de AHMSA aceptó reparar 216 millones de dólares. Las fuentes citadas no reportan cargos aparte por Fertinal.",
        "Adquisición corporativa por decisión del consejo de PEMEX; no es un contrato de compra ordinario en COMPRANET.",
    ),
    "enciclomedia-sep": (
        "ASF: más de 24,000 millones de pesos invertidos en cinco años (gasto, no una cifra de pérdida).",
        "La ASF solicitó sanciones administrativas (2014); la fuente citada no reporta caso penal.",
        "Los contratos de la SEP de esta época (Estructura A) tienen muy baja calidad de datos; la cobertura de COMPRANET para 2003-2006 es mínima.",
    ),
    "tren-maya-fonatur": (
        "Observaciones de la ASF pendientes de solventar en las Cuentas Públicas 2019-2021, 1,736 millones de pesos (MCCI, feb. 2023). Son observaciones, no daño determinado.",
        "Observaciones de la ASF pendientes de aclaración; no se cita caso penal.",
        "Los tramos de FONATUR y SEDENA tienen distinta transparencia; los contratos civiles de FONATUR son visibles, los tramos de SEDENA están exentos.",
    ),
    "insabi-medicine-collapse": (
        "ASF, Cuenta Pública 2021: 940.8 millones de pesos irregulares en la compra consolidada de oncológicos; 751.8 millones aún sin justificar.",
        "Observaciones de la ASF (Cuenta Pública 2021); no se cita caso penal.",
        "Los contratos de emergencia están completos en COMPRANET; las anomalías de concentración y precio son claramente detectables.",
    ),
    "ssp-police-equipment-calderon": (
        "El gobierno de México sostiene que se extrajeron 745.9 millones de dólares de 30 contratos; sentencias civiles en Florida por alrededor de 2,488 millones de dólares (2025) y 578 millones (2026). Sin conversión a pesos.",
        "La condena penal en Estados Unidos (2023) es por narcotráfico, no por compras públicas; los hallazgos sobre contratos son sentencias civiles en Florida (mayo 2025, mayo 2026).",
        "Los contratos de equipo de seguridad tienen poca divulgación en COMPRANET; los bienes clasificados reducen aún más la visibilidad.",
    ),
    "cisen-pegasus-surveillance": (
        "Valor de los contratos: 1,970 millones de pesos (SSPC, 2021); es gasto, no una pérdida determinada.",
        "Contratos dados a conocer por la SSPC (2021); las fuentes citadas no reportan condena relacionada con las compras.",
        "Compras de inteligencia clasificadas por seguridad nacional; sin divulgación en COMPRANET.",
    ),
}
COLS = ("amount_note_es", "legal_status_note_es", "compranet_note_es")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    db = sqlite3.connect(ap.parse_args().db)
    have = {r[1] for r in db.execute("PRAGMA table_info(procurement_scandals)")}
    db.execute("BEGIN")
    for col in COLS:
        if col not in have:
            db.execute(f"ALTER TABLE procurement_scandals ADD COLUMN {col} TEXT")
    n = 0
    for slug, vals in NOTES_ES.items():
        n += db.execute(
            "UPDATE procurement_scandals SET amount_note_es=?, legal_status_note_es=?, compranet_note_es=? WHERE slug=?",
            (*vals, slug)).rowcount
    db.commit()
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(f"updated {n} of {len(NOTES_ES)} cases")


if __name__ == "__main__":
    main()
