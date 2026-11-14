"""Local review artifact for the frozen asset-pipeline milestone."""
import html,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
out=ROOT/'output/foundation-review';out.mkdir(parents=True,exist_ok=True)
report=json.loads((ROOT/'output/playwright/new-garment/report.json').read_text(encoding='utf8'))
build=report['buildInfo']['shortId']
walk=json.loads((ROOT/'output/playwright/new-garment-walk/report.json').read_text(encoding='utf8'))
assert all(r['build']['shortId']==build for r in walk['reports']), 'Do not mix video build IDs'
parts=[f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>角色生产流程·实际运行证据</title>
<style>body{{max-width:1300px;margin:24px auto;padding:20px;font:16px system-ui;background:#f4f4ec;color:#293b36}}p{{line-height:1.6}}video,img{{width:100%;background:#d9e3d6}}section{{margin:30px 0}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}a{{color:#186650}}</style>
<h1>角色生产流程 · {build}</h1><p><a href="http://127.0.0.1:4191/">进入新裤装房间</a> · <a href="http://127.0.0.1:4191/foundation.html">查看完整人体候选</a> · <a href="/output/review/">上轮修复对照</a></p>
<p>本轮是完整人体候选和独立服装接入的子里程碑。新裤仅适配旧对照角色；新人体尚未完成独立裤裙与足底/座位标定。录像正常速度，未做插帧。平均FPS和单张截图均不替代整段动作验收。</p>
<h2>新增及膝裤：走停、坐起、舞蹈、转身</h2><video controls preload="metadata" src="/output/playwright/new-garment/posture-transitions.webm"></video>
<p>约4秒的180°换向仍未通过响应验收；本轮没有改慢转逻辑。新裤完整动作可播放，不代表任意体型/服装已适配。</p><h2>同一新裤·连续行走</h2><div class="pair">''']
for name,label in [('normal-front','正常速度 · 正面'),('normal-side','正常速度 · 侧面'),('slow-side','慢走 · 侧面'),('fast-side','快走 · 侧面')]:
    parts.append(f'<section><h3>{label}</h3><video controls preload="metadata" src="/output/playwright/new-garment-walk/{name}.webm"></video></section>')
parts.append('</div><h2>原文件与保存的Blender工程再导出 · 同姿势</h2><p>表情、骨架和表面比较；不代表画风已最终确定，也未开发完整捏脸。左：原件；右：Blender再导出。</p>')
parts.append('<div class="pair">'+''.join(f'<section><h3>{label}</h3><video controls preload="metadata" src="/output/playwright/foundation-qualification/{build}/{origin}/qualification.webm"></video></section>' for origin,label in [('original','原文件 · 原地走与坐'),('roundtrip','再导出 · 相同动作')])+'</div>')
for pose in ['rest','walk','sit','blink','aa']:
    folder=ROOT/'output/playwright/foundation-roundtrip'/build
    if all((folder/f'{origin}-{pose}.png').exists() for origin in ['original','roundtrip']):
        parts.append('<div class="pair">'+''.join(f'<section><img src="/output/playwright/foundation-roundtrip/{build}/{origin}-{pose}.png" alt="{html.escape(origin+pose)}"></section>' for origin in ['original','roundtrip'])+'</div>')
parts.append('</html>')
(out/'index.html').write_text('\n'.join(parts),encoding='utf8')
print('http://127.0.0.1:4174/output/foundation-review/ — build '+build)
