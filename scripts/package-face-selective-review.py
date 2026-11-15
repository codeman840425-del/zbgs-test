"""Offline packaging only. Does not declare visual acceptance; requires manual review."""
import argparse
import gzip
import hashlib
import html
import json
from pathlib import Path
import subprocess
import tempfile

import imageio_ffmpeg
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
args = ap.parse_args()
p = Path(args.out).resolve()
r = json.loads((p / 'report.json').read_text(encoding='utf-8'))
review = p / 'review'
review.mkdir(exist_ok=False)
records = {'build': r['build'], 'status': 'generated-not-yet-visually-reviewed', 'static': [], 'wholeTime': [], 'limits': '2 fps sequential samples are not continuous human playback acceptance. Native movie includes explicitly paused static diagnosis; live trace windows identify normal playback.'}
for body in r['plan']['bodies']:
    for expression in ['neutral', 'aa', 'happyblink']:
        names = [p / f'{body}-{v}-{expression}.png' for v in ['original', 'edited']]
        if not all(f.exists() for f in names):
            continue
        sheet = Image.new('RGB', (1600, 530), '#eeeeee')
        draw = ImageDraw.Draw(sheet)
        for i, f in enumerate(names):
            im = Image.open(f).convert('RGB'); im.thumbnail((800, 500))
            draw.text((i*800+4, 6), f.stem, fill='black'); sheet.paste(im, (i*800, 30))
        target = review / f'{body}-{expression}-pair.jpg'
        sheet.save(target, quality=90)
        records['static'].append(target.relative_to(p).as_posix())
for movie_i, movie in enumerate(r['movies']):
    with tempfile.TemporaryDirectory(prefix='face-review-') as tmp:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-threads', '2', '-i', str(p / movie['file']), '-vf', 'fps=2,scale=800:-1', '-threads', '2', str(Path(tmp) / '%06d.jpg')], check=True)
        frames = sorted(Path(tmp).glob('*.jpg'))
        for start in range(0, len(frames), 8):
            sheet = Image.new('RGB', (1600, 2120), '#eeeeee'); draw = ImageDraw.Draw(sheet)
            for j, f in enumerate(frames[start:start+8]):
                x, y = (j % 2)*800, (j // 2)*530
                draw.text((x+4, y+5), f'Native movie {movie_i} about {(start+j)/2:.1f}s', fill='black')
                sheet.paste(Image.open(f), (x, y+30))
            target = review / f'movie-{movie_i}-sheet-{start//8:03d}.jpg'; sheet.save(target, quality=88)
            records['wholeTime'].append(target.relative_to(p).as_posix())
sections = [f'<h1>{html.escape(r["build"])}: selective face geometry QA</h1><p>Generated evidence viewer. Technical assertions and image review are separate. No target-PC performance acceptance.</p><p><a href="report.json">Actual report</a> | <a href="review.json">Review status</a></p>']
for m in r['movies']:
    sections.append(f'<h2>Native UI capture</h2><p>{html.escape(m["scope"])}</p><video controls src="{html.escape(m["file"])}"></video>')
for title, images in [('Same-pose representatives', records['static']), ('Full-time sampled sheets', records['wholeTime']), ('Actual UI screenshots', [s for s in r['shots'] if '-tab-' in s])]:
    sections.append(f'<h2>{title}</h2>')
    for image in images:
        sections.append(f'<details><summary>{html.escape(image)}</summary><img loading="lazy" src="{html.escape(image)}"></details>')
(p / 'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Face selective QA</title><style>body{max-width:1600px;margin:auto;padding:20px;font:18px/1.6 system-ui;background:#f3f0e9}video,img{display:block;width:100%}summary{min-height:44px}</style>' + ''.join(sections), encoding='utf-8')
(p / 'review.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
for raw in [p / 'report.json', *p.glob('*-live-trace.json')]:
    raw.with_suffix(raw.suffix + '.gz').write_bytes(gzip.compress(raw.read_bytes(), compresslevel=1, mtime=0))
(p / 'packaging-script.py').write_bytes(Path(__file__).read_bytes())
files = [{'path': f.relative_to(p).as_posix(), 'bytes': f.stat().st_size, 'sha256': hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(p.rglob('*')) if f.is_file() and f.name != 'manifest.json']
(p / 'manifest.json').write_text(json.dumps({'build': r['build'], 'files': files}, indent=2), encoding='utf-8')
print(json.dumps({'out': str(p), 'staticSheets': len(records['static']), 'wholeSheets': len(records['wholeTime']), 'review': 'pending'}))
