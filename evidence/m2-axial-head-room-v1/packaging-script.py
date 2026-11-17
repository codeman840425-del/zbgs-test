"""Package existing fixed-build captures; never infer human visual acceptance."""
from pathlib import Path
import argparse
import hashlib
import html
import json

p = argparse.ArgumentParser()
p.add_argument('--root', default='evidence/m2-axial-head-room-v1')
a = p.parse_args()
root = Path(a.root)
build = json.loads((root / 'fixed-build.json').read_text(encoding='utf-8'))
run = json.loads((root / 'run-01/report.json').read_text(encoding='utf-8'))
assert run['build'] == build['build']
bodies = ['male', 'male-long-lean-axial-head-v1']
labels = ['原男性', '瘦长脸 · 仅头部候选']
sections = [f'<h1>头部生产与游戏回读对照</h1><p>固定构建 <code>{build["build"]}</code> · 源码 <code>{build["commit"][:12]}</code></p>',
 '<p>本页检查真实头部几何变化、表情与衣领适配。新候选不包含原请求的身体变化，不代表八预设或 M2 完成。下巴偏尖，混合口型存在已知口内接触，均未标为视觉通过。</p>',
 '<p><a href="http://127.0.0.1:4196/?workbench=appearance">返回工作台</a> · <a href="run-01/report.json">实际检查记录</a> · <a href="run-01-analysis.json">时钟与采样范围</a></p>']
supplements = sorted(root.glob('supplement-*/report.json'))
passed = []
for path in supplements:
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('build') == build['build']:
        passed.append((path, data))
if passed:
    path, data = passed[-1]
    sections.append('<h2>正常速度完整片段</h2><p>加载完成后直接录制游戏画面。没有暂停诊断或速度调整。两段采用同镜头与指令顺序；浏览器操作耗时可能不同，并非逐帧同步。</p>')
    for body, label in zip(bodies, labels):
        movie = path.parent / body / 'normal-speed-canvas.webm'
        if movie.exists():
            sections.append(f'<h3>{label}</h3><video controls preload="metadata" src="{movie.relative_to(root).as_posix()}"></video>')
    sections.append(f'<p><a href="{path.relative_to(root).as_posix()}">补充检查记录（状态以记录为准）</a></p>')
sections.append('<h2>同姿态近景</h2><p>以下是暂停态诊断，用于查看具体边界，不能代替整段动作验收。</p>')
for name, label in [('neutral', '自然表情'), ('blink', '闭眼'), ('happy-blink-oh', '微笑＋闭眼＋口型 O')]:
    sections.append(f'<h3>{label}</h3><div class="pair">')
    for body, title in zip(bodies, labels):
        src = f'run-01/{body}/boundary-{name}-fixed.png'
        assert (root / src).exists()
        sections.append(f'<figure><figcaption>{title}</figcaption><a href="{src}"><img loading="lazy" src="{src}"></a></figure>')
    sections.append('</div>')
sections.append('<details><summary>首轮完整操作记录（含暂停诊断、加载与重载）</summary>')
for body, label in zip(bodies, labels):
    sections.append(f'<h3>{label}</h3><video controls preload="none" src="run-01/{body}/complete-1x.webm"></video>')
sections.append('</details><p>设备：Ryzen 9 9950X3D／RTX 4090 开发机。普通电脑未实测。数字、连续采样、正常速度影片与人工观感分别记录；微小口内相交计数不等于可见穿透深度。</p>')
page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>头部回读对照</title><style>body{max-width:1440px;margin:auto;padding:24px;background:#f6f4ed;color:#203237;font:17px/1.65 system-ui}video,img{width:100%;display:block}video{max-height:85vh;background:#182227}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0}h1{font-size:28px}summary{cursor:pointer;padding:16px}a{color:#12665a}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style>' + ''.join(sections) + '</html>'
(root / 'index.html').write_text(page, encoding='utf-8')
(root / 'packaging-script.py').write_bytes(Path(__file__).read_bytes())
files = [{'path': f.relative_to(root).as_posix(), 'bytes': f.stat().st_size, 'sha256': hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(root.rglob('*')) if f.is_file() and f.name != 'manifest.json']
(root / 'manifest.json').write_text(json.dumps({'build': build['build'], 'files': files, 'humanVisualAcceptance': 'pending'}, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'build': build['build'], 'files': len(files), 'page': str(root / 'index.html')}))
