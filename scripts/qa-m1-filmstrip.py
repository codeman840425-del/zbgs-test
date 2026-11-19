"""Review aid only: sample the complete normal-speed recording, retaining time labels.
Not a replacement for watching the linked video or a claim of all-frame inspection.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

from PIL import Image, ImageDraw
import imageio_ffmpeg
from production.production_paths import project_output


parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
parser.add_argument('--fps', type=float, default=2)
args = parser.parse_args()
out = project_output(args.folder / 'review', __file__)
manifest = project_output(out / 'manifest.json', __file__)
out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='m1-review-', dir=out) as temp:
    env = dict(os.environ, TEMP=temp, TMP=temp, TMPDIR=temp)
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(args.folder / 'same-camera-chain.webm'),
                    '-vf', f'fps={args.fps}', str(Path(temp) / '%05d.jpg')], check=True, env=env)
    frames = sorted(Path(temp).glob('*.jpg'))
    sheets = [f'chain-{start // 20:02d}.jpg' for start in range(0, len(frames), 20)]
    targets = [project_output(out / name, __file__) for name in sheets]
    for start, target in zip(range(0, len(frames), 20), targets):
        canvas = Image.new('RGB', (1000, 1280), '#eee')
        draw = ImageDraw.Draw(canvas)
        for j, file in enumerate(frames[start:start + 20]):
            with Image.open(file) as frame:
                crop = frame.crop((400, 200, 850, 890))
            crop.thumbnail((196, 295))
            x, y = (j % 5) * 200, (j // 5) * 320
            canvas.paste(crop, (x, y + 20))
            draw.text((x + 4, y + 2), f'{(start + j) / args.fps:.2f}s', fill='black')
        canvas.save(target, format='JPEG', quality=90)
    manifest.write_text(json.dumps({'samplingFps': args.fps, 'frames': len(frames), 'sheets': sheets,
                                    'limit': 'Complete duration sampled, not all-frame visual acceptance'}, indent=2), encoding='utf8')
print(out, len(sheets), 'sheets')
