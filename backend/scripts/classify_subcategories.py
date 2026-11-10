"""
classify_subcategories.py — tag every contract with its subcategory, once, in a narrow table.

Before this step the subcategory of a contract was re-guessed inside compute_subcategory_stats
from the TITLE only (accented text against unaccented regexes, so «CURACIÓN» never matched
«curacion»), and «compra consolidada» was itself a subcategory that swallowed the medicines
shelf. Now:

  contract_subcategory(contract_id PK, subcategory_id, source, is_consolidated)  WITHOUT ROWID
    subcategory_id  NULL when the contract's category has no definitions; the catch-all id when
                    nothing matched.
    source          'regex' | 'compendio' | 'partida' | 'catch_all' | NULL (no definitions)
    is_consolidated 1 when the text says «consolidada» or contracts.is_consolidated = 1 — a buying
                    mechanism, never a kind of thing bought.

Rules, per contract of a category with definitions (SUBCATEGORY_DEFS, first rule that decides wins):
  1. regex   — the subcategory keywords, in order, on title + description, upper-cased, accents
               stripped.
  2. compendio — the Compendio Nacional de Insumos para la Salud supply-group codes cited in the
               text («GRUPO 040», «GRUPOS 060 Y 080», a clave «020.000.6521.00»). Every group cited
               must map to the same subcategory (010 «medicamentos» maps to none, so «grupo 010 y
               040» stays undecided). Group meanings: docs/SUBCATEGORIES.md § Fuentes.
  3. partida — partida_especifica (Structure D / ComprasMX): every partida listed must map to the
               same subcategory by its prefix (generica = first 3 digits of the Clasificador por
               Objeto del Gasto, names in cucop_generica_map).
  4. catch-all.

The table is rebuilt whole (new table, then swapped in one transaction); contracts is never
altered. subcategory ids are stable: definitions are upserted on (category_id, code).

Run from backend/ (in-container: /app), after classify_categories and before compute_subcategory_stats:
    python -m scripts.classify_subcategories [--db PATH] [--dry-run]
"""
import argparse
import logging
import os
import re
import sqlite3
import time
from collections import Counter
from pathlib import Path

from scripts.classify_categories import strip_accents
from scripts.compute_subcategory_stats import SUBCATEGORY_DEFS, setup_schema, upsert_definitions

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DB_PATH = Path(os.environ.get("DATABASE_PATH") or Path(__file__).parent.parent / "RUBLI_NORMALIZED.db")

CONSOLIDATED = re.compile(r"CONSOLIDAD")
# «GRUPO 040», «GRUPOS 010 Y 040», «GPO. 060», «GRUPO DE SUMINISTRO 010», «GRUPO NO. 080»
_GROUP_RUN = re.compile(
    r"\b(?:GRUPOS?|GPOS?)\.?\s+(?:DE\s+SUMINISTROS?\s+)?(?:NO\.?\s*)?((?:0[1-9]0\b(?:\s*(?:,|Y|E|/)\s*)?)+)")
_GROUP_CODE = re.compile(r"0[1-9]0")
_CLAVE = re.compile(r"\b(0[1-9]0)\.\d{3}\.\d{4}")

TABLE_SQL = """
CREATE TABLE {name} (
    contract_id     INTEGER PRIMARY KEY,
    subcategory_id  INTEGER,
    source          TEXT,
    is_consolidated INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID"""


def normalize(text: str) -> str:
    return " ".join(strip_accents(text.upper()).split())


def compendio_groups(text: str) -> set[str]:
    """Supply-group codes cited in normalized text."""
    found = {m for run in _GROUP_RUN.findall(text) for m in _GROUP_CODE.findall(run)}
    return found | set(_CLAVE.findall(text))


