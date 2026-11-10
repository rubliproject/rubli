"""
swap_category_precomputes.py — copy rebuilt category precomputes from a scratch DB into a live DB.

Generalises the 2026-10-06 prod swap (_weekend/drift/swap_live2.py): rebuild the chain on a
scratch copy (so live readers never see a half-built table), then per table, in one
transaction each: back up the live table, replace its rows with the scratch rows (insert by
column name; subcategory_definitions upserted into live on (category_id, code) and every
subcategory_id column remapped scratch id -> live id through that key), then replace
the precomputed_stats 'category%' keys, blanking persona-física vendor names in the stored
largest-contract key (the endpoint also does this at read time).

Run from backend/ (in-container: /app):
    python -m scripts.swap_category_precomputes --live /app/RUBLI_DEPLOY.db --scratch /tmp/cat_scratch.db --suffix 20261007p0
    ... --apply
"""
import argparse
import json
import sqlite3
import time
from datetime import datetime

TABLES = ["atlas_cohort_period_stats", "category_stats", "category_yearly_stats", "category_vendor_topn",
          "category_vendor_institution_topn", "institution_category_stats", "subcategory_stats",
          "subcategory_vendor_topn", "contract_subcategory"]
SUB_TABLES = {"subcategory_stats", "subcategory_vendor_topn", "contract_subcategory"}
# scratch subcategory id -> live id, through (category_id, code) — codes alone repeat across categories
REMAP = "(select m.live_id from temp.submap m where m.sid = x.subcategory_id)"


