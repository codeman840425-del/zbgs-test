"""Compact immutable two-build evidence; preserves failed candidate and actual inputs."""
from pathlib import Path
import gzip,json,hashlib,shutil,copy
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'evidence/skirt-front-17bdb176154c';OUT.mkdir(exist_ok=True)
sources={'original':'175a487d5ea3-1794703574576','candidate':'17bdb176154c-1794703606516'}
for label,run in sources.items():
 source=ROOT/'output/skirt-front-closed-loop'/run;dest=OUT/label;dest.mkdir(exist_ok=True)
 for camera in ['room','close']:
  d=dest/camera;d.mkdir(exist_ok=True)
  for name in ['normal-sit-rise.webm','sit-072.png','seated.png','rise-055.png','standing-end.png']:shutil.copy2(source/camera/name,d/name)
 for name in ['report.json','triangle-alpha-report.json']:(dest/(name+'.gz')).write_bytes(gzip.compress((source/name).read_bytes(),mtime=0))
comparison=ROOT/'output/skirt-front-closed-loop/comparison-17bdb176154c'
for name in ['summary.json','crossing-regions.json']:shutil.copy2(comparison/name,OUT/name)
(OUT/'triangle-alpha-comparison.json.gz').write_bytes(gzip.compress((comparison/'triangle-alpha-report.json').read_bytes(),mtime=0))
for label,build in [('original','175a487d5ea3'),('candidate','17bdb176154c')]:
 src=ROOT/'experiments/skirt-offline-corrective'/('front-input-'+build);d=OUT/label/'actual-seven-pose-input';d.mkdir(exist_ok=True)
 source=json.loads((src/'capture.json').read_text(encoding='utf-8'));subset=copy.deepcopy(source);indices=[0,76,81,139,191,192,269];subset['frames']=[source['frames'][i]for i in indices];subset['subsetNote']='Seven exact actual frames; does not reproduce whole270 counts. Full captures retained locally; reproducible capture script and all full input hashes recorded.'
 fullHashes={}
 for name,stride in [('colliders.f32',sum(m['vertexCount']for m in source['topology']['colliders'])*12),('source.f32',source['topology']['source']['vertexCount']*12),('displayed.f32',source['topology']['displayed']['vertexCount']*12)]:
  raw=(src/name).read_bytes();fullHashes[name]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)};part=b''.join(raw[i*stride:(i+1)*stride]for i in indices);subset[name]={'sha256':hashlib.sha256(part).hexdigest(),'bytes':len(part)};(d/(name+'.gz')).write_bytes(gzip.compress(part,compresslevel=6,mtime=0))
 fullHashes['capture.json']={'sha256':hashlib.sha256((src/'capture.json').read_bytes()).hexdigest()};subset['fullInputIdentities']=fullHashes
 (d/'capture.json.gz').write_bytes(gzip.compress(json.dumps(subset,separators=(',',':')).encode(),mtime=0))
for src,label in [(ROOT/'experiments/m1-integrated-contact-1/dist/build-info.json','original'),(ROOT/'experiments/seated-front-candidate-1/dist/build-info.json','candidate')]:shutil.copy2(src,OUT/label/'build-info.json')
artifact=ROOT/'assets-source/m1/seated-front-v1'
for name in ['controls.json','target.json','candidate-solver.js','original-solver-10a072.js']:shutil.copy2(artifact/name,OUT/name)
html='''<!doctype html><meta charset="utf-8"><title>前裙片失败候选：175 / 17bd</title><style>body{font:16px sans-serif;margin:24px;background:#eee}section{display:flex;gap:12px}article{width:49%}video{width:100%}p{max-width:1000px}</style><h1>前裙片失败候选：同参数 1× 坐起</h1><p>原版175与隔离候选17bd；真实手接触随各自裙重算，dynamics=false，完整身体保留。已知新增腰上衣交叉未通过，不能将更平整的前摆等同修复。视频包含载入，不保证跨片播放头时间对齐。初始源姿相同，事件时间见report。</p>'''
for camera in ['room','close']:
 html+=f'<h2>{camera}</h2><section>'
 for label in sources:html+=f'<article><h3>{label}</h3><video controls preload="metadata" src="{label}/{camera}/normal-sit-rise.webm"></video></article>'
 html+='</section>'
(OUT/'index.html').write_text(html,encoding='utf-8')
records={str(p.relative_to(OUT)).replace('\\','/'):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in OUT.rglob('*')if p.is_file()and p.name!='manifest.json'}
(OUT/'manifest.json').write_text(json.dumps({'status':'failed-candidate-not-promoted','files':records,'repositoryScriptIdentities':{str(p.relative_to(ROOT)).replace('\\','/'):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [ROOT/'scripts/m1-assets'/name for name in ['qa-skirt-front-fixed.cjs','capture-skirt-front.cjs','qa-skirt-front-triangles.mjs','compare-skirt-front-closed-loop.py','classify-skirt-front-crossings.py','install-skirt-front-candidate.py','package-skirt-front-closed-loop.py']]}},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'out':str(OUT),'files':len(records),'bytes':sum(v['bytes']for v in records.values())}))