class Rules:
    """Compiled rules for one category block of SUBCATEGORY_DEFS."""

    def __init__(self, block: dict):
        self.ordered: list[tuple[str, re.Pattern]] = []
        self.groups: dict[str, str] = {}
        self.partidas: list[tuple[str, str]] = []
        self.catch_all = None
        for s in block["subcategories"]:
            if s.get("is_catch_all"):
                self.catch_all = s["code"]
                continue
            if s.get("keywords"):
                self.ordered.append((s["code"], re.compile(s["keywords"], re.IGNORECASE)))
            for g in s.get("groups", ()):
                self.groups[g] = s["code"]
            for p in s.get("partidas", ()):
                self.partidas.append((p, s["code"]))
        self.partidas.sort(key=lambda x: -len(x[0]))  # longest prefix first

    def _partida(self, p: str):
        return next((code for pre, code in self.partidas if p.startswith(pre)), None)

    def classify(self, text: str, partida: str | None) -> tuple[str, str]:
        """(code, source) for one contract; text already normalized."""
        for code, pat in self.ordered:
            if pat.search(text):
                return code, "regex"
        gs = compendio_groups(text)
        if gs:
            codes = {self.groups.get(g) for g in gs}
            if len(codes) == 1 and None not in codes:
                return codes.pop(), "compendio"
        if partida and self.partidas:
            codes = {self._partida(p.strip()) for p in partida.split(",") if p.strip()}
            if len(codes) == 1 and None not in codes:
                return codes.pop(), "partida"
        return self.catch_all, "catch_all"


def build_rules() -> dict[int, Rules]:
    return {b["category_id"]: Rules(b) for b in SUBCATEGORY_DEFS}


def classify_rows(rows, rules: dict[int, Rules], id_map: dict[str, int]):
    """rows: (id, category_id, title, description, partida_especifica, is_consolidated).
    Yields (contract_id, subcategory_id, source, is_consolidated)."""
    for cid, cat, title, desc, partida, flag in rows:
        text = normalize(f"{title or ''} {desc or ''}")
        cons = 1 if (flag or CONSOLIDATED.search(text)) else 0
        r = rules.get(cat)
        if r is None:
            yield cid, None, None, cons
            continue
        code, source = r.classify(text, partida)
        yield cid, id_map[f"{cat}:{code}"], source, cons


def write(conn: sqlite3.Connection, rows_iter, batch: int = 50_000) -> int:
    """Build contract_subcategory_new and swap it in (drop old + rename), all in one transaction.
    conn must be in autocommit mode (isolation_level=None)."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DROP TABLE IF EXISTS contract_subcategory_new")
        conn.execute(TABLE_SQL.format(name="contract_subcategory_new"))
        n, buf = 0, []
        for row in rows_iter:
            buf.append(row)
            if len(buf) >= batch:
                conn.executemany("INSERT INTO contract_subcategory_new VALUES (?,?,?,?)", buf)
                n += len(buf)
                buf.clear()
        if buf:
            conn.executemany("INSERT INTO contract_subcategory_new VALUES (?,?,?,?)", buf)
            n += len(buf)
        conn.execute("DROP TABLE IF EXISTS contract_subcategory")
        conn.execute("ALTER TABLE contract_subcategory_new RENAME TO contract_subcategory")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_contract_subcategory_sub ON contract_subcategory(subcategory_id)")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DB_PATH))
    ap.add_argument("--dry-run", action="store_true", help="classify and report; write nothing")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db, timeout=120)
    conn.execute("PRAGMA busy_timeout=120000")
    rules = build_rules()
    if args.dry_run:
        id_map = {f"{b['category_id']}:{s['code']}": i
                  for b in SUBCATEGORY_DEFS for i, s in enumerate(b["subcategories"])}
    else:
        setup_schema(conn)
        id_map = upsert_definitions(conn)

    t0 = time.time()
    read = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True, timeout=120)  # separate reader: the writer swaps tables
    cur = read.execute("SELECT id, category_id, title, description, partida_especifica, is_consolidated FROM contracts")
    rows = classify_rows((r for chunk in iter(lambda: cur.fetchmany(20_000), []) for r in chunk), rules, id_map)

    if args.dry_run:
        sources = Counter(r[2] for r in rows)
        logger.info("dry run: %s in %.0fs", dict(sources), time.time() - t0)
        return
    conn.isolation_level = None  # explicit BEGIN/COMMIT around the swap
    n = write(conn, rows)
    read.close()
    logger.info("contract_subcategory: %d rows in %.0fs", n, time.time() - t0)
    for src, k in conn.execute("SELECT source, COUNT(*) FROM contract_subcategory GROUP BY 1 ORDER BY 2 DESC"):
        logger.info("  %-10s %d", src, k)
    conn.close()


if __name__ == "__main__":
    main()
