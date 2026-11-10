"""Voice «El Relevo» for the Remotion film — one clip per beat, WORD-level timestamps.

Run from frontend/ (edge-tts >= 7.3.1; 7.2.x gets a 403 from the service since Oct 2026):
    PYTHONPATH=D:/Python/_pytools/edge-tts-731 python scripts/gen_relevo_vo.py [--en splice|respell]
    PYTHONPATH=... python scripts/gen_relevo_vo.py --pron-test <outDir>     # EN A/B candidates

Reads  src/remotion/relevo/script.json (the approved script, verbatim).
Writes public/gallery-vo/el-monopolio-invisible-v3/<lang>/<beat>.mp3 (loudness-normalised, −16 LUFS)
       src/remotion/relevo/vo.json — per lang, per beat: clip ms, words [WRITTEN text, startMs, endMs]
       and Remotion `Caption[]` in the written form, so subtitles always show the real spelling.

English engines (owner, Oct 14: "the names are clunky in English"):
  splice  (default) Andrew reads the English; every Spanish proper name — and IMSS, said "Ims" —
          is spoken by a native es-MX voice and spliced into its word slot, level-matched with
          short fades, the way bilingual documentaries are cut.
  respell Andrew reads everything, the names from phonetic respellings.
Spanish is always es-MX-DaliaNeural, unchanged.
"""
import asyncio
import io
import json
import os
import re
import subprocess
import sys
import tempfile

import edge_tts
import numpy as np
from mutagen.mp3 import MP3

FFMPEG = os.environ.get("FFMPEG", "D:/Python/_pytools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe")
SR = 24000
VOICES = {"en": "en-US-AndrewMultilingualNeural", "es": "es-MX-DaliaNeural"}
RATE = {"en": "+0%", "es": "+6%"}
NAME_VOICE = "es-MX-JorgeNeural"  # male, matches Andrew
RESPELL = {
    "IMSS": "I.M.S.S.",
    "Grupo": "Groo-poh",
    "Fármacos": "FAR-mah-kohs",
    "Especializados": "es-peh-see-ah-lee-SAH-dohs",
    "Farmacéuticos": "far-mah-SEH-oo-tee-kohs",
    "Laboratorios": "lah-boh-rah-TOH-ree-ohs",
    "Maypo": "MY-poh",
    "PISA": "PEE-sah",
    "Dimesa": "dee-MEH-sah",
}
SAY_ES = {"IMSS": "Ims"}
# Spanish proper names the splice engine hands to the es-MX voice (longest first).
ES_NAMES = ["Grupo Fármacos Especializados", "Farmacéuticos Maypo", "Laboratorios PISA", "Grupo Fármacos", "PISA", "Maypo", "Dimesa", "IMSS"]
PAUSE = {",": 0.20, ";": 0.32, ":": 0.32, ".": 0.38}

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src", "remotion", "relevo")
OUT = os.path.join(HERE, "..", "public", "gallery-vo", "el-monopolio-invisible-v3")


def sub_map(text: str, say: dict):
    """Spoken text plus, for every spoken char, the index of the written char it came from."""
    if not say:
        return text, list(range(len(text)))
    out, idx, i = [], [], 0
    pat = re.compile(r"(?<!\w)(" + "|".join(map(re.escape, sorted(say, key=len, reverse=True))) + r")(?!\w)")
    for m in pat.finditer(text):
        out.append(text[i:m.start()]); idx.extend(range(i, m.start()))
        rep = say[m.group(1)]
        out.append(rep); idx.extend([m.start()] * (len(rep) - 1) + [m.end() - 1])
        i = m.end()
    out.append(text[i:]); idx.extend(range(i, len(text)))
    return "".join(out), idx


async def synth(text: str, voice: str, rate: str, path: str, tries: int = 6):
    for t in range(tries):
        try:
            words = []
            with open(path, "wb") as f:
                async for ch in edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary").stream():
                    if ch["type"] == "audio":
                        f.write(ch["data"])
                    elif ch["type"] == "WordBoundary":
                        words.append((ch["text"], ch["offset"] / 1e4, (ch["offset"] + ch["duration"]) / 1e4))
            return words
        except Exception:  # the service refuses a share of handshakes
            if t == tries - 1:
                raise
            await asyncio.sleep(2 + 3 * t)


