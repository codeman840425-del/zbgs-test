"""Archive one completed fixed-build user chain; never relabel old evidence."""
import argparse
import gzip
import hashlib
import html
import json
import shutil
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('input', type=Path)
p.add_argument('output', type=Path)
args = p.parse_args()
source = args.input / 'report.json'
report = json.loads(source.read_text(encoding='utf-8'))
build = report['build']
assert report['cases'] and all(c.get('passed') for c in report['cases'])
assert all(not c.get('cameraChanges') for c in report['cases']), 'Camera changed'
assert not args.output.exists(), 'Preserve existing evidence; select a new output'
args.output.mkdir(parents=True)
(args.output / 'report.json.gz').write_bytes(gzip.compress(source.read_bytes(), mtime=0))
summary = {'build': build, 'cases': [], 'visualReview': 'pending',
           'scope': 'Real 1x continuous UI/task chain; explicit 0.5 second pause is part of the test. No reset/teleport/advance. Not a collision or performance pass.'}
cards = []
for case in report['cases']:
    name = case['config']['name']
    folder = args.output / name
    folder.mkdir()
    for file in (args.input / name).iterdir():
        if file.suffix in ['.webm', '.png']:
            shutil.copyfile(file, folder / file.name)
    frames = case['frames']
    summary['cases'].append({k: v for k, v in case.items() if k != 'frames'})
    summary['cases'][-1]['samples'] = len(frames)
    summary['cases'][-1]['observedSeconds'] = (frames[-1]['wallMs'] - frames[0]['wallMs']) / 1000
    title = '女性裙装' if name == 'female-skirt' else '男性露膝短裤'
    cards.append(f'<article><h2>{title}</h2><video controls preload="metadata" src="{html.escape(name)}/continuous-chain.webm"></video><p>25项状态检查通过；加载完成后的操作链相机外参一致。服装接触及自然度分别验收，不以任务完成代替。</p></article>')
(args.output / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
page = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M1同版完整操作链 · {build}</title><style>body{{font:16px/1.7 system-ui;max-width:1500px;margin:24px auto;padding:20px;background:#edf1f1;color:#20302c}}.pair{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}article{{background:white;padding:16px}}video{{width:100%}}@media(max-width:900px){{.pair{{grid-template-columns:1fr}}}}</style>
<h1>男女完整操作链 · {build}</h1><p>两段均为正常1倍速，保留完整过程。换装 → 走跑重选 → 持麦与眼镜 → 实际接近椅子、坐姿讲话 → 卸麦招手 → 起身 → 两段技术舞及中断 → 再走、卸下。中间一次约0.5秒暂停是有意检查暂停恢复，不是掉帧。</p>
<p>同一固定构建，角色在链中不重置、不传送；加载完成后固定房间镜头；影片开头保留加载和切换房间镜头的过程。女性裙硬折、起身掌指接触仍未通过；男性短裤这里使用原材质。两人仍为技术候选，画风及整片自然度待用户判断。技术舞不等于专业编舞，普通电脑未实测。</p><div class="pair">{''.join(cards)}</div>
<p><a href="../material-recipe-abdb18defd26/">男性短裤材质两种方案</a> · <a href="summary.json">检查及范围</a> · <a href="manifest.json">版本与哈希</a> · <a href="../m1-current-review/">返回主入口</a></p></html>'''
(args.output / 'index.html').write_text(page, encoding='utf-8')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
manifest = {'build': build, 'sourceReportSha256': sha(source), 'packagerSha256': sha(Path(__file__)),
            'files': {f.relative_to(args.output).as_posix(): sha(f) for f in args.output.rglob('*') if f.is_file()}}
(args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(str(args.output))
