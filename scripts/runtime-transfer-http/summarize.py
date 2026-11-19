"""Render the bounded HTTP pilot evidence, preserving each executed source ID."""
import json, statistics, html
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'scripts/production'))
from production_paths import project_output

out = project_output(root / 'evidence/m2-http-transport-801-v1', __file__)
summary_path = project_output(out / 'summary.json', __file__)
index_path = project_output(out / 'index.html', __file__)
out.mkdir(exist_ok=True)
summary = {'runtime':'801c7a9c9026', 'transportSha256':'0efd5085684aee743a2acd77a77a9ee9ac6260913f2958dd413a3dfe44a22a4d', 'rows':[]}
sources = {'male':'m2-http-browser-male-801-v2', 'female':'m2-http-browser-female-801-v1'}
rows=[]
for body, folder in sources.items():
    report=json.loads((root/'evidence'/folder/'report.json').read_text(encoding='utf-8'))
    assert report['status']=='passed' and report['transportSha256']==summary['transportSha256']
    for mode in ['identity','gzip','br']:
        for phase in ['cold','warm']:
            runs=[r for r in report['runs'] if r['mode']==mode and r['phase']==phase]
            assert len(runs)==3
            metrics={
                'interactiveMs':[r['interactiveMs'] for r in runs],
                'outfitMs':[r['firstOutfitMs'] for r in runs],
                'serverBodyBytes':[sum(e.get('bodyBytes',0) for e in r['server']) for r in runs],
                'resourceTransferBytes':[sum(e['transferSize'] for e in r['resources']) for r in runs],
                'resourceEncodedBytes':[sum(e['encodedBodySize'] for e in r['resources']) for r in runs],
                'resourceDecodedBytes':[sum(e['decodedBodySize'] for e in r['resources']) for r in runs],
                'heapUsedBytes':[r['heap']['used'] for r in runs],
                'responses304':[sum(e['status']==304 for e in r['server']) for r in runs],
            }
            row={'body':body,'mode':mode,'phase':phase,'samples':metrics,
                 'median':{k:statistics.median(v) for k,v in metrics.items()},
                 'renderer':[r['renderer'] for r in runs], 'source':folder+'/report.json'}
            summary['rows'].append(row)
            m=row['median']
            rows.append(f'<tr><td>{body}</td><td>{mode}</td><td>{phase}</td>'
                f'<td>{m["serverBodyBytes"]/1e6:.2f}</td><td>{m["interactiveMs"]:.0f}</td>'
                f'<td>{m["outfitMs"]:.1f}</td><td>{m["responses304"]}</td>'
                f'<td>{m["heapUsedBytes"]/1048576:.1f}</td></tr>')
    summary[body+'Environment']=report['environment']
    summary[body+'ManifestSha']=report['sourceManifestSha256']
summary_path.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
sections=[]
for body,folder in sources.items():
    name='男性短裤外搭' if body=='male' else '女性默认裤装'
    videos=''.join(f'<figure><figcaption>{label} · 1×</figcaption><video controls muted preload="metadata" src="../{folder}/{mode}-visual/normal1x.webm"></video><a href="../{folder}/{mode}-visual/face.png">查看原尺寸近景</a></figure>' for mode,label in [('identity','原始传输'),('br','Brotli传输')])
    sections.append(f'<section><h2>{name}</h2><button onclick="playPair(this)">同时从头播放</button><div class="pair">{videos}</div><a href="../{folder}/report.json">完整实测数据与身份</a></section>')
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HTTP压缩 · 固定801实测</title><style>body{font:16px/1.65 system-ui;background:#f4f6f5;color:#243633;margin:0}main{max-width:1500px;padding:28px;margin:auto}section{background:white;padding:24px;margin:20px 0;border:1px solid #d7e1dc;border-radius:12px}h1{font-size:26px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;text-align:left;padding:8px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:12px 0}video{width:100%;background:#ddd}button{padding:10px 16px;cursor:pointer}a{color:#17695b}@media(max-width:850px){.pair{grid-template-columns:1fr}.scroll{overflow:auto}}</style><main>
<h1>原资源不变：HTTP压缩与缓存实测</h1>
<p>固定运行版 <b>801c7a9c9026</b> · 独立导出的男女造型包。使用 Node 24.13.0 内置 gzip／Brotli，未压模型网格、未改蒙皮和动作，未替换公开4196。</p>
<section><h2>本轮结论</h2><p>浏览器收到的解码字节逐文件SHA一致。Brotli冷加载传输正文：男性46.60→26.15 MB（约44%减少），女性43.47→22.81 MB（约48%减少）。开发机本地加载时间没有稳定改善；纹理对象数男性43、女性40，压缩前后相同。HTTP压缩不降低解码后的GPU纹理占用。</p>
<p>建议将这一层纳入后续发布：当前只交付可重复脚本及对照，没有切换线上服务器。可观看影片仅复核不变字节的画面与正常行走，不重复认定全套动作通过。</p></section>
<section><h2>3次样本的中位数</h2><p>Chrome开发机、1440×900、本机回环，无网络限速；不是普通电脑或真实互联网测量。计时与录屏分开。ready指运行时ready加两次动画回调，是可交互画面代理，非逐像素首屏检测。</p>
<div class="scroll"><table><thead><tr><th>基模</th><th>传输</th><th>缓存</th><th>正文 MB</th><th>ready ms</th><th>造型应用 ms</th><th>304次数</th><th>JS堆 MiB</th></tr></thead><tbody>ROWS</tbody></table></div>
<p>男性造型应用包含首次短裤与外搭；女性当前包只有默认裤装，此数值不是首次裙装成本。JS堆是时点采样，不是峰值、显存或解压工作内存。暖加载仍有大文件重传，当前动作等请求使用no-store，本轮没有同时改缓存调用。</p>
<p><a href="summary.json">全部原始样本摘要</a> · <a href="../m2-http-transport-independent-v1/retest-v2/result.json">独立CPU／HTTP复核</a> · <a href="../m2-http-transport-independent-v1/result.json">保留的初轮失败</a></p></section>
SECTIONS
<section><h2>边界与下一项</h2><p>独立审查发现并修复未声明文件混入及失败输出占名问题；原失败保留。男性初轮近景请求用了错误的镜头名称，v2修正并保留旧证据。root已查看四条影片全部2fps抽帧及原尺寸近景，抽样无新增大片缺面；不代替人工连续观感判断。</p>
<p>下项为少量KTX2身体／头发贴图：单配置已导出，画质、实际GPU格式、Canvas染色与回退仍待运行。没有开始网格／动画编码。普通电脑实测仍缺设备。</p>
<p><a href="../../docs/research/RESOURCE-COMPRESSION-GAME-PRACTICES-2026-11-16.html">顾问调研及来源</a> · <a href="../../scripts/runtime-transfer-http/README.md">重复执行说明</a></p></section>
</main><script>function playPair(b){for(const v of b.closest('section').querySelectorAll('video')){v.pause();v.currentTime=0;v.playbackRate=1;v.play().catch(()=>{});}}</script></html>'''
index_path.write_text(page.replace('ROWS',''.join(rows)).replace('SECTIONS',''.join(sections)),encoding='utf-8')
print(out)
