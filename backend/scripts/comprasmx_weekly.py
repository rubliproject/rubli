"""Weekly ComprasMX refresh: new open-data contracts → scored register → every precompute.

Owner decision 2026-10-27 («keep the data fresh; watch the current administration»).
The Oct 23 load (`/var/lib/rubli-jobs/scratch/cmx/run_v092.sh`) is the template; this runs the
same chain on the LIVE DB, after a backup, and only when ComprasMX published something new.

  1  backup                       sqlite backup API → /backups/rubli_weekly_<date>.db (keeps 2)
  2  etl_comprasmx_contratos      --download --new-only   (INSERT OR IGNORE: links survive)
  3  link_comprasmx_contracts     institution / vendor / sector / category links (UPDATE, idempotent)
  4  resolve_comprasmx_vendors    --apply (RFC map, dropped again at the end: not kept on prod)
  5  integrate_comprasmx          --apply (contract-level dedupe → only unseen contracts load)
  6  classify_new_institutions    --write (the buyers integrate just created)
  7  _v10/build_v10 + score_v092  as-of features, v0.9.2 scores (guards in the scorer)
  8  stats, ARIA, precomputes     the run_v092.sh chain; precomputes are soft (logged, chain goes on)
  9  checkpoint + status          /app/data/WEEKLY_REFRESH.json

Run inside the job image (pandas) with the repo at /w and the DB dir at /app/data:
  docker run --rm --user root -v /opt/rubli:/w -v /var/lib/rubli-db:/app/data \
    -v /var/lib/docker/volumes/rubli_rubli_backups/_data:/backups -e DATABASE_PATH=/app/data/RUBLI_DEPLOY.db \
    --entrypoint python rubli-job:pandas /w/backend/scripts/comprasmx_weekly.py
Flags: --dry-run (download + count new codes, write nothing) · --force (run even with 0 new).

Outcome (WEEKLY_REFRESH.json `result`; GET /stats/data-cut turns it into weekly_status ok|degraded|failed):
  ok                 every step rc 0
  ok_soft_failures   a soft step (stats/ARIA/precompute) failed; `soft_failures` names them. The core
                     steps (etl, link, resolve, integrate, features, score) are hard, so reaching the end
                     means they all passed: the record DID move and `last_ok` advances (site: «actualización
                     parcial»); the derived tables those soft steps feed are last week's
  nothing new        nothing staged this week AND integrate's plan would load nothing (a backlog left by a
                     failed run, or rows that got their date, still runs the chain); `last_ok` advances
  FAILED at <step>   a hard step failed, or valid E contracts stayed unscored; `last_ok` is kept
  skipped: locked    another run holds WEEKLY_REFRESH.lock (flock: the kernel frees it when a run dies)

Alert (optional): RUBLI_ALERT_URL = a dead-man ping URL, e.g. a free healthchecks.io check (period 7 days,
grace 1 day; the owner creates the account). Every run that ends POSTs {result, new_contracts,
soft_failures}: a clean run (ok / nothing new) to the URL itself, anything else to <URL>/fail (the
healthchecks.io convention). No ping for 8 days (dead timer, hung run) pages too. Or an ntfy topic URL
(host contains "ntfy"): every run posts to the topic, priority high when not clean (no dead-man then).
Model-monitor alerts (`model_monitor.alerts`) make a clean run «not clean» for the alert only.
scripts/rubli-weekly.sh reads it from the root-only /etc/rubli-weekly.env and passes `-e RUBLI_ALERT_URL`;
never in the repo. Alert errors are logged and never fail the run (timeout 10 s).
"""
import argparse
import datetime as dt
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

