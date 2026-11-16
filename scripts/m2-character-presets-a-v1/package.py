"""Package the one frozen selection. Does not modify source images or recipes."""
import json,html,hashlib,argparse,base64
from pathlib import Path
from PIL import Image,ImageDraw
ap=argparse.ArgumentParser();ap.add_argument('evidence');args=ap.parse_args();root=Path(args.evidence)
spec=json.loads((root/'static-2/selection.json').read_text(encoding='utf-8'))
report=json.loads((root/'static-2/report.json').read_text(encoding='utf-8'))
views=['none-front','none-side','none-diagonal','original-front','original-side','original-room']
labels={'none-front':'无发 · 正面','none-side':'无发 · 侧面','none-diagonal':'无发 · 三分之四','original-front':'原短发 · 正面','original-side':'原短发 · 侧面','original-room':'原短发 · 实际房间镜头'}
names={'baseline':'原始几何','a':'窄嘴 / 眼裂组合','b':'宽嘴 / 眉鼻组合'}
(root/'sheets').mkdir(exist_ok=True)
for sex in spec['bodies']:
 for view in views:
  folder='room-36' if view.endswith('room') else 'static-2'
  images=[Image.open(root/folder/f'{sex}-{s}-{view}.png').convert('RGB') for s in names]
  # Full original frames are scaled equally, never independently cropped/warped.
  w=700;h=round(images[0].height*w/images[0].width);sheet=Image.new('RGB',(3*w,h+32),'#f3f0e9');draw=ImageDraw.Draw(sheet)
  for i,(s,img) in enumerate(zip(names,images)):
   draw.text((i*w+12,8),sex+' / '+s+' / '+view,fill='black');sheet.paste(img.resize((w,h)),(i*w,32))
  sheet.save(root/'sheets'/f'{sex}-{view}.png')
(root/'recipe-download').mkdir(exist_ok=True)
cases=[]
for row in report['cases']:
 encoded=base64.b64encode((root/'static-2'/row['recipe']).read_bytes()).decode('ascii')
 script='recipe-download/'+row['id']+'.js'
 (root/script).write_text('window.__recipeFiles=window.__recipeFiles||{};window.__recipeFiles['+json.dumps(row['id'])+']='+json.dumps(encoded)+';',encoding='utf-8')
 cases.append({'id':row['id'],'recipe':row['recipe'],'downloadData':script})