def sync_definitions(c, suf: str, apply: bool) -> None:
    """Upsert scratch subcategory_definitions into live on (category_id, code), drop live rows the scratch
    no longer has, and fill temp.submap(sid -> live_id)."""
    if apply:
        c.execute("begin immediate")
        try:
            c.execute(f"create table main._subcategory_definitions{suf} as select * from main.subcategory_definitions")
            c.execute("""insert into main.subcategory_definitions
                           (category_id, code, name_en, name_es, keywords, is_catch_all, display_order)
                         select category_id, code, name_en, name_es, keywords, is_catch_all, display_order
                         from s.subcategory_definitions where true
                         on conflict(category_id, code) do update set
                           name_en = excluded.name_en, name_es = excluded.name_es, keywords = excluded.keywords,
                           is_catch_all = excluded.is_catch_all, display_order = excluded.display_order""")
            c.execute("""delete from main.subcategory_definitions where not exists (
                           select 1 from s.subcategory_definitions n
                           where n.category_id = main.subcategory_definitions.category_id
                             and n.code = main.subcategory_definitions.code)""")
            c.execute("commit")
        except Exception:
            c.execute("rollback")
            raise
    c.execute("drop table if exists temp.submap")
    c.execute("create temp table submap (sid integer primary key, live_id integer)")
    c.execute("""insert into temp.submap select n.id, l.id from s.subcategory_definitions n
                 left join main.subcategory_definitions l on l.category_id = n.category_id and l.code = n.code""")
    missing = c.execute("select count(*) from temp.submap where live_id is null").fetchone()[0]
    print(f"subcategory_definitions: scratch {c.execute('select count(*) from s.subcategory_definitions').fetchone()[0]}"
          f", not yet in live {missing}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", required=True)
    ap.add_argument("--scratch", required=True)
    ap.add_argument("--suffix", required=True, help="backup table suffix, e.g. 20261007p0")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    suf = f"_backup_{args.suffix}"

    c = sqlite3.connect(args.live, timeout=600, isolation_level=None)
    c.execute("PRAGMA busy_timeout = 600000")
    c.execute("attach ? as s", (args.scratch,))
    cols = lambda db, t: [r[1] for r in c.execute(f"pragma {db}.table_info({t})")]
    one = lambda q, p=(): c.execute(q, p).fetchone()[0]

    sync_definitions(c, suf, args.apply)
    for t in TABLES:
        if not c.execute("select 1 from main.sqlite_master where name = ?", (t,)).fetchone():
            print(f"{t}: new in live")
            if not args.apply:
                continue
            c.execute(c.execute("select sql from s.sqlite_master where name = ?", (t,)).fetchone()[0])
            for (idx,) in c.execute("select sql from s.sqlite_master where type = 'index' and tbl_name = ? "
                                    "and sql is not null", (t,)).fetchall():
                c.execute(idx)
        lc, sc = cols("main", t), cols("s", t)
        for x in [x for x in sc if x not in lc]:  # additive schema change (e.g. consolidated_value_pct)
            print(f"{t}: add column {x}")
            if args.apply:
                ctype = next(r[2] for r in c.execute(f"pragma s.table_info({t})") if r[1] == x)
                c.execute(f'alter table main.{t} add column "{x}" {ctype}')
        if not args.apply and any(x not in lc for x in sc):
            continue
        lc = cols("main", t)
        assert sorted(lc) == sorted(sc), (t, lc, sc)
        assert not c.execute("select 1 from main.sqlite_master where name = ?", (f"_{t}{suf}",)).fetchone(), t
        ins = [x for x in lc if not (t == "subcategory_stats" and x == "id")]
        sel = ",".join(REMAP if (t in SUB_TABLES and x == "subcategory_id") else f'x."{x}"' for x in ins)
        n_s = one(f"select count(*) from s.{t}")
        print(f"{t}: live {one(f'select count(*) from main.{t}'):,} -> scratch {n_s:,}")
        if not args.apply:
            continue
        c.execute("begin immediate")
        try:
            c.execute(f"create table main._{t}{suf} as select * from main.{t}")
            c.execute(f"delete from main.{t}")
            c.execute(f"insert into main.{t} ({','.join(chr(34) + x + chr(34) for x in ins)}) select {sel} from s.{t} x")
            assert one(f"select count(*) from main.{t}") == n_s
            if t in ("subcategory_stats", "subcategory_vendor_topn"):
                assert one(f"select count(*) from main.{t} where subcategory_id is null") == 0
            if t == "contract_subcategory":  # NULL only where the scratch row was NULL (no definitions)
                assert one(f"select count(*) from main.{t} where subcategory_id is null") == \
                    one(f"select count(*) from s.{t} where subcategory_id is null")
            c.execute("commit")
        except Exception:
            c.execute("rollback")
            raise

    keys = {k: v for k, v in c.execute(
        "select stat_key, stat_value from s.precomputed_stats where stat_key like 'category%'")}
    live_keys = {r[0] for r in c.execute("select stat_key from main.precomputed_stats where stat_key like 'category%'")}
    print(f"precomputed 'category%' keys: live {len(live_keys)} scratch {len(keys)} "
          f"(new {len(set(keys) - live_keys)}, dropped {len(live_keys - set(keys))})")
    k = "category_largest_contracts"
    if k in keys:
        from api.public_labels import is_persona_fisica
        d = json.loads(keys[k])
        ids = sorted({r["vendor_id"] for rows in d.values() for r in rows if r.get("vendor_id") is not None})
        persons = {v for v, i, rfc in c.execute(
            f"select id, is_individual, rfc from main.vendors where id in ({','.join('?' * len(ids))})", ids)
            if is_persona_fisica(i, rfc)}
        n = 0
        for rows in d.values():
            for r in rows:
                if r.get("vendor_id") in persons and r.get("vendor_name"):
                    r["vendor_name"] = ""
                    n += 1
        keys[k] = json.dumps(d)
        print(f"{k}: persona names blanked {n}")
    if args.apply:
        now = datetime.now().isoformat()
        c.execute("begin immediate")
        try:
            c.execute(f"create table main._precomputed_stats{suf} as select * from main.precomputed_stats "
                      "where stat_key like 'category%'")
            c.executemany("insert or replace into main.precomputed_stats (stat_key, stat_value, updated_at) "
                          "values (?, ?, ?)", [(kk, vv, now) for kk, vv in keys.items()])
            c.execute("commit")
        except Exception:
            c.execute("rollback")
            raise
    c.execute("detach s")
    if args.apply:
        for _ in range(40):
            r = c.execute("pragma wal_checkpoint(TRUNCATE)").fetchone()
            print("checkpoint", r)
            if r[0] == 0:
                break
            time.sleep(3)
    else:
        print("[dry run] no writes")


if __name__ == "__main__":
    main()
