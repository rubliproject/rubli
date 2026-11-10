"""Voice the gallery films (Intro + one per Newsroom story) — neural TTS, one clip per beat.

Run from frontend/:  python scripts/gen_film_vo.py [slug ...] [--force]

Reads src/lib/gallery/story-films.json (the caption IS the narration), writes
public/gallery-vo/<slug>/<lang>/<beat>.mp3, and writes back into the JSON per beat:
  durationMs — mean of the two clips + 500 ms (sound-off pacing and the timecode)
  cues       — each subtitle sentence's start as a fraction of the clip, per language
  clip       — the clip's length in ms, per language (the scene clock)
Clips whose text is unchanged are skipped (manifest.json per film); stale clips are removed.

Voices: English = en-US-AndrewMultilingualNeural. Spanish = es-MX-DaliaNeural, a native
Mexican voice — the multilingual English voices read Spanish with an audible American accent
(owner's verdict, 2026-10-04), so Spanish must be a native es-MX voice. A voice or rate change
re-voices every clip of that language on the next run (it is part of each clip's hash).
"""
import asyncio
import hashlib
import io
import json
import os
import re
import sys

import edge_tts
from mutagen.mp3 import MP3

VOICES = {"en": "en-US-AndrewMultilingualNeural", "es": "es-MX-DaliaNeural"}
RATE = {"en": "+0%", "es": "+6%"}
# Spoken forms for tokens the voice would otherwise spell or mangle (subtitles keep the original).
SAY = {
    "en": {"IMSS": "I.M.S.S.", "AMLO": "Amlo", "BIRMEX": "Beermex"},
    "es": {"IMSS": "Ims", "AMLO": "Amlo", "OCDE": "O C D E"},
}
MODES = {"field", "dissolve", "portal", "decode", "reassemble", "split", "benchmark", "redact", "valuescan", "spotlight", "gauge",
         "categorygrid", "modelnet", "network", "torch", "mark", "ribbon", "ribbontear", "titlecard", "torrent", "strata", "ghosts",
         "monopoly", "lattice", "mass", "halo", "bars", "scene"}

HERE = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(HERE, "..", "src", "lib", "gallery", "story-films.json")
VO_BASE = os.path.join(HERE, "..", "public", "gallery-vo")
SENT = re.compile(r"(?<=[.!?:])\s+")  # must match splitSentences() in StoryFilm.tsx


def spoken(text: str, lang: str) -> str:
    for k, v in SAY[lang].items():
        text = re.sub(rf"\b{re.escape(k)}\b", v, text)
    return text


async def synth(text: str, lang: str, out: str):
    """Write the clip; return the TTS sentence boundaries as (char_start, ms)."""
    marks, pos = [], 0
    with open(out, "wb") as f:
        async for ch in edge_tts.Communicate(text, VOICES[lang], rate=RATE[lang]).stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "SentenceBoundary":
                at = text.find(ch["text"][:12], pos)
                if at >= 0:
                    marks.append((at, ch["offset"] / 1e4))
                    pos = at + 1
    return marks


def cue_fractions(caption: str, lang: str, marks, clip_ms: float):
    """Start of each subtitle sentence as a fraction of the clip (piecewise-linear over the TTS marks)."""
    said = [spoken(s, lang) for s in SENT.split(caption) if s]
    total = len(spoken(caption, lang))
    pts = sorted(set([(0, marks[0][1] if marks else 0.0)] + marks + [(total, clip_ms)]))
    cues, at = [], 0
    for s in said:
        lo = max((p for p in pts if p[0] <= at), key=lambda p: p[0])
        hi = min((p for p in pts if p[0] > at), key=lambda p: p[0], default=lo)
        ms = lo[1] if hi[0] == lo[0] else lo[1] + (hi[1] - lo[1]) * (at - lo[0]) / (hi[0] - lo[0])
        cues.append(round(ms / clip_ms, 4))
        at += len(s) + 1
    return cues


async def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    films = json.load(io.open(JSON_PATH, encoding="utf-8"))
    for slug, film in films.items():
        if args and slug not in args:
            continue
        ids = [b["id"] for b in film["beats"]]
        assert len(ids) == len(set(ids)), f"{slug}: duplicate beat id"
        man_path = os.path.join(VO_BASE, slug, "manifest.json")
        manifest = json.load(open(man_path)) if os.path.exists(man_path) and not force else {}
        total = {"en": 0.0, "es": 0.0}
        for b in film["beats"]:
            assert b["mode"] in MODES, f"{slug}/{b['id']}: unknown mode {b['mode']}"
            assert all(b["cap"]), f"{slug}/{b['id']}: empty caption"
            secs = {}
            for li, lang in enumerate(("en", "es")):
                d = os.path.join(VO_BASE, slug, lang)
                os.makedirs(d, exist_ok=True)
                out = os.path.join(d, b["id"] + ".mp3")
                text = spoken(b["cap"][li], lang)
                key, h = f"{lang}/{b['id']}", hashlib.sha1((VOICES[lang] + RATE[lang] + text).encode()).hexdigest()
                if manifest.get(key, {}).get("h") != h or not os.path.exists(out):
                    marks = await synth(text, lang, out)
                    clip_ms = MP3(out).info.length * 1000
                    manifest[key] = {"h": h, "ms": round(clip_ms), "cues": cue_fractions(b["cap"][li], lang, marks, clip_ms)}
                secs[lang] = manifest[key]["ms"] / 1000
                total[lang] += secs[lang]
            b["durationMs"] = int(round((secs["en"] + secs["es"]) / 2 * 10 + 5) * 100)
            b["cues"] = {lang: manifest[f"{lang}/{b['id']}"]["cues"] for lang in ("en", "es")}
            b["clip"] = {lang: manifest[f"{lang}/{b['id']}"]["ms"] for lang in ("en", "es")}
        for lang in ("en", "es"):  # drop clips for beats that no longer exist
            for fn in os.listdir(os.path.join(VO_BASE, slug, lang)):
                if fn.endswith(".mp3") and fn[:-4] not in ids:
                    os.remove(os.path.join(VO_BASE, slug, lang, fn))
        manifest = {k: v for k, v in manifest.items() if k.split("/")[1] in ids}
        json.dump(manifest, open(man_path, "w"), indent=1)
        print(f"{slug:36s} {len(ids)} beats  en {total['en']:5.1f}s  es {total['es']:5.1f}s")
    if not args:  # full run: drop the clips of films that are no longer in the JSON (generated dirs only)
        for d in os.listdir(VO_BASE):
            man = os.path.join(VO_BASE, d, "manifest.json")
            if d in films or not os.path.exists(man):
                continue
            for lang in ("en", "es"):
                ld = os.path.join(VO_BASE, d, lang)
                if os.path.isdir(ld):
                    for fn in os.listdir(ld):
                        os.remove(os.path.join(ld, fn))
                    os.rmdir(ld)
            os.remove(man)
            os.rmdir(os.path.join(VO_BASE, d))
            print("pruned", d)
    io.open(JSON_PATH, "w", encoding="utf-8", newline="\n").write(json.dumps(films, ensure_ascii=False, indent=1) + "\n")


if __name__ == "__main__":
    asyncio.run(main())
