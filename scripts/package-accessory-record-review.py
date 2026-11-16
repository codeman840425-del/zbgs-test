"""Package completed v8 accessory-record browser evidence and native movies."""
import argparse
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile

import imageio_ffmpeg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SESSIONS = [
    ('female-save-restore', '女性保存与恢复', 'female-restored.png'),
    ('female-cold-draft', '关闭上下文后的草稿恢复', 'cold-restored.png'),
    ('female-failure-cancel', '故意失败、延迟和取消注入', None),
    ('male-ear-restore', '男性耳饰恢复与对照实例隔离', 'male-restored.png'),
]
FEMALE = ('beta-base-female-m1', '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95')
MALE = ('beta-base-male-m1b', '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff')


def file_record(path):
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--room', required=True)
    parser.add_argument('--build', required=True)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--out', default='evidence/m2-accessory-record-review-v1')
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{12}', args.build) or not re.fullmatch('[0-9a-f]{40}', args.source_commit):
        raise ValueError('Provide the exact fixed build and complete source commit')
    room, out = ROOT/args.room, ROOT/args.out
    report = json.loads((room/'report.json').read_text(encoding='utf-8'))
    if report.get('status') != 'technical-checks-passed-visual-pending' or report.get('errors') or report['build'] != args.build:
        raise ValueError('Recording failed, incomplete or has a different fixed build; no review page generated')
    if not report.get('checks') or not all(c.get('passed') is True for c in report['checks']):
        raise ValueError('Expected completed browser checks')
    sessions = {s['name']: s for s in report['sessions']}
    expected = {name for name, _, _ in SESSIONS}
    if set(sessions) != expected or len(report['sessions']) != len(expected):
        raise ValueError('Expected all four distinct completed recorded sessions')
    source_digest = None
    identities = {}
    for name, _, still in SESSIONS:
        identity = sessions[name]['identity']
        runtime, served = identity['runtimeBuild'], identity['servedBuild']
        if runtime['shortId'] != args.build or served['shortId'] != args.build or runtime['sourceDigest'] != served['sourceDigest']:
            raise ValueError('Session served/runtime build identity differs: '+name)
        if source_digest is None:
            source_digest = runtime['sourceDigest']
        if runtime['sourceDigest'] != source_digest:
            raise ValueError('Sessions were recorded from different runtime bytes')
        primary = identity['primary']
        expected_id, expected_sha = MALE if name.startswith('male-') else FEMALE
        if primary['id'] != expected_id or primary['actualSha256'] != expected_sha or primary['declaredSha256'] != expected_sha:
            raise ValueError('Session live primary avatar identity differs: '+name)
        identities[name] = {'build': args.build, 'sourceDigest': source_digest, 'primary': primary}
        for filename in [name+'.webm']+([still] if still else []):
            if not (room/filename).is_file():
                raise FileNotFoundError(room/filename)
    recipes = {}
    for body in ['female', 'male']:
        recipe = json.loads((room/(body+'-v8.json')).read_text(encoding='utf-8'))
        if recipe.get('schema') != 'workbench-appearance-recipe-v8' or recipe.get('rulesVersion') != 'workbench-appearance-rules-v8':
            raise ValueError('Saved recipe is not the actual v8 contract: '+body)
        recipes[body] = recipe
    if recipes['female']['accessories']['hat']['selection'] != 'single' or recipes['female']['accessories']['ears']['selection'] != 'pair' or not recipes['female']['surface']['layers']:
        raise ValueError('Expected recorded female hat, paired ears and surface selection')
    if recipes['male']['accessories']['ears']['selection'] != 'right' or recipes['male']['accessories']['hat']['selection'] != 'none':
        raise ValueError('Expected recorded original male right ear without hat')
    # No output directory or ffmpeg process exists until every source gate passes.
    out.mkdir(parents=True, exist_ok=True)
    summary = {'build': args.build, 'sourceCommit': args.source_commit, 'sourceCommitProvenance': 'Exact fixed-source work order',
               'sourceDigest': source_digest, 'visualReview': 'pending', 'ordinaryPcTested': False,
               'sourceFiles': [], 'sessions': {}, 'checks': [{'name': c['name'], 'passed': c['passed']} for c in report['checks']],
               'sampling': {'fps': 2, 'framesPerPage': 12, 'sheetWidth': 1440, 'cpuThreads': 2},
               'limits': [report['scope'],
                          'Failure/cancellation video deliberately injects unavailable and delayed resources. It does not establish action naturalness.',
                          'Known ponytail upward swing during sitting retained. Original female skirt and old dance remain governed by frozen-version evidence.',
                          'v8 records hat, ears and surface. Mic, glasses and independent streamer identity records are outside this contract.',
                          'Four native session movies retain independent loading starts at default 1x. No phase synchronization or trimming.',
                          'Instrumented development-PC evidence only. No performance or ordinary-PC qualification.']}

    def register(path):
        summary['sourceFiles'].append(file_record(path))
        return html.escape(Path(os.path.relpath(path, out)).as_posix(), quote=True)

    report_link = register(room/'report.json')
    executed_link = register(room/'executed-script.cjs')
    register(Path(__file__).resolve())
    recipe_links = {body: register(room/(body+'-v8.json')) for body in ['female', 'male']}
    parts = ['<h1>v8 配饰与整套外观恢复记录</h1>',
             f'<p>构建 {html.escape(args.build)} · 源码 {html.escape(args.source_commit)} · 观感待审。</p>',
             '<p>四个会话分别记录女性保存与恢复、关闭上下文后的草稿恢复、故意失败与取消注入、男性右耳恢复及对照实例隔离。每个会话都核对实际运行构建和主角色 SHA。</p>',
             '<p>v8 保存帽子、耳饰与 surface 选择。麦克风、眼镜以及独立主播身份记录尚未纳入这个记录合同。</p>',
             '<p>长发坐入时上甩问题仍保留。女裙与旧舞蹈沿封板版本参与观察，其既有缺陷记录继续有效。失败注入片展示资源缺失、延迟及较新请求取消的处理，不能据此判定动作自然度。</p>',
             '<p>四条原片完整保留，默认 1×、加载起点独立。观感与普通电脑验证仍待完成。</p>',
             f'<p><a href="{report_link}">原始浏览器报告</a> · <a href="{executed_link}">实际执行脚本</a> · <a href="{recipe_links["female"]}">女性实际 v8 配方</a> · <a href="{recipe_links["male"]}">男性实际 v8 配方</a> · <a href="summary.json">每会话身份、源 SHA 与完整抽帧索引</a></p>']
    for name, title, still in SESSIONS:
        movie = room/(name+'.webm')
        movie_link = register(movie)
        primary = identities[name]['primary']
        row = {'identity': identities[name], 'movie': movie.relative_to(ROOT).as_posix(), 'sheets': []}
        summary['sessions'][name] = row
        parts.extend([f'<h2>{title}</h2>',
                      f'<p>会话 {name} · 构建 {args.build} · 主角色 {html.escape(primary["id"])} · SHA {primary["actualSha256"]}</p>',
                      f'<video controls playsinline preload="metadata" src="{movie_link}"></video><p><a href="{movie_link}">完整原始 1× 录像</a></p>'])
        if still:
            still_link = register(room/still)
            parts.append(f'<a href="{still_link}"><img loading="lazy" src="{still_link}" alt="{title}"></a>')
        with tempfile.TemporaryDirectory(prefix='accessory-record-review-') as temp:
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-threads', '2', '-filter_threads', '2',
                            '-i', str(movie), '-vf', 'fps=2:start_time=0,scale=720:-2', '-threads', '2',
                            str(Path(temp)/'%06d.jpg')], check=True)
            frames = sorted(Path(temp).glob('*.jpg'))
            if not frames:
                raise ValueError('No native frames decoded: '+name)
            for start in range(0, len(frames), 12):
                page = frames[start:start+12]
                with Image.open(page[0]) as sample:
                    cell_height = sample.height+26
                sheet = Image.new('RGB', (1440, math.ceil(len(page)/2)*cell_height), '#eee')
                draw = ImageDraw.Draw(sheet)
                for index, frame in enumerate(page):
                    x, y = (index%2)*720, (index//2)*cell_height
                    draw.text((x+6, y+6), f'{name} {(start+index)/2:.1f}s', fill='black')
                    with Image.open(frame) as image:
                        sheet.paste(image, (x, y+26))
                filename = f'{name}-sheet-{start//12:02d}.jpg'
                sheet.save(out/filename, quality=87)
                data = file_record(out/filename)
                row['sheets'].append({'file': filename, 'bytes': data['bytes'], 'sha256': data['sha256'], 'frames': len(page),
                                      'firstSampleSeconds': start/2, 'lastSampleSeconds': (start+len(page)-1)/2})
            row['sampledFrames'] = len(frames)
        parts.append('<details><summary>完整时段 2fps 辅助抽帧</summary>')
        for sheet in row['sheets']:
            filename = sheet['file']
            parts.append(f'<a href="{filename}"><img loading="lazy" src="{filename}" alt="{title} {sheet["firstSampleSeconds"]:.1f}s – {sheet["lastSampleSeconds"]:.1f}s"></a>')
        parts.append('</details>')
    for source in summary['sourceFiles']:
        if file_record(ROOT/source['path']) != source:
            raise ValueError('Source changed during packaging')
    (out/'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (out/'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>v8 配饰与整套外观恢复记录</title><style>body{max-width:1440px;margin:auto;padding:24px;font:18px/1.6 system-ui;background:#eee;color:#181818}'
        'img,video{display:block;width:100%;height:auto}summary{padding:16px;cursor:pointer}a{color:#164d9b}</style>'+''.join(parts)+'</html>', encoding='utf-8')
    print(json.dumps({'out': str(out), 'sessions': {name: {'frames': row['sampledFrames'], 'sheets': len(row['sheets'])}
                                                  for name, row in summary['sessions'].items()}, 'visualReview': 'pending'}))


if __name__ == '__main__':
    main()
