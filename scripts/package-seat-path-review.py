"""Package same-room seat-path stall and completed regression recordings."""
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
OUT = ROOT/'evidence/m2-seat-path-review-v1'
CASES = [
    ('29d', '旧版停滞', '29d729e435f2', '4fac2499813bbe36132f8340dd518f71f50436e5', 'baseline-stall-reproduced'),
    ('785', '新版完成', '785be36def90', '23c1140a01d26b6f1c10ac4f8064f366add3ba17', 'technical-checks-passed-visual-pending'),
]


def file_record(path):
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest}


def main():
    reports = {}
    recipe_path = ROOT/'evidence/m2-accessory-record-room-785-v1/female-v8.json'
    recipe = json.loads(recipe_path.read_text(encoding='utf-8'))
    if recipe['schema'] != 'workbench-appearance-recipe-v8':
        raise ValueError('Expected the actual shared female v8 recipe')
    previous_script = None
    for tag, _, build, _, status in CASES:
        room = ROOT/f'evidence/m2-seat-path-room-{tag}-v1'
        report = json.loads((room/'report.json').read_text(encoding='utf-8'))
        if report['build'] != build or report['status'] != status or report['errors']:
            raise ValueError('Unexpected source report identity/outcome: '+tag)
        identity = report['identity']
        for key in ['runtimeBuild', 'servedBuild']:
            if identity[key]['shortId'] != build:
                raise ValueError('Recorded/served build mismatch: '+tag)
        primary = identity['primary']
        if primary['id'] != 'beta-base-female-m1' or primary['actualSha256'] != recipe['base']['sha256'] or primary['declaredSha256'] != recipe['base']['sha256']:
            raise ValueError('Live original female identity mismatch: '+tag)
        before = report['before']
        if before['camera']['mode'] != 'room' or before['maxSpeed'] != 1.05 or before['playbackRate'] != 1:
            raise ValueError('Expected room camera and normal-time 1.05 speed: '+tag)
        if any(before['appearance'][key] != value for key, value in recipe['appearance'].items()):
            raise ValueError('Saved appearance does not match the shared recipe: '+tag)
        if tag == '29d' and (report['result']['state'] != 'running' or report['after']['motion']['sitProgress'] != 0 or report['before']['position'] != report['after']['position']):
            raise ValueError('Expected the recorded unchanged-position seat stall')
        if tag == '785' and (report['result']['state'] != 'completed' or report['after']['mode'] != 'idle'):
            raise ValueError('Expected completed seating and subsequent stand/leave')
        script = (room/'executed-script.cjs').read_bytes()
        if previous_script is not None and script != previous_script:
            raise ValueError('The two cases did not use the same recorded harness')
        previous_script = script
        for filename in ['normal1x.webm', 'end.png']:
            if not (room/filename).is_file():
                raise FileNotFoundError(room/filename)
        reports[tag] = report
    OUT.mkdir(parents=True, exist_ok=True)
    summary = {'visualReview': 'pending', 'sourceFiles': [], 'cases': {},
               'recipe': file_record(recipe_path), 'sameRecordedHarness': True,
               'comparison': {'camera': 'room', 'speedMps': 1.05, 'walkTarget': [-1.4, -.6],
                              'then': 'sit', 'defaultPlaybackRate': 1, 'phaseSynchronized': False},
               'sampling': {'fps': 2, 'framesPerPage': 12, 'sheetWidth': 1440, 'cpuThreads': 2},
               'limits': ['Old stall recording and new completion recording keep their exact distinct builds.',
                          'Full native movies and deliberate observation window retained without trimming.',
                          'Known ponytail upward swing while sitting retained. No action-naturalness, whole-M1 or ordinary-PC approval.']}

    def register(path):
        summary['sourceFiles'].append(file_record(path))
        return html.escape(Path(os.path.relpath(path, OUT)).as_posix(), quote=True)

    recipe_link = register(recipe_path)
    register(Path(__file__).resolve())
    parts = ['<h1>同房间镜头坐下路径回归</h1>',
             '<p>相同原女性 v8 配方、room 镜头、速度 1.05，先 walkTo(−1.4, −0.6)，再请求坐下。</p>',
             '<p>旧版在本次 6 秒观察窗口中位置保持不动，坐下任务仍为 running、sitProgress 为 0。新版坐下任务实际 completed，随后完成站起和离开。</p>',
             '<p>两条原片完整保留各自构建身份与加载起点，默认 1×。旧版停滞后两片无法保持动作阶段同步，请分别播放。</p>',
             '<p>已知长发坐入上甩仍保留。本页只覆盖该路径回归，动作自然度、完整 M1 和普通电脑验收仍需另有证据。</p>',
             f'<p><a href="{recipe_link}">共同使用的女性 v8 配方</a> · <a href="summary.json">实际身份、结果与源文件 SHA</a></p><div class="pair">']
    for tag, title, build, commit, _ in CASES:
        room = ROOT/f'evidence/m2-seat-path-room-{tag}-v1'
        report = reports[tag]
        report_link = register(room/'report.json')
        movie_link = register(room/'normal1x.webm')
        still_link = register(room/'end.png')
        script_link = register(room/'executed-script.cjs')
        row = {'build': build, 'sourceCommit': commit, 'sourceCommitProvenance': 'Exact fixed-source work order',
               'sourceDigest': report['identity']['runtimeBuild']['sourceDigest'], 'status': report['status'],
               'primary': report['identity']['primary'], 'seatTaskState': report['result']['state'],
               'beforePosition': report['before']['position'], 'afterPosition': report['after']['position'], 'sheets': []}
        summary['cases'][tag] = row
        parts.append(f'<section><h2>{title}</h2><p>构建 {build}<br>源码 {commit}</p><p><a href="{report_link}">原始报告</a> · <a href="{script_link}">实际执行脚本</a></p>'
                     f'<video controls playsinline preload="metadata" src="{movie_link}"></video><p><a href="{movie_link}">完整原始 1× 录像</a></p>'
                     f'<a href="{still_link}"><img loading="lazy" src="{still_link}" alt="{title} 录像结束原图"></a></section>')
        with tempfile.TemporaryDirectory(prefix='seat-path-review-') as temp:
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-threads', '2', '-filter_threads', '2',
                            '-i', str(room/'normal1x.webm'), '-vf', 'fps=2:start_time=0,scale=720:-2', '-threads', '2',
                            str(Path(temp)/'%06d.jpg')], check=True)
            frames = sorted(Path(temp).glob('*.jpg'))
            if not frames:
                raise ValueError('No movie frames decoded: '+tag)
            for start in range(0, len(frames), 12):
                page = frames[start:start+12]
                with Image.open(page[0]) as sample:
                    cell_height = sample.height+26
                sheet = Image.new('RGB', (1440, math.ceil(len(page)/2)*cell_height), '#eee')
                draw = ImageDraw.Draw(sheet)
                for index, frame in enumerate(page):
                    x, y = (index%2)*720, (index//2)*cell_height
                    draw.text((x+6, y+6), f'{build} {(start+index)/2:.1f}s', fill='black')
                    with Image.open(frame) as image:
                        sheet.paste(image, (x, y+26))
                filename = f'{tag}-sheet-{start//12:02d}.jpg'
                sheet.save(OUT/filename, quality=87)
                data = file_record(OUT/filename)
                row['sheets'].append({'file': filename, 'frames': len(page), 'bytes': data['bytes'], 'sha256': data['sha256'],
                                      'firstSampleSeconds': start/2, 'lastSampleSeconds': (start+len(page)-1)/2})
            row['sampledFrames'] = len(frames)
    parts.append('</div>')
    for tag, title, _, _, _ in CASES:
        parts.append(f'<details><summary>{title}完整时段 2fps 抽帧</summary>')
        for sheet in summary['cases'][tag]['sheets']:
            filename = sheet['file']
            parts.append(f'<a href="{filename}"><img loading="lazy" src="{filename}" alt="{title} {sheet["firstSampleSeconds"]:.1f}s – {sheet["lastSampleSeconds"]:.1f}s"></a>')
        parts.append('</details>')
    for source in summary['sourceFiles']:
        if file_record(ROOT/source['path']) != source:
            raise ValueError('Source changed during packaging')
    (OUT/'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (OUT/'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>同镜头坐下路径回归</title><style>body{max-width:1440px;margin:auto;padding:24px;font:18px/1.6 system-ui;background:#eee;color:#181818}'
        'video,img{display:block;width:100%;height:auto}.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px}'
        'summary{padding:16px;cursor:pointer}a{color:#164d9b}@media(max-width:400px){.pair{grid-template-columns:1fr}}</style>'+''.join(parts)+'</html>', encoding='utf-8')
    print(json.dumps({'out': str(OUT), 'cases': {tag: {'frames': row['sampledFrames'], 'sheets': len(row['sheets'])}
                                               for tag, row in summary['cases'].items()}}))


if __name__ == '__main__':
    main()
