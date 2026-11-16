"""Package fixed native hair recordings without granting visual acceptance."""
import argparse
import hashlib
import html
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile

import imageio_ffmpeg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
STILLS = [('back-idle', '静止背面'), ('side-idle', '静止侧面'), ('front-color', '正面配色'),
          ('after-walk-run-turn', '行走、跑步与转向后'), ('seated-side', '坐姿侧面'),
          ('seated-back', '坐姿背面'), ('risen-back', '起立后背面'), ('cold-restored', '新上下文恢复后背面')]


def record(path):
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--room', default='evidence/m2-long-hair-room-363-v1')
    parser.add_argument('--out', default='evidence/m2-long-hair-review-363-v1')
    parser.add_argument('--build', default='36365874e557')
    parser.add_argument('--source-commit', default='fc8c91d4231cd8579548a33b72bad625dd14c189')
    parser.add_argument('--review-note', default='背面和侧面静止原图可见发根与原发帽脱离。主线审查将其记录为静态碰撞导致的根部位移缺陷，本基线观感未通过。')
    args = parser.parse_args()
    room, out = ROOT/args.room, ROOT/args.out
    report = json.loads((room/'report.json').read_text(encoding='utf-8'))
    if report.get('status') != 'technical-checks-passed-visual-pending' or report.get('errors'):
        raise ValueError('Incomplete or failed native recording; preserve failure without a success page')
    if report['build'] != args.build or not report['checks'] or not all(c['passed'] for c in report['checks']):
        raise ValueError('Expected exact fixed build and completed limited technical checks')
    for key in ['runtimeBuild', 'servedBuild']:
        if report['identity'][key]['shortId'] != args.build:
            raise ValueError('Served/recorded fixed build mismatch')
    for name in ['normal1x.webm', 'recipe-v7.json']+[name+'.png' for name, _ in STILLS]:
        if not (room/name).is_file():
            raise FileNotFoundError(room/name)
    out.mkdir(parents=True, exist_ok=True)
    intervals = report['trace']['frameIntervals']
    if not intervals or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in intervals):
        raise ValueError('Actual app rAF interval trace unavailable')
    excluded = [{'index': i, 'milliseconds': v} for i, v in enumerate(intervals) if v <= 0]
    sorted_intervals = sorted(v for v in intervals if v > 0)
    if not sorted_intervals:
        raise ValueError('No positive rAF intervals in trace')
    raf = {'source': 'report.trace.frameIntervals', 'count': len(intervals),
           'positiveIntervalCount': len(sorted_intervals), 'excludedNonpositiveIntervals': excluded,
           'medianMs': sorted_intervals[math.ceil(len(sorted_intervals)*.5)-1],
           'p95Ms': sorted_intervals[math.ceil(len(sorted_intervals)*.95)-1], 'maximumMs': max(sorted_intervals),
           'percentileMethod': 'nearest rank',
           'scope': 'Actual app requestAnimationFrame timestamp intervals in a short development-machine recording with screenshots, resource loading, pause and lifecycle checks. Not solver CPU timings or target-PC qualification.'}
    summary = {'build': args.build, 'sourceCommit': args.source_commit,
               'sourceCommitProvenance': 'Exact fixed-source work order',
               'sourceDigest': report['identity']['runtimeBuild']['sourceDigest'],
               'visualReview': 'not-accepted', 'reviewNote': args.review_note,
               'reviewNoteProvenance': 'Primary agent visual review supplied in work order; packaging performs no visual pass judgment',
               'ordinaryPcTested': False, 'sourceFiles': [], 'sheets': [], 'appRafIntervals': raf,
               'sampling': {'fps': 2, 'framesPerPage': 12, 'sheetWidth': 1440, 'cpuThreads': 2},
               'checks': [{'name': c['name'], 'passed': c['passed']} for c in report['checks']],
               'limits': [report['scope'], args.review_note,
                          'Native recording includes deliberate pause, dynamics-disable, reload and instance-isolation checks. Moving actions run at 1x.',
                          'Same-body peer technical isolation and fresh v7 retry do not approve arbitrary bodies, hairs or collisions.',
                          '2 fps contact sheets aid review. Full continuous visual acceptance remains required.']}

    def register(path):
        summary['sourceFiles'].append(record(path))
        return html.escape(Path(os.path.relpath(path, out)).as_posix(), quote=True)

    report_link = register(room/'report.json')
    movie_link = register(room/'normal1x.webm')
    recipe_link = register(room/'recipe-v7.json')
    script_link = register(Path(__file__).resolve())
    register(room/'executed-script.cjs')
    parts = ['<h1>长发蒙皮动态基线 · 技术候选</h1>',
             f'<p>构建 {html.escape(args.build)} · 源码 {html.escape(args.source_commit)} · 观感未通过。</p>',
             f'<p>{html.escape(args.review_note)}</p>',
             '<p>原女性样件已记录实际多骨蒙皮网格、官方 spring manager，以及行走、跑步、转向、坐起、暂停和动态开关。卸载重载、同身体对照实例隔离、新上下文 v7 加载失败保留及重试有技术记录。</p>',
             '<p>原片包含刻意暂停、关闭动态和实例隔离检查，其余移动动作按 1× 播放。本页保留上述审查结论，后续修订须保留各自原图、录像和构建身份。</p>',
             f'<p><a href="{report_link}">原始技术报告及完整 rAF 记录</a> · <a href="{recipe_link}">原始 v7 配方</a> · <a href="summary.json">源文件哈希与抽帧索引</a> · <a href="{script_link}">包装脚本</a></p>',
             f'<video controls playsinline preload="metadata" src="{movie_link}"></video><p><a href="{movie_link}">完整原始 1× 录像</a></p>',
             '<div class="stills">']
    for name, caption in STILLS:
        link = register(room/(name+'.png'))
        parts.append(f'<figure><figcaption>{caption}</figcaption><a href="{link}"><img loading="lazy" src="{link}" alt="{caption}"></a></figure>')
    parts.append('</div>')
    parts.append(f'<p>实际应用 rAF 时间戳间隔原始记录 {raf["count"]} 项，其中 {len(excluded)} 项非正间隔排除并保留在索引中。对 {raf["positiveIntervalCount"]} 个正间隔汇总，中位 {raf["medianMs"]:.2f} ms，P95 {raf["p95Ms"]:.2f} ms，最大 {raf["maximumMs"]:.2f} ms。统计直接来自本次开发机短录制，包含截图、加载、暂停及生命周期检查，不能据此确认普通电脑性能或逐帧 spring CPU 耗时。</p>')
    with tempfile.TemporaryDirectory(prefix='long-hair-review-') as temp:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-threads', '2', '-filter_threads', '2',
                        '-i', str(room/'normal1x.webm'), '-vf', 'fps=2:start_time=0,scale=720:-2', '-threads', '2',
                        str(Path(temp)/'%06d.jpg')], check=True)
        frames = sorted(Path(temp).glob('*.jpg'))
        if not frames:
            raise ValueError('No frames decoded from native movie')
        for start in range(0, len(frames), 12):
            page = frames[start:start+12]
            with Image.open(page[0]) as sample:
                cell_height = sample.height+26
            sheet = Image.new('RGB', (1440, math.ceil(len(page)/2)*cell_height), '#eee')
            draw = ImageDraw.Draw(sheet)
            for index, frame in enumerate(page):
                x, y = (index % 2)*720, (index // 2)*cell_height
                draw.text((x+6, y+6), f'{args.build} {(start+index)/2:.1f}s', fill='black')
                with Image.open(frame) as image:
                    sheet.paste(image, (x, y+26))
            name = f'sheet-{start//12:02d}.jpg'
            sheet.save(out/name, quality=87)
            summary['sheets'].append({'file': name, 'frames': len(page), 'firstSampleSeconds': start/2,
                                      'lastSampleSeconds': (start+len(page)-1)/2})
        summary['sampledFrames'] = len(frames)
    parts.append('<details><summary>完整时段 2fps 辅助抽帧</summary>')
    for sheet in summary['sheets']:
        name = sheet['file']
        parts.append(f'<a href="{name}"><img loading="lazy" src="{name}" alt="{sheet["firstSampleSeconds"]:.1f}s – {sheet["lastSampleSeconds"]:.1f}s"></a>')
    parts.append('</details>')
    for source in summary['sourceFiles']:
        if record(ROOT/source['path']) != source:
            raise ValueError('Source changed during packaging')
    (out/'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (out/'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>长发蒙皮动态基线</title><style>body{max-width:1440px;margin:auto;padding:24px;font:18px/1.6 system-ui;background:#eee;color:#181818}'
        'img,video{display:block;width:100%;height:auto}.stills{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px}'
        'figure{margin:0}summary{padding:16px;cursor:pointer}a{color:#164d9b}@media(max-width:480px){.stills{grid-template-columns:1fr}}</style>'
        +''.join(parts)+'</html>', encoding='utf-8')
    print(json.dumps({'out': str(out), 'frames': len(frames), 'sheets': len(summary['sheets']), 'visualReview': summary['visualReview']}))


if __name__ == '__main__':
    main()
