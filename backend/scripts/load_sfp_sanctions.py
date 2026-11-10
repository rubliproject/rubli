"""
Load SFP (Secretaria de la Funcion Publica) sanctioned providers data.

SFP maintains a registry of companies sanctioned from government contracting.
Data source: datos.gob.mx — Proveedores y Contratistas Sancionados

Usage:
    python -m scripts.load_sfp_sanctions [--url URL] [--file PATH] [--db PATH] [--dry-run]

Examples:
    python -m scripts.load_sfp_sanctions --file data/proveedores_sancionados.csv
    python -m scripts.load_sfp_sanctions --url https://...

Dates are stored ISO (YYYY-MM-DD):
    sanction_start  = fecha de notificación
    sanction_end    = explicit end when the source has one, else start + PLAZO;
                      NULL for a fine with no inhabilitación (no plazo)
    resolution_date = fecha de resolución (precedes notification — never an end date)
    plazo_text / plazo_months = the ban length as published / parsed
The law counts the term from the day after the DOF circular, usually days to weeks
after notification, so the stored window is approximate at the edges.

save_to_db REBUILDS the table from the given records (idempotent). The first run
over a pre-2026-10-31 table renames it to sfp_sanctions_legacy (rollback source;
it also held 544 sanctioned public servants and 22 RFCs backfilled by fuzzy name
matching — neither is a supplier record from the source, so neither is reloaded).
docs/PROCUREMENT_LAW_STUDY_2026-10-30.md § 3, § 4.3.
"""
import argparse
import calendar
import csv
import io
import logging
import re
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DB_PATH = Path(__file__).parent.parent / "RUBLI_NORMALIZED.db"

# Primary URL — SFP datosabiertos portal (updated daily, verified Feb 2026)
DEFAULT_URL = "https://datosabiertos.funcionpublica.gob.mx/datosabiertos/sanc/proveedores_sancionados.csv"

COLUMN_MAP = {
    # Possible Spanish column name variations
    # Includes both modern portal format and 2021 archive format
    "rfc": ["rfc", "RFC", "rfc_proveedor"],
    "company_name": ["nombre", "razon_social", "nombre_razon_social", "empresa",
                     "proveedor o contratista"],
    "sanction_type": ["tipo_sancion", "tipo", "sancion",
                      "sentido de resolucion"],
    "sanction_start": ["fecha_inicio", "fecha_inicio_sancion",
                       "fecha de notificacion"],
    # Only an explicit END column. «fecha de resolución» is the decision date — it
    # precedes notification, so mapping it here made every ban end before it began.
    "sanction_end": ["fecha_fin", "fecha_fin_sancion"],
    "resolution_date": ["fecha de resolucion", "fecha_resolucion"],
    "plazo": ["plazo", "plazo_inhabilitacion"],
    "expediente": ["numero de expediente", "expediente"],
    "amount_mxn": ["monto", "monto_sancion", "importe"],
    "authority": ["autoridad", "institucion", "dependencia"],
}

