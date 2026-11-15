"""Rebuild the offline comparison page from its pinned archive manifest.
No downloads, no product assets, no relabeling of original recordings.
"""
from pathlib import Path
import hashlib, html, json

ROOT = Path(__file__).resolve().parents[1]
folder = ROOT / 'evidence/m1-acceleration-efdf-vs-341'
manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf8'))
panels = []
for entry in manifest['entries']:
    for field, hashfield in [('video', 'videoSha256'), ('visualReview', 'visualReviewSha256')]:
        file = (folder / entry[field]).resolve()
        assert file.is_relative_to(folder.resolve()), 'Asset escapes archive'
        assert hashlib.sha256(file.read_bytes()).hexdigest() == entry[hashfield], 'Archive identity mismatch'
    data = entry['metadata']
    events = {e['type']: e for e in data['events']}
    metric = data['supportMetric']
    label = '修改前' if entry['sourceBuild'] == 'efdf558930a4' else '修补版'
    panels.append(f'''<article><h2>{label} · {html.escape(entry['sourceBuild'])}</h2>
<video controls preload="metadata" playsinline src="{html.escape(entry['video'])}"></video>
<p>原片 1× · 同房间/同镜头 · 女性基础体 · 完整前奏 {data['preludeCycleWraps']} 周期</p>
<p>实际加速相位 {events['speed']['phase']:.6f}；加速 {events['speed']['videoApproxSeconds']:.3f}s；停止请求 {events['distance-stop']['videoApproxSeconds']:.3f}s。</p>
<p>加速段运行时支撑 metric 峰值 {metric['maxMeters']*1000:.3f} mm，约 {metric['videoApproxSeconds']:.3f}s；不是录像逐帧重新测量鞋底。</p>
<a href="{entry['visualReview']}">原始版本、哈希与抽帧审查记录</a></article>''')
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>走跑加速与停止：原片对照</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:1600px;margin:24px auto;padding:0 20px;background:#f4f6f8;color:#17202a}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{background:white;border-radius:10px;padding:16px}video{width:100%;background:#111}button{padding:10px 18px;margin:0 8px 16px 0}@media(max-width:800px){main{grid-template-columns:1fr}}</style>
<h1>走跑加速与停止：同镜头正常速度对照</h1>
<p>两段均为真实 rAF / 普通路径指令录制，未写入相位或骨姿、未加速时间。自然触发相位略有差异，原片未改名标签或重标版本。</p>
<p><strong>已做全时序抽帧筛查，未宣布连续自然度验收通过。</strong>此样本不代表男性、裤裙或普通电脑性能通过。</p>
<button id="play">两片从头播放 · 1×</button><button id="pause">暂停两片</button><button id="detail">两片跳到 12 秒 · 1×</button><main>'''+''.join(panels)+'''</main>
<p><a href="manifest.json">完整归档 metadata / SHA-256</a>。网页同步按钮不提供逐帧同步保证；可分别使用原生播放器完整观看。</p>
<script>const clips=[...document.querySelectorAll('video')];function seekAndPlay(t){for(const v of clips){v.playbackRate=1;v.currentTime=t;v.play().catch(()=>{});}}document.querySelector('#play').onclick=()=>seekAndPlay(0);document.querySelector('#detail').onclick=()=>seekAndPlay(12);document.querySelector('#pause').onclick=()=>clips.forEach(v=>v.pause());for(const v of clips)v.addEventListener('ratechange',()=>{if(v.playbackRate!==1)v.playbackRate=1;});</script></html>'''
review_path = ROOT / 'evidence/female-acceleration-user-review-341.json'
if review_path.exists():
    review = json.loads(review_path.read_text(encoding='utf8'))
    entry = next(e for e in manifest['entries'] if e['sourceBuild'] == review['build'])
    assert entry['videoSha256'] == review['videoSha256'], 'User review belongs to different video'
    assert review['acceptedRangeApproxSeconds'] == [12, 15] and review['playbackRate'] == 1
    page = page.replace('已做全时序抽帧筛查，未宣布连续自然度验收通过。',
        '已做全时序抽帧筛查；用户已接受修补版约12–15秒的加速与停止片段。其余片段仍待验收。')
(folder / 'index.html').write_text(page, encoding='utf8')
print(folder / 'index.html')
