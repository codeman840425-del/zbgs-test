"""Index original fixed-build films without re-encoding or changing their identity."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evidence/m2-whole-look-matrix-003-v1'

def report(folder):
    return json.loads((ROOT/'evidence'/folder/'report.json').read_text(encoding='utf-8'))

matrix = report('m2-whole-look-matrix-003-v1')
assert matrix['build'] == '003fedb60bb2'
assert all(case['status'] == 'passed' for case in matrix['cases'])
regression = report('m2-whole-look-existing-regression-003-v1')
assert regression['status'] == 'passed' and len(regression['checks']) == 10
assert all(case['status'] == 'passed' for case in report('m2-whole-look-matrix-de79-v1')['cases'])
for folder in ['hair', 'palette', 'female']:
    assert report(f'm2-whole-look-{folder}-de79-v1')['status'] == 'delayed-failure-preserves-whole-look'

movies = [
    ('当前候选：行走中应用整套造型，讲话、坐下与起身', 'success/normal1x.webm', '003fedb60bb2'),
    ('当前候选：较新换人取消旧造型请求', 'body-replaced/normal1x.webm', '003fedb60bb2'),
    ('修复前：头发加载失败前已出现半套新外观', '../m2-whole-look-baseline-8e2-v1/normal1x.webm', '8e2926da4939'),
    ('修复后：相同头发延迟失败，保留完整旧外观', '../m2-whole-look-hair-de79-v1/normal1x.webm', 'de79d2b4cfed'),
    ('修复前：瞳色遮罩失败前几何和头发已改变', '../m2-whole-look-palette-baseline-8e2-v1/normal1x.webm', '8e2926da4939'),
    ('修复后：相同遮罩延迟失败，保留完整旧外观', '../m2-whole-look-palette-de79-v1/normal1x.webm', 'de79d2b4cfed'),
    ('女性现有配方：延迟失败保原', '../m2-whole-look-female-de79-v1/normal1x.webm', 'de79d2b4cfed'),
]
receipt = {
    'currentBuild': '003fedb60bb2',
    'sourceCommit': '1fa59bdce0b418d4f424eb70cdaceb4126d7a8dd',
    'scope': 'Existing same-body v1-v6 appearance recipes; current actual male/female resources. Not a general cross-body fit or new asset admission proof.',
    'technical': 'de79 delayed hair/palette failure, six competing-request cases; 003 ten existing regressions including late cancelled body load, plus current success/body replacement cases passed. Render-time state trace contains only complete old/new looks in successful transaction.',
    'engineeringVisual': 'Root inspected complete-duration 2fps sheets of 003 success film: no conspicuous new tears or detached geometry in sampled frames. Half-body camera during initial walking cannot assess foot contact. Continuous naturalness and user acceptance are not inferred.',
    'environment': regression['environment'],
    'rebuild': {'report': '../m2-whole-look-fixed-003-rebuild/report.json', 'matchingFiles': 127},
    'preservedFailures': [
        'm2-whole-look-fixed-rebuild/report.json: comparison used stale pre-final author dist; superseded by exact-source rebuild, not relabelled.',
        'm2-whole-look-existing-regression-de79-v1: first cancellation assertion lacks detailed result; root cause unconfirmed.',
        'm2-whole-look-existing-regression-8e2-baseline: outdated v1 palette fixture; actual runtime uses v3.',
        'm2-whole-look-late-cancel-de79-baseline: actual late 503 returned failure instead of cancellation; corrected by 1fa59bd.',
    ],
    'limitations': ['No ordinary-PC performance acceptance.', 'No cross-body whole-look transaction or arbitrary shape-fit compatibility claim.', 'No M2 completion or final user visual acceptance.'],
    'movies': [],
}
for label, path, build in movies:
    raw = (OUT/path).read_bytes()
    receipt['movies'].append({'label': label, 'path': path, 'build': build, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'playbackRate': 1})
(OUT/'delivery.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
cards = ''.join(f'<article><h2>{label}</h2><p>构建 {build} · 原始1倍速</p><video controls preload="metadata" src="{path}"></video></article>' for label, path, build in movies)
html = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>整套造型准备与保原 · 003fedb60bb2</title>
<style>body{{font:16px/1.6 system-ui;background:#eef1ef;color:#20322a;max-width:1440px;margin:24px auto;padding:20px}}article{{background:white;padding:18px;margin:20px 0}}video{{width:100%;max-height:900px}}a{{color:#12634a}}</style>
<h1>整套造型准备与失败保原</h1><p>先准备脸部、发型、颜色和服装资源，再统一显示。加载失败时保留原来整套外观；新的修改请求不会被旧请求覆盖。</p>
<p>本页复用同角色、同输入的修复前后录像，各片明确保留原构建。003在de79基础上只修正换人取消后的迟到失败结果，并补当前版运行回归。现有配方范围通过技术检查，不代表所有体型、服装或整个M2已通过。</p>
<p><a href="http://127.0.0.1:4208/?workbench=appearance">打开固定候选</a> · <a href="delivery.json">版本、检查范围和遗留限制</a> · <a href="report.json">当前运行记录</a></p>
{cards}<p>原始录像包含加载过程。全时段抽帧仅为工程检查；正常速度连续观看和用户验收单独记录。普通电脑性能未测。</p></html>'''
(OUT/'index.html').write_text(html, encoding='utf-8')
print(json.dumps({'build': receipt['currentBuild'], 'movies': len(movies), 'index': str(OUT/'index.html')}))
