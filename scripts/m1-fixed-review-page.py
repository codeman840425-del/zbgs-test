"""Build a local review index from already archived fixed evidence only."""
import argparse,html,json,pathlib
p=argparse.ArgumentParser();p.add_argument('build');a=p.parse_args();root=pathlib.Path(__file__).resolve().parents[1];folder=root/'evidence'/('fixed-'+a.build)
manifest=json.loads((folder/'manifest.json').read_text(encoding='utf8'));cards=[]
for row in manifest['files']:
 rel=row['file']
 if not rel.endswith('.webm'):continue
 label=html.escape(rel)
 cards.append(f'<section><h2>{label}</h2><video controls preload="metadata" src="{html.escape(rel,quote=True)}"></video><p>保留完整录制，默认正常速度1×。技术编排样件不等于正式舞蹈。程序与视觉结论见能力清单。</p></section>')
text=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>角色候选 {a.build}</title><style>body{{font:16px/1.7 system-ui;background:#edf1f3;color:#182b36;max-width:1280px;margin:28px auto;padding:0 20px}}section{{background:white;border-radius:10px;margin:20px 0;padding:18px}}h2{{font-size:18px;overflow-wrap:anywhere}}video{{width:100%;max-height:780px;background:#18202b}}a{{color:#005c91}}.notice{{border-left:5px solid #a45a00;background:#fff6df;padding:14px}}nav{{display:flex;gap:24px;flex-wrap:wrap}}</style><h1>角色固定候选 · {a.build}</h1><nav><a href="http://127.0.0.1:4191/">打开当前固定演示</a><a href="http://127.0.0.1:4191/?body=male">打开男性候选</a><a href="/docs/CAPABILITIES.md">能力清单</a><a href="/docs/CURRENT-FOUNDATION.md">当前交接</a><a href="manifest.json">证据版本及SHA</a></nav><p class="notice">这是技术候选，M1整体未宣布通过。裙摆硬折、局部接触和正式表演自然度等限制请查看能力清单。普通电脑尚未实测，开发机性能不能替代目标设备。近景用于技术审查，画风待产品确认。</p><p>页面录像绑定上述构建；打开演示后请核对页面构建编号。旧失败与新候选分目录保存，不能将旧录像当新版本通过。</p>{''.join(cards)}</html>'''
(folder/'index.html').write_text(text,encoding='utf8');print(folder/'index.html')
