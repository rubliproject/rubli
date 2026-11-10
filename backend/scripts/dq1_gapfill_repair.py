"""DQ1 § 1 — repair the 2023–24 gap-fill rows that `_validate_and_gapfill_comprasmx.py` inserted blank.

Prod ids 3110073–3115921 (5,849 rows, source_structure 'D'): no title / contract_number /
contract_date, 5,286 without vendor, 4,552 without institution, 1,054 with contract_year taken
from the publication date. Source rows: backend/data/comprasmx/Contratos_CompraNet{2020..2025}.csv
(the files the gap-fill read; source_year 2020–2024).

Per blank row (selector: structure D, title, contract_number AND contract_date all NULL):
  match   the CSV row with the same procedure number and amount (± 1 peso), tie-broken by the
          dates the gap-fill copied (start / end / award / publication)
  fill    title, description, contract_number, expedient_code, partida_especifica, contract_date
          (signing date, else start, else publication — never in the future), contract_year,
          contract_month, is_year_end; vendor_id / institution_id when NULL
  vendor  RFC first (vendors.rfc, folded through vendor_canonical), then — companies only — an
          exact normalized-name hit on ONE vendor (the main ETL's rule), else a NEW vendor row
          (personas físicas never name-merged)
  inst    clave_institucion, else exact normalized name (canonical-folded), else a NEW row
  exclude no CSV match, or no vendor name/RFC → contracts.public_excluded = 1 (the register,
          search and dossier lists skip it) — never shown blank

Reversible: every touched row's old values go to `dq1_gapfill_backup`; created vendors /
institutions are listed in `dq1_gapfill_created`.

  python -m scripts.dq1_gapfill_repair --db X                 # dry run → counts
  python -m scripts.dq1_gapfill_repair --db X --apply
  python -m scripts.dq1_gapfill_repair --db X --rollback
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.etl_classify import normalize_text, normalize_vendor_name  # noqa: E402
from scripts.resolve_comprasmx_vendors import shape  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data" / "comprasmx"
MAX_AMOUNT = 100_000_000_000
TODAY = date.today().isoformat()
SELECT_BLANK = ("source_structure = 'D' AND title IS NULL AND contract_number IS NULL "
                "AND contract_date IS NULL")
FILLED = ("title", "description", "contract_number", "expedient_code", "partida_especifica",
          "contract_date", "contract_year", "contract_month", "is_year_end", "vendor_id", "institution_id")


def parse_date(val):
    if not val or not val.strip():
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(val.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_amount(val):
    try:
        return float((val or "0").replace(",", "").strip())
    except ValueError:
        return 0.0


def get(row, *keys):
    for k in keys:
        v = (row.get(k) or "").strip()
        if v:
            return v
    return None


def csv_fields(r: dict) -> dict:
    """One ComprasMX/CompraNet D CSV row → the descriptive fields a contracts row must carry
    (MAPPING_D of etl_pipeline.py). contract_date: signing, else start, else publication, never future."""
    firma = parse_date(get(r, "Fecha de firma del contrato", "Fecha firma contrato"))
    start = parse_date(get(r, "Fecha de inicio del contrato"))
    pub = parse_date(get(r, "Fecha de publicación", "Fecha de publicacion"))
    cdate = next((d for d in (firma, start, pub) if d and "2002-01-01" <= d <= TODAY), None)  # no typo years (0222)
    month = int(cdate[5:7]) if cdate else None
    return {
        "title": get(r, "Título del contrato", "Titulo del contrato", "Título del expediente", "Titulo del expediente"),
        "description": get(r, "Descripción del contrato", "Descripcion del contrato"),
        "contract_number": get(r, "Código del contrato", "Codigo del contrato"),
        "expedient_code": get(r, "Código del expediente", "Codigo del expediente"),
        "partida_especifica": get(r, "Partida específica", "Partida especifica"),
        "contract_date": cdate,
        "contract_year": int(cdate[:4]) if cdate else None,
        "contract_month": month,
        "is_year_end": 1 if month in (11, 12) else 0,
        "rfc": (get(r, "rfc", "RFC") or "").upper(),
        "vendor_name": get(r, "Proveedor o contratista"),
        "vendor_size": get(r, "Estratificación", "Estratificacion"),
        "vendor_country": get(r, "País de la empresa", "Pais de la empresa"),
        "inst_name": get(r, "Institución", "Institucion"),
        "inst_clave": get(r, "Clave Institución", "Clave Institucion"),
        "inst_siglas": get(r, "Siglas de la Institución", "Siglas de la Institucion"),
        "inst_tipo": get(r, "Tipo de Institución", "Tipo de Institucion"),
        "inst_nivel": get(r, "Orden de gobierno"),
        "start_date": start,
        "end_date": parse_date(get(r, "Fecha de fin del contrato")),
        "award_date": parse_date(get(r, "Fecha de fallo")),
        "publication_date": pub,
    }


def complete(f: dict) -> bool:
    """A row the public register can show: a supplier, a title and a date."""
    return bool((f.get("vendor_name") or f.get("rfc")) and f.get("title") and f.get("contract_date"))


def load_csv_rows(csv_dir=DATA):
    """APF rows by procedure number (≤ 100B), as the gap-fill read them (latin-1).
    Reads every Contratos_CompraNet*.csv in csv_dir (2020–2025 locally; on prod the extract below)."""
    by_proc: dict[str, list[dict]] = {}
    for p in sorted(Path(csv_dir).glob("Contratos_CompraNet*.csv")):
        with open(p, encoding="latin-1", errors="replace", newline="") as fh:
            for r in csv.DictReader(fh):
                if (r.get("Orden de gobierno") or "").strip().upper() != "APF":
                    continue
                proc = get(r, "Número de procedimiento", "Numero de procedimiento")
                amt = parse_amount(get(r, "Importe DRC"))
                if proc and amt <= MAX_AMOUNT:
                    by_proc.setdefault(proc, []).append(r)
    return by_proc


def match_row(c: dict, cands: list[dict]) -> dict | None:
    """The CSV row behind contract `c` (procedure_number, amount_mxn, start/end/award/publication)."""
    hit = [r for r in cands if abs(parse_amount(get(r, "Importe DRC")) - (c["amount_mxn"] or 0)) <= 1.0]
    if len(hit) > 1:
        def score(r):
            f = csv_fields(r)
            return sum(f[k] == c[k] for k in ("start_date", "end_date", "award_date", "publication_date"))
        best = max(score(r) for r in hit)
        top = [r for r in hit if score(r) == best]
        # identical rows (same supplier, title) are the same contract for our purpose
        if len({(csv_fields(r)["rfc"], csv_fields(r)["contract_number"]) for r in top}) > 1:
            return None
        hit = top[:1]
    return hit[0] if len(hit) == 1 else None


class Resolver:
    """Vendor / institution lookup with the main ingest's rules (RFC first, canonical-folded)."""

    def __init__(self, conn):
        self.conn = conn
        canon = dict(conn.execute("SELECT vendor_id, canonical_id FROM vendor_canonical")) if _has(conn, "vendor_canonical") else {}
        self.vcanon = canon
        self.by_rfc: dict[str, set[int]] = {}
        self.by_name: dict[str, set[int]] = {}
        for vid, rfc, nn, ind in conn.execute(
                "SELECT id, UPPER(TRIM(rfc)), name_normalized, COALESCE(is_individual, 0) FROM vendors"):
            cid = canon.get(vid, vid)
            if rfc:
                self.by_rfc.setdefault(rfc, set()).add(cid)
            if nn and not ind:
                self.by_name.setdefault(nn, set()).add(cid)
        icanon = dict(conn.execute("SELECT institution_id, canonical_id FROM institution_canonical")) \
            if _has(conn, "institution_canonical") else {}
        self.i_by_clave: dict[str, set[int]] = {}
        self.i_by_name: dict[str, set[int]] = {}
        for iid, clave, name in conn.execute("SELECT id, clave_institucion, name FROM institutions"):
            cid = icanon.get(iid, iid)
            if clave:
                self.i_by_clave.setdefault(clave.strip().upper(), set()).add(cid)
            if name:
                self.i_by_name.setdefault(normalize_text(name), set()).add(cid)
        self.created: list[tuple[str, int]] = []

    def vendor(self, f: dict, create: bool) -> tuple[str, int | None]:
        rfc = f["rfc"]
        hits = self.by_rfc.get(rfc) if shape(rfc) != "bad" else None
        if hits:
            return ("rfc", min(hits)) if len(hits) == 1 else ("rfc_split", min(hits))
        person = shape(rfc) == "person"
        if not person and f["vendor_name"]:
            nh = self.by_name.get(normalize_vendor_name(f["vendor_name"]))
            if nh and len(nh) == 1:
                return "name", next(iter(nh))
        if not f["vendor_name"]:
            return "none", None
        if not create:
            return "new", None
        cur = self.conn.execute(
            """INSERT INTO vendors (rfc, name, name_normalized, size_stratification, country_code, is_individual,
                   created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)""",
            (rfc or None, f["vendor_name"], normalize_vendor_name(f["vendor_name"]), f["vendor_size"],
             f["vendor_country"] or "MX", 1 if person else 0))
        vid = cur.lastrowid
        if rfc:
            self.by_rfc[rfc] = {vid}
        if not person:
            self.by_name.setdefault(normalize_vendor_name(f["vendor_name"]), set()).add(vid)
        self.created.append(("vendor", vid))
        return "new", vid

    def institution(self, f: dict, create: bool) -> tuple[str, int | None]:
        for basis, idx, k in (("clave", self.i_by_clave, (f["inst_clave"] or "").upper()),
                              ("name", self.i_by_name, normalize_text(f["inst_name"] or ""))):
            if k and len(idx.get(k, ())) == 1:
                return basis, next(iter(idx[k]))
        if not f["inst_name"]:
            return "none", None
        if not create:
            return "new", None
        cur = self.conn.execute(
            """INSERT INTO institutions (name, name_normalized, siglas, clave_institucion, tipo, gobierno_nivel,
                   created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)""",
            (f["inst_name"], normalize_text(f["inst_name"]), f["inst_siglas"], f["inst_clave"], f["inst_tipo"],
             f["inst_nivel"]))
        iid = cur.lastrowid
        if f["inst_clave"]:
            self.i_by_clave[f["inst_clave"].upper()] = {iid}
        self.i_by_name[normalize_text(f["inst_name"])] = {iid}
        self.created.append(("institution", iid))
        return "new", iid


