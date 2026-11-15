import json,pathlib,hashlib,html
P=pathlib.Path(__file__).resolve().parent
stats={}
sections=[]
for name in ['normal-a0dd','normal-bcade']:
 r=json.loads((P/name/'report.json').read_text(encoding='utf8'))
 t=json.loads((P/name/'trace.json').read_text(encoding='utf8'))
 rows=[x for x in t['rows'] if x['wall']>=0]; ds=sorted(x['dt'] for x in rows if x['dt'] is not None)
 wall=(rows[-1]['wall']-rows[0]['wall'])/1000;sim=rows[-1]['sim']-rows[0]['sim']
 stats[name]={'build':r['build'],'samples':len(rows),'wallSeconds':wall,'simulationSeconds':sim,'simWallRatio':sim/wall,'rafMs':{f'p{p}':ds[min(len(ds)-1,int((len(ds)-1)*p/100))]for p in [50,95,99]},'maxRafMs':max(ds),'over50ms':sum(x>50 for x in ds),'pageerrors':r['errors'],'resourcesAtSwitch':[{ 'name':c['name'],'renderer':c['value']['state']['renderer']}for c in r['checks']if isinstance(c.get('value'),dict)]}
 movie=f'{name}/{r["movie"]}'
 sections.append(f'<section><h2>{html.escape(name)} — {r["build"]}</h2><video controls preload="metadata" src="{movie}"></video><p><a href="{name}/report.json">原报告</a> · <a href="{name}/trace.json">轻量逐帧记录</a></p><details><summary>已工程查看的全时段 2fps 缩略图（非连续人工验收）</summary>'+''.join(f'<img loading="lazy" src="{name}/review/{i:03}.jpg">' for i in range(3))+'</details></section>')
(P/'summary.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf8')
(P/'index.html').write_text('''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>换人预编译：旧版与候选</title><style>body{font:17px system-ui;margin:24px auto;max-width:1400px;padding:0 18px;background:#f4f5f7;color:#17242c}video,img{width:100%;height:auto}section{background:white;padding:20px;margin:24px 0}button,summary{padding:14px;cursor:pointer}p{line-height:1.6}</style><h1>换人预编译：旧版与候选</h1><p>相同 1600×1000、半身正面镜头，正常时间播放，真实 UI 女性→男性→女性。两段是独立运行，包含各自初始加载时间，不是逐帧同姿同步对照。播放器保持 1×；点击可全屏。故障注入仅在独立事务测试，未用于这些录像。</p><p>候选定向事务通过；切换仍有长帧，不代表普通电脑性能或动作自然度验收。<a href="RESULT.md">范围与限制</a> · <a href="summary.json">数据摘要</a></p>'''+''.join(sections),encoding='utf8')
files=[]
for f in sorted(P.rglob('*')):
 if f.is_file() and f!=P/'manifest.json':files.append({'path':f.relative_to(P).as_posix(),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
(P/'manifest.json').write_text(json.dumps({'candidate':'bcade40d24f1','baseline':'a0dd7fb7bf4a','files':files},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(stats,ensure_ascii=False,indent=2))
