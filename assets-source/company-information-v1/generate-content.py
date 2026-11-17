"""Deterministic information-face PNG generator.

Usage: python generate-content.py --input parameters.json --output-dir TEMP_DIR
"""
import argparse, hashlib, io, json, re, sys
from importlib.metadata import version
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

W, H = 1100, 700

def draw_recipe(recipe, font_path, font_config):
    image = Image.new("RGB", (W, H), recipe["background"])
    draw = ImageDraw.Draw(image)
    cmap = set()
    for table in TTFont(str(font_path), lazy=True)["cmap"].tables:
        cmap.update(table.cmap.keys())
    for text in [recipe["title"], *recipe["lines"]]:
        missing = sorted({char for char in text if ord(char) not in cmap})
        if missing:
            raise ValueError(f"font missing glyphs for {recipe['id']}: {missing}")
    def fixed_font(size, weight):
        font = ImageFont.truetype(str(font_path), size)
        font.set_variation_by_axes([weight])
        return font
    title_font = fixed_font(76, font_config["titleWeight"])
    body_font = fixed_font(34, font_config["bodyWeight"])
    small_font = fixed_font(24, font_config["bodyWeight"])
    margin_x, margin_y = 74, 60
    title_box = draw.textbbox((0, 0), recipe["title"], font=title_font)
    text_column_width = 560
    if title_box[2] > text_column_width:
        raise ValueError(f"title overflows {recipe['id']}")
    draw.text((margin_x, margin_y), recipe["title"], fill=recipe["accent"], font=title_font)
    y = 190
    for line in recipe["lines"]:
        box = draw.textbbox((0, 0), line, font=body_font)
        if box[2] > text_column_width:
            raise ValueError(f"line overflows {recipe['id']}")
        draw.text((margin_x, y), line, fill="#243b3b", font=body_font)
        y += 64
    if recipe["graphic"] == "bars":
        base_y = 600
        for index, value in enumerate((280, 390, 500, 330)):
            x = 700 + index * 74
            draw.rounded_rectangle((x, base_y - value / 2, x + 44, base_y), radius=8, fill=recipe["accent"])
        draw.line((690, base_y, 1030, base_y), fill="#243b3b", width=4)
    else:
        cx, cy = 850, 360
        draw.ellipse((cx - 105, cy - 105, cx + 105, cy + 105), outline=recipe["accent"], width=14)
        draw.arc((cx - 75, cy - 75, cx + 75, cy + 75), 210, 35, fill=recipe["accent"], width=12)
        draw.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), fill=recipe["accent"])
        draw.line((cx, cy, cx + 72, cy - 45), fill=recipe["accent"], width=10)
    draw.text((margin_x, 625), "公司运营安排", fill="#5b6e6c", font=small_font)
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=False, compress_level=9)
    return output.getvalue()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    source = json.loads(Path(args.input).read_text(encoding="utf-8"))
    output_dir = Path(args.output_dir)
    font_path = Path(args.input).parent / "NotoSansSC-VF.ttf"
    if not font_path.is_file(): raise FileNotFoundError(font_path)
    font_config = source["common"]["font"]
    if font_config["titleWeight"] != 500 or font_config["bodyWeight"] != 400:
        raise ValueError("font axis weights are pinned to title 500/body 400")
    for package, expected in (("Pillow", "12.1.0"), ("fonttools", "4.64.0")):
        if version(package) != expected:
            raise ValueError(f"{package} version must be {expected}")
    if hashlib.sha256(font_path.read_bytes()).hexdigest() != font_config["sha256"]:
        raise ValueError("Pinned font hash differs")
    license_path = Path(args.input).parent / "OFL.txt"
    if hashlib.sha256(license_path.read_bytes()).hexdigest() != font_config["licenseSha256"]:
        raise ValueError("Pinned font license hash differs")
    recipes = source.get("contents")
    if not isinstance(recipes, list) or len(recipes) < 2:
        raise ValueError("at least two content recipes are required")
    seen = set()
    for recipe in recipes:
        recipe_id = recipe.get("id")
        if not isinstance(recipe_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", recipe_id) or recipe_id in seen:
            raise ValueError(f"invalid or duplicate content id: {recipe_id!r}")
        seen.add(recipe_id)
        title, lines, graphic = recipe.get("title"), recipe.get("lines"), recipe.get("graphic")
        if not isinstance(title, str) or not title or "\n" in title or "\r" in title:
            raise ValueError(f"invalid title for {recipe_id}")
        if not isinstance(lines, list) or not 1 <= len(lines) <= 3 or any(not isinstance(line, str) or not line or "\n" in line or "\r" in line for line in lines):
            raise ValueError(f"content lines must be one to three single-line strings for {recipe_id}")
        if graphic not in {"bars", "signal"}:
            raise ValueError(f"unsupported graphic for {recipe_id}: {graphic!r}")
        for field in ("accent", "background"):
            if not isinstance(recipe.get(field), str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", recipe[field]):
                raise ValueError(f"invalid {field} color for {recipe_id}")
    # Render every input before publishing; missing glyphs/overflow leave no partial output.
    rendered = [(recipe, draw_recipe(recipe, font_path, font_config)) for recipe in recipes]
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for recipe, data in rendered:
        output = output_dir / f"{recipe['id']}.png"
        output.write_bytes(data)
        outputs.append({"id": recipe["id"], "path": str(output), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    print(json.dumps({"python": sys.version.split()[0], "pillow": version("Pillow"), "fonttools": version("fonttools"), "outputs": outputs}, ensure_ascii=False))

if __name__ == "__main__": main()
