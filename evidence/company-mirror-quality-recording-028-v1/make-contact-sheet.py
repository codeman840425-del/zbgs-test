import subprocess
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
ffmpeg = 'C:/Users/Administrator/AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe'
times = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 36]
sheet = Image.new('RGB', (1080, 5 * 274), 'white')
draw = ImageDraw.Draw(sheet)
for i, sec in enumerate(times):
    frame = root / f'frame-{sec}.png'
    subprocess.run([ffmpeg, '-loglevel', 'error', '-y', '-ss', str(sec), '-i', str(root/'mirror-quality-normal1x.webm'), '-vf', 'scale=360:-1', '-frames:v', '1', str(frame)], check=True)
    x, y = (i % 3) * 360, (i // 3) * 274
    sheet.paste(Image.open(frame), (x, y+22))
    draw.text((x+8, y+4), f'{sec}s | 1x | build 028e9e44db24', fill='black')
sheet.save(root/'contact-sheet.png')