_MONTHS = {"ENE": 1, "JAN": 1, "FEB": 2, "MAR": 3, "ABR": 4, "APR": 4, "MAY": 5, "JUN": 6,
           "JUL": 7, "AGO": 8, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DIC": 12, "DEC": 12}
_NUM_WORDS = {"UN": 1, "UNO": 1, "DOS": 2, "TRES": 3, "CUATRO": 4, "CINCO": 5, "SEIS": 6,
              "SIETE": 7, "OCHO": 8, "NUEVE": 9, "DIEZ": 10, "ONCE": 11, "DOCE": 12,
              "TRECE": 13, "CATORCE": 14, "QUINCE": 15, "DIECISÉIS": 16, "DIECISEIS": 16,
              "DIECISIETE": 17, "DIECIOCHO": 18, "DIECINUEVE": 19, "VEINTE": 20, "TREINTA": 30,
              "CUARENTA": 40, "CINCUENTA": 50, "SESENTA": 60,
              **{f"VEINTI{w}": 20 + n for w, n in (("UN", 1), ("ÚN", 1), ("UNO", 1), ("DÓS", 2), ("DOS", 2),
                 ("TRÉS", 3), ("TRES", 3), ("CUATRO", 4), ("CINCO", 5), ("SÉIS", 6), ("SEIS", 6),
                 ("SIETE", 7), ("OCHO", 8), ("NUEVE", 9))}}
_DATE_RE = re.compile(r"^(\d{1,2})/(\d{1,2}|[A-Za-z]{3})/(\d{4})")


def parse_date(raw: Optional[str]) -> Optional[str]:
    """'19/08/2014', '30/Jun/2006' or ISO → 'YYYY-MM-DD'; None when unparseable."""
    if not raw:
        return None
    s = raw.strip()
    try:
        if re.match(r"^\d{4}-\d{2}-\d{2}", s):
            return date.fromisoformat(s[:10]).isoformat()
        m = _DATE_RE.match(s)
        if not m:
            return None
        d, mo, y = m.groups()
        month = int(mo) if mo.isdigit() else _MONTHS.get(mo.upper())
        return date(int(y), month, int(d)).isoformat() if month else None
    except ValueError:
        return None


def parse_plazo_months(raw: Optional[str]) -> Optional[int]:
    """'4 AÑOS' → 48, '1 AÑO 5 MESES' → 17, 'TRES MESES' → 3; None when absent."""
    if not raw:
        return None
    # «18 (dieciocho) meses» / «dieciocho (18) meses»: drop parens; the number nearest the unit wins
    s = " ".join(str(_NUM_WORDS.get(w, w)) for w in re.sub(r"[()]", " ", raw.upper()).split())
    years = re.search(r"(\d+)\s*A\S*O", s)  # AÑO / AÑOS (also mojibake A�O)
    months = re.search(r"(\d+)\s*MES", s)
    if not years and not months:
        return None
    total = 12 * int(years.group(1) if years else 0) + int(months.group(1) if months else 0)
    return total or None


def add_months(iso: str, n: int) -> str:
    d = date.fromisoformat(iso)
    y, m = divmod(d.month - 1 + n, 12)
    y, m = d.year + y, m + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1])).isoformat()


def _find_col(header: list[str], candidates: list[str]) -> Optional[int]:
    """Find column index by trying multiple candidate names."""
    for candidate in candidates:
        for i, h in enumerate(header):
            if h.strip().lower() == candidate.lower():
                return i
    return None


def parse_csv(content: str, source: str) -> list[dict]:
    """Parse CSV content and return list of sanitized dicts."""
    records = []
    reader = csv.reader(io.StringIO(content))
    header = next(reader, None)
    if not header:
        logger.warning("Empty CSV — no header row")
        return []

    col_idx = {field: _find_col(header, candidates) for field, candidates in COLUMN_MAP.items()}
    logger.info(f"Column mapping: {col_idx}")
    date_col = col_idx.get("sanction_start")

    for row in reader:
        if not any(row):
            continue
        # One Jan-2021 row lost a separator (11 cells): realign on the date column.
        if (len(row) < len(header) and date_col and date_col < len(row)
                and not parse_date(row[date_col]) and parse_date(row[date_col - 1])):
            row = row[:4] + [""] + row[4:]

        def get(field):
            idx = col_idx.get(field)
            return row[idx].strip() if idx is not None and idx < len(row) else None

        amount = None
        raw_amount = get("amount_mxn")
        if raw_amount:
            try:
                amount = float(raw_amount.replace(",", "").replace("$", ""))
            except ValueError:
                pass

        start = parse_date(get("sanction_start"))
        plazo_text = get("plazo") or None
        plazo_months = parse_plazo_months(plazo_text)
        end = parse_date(get("sanction_end"))
        if end is None and start and plazo_months:
            end = add_months(start, plazo_months)

        records.append({
            "rfc": get("rfc") or None,
            "company_name": get("company_name") or "Unknown",
            "sanction_type": get("sanction_type") or "sanction",
            "sanction_start": start,
            "sanction_end": end,
            "resolution_date": parse_date(get("resolution_date")),
            "plazo_text": plazo_text,
            "plazo_months": plazo_months,
            "expediente": get("expediente") or None,
            "amount_mxn": amount,
            "authority": get("authority"),
            "source_url": source,
        })

    logger.info(f"Parsed {len(records)} records")
    return records


def load_from_file(path: str) -> list[dict]:
    """Load CSV from a local file path."""
    p = Path(path)
    if not p.exists():
        logger.error(f"File not found: {p.resolve()}")
        return []
    logger.info(f"Reading SFP sanctions from local file: {p.resolve()}")
    # Try UTF-8 first, fall back to latin-1 (common for Mexican government CSVs)
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            content = p.read_text(encoding=encoding)
            records = parse_csv(content, source=str(p.resolve()))
            if records:
                return records
        except UnicodeDecodeError:
            continue
    logger.error("Could not decode file with utf-8-sig or latin-1")
    return []


