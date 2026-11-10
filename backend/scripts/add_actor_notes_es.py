"""Spanish versions of the `key_actors` notes for the 13 verified
`procurement_scandals` rows (casos § G8 — the Spanish page hid the English notes).

Adds `note_es` (and `title_es` / `name_es` where the original is English) INSIDE
each `key_actors_json` entry, matched by slug + index + actor name. No schema
change. Idempotent. Dry run unless --apply; before writing, the affected rows'
original `key_actors_json` is backed up to a CSV next to the DB.

    python -m scripts.add_actor_notes_es [--db PATH] [--apply]
"""
import argparse
import csv
import json
import sqlite3
from datetime import datetime
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent.parent / "RUBLI_NORMALIZED.db"

ASF = "Órgano fiscalizador federal"
PEMEX = "Empresa del Estado"

# slug: [(index, actor name as stored, {spanish keys})]
ACTORS_ES = {
    "segalmex-food-distribution": [
        (0, "ASF", {"note_es": ASF}),
        (1, "SFP", {"note_es": "Reportó 156 denuncias penales (2024)"}),
        (2, "Segalmex / LICONSA / DICONSA", {"note_es": "Entidades auditadas"}),
    ],
    "odebrecht-pemex-bribery": [
        (0, "US Department of Justice", {
            "name_es": "Departamento de Justicia de Estados Unidos",
            "title_es": "Sección de Fraudes",
            "note_es": "Acuerdo de culpabilidad, diciembre de 2016",
        }),
        (1, "PEMEX", {"note_es": PEMEX}),
    ],
    "estafa-maestra": [
        (0, "ASF", {"note_es": ASF}),
        (1, "Rosario Robles Berlanga", {"note_es": "Acusada en 2019; el caso se cerró y la SCJN lo confirmó en octubre de 2024"}),
        (2, "8 universidades públicas", {"note_es": "Recibieron los convenios y subcontrataron empresas"}),
    ],
    "grupo-higa-casa-blanca": [
        (0, "Grupo Higa", {"note_es": "Dueño de la casa a través de una filial; contratista del gobierno"}),
        (1, "SFP", {"note_es": "No encontró conflicto de interés (agosto de 2015)"}),
    ],
    "oceanografia-pemex-fraud": [
        (0, "Oceanografía SA de CV", {"note_es": "Asegurada en 2014; en quiebra"}),
        (1, "Banamex / Citigroup", {"note_es": "Denunció el presunto fraude con facturas (2014)"}),
        (2, "PEMEX", {"note_es": "Entidad contratante"}),
    ],
    "pemex-emilio-lozoya": [
        (0, "Emilio Lozoya Austin", {"note_es": "Vinculado a proceso (julio de 2020); sin sentencia a febrero de 2024"}),
        (1, "FGR", {"note_es": "Autoridad acusadora"}),
        (2, "PEMEX", {"note_es": PEMEX}),
    ],
    "linea-12-metro-collapse": [
        (0, "Consorcio ICA – Carso (CICSA) – Alstom", {"note_es": "Consorcio constructor"}),
        (1, "Gobierno de la Ciudad de México / FGJCDMX", {"note_es": "Encargó el dictamen de DNV; presentó cargos"}),
    ],
    "fertinal-pemex-acquisition": [
        (0, "PEMEX", {"note_es": "Comprador"}),
        (1, "ASF", {"note_es": ASF}),
        (2, "Emilio Lozoya Austin", {"note_es": "En juicio; ver el caso Lozoya"}),
    ],
    "enciclomedia-sep": [
        (0, "SEP", {"note_es": "Responsable del programa"}),
        (1, "ASF", {"note_es": ASF}),
    ],
    "tren-maya-fonatur": [
        (0, "FONATUR / Fonatur Tren Maya", {"note_es": "Entidad auditada"}),
        (1, "ASF", {"note_es": ASF}),
    ],
    "insabi-medicine-collapse": [
        (0, "INSABI", {"note_es": "Responsable de la compra consolidada"}),
        (1, "UNOPS", {"note_es": "Operó la compra consolidada de 2021"}),
        (2, "ASF", {"note_es": ASF}),
    ],
    "ssp-police-equipment-calderon": [
        (0, "Genaro García Luna", {"note_es": "Condenado en Estados Unidos (2023); sentencia civil en Florida (2025)"}),
        (1, "UIF", {"note_es": "Parte demandante en el juicio civil de Florida"}),
        (2, "SSP", {"note_es": "Dependencia contratante"}),
    ],
    "cisen-pegasus-surveillance": [
        (0, "SSPC", {"note_es": "Dio a conocer los 31 contratos (2021)"}),
        (1, "NSO Group", {"note_es": "Contratos firmados con empresas vinculadas a ella"}),
    ],
}


def plan(db: sqlite3.Connection):
    """Yield (id, slug, old_json, new_json) for rows that would change; warn on mismatches."""
    for slug, entries in ACTORS_ES.items():
        row = db.execute("SELECT id, key_actors_json FROM procurement_scandals WHERE slug=?", (slug,)).fetchone()
        if not row:
            print(f"SKIP {slug}: no such case")
            continue
        actors = json.loads(row[1] or "[]")
        for idx, name, es in entries:
            if idx >= len(actors) or actors[idx].get("name") != name:
                print(f"SKIP {slug}[{idx}]: expected {name!r}")
                continue
            actors[idx].update(es)
        new = json.dumps(actors, ensure_ascii=False)
        if json.loads(row[1] or "[]") != actors:
            yield row[0], slug, row[1], new


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--apply", action="store_true", help="write (default: dry run)")
    args = ap.parse_args()
    db = sqlite3.connect(args.db)
    changes = list(plan(db))
    n = sum(len(v) for v in ACTORS_ES.values())
    print(f"{len(changes)} cases to update ({n} actor entries in the table)")
    if not args.apply or not changes:
        print("dry run — nothing written" if not args.apply else "nothing to do")
        return
    backup = Path(args.db).with_name(f"actors_es_backup_{datetime.now():%Y%m%d_%H%M%S}.csv")
    with open(backup, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "slug", "key_actors_json"])
        w.writerows((i, s, old) for i, s, old, _ in changes)
    print(f"backup: {backup}")
    with db:
        for i, _, _, new in changes:
            db.execute("UPDATE procurement_scandals SET key_actors_json=? WHERE id=?", (new, i))
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(f"updated {len(changes)} cases")


if __name__ == "__main__":
    main()
