"""`is_single_bid` counts WINNERS (one awarded vendor), not bidders: CompraNet and ComprasMX publish awarded
contracts only (D20; docs/DIAG_COMPRASMX_SINGLE_BID_2026-11-09.md). No API or UI string may call it a
bidder count. Lines that negate the claim or quote the EU indicator / LAASSP art. 41 legal text are allowed."""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FORBIDDEN = re.compile(
    r"un solo postor|único postor|postor único|un solo oferente|oferente único|un solo participante|"
    r"single bidder|sole bidder|single bidding|only one bidder|(?<!than )\bone bidder\b",
    re.IGNORECASE,
)
ALLOWED = ("no un solo postor", "not one bidder", "not bidders", "no postores", "no oferentes", "Scoreboard",
           "de la UE", "in the market", "derechos exclusivos", "exclusive rights", "patentes")


def offending_lines():
    out = []
    for base, globs in ((ROOT / "backend" / "api", ("*.py",)),
                        (ROOT / "frontend" / "src", ("*.ts", "*.tsx", "*.json"))):
        for g in globs:
            for p in base.rglob(g):
                for i, line in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                    if FORBIDDEN.search(line) and not any(a in line for a in ALLOWED):
                        out.append(f"{p.relative_to(ROOT)}:{i}: {line.strip()[:120]}")
    return out


@pytest.mark.no_db
def test_no_bidder_wording_for_single_award():
    assert offending_lines() == []
