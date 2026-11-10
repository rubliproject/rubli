"""Fix the 8,298 contracts with NULL id (PREPUB_AUDIT D2).

They came from an incremental load that inserted rows instead of keying them
(all category_source='regex', publication 2023-01 .. 2025-08, no title/contract_number).
  - DUPLICATES: same procedure_number AND amount as an id-bearing contract
    (2,449 rows, 8.17B MXN, double-counted) -> moved to _contracts_nullid_dups_backup, deleted.
  - ORPHANS: everything else (5,849 rows, 4.03B MXN) -> real ids max(id)+1.. in a
    content-deterministic order, so source and prod (different rowids) agree.
  - Guard: trigger rejects future NULL-id inserts.
Idempotent; --dry-run; --rollback restores dups and NULLs the assigned ids.

    python -m scripts.migrate_null_id_contracts --db PATH [--dry-run | --rollback]
"""
import argparse
import sqlite3

DUP = """id IS NULL AND EXISTS (SELECT 1 FROM contracts r WHERE r.id IS NOT NULL
         AND r.procedure_number = contracts.procedure_number
         AND ABS(r.amount_mxn - contracts.amount_mxn) < 0.01)"""
ORDER = "procedure_number, publication_date, start_date, end_date, amount_mxn, vendor_id, institution_id, rowid"


def run(db, dry, rollback):
    c = sqlite3.connect(db, timeout=300)
    c.execute("PRAGMA busy_timeout=300000")
    if rollback:
        with c:
            if c.execute("SELECT 1 FROM sqlite_master WHERE name='_contracts_nullid_dups_backup'").fetchone():
                cols = [r[1] for r in c.execute("PRAGMA table_info(contracts)")]
                c.execute(f"INSERT INTO contracts ({','.join(cols)}) SELECT {','.join(cols)} FROM _contracts_nullid_dups_backup")
                c.execute("DROP TABLE _contracts_nullid_dups_backup")
            if c.execute("SELECT 1 FROM sqlite_master WHERE name='_contracts_nullid_assigned'").fetchone():
                c.execute("UPDATE contracts SET id = NULL WHERE id IN (SELECT new_id FROM _contracts_nullid_assigned)")
                c.execute("DROP TABLE _contracts_nullid_assigned")
            c.execute("DROP TRIGGER IF EXISTS trg_contracts_id_not_null")
        print("rolled back; NULL-id rows:", c.execute("SELECT COUNT(*) FROM contracts WHERE id IS NULL").fetchone()[0])
        return

    n_null = c.execute("SELECT COUNT(*) FROM contracts WHERE id IS NULL").fetchone()[0]
    n_dup, v_dup = c.execute(f"SELECT COUNT(*), COALESCE(SUM(amount_mxn),0) FROM contracts WHERE {DUP}").fetchone()
    max_id = c.execute("SELECT MAX(id) FROM contracts").fetchone()[0]
    print(f"NULL-id rows {n_null:,} | duplicates {n_dup:,} ({v_dup/1e9:.2f}B MXN) | orphans {n_null-n_dup:,} | max id {max_id:,}")
    if dry or n_null == 0:
        print("dry run — nothing written" if dry else "nothing to do")
        return
    with c:
        c.execute("DROP TABLE IF EXISTS _contracts_nullid_dups_backup")
        c.execute(f"CREATE TABLE _contracts_nullid_dups_backup AS SELECT * FROM contracts WHERE {DUP}")
        c.execute(f"DELETE FROM contracts WHERE {DUP}")
        rows = c.execute(f"SELECT rowid FROM contracts WHERE id IS NULL ORDER BY {ORDER}").fetchall()
        c.execute("DROP TABLE IF EXISTS _contracts_nullid_assigned")
        c.execute("CREATE TABLE _contracts_nullid_assigned (new_id INTEGER PRIMARY KEY)")
        for i, (rid,) in enumerate(rows, start=max_id + 1):
            c.execute("UPDATE contracts SET id = ? WHERE rowid = ?", (i, rid))
            c.execute("INSERT INTO _contracts_nullid_assigned VALUES (?)", (i,))
        c.execute("""CREATE TRIGGER IF NOT EXISTS trg_contracts_id_not_null BEFORE INSERT ON contracts
                     WHEN NEW.id IS NULL BEGIN SELECT RAISE(ABORT, 'contracts.id must not be NULL'); END""")
    left = c.execute("SELECT COUNT(*) FROM contracts WHERE id IS NULL").fetchone()[0]
    dups = c.execute("SELECT COUNT(*) FROM (SELECT id FROM contracts GROUP BY id HAVING COUNT(*)>1)").fetchone()[0]
    print(f"deleted {n_dup:,} duplicates; assigned ids {max_id+1:,}..{max_id+len(rows):,} to {len(rows):,} orphans; "
          f"NULL-id left {left}; duplicate ids {dups}")
    for _ in range(10):
        r = c.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        if r[0] == 0:
            break
    print("checkpoint", r)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--db", required=True)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--rollback", action="store_true")
    a = p.parse_args()
    run(a.db, a.dry_run, a.rollback)
