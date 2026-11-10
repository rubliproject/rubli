#!/usr/bin/env bash
# test-ops-backup.sh — offline test of offsite-backup.sh --dry-run + restore-test.sh on a tiny WAL DB.
# Needs bash, sqlite3, zstd, sha256sum. No network, no prod. Usage: bash scripts/test-ops-backup.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d -p "${TMPDIR:-/tmp}")"
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"   # relative paths: native Windows sqlite3.exe can't read MSYS /c/... paths inside .backup '...'
export RUBLI_OPS_ENV=/dev/null RUBLI_DB=src.db RUBLI_NIGHTLY_DIR=nightly RUBLI_STAGE=stage \
       RUBLI_RESTORE_DIR=restore RUBLI_MIN_CONTRACTS=3 RUBLI_OFFSITE=pull
ok() { echo "PASS: $*"; }

sqlite3 src.db "PRAGMA journal_mode=WAL; CREATE TABLE contracts(id INTEGER PRIMARY KEY, amount REAL);
                INSERT INTO contracts(amount) VALUES (1.5),(2.5),(3.5);" >/dev/null
mkdir -p nightly

# 1. no LAST_BACKUP.json → fresh .backup snapshot, compressed + checksummed, snapshot cleaned up
bash "$here/offsite-backup.sh" --dry-run | tee run1.log
grep -q "snapshotting" run1.log && grep -q "\[dry-run\] would ship" run1.log
[ "$(find stage -name 'rubli_*.db.zst' | wc -l)" -eq 1 ] && [ ! -e stage/snapshot.db ]
ok "dry-run snapshot staged"

# 2. restore test round-trips: sha256 + integrity_check + count
bash "$here/restore-test.sh" | tee run2.log
grep -q "RESTORE OK: .*contracts=3" run2.log
ok "restore test counts 3 contracts"

# 3. LAST_BACKUP.json present → reuses the verified nightly instead of a new snapshot
sqlite3 src.db ".backup 'nightly/rubli_20261028_020000.db'"
echo '{"last_backup": "x", "files": ["rubli_20261028_020000.db"], "size_bytes": 1}' > LAST_BACKUP.json
sleep 1   # distinct second-resolution stamp
bash "$here/offsite-backup.sh" --dry-run | tee run3.log
grep -q "source: verified nightly nightly/rubli_20261028_020000.db" run3.log
ok "nightly reused"

# 4. a corrupted file must FAIL the restore test
f="$(find stage -name 'rubli_*.db.zst' | sort | tail -n 1)"
printf 'garbage' >> "$f"
if bash "$here/restore-test.sh" "$f" > run4.log 2>&1; then echo "FAIL: corrupt backup passed"; exit 1; fi
grep -q "sha256 mismatch" run4.log
ok "corrupt backup rejected"

# 5. a wrong mode must fail before doing work
if RUBLI_OFFSITE=ftp bash "$here/offsite-backup.sh" --dry-run > run5.log 2>&1; then echo "FAIL: bad mode accepted"; exit 1; fi
ok "bad RUBLI_OFFSITE rejected"
echo "ALL PASS"