def decode(path: str) -> np.ndarray:
    raw = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def encode(pcm: np.ndarray, path: str):
    """float32 mono → mp3: 80 Hz high-pass (no low rumble), loudness-normalised to −16 LUFS (true peak −1.5 dB)."""
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
         "-af", "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(SR), "-b:a", "96k", path],
        input=pcm.astype(np.float32).tobytes(), check=True,
    )


def map_words(written: str, said: str, idx, words, base: int = 0, t0: float = 0.0):
    """TTS words → written spans [(wstart, wend, startMs, endMs)], merging tokens of one written word."""
    spans, pos = [], 0
    for w, s, e in words:
        at = said.find(w, pos)
        if at < 0:
            continue
        ws, we = base + idx[at], base + idx[at + len(w) - 1] + 1
        pos = at + len(w)
        if spans and ws < spans[-1][1]:
            spans[-1] = (spans[-1][0], max(we, spans[-1][1]), spans[-1][2], e + t0)
        else:
            spans.append((ws, we, s + t0, e + t0))
    return spans


def captions(written: str, spans):
    caps = []
    for i, (ws, _, s, e) in enumerate(spans):
        nxt = spans[i + 1][0] if i + 1 < len(spans) else len(written)
        text = written[ws:nxt].rstrip()
        caps.append({
            "text": (" " if i else "") + text,
            "startMs": round(s), "endMs": round(spans[i + 1][2] if i + 1 < len(spans) else e),
            "timestampMs": round((s + e) / 2), "confidence": None,
            "pageBreakAfter": bool(re.search(r"[.:;]$", text)),
        })
    return caps


async def voice_plain(written: str, voice: str, rate: str, say: dict, out: str):
    """One TTS call for the whole line; loudness-normalised."""
    said, idx = sub_map(written, say)
    with tempfile.TemporaryDirectory(dir=os.environ.get("TMP")) as tmp:
        raw = os.path.join(tmp, "raw.mp3")
        words = await synth(said, voice, rate, raw)
        encode(decode(raw), out)
    return map_words(written, said, idx, words)


async def voice_splice(written: str, out: str, name_voice: str = NAME_VOICE):
    """English from Andrew, Spanish names from an es-MX voice, spliced at the word slots."""
    pat = re.compile(r"(?<!\w)(" + "|".join(map(re.escape, ES_NAMES)) + r")(?!\w)")
    parts, i = [], 0
    for m in pat.finditer(written):
        parts.append(("en", i, m.start()))
        parts.append(("es", m.start(), m.end()))
        i = m.end()
    parts.append(("en", i, len(written)))
    clips, spans, tail_pause = [], [], 0.0
    with tempfile.TemporaryDirectory(dir=os.environ.get("TMP")) as tmp:
        for k, (kind, a, b) in enumerate(parts):
            chunk = written[a:b]
            body = chunk.strip()
            lead_ws = len(chunk) - len(chunk.lstrip())
            if not re.search(r"\w", body):  # punctuation only → a pause
                tail_pause = max(tail_pause, max([PAUSE.get(c, 0) for c in body] + [0.0]))
                continue
            said, idx = sub_map(body, SAY_ES if kind == "es" else {})
            path = os.path.join(tmp, f"{k}.mp3")
            words = await synth(said, name_voice if kind == "es" else VOICES["en"], "+0%" if kind == "es" else RATE["en"], path)
            pcm = decode(path)
            if words:  # trim the TTS's own lead/tail silence to the spoken words
                s0 = max(0, int((words[0][1] - 30) / 1000 * SR))
                s1 = min(len(pcm), int((words[-1][2] + (90 if kind == "es" else 70)) / 1000 * SR))
                pcm, shift = pcm[s0:s1], s0 / SR * 1000
            else:
                shift = 0.0
            trailing = re.search(r"[,;:.]\s*$", chunk)
            clips.append({"kind": kind, "pcm": pcm, "words": words, "shift": shift, "said": said, "idx": idx, "base": a + lead_ws,
                          "gap": tail_pause, "after": PAUSE.get(trailing.group(0).strip(), 0) if trailing else 0.0})
            tail_pause = 0.0
    # level-match the names to the English (RMS over voiced samples)
    rms = lambda x: float(np.sqrt(np.mean(x[np.abs(x) > 0.01] ** 2))) if np.any(np.abs(x) > 0.01) else 1.0
    en_level = np.median([rms(c["pcm"]) for c in clips if c["kind"] == "en"] or [0.1])
    out_pcm, t = [np.zeros(int(0.05 * SR), np.float32)], 50.0
    fade = int(0.006 * SR)
    for j, c in enumerate(clips):
        pcm = c["pcm"] * (en_level / rms(c["pcm"]) if c["kind"] == "es" else 1.0)
        if len(pcm) > 2 * fade:
            pcm[:fade] *= np.linspace(0, 1, fade)
            pcm[-fade:] *= np.linspace(1, 0, fade)
        gap = (c["gap"] if j else 0) + (0.06 if j else 0)
        out_pcm.append(np.zeros(int(gap * SR), np.float32)); t += gap * 1000
        spans += map_words(written, c["said"], c["idx"], c["words"], base=c["base"], t0=t - c["shift"])
        out_pcm.append(pcm.astype(np.float32)); t += len(pcm) / SR * 1000
        if c["after"]:
            out_pcm.append(np.zeros(int(c["after"] * SR), np.float32)); t += c["after"] * 1000
    out_pcm.append(np.zeros(int(0.1 * SR), np.float32))
    encode(np.concatenate(out_pcm), out)
    return spans


