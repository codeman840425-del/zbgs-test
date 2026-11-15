"""Event-align preserved source/F/M videos. No retiming, no source-video copy."""
from pathlib import Path
import gzip,hashlib,json,shutil
import av,numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'evidence/video-motion-room-5b78bbd34130'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
alignment={'schema':'event-time-alignment-v1','build':'5b78bbd34130','clip':'video-dance-support-v3','commonSeconds':[0,3.003],'sourceFrameInterval':[138,210],'sourceManifest':'../dance-video-pose-v1/source.json','source':{'media':'../../analysis/dance-reference-v1/5359146-original.mp4','offsetSeconds':138*1001/24000,'sha256':sha(ROOT/'analysis/dance-reference-v1/5359146-original.mp4')},'recordings':[],'limits':['Event-time alignment, not camera calibration. Trace t vs media firstPTS has about one encoded-frame uncertainty, not proven bound.','Source and target have different camera/framing. Early runtime blend-in is preserved.','All videos remain complete and unchanged, playbackRate1; source selected interval only.','Three-second partial sample does not complete the full30second task; support cleanup failed10mm gate.']}
for body in ('female','male'):
 p=OUT/f'{body}.trace.json.gz';trace=json.loads(gzip.decompress(p.read_bytes()))
 rows=[r for r in trace['frames'] if r['mode']=='dance' and r['motion']['dance']['id']=='video-dance-support-v3' and r['motion']['danceMix']>=.999 and 1.5<=r['motion']['dance']['time']<=2.5]
 assert len(rows)>=20
 offsets=np.array([r['t']/1000-r['motion']['dance']['time'] for r in rows]);offset=float(np.median(offsets))
 with av.open(str(OUT/f'{body}.webm')) as c:pts=np.array([float(f.pts*f.time_base) for f in c.decode(video=0)])
 alignment['recordings'].append({'id':body,'media':f'{body}.webm','trace':p.name,'offsetSeconds':offset,'fitSamples':len(rows),'fitRange':[1.5,2.5],'maxTraceResidualSeconds':float(abs(offsets-offset).max()),'medianEncodedFrameIntervalSeconds':float(np.median(np.diff(pts))),'maximumEncodedFrameIntervalSeconds':float(np.diff(pts).max()),'firstPTS':float(pts[0]),'lastPTS':float(pts[-1]),'mediaSha256':sha(OUT/f'{body}.webm'),'traceSha256':sha(p)})
(OUT/'alignment.json').write_text(json.dumps(alignment,indent=2),encoding='utf-8')
shutil.copy2(ROOT/'experiments/video-dance-support-v3-room/source-copy-receipt.json',OUT/'source-copy-receipt.json')
html='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>舞蹈支撑清理 v3 · 1× 对照</title>
<style>body{background:#15202b;color:#eef3f8;font:16px/1.5 system-ui;margin:24px}h1{font-size:24px}button{font:inherit;padding:10px 16px;margin:8px 8px 8px 0}a{color:#a8d7ff}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}video{width:100%;background:#000;aspect-ratio:16/10}input{width:100%}.warn{color:#ffd992}article{min-width:0}p{max-width:1200px}@media(max-width:800px){.grid{grid-template-columns:1fr}}</style>
<h1>原片 / 女性 / 男性 · 支撑清理 v3 · 正常 1×</h1>
<p class="warn">未通过支撑门：205 帧右脚仍悬空，补偿后女性约38mm、男性42mm。脚掌滚动与摩擦未恢复；仅73帧，不是30秒动作完成。</p>
<button id="play" disabled>共同播放 1×</button><button id="pause">暂停</button><button id="restart">重头播放</button><span id="status">加载中</span><input id="seek" type="range" min="0" max="3.003" step=".001" value="0">
<div class="grid"><article><h2>真人源片 · 138–210</h2><video id="source" muted playsinline preload="auto" src="../../analysis/dance-reference-v1/5359146-original.mp4"></video><a href="../../analysis/dance-reference-v1/5359146-original.mp4">完整原视频（内部参考）</a></article><article><h2>女性 · 5b78bbd34130</h2><video id="female" muted playsinline preload="auto" src="female.webm"></video><a href="female.webm">完整女性录像，含待机与退出</a></article><article><h2>男性 · 5b78bbd34130</h2><video id="male" muted playsinline preload="auto" src="male.webm"></video><a href="male.webm">完整男性录像，含待机与退出</a></article></div>
<p>事件时间固定偏移对齐，非拍摄标定；MediaRecorder 首PTS约一编码帧不确定，浏览器超过80ms时只校正位置，不变速。完整媒体不裁剪，源视频只在本地 ignored analysis 中；不要将原片复制到公开仓库。原片与角色相机视角不同，动作混入保留。</p>
<p><a href="alignment.json">事件对齐及精度边界</a> · <a href="report.json">实际角色与动作任务记录</a> · <a href="../../assets-source/video-dance-support-v3/README.md">候选方法、失败与复跑</a> · <a href="../dance-video-pose-v1/source.json">Pexels来源许可清单</a></p>
<script>
const videos=['source','female','male'].map(id=>document.getElementById(id)),status=document.getElementById('status'),slider=document.getElementById('seek'),button=document.getElementById('play');let offsets=[],playing=false,ready=false,epoch=0,maxDrift=0;
function pause(){playing=false;epoch++;videos.forEach(v=>v.pause())}
function position(t){videos.forEach((v,i)=>v.currentTime=t+offsets[i]);slider.value=t}
async function seekDone(v){if(!v.seeking)return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('seek timeout')),10000);v.addEventListener('seeked',()=>{clearTimeout(timer);resolve()},{once:true})})}
async function play(){if(!ready)return;pause();const token=epoch;let t=Math.max(0,Math.min(3.003,videos[0].currentTime-offsets[0]));if(t>=3)t=0;position(t);await Promise.all(videos.map(seekDone));if(token!==epoch)return;videos.forEach(v=>v.playbackRate=1);await Promise.all(videos.map(v=>v.play()));playing=true}
button.onclick=()=>play().catch(e=>{pause();status.textContent=e.message});document.getElementById('pause').onclick=pause;document.getElementById('restart').onclick=()=>{pause();position(0);play()};slider.oninput=()=>{pause();position(Number(slider.value))};
fetch('alignment.json').then(r=>r.json()).then(async a=>{offsets=[a.source.offsetSeconds,...a.recordings.map(r=>r.offsetSeconds)];await Promise.all(videos.map(v=>v.readyState>=1?Promise.resolve():new Promise(r=>v.addEventListener('loadedmetadata',r,{once:true}))));position(0);await Promise.all(videos.map(seekDone));ready=true;button.disabled=false;status.textContent='三片就绪';window.comparisonReady=true});
function tick(){if(ready){let t=videos[0].currentTime-offsets[0];if(playing&&t>=3.003){pause();position(3.003);window.completedComparison=true}if(playing){videos.slice(1).forEach((v,j)=>{const err=Math.abs(v.currentTime-offsets[j+1]-t);maxDrift=Math.max(maxDrift,err);if(err>.08)v.currentTime=t+offsets[j+1]});slider.value=t}status.textContent=`${Math.max(0,t).toFixed(3)} / 3.003秒 · 1×`;window.comparisonState={ready,playing,t,maxDrift,rates:videos.map(v=>v.playbackRate),times:videos.map(v=>v.currentTime)}}requestAnimationFrame(tick)}requestAnimationFrame(tick);
</script>'''
(OUT/'index.html').write_text(html,encoding='utf-8')
print(json.dumps(alignment,indent=2))
