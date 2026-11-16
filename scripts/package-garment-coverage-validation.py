"""Package exact-build garment coverage evidence without altering source reports."""
import argparse
import html
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--room', required=True)
p.add_argument('--back', required=True)
p.add_argument('--switch', required=True)
p.add_argument('--rebuild', required=True)
p.add_argument('--commit', required=True)
a = p.parse_args()
root = Path(__file__).resolve().parents[1]
load = lambda name: json.loads((root / name / 'report.json').read_text(encoding='utf-8'))
room, back, switch, rebuild = (load(n) for n in (a.room, a.back, a.switch, a.rebuild))
build = room['build']
assert back['build'] == switch['build'] == rebuild['rebuiltBuild']['shortId'] == build
assert switch['status'] == rebuild['status'] == 'passed' and rebuild['commit'] == a.commit
for report in (room, back):
    case = report['cases'][0]
    assert case['status'] == 'technical-checks-passed-visual-pending'
    assert case['equipment']['garmentCoverage']['hiddenFaces'] == 56
    assert case['completeTop']['count'] == 6012
out = root / a.room
delivery = {
    'build': build, 'sourceCommit': a.commit,
    'evidence': vars(a), 'candidateURL': 'http://127.0.0.1:4207/?body=male&workbench=appearance',
    'technical': 'Actual original male top/outer: 2004 original faces, 56 covered only when paired; exact original index restored on removal/base mode. Legacy and new recipe restore, body replacement, and representative action state checks passed.',
    'engineerVisualReview': 'All 2fps sheets across both complete 1x films and full-size front/back/seat stills inspected; no large new exposed holes seen in samples. This is sampling, not continuous human acceptance.',
    'limits': [
        'Only original male, exact top393a/outer0631 pair, shown outfit and motion range; not arbitrary garments or body variants.',
        'Back-view seat phase is partly occluded by the physical chair; no all-surface visual or triangle collision certification.',
        'Source garments retain their prior local fit limits; render masks do not fix invalid weight or geometric fit.',
        'Complete top geometry accessor is available; existing seat contact uses the Body mesh, not a new clothing collision system.',
        'Ordinary-PC performance and continuous human visual acceptance remain unverified.',
    ],
}
(out / 'delivery.json').write_text(json.dumps(delivery, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
back_name, switch_name = Path(a.back).name, Path(a.switch).name
page = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>衣层覆盖与恢复 · {html.escape(build)}</title>
<style>body{{font:16px/1.6 system-ui;max-width:1440px;margin:24px auto;padding:20px;background:#eef1ef;color:#20322a}}video{{width:100%;max-height:900px}}article{{background:white;padding:16px;margin:24px 0}}a{{color:#12634a}}</style>
<h1>外搭覆盖内层上衣 · {html.escape(build)}</h1>
<p>使用原男性、现有外搭与短裤。只在外搭与上衣同时穿着时隐藏背面已登记区域；卸下外搭、基础模式与换人后恢复原衣面。没有删除身体或改动步态。</p>
<p><a href="http://127.0.0.1:4207/?body=male&workbench=appearance">打开固定候选</a> · <a href="delivery.json">版本与验收范围</a> · <a href="report.json">实际运行记录</a></p>
<article><h2>当前房间镜头 · 完整1×动作链</h2><video controls preload="metadata" src="outfit-4/normal1x.webm"></video></article>
<article><h2>当前背面检查 · 完整1×动作链</h2><video controls preload="metadata" src="../{html.escape(back_name)}/outfit-4/normal1x.webm"></video></article>
<article><h2>换人并恢复已存外搭造型</h2><video controls preload="metadata" src="../{html.escape(switch_name)}/normal1x.webm"></video></article>
<article><h2>此前8e2房间镜头参考 · 未接入衣层遮挡</h2><video controls preload="metadata" src="../m2-outer-runtime-room-8e2-v1/outfit-4/normal1x.webm"></video></article>
<p>工程已检查全时段2fps抽帧与关键大图，抽样未见新大片露面。椅背遮住坐姿背面的一部分，本片不证明所有表面无穿插，也不代替连续人工观感验收。普通电脑性能未测。</p></html>'''
assert (root / 'evidence/m2-outer-runtime-room-8e2-v1/outfit-4/normal1x.webm').is_file()
(out / 'index.html').write_text(page, encoding='utf-8')
print(json.dumps({'build': build, 'page': str(out / 'index.html')}))
