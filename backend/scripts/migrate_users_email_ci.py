"""Lower-case users.email and add a unique index on lower(email) (security B-01).

Idempotent. Refuses to touch anything while case-duplicate emails exist and
prints only their user ids (no emails) so a human can resolve them first.

    python -m scripts.migrate_users_email_ci --db RUBLI_NORMALIZED.db
"""
import argparse
import sqlite3
import sys


def migrate(conn: sqlite3.Connection) -> list[list[int]]:
    """Return the colliding id groups (and change nothing), or [] on success."""
    dupes = [
        [int(i) for i in ids.split(",")]
        for (ids,) in conn.execute(
            "SELECT group_concat(id) FROM (SELECT id, lower(trim(email)) AS e FROM users ORDER BY id) "
            "GROUP BY e HAVING count(*) > 1"
        )
    ]
    if dupes:
        return dupes
    with conn:
        conn.execute("UPDATE users SET email = lower(trim(email)) WHERE email != lower(trim(email))")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_ci ON users(lower(email))")
    return []


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    conn = sqlite3.connect(ap.parse_args().db, timeout=30)
    dupes = migrate(conn)
    if dupes:
        sys.exit(f"ABORT: case-duplicate users (ids) {dupes}; resolve by hand, then re-run")
    print("ok: emails lower-cased, ux_users_email_ci present")
