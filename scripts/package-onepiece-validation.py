"""Package exact recorded onePiece evidence without relabelling source or films."""
import hashlib,json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/m2-onepiece-room-ae3-v1'
BUILD='ae36ee9f440f'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
reports=[read(ROOT/'evidence'/name/'report.json') for name in [
    'm2-onepiece-room-ae3-v1','m2-onepiece-front-ae3-v1','m2-onepiece-switch-ae3-v1']]
assert all(r['build']==BUILD for r in reports)
assert reports[-1]['status']=='passed'
assert all(c['status']=='technical-checks-passed-visual-pending' for r in reports[:2] for c in r['cases'])
rebuild=read(ROOT/'evidence/m2-onepiece-fixed-rebuild-contact/report.json')
assert rebuild['status']=='passed' and rebuild['rebuiltBuild']['shortId']==BUILD
movies=[('房间视角 · 完整走跑、转身、坐起和短动作','outfit-5/normal1x.webm'),
        ('正面检查 · 同一动作链','../m2-onepiece-front-ae3-v1/outfit-5/normal1x.webm'),
        ('男女切换后恢复连体造型','../m2-onepiece-switch-ae3-v1/normal1x.webm')]
receipt={'build':BUILD,'sourceCommit':rebuild['commit'],
    'sourceAuthorCommit':'340371e8f50c0267792bbe1e081547b49b92be0b',
    'assetSha256':'e0cac5041a50bc07dde65c75414f98bab1501125939302eec0b9e1a5de826c7b',
    'scope':'Exact original male 62b44b + independent onePiece + original shoes; complete body retained. No other body fit certified.',
    'technical':'Source edit and repeated export, exact source/runtime identity, independent skin/bind review; old uniform/new onePiece recipe roundtrip, full body position/index unchanged, base/dressed, body replacement cleanup, normal-speed walk/run/turn/sit/stand/technical-dance completion checked.',
    'seat':{'calibrationBuild':'80ee764643a1','zeroLiftGapMetres':0.004410266883092762,
        'tenMmLiftGapMetres':0.011842540653804912,'chosenExtraLiftMetres':0,
        'limits':'Actual animated vertices versus local chair boxes at seated sample; not all-triangle or entire-transition collision proof.'},
    'engineeringVisual':{'method':'Root reviewed all 2fps full-duration room/front sheets and full-size front/side/back/seated stills.',
        'observations':'No conspicuous detached torso/legs or large exposed tear in the inspected samples. Flat technical material and close crotch/underarm folds retained.',
        'status':'sampled review only; full 1x films available; user visual acceptance not claimed'},
    'limitations':['Only original male proportions, skinning-only garment.','Source has 44 body intersection pairs, 368 self pairs and about 1.576mm sampled nearest-normal penetration; not zero-clipping certification.',
        'No ordinary-PC or sustained performance acceptance.','No arbitrary changed-body fit or garment-layer masking acceptance.','Frozen female skirt and 30-second dance untouched.'],
    'rebuild':{'report':'../m2-onepiece-fixed-rebuild-contact/report.json','matchingFiles':rebuild['matchingFiles']},
    'movies':[]}
for title,relative in movies:
    raw=(OUT/relative).read_bytes()
    receipt['movies'].append({'title':title,'path':relative,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'playbackRate':1})
(OUT/'delivery.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
articles=''.join(f'<article><h2>{title}</h2><video controls preload="metadata" src="{relative}"></video></article>' for title,relative in movies)
(OUT/'index.html').write_text(f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>真实连体服运行 · {BUILD}</title><style>body{{font:16px/1.6 system-ui;max-width:1440px;margin:24px auto;padding:20px;background:#eef1ef;color:#20322a}}article{{padding:18px;background:white;margin:20px 0}}video{{width:100%;max-height:900px}}a{{color:#12634a}}</style>
<h1>独立连体练功服 · {BUILD}</h1><p>胸、腰胯和双腿是连续的新制衣物。保留完整身体，沿原动作系统播放；不是把旧上衣和短裤改名合并。</p>
<p>换装与配方恢复、男女切换清理和代表动作状态检查已完成。源裆部和腋下局部折返保留；工程画面检查为全时段抽帧，不能替代连续观感验收。普通电脑性能未测。</p>
<p><a href="http://127.0.0.1:4207/?body=male&workbench=appearance">打开固定候选</a>，在服装区选“短袖连体练功服”。公开4196仍保留原版本。</p>
{articles}<p><a href="delivery.json">版本与检查范围</a> · <a href="report.json">运行记录</a> · <a href="../m2-onepiece-seat-80e-v1/report.json">独立坐面校准</a></p></html>''',encoding='utf-8')
print(json.dumps({'build':BUILD,'movies':len(movies),'index':str(OUT/'index.html')}))