data={'samples':[{'id':x['id'],'reason':x['reason']}for x in spec['samples']],'cases':cases,'names':names,'views':labels}
page='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>现有四域一次选样 · 男女对照</title>
<style>body{font:16px/1.6 system-ui;background:#f4f1e9;color:#182c31;margin:24px auto;max-width:1800px;padding:0 20px}h1{margin-bottom:8px}button,select,a.button{font:inherit;padding:9px 15px;margin:5px;border:1px solid #819a93;border-radius:6px;background:white;color:#183b32}a{color:#126356}.notice{background:#fff2d1;padding:16px;border-left:5px solid #b77a25}.controls{position:sticky;top:0;background:#f4f1e9;z-index:1;padding:8px}article{background:white;padding:14px;border-radius:9px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}img,video{width:100%;height:auto}small{display:block;color:#526368}section{margin:24px 0}#large img{max-height:85vh;width:auto;max-width:100%}dialog{max-width:96vw;max-height:96vh;border:0;border-radius:10px;background:#f4f1e9}details{margin-top:16px}#movies{display:block}#movies article{max-width:1400px;margin:24px auto}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #174f80;outline-offset:3px}button[aria-pressed=true]{background:#dcece5;border:2px solid #2e7058}code{word-break:break-all} @media(max-width:900px){main{grid-template-columns:1fr}}</style>
<h1>原男女容貌：一次受限组合对照</h1>
<div class="notice"><b>近景可辨局部嘴宽与眉鼻差异；正常房间尺度不足以看成不同人物。</b><br>这是已有算子的两套组合，不是新脸型、年龄库或六名新主播。颜色完全统一，不计作本体变化。当前仅供观看比较，画风仍由用户选择。</div>
<p>固定版本 <b>0fb420e5b124</b> · 原女 / 原男 · 选样一次 · 无新增算子或素材。短发是各基模原有 <code>original</code> 短发，统一染黑；棕色虹膜、原肤色与原唇色。无发图保留真实头皮、眉、睫毛。</p>
<div class="controls"><span>基模 </span><button data-select-sex="female" aria-pressed="true">女性原版</button><button data-select-sex="male" aria-pressed="false">男性原版</button><label>镜头 <select id="view"></select></label><button id="openwork">打开对应工作台</button></div>
<main id="cards"></main>
<section><h2>实际配方与恢复</h2><p>每份文件均由真实工作台“下载配方”生成，随后在无 localStorage 的干净上下文，通过“读取配方”恢复。进入对应原版身体的工作台，读取下方文件即可；配方包含精确资源与几何版本，不包含动作、镜头或账户。</p><p>静态近景为固定相机同姿审查，房间图使用实际 36° 投影和既有房间外参。相同基模的骨骼、时钟、光照、中性表情与相机逐值核对。不同基模肤色纹理本来不同，本单只保证相同选项，不假装换了同一个身体。</p></section>
<section><h2>正常速度表情 / 注视 / 招手</h2><p>每条片段独立读取同一配方：自然眨眼 → 口型 A → 微笑讲话 → 左右注视 → 既有招手。视频保留加载与操作原片，默认定位到末尾约 20 秒；完整过程可拖回查看。技术通过不代表所有表情风格已获接受。</p><main id="movies"></main></section>
<details><summary>参数、限制与证据</summary><p>A：嘴宽 −12%、眼裂宽 +5%，眉鼻原位。B：嘴宽 +12%、眉高及每侧眉距各 +3mm、鼻尖突出 +2mm，眼原位。没有扩大连续范围。</p><p>旧 static-1 因节点顺序断言失败保留；static-2 的初版 45° room 图不作为真实房间证据，最终仅引用 room-36。live-1 按钮文本、live-2 口型权重断言错误均保留，未调整样件。正常口型 A 源权重为 0.65。</p><p><a href="RESULT.md">结论与复跑</a> · <a href="static-2/report.json">静态 / 六文件回读</a> · <a href="room-36/report.json">房间补图</a> · <a href="live-3/report.json">正常速度原始报告</a></p></details>
<dialog id="large"><button onclick="this.parentElement.close()">关闭大图</button><div></div></dialog>
<script>const data=DATA;let selectedSex='female';const view=document.querySelector('#view');for(const[k,v]of Object.entries(data.views)){const o=document.createElement('option');o.value=k;o.textContent=v;view.append(o)}function render(){document.querySelectorAll('#movies video').forEach(v=>v.pause());const s=selectedSex,v=view.value,folder=v.endsWith('room')?'room-36':'static-2';document.querySelector('#cards').innerHTML=Object.entries(data.names).map(([k,n])=>`<article><h2>${n}</h2><a class="zoom" href="${folder}/${s}-${k}-${v}.png"><img src="${folder}/${s}-${k}-${v}.png" alt="${n} ${data.views[v]}"></a><small>点图放大 · 同姿与同色对照</small><p><a download href="static-2/recipes/${s}-${k}.v5.json">下载实际 v5 配方</a></p><small>${data.samples.find(x=>x.id===k).reason}</small></article>`).join('');document.querySelector('#movies').innerHTML=Object.entries(data.names).map(([k,n])=>`<article><h3>${n}</h3><video controls preload="metadata" src="live-3/${s}-${k}-live-1x.webm"></video><small>正常 1× 原片，未重定时</small></article>`).join('');document.querySelectorAll('video').forEach(x=>x.onloadedmetadata=()=>{x.playbackRate=1;if(Number.isFinite(x.duration))x.currentTime=Math.max(0,x.duration-20)});document.querySelectorAll('#cards a[download]').forEach((a,i)=>a.onclick=async e=>{e.preventDefault();const row=data.cases.find(x=>x.id===s+'-'+['baseline','a','b'][i]);if(!window.__recipeFiles?.[row.id])await new Promise((resolve,reject)=>{const js=document.createElement('script');js.src=row.downloadData;js.onload=resolve;js.onerror=reject;document.head.append(js)});const blob=new Blob([Uint8Array.from(atob(window.__recipeFiles[row.id]),c=>c.charCodeAt(0))],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=s+'-'+['baseline','a','b'][i]+'.v5.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});document.querySelectorAll('.zoom').forEach(a=>a.onclick=e=>{e.preventDefault();const d=document.querySelector('#large');d.querySelector('div').innerHTML=`<img src="${a.href}" alt="完整原图">`;d.showModal()})}document.querySelectorAll('[data-select-sex]').forEach(b=>b.onclick=()=>{selectedSex=b.dataset.selectSex;document.querySelectorAll('[data-select-sex]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()});view.onchange=render;document.querySelector('#openwork').onclick=()=>window.open('http://127.0.0.1:4196/?workbench=appearance&body='+selectedSex,'_blank','noopener');render();</script>'''
page=page.replace('DATA',json.dumps(data,ensure_ascii=False).replace('</','<\\/'))
(root/'index.html').write_text(page,encoding='utf-8')
print('12 full-frame comparison sheets and evidence entry prepared')
