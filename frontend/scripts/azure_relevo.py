"""Azure Speech (F0) — the English voice of «El Relevo»: one voice, native Spanish names.

Owner, Oct 14: the splice was disjointed and Kokoro "not working still". Andrew (standard
en-US-AndrewMultilingualNeural) reads the whole English script; every Spanish proper name is
wrapped in <lang xml:lang="es-MX">, so the same voice says it the Mexican way.

Run from frontend/ (SDK installed under D:/Python/_pytools/azure-speech, nothing on C:):
    PYTHONPATH="D:/Python/_pytools/azure-speech;D:/Python/_pytools/edge-tts-731" python scripts/azure_relevo.py --check
    ... python scripts/azure_relevo.py --test <outDir>     # A/B: with and without <lang>
    ... python scripts/azure_relevo.py --film [beat ...]   # EN clips + vo.json["en"] (all, or just these beats)
The key is read from RELEVO_VOICE_ENV (default D:/Python/yangwenli/.env.voice, git-ignored):
AZURE_SPEECH_KEY, AZURE_SPEECH_REGION. It is never printed. F0 quota: 500K chars/month.
"""
import io
import json
import os
import re
import sys
import urllib.request
from xml.sax.saxutils import escape

import azure.cognitiveservices.speech as speechsdk
import numpy as np
from dotenv import load_dotenv
from mutagen.mp3 import MP3

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_relevo_vo import OUT, SRC, captions, encode, map_words  # noqa: E402

load_dotenv(os.environ.get("RELEVO_VOICE_ENV", "D:/Python/yangwenli/.env.voice"))
KEY = os.environ["AZURE_SPEECH_KEY"]
REGION = os.environ.get("AZURE_SPEECH_REGION", "eastus")
VOICE = "en-US-AndrewMultilingualNeural"
SR = 24000
NAMES = ["Grupo Fármacos Especializados", "Farmacéuticos Maypo", "Laboratorios PISA", "Grupo Fármacos", "PISA", "Maypo", "Dimesa"]
IMSS_MODE = os.environ.get("RELEVO_IMSS", "lang")  # lang | eems | plain


def ssml(text: str, lang_names: bool = True, imss: str = IMSS_MODE) -> str:
    out, i = [], 0
    alts = NAMES if lang_names else []
    if imss != "plain":
        alts = alts + ["IMSS"]
    pat = re.compile(r"(?<!\w)(" + "|".join(map(re.escape, alts)) + r")(?!\w)") if alts else None
    for m in pat.finditer(text) if pat else []:
        out.append(escape(text[i:m.start()]))
        w = m.group(1)
        if w == "IMSS" and imss == "eems":
            out.append('<sub alias="eems">IMSS</sub>')
        else:
            out.append(f'<lang xml:lang="es-MX">{escape(w)}</lang>')
        i = m.end()
    out.append(escape(text[i:]))
    body = "".join(out)
    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">'
        f'<voice name="{VOICE}">{body}</voice></speak>'
    )


def synth(text: str, **kw):
    """PCM float32 + [(word, startMs, endMs)] from the SDK's word-boundary events."""
    cfg = speechsdk.SpeechConfig(subscription=KEY, region=REGION)
    cfg.set_speech_synthesis_output_format(speechsdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm)
    syn = speechsdk.SpeechSynthesizer(speech_config=cfg, audio_config=None)
    words = []

    def on_word(evt):
        if evt.boundary_type == speechsdk.SpeechSynthesisBoundaryType.Word:
            s = evt.audio_offset / 1e4
            words.append((evt.text, s, s + evt.duration.total_seconds() * 1000))

    syn.synthesis_word_boundary.connect(on_word)
    res = syn.speak_ssml_async(ssml(text, **kw)).get()
    if res.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
        raise RuntimeError(f"synthesis failed: {res.reason} {getattr(res, 'cancellation_details', '')}")
    pcm = np.frombuffer(res.audio_data, dtype=np.int16).astype(np.float32) / 32768
    lead = np.zeros(int(0.08 * SR), np.float32)
    return np.concatenate([lead, pcm]), [(w, s + 80, e + 80) for w, s, e in words]


def check():
    req = urllib.request.Request(f"https://{REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list", headers={"Ocp-Apim-Subscription-Key": KEY})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print("voices list HTTP", r.status)
    except urllib.error.HTTPError as e:
        print("voices list HTTP", e.code)


AB_LINE = "It was one of four large IMSS suppliers, with Grupo Fármacos Especializados, Farmacéuticos Maypo, Laboratorios PISA and the distributor Dimesa."


def test(out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    for name, kw in [
        ("1-andrew-plain", {"lang_names": False, "imss": "plain"}),
        ("2-andrew-lang-names-imss-lang", {"lang_names": True, "imss": "lang"}),
        ("3-andrew-lang-names-imss-eems", {"lang_names": True, "imss": "eems"}),
    ]:
        pcm, words = synth(AB_LINE, **kw)
        path = os.path.join(out_dir, name + ".mp3")
        encode(pcm, path)
        dur = {w: round(e - s) for w, s, e in words if w.upper().startswith("IMSS") or w in ("Maypo", "Dimesa", "PISA") or "rmaco" in w}
        print(name, round(len(pcm) / SR, 1), "s · word ms", dur)


def film(only=None):
    script = json.load(io.open(os.path.join(SRC, "script.json"), encoding="utf-8"))
    vo_path = os.path.join(SRC, "vo.json")
    vo = json.load(io.open(vo_path, encoding="utf-8"))
    vo["en"] = vo["en"] if only else {}
    chars = 0
    for b in script["beats"]:
        if only and b["id"] not in only:
            continue  # re-voice only the beats asked for (F0 quota)
        written = b["en"]
        chars += len(ssml(written))
        pcm, words = synth(written)
        path = os.path.join(OUT, "en", b["id"] + ".mp3")
        encode(pcm, path)
        spans = map_words(written, written, list(range(len(written))), words)
        ms = round(MP3(path).info.length * 1000)
        vo["en"][b["id"]] = {"ms": ms, "words": [[written[ws:we], round(s), round(e)] for ws, we, s, e in spans], "captions": captions(written, spans)}
        print(f"en/{b['id']}: {ms} ms, {len(spans)} words")
    vo["engine"] = {"en": f"azure:{VOICE} + <lang es-MX> names, IMSS={IMSS_MODE}", "es": vo.get("engine", {}).get("es", "edge:es-MX-DaliaNeural")}
    with io.open(vo_path, "w", encoding="utf-8") as f:
        json.dump(vo, f, ensure_ascii=False, indent=1)
    print("SSML chars sent:", chars)


if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    elif "--test" in sys.argv:
        test(sys.argv[sys.argv.index("--test") + 1])
    elif "--film" in sys.argv:
        film(sys.argv[sys.argv.index("--film") + 1:] or None)
