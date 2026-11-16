"""CPU plan review from generated world coordinates, without a browser or GPU."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

source = Path(sys.argv[1])
plan = json.loads(source.read_text(encoding="utf-8"))
regions = plan["rectangles"]
minimum_x = min(region["min"][0] for region in regions)
minimum_z = min(region["min"][1] for region in regions)
maximum_x = max(region["max"][0] for region in regions)
maximum_z = max(region["max"][1] for region in regions)
scale = 90
margin = 65
image = Image.new("RGB", (round((maximum_x - minimum_x) * scale + margin * 2),
                          round((maximum_z - minimum_z) * scale + margin * 2)), "#f6f5f0")
draw = ImageDraw.Draw(image)
font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18)
small_font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 12)


def pixel(x, z):
    return ((x - minimum_x) * scale + margin, (z - minimum_z) * scale + margin)


def rectangle(low, high):
    return (*pixel(*low), *pixel(*high))


colors = {"streaming": "#e1eacb", "work": "#d8e6ed", "rest": "#e9dfd4", "public": "#f0e8c9"}
for region in regions:
    draw.rectangle(rectangle(region["min"], region["max"]), fill=colors[region["purpose"]], outline="#404d48", width=4)
    x, y = pixel(*region["min"])
    draw.text((x + 9, y + 8), f'{region["name"]}  {region["area"]:g} m²', fill="#233e33", font=font)
for obstacle in plan["obstacles"]:
    draw.rectangle(rectangle(obstacle["min"], obstacle["max"]), fill="#99a395", outline="#57685d", width=2)
    x, y = pixel(*obstacle["min"])
    draw.text((x + 3, y + 3), obstacle["id"], fill="#17271e", font=small_font)
for portal in plan["portals"]:
    start, end = portal["start"], portal["end"]
    a, b = pixel(start[0], start[2]), pixel(end[0], end[2])
    draw.line((a, b), fill="#fffdf2", width=10)
    draw.line((a, b), fill="#4c926d", width=3)
for point in plan["points"]:
    seat, approach, exit_point = point["position"], point["approach"], point["exit"]
    a = pixel(seat[0], seat[2])
    b = pixel(approach[0], approach[2])
    c = pixel(exit_point[0], exit_point[2])
    draw.line((a, b, c), fill="#9c562f", width=2)
    draw.ellipse((b[0] - 4, b[1] - 4, b[0] + 4, b[1] + 4), fill="#b56034")
draw.text((margin, 15), "平面坐标审查 · 深灰为功能足迹 · 绿线为共享门洞 · 橙点为接近点", fill="#243d32", font=font)
draw.text((margin, image.height - 37), "仅静态制作审查，未验证真实人物使用及导航。", fill="#4a5f52", font=font)
destination = source.with_suffix(".png")
image.save(destination)
print(destination)
