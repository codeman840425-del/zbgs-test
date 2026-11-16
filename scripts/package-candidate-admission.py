"""Publish existing fixed-browser evidence and its actual machine-readable outputs."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/m2-candidate-admission-browser-086-v1'
report=json.loads((OUT/'report.json').read_text(encoding='utf-8'))
assert report['build']=='086c5e904d5b' and report['status']=='passed'
movie=OUT/'normal1x.webm'
receipt={'build':report['build'],'sourceCommit':'e53bfa3047c9808a2d288fe7f3211e2cfab46617',
 'scope':'Existing same-base v6 options and exact resource identities; static metadata admission only.',
 'technical':'Real male/female query/default roundtrip, wrong mouth/brow identity refused before network/revision changes, unknown parameter refusal, query during real pending load, corrupted real bytes refused during preparation.',
 'engineeringVisual':'Root reviewed complete 2fps filmstrip of current male mouth application/speech/restore. No obvious new face tears in sampled frames; does not reaccept all animation or certify new shape fits.',
 'environment':report['environment'],'rebuild':{'matchingFiles':127,'report':'../m2-candidate-admission-fixed-rebuild-086/report.json'},
 'movie':{'file':'normal1x.webm','sha256':hashlib.sha256(movie.read_bytes()).hexdigest(),'playbackRate':1},
 'limitations':['No arbitrary-shape fit admission.','Existing configured equipment sets only; onePiece and garment-layer coverage still missing.','No new appearance parameters or ordinary-PC performance acceptance.'],
 'api':{'query':'queryAppearanceCandidates(controller)','admit':'admitAppearanceCandidate(controller, record)','apply':'importAppearanceRecipe(controller, JSON.stringify(record))'}}
(OUT/'delivery.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'index.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>候选查询与准入 · 086c5e904d5b</title>
<style>body{font:16px/1.6 system-ui;max-width:1440px;margin:24px auto;padding:20px;background:#eef1ef;color:#20322a}video{width:100%;max-height:900px}a{color:#12634a}</style>
<h1>候选查询与准入 · 086c5e904d5b</h1><p>agent现在可以查询当前人物已有参数、准确资源版本和装备组合。错误版本、未实现字段提前拒绝，查询不会取消正在加载的造型。</p>
<p>下方为固定版实际运行原始1倍速录像：错误请求保持原脸；正确嘴宽样件加载、讲话并恢复。正常动作与画风未作新增调整，技术检查范围不等于完整M2通过。</p>
<video controls preload="metadata" src="normal1x.webm"></video>
<p><a href="http://127.0.0.1:4207/?workbench=appearance">打开当前固定候选</a> · <a href="male-catalog.json">实际男性查询结果</a> · <a href="female-catalog.json">实际女性查询结果</a> · <a href="report.json">运行检查</a> · <a href="delivery.json">版本与限制</a></p>
<p>参数与编号正确后仍需核验真实文件、网格、权重和绑定。新增体型适配、连体服与衣层遮挡、完整生产记录和按需加载仍未完成。普通电脑性能未测。</p></html>''',encoding='utf-8')
print(json.dumps({'build':report['build'],'checks':len(report['checks']),'index':str(OUT/'index.html')}))
