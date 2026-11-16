"""Package existing bounded KTX observations; does not grant visual acceptance."""
import hashlib
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--revision', choices=['v2','v3'], default='v3')
revision = parser.parse_args().revision
OUT = ROOT / f'evidence/m2-ktx-room-comparison-{revision}'
OUT.mkdir(exist_ok=True)
source = json.loads((ROOT / 'assets-source/m2-ktx-pilot-v1/manifest.json').read_text(encoding='utf-8'))
deps = json.loads((ROOT / 'assets-source/m2-ktx-pilot-v1/runtime-dependencies.json').read_text(encoding='utf-8'))
summary = {'runtime': source['fixedBuildId'], 'runtimeSource': source['fixedSourceCommit'],
           'bodies': {}, 'visualReview': 'pending', 'targetPcTested': False,
           'limits': ['Original VRM/PNG still downloaded: experimental overlay adds KTX and decoder bytes.',
                      'Texture counts and transcode payload are not measured VRAM bytes.',
                      'Preparation time is one development-machine sample per body, not a benchmark.',
                      '2fps sheets are an engineering review aid, not human continuous playback acceptance.',
                      'Videos include explicitly paused same-pose comparisons; moving segments run at 1x.']}
sections = ['<h1>KTX2 有界兼容实测</h1><p>固定运行版 801c7a9c9026；实验适配器独立记录。原始 VRM 和 PNG 保留，当前不是生产资源包替换。</p>',
            '<p>录像包含暂停静态对照；行走、讲话以 1× 播放。开发机结果不代表普通电脑。纹理数量不是显存字节。</p><p><a href="summary.json">实际数据及限制</a></p>']
for body in ['male', 'female']:
    folder = ROOT / f'evidence/m2-ktx-room-{body}-801-{revision}'
    data = json.loads((folder / 'report.json').read_text(encoding='utf-8'))
    assert data['status'] == 'runtime-checks-passed-visual-pending'
    assert data['runtime'] == source['fixedBuildId']
    requests = {r['path']: r for r in data['requests']}
    expected = [(f'/__pilot/three/examples/jsm/libs/basis/{f["name"]}', f['sha256']) for f in deps['files']]
    expected += [('/__pilot/three/examples/jsm/loaders/KTX2Loader.js', deps['ktx2Loader']['sha256'])]
    samples = [s for s in source['samples'] if s['gender'] == body]
    for s in samples:
        suffix = s['encoded']['path'].replace('assets-source/m2-ktx-pilot-v1/', '')
        expected.append(('/__pilot/source/' + suffix, s['encoded']['sha256']))
    for url, digest in expected:
        # Failure-injection retry records 503 later; initial success is authoritative here.
        assert any(r['path'] == url and r['sha256'] == digest for r in data['requests']), url
    stages = [{ 'stage': s['label'], 'textures': s['scene']['renderer']['textures'],
                'geometries': s['scene']['renderer']['geometries']} for s in data['states']]
    ktx = next(s for s in data['states'] if s['label'] == 'ktx-paused-face')
    maps = {}
    for material in ktx['adapter']['materials']:
        for key in ['map', 'shade']:
            t = material[key]
            maps[t['uuid']] = {k: t[k] for k in ['width','height','format','mipLevels','transcodedMipDataBytes']}
    row = {'adapterSha256': data['adapterSha256'], 'browser': data['browser'],
           'prepareSingleSampleMs': data['prepared']['prepareMs'], 'exactSourceDecoderRequestsVerified': expected,
           'textureStages': stages, 'uniqueCompressedTextureObjects': list(maps.values()),
           'sourceImages': [{'id': s['id'], 'pngBytes': s['sourcePngBytes'], 'ktxBytes': s['encoded']['bytes']} for s in samples],
           'failedDerivativePreservedCurrent': data['failedDerivative']['preserved'], 'sheets': []}
    if 'rejectedAppearance' in data:
        row['rejectedAppearance'] = data['rejectedAppearance']
    link = '../' + folder.name
    sections += [f'<h2>{"男性" if body == "male" else "女性"}</h2>',
                 f'<p><a href="{link}/report.json">逐步原始记录</a> · 首次 prepare {row["prepareSingleSampleMs"]:.1f} ms（单次）</p>',
                 f'<video controls preload="metadata" src="{link}/normal1x.webm"></video>']
    for camera in ['face', 'body']:
        sections.append('<div class="pair">' + ''.join(f'<figure><figcaption>{mode.upper()} · {camera}</figcaption><a href="{link}/{mode}-{camera}.png"><img src="{link}/{mode}-{camera}.png"></a></figure>' for mode in ['png','ktx']) + '</div>')
    with tempfile.TemporaryDirectory(prefix='ktx-review-') as tmp:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v','error','-threads','2','-i',str(folder/'normal1x.webm'),'-vf','fps=2,scale=720:-1','-threads','2',str(Path(tmp)/'%06d.jpg')], check=True)
        frames = sorted(Path(tmp).glob('*.jpg'))
        for start in range(0,len(frames),12):
            sheet = Image.new('RGB',(1440,6*475),'#eeeeee'); draw = ImageDraw.Draw(sheet)
            for j,f in enumerate(frames[start:start+12]):
                x,y=(j%2)*720,(j//2)*475
                draw.text((x+5,y+5),f'{body} {(start+j)/2:.1f}s',fill='black'); sheet.paste(Image.open(f),(x,y+24))
            name=f'{body}-sheet-{start//12:02d}.jpg'; sheet.save(OUT/name,quality=87); row['sheets'].append(name)
        row['sampledFrames'] = len(frames)
    summary['bodies'][body] = row
    sections.append('<details><summary>完整时段 2fps 辅助抽帧</summary>'+''.join(f'<img loading="lazy" src="{n}">' for n in row['sheets'])+'</details>')
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>KTX2 compatibility</title><style>body{max-width:1600px;margin:auto;padding:24px;font:18px/1.6 system-ui;background:#eee}video,img{width:100%}.pair{display:grid;grid-template-columns:1fr 1fr}figure{margin:4px}summary{padding:15px}</style>'+''.join(sections),encoding='utf-8')
(OUT/'packaging-script.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps({'out':str(OUT),'sheets':{k:len(v['sheets']) for k,v in summary['bodies'].items()}}))
