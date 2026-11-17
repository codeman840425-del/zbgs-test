"""Read captured pixels and sample the recorded transition. No browser or model edits."""
import hashlib
import json
import pathlib
import subprocess
import tempfile

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw

BASE = pathlib.Path(__file__).resolve().parent
SHOTS = ['neutral', 'happy-1', 'happy-065', 'blink', 'aa']
result = {'schema': 'native-expression-pixel-review-v1', 'shots': {}, 'videoSamples': []}
for shot in SHOTS:
    a = np.asarray(Image.open(BASE / 'baseline' / (shot + '.png')).convert('RGBA'))
    b = np.asarray(Image.open(BASE / 'candidate' / (shot + '.png')).convert('RGBA'))
    diff = np.max(np.abs(a.astype(int) - b.astype(int)), axis=2)
    rows = {}
    for threshold in [0, 2]:
        ys, xs = np.where(diff > threshold)
        rows[str(threshold)] = {'changedPixels': len(xs), 'bboxXYXY': None if not len(xs) else
            [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]}
    result['shots'][shot] = {'maximumChannelDifference': int(diff.max()), 'differenceGreaterThan': rows}

for case in ['baseline', 'candidate']:
    video = BASE / case / 'normal1x.webm'
    reader = imageio_ffmpeg.read_frames(str(video))
    meta = next(reader)
    reader.close()
    start = max(0, meta['duration'] - 3.7)
    with tempfile.TemporaryDirectory(prefix='native-expression-frames-') as tmp:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-ss', str(start),
            '-i', str(video), '-vf', 'fps=4', str(pathlib.Path(tmp) / '%03d.png')], check=True)
        frames = sorted(pathlib.Path(tmp).glob('*.png'))
        sheet = Image.new('RGB', (1520, 1040), 'white')
        draw = ImageDraw.Draw(sheet)
        for i, file in enumerate(frames):
            image = Image.open(file).convert('RGB').crop((350, 323, 730, 553))
            x, y = (i % 4) * 380, (i // 4) * 260
            sheet.paste(image, (x, y + 24))
            draw.text((x + 4, y + 4), f'{case} video {start + i / 4:.2f}s', fill='black')
        sheet.save(BASE / (case + '-transition-sheet.png'))
        result['videoSamples'].append({'case': case, 'videoSHA256': hashlib.sha256(video.read_bytes()).hexdigest(),
            'durationSeconds': meta['duration'], 'sampleStartSeconds': start, 'fps': 4, 'frames': len(frames),
            'cropXYXY': [350, 323, 730, 553], 'scope': 'Brow/eye crop of actual room video, not all-frame review'})
(BASE / 'review-readback.json').write_bytes((json.dumps(result, indent=2) + '\n').encode('utf-8'))
print(json.dumps(result))
