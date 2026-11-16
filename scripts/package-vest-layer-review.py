"""Reuse the project evidence-page layout; keep original unedited 1x films."""
import hashlib,html,json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BEFORE=ROOT/'evidence/m2-vest-layer-before-ed2-v2'
AFTER=ROOT/'evidence/m2-vest-layer-after-f82-v1'
OUT=ROOT/'evidence/m2-vest-layer-review-f82-v1'
reports=[json.loads((p/'report.json').read_text(encoding='utf-8')) for p in (BEFORE,AFTER)]
assert all(r['status']=='captured-visual-pending' and len(r['cases'])==6 for r in reports)
assert reports[0]['build']=='ed2153a2d822' and reports[1]['build']=='f82a7fc6de61'
labels={'female':'原女性基模','female-round-full-v2':'圆脸丰满候选','female-soft-wide-v2':'宽腰胯候选'}
rows=[];sections=[]
for name,label in labels.items():
 for view,title in [('room','正常房间镜头'),('inspect-half-front','近腰诊断镜头')]:
  media=[]
  for folder,caption in [(BEFORE,'修复前 · ed2153a2d822'),(AFTER,'修订候选 · f82a7fc6de61')]:
   film=folder/(name+'-'+view)/'normal1x.webm';data=film.read_bytes();row={'file':film.relative_to(ROOT).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()};rows.append(row)
   url='../'+film.relative_to(ROOT/'evidence').as_posix()
   media.append(f'<figure><figcaption>{caption}</figcaption><video controls playsinline preload="none" src="{url}"></video><a href="{url}">全尺寸打开原始录像</a></figure>')
  sections.append(f'<section><h2>{html.escape(label)} · {title}</h2><div class="pair">'+''.join(media)+'</div></section>')
OUT.mkdir(exist_ok=True)
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>腰部修订 · 原速对照</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:1600px;margin:24px auto;padding:0 20px;color:#222;background:#f8f8f6}a{color:#175a96}h1,h2{line-height:1.25}video{width:100%;background:#222}figure{margin:0}.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,640px),1fr));gap:16px}.notice{background:#fff0d7;padding:12px}section{margin:32px 0}</style><body><h1>腰部修订 · 同镜头 1× 对照</h1><p>同一身体、镜头、路径、走跑速度与动作链；右侧只改上衣层间适配和明确的身体覆盖区域。原身体、裤装及动作保留。</p><p class="notice">本页不是整套 M2 通过声明。请看跑步和坐起时腹前露面、裤腰绿点，以及是否新增衣物边界缺面。脸型、原上衣轮廓、已封存裙装及舞蹈限制仍保留。普通电脑未实测。</p><p>均为完整未剪辑录像，默认 1×。加载起点各自独立，不声称逐帧同步；可用原始录像或全屏查看细节。慢放仅作定位辅助。</p><p><a href="../m2-vest-layer-before-ed2-v2/report.json">修复前运行记录</a> · <a href="../m2-vest-layer-after-f82-v1/report.json">修订候选运行记录</a> · <a href="../m2-vest-layer-outfit-f82-v1/report.json">换装与旧配方恢复</a> · <a href="summary.json">文件身份</a></p>'''+''.join(sections)+'''<script>document.querySelectorAll('video').forEach(v=>v.playbackRate=1);</script></body></html>'''
(OUT/'index.html').write_bytes(page.encode())
(OUT/'summary.json').write_bytes((json.dumps({'beforeBuild':reports[0]['build'],'afterBuild':reports[1]['build'],'afterSourceCommit':'71081be29b5fee7dc5e6d6fbcc17b9b4c65d4b9d','files':rows,'visualAcceptance':'pending','humanAcceptance':'not requested yet','scope':'Three exact bodies; pants-only layer revision. No frozen skirt change.'},ensure_ascii=False,indent=2)+'\n').encode())
print(OUT)
