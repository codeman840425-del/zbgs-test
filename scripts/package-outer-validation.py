"""Package already recorded fixed-build evidence; never re-encode or relabel films."""
import hashlib,json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/m2-outer-runtime-room-8e2-v1'
BUILD='8e2926da4939'
def read(p): return json.loads(p.read_text(encoding='utf-8'))
reports={name:read(ROOT/'evidence'/name/'report.json') for name in [
 'm2-outer-runtime-room-8e2-v1','m2-outer-runtime-close-8e2-v1','m2-outer-body-switch-8e2-v1']}
assert all(r['build']==BUILD for r in reports.values())
assert reports['m2-outer-body-switch-8e2-v1']['status']=='passed'
assert all(c['status']=='technical-checks-passed-visual-pending' for r in list(reports.values())[:2] for c in r['cases'])
movies=[('房间镜头：外搭＋长裤','outfit-3/normal1x.webm'),
 ('房间镜头：外搭＋短裤','outfit-4/normal1x.webm'),
 ('全身正面检查：外搭＋短裤','../m2-outer-runtime-close-8e2-v1/outfit-4/normal1x.webm'),
 ('男女切换与恢复已存造型','../m2-outer-body-switch-8e2-v1/normal1x.webm')]
receipt={'build':BUILD,'sourceCommit':'a74090f1ed704a6c5b2eea3122b3e6fe5f44cd93',
 'authorExportSHA256':'0631cf9d1ec297e8504d5ed73f5e1325d3154be9de09906bb6e7131488e89330',
 'scope':'Original male only; original top+shoes and declared long pants/shorts. Skinning, no added cloth solver or new body mask.',
 'technical':'Actual exported asset, configured looks, old84b recipe restore, new recipe roundtrip, base/dressed and male-female-male cleanup passed; walk/run/turn/sit/stand/technical dance state chains completed.',
 'engineeringVisual':{'method':'Root inspected all 2fps full-duration sheets for long-pants room and shorts front-inspection recordings, plus standing front/side/back screenshots.',
 'observations':'No large detached panels, gross tearing or wall-hidden actor in inspected samples. Shoulder/armhole revised source is retained. Sparse sampling cannot exclude between-sample clipping or establish continuous naturalness.',
 'status':'sampled-review-only; continuous human acceptance pending'},
 'limitations':['Not all-frame collision measurement.','Not user approval of garment style or continuous animation.','No ordinary-PC or sustained resource-cost test.','OnePiece, garment-to-garment coverage and arbitrary changed-body fit remain unverified.','Frozen female skirt and Rokoko dance unchanged.'],
 'rebuild':{'report':'../m2-outer-camera-rebuild-8e2/report.json','matchingFiles':127},'movies':[]}
for label,relative in movies:
 p=OUT/relative;raw=p.read_bytes()
 receipt['movies'].append({'label':label,'path':relative,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'playbackRate':1})
(OUT/'engineering-review.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
articles=''.join(f'<article><h2>{label}</h2><video controls preload="metadata" src="{relative}"></video></article>' for label,relative in movies)
html=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>男性外搭运行检查 · {BUILD}</title>
<style>body{{font:16px/1.6 system-ui;max-width:1440px;margin:24px auto;padding:20px;background:#eef1ef;color:#20322a}}article{{background:white;padding:18px;margin:20px 0}}video{{width:100%;max-height:900px}}a{{color:#12634a}}</style>
<h1>男性外搭运行检查 · {BUILD}</h1><p>实际可编辑源导出，原男性＋原上衣＋独立外搭，分别配长裤和短裤。四段均为正常1倍速，保留完整加载与动作过程。</p>
<p>已检查游戏加载、配方恢复、男女切换清理和动作状态。工程检查为全时段2fps抽帧，未在抽样中发现明显裂面；不能代替连续观看验收。普通电脑性能未测，连体装、衣层遮挡及变体身体尚不在此样件通过范围。</p>
<p><a href="http://127.0.0.1:4207/?body=male&amp;workbench=appearance">打开固定候选，选择“外搭＋长裤／短裤”</a> · <a href="../m2-outer-runtime-room-3c7-v1/">保留的旧版检查镜头遮挡失败</a></p>
{articles}<p><a href="engineering-review.json">精确身份与检查范围</a> · <a href="report.json">运行记录</a></p></html>'''
(OUT/'index.html').write_text(html,encoding='utf-8')
print(json.dumps({'build':BUILD,'movies':len(movies),'index':str(OUT/'index.html')}))
