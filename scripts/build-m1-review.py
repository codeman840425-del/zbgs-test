"""Build a local review page from the fixed M1 recording set; no network writes."""
from pathlib import Path
import json, html, argparse

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('build');args=parser.parse_args()
build=args.build
if not build.isalnum(): raise ValueError('Invalid fixed build ID')
missing=[]
out=ROOT/'output/m1-review';out.mkdir(parents=True,exist_ok=True)
base=f'/evidence/{build}/review-media' if (ROOT/f'evidence/{build}/review-media').is_dir() else f'/output/playwright/m1/{build}'
before=base+'/before-712-normal-side.webm' if base.startswith('/evidence/') else '/output/playwright/m1/7127534d2536/walk/normal-side.webm'
def video(url):
 if not (ROOT/url.lstrip('/')).is_file(): missing.append(url)
 return f'<video controls playsinline preload="metadata" src="{url}"></video>'
parts=[f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>M1A 女性候选 · {build}</title>
<style>body{{max-width:1300px;margin:24px auto;padding:20px;font:16px system-ui;background:#f4f4ec;color:#293b36}}p{{line-height:1.6}}video,img{{width:100%;background:#d9e3d6}}section{{margin:24px 0}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}a{{color:#186650}}@media(max-width:700px){{.pair{{grid-template-columns:1fr}}}}</style>
<h1>M1A 女性候选 · {build}</h1><p><a href="http://127.0.0.1:4191/">打开固定版本房间</a> · <a href="http://127.0.0.1:4191/?turnLegacy">同人体旧转身算法</a> · <a href="http://127.0.0.1:4180/">旧人物对照</a></p>
<p>新完整人体、独立及膝裤和裙装。技术候选，最终画风及动作观感待你判断。裙装是针对这套裙的姿态约束修正，没有通用布料、自碰撞或多体型能力；侧摆仍偏硬。除明确标注的失败基线外，本页修复录像均来自标题所列固定构建；正常速度、不插帧。M1B男性目前只有选型和静态核查；跑步、站坐讲话与持麦尚未接入，通用基础尚未完成。裙边接触及自然度仍有缺陷，开发机裙坐帧耗时中位约19.6ms，尚非稳定60帧。</p>
<h2>正常游戏镜头：裙装走停、转身、坐起与短舞</h2>
{video(base+'/normal-room/chain/same-camera-chain.webm')}
<h2>近景检查：基础人体 → 裤装 → 裙装</h2>
<p>每套依次走停、转身、走向椅子、坐稳、起身、再次行走、短舞蹈、恢复站立。基础模式保留真实身体比例与蒙皮，只更换中性诊断材质。</p>''',video(base+'/chain/same-camera-chain.webm'),'<h2>换向响应对照</h2><div class="pair">']
for name,label in [('legacy-180-reselect','旧转身策略'),('new-180-reselect','新转身策略')]:
 parts.append(f'<section><h3>{label} · 同一新人体</h3>'+video(base+f'/turn/{name}.webm')+'</section>')
parts.append('</div><h2>同条件行走修复前后</h2><p>同一新人体、基础模式、0.85 m/s、相同路径和侧面镜头。712版本曾出现甩腿，保留失败录像；不以旧人体的正常步态替代新人体检查。</p><div class="pair">')
parts.append('<section><h3>失败基线 7127534d2536</h3>'+video(before)+'</section>')
parts.append('<section><h3>本次修复 '+build+'</h3>'+video(base+'/walk-baseline-match/normal-side.webm')+'</section>')
parts.append('</div><h2>裤装连续行走：至少三个步态周期及起停</h2><div class="pair">')
for name,label in [('normal-front','正常速度 · 正面'),('normal-side','正常速度 · 侧面'),('slow-side','慢走 · 侧面'),('fast-side','快走 · 侧面')]:
 parts.append(f'<section><h3>{label}</h3>'+video(base+f'/walk/{name}.webm')+'</section>')
parts.append('</div><h2>实际房间中的画风与表情候选</h2><p>脸、蓝色短发和制服上衣来自候选资产；及膝裤为本轮生成，裙子保留源拓扑与贴图并加入坐姿修正。外貌尚未最终确认。</p><div class="pair">')
for outfit in ['pants','skirt']:
 for view in ['front','side','back']:
  if not (ROOT/(base.lstrip('/')+f'/style/{outfit}-{view}.png')).is_file(): missing.append(f'{outfit}-{view}.png')
  parts.append(f'<section><img src="{base}/style/{outfit}-{view}.png" alt="{outfit} {view}"></section>')
parts.append('</div>'+video(base+'/style/style-and-face.webm')+'<div class="pair">')
for face in ['neutral','happy','aa']:
 if not (ROOT/(base.lstrip('/')+f'/style/face-{face}.png')).is_file(): missing.append(f'face-{face}.png')
 parts.append(f'<section><img src="{base}/style/face-{face}.png" alt="表情 {face}"></section>')
parts.append('</div><p>本轮性能来自 Ryzen 9 9950X3D + RTX 4090；普通电脑参考配置尚未实机测量。数值检查和技术完成状态见仓库 docs/M1-ROOM.md、M1-QA.md；这里的连续录像用于观感判断。</p></html>')
if missing: raise FileNotFoundError('Missing recordings: '+', '.join(missing))
(out/'index.html').write_text('\n'.join(parts),encoding='utf-8',newline='\n')
print(out/'index.html')
