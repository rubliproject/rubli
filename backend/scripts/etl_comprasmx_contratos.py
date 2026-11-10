"""
etl_comprasmx_contratos.py — load ComprasMX's open contract CSVs into a STAGING table.

Source (found 2026-10-19, docs/SOURCE_SCOUT_2026-10-19.md § 1): unsigned yearly files
  https://upcp-cnetservicios.buengobierno.gob.mx/norah/documentos/recursos/lck/expedientes/obtener/Contratos_ComprasMX_{year}.csv
with vendor, RFC and «Importe DRC» on every row — the structured successor of the frozen
CompraNet feed, and of the fallo-PDF OCR path behind gap_contracts.

Writes ONLY the new table `comprasmx_contracts` (one row per «Código del contrato»).
Never touches `contracts`, scores or ARIA: promotion into the scored corpus is an owner call.

Per row:
  amount_mxn      Importe DRC in MXN (USD via exchange_rates annual FIX; other currencies NULL)
  amount_flag     'reject' (>100B MXN, amount_mxn NULL) · 'review' (>10B) · 'fx_missing' · NULL
  in_contracts    procedure number already in the CompraNet corpus (2025 Jan–Sep overlap)
  in_gap          procedure number already in gap_contracts (the OCR corpus → validation set)
  post_blackout   publication date >= 2025-09-28

Run from backend/:
    python -m scripts.etl_comprasmx_contratos --dir D:/Python/yangwenli/_comprasmx/opendata --db D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db
    python -m scripts.etl_comprasmx_contratos --demo
"""
import argparse
import csv
import io
import re
import sqlite3
import time
from pathlib import Path

MAX_CONTRACT_VALUE = 100_000_000_000  # reject above (data-validation.md)
FLAG_THRESHOLD = 10_000_000_000       # flag above
BLACKOUT = "2025-09-28"
URL = ("https://upcp-cnetservicios.buengobierno.gob.mx/norah/documentos/recursos/lck/"
       "expedientes/obtener/Contratos_ComprasMX_{year}.csv")

# (csv column index, staging column). Indices, not names: two header names repeat
# (Moneda 45/55, Convenio modificatorio 46/56) and the header itself is cp1252.
COLS = [
    (0, "orden_gobierno"), (1, "clave_ramo"), (2, "ramo"), (3, "tipo_institucion"),
    (4, "clave_institucion"), (5, "siglas"), (6, "institucion"), (7, "clave_uc"), (8, "uc"),
    (9, "codigo_expediente"), (11, "titulo_expediente"), (12, "partida_especifica"), (13, "ley"),
    (14, "tipo_procedimiento"), (15, "articulo_excepcion"), (17, "contrato_marco"),
    (18, "compra_consolidada"), (23, "numero_procedimiento"), (24, "tipo_contratacion"),
    (25, "caracter"), (26, "forma_participacion"), (27, "caso_fortuito"),
    (32, "fecha_publicacion"), (33, "fecha_apertura"), (34, "fecha_fallo"),
    (35, "codigo_contrato"), (36, "num_contrato"), (37, "titulo_contrato"),
    (38, "descripcion_contrato"), (39, "plurianual"), (40, "estatus_drc"),
    (41, "fecha_inicio"), (42, "fecha_fin"), (43, "fecha_firma"), (44, "importe_drc"),
    (48, "estatus_contrato"), (50, "tipo_contrato"), (52, "monto_minimo_con_imp"),
    (54, "monto_maximo_con_imp"), (64, "rfc"), (65, "proveedor"), (67, "pais"),
    (70, "estratificacion"),
]
DERIVED = ["moneda", "amount_mxn", "amount_flag", "is_direct_award", "is_persona_fisica",
           "in_contracts", "in_gap", "post_blackout", "source_file"]
_UTF8_PAIR = re.compile(rb"[\xc2\xc3][\x80-\xbf]")
_DMY = re.compile(r"^(\d{2})/(\d{2})/(\d{4})")


def decode(raw: bytes) -> str:
    """The files are cp1252 with a few stray UTF-8 accents (b'ALCALD\\xc3\\x8dA'):
    fold each UTF-8 pair back to its cp1252 byte, then decode; the rare byte cp1252
    leaves undefined becomes U+FFFD instead of crashing the load."""
    fixed = _UTF8_PAIR.sub(lambda m: m.group().decode("utf-8").encode("cp1252", "replace"), raw)
    return fixed.decode("cp1252", "replace")


def iso_date(s: str):
    s = (s or "").strip()
    if not s:
        return None
    m = _DMY.match(s)
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else s[:19]


def to_float(s: str):
    s = (s or "").strip().replace(",", "")
    try:
        return float(s) if s else None
    except ValueError:
        return None


def validate_mxn(amount, currency, year, usd_rate):
    """-> (amount_mxn, flag). The 100B / 10B gates of data-validation.md, after FX."""
    if amount is None:
        return None, None
    cur = (currency or "MXN").upper()
    if cur in ("MXN", "PESO MEXICANO", ""):
        mxn = amount
    elif cur in ("USD", "DOLAR", "DÓLAR") and usd_rate.get(year):
        mxn = amount * usd_rate[year]
    else:
        return None, "fx_missing"
    if mxn > MAX_CONTRACT_VALUE:
        return None, "reject"
    if mxn > FLAG_THRESHOLD:
        return mxn, "review"
    return mxn, None


