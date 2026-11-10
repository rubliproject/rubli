"""Persona física vs company from the vendor NAME (+ RFC shape) — _explore/ml_persona_fisica_2026-10-29.md.

vendors.is_individual is unreliable (it mostly means "no legal suffix parsed"). This module is a
drop-in decision for public_labels: RFC shape when a well-formed RFC exists (12 = company,
13 = person), else a char-n-gram logistic model that may override the stored flag only at high
confidence (company override: hold-out precision 100 % / 99.7 % val+test, 119/120 hand-checked
no-RFC rows). The RFC itself is only measured, never returned or stored.

Pure Python — weights in persona_fisica_weights.json (sklearn LogisticRegression, C=1, trained on
74,308 RFC-labelled vendors). Feature code below is the exact training extractor.
"""
from __future__ import annotations

import json
import math
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Optional

_WEIGHTS = Path(__file__).with_name("persona_fisica_weights.json")
_RFC_CO = re.compile(r"^[A-Z&Ñ]{3}\d{6}[A-Z0-9]{3}$")
_RFC_PF = re.compile(r"^[A-Z&Ñ]{4}\d{6}[A-Z0-9]{3}$")


def _norm(name: Optional[str]) -> str:
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).upper()
    s = re.sub(r"[^A-Z0-9&]+", " ", re.sub(r"[^\x00-\x7f]", "#", s))  # mojibake -> '#'
    return re.sub(r"\s+", " ", s).strip()


def _features(name: Optional[str]) -> list[str]:
    s = _norm(name)
    toks = s.split()
    out = ["n:%d" % min(len(toks), 8)]
    if toks:
        out += ["f:" + toks[0], "l:" + toks[-1]]
    out += ["w:" + t for t in toks]
    p = " " + s + " "
    for n in (3, 4, 5):
        out += ["c:" + p[i:i + n] for i in range(len(p) - n + 1)]
    if re.search(r"\d", s):
        out.append("digit")
    return out


@lru_cache(maxsize=1)
def _model() -> dict:
    return json.loads(_WEIGHTS.read_text(encoding="utf-8"))


def company_prob(name: Optional[str]) -> float:
    """P(company | name) in [0, 1]."""
    m = _model()
    w = m["weights"]
    z = m["intercept"] + sum(w.get(f, 0.0) for f in set(_features(name)))
    return 1.0 / (1.0 + math.exp(-max(min(z, 50.0), -50.0)))


def rfc_shape(rfc: Optional[str]) -> Optional[str]:
    """'company' | 'person' | None — the shape only."""
    r = re.sub(r"[\s-]", "", (rfc or "").upper())
    return "company" if _RFC_CO.match(r) else "person" if _RFC_PF.match(r) else None


def classify_persona_fisica(name: Optional[str], is_individual=None, rfc: Optional[str] = None) -> bool:
    """True = persona física. RFC shape wins; else the stored flag, overridden by the model only at
    high confidence (p >= t_company flips a persona flag off, p <= t_person flips a company flag on)."""
    shape = rfc_shape(rfc)
    if shape:
        return shape == "person"
    p = company_prob(name)
    m = _model()
    if is_individual is None:
        return p < 0.5
    if is_individual:
        return p < m["t_company"]
    return p <= m["t_person"]