W = Path(os.environ.get("RUBLI_REPO", "/w"))
DB = os.environ.get("DATABASE_PATH", "/app/data/RUBLI_DEPLOY.db")
BACKUPS = Path(os.environ.get("RUBLI_BACKUPS", "/backups"))
WORK = Path(os.environ.get("RUBLI_WEEKLY_DIR", "/app/data/weekly"))
STATUS = Path(DB).with_name("WEEKLY_REFRESH.json")
LOCK = Path(DB).with_name("WEEKLY_REFRESH.lock")
ENV = {**os.environ, "DATABASE_PATH": DB, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"}
status: dict = {}
CLEAN = ("ok", "nothing new")


def _last_ok() -> dict | None:
    """The previous successful run, carried forward so the site keeps saying when the record last
    moved while a run is in progress or after one fails (GET /stats/data-cut reads it)."""
    try:
        old = json.loads(STATUS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if old.get("last_ok"):
        return old["last_ok"]
    return {"new_contracts": old.get("new_contracts"), "finished": old["finished"]} if old.get("result") == "ok" else None


def _prev_unscored() -> int | None:
    """Last week's count of valid unscored contracts, carried across runs that skip the monitor."""
    try:
        old = json.loads(STATUS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return (old.get("model_monitor") or {}).get("null_score_valid", old.get("prev_unscored"))


def _now() -> str:
    return dt.datetime.utcnow().isoformat() + "Z"


def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


def save():
    tmp = STATUS.with_name(f"{STATUS.name}.{os.getpid()}.tmp")  # atomic: a kill never truncates the status
    tmp.write_text(json.dumps(status, indent=1, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, STATUS)


def _lock():
    """An exclusive lock on WEEKLY_REFRESH.lock, or None when another run holds it. The kernel frees it
    when the process dies (OOM, docker kill, reboot), so a crash never leaves a stale lock (review § B2)."""
    f = open(LOCK, "a+")
    try:
        if os.name == "nt":  # dev machines; prod is Linux
            import msvcrt
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return None
    return f


HR_GATE = (0.02, 0.15)       # overall flag rate (share >= 0.40): CLAUDE.md gate, also the scorer's hard guard
HR_SLICE_GATE = (0.02, 0.20)  # per structure / per year since 2023: the per-era tolerance at fit (MODEL_CARD_v0.9.2 § 8)


def model_monitor(conn, prev_unscored: int | None = None) -> dict:
    """Flag rate overall, per structure and per year >= 2023, plus valid contracts left unscored
    (docs/MODEL_MONITORING_2026-10-30.md). One scan over the scorer's universe (score_v092.compute:
    0 < amount_mxn <= 100B; build_v10 writes a feature row for every such contract, vendor or not).
    Out-of-gate cells become `alerts`: recorded, pinged, never fatal. The unscored count alerts only when
    it rises vs last week (`prev_unscored`; none = 0). The overall HR is dominated by 3M historical
    rows, so ComprasMX (E) drift only shows in the slices."""
    agg: dict = {}  # key -> [high, scored]
    unscored = 0
    for s, y, hi, n, nul in conn.execute(
            "SELECT source_structure, contract_year, SUM(risk_score >= 0.40), COUNT(risk_score), "
            "SUM(risk_score IS NULL) FROM contracts WHERE amount_mxn > 0 AND amount_mxn <= 1e11 GROUP BY 1, 2"):
        unscored += nul
        for k in (("all", "all"), ("s", str(s)), ("y", str(y)) if y is not None and y >= 2023 else None):
            if k and n:
                a = agg.setdefault(k, [0, 0])
                a[0] += hi or 0
                a[1] += n

    def hr(kind):
        return {k: round(h / n, 4) for (t, k), (h, n) in sorted(agg.items()) if t == kind}
    m = {"hr": hr("all"), "hr_by_structure": hr("s"), "hr_by_year": hr("y"), "null_score_valid": unscored}
    al = [f"overall HR {v}" for v in m["hr"].values() if not HR_GATE[0] <= v <= HR_GATE[1]]
    al += [f"structure {k} HR {v}" for k, v in m["hr_by_structure"].items() if not HR_SLICE_GATE[0] <= v <= HR_SLICE_GATE[1]]
    al += [f"year {k} HR {v}" for k, v in m["hr_by_year"].items() if not HR_SLICE_GATE[0] <= v <= HR_SLICE_GATE[1]]
    if unscored > (prev_unscored or 0):
        al.append(f"{unscored} valid contracts unscored (last week {prev_unscored or 0})")
    m["alerts"] = al
    return m


def alert():
    """POST the outcome to RUBLI_ALERT_URL. Never raises. healthchecks.io URL: clean → URL, else URL/fail;
    ntfy topic URL (host contains "ntfy"): always the topic, priority high when not clean.
    A clean run with model-monitor alerts still pings /fail (the site status is not touched)."""
    url, r = os.environ.get("RUBLI_ALERT_URL"), status.get("result")
    if not url or r in (None, "dry-run"):
        return
    model_alerts = (status.get("model_monitor") or {}).get("alerts")
    clean = r in CLEAN and not model_alerts
    body = {"result": r, "new_contracts": status.get("new_contracts"), "soft_failures": status.get("soft_failures", [])}
    if model_alerts:
        body["model_alerts"] = model_alerts
    body = json.dumps(body).encode()
    if "ntfy" in (urllib.parse.urlparse(url).hostname or ""):  # ntfy topic URL: one topic, priority says how bad
        target, headers = url, {"Title": f"RUBLI weekly: {'ok' if clean else 'ATTENTION'}",
                                "Priority": "low" if clean else "high"}
    else:  # healthchecks.io convention: clean -> URL, else URL/fail
        target, headers = (url if clean else url.rstrip("/") + "/fail"), {"Content-Type": "application/json"}
    try:
        urllib.request.urlopen(urllib.request.Request(target, data=body, headers=headers), timeout=10).close()
    except Exception as e:  # noqa: BLE001 — the alert must never fail the run
        log("alert failed:", e)


def pending_load() -> int:
    """Staged contracts integrate would still load (its own skip rules: CompraNet duplicate, >100B,
    waiting for a date). The RFC map is dropped after each run, so the same-vendor dedupe falls back to
    an exact vendors.rfc match; whatever that misses over-counts (a needless full run), never
    under-counts (a backlog silently left behind: review § B1). RFCs are read, never written or logged."""
    sys.path.insert(0, str(W / "backend"))
    from scripts.integrate_comprasmx import plan_load
    c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=120)
    try:
        has = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE name IN ('comprasmx_vendor_resolution', 'vendors')")}
        if "comprasmx_vendor_resolution" in has:
            res = {r: (m, v) for r, m, v in c.execute("SELECT rfc, method, vendor_id FROM comprasmx_vendor_resolution")}
        elif "vendors" in has:
            res = {r: ("rfc", v) for r, v in c.execute(
                "SELECT rfc, MIN(id) FROM vendors WHERE rfc IN (SELECT UPPER(TRIM(rfc)) FROM comprasmx_contracts) GROUP BY rfc")}
        else:
            res = {}
        return plan_load(c, res)[0]["load"]
    finally:
        c.close()


def run(name, cmd, hard=True):
    t = time.time()
    log("==", name)
    rc = subprocess.run(cmd, cwd=W / "backend", env=ENV).returncode
    status["steps"].append({"step": name, "rc": rc, "s": round(time.time() - t)})
    save()
    if rc and hard:
        status["result"] = f"FAILED at {name}"
        save()
        sys.exit(f"HARD_FAIL: {name} (rc {rc})")
    return rc


def q(sql):
    c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=120)
    try:
        return c.execute(sql).fetchall()
    finally:
        c.close()


def backup():
    BACKUPS.mkdir(parents=True, exist_ok=True)
    out = BACKUPS / f"rubli_weekly_{dt.date.today():%Y%m%d}.db"
    src, dst = sqlite3.connect(f"file:{DB}?mode=ro", uri=True), sqlite3.connect(out)
    src.backup(dst)
    ok = dst.execute("PRAGMA quick_check").fetchone()[0]
    dst.close(); src.close()
    if ok != "ok":
        sys.exit(f"backup quick_check failed: {ok}")
    for old in sorted(BACKUPS.glob("rubli_weekly_*.db"))[:-2]:  # keep the two newest weekly copies
        old.unlink()
    log("backup", out.name)
    return out.name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    held = _lock()
    status.clear()
    if held is None:  # keep the holder's status (and last_ok); only say this attempt was skipped
        try:
            status.update(json.loads(STATUS.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass
        status.update(result="skipped: locked", last_attempt=_now())
        save()
        alert()
        sys.exit(f"another refresh holds {LOCK}")
    status.update(started=_now(), steps=[], last_ok=_last_ok(), prev_unscored=_prev_unscored())
    try:
        before_staged = q("SELECT COUNT(*) FROM comprasmx_contracts")[0][0]
        before_e = q("SELECT COUNT(*) FROM contracts WHERE source_structure = 'E'")[0][0]
        status.update(before={"staged": before_staged, "contracts_E": before_e})
        if a.dry_run:
            import importlib
            sys.path.insert(0, str(W / "backend"))
            etl = importlib.import_module("scripts.etl_comprasmx_contratos")
            etl.download(WORK, (2025, 2026))
            import csv
            import io
            have = {r[0] for r in q("SELECT codigo_contrato FROM comprasmx_contracts")}
            new = 0
            for y in (2025, 2026):
                rows = csv.reader(io.StringIO(etl.decode((WORK / f"Contratos_ComprasMX_{y}.csv").read_bytes()), newline=""))
                next(rows)
                new += sum(1 for r in rows if len(r) > 1 and r[etl.COLS[[n for _, n in etl.COLS].index("codigo_contrato")][0]] not in have)
            status.update(result="dry-run", new_codes=new); save()
            log("dry run: new contract codes", new)
            return
        status["backup"] = backup(); save()
        run("etl (download, new only)", [sys.executable, "-m", "scripts.etl_comprasmx_contratos", "--download",
                                         "--new-only", "--dir", str(WORK), "--db", DB])
        new_staged = q("SELECT COUNT(*) FROM comprasmx_contracts")[0][0] - before_staged
        status["new_staged"] = new_staged; save()
        if new_staged == 0 and not a.force:
            status["pending_load"] = pending_load(); save()
            if status["pending_load"] == 0:
                status.update(result="nothing new", new_contracts=0, finished=_now())
                status["last_ok"] = {"new_contracts": 0, "finished": status["finished"]}
                save()
                log("ComprasMX published nothing new; stopping")
                return
            log("nothing newly staged, but", status["pending_load"], "staged contracts still unloaded; running")
        run("link", [sys.executable, "-m", "scripts.link_comprasmx_contracts", "--db", DB])
        run("resolve vendors", [sys.executable, "-m", "scripts.resolve_comprasmx_vendors", "--db", DB, "--out", str(WORK), "--apply"])
        run("integrate", [sys.executable, "-m", "scripts.integrate_comprasmx", "--db", DB, "--apply"])
        status["new_contracts"] = q("SELECT COUNT(*) FROM contracts WHERE source_structure = 'E'")[0][0] - before_e; save()
        run("classify new institutions", [sys.executable, "-m", "scripts.classify_new_institutions", "--db", DB, "--write"])
        run("features v10", [sys.executable, str(W / "_v10/build_v10.py"), "--db", DB])
        model = str(W / "_v10/rematch_result.json")
        run("score v0.9.2 (dry)", [sys.executable, str(W / "_v10/score_v092.py"), "--db", DB, "--model", model])
        run("score v0.9.2", [sys.executable, str(W / "_v10/score_v092.py"), "--db", DB, "--model", model, "--write"])
        status["unscored_valid_E"] = q("SELECT COUNT(*) FROM contracts WHERE source_structure = 'E' AND risk_score IS NULL "
                                       "AND amount_mxn > 0 AND amount_mxn <= 1e11")[0][0]
        if status["unscored_valid_E"]:  # review § S6: a partial feature table scores a partial set
            status["result"] = "FAILED at score coverage"
            save()
            sys.exit(f"HARD_FAIL: {status['unscored_valid_E']} valid E contracts unscored")
        try:  # non-fatal: a broken monitor is itself an alert, never a failed run
            c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=120)
            try:
                status["model_monitor"] = model_monitor(c, status["prev_unscored"])
            finally:
                c.close()
        except Exception as e:  # noqa: BLE001
            status["model_monitor"] = {"alerts": [f"model monitor failed: {type(e).__name__}"]}
        save()
        log("model monitor alerts:", status["model_monitor"]["alerts"] or "none")
        run("stats tables", [sys.executable, "scripts/_refresh_stats_tables.py", "--db", DB])
        run("risk stats", [sys.executable, str(W / "_v09/v091/prod/refresh_risk_stats.py"), DB])
        soft = [
            ["-m", "scripts.aria_init_schema"], ["-u", "-m", "scripts.aria_pipeline", "--db", DB],
            ["SH", "scripts/category_precompute_chain.sh", DB],
            ["scripts/precompute_stats.py", "--db", DB], ["scripts/precompute_yearly_rankings.py", "--db", DB],
            ["-m", "scripts.precompute_vendor_year", "--db", DB],  # vendor list by-year sparkline
            ["-m", "scripts._precompute_sector_largest_contracts", DB], ["scripts/_precompute_sector_vendors.py", "--db", DB],
            ["-m", "scripts.precompute_institution_top_vendors", "--db", DB],
            ["-m", "scripts.precompute_institution_vendor_register", "--db", DB],
            ["-m", "scripts.precompute_concentration", "--db", DB], ["-m", "scripts.precompute_sector_concentration", "--db", DB],
            ["-m", "scripts.precompute_institution_lens", DB],
            ["-m", "scripts.compute_scorecards", "--db", DB], ["-m", "scripts.compute_official_profiles", "--db", DB],
            ["-m", "scripts.precompute_slow_endpoints", "--db", DB], ["-m", "scripts._precompute_atlas_cohort_periods", DB],
            ["-m", "scripts.precompute_captura", "--db", DB, "--write"],
            ["-m", "scripts.precompute_atlas_sky", "--db", DB], ["-m", "scripts.precompute_atlas_sky", "--db", DB, "--years-backfill"],
            ["-m", "scripts.precompute_category_sexenio", "--db", DB],
            # after the category chain + vendor_stats: GET /categories/{id}/cover serves these rows (B3)
            ["-m", "scripts.precompute_category_covers", "--db", DB],
        ]
        soft.append(["-m", "scripts.precompute_recent", "--db", DB])
        soft.append(["-m", "scripts.precompute_events", "--db", DB])
        soft.append(["-m", "scripts.precompute_newtabs", "--db", DB])  # arranque / mismo día / parejas reach the cut
        if (W / "backend/scripts/precompute_sexenio_actual.py").exists():
            soft.append(["-m", "scripts.precompute_sexenio_actual", "--db", DB])
        # /gasto-a-ciegas: 2026 contract counts against the stored Cuenta Pública table (no --csv: reuses budget_exercised)
        soft.append(["-m", "scripts.precompute_budget_visibility", "--db", DB])
        soft.append(["-m", "scripts.precompute_rastro", "--db", DB])  # /rastro: GET /rastro/trail (refuses to write a broken trail)
        for args in soft:
            cmd = ["sh"] + args[1:] if args[0] == "SH" else [sys.executable] + args
            run(" ".join(args[:3]), cmd, hard=False)
        run("perf indexes", [sys.executable, "scripts/_add_perf_indexes.py", DB])
        c = sqlite3.connect(DB, timeout=600)
        c.execute("DROP TABLE IF EXISTS comprasmx_vendor_resolution")  # RFC map: not kept on prod
        c.commit()
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        c.close()
        # the cut is the newest LOADED contract (review § S1), not the newest staged publication
        cut = (q("SELECT contract_date FROM contracts WHERE source_structure = 'E' AND contract_date IS NOT NULL "
                 "ORDER BY contract_date DESC LIMIT 1") or [[None]])[0][0]
        soft_failures = [s["step"] for s in status["steps"] if s["rc"]]
        status.update(result="ok_soft_failures" if soft_failures else "ok", data_cut=cut,
                      soft_failures=soft_failures, finished=_now())
        status["last_ok"] = {"new_contracts": status.get("new_contracts"), "finished": status["finished"]}
        save()
        log("done · cut", cut, "· new contracts", status.get("new_contracts"), "· soft failures", soft_failures)
    except BaseException as e:
        if not status.get("result"):  # an exception outside run(): still record (and alert) it
            status["result"] = f"FAILED: {type(e).__name__}"
            save()
        raise
    finally:
        alert()
        held.close()


if __name__ == "__main__":
    main()
