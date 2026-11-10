"""verify-backup.py <rubli_X.db.gz> <expected_bytes> [--quick-check]

Called by pull-backup.ps1. Default (streaming, writes nothing):
  - gunzip the whole stream (gzip checks CRC-32 + length at EOF) = `gunzip -t`;
  - decompressed size == LAST_BACKUP.json size_bytes;
  - SQLite header magic, and page_size * page_count (header) == that size.
The VPS ran PRAGMA quick_check on exactly this file before naming it in LAST_BACKUP.json, so a CRC-clean,
size-exact copy is that file bit for bit.
--quick-check additionally decompresses next to the file and runs PRAGMA quick_check + COUNT(*) contracts.
On the PC's laptop HDD that took > 1 h (random reads), hence opt-in. The temp copy is always deleted.
"""
import gzip
import os
import shutil
import sqlite3
import sys
import tempfile


def fail(msg):
    print(msg)  # stdout, not stderr: Windows PowerShell turns native stderr into an exception
    sys.exit(1)


def stream_check(src, want):
    n, head = 0, b""
    try:
        with gzip.open(src, "rb") as f:
            while chunk := f.read(8 << 20):
                if not head:
                    head = chunk[:100]
                n += len(chunk)
    except (OSError, EOFError) as e:  # BadGzipFile (CRC / length) is an OSError; EOFError = truncated
        fail(f"gzip: {e}")
    if n != want:
        fail(f"size {n} != expected {want}")
    if not head.startswith(b"SQLite format 3\x00"):
        fail("not an SQLite file (bad header magic)")
    page_size = int.from_bytes(head[16:18], "big")
    page_size = 65536 if page_size == 1 else page_size  # header stores 65536 as 1
    pages = int.from_bytes(head[28:32], "big")
    if page_size * pages != want:
        fail(f"header says {pages} pages x {page_size} B != {want}")
    return f"gzip crc ok, size ok, sqlite header ok ({pages} pages)"


def quick_check(src, min_contracts=3_000_000):
    fd, tmp = tempfile.mkstemp(suffix=".verify.db", dir=os.path.dirname(os.path.abspath(src)))
    os.close(fd)
    try:
        with gzip.open(src, "rb") as f, open(tmp, "wb") as out:
            shutil.copyfileobj(f, out, 8 << 20)
        con = sqlite3.connect(tmp)
        try:
            check = con.execute("PRAGMA quick_check").fetchone()[0]
            n = con.execute("SELECT COUNT(*) FROM contracts").fetchone()[0]
        finally:
            con.close()
        if check != "ok":
            fail(f"quick_check: {check}")
        if n < min_contracts:
            fail(f"contracts={n} < {min_contracts}")
        return f"quick_check ok, contracts={n}"
    finally:
        for p in (tmp, tmp + "-wal", tmp + "-shm"):
            if os.path.exists(p):
                os.remove(p)


if __name__ == "__main__":
    src, want = sys.argv[1], int(sys.argv[2])
    out = stream_check(src, want)
    if "--quick-check" in sys.argv[3:]:
        out += ", " + quick_check(src)
    print(out)
