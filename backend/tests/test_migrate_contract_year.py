"""migrate_contract_year: realign, keep NULL dates, idempotent, reversible."""
import sqlite3

from scripts.migrate_contract_year import migrate, rollback

ROWS = [
    # id, date, year, sexenio, election, structure
    (1, "2011-03-01", 2010, 5, 0, "B"),     # moves 2010 -> 2011
    (None, "2012-07-01", 2010, 5, 0, "B"),  # NULL id, moves -> 2012 (election)
    (3, None, 2010, 5, 0, "B"),             # NULL date: kept
    (4, "2013-01-01", 2013, 2, 0, "B"),     # already right
    (5, "1999-01-01", 2002, 3, 0, "A"),     # out-of-range date: kept
    (6, "2024-02-01", 2023, None, 0, "D"),  # NULL sexenio stays NULL
]


def test_migrate_roundtrip(tmp_path):
    db = str(tmp_path / "t.db")
    c = sqlite3.connect(db)
    c.execute("CREATE TABLE contracts (id INT, contract_date NUM, contract_year INT, sexenio_year INT,"
              " is_election_year INT, source_structure TEXT, amount_mxn REAL DEFAULT 1)")
    c.executemany("INSERT INTO contracts (id, contract_date, contract_year, sexenio_year,"
                  " is_election_year, source_structure) VALUES (?,?,?,?,?,?)", ROWS)
    c.commit()
    before = c.execute("SELECT rowid, * FROM contracts ORDER BY rowid").fetchall()

    migrate(db, dry_run=True, csv_path=None)
    assert c.execute("SELECT * FROM contracts ORDER BY rowid").fetchall() == [r[1:] for r in before]

    migrate(db, dry_run=False, csv_path=str(tmp_path / "rev.csv"))
    got = c.execute("SELECT contract_year, sexenio_year, is_election_year FROM contracts ORDER BY rowid").fetchall()
    assert got == [(2011, 6, 0), (2012, 1, 1), (2010, 5, 0), (2013, 2, 0), (2002, 3, 0), (2024, None, 1)]
    assert (tmp_path / "rev.csv").read_text().count("\n") == 4  # header + 3 changed

    migrate(db, dry_run=False, csv_path=None)  # idempotent no-op
    assert c.execute("SELECT COUNT(*) FROM _mig_contract_year_backup").fetchone()[0] == 3

    rollback(db)
    assert c.execute("SELECT rowid, * FROM contracts ORDER BY rowid").fetchall() == before
