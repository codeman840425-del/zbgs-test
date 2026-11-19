"""Full-duration room-view review aid; not a substitute for the normal-speed film."""
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
parser.add_argument('video', type=Path)
parser.add_argument('--fps', type=float, default=2)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
video = args.video
out = project_output(args.output or video.parent / (video.stem + '-review'), __file__)
manifest = project_output(out / 'manifest.json', __file__)
out.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='room-frames-', dir=out) as temp:
    env = dict(os.environ, TEMP=temp, TMP=temp, TMPDIR=temp)
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(video),
                    '-vf', f'fps={args.fps}', str(Path(temp) / '%06d.jpg')], check=True, env=env)
    frames = sorted(Path(temp).glob('*.jpg'))
    sheets = [f'{start // 12:03d}.jpg' for start in range(0, len(frames), 12)]
    targets = [project_output(out / name, __file__) for name in sheets]
    for start, target in zip(range(0, len(frames), 12), targets):
        canvas = Image.new('RGB', (1440, 1140), '#eee')
        draw = ImageDraw.Draw(canvas)
        for j, file in enumerate(frames[start:start + 12]):
            x, y = (j % 3) * 480, (j // 3) * 285
            with Image.open(file) as frame:
                frame.thumbnail((478, 350))
                # Keep the complete captured image in the room timeline.
                frame.thumbnail((478, 260))
                canvas.paste(frame, (x, y + 23))
            draw.text((x + 4, y + 3), f'{(start + j) / args.fps:.2f}s', fill='black')
        canvas.save(target, format='JPEG', quality=91)
    manifest.write_text(json.dumps({'video': str(video), 'samplingFPS': args.fps, 'frames': len(frames),
                                    'sheets': sheets, 'limit': 'Complete duration sampled; not all-frame or normal-speed visual acceptance'}, indent=2), encoding='utf8')
print(json.dumps({'folder': str(out), 'frames': len(frames), 'sheets': len(sheets)}))