NAME_LINES = [  # every EN sentence of the script that carries a name (pron-test-2)
    "In 2017, a single company was awarded 19.9 billion pesos in federal contracts for medicine: Grupo Fármacos Especializados.",
    "It was one of four large IMSS suppliers, with Farmacéuticos Maypo, Laboratorios PISA and the distributor Dimesa.",
    "From 2011, Grupo Fármacos led every year.",
    "In 2019, the new government ordered it, Maypo and Dimesa kept out of government contracts.",
    "Dimesa fell 97 percent, and Maypo by half.",
    "PISA was not named in the 2019 order.",
]


async def pron_test(out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    line = " ".join(NAME_LINES)
    for name, coro in [
        ("b1-splice-andrew+jorge", lambda p: voice_splice(line, p, "es-MX-JorgeNeural")),
        ("b2-splice-andrew+dalia", lambda p: voice_splice(line, p, "es-MX-DaliaNeural")),
        ("c0-andrew-respelled-imss-letters", lambda p: voice_plain(line, VOICES["en"], RATE["en"], RESPELL, p)),
        ("c1-andrew-respelled-imss-eems", lambda p: voice_plain(line, VOICES["en"], RATE["en"], {**RESPELL, "IMSS": "eems"}, p)),
        ("c2-andrew-respelled-imss-described", lambda p: voice_plain(line.replace("four large IMSS suppliers", "four large suppliers of Mexico's Social Security Institute"), VOICES["en"], RATE["en"], RESPELL, p)),
    ]:
        path = os.path.join(out_dir, name + ".mp3")
        await coro(path)
        print(path, round(MP3(path).info.length, 1), "s")


async def main():
    if "--pron-test" in sys.argv:
        return await pron_test(sys.argv[sys.argv.index("--pron-test") + 1])
    engine = sys.argv[sys.argv.index("--en") + 1] if "--en" in sys.argv else "splice"
    script = json.load(io.open(os.path.join(SRC, "script.json"), encoding="utf-8"))
    vo = {}
    for lang in ("en", "es"):
        os.makedirs(os.path.join(OUT, lang), exist_ok=True)
        vo[lang] = {}
        for b in script["beats"]:
            written = b[lang]
            path = os.path.join(OUT, lang, b["id"] + ".mp3")
            if lang == "en" and engine == "splice":
                spans = await voice_splice(written, path)
            else:
                spans = await voice_plain(written, VOICES[lang], RATE[lang], RESPELL if lang == "en" else SAY_ES, path)
            ms = round(MP3(path).info.length * 1000)
            vo[lang][b["id"]] = {"ms": ms, "words": [[written[ws:we], round(s), round(e)] for ws, we, s, e in spans], "captions": captions(written, spans)}
            print(f"{lang}/{b['id']}: {ms} ms, {len(spans)} words")
    vo["engine"] = {"en": engine, "es": "edge:" + VOICES["es"]}
    with io.open(os.path.join(SRC, "vo.json"), "w", encoding="utf-8") as f:
        json.dump(vo, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    asyncio.run(main())
