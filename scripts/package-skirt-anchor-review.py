"""Archive the executed fixed-candidate comparison; never relabel old films."""
import gzip, hashlib, json, pathlib, shutil

ROOT = pathlib.Path(__file__).resolve().parents[1]
NEW = '7e24e01556ad'
OLD = '83a7372f41b4'
out = ROOT / 'evidence' / ('skirt-anchors-' + NEW)
bundle = ROOT / 'assets-source' / 'skirt-skinned-anchors-v1'
bundle.mkdir(parents=True, exist_ok=True)
sources = ['m1-skirt.js', 'm1-equipment.js', 'skirt-fit.js', 'skirt-fit-profiles.json']
for name in sources:
    shutil.copyfile(ROOT / 'prototype/src' / name, bundle / name)
build = json.loads((ROOT / 'experiments/m1-skirt-skinned-anchors-v2/dist/build-info.json').read_text())
assert build['shortId'] == NEW
(bundle / 'build-info.json').write_text(json.dumps(build, indent=2), encoding='utf-8')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
record = {'build': NEW, 'baseCommit': 'cc22f62d3e0e219eb14afc142fba10b242003ec9',
          'sourceFiles': {name: sha(bundle / name) for name in sources},
          'sourceAssetsUnchanged': True,
          'scope': 'Fixed anchors retain source skin; exact resource fit guard. No complete skirt visual pass.'}
(bundle / 'manifest.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
(bundle / 'README.md').write_text('''# Skinned attachment-band correction

Apply the four source files in this directory to prototype/src at the recorded
base commit, then `npm ci` and `npm run build` in prototype. Expected source build:
7e24e01556ad. These are snapshots of the executed candidate, not an original art
project. Existing source GLBs and editable art remain unchanged.

`node scripts/qa-skirt-skinned-anchors.mjs` checks actual factory skinning and
known/unknown fits. `qa-skirt-anchor-chain.cjs` compares all fixed render points
against source skin over the actual room controller chain. Use
`node scripts/run-fixed-check.cjs <dist> <script> <build> <output>`.

The fit JSON explicitly records the three existing garment/body hash pairs and
their attachment/guide regions. This is a bounded prototype corrective, not a
general garment solver. New clothing must supply a tested fit; ordinary clothing
must not require editing the movement/sitting controller. Morphs or non-equivalent
position welds are rejected instead of losing their data silently.

The old fixed band was driven entirely by hips, discarding its authored weights.
The 259-pose full-surface follow-up still fails complete clothing acceptance.
New body pairs are entirely the original fixed waist-cap faces 0–19; this source
topology issue is separate from the corrected runtime semantics. Free hem folds,
shirt/body intersections, and ordinary-PC performance remain unapproved.
''', encoding='utf-8')
style = '<style>body{max-width:1500px;margin:24px auto;padding:0 18px;background:#eef0f1;color:#20252b;font:17px/1.55 sans-serif}article{margin:26px 0;padding:18px;background:white} .pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}video,img{width:100%}button{padding:9px 18px;margin:10px 10px 0 0}h1{font-size:26px}h2{font-size:20px}small{display:block}</style>'
html = ['<!doctype html><meta charset="utf-8"><title>裙腰绑定修复：固定版对照</title>',style,
        '<h1>裙腰绑定修复：同镜头、正常 1× 对照</h1>',
        '<p>左：83a7372f41b4；右：7e24e01556ad。相同原女角色、裙装、房间镜头和路径。右侧尚未替换 4194；整裙未通过。</p>',
        '<p>本次修复裙腰丢失脊柱／胸部权重的问题。上衣露肤、自由裙摆硬折及坐姿仍有缺陷。绑定检查通过不等于衣物合身。影片按各自命令时间对齐，真实帧时间有差异，并非逐姿态锁定。</p>']
pairs=[]
for speed in ('1.80','2.00','2.40'):
    filename=f'run-video/speed-{speed}-full.webm'
    pairs.append((f'{speed} m/s：起步、直行、停止',filename,filename))
pairs.append(('坐下 → 坐稳 → 起身 → 转身 → 走到空地 → 完整短舞蹈',
              'related-video/sit-rise-turn-technical.webm','related-video/sit-rise-turn-technical.webm'))
for i,(title,old,new) in enumerate(pairs):
    html.append(f'<article><h2>{title}</h2><div class="pair" id="p{i}"><div>修改前<video controls preload="metadata" src="../skirt-anchors-{OLD}/{old}"></video></div><div>修改后<video controls preload="metadata" src="{new}"></video></div></div><button onclick="playPair({i})">从头同时播放 · 1×</button><button onclick="pausePair({i})">同时暂停</button></article>')
html.append('<article><h2>同一动作时刻的诊断近景</h2><div class="pair"><div>a491：黑片和露肤<img src="../garment-visible-hits-a491-source/run-row14.png"></div><div>7e24：黑片消失，露肤仍在<img src="../garment-visible-hits-7e24e01556ad/run-row14.png"></div></div><small>这组近景固定模拟 85 步，同角色、同相位、同镜头。a491与83之间为已核查的等价透明度查询优化；不将a491图改标83。</small></article>')
html.append('<p>已检查完整时长抽帧与数值；抽帧不代表连续自然度验收。影片、报告和源码快照哈希见 manifest.json。程序结果见 report.json 和 contact/，仍未完成目标普通电脑实测。</p>')
html.append('<script>function videos(i){return [...document.querySelectorAll(`#p${i} video`)]}function playPair(i){videos(i).forEach(v=>{v.pause();v.currentTime=0;v.playbackRate=1;v.play()})}function pausePair(i){videos(i).forEach(v=>v.pause())}</script>')
(out / 'index.html').write_text('\n'.join(html),encoding='utf-8')
manifest={'newBuild':NEW,'oldBuild':OLD,'sourceBundle':str(bundle.relative_to(ROOT)), 'files':{}}
for folder in [out, ROOT/'evidence'/('skirt-anchors-'+OLD)]:
    for f in folder.rglob('*'):
        if f.is_file() and f.name!='manifest.json':
            manifest['files'][str(f.relative_to(ROOT)).replace('\\','/')]=sha(f)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(out/'index.html')