def parse_row(row, usd_rate, known_contracts, known_gap, source_file):
    rec = {name: (row[i].strip() if i < len(row) else "") or None for i, name in COLS}
    for k in ("fecha_publicacion", "fecha_apertura", "fecha_fallo", "fecha_inicio", "fecha_fin", "fecha_firma"):
        rec[k] = iso_date(rec[k])
    rec["importe_drc"] = to_float(rec["importe_drc"])
    rec["monto_minimo_con_imp"] = to_float(rec["monto_minimo_con_imp"])
    rec["monto_maximo_con_imp"] = to_float(rec["monto_maximo_con_imp"])
    # first Moneda (45) is blank on ~30 % of rows; the second (55) belongs to the contract terms
    moneda = ((row[45] if len(row) > 45 else "") or (row[55] if len(row) > 55 else "")).strip().upper() or "MXN"
    year = int((rec["fecha_publicacion"] or rec["fecha_firma"] or "0")[:4] or 0)
    rec["moneda"] = moneda
    rec["amount_mxn"], rec["amount_flag"] = validate_mxn(rec["importe_drc"], moneda, year, usd_rate)
    tp = (rec["tipo_procedimiento"] or "").upper()
    rec["is_direct_award"] = 1 if tp.startswith("ADJUDICACI") and "DIRECTA" in tp else 0
    rfc = rec["rfc"] or ""
    rec["is_persona_fisica"] = 1 if len(rfc) == 13 else (0 if len(rfc) == 12 else None)
    proc = rec["numero_procedimiento"]
    rec["in_contracts"] = 1 if proc in known_contracts else 0
    rec["in_gap"] = 1 if proc in known_gap else 0
    rec["post_blackout"] = 1 if (rec["fecha_publicacion"] or "") >= BLACKOUT else 0
    rec["source_file"] = source_file
    return rec


def ensure_table(conn):
    cols = [n for _, n in COLS] + DERIVED
    real = {"importe_drc", "monto_minimo_con_imp", "monto_maximo_con_imp", "amount_mxn"}
    ints = {"is_direct_award", "is_persona_fisica", "in_contracts", "in_gap", "post_blackout"}
    decl = ", ".join(f"{c} {'REAL' if c in real else 'INTEGER' if c in ints else 'TEXT'}"
                     + (" PRIMARY KEY" if c == "codigo_contrato" else "") for c in cols)
    conn.execute(f"CREATE TABLE IF NOT EXISTS comprasmx_contracts ({decl}, loaded_at TEXT)")
    for ix, col in (("proc", "numero_procedimiento"), ("pub", "fecha_publicacion"),
                    ("rfc", "rfc"), ("inst", "clave_institucion"), ("orden", "orden_gobierno")):
        conn.execute(f"CREATE INDEX IF NOT EXISTS ix_cmx_{ix} ON comprasmx_contracts({col})")
    return cols


UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"


def download(csv_dir: Path, years=(2025, 2026)):
    """Fetch the yearly files. The server answers 403 to HEAD and to non-browser agents and
    has no range support, so it is one plain GET per file (2026-10-27: 104 MB in ~1 min)."""
    import urllib.request
    csv_dir.mkdir(parents=True, exist_ok=True)
    for y in years:
        req = urllib.request.Request(URL.format(year=y), headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=900) as r:
            want = int(r.headers.get("Content-Length") or 0)
            data = r.read()
        if want and len(data) != want:
            raise SystemExit(f"{y}: short download {len(data):,} of {want:,} bytes")
        (csv_dir / f"Contratos_ComprasMX_{y}.csv").write_bytes(data)
        print(f"downloaded {y}: {len(data):,} bytes")


