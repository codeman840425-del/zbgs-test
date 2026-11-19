"""Redraw the 1100 x 700 sign PNG on stdout. Coordinates measure pixels."""
import hashlib
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, __version__

source = Path(__file__).resolve().parent
recipe = json.loads((source / "parameters.json").read_text(encoding="utf8"))
font_file = source.parents[1] / recipe["font"]
if __version__ != "12.1.0" or hashlib.sha256(font_file.read_bytes()).hexdigest() != recipe["fontSha256"]:
    raise ValueError("Use the pinned Pillow and Noto Sans SC font for this artwork")
image = Image.new("RGB", (1100, 700), recipe["paper"])
draw = ImageDraw.Draw(image)
ink, accent = recipe["ink"], recipe["accent"]
draw.rounded_rectangle((26, 26, 1074, 674), 36, outline=ink, width=12)
# Show the tap, falling drops and basin as one recognisable sign.
draw.rounded_rectangle((119, 216, 151, 348), 12, fill=ink)
draw.rounded_rectangle((128, 228, 314, 267), 12, fill=ink)
draw.rounded_rectangle((280, 242, 314, 308), 9, fill=ink)
draw.line((202, 228, 202, 196), fill=ink, width=22)
draw.rounded_rectangle((157, 178, 248, 198), 8, fill=ink)
for y in (322, 370):
    draw.ellipse((285, y, 308, y + 29), fill=accent)
draw.rounded_rectangle((93, 416, 356, 440), 10, fill=ink)
draw.pieslice((99, 342, 349, 517), 0, 180, fill=ink)
draw.rectangle((211, 497, 237, 533), fill=ink)
draw.line((398, 164, 398, 540), fill=accent, width=6)
for field, size, weight, y in [("title", 110, 650, 207), ("subtitle", 48, 550, 390)]:
    font = ImageFont.truetype(str(font_file), size)
    font.set_variation_by_axes([weight])
    if draw.textlength(recipe[field], font=font) > 605:
        raise ValueError("Sign text is wider than the available face")
    draw.text((452, y), recipe[field], font=font, fill=ink)
buffer = io.BytesIO()
image.save(buffer, format="PNG", compress_level=9)
sys.stdout.buffer.write(buffer.getvalue())
