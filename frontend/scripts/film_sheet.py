"""Tile frames captured by film_shots.mjs into one contact sheet: rows = shots, columns = moments."""
import os
import sys

from PIL import Image

out, beats, fracs = sys.argv[1], sys.argv[2].split(","), sys.argv[3].split(",")
TW, GAP = 520, 6
first = Image.open(os.path.join(out, f"{beats[0]}-{fracs[0]}.jpg"))
th = int(TW * first.height / first.width)
sheet = Image.new("RGB", (len(fracs) * (TW + GAP) + GAP, len(beats) * (th + GAP) + GAP), (70, 70, 70))
for r, b in enumerate(beats):
    for c, f in enumerate(fracs):
        im = Image.open(os.path.join(out, f"{b}-{f}.jpg")).resize((TW, th), Image.LANCZOS)
        sheet.paste(im, (GAP + c * (TW + GAP), GAP + r * (th + GAP)))
path = os.path.join(out, "sheet.jpg" if len(beats) > 1 else f"sheet-{beats[0]}.jpg")
sheet.save(path, quality=84)
print("sheet:", os.path.abspath(path), sheet.size)