def load(csv_dir: Path, db_path: str, years=(2025, 2026), new_only=False):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA busy_timeout = 120000")
    # USD-denominated rows convert at the Banxico FIX annual mean (api/fx_rates.py, the site-wide table);
    # the exchange_rates DB table is not read — its seeded rows drifted from it.
    from api.fx_rates import MXN_USD_RATES
    usd = dict(MXN_USD_RATES)
    t0 = time.time()
    known_contracts = {r[0] for r in conn.execute(
        "SELECT DISTINCT procedure_number FROM contracts WHERE contract_year >= 2024 AND procedure_number IS NOT NULL")}
    known_gap = {r[0] for r in conn.execute("SELECT procedure_number FROM gap_contracts")}
    print(f"known procedures: contracts {len(known_contracts):,} · gap {len(known_gap):,} ({time.time() - t0:.0f}s)")
    cols = ensure_table(conn)
    # new_only: keep every staged row as it is — REPLACE would wipe the link columns
    # (institution_id, vendor_id, category_id…) that link_comprasmx_contracts adds later.
    verb = "INSERT OR IGNORE" if new_only else "INSERT OR REPLACE"
    before = conn.execute("SELECT COUNT(*) FROM comprasmx_contracts").fetchone()[0]
    sql = (f"{verb} INTO comprasmx_contracts ({', '.join(cols)}, loaded_at) "
           f"VALUES ({', '.join('?' * len(cols))}, datetime('now'))")
    for y in years:
        f = csv_dir / f"Contratos_ComprasMX_{y}.csv"
        reader = csv.reader(io.StringIO(decode(f.read_bytes()), newline=""))
        header = next(reader)
        assert len(header) == 73 and header[44].startswith("Importe"), f"layout changed in {f.name}"
        batch, n, short = [], 0, 0
        for row in reader:
            if len(row) < 66:
                short += 1
                continue
            rec = parse_row(row, usd, known_contracts, known_gap, f.name)
            if not rec["codigo_contrato"]:
                short += 1
                continue
            batch.append([rec[c] for c in cols])
            n += 1
            if len(batch) >= 20_000:
                conn.executemany(sql, batch); conn.commit(); batch = []
        conn.executemany(sql, batch); conn.commit()
        print(f"{f.name}: {n:,} rows read, {short:,} skipped (short/no contract code)")
    print(f"staged rows {before:,} -> {conn.execute('SELECT COUNT(*) FROM comprasmx_contracts').fetchone()[0]:,}")
    report(conn)
    conn.close()


def report(conn):
    q = lambda s: conn.execute(s).fetchall()
    print("total", q("SELECT COUNT(*), COUNT(DISTINCT numero_procedimiento), ROUND(SUM(amount_mxn)/1e9,1) FROM comprasmx_contracts"))
    print("by orden", q("SELECT orden_gobierno, COUNT(*), ROUND(SUM(amount_mxn)/1e9,1) FROM comprasmx_contracts GROUP BY 1"))
    print("flags", q("SELECT amount_flag, COUNT(*) FROM comprasmx_contracts GROUP BY 1"))
    print("moneda", q("SELECT moneda, COUNT(*) FROM comprasmx_contracts GROUP BY 1 ORDER BY 2 DESC LIMIT 6"))
    print("APF post-blackout: rows · procs · new vs CompraNet · in gap · MDP",
          q("""SELECT COUNT(*), COUNT(DISTINCT numero_procedimiento), SUM(in_contracts = 0), SUM(in_gap),
                      ROUND(SUM(amount_mxn)/1e6) FROM comprasmx_contracts
               WHERE orden_gobierno = 'APF' AND post_blackout = 1"""))
    print("APF pre-blackout NOT in CompraNet (rows · MDP)",
          q("""SELECT COUNT(*), ROUND(SUM(amount_mxn)/1e6) FROM comprasmx_contracts
               WHERE orden_gobierno = 'APF' AND post_blackout = 0 AND in_contracts = 0"""))
    print("max publication", q("SELECT MAX(fecha_publicacion) FROM comprasmx_contracts"))


def demo():
    raw = "ALCALD\u00cdA".encode("utf-8") + " ".encode() + "MERCANC\u00cdAS".encode("cp1252")
    assert decode(raw) == "ALCALD\u00cdA MERCANC\u00cdAS", decode(raw)
    assert iso_date("17/03/2026") == "2026-03-17" and iso_date("2026-03-23 20:33:39") == "2026-03-23 20:33:39"
    usd = {2026: 20.1}
    assert validate_mxn(9_741_029.28, "MXN", 2026, usd) == (9_741_029.28, None)
    assert validate_mxn(150e9, "MXN", 2026, usd) == (None, "reject")
    assert validate_mxn(12e9, "", 2026, usd) == (12e9, "review")
    assert validate_mxn(1e9, "USD", 2026, usd) == (20.1e9, "review")
    assert validate_mxn(1e6, "EUR", 2026, usd) == (None, "fx_missing")
    row = [""] * 73
    row[0], row[14], row[23], row[32], row[35], row[44], row[64] = (
        "APF", "ADJUDICACIÓN DIRECTA", "AA-1", "2025-10-01 10:00:00", "C-1", "1000.5", "AAA010101AAA")
    rec = parse_row(row, usd, {"AA-1"}, set(), "x.csv")
    assert rec["is_direct_award"] == 1 and rec["post_blackout"] == 1 and rec["in_contracts"] == 1
    assert rec["is_persona_fisica"] == 0 and rec["moneda"] == "MXN" and rec["amount_mxn"] == 1000.5
    print("demo ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(Path(__file__).resolve().parents[2] / "_comprasmx" / "opendata"))
    ap.add_argument("--db", default=str(Path(__file__).resolve().parents[1] / "RUBLI_NORMALIZED.db"))
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--download", action="store_true", help="fetch the yearly CSVs into --dir first")
    ap.add_argument("--new-only", action="store_true", help="insert unseen contract codes only (weekly refresh)")
    ap.add_argument("--years", default="2025,2026")
    a = ap.parse_args()
    yrs = tuple(int(y) for y in a.years.split(","))
    if a.demo:
        demo()
    else:
        if a.download:
            download(Path(a.dir), yrs)
        load(Path(a.dir), a.db, yrs, new_only=a.new_only)