def _has(conn, name):
    return conn.execute("SELECT 1 FROM sqlite_master WHERE name = ?", (name,)).fetchone() is not None


def ensure_public_excluded(conn):
    cols = {r[1] for r in conn.execute("PRAGMA table_info(contracts)")}
    if "public_excluded" not in cols:
        conn.execute("ALTER TABLE contracts ADD COLUMN public_excluded INTEGER NOT NULL DEFAULT 0")


# every column the repair (or its single-bid recompute) can touch — saved, and restored as saved
BACKED_UP = ("vendor_id", "institution_id", "contract_year", "contract_month", "is_year_end", "is_single_bid",
             "title", "description", "contract_number", "expedient_code", "partida_especifica", "contract_date",
             "public_excluded")


def run(conn, by_proc, apply=False):
    if apply:
        ensure_public_excluded(conn)
    has_pe = any(r[1] == "public_excluded" for r in conn.execute("PRAGMA table_info(contracts)"))
    cols = ", ".join(c if c != "public_excluded" or has_pe else "0 AS public_excluded" for c in BACKED_UP)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute(
        f"SELECT id, procedure_number, amount_mxn, start_date, end_date, award_date, publication_date, "
        f"{cols} FROM contracts WHERE {SELECT_BLANK} ORDER BY id")]
    conn.row_factory = None
    res = Resolver(conn)
    stats = {"blank_rows": len(rows), "repaired": 0, "excluded": 0, "excl_no_csv_match": 0,
             "excl_no_supplier": 0, "vendor_rfc": 0, "vendor_rfc_split": 0, "vendor_name": 0, "vendor_new": 0,
             "vendor_kept": 0, "inst_clave": 0, "inst_name": 0, "inst_new": 0, "inst_kept": 0, "year_changed": 0}
    if apply:
        conn.execute(f"""CREATE TABLE IF NOT EXISTS dq1_gapfill_backup (id INTEGER PRIMARY KEY, {", ".join(BACKED_UP)},
            action TEXT, repaired_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
        conn.execute("CREATE TABLE IF NOT EXISTS dq1_gapfill_created (kind TEXT, id INTEGER, PRIMARY KEY (kind, id))")
    updates, excluded, backup, matched = [], [], [], []
    fts = _has(conn, "contracts_fts")
    for c in rows:
        r = match_row(c, by_proc.get(c["procedure_number"] or "", []))
        f = csv_fields(r) if r else None
        if r:
            matched.append(r)
        if f is None or not complete(f):
            stats["excluded"] += 1
            stats["excl_no_csv_match" if f is None else "excl_no_supplier"] += 1
            excluded.append(c["id"])
            backup.append((c["id"], *(c[k] for k in BACKED_UP), "excluded"))
            continue
        if c["vendor_id"] is None:
            basis, vid = res.vendor(f, apply)
            stats[f"vendor_{basis}"] += 1
        else:
            vid = c["vendor_id"]
            stats["vendor_kept"] += 1
        if c["institution_id"] is None:
            basis, iid = res.institution(f, apply)
            stats[f"inst_{basis}"] += 1
        else:
            iid = c["institution_id"]
            stats["inst_kept"] += 1
        stats["year_changed"] += f["contract_year"] != c["contract_year"]
        stats["repaired"] += 1
        backup.append((c["id"], *(c[k] for k in BACKED_UP), "repaired"))
        updates.append((*(f[k] for k in FILLED[:9]), vid, iid, c["id"]))
    if apply:
        with conn:
            # OR IGNORE: a second apply never overwrites the first backup (the original pre-repair values)
            conn.executemany(f"""INSERT OR IGNORE INTO dq1_gapfill_backup (id, {", ".join(BACKED_UP)}, action)
                VALUES ({",".join("?" * (len(BACKED_UP) + 2))})""", backup)
            conn.executemany(f"UPDATE contracts SET {', '.join(k + ' = ?' for k in FILLED)} WHERE id = ?", updates)
            conn.executemany("UPDATE contracts SET public_excluded = 1 WHERE id = ?", [(i,) for i in excluded])
            conn.executemany("INSERT OR IGNORE INTO dq1_gapfill_created (kind, id) VALUES (?, ?)", res.created)
            if fts:  # gap-fill rows were indexed with an empty title
                conn.executemany("INSERT INTO contracts_fts(contracts_fts, rowid, title) VALUES('delete', ?, '')",
                                 [(u[-1],) for u in updates])
                conn.executemany("INSERT INTO contracts_fts(rowid, title) VALUES(?, ?)",
                                 [(u[-1], u[0]) for u in updates])
            # single bid for the touched procedures (data-validation.md § Single Bid)
            conn.execute("""UPDATE contracts SET is_single_bid = CASE WHEN procedure_number IN (
                    SELECT procedure_number FROM contracts WHERE is_direct_award = 0 AND procedure_number IN (
                        SELECT procedure_number FROM contracts WHERE id IN (SELECT id FROM dq1_gapfill_backup))
                    GROUP BY procedure_number HAVING COUNT(DISTINCT vendor_id) = 1) THEN 1 ELSE 0 END
                WHERE is_direct_award = 0 AND id IN (SELECT id FROM dq1_gapfill_backup)""")
    stats["_matched_rows"] = matched
    return stats


def export_source(rows, path):
    """The matched CSV rows only (same headers, latin-1) → ship to prod instead of 470 MB of files.
    Holds supplier RFCs incl. personas físicas: keep private (never commit)."""
    cols = list(rows[0]) if rows else []
    with open(path, "w", encoding="latin-1", errors="replace", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def rollback(conn):
    if not _has(conn, "dq1_gapfill_backup"):
        print("nothing to roll back: dq1_gapfill_backup does not exist (never applied, or already rolled back)")
        return False
    fts = _has(conn, "contracts_fts")
    with conn:
        if fts:
            conn.execute("""INSERT INTO contracts_fts(contracts_fts, rowid, title)
                SELECT 'delete', c.id, COALESCE(c.title, '') FROM contracts c
                JOIN dq1_gapfill_backup b ON b.id = c.id WHERE b.action = 'repaired'""")
            conn.execute("""INSERT INTO contracts_fts(rowid, title)
                SELECT id, COALESCE(title, '') FROM dq1_gapfill_backup WHERE action = 'repaired'""")
        sets = ", ".join(f"{k} = (SELECT b.{k} FROM dq1_gapfill_backup b WHERE b.id = contracts.id)"
                         for k in BACKED_UP)
        conn.execute(f"""UPDATE contracts SET {sets}
            WHERE id IN (SELECT id FROM dq1_gapfill_backup)""")
        conn.execute("DELETE FROM vendors WHERE id IN (SELECT id FROM dq1_gapfill_created WHERE kind = 'vendor')")
        conn.execute("DELETE FROM institutions WHERE id IN (SELECT id FROM dq1_gapfill_created WHERE kind = 'institution')")
        conn.execute("DROP TABLE dq1_gapfill_backup")
        conn.execute("DROP TABLE dq1_gapfill_created")
    print("rolled back")
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback", action="store_true")
    ap.add_argument("--csv-dir", default=str(DATA), help="dir with Contratos_CompraNet*.csv")
    ap.add_argument("--export-source", help="write the matched source rows to this CSV (for prod)")
    a = ap.parse_args()
    conn = (sqlite3.connect(a.db, timeout=600) if a.apply or a.rollback
            else sqlite3.connect(f"file:{a.db}?mode=ro", uri=True))
    if a.rollback:
        rollback(conn)
        return
    stats = run(conn, load_csv_rows(a.csv_dir), apply=a.apply)
    matched = stats.pop("_matched_rows")
    if a.export_source:
        export_source(matched, a.export_source)
        print(f"exported {len(matched):,} source rows -> {a.export_source}")
    for k, v in stats.items():
        print(f"  {k:<20} {v:>7,}")
    print("applied" if a.apply else "dry run (no writes)")


if __name__ == "__main__":
    main()
