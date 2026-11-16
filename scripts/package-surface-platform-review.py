"""Package completed fixed surface platform regression evidence, CPU only."""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile

import imageio_ffmpeg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'evidence/m2-surface-platform-fe8-v2'
BUILD = 'fe834ac7f5f0'
SOURCE = '45e37abd6370b503b95616c82f485f4df4382194'


def record(path):
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest}


def main():
    report = json.loads((OUT/'report.json').read_text(encoding='utf-8'))
    if report['build'] != BUILD or report['status'] != 'passed' or report['errors'] or not all(c['passed'] for c in report['checks']):
        raise ValueError('Expected completed fixed platform regression')
    failure = ROOT/'evidence/m2-surface-platform-fe8-v1/report.json'
    failed = json.loads(failure.read_text(encoding='utf-8'))
    if failed['build'] != BUILD or failed['status'] != 'failed':
        raise ValueError('Expected retained first-attempt failure')
    summary = {'build': BUILD, 'sourceCommit': SOURCE, 'sourceCommitProvenance': 'Fixed-source work order',
               'visualReview': 'pending', 'ordinaryPcTested': False, 'sourceFiles': [], 'sheets': [],
               'checks': [{'name': c['name'], 'passed': c['passed']} for c in report['checks']],
               'retainedFailure': {'build': failed['build'], 'status': failed['status'], 'report': failure.relative_to(ROOT).as_posix()},
               'sampling': {'fps': 2, 'framesPerPage': 12, 'sheetWidth': 1440, 'cpuThreads': 2},
               'scope': report['scope'],
               'limits': ['Development-machine platform regression only. Visual review pending.',
                          'v1 expected derivative body swap despite retained unsupported rose lip fit. Failure retained.',
                          'v2 first verifies full old actor/UI preservation on refusal, then explicitly selects original lip/eye and swaps.',
                          'Earlier aed6ec9ff061 texture/normal-speed evidence keeps its original identity and review record.']}
    for path in [OUT/'report.json', OUT/'executed-script.cjs', failure, failure.parent/'normal1x.webm', Path(__file__).resolve(),
                 OUT/'normal1x.webm', OUT/'female.png', OUT/'female-ui-click.png', OUT/'male.png']:
        summary['sourceFiles'].append(record(path))
    movie = OUT/'normal1x.webm'
    with tempfile.TemporaryDirectory(prefix='surface-platform-review-') as temp:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-threads', '2', '-filter_threads', '2',
                        '-i', str(movie), '-vf', 'fps=2:start_time=0,scale=720:-2', '-threads', '2',
                        str(Path(temp)/'%06d.jpg')], check=True)
        frames = sorted(Path(temp).glob('*.jpg'))
        if not frames:
            raise ValueError('No native recording frames decoded')
        for start in range(0, len(frames), 12):
            page = frames[start:start+12]
            with Image.open(page[0]) as sample:
                cell_height = sample.height+26
            sheet = Image.new('RGB', (1440, math.ceil(len(page)/2)*cell_height), '#eee')
            draw = ImageDraw.Draw(sheet)
            for index, frame in enumerate(page):
                x, y = (index % 2)*720, (index // 2)*cell_height
                draw.text((x+6, y+6), f'fe8 platform {(start+index)/2:.1f}s', fill='black')
                with Image.open(frame) as image:
                    sheet.paste(image, (x, y+26))
            name = f'review-sheet-{start//12:02d}.jpg'
            sheet.save(OUT/name, quality=87)
            summary['sheets'].append({'file': name, 'frames': len(page), 'firstSampleSeconds': start/2,
                                      'lastSampleSeconds': (start+len(page)-1)/2})
        summary['sampledFrames'] = len(frames)
    parts = ['<h1>皮肤叠层平台回归补充</h1>', f'<p>构建 {BUILD} · 源码 {SOURCE} · 观感待审。</p>',
             '<p>本版核对实际候选查询、v7 准入与准备、agent 命令后的工作台状态、真实颜色和性别控件，以及对照实例隔离。记录来自开发机。</p>',
             '<p>v1 的最后切换要求沿用 rose 唇色进入尚无此唇色 fit 的小腿派生身体，错误预期为切换成功。v1 失败记录保留。v2 先确认拒绝并完整保留旧角色与控件，再明确选择 original 唇色和瞳色后切换。</p>',
             '<p><a href="report.json">v2 原始报告</a> · <a href="../m2-surface-platform-fe8-v1/report.json">v1 失败原始报告</a> · <a href="../m2-surface-platform-fe8-v1/normal1x.webm">v1 失败原片</a> · <a href="review-summary.json">哈希与完整抽帧索引</a></p>',
             '<p><a href="../m2-surface-review-aed-v1/index.html">aed6ec9ff061 皮肤叠层原样件、表情与完整录像</a>保留其原构建身份和审查记录。</p>',
             '<video controls playsinline preload="metadata" src="normal1x.webm"></video><p><a href="normal1x.webm">完整原始录像</a></p>',
             '<div class="stills">']
    for name, caption in [('female.png', 'agent 命令后的女性实际控件'), ('female-ui-click.png', '真实女性颜色控件操作'), ('male.png', '男性身体与实际控件')]:
        parts.append(f'<figure><figcaption>{caption}</figcaption><a href="{name}"><img loading="lazy" src="{name}" alt="{caption}"></a></figure>')
    parts.append('</div><details><summary>完整时段 2fps 抽帧</summary>')
    for sheet in summary['sheets']:
        name = sheet['file']
        parts.append(f'<a href="{name}"><img loading="lazy" src="{name}" alt="{sheet["firstSampleSeconds"]:.1f}s – {sheet["lastSampleSeconds"]:.1f}s"></a>')
    parts.append('</details>')
    for source in summary['sourceFiles']:
        if record(ROOT/source['path']) != source:
            raise ValueError('Source changed during packaging')
    (OUT/'review-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (OUT/'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>皮肤叠层平台回归补充</title><style>body{max-width:1440px;margin:auto;padding:24px;font:18px/1.6 system-ui;background:#eee;color:#181818}'
        'video,img{display:block;width:100%;height:auto}.stills{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}'
        'figure{margin:0}summary{padding:16px;cursor:pointer}a{color:#164d9b}</style>'+''.join(parts)+'</html>', encoding='utf-8')
    print(json.dumps({'frames': len(frames), 'sheets': len(summary['sheets']), 'visualReview': 'pending'}))


if __name__ == '__main__':
    main()
