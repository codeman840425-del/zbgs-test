"""Draw all wayfinding prints from UTF-8 JSON on stdin. Return PNGs and measurements on stdout."""
import base64
import hashlib
import io
import json
import sys
from pathlib import Path

import fontTools
from fontTools.ttLib import TTFont
from PIL import Image, ImageColor, ImageDraw, ImageFont, __version__ as pillow_version


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate(condition, message):
    if not condition:
        raise ValueError(message)


def luminance(color):
    s = [c / 255 for c in (ImageColor.getrgb(color) if isinstance(color, str) else color)]
    r, g, b = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in s]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def strokes(draw, ops, palette, bounds, translate=(0, 0), scale=1):
    validate(isinstance(ops, list) and 0 < len(ops) <= 64, "Expected one to 64 vector shapes")
    for op in ops:
        kind, flat, color = op["kind"], op["points"], palette[op["ink"]]
        validate(set(op) == ({"kind", "ink", "points", "width"} if kind in ("line", "frame")
                              else {"kind", "ink", "points"}), "Unexpected vector fields")
        validate(isinstance(flat, list) and 4 <= len(flat) <= 96 and len(flat) % 2 == 0,
                 "Invalid vector vertices")
        validate(all(type(n) is int and 0 <= n <= bounds[i % 2] for i, n in enumerate(flat)),
                 "Vector falls outside its editable panel")
        coords = [(round(translate[0] + flat[i] * scale), round(translate[1] + flat[i + 1] * scale))
                  for i in range(0, len(flat), 2)]
        if kind in ("frame", "line"):
            validate(type(op["width"]) is int and 1 <= op["width"] <= 48, "Invalid stroke width")
            width = max(1, round(op["width"] * scale))
        if kind in ("rect", "frame", "ellipse"):
            validate(len(coords) == 2 and all(b > a for a, b in zip(*coords)), "Invalid rectangle")
            if kind == "frame":
                draw.rectangle(coords, outline=color, width=width)
            elif kind == "ellipse":
                draw.ellipse(coords, fill=color)
            else:
                draw.rectangle(coords, fill=color)
        elif kind == "line":
            draw.line(coords, fill=color, width=width, joint="curve")
        elif kind == "polygon":
            validate(len(coords) >= 3, "Polygon needs at least three vertices")
            draw.polygon(coords, fill=color)
        else:
            raise ValueError("Unknown vector primitive " + str(kind))


def draw_design(d, art, font_path, cmap):
    palette, layout = d["palette"], art["layouts"][d["layout"]]
    image = Image.new("RGB", (1100, 700), palette["paper"])
    draw = ImageDraw.Draw(image)
    strokes(draw, layout["background"], palette, image.size)
    x, y, width = layout["icon"]
    paths = d["iconPaths"] if "iconPaths" in d else art["icons"][d["icon"]]
    strokes(draw, paths, palette, (art["iconUnits"],) * 2, (x, y), width / art["iconUnits"])
    glyph_rows = {}
    for field, weight in (("title", 720), ("subtitle", 530)):
        text = d[field]
        x, center, size, available = layout[field]
        ink = palette[layout.get(field + "Ink", "ink")]
        background = image.getpixel((x + 1, center))
        values = sorted([luminance(ink), luminance(background)])
        contrast = (values[1] + 0.05) / (values[0] + 0.05)
        validate(contrast >= 7, "Insufficient text contrast on " + field)
        font = ImageFont.truetype(str(font_path), size)
        font.set_variation_by_axes([weight])
        missing = sorted(set(ch for ch in text if ord(ch) not in cmap))
        validate(not missing, "Missing Noto glyphs: " + repr(missing))
        left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
        validate(right - left <= available, "Text exceeds the available width for " + field)
        origin = (x - left, round(center - (top + bottom) / 2))
        mask = Image.new("L", image.size)
        ImageDraw.Draw(mask).text(origin, text, font=font, fill=255)
        box = mask.getbbox()
        validate(box and box[0] >= 18 and box[1] >= 18 and box[2] <= 1082 and box[3] <= 682,
                 "Text clipped by the face edge")
        miniature = mask.resize((220, 140), Image.Resampling.LANCZOS).point(lambda n: 255 if n >= 96 else 0)
        small_box = miniature.getbbox()
        validate(small_box and small_box[3] - small_box[1] >= (15 if field == "title" else 8),
                 "Text does not retain sufficient real ink at 220 pixels")
        image.paste(ink, (0, 0, *image.size), mask)
        glyph_rows[field] = {
            "text": text, "fontPixels": size, "weight": weight, "inkBox": list(box),
            "thumbInkBox220": list(small_box), "contrast": round(contrast, 3),
            "maskSha256": digest(mask.crop(box).tobytes()),
            "glyphs": [{"character": ch, "codepoint": f"U+{ord(ch):04X}", "glyph": cmap[ord(ch)],
                        "rasterSha256": digest(bytes(font.getmask(ch, "L")))} for ch in text if not ch.isspace()],
        }
    buf = io.BytesIO()
    image.save(buf, format="PNG", compress_level=9)
    icon_crop = image.crop((layout["icon"][0], layout["icon"][1],
                            layout["icon"][0] + width, layout["icon"][1] + width))
    return {"id": d["id"], "version": d["version"], "png": base64.b64encode(buf.getvalue()).decode("ascii"),
            "inspection": {"size": list(image.size), "glyphs": glyph_rows, "pixelSha256": digest(image.tobytes()),
                           "iconCropSha256": digest(icon_crop.tobytes()), "toolchain": {
                               "Pillow": pillow_version, "fontTools": fontTools.__version__}}}


if __name__ == "__main__":
    validate((pillow_version, fontTools.__version__) == ("12.1.0", "4.64.0"), "Install the pinned font requirements")
    data = json.loads(sys.stdin.buffer.read())
    root = Path(__file__).resolve().parents[2]
    filename = root / "assets-source/company-information-v1/NotoSansSC-VF.ttf"
    with TTFont(str(filename), lazy=True) as ttf:
        cmap = ttf.getBestCmap()
        print(json.dumps([draw_design(d, data["artwork"], filename, cmap) for d in data["designs"]],
                         ensure_ascii=True, separators=(",", ":")))
