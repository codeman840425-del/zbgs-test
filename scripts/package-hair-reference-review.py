"""Archive the bounded reference-frame comparison without retiming either movie."""
from pathlib import Path
import hashlib, json, math, subprocess, tempfile
import imageio_ffmpeg
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/m2-hair-reference-review-v1'
CASES=[('before','m2-hair-reference-room-785-before','785be36def90','23c1140a01d26b6f1c10ac4f8064f366add3ba17'),
       ('after','m2-hair-reference-room-106-after','1067d6618775','1447d994774e3e22157b38e20422579b508f28dc')]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
OUT.mkdir(exist_ok=True)
summary={'visualAcceptance':'pending','scope':'Single reference candidate, original female only, ordinary computer untested','cases':[]}
html=['<!doctype html><meta charset="utf-8"><title>长发参考系对照</title><style>body{max-width:1440px;margin:24px auto;font:16px/1.65 sans-serif;background:#f4f3ec;color:#253d37;padding:16px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}video,img{width:100%}section{min-width:0}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><h1>长发参考系：一次有界候选对照</h1><p>相同原女性、裤装、无帽、走跑与侧面坐起，原片默认1×，加载时间不同，不强行对齐帧号。</p><p>新候选只改变头发动态计算的参考节点；保留原模型、重力和碰撞。减少头部运动惯性是实际取舍，不能仅以发梢不上甩认定自然度通过。椅背接触局部折弯仍需观察。本次不修改已封板裙装和舞蹈，也不代表派生身体或帽子适配通过。</p><div class="pair">']
for tag,folder,build,commit in CASES:
    room=ROOT/'evidence'/folder;r=json.loads((room/'report.json').read_text(encoding='utf-8'))
    assert r['status']=='technical-checks-passed-visual-pending' and not r['errors']
    assert r['identity']['runtimeBuild']['shortId']==build and r['identity']['servedBuild']['shortId']==build
    assert r['identity']['primary']['actualSha256']=='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
    values=[s['tails'][-1][1]-s['tails'][0][1] for s in r['samples'] if s['phase']=='sit']
    row={'tag':tag,'build':build,'sourceCommit':commit,'reportSHA256':sha(room/'report.json'),'movieSHA256':sha(room/'normal1x.webm'),'fit':r['loaded']['hairFit'],'simulationFrame':r['loaded']['hairDynamics']['simulationFrame'],'maxTipRelativeFirstChildMeters':max(values),'sampleIntervalMs':100,'sheets':[]}
    summary['cases'].append(row)
    html.append(f'<section><h2>{"旧参考" if tag=="before" else "新候选"} · {build}</h2><p>源码 {commit}</p><video controls playsinline preload="metadata" src="../{folder}/normal1x.webm"></video><p><a href="../{folder}/report.json">原始数据</a> · <a href="../{folder}/recipe.json">精确配方</a></p><img src="../{folder}/seated.png" alt="坐稳参考"></section>')
    with tempfile.TemporaryDirectory(prefix='hair-reference-') as temp:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-threads','2','-filter_threads','2','-i',str(room/'normal1x.webm'),'-vf','fps=2:start_time=0,scale=720:-2','-threads','2',str(Path(temp)/'%06d.jpg')],check=True)
        frames=sorted(Path(temp).glob('*.jpg'));assert frames
        for start in range(0,len(frames),12):
            chunk=frames[start:start+12]
            with Image.open(chunk[0]) as im: height=im.height+24
            sheet=Image.new('RGB',(1440,math.ceil(len(chunk)/2)*height),'#eee');draw=ImageDraw.Draw(sheet)
            for i,f in enumerate(chunk):
                x,y=i%2*720,i//2*height;draw.text((x+5,y+5),f'{build} {(start+i)/2:.1f}s',fill='black')
                with Image.open(f) as im:sheet.paste(im,(x,y+24))
            name=f'{tag}-{start//12:02}.jpg';sheet.save(OUT/name,quality=87);row['sheets'].append({'file':name,'frames':len(chunk),'sha256':sha(OUT/name)})
html.append('</div><p><a href="summary.json">身份、采样范围与哈希</a></p>')
for row in summary['cases']:
    html.append('<details><summary>'+row['tag']+' 全时段2fps抽帧</summary>')
    for sheet in row['sheets']:html.append(f'<img loading="lazy" src="{sheet["file"]}" alt="{sheet["file"]}">')
    html.append('</details>')
(OUT/'index.html').write_text(''.join(html),encoding='utf-8')
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'out':str(OUT),'cases':[{'build':r['build'],'sheets':len(r['sheets'])}for r in summary['cases']]}))
