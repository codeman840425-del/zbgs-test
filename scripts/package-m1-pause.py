"""Archive the already collected efdf candidate at the user's pause boundary.

Does not run tests or infer a visual pass. Original captures remain untouched.
"""
from pathlib import Path
import gzip, hashlib, html, json, shutil

ROOT = Path(__file__).resolve().parents[1]
BUILD = 'efdf558930a4'
DEST = ROOT / 'evidence' / ('m1-pause-' + BUILD)
GROUPS = {
    'shorts': ROOT / 'output/playwright/m1b-shorts' / BUILD,
    'walk-run-dance': ROOT / 'output/playwright/m1' / BUILD / 'm1c-runtime',
    'turn': ROOT / 'output/playwright/m1' / BUILD / 'turn-normal-1794697220631',
}

for name, source in GROUPS.items():
    target = DEST / name
    target.mkdir(parents=True, exist_ok=True)
    for f in source.iterdir():
        if not f.is_file():
            continue
        if f.suffix == '.json':
            with (target / (f.name + '.gz')).open('wb') as stream:
                with gzip.GzipFile(filename='', mode='wb', fileobj=stream, mtime=0) as compressed:
                    compressed.write(f.read_bytes())
        elif f.suffix == '.webm' and (name != 'shorts' or f.name == 'shorts-review.webm'):
            shutil.copy2(f, target / f.name)
        elif f.name in ['normal-seated-side.png', 'selection-2-2.png', 'shorts-dance-6.png']:
            shutil.copy2(f, target / f.name)

rows = []
for f in sorted(DEST.rglob('*')):
    if f.is_file() and f.name not in ['manifest.json', 'index.html']:
        rows.append({'file': f.relative_to(DEST).as_posix(), 'bytes': f.stat().st_size,
                     'sha256': hashlib.sha256(f.read_bytes()).hexdigest()})
manifest = {'build': BUILD, 'runtimeCommit': 'ba696aee4c06daa26060071fa75675a4043a506a',
            'status': 'collected; not full M1 acceptance; paused at user request',
            'sourceFolders': {k: v.relative_to(ROOT).as_posix() for k, v in GROUPS.items()},
            'limits': ['Published interactive 4192 remains 942d35a54f68; it is not this recording build.',
                       'Shorts movie includes labeled diagnostic setup before normal-speed chain.',
                       'Turn clips have not completed whole-video visual review or matched old/new comparison.',
                       'No ordinary-PC performance pass or user naturalness acceptance.'], 'files': rows}
(DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
cards = []
for r in rows:
    if r['file'].endswith('.webm'):
        label = html.escape(r['file'])
        cards.append(f'<section><h2>{label}</h2><video controls preload="metadata" src="{label}"></video></section>')
(DEST / 'index.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>男性短裤 · 本轮已录结果</title><style>body{font:16px/1.6 system-ui;max-width:1200px;margin:24px auto;padding:20px;background:#edf1f1}section{padding:16px;background:white;margin:20px 0}video{width:100%;max-height:760px}h2{font-size:18px;overflow-wrap:anywhere}.note{background:#fff2d6;padding:16px}</style>
<h1>男性短裤 · efdf558930a4</h1><p class="note">本轮已经录制完毕，尚未宣布M1通过。短裤完整链包含开头的加速坐姿诊断；之后是正常速度体验。固定房间走跑舞蹈及下方转向片段均为1倍速。转向自然度、服装褶皱仍待验；普通电脑未实测。暂停期间不继续修改。</p>
<p><a href="http://127.0.0.1:4192/?body=male">打开男性交互样板（保留942旧候选）</a> · <a href="manifest.json">本轮录像版本与校验</a></p>
''' + ''.join(cards) + '</html>', encoding='utf8')
print(DEST)