def load_from_url(url: str) -> list[dict]:
    """Download CSV from URL."""
    try:
        import httpx
        logger.info(f"Downloading SFP sanctions from {url}")
        resp = httpx.get(url, timeout=60.0, follow_redirects=True)
        resp.raise_for_status()
        return parse_csv(resp.text, source=url)
    except Exception as e:
        logger.warning(f"Failed to download SFP data: {e}")
        return []


SCHEMA = """
    CREATE TABLE IF NOT EXISTS sfp_sanctions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rfc TEXT,
        company_name TEXT NOT NULL,
        sanction_type TEXT,
        sanction_start TEXT,      -- ISO, fecha de notificación
        sanction_end TEXT,        -- ISO, start + plazo (NULL = fine only, no ban)
        resolution_date TEXT,     -- ISO, fecha de resolución
        plazo_text TEXT,
        plazo_months INTEGER,
        expediente TEXT,
        amount_mxn REAL,
        authority TEXT,
        source_url TEXT,
        loaded_at TEXT DEFAULT (datetime('now')),
        is_persona_fisica INTEGER DEFAULT 0  -- name shown labelled, their RFC never stored
    );
    CREATE INDEX IF NOT EXISTS idx_sfp_sanctions_rfc ON sfp_sanctions(rfc);
    CREATE INDEX IF NOT EXISTS idx_sfp_sanctions_name ON sfp_sanctions(company_name)
"""
_COLS = ("rfc", "company_name", "sanction_type", "sanction_start", "sanction_end",
         "resolution_date", "plazo_text", "plazo_months", "expediente",
         "amount_mxn", "authority", "source_url", "is_persona_fisica")


def save_to_db(records: list[dict], db_path: Path = DB_PATH) -> int:
    """Rebuild sfp_sanctions from `records` in one transaction (idempotent)."""
    if not records:
        return 0
    conn = sqlite3.connect(str(db_path), isolation_level=None)
    try:
        conn.execute("PRAGMA busy_timeout = 30000")
        conn.execute("BEGIN IMMEDIATE")
        try:
            cols = {r[1] for r in conn.execute("PRAGMA table_info(sfp_sanctions)")}
            if cols and "plazo_months" not in cols:
                # Pre-fix table: keep it whole as the rollback source (first run only).
                if conn.execute("SELECT 1 FROM sqlite_master WHERE name='sfp_sanctions_legacy'").fetchone():
                    conn.execute("DROP TABLE sfp_sanctions")
                else:
                    conn.execute("ALTER TABLE sfp_sanctions RENAME TO sfp_sanctions_legacy")
                # indexes travel with a renamed table and keep their names
                conn.execute("DROP INDEX IF EXISTS idx_sfp_sanctions_rfc")
                conn.execute("DROP INDEX IF EXISTS idx_sfp_sanctions_name")
            for stmt in SCHEMA.split(";"):
                conn.execute(stmt)
            if "is_persona_fisica" not in {r[1] for r in conn.execute("PRAGMA table_info(sfp_sanctions)")}:
                conn.execute("ALTER TABLE sfp_sanctions ADD COLUMN is_persona_fisica INTEGER DEFAULT 0")
            conn.execute("DELETE FROM sfp_sanctions")
            loaded_at = datetime.now().isoformat()
            conn.executemany(
                f"INSERT INTO sfp_sanctions ({', '.join(_COLS)}, loaded_at) "
                f"VALUES ({', '.join('?' * (len(_COLS) + 1))})",
                [tuple(rec.get(c) for c in _COLS) + (loaded_at,) for rec in records],
            )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        logger.info(f"Rebuilt sfp_sanctions with {len(records)} records")
        return len(records)
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Load SFP sanctioned providers")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--file", help="Path to local CSV file")
    source.add_argument("--url", default=None, help="CSV download URL")
    parser.add_argument("--db", default=str(DB_PATH), help="SQLite DB to rebuild (default: RUBLI_NORMALIZED.db)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.file:
        records = load_from_file(args.file)
    else:
        records = load_from_url(args.url or DEFAULT_URL)

    if not records:
        logger.warning("No records parsed — use --file /path/to/proveedores_sancionados.csv")
        return

    if args.dry_run:
        bans = [r for r in records if r["plazo_months"]]
        logger.info(f"Dry run: {len(records)} records; {len(bans)} with a ban (plazo); "
                    f"{sum(1 for r in bans if r['sanction_end'])} with a dated window")
        for r in records[:3]:
            logger.info(f"  {r}")
    else:
        save_to_db(records, Path(args.db))


if __name__ == "__main__":
    main()
