"""Append-only 2fps full-duration review; no product/browser changes."""
from pathlib import Path
import gzip, hashlib, json, subprocess, tempfile
from PIL import Image, ImageDraw
import imageio_ffmpeg

out = Path(__file__).resolve().parent
archive = out.parent
original_manifest_bytes = (archive / 'manifest.json').read_bytes()
report = json.loads(gzip.decompress((archive / 'report.json.gz').read_bytes()))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
result = {'build': report['build'], 'samplingFPS': 2, 'sceneCropXYXY': [34,104,1062,854],
          'limits': ['Sequential decode of complete original video; sampling is not continuous viewing.',
                     'Each sheet cell retains the entire recorded scene canvas at original pixel size; right UI omitted.',
                     'Labels are nominal 2fps output timestamps, not pose-simulation times.',
                     'rAF statistics cover only original lightweight post-ready recording samples, not a performance benchmark.'],
          'cases': []}
links = []
for case in report['cases']:
    name = case['config']['name']; video = archive / name / 'continuous-chain.webm'
    folder = out / name; folder.mkdir(exist_ok=True)
    assert not list(folder.glob('sheet-*.jpg')), 'Do not overwrite previous review'
    with tempfile.TemporaryDirectory(prefix='m1-review-') as tmp:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v','error','-threads','2','-i',str(video),
                        '-filter_threads','1','-vf','fps=2','-q:v','2',str(Path(tmp)/'%06d.jpg')], check=True)
        frames = sorted(Path(tmp).glob('*.jpg')); sheets=[]
        for start in range(0,len(frames),6):
            canvas=Image.new('RGB',(2060,2334),'#eee'); draw=ImageDraw.Draw(canvas)
            for j,file in enumerate(frames[start:start+6]):
                with Image.open(file) as frame:
                    assert frame.size == (1440,900)
                    tile=frame.crop((34,104,1062,854))
                x=j%2*1030; y=j//2*778
                canvas.paste(tile,(x,y+26))
                draw.text((x+8,y+6),f'{name} | {(start+j)/2:.2f}s nominal video | frame {start+j}',fill='black')
            filename=f'sheet-{start//6:03d}.jpg'; canvas.save(folder/filename,quality=91); sheets.append(filename)
    samples=case['frames']; valid=[f for f in samples if f.get('dt') is not None]
    dts=sorted(f['dt'] for f in valid)
    quantile=lambda q: dts[min(len(dts)-1,int((len(dts)-1)*q))]
    threshold_counts={str(t):sum(f['dt']>t for f in valid) for t in [16.666666666666668,25,33.333333333333336,50,100]}
    peaks=[]
    for f in sorted(valid,key=lambda f:f['dt'],reverse=True)[:15]:
        peaks.append({k:f.get(k) for k in ['wallMs','dt','simulationTime','mode','root','sit','phase','jogPhase','runMix','active']})
        peaks[-1]['secondsSinceFirstRecordedSample']=(f['wallMs']-samples[0]['wallMs'])/1000
    entry={'case':name,'videoSHA256':sha(video),'sampledFrames':len(frames),'nominalLastSampleSeconds':(len(frames)-1)/2,
           'sheets':sheets,'rAF':{'recordedSamples':len(samples),'nonNullIntervals':len(valid),'maxMs':dts[-1],
           'p50Ms':quantile(.5),'p95Ms':quantile(.95),'p99Ms':quantile(.99),'strictlyGreaterCountsMs':threshold_counts,'largestIntervals':peaks}}
    result['cases'].append(entry)
    links.append(f'<h2>{name}</h2><p>{len(frames)} sampled frames; rAF max {dts[-1]:.3f}ms. <a href="../{name}/continuous-chain.webm">Original 1× film</a></p>')
    for filename in sheets:
        links.append(f'<a href="{name}/{filename}"><img loading="lazy" src="{name}/{filename}" style="width:100%"></a>')
(out/'frame-review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>77e46 full timeline 2fps</title><body style="max-width:2060px;margin:auto;font:18px system-ui"><h1>77e46 两原片全时段2fps</h1><p>顺序解码完整原片。每格原像素场景画布，未放大；省略右侧UI。可点击原尺寸图。此为抽帧审查，不能代替正常速度完整观看；时间标签是视频2fps标称时间，不是模拟时间。下方帧间隔来自原录制轻量采样，含截图和主动暂停，不是性能基准。</p>'+''.join(links)+'</body>',encoding='utf-8')
assert (archive/'manifest.json').read_bytes()==original_manifest_bytes
manifest={'build':report['build'],'originalManifestSHA256':hashlib.sha256(original_manifest_bytes).hexdigest(),
          'files':{p.relative_to(out).as_posix():sha(p) for p in out.rglob('*') if p.is_file() and p.name!='review-manifest.json'}}
(out/'review-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
