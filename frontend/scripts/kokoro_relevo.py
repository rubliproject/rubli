"""Kokoro-82M (Apache-2.0, local, CPU) — the English voice of «El Relevo».

Owner, Oct 14: the edge-tts name splice made the narration "disjointed" — one voice for the whole
English film. Run from frontend/ with the local install (nothing on C:):
    PYTHONPATH="D:/Python/_pytools/kokoro;D:/Python/_pytools/edge-tts-731" HF_HOME=D:/Python/_pytools/hf \
      python scripts/kokoro_relevo.py --film [am_michael]        # EN clips + vo.json["en"]
      python scripts/kokoro_relevo.py --test <outDir> [voices…]   # pron-test clips
Spanish is untouched (scripts/gen_relevo_vo.py, es-MX-DaliaNeural).

The Spanish names are written as inline phonemes in misaki's notation ([word](/phonemes/)).
IMSS is said as a phrase (first time "Mexico's Social Security Institute", then "the
Institute"); captions keep the script's words, because every spoken token is mapped back to
the script characters it came from (sub_map), and Kokoro's own token timestamps time them.
"""
import io
import json
import os
import re
import sys

import numpy as np
from kokoro import KPipeline
from mutagen.mp3 import MP3

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_relevo_vo import NAME_LINES, OUT, SRC, captions, encode, map_words, sub_map  # noqa: E402

SR = 24000
VOICE = "am_michael"
PHONEMES = {
    "Grupo": "ɡɹˈupO",
    "Fármacos's": "fˈɑɹməkOsᵻz",
    "Fármacos": "fˈɑɹməkOs",
    "Especializados": "ɛspəsjɑlizˈɑdOs",
    "Farmacéuticos": "fɑɹmɑsˈɛutikOs",
    "Laboratorios": "lɑbɔɹɑtˈɔɹiOs",
    "Maypo": "mˈIpO",
    "PISA": "pˈisɑ",
    "Dimesa": "dimˈɛsɑ",
}
# IMSS, said as words (written form kept in captions)
SAY_EN = {
    "four large IMSS suppliers": "four large suppliers to Mexico's Social Security Institute",
    "an IMSS tender": "a tender held by the Institute",
    "what IMSS buys": "what the Institute buys",
    "what IMSS contracted": "what the Institute contracted",
}


def mark(text: str) -> str:
    pat = re.compile(r"(?<!\w)(" + "|".join(map(re.escape, sorted(PHONEMES, key=len, reverse=True))) + r")(?!\w)")
    return pat.sub(lambda m: f"[{m.group(1)}](/{PHONEMES[m.group(1)]}/)", text)


def speak(pipe: KPipeline, said: str, voice: str):
    """Audio + [(token text, startMs, endMs)] in the clip's time (chunks offset by their audio length)."""
    pcm, words, t0 = [np.zeros(int(0.12 * SR), np.float32)], [], 120.0
    for r in pipe(mark(said), voice=voice, speed=1.0):
        a = r.audio.numpy().astype(np.float32)
        for tok in r.tokens or []:
            if tok.start_ts is None or not re.search(r"\w", tok.text):
                continue
            words.append((tok.text, t0 + tok.start_ts * 1000, t0 + (tok.end_ts or tok.start_ts) * 1000))
        pcm.append(a)
        t0 += len(a) / SR * 1000
    pcm.append(np.zeros(int(0.15 * SR), np.float32))
    return np.concatenate(pcm), words


def film(voice: str):
    pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    script = json.load(io.open(os.path.join(SRC, "script.json"), encoding="utf-8"))
    vo_path = os.path.join(SRC, "vo.json")
    vo = json.load(io.open(vo_path, encoding="utf-8"))
    vo["en"] = {}
    for b in script["beats"]:
        written = b["en"]
        said, idx = sub_map(written, SAY_EN)
        pcm, words = speak(pipe, said, voice)
        path = os.path.join(OUT, "en", b["id"] + ".mp3")
        encode(pcm, path)
        spans = map_words(written, said, idx, words)
        ms = round(MP3(path).info.length * 1000)
        vo["en"][b["id"]] = {"ms": ms, "words": [[written[ws:we], round(s), round(e)] for ws, we, s, e in spans], "captions": captions(written, spans)}
        print(f"en/{b['id']}: {ms} ms, {len(spans)} words")
    vo["engine"] = {"en": f"kokoro-82M:{voice}", "es": vo.get("engine", {}).get("es", "edge:es-MX-DaliaNeural")}
    with io.open(vo_path, "w", encoding="utf-8") as f:
        json.dump(vo, f, ensure_ascii=False, indent=1)


def test(out_dir: str, voices):
    pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    os.makedirs(out_dir, exist_ok=True)
    for v in voices:
        pcm = np.concatenate([speak(pipe, line, v)[0] for line in NAME_LINES])
        path = os.path.join(out_dir, f"a-kokoro-{v}.mp3")
        encode(pcm, path)
        print(path, round(len(pcm) / SR, 1), "s")


if __name__ == "__main__":
    if "--film" in sys.argv:
        rest = sys.argv[sys.argv.index("--film") + 1:]
        film(rest[0] if rest else VOICE)
    else:
        test(sys.argv[sys.argv.index("--test") + 1], sys.argv[sys.argv.index("--test") + 2:] or ["am_michael", "am_adam"])
