"""Package passed company-room evidence into a portable Chinese review directory."""
import argparse
import hashlib
import html
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
CASES = [(layout, body) for layout in ('room-a', 'room-b') for body in ('female', 'male')]
ASSETS = {
    'female': ('beta-base-female-m1', '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'),
    'male': ('beta-base-male-m1b', '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def record(path, base):
    with path.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    return {'path': path.relative_to(base).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def commit_digest(commit, inputs):
    """Recompute the build-id.mjs contract from committed bytes, not a mutable tree."""
    paths = git('ls-tree', '-r', '--name-only', commit, '--', 'prototype').decode().splitlines()
    fixed = {'public/favicon.svg', 'index.html', 'foundation.html', 'vite.config.js', 'package.json', 'package-lock.json'}
    expected = sorted(p.removeprefix('prototype/') for p in paths
                      if p.removeprefix('prototype/').startswith(('src/', 'scripts/', 'public/assets/'))
                      or p.removeprefix('prototype/') in fixed)
    require(inputs == expected, 'Build input list differs from the requested source commit')
    digest = hashlib.sha256()
    for name in expected:
        digest.update(name.encode())
        digest.update(b'\0')
        digest.update(git('show', f'{commit}:prototype/{name}'))
        digest.update(b'\0')
    return digest.hexdigest()


def validate_identity(identity, body, layout, build, digest):
    for key in ('runtimeBuild', 'servedBuild'):
        info = identity[key]
        require(info['shortId'] == build and info['sourceDigest'] == digest,
                f'{body}/{layout}: {key} build mismatch')
        require(info.get('development') is not True, 'Development build cannot be packaged')
    asset_id, sha = ASSETS[body]
    primary = identity['primary']
    require(primary['id'] == asset_id and primary['actualSha256'] == sha
            and primary['declaredSha256'] == sha, f'{body}: avatar identity mismatch')
    query = parse_qs(urlparse(identity['url']).query)
    require(query.get('body') == [body] and query.get('companyLayout') == [layout],
            f'{body}/{layout}: captured URL mismatch')


def validate(run, commit):
    report = read_json(run / 'report.json')
    require(report.get('status') == 'passed', 'Only status=passed reports can be packaged')
    require(report.get('errors') == [], 'Run contains errors or lacks errors array')
    build, digest = report['build'], report['fixedSourceDigest']
    require(re.fullmatch(r'[a-f0-9]{12}', build) and re.fullmatch(r'[a-f0-9]{64}', digest)
            and digest.startswith(build), 'Invalid build identity')
    expected_names = [f'{layout}-{body}' for layout, body in CASES]
    require([row['name'] for row in report['cases']] == expected_names, 'Four ordered cases required')
    inputs = report['cases'][0]['identity']['servedBuild']['inputs']
    require(commit_digest(commit, inputs) == digest, 'Source commit does not reproduce reported build digest')
    require({row['body'] for row in report['calibration']} == {'female', 'male'}
            and len(report['calibration']) == 2, 'Both baseline calibrations required')
    require(report['environment']['recordingRate'] == 'normal simulation 1x', 'Normal 1x recording required')
    checks = report['lifecycle']['checks']
    require(checks and all(check.get('passed') is True for check in checks), 'Lifecycle checks did not pass')
    links = report['genderLinks']
    require(len(links) == 4 and {(r['layout'], r['body']) for r in links} == set(CASES),
            'Four gender-link checks required')
    for row in links:
        validate_identity(row['identity'], row['body'], row['layout'], build, digest)
    for row, (layout, body) in zip(report['cases'], CASES):
        name = f'{layout}-{body}'
        require(row['layout'] == layout and row['body'] == body, f'{name}: case mismatch')
        require(read_json(run / name / 'report.json') == row, f'{name}: root/case report mismatch')
        validate_identity(row['identity'], body, layout, build, digest)
        require(len(row['tasks']) == 4 and all(t['state'] == 'completed' for t in row['tasks']),
                f'{name}: incomplete task chain')
        require(row['samples'] and all(s['rate'] == 1 for s in row['samples']), f'{name}: non-1x sample')
        for stage in ('initial', 'seated', 'afterExit', 'final'):
            require(row[stage]['playbackRate'] == 1, f'{name}: non-1x {stage}')
        require(row['seated']['lease']['state'] == 'occupied' and row['afterExit']['lease'] is None,
                f'{name}: lease chain incomplete')
        for filename in ('room.png', 'seated.png', 'exit.png', 'normal1x.webm', 'report.json'):
            require((run / name / filename).is_file() and (run / name / filename).stat().st_size > 0,
                    f'{name}: missing or empty {filename}')
    return report


def contact_sheets(movie, output, name):
    import imageio_ffmpeg
    from PIL import Image, ImageDraw

    decoded_frames, duration = imageio_ffmpeg.count_frames_and_secs(str(movie))
    require(decoded_frames > 0 and duration > 0, f'Empty video {movie}')
    row = {'movie': movie.relative_to(output).as_posix(), 'decodedVideoFrames': decoded_frames,
           'decodedDurationSeconds': duration, 'sheets': []}
    with tempfile.TemporaryDirectory(prefix='company-review-') as temporary:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-threads', '2',
                        '-i', str(movie), '-vf', 'fps=2:start_time=0:round=down,scale=720:-2',
                        '-threads', '2', str(Path(temporary) / '%06d.jpg')], check=True)
        frames = sorted(Path(temporary).glob('*.jpg'))
        require(frames, f'No sampled frames for {name}')
        for start in range(0, len(frames), 12):
            page = frames[start:start + 12]
            with Image.open(page[0]) as first:
                height = first.height + 26
            sheet = Image.new('RGB', (1440, 6 * height), '#eeeeee')
            draw = ImageDraw.Draw(sheet)
            for index, frame in enumerate(page):
                x, y = index % 2 * 720, index // 2 * height
                draw.text((x + 6, y + 6), f'{name} {(start + index) / 2:.1f}s', fill='black')
                with Image.open(frame) as image:
                    sheet.paste(image, (x, y + 26))
            filename = f'{name}-sheet-{start // 12:03d}.jpg'
            sheet.save(output / filename, quality=87)
            row['sheets'].append({'path': filename, 'frames': len(page),
                                  'firstSampleSeconds': start / 2,
                                  'lastSampleSeconds': (start + len(page) - 1) / 2})
        row.update(sampledFrames=len(frames), firstSampleSeconds=0,
                   lastSampleSeconds=(len(frames) - 1) / 2)
        row['endAfterLastSampleSeconds'] = duration - row['lastSampleSeconds']
    return row


def write_page(output, summary):
    esc = html.escape
    sections = [
        '<h1>公司房间首包观看</h1>',
        f'<p>构建 {esc(summary["build"])} · 源码 {esc(summary["sourceCommit"])} · 观感待审。</p>',
        '<p>四段原始录像默认按 1× 播放，依次包含行走、接近、转向、坐下、起身离位及点击地面移动。</p>',
        '<p>room-a 与 room-b 共用原房间素材，仅椅子位置与朝向不同。当前覆盖原男女裤装与 0.47m 单椅。组合设施、保存、多楼层及普通电脑验证待完成。</p>',
        '<p>全时段按 2fps 抽样，每页两列六行，单帧宽 720 像素。时间标签为抽样输出时间，抽样间隔及末尾余段请结合原视频观看。连续人工观感验收待完成。</p>',
        '<p><a href="source/report.json">原始总报告</a> · <a href="summary.json">版本、时长与抽帧索引</a> · <a href="hashes.json">文件 SHA256</a></p>',
    ]
    for layout, body in CASES:
        name = f'{layout}-{body}'
        video = summary['cases'][name]
        title = f'{layout} · {"女性" if body == "female" else "男性"}'
        movie = esc(video['movie'], quote=True)
        sections.extend([f'<section aria-labelledby="{name}"><h2 id="{name}">{title}</h2>',
                         f'<video controls preload="metadata" playsinline poster="source/{name}/seated.png" aria-label="{title}原始1倍速录像" src="{movie}"></video>',
                         f'<p><a href="{movie}">原始 1× 录像</a> · <a href="source/{name}/report.json">本例报告</a> · 解码时长 {video["decodedDurationSeconds"]:.3f} 秒，共 {video["decodedVideoFrames"]} 帧。</p>',
                         '<div class="stills">'])
        for filename, caption in [('room.png', '布局载入'), ('seated.png', '坐下'), ('exit.png', '起身离位')]:
            url = f'source/{name}/{filename}'
            sections.append(f'<figure><figcaption>{caption}</figcaption><a href="{url}"><img loading="lazy" src="{url}" alt="{title}，{caption}"></a></figure>')
        sections.extend(['</div>', '<details><summary>查看全时段 2fps 抽帧</summary>',
                         f'<p>{video["sampledFrames"]} 个样本，首个 0 秒，末个 {video["lastSampleSeconds"]:.3f} 秒，末样本至解码结束 {video["endAfterLastSampleSeconds"]:.3f} 秒。</p>'])
        for sheet in video['sheets']:
            filename = sheet['path']
            sections.append(f'<a href="{filename}"><img loading="lazy" src="{filename}" alt="{title}抽帧 {sheet["firstSampleSeconds"]:.1f} 至 {sheet["lastSampleSeconds"]:.1f} 秒"></a>')
        sections.append('</details></section>')
    style = ('body{max-width:1440px;margin:auto;padding:24px;font:18px/1.6 system-ui;background:#eee;color:#181818;overflow-wrap:anywhere}'
             'video,img{display:block;max-width:100%;height:auto}video{width:100%}'
             '.stills{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px}'
             'figure{margin:0}summary{cursor:pointer;padding:16px}details img{margin:12px 0}'
             'a{color:#164d9b;overflow-wrap:anywhere}a:focus-visible,summary:focus-visible,video:focus-visible{outline:3px solid #164d9b;outline-offset:3px}')
    (output / 'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
                                     '<meta name="viewport" content="width=device-width,initial-scale=1">'
                                     '<title>公司房间首包观看</title><style>' + style + '</style><main>'
                                     + ''.join(sections) + '</main></html>', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--source-commit', required=True)
    args = parser.parse_args()
    require(re.fullmatch(r'[a-f0-9]{40}', args.source_commit), 'Provide a full 40-hex source commit')
    run, output = args.run.resolve(), args.out.resolve()
    require(not output.exists(), 'Output already exists; preserve it and select a new directory')
    require(not output.is_relative_to(run), 'Output must be outside the input run')
    report = validate(run, args.source_commit)
    sources = [run / 'report.json', run / 'executed-qa.cjs']
    for layout, body in CASES:
        sources.extend(run / f'{layout}-{body}' / name for name in
                       ('report.json', 'room.png', 'seated.png', 'exit.png', 'normal1x.webm'))
    before = [record(path, run) for path in sources]
    output.mkdir(parents=True, exist_ok=False)
    try:
        for source in sources:
            target = output / 'source' / source.relative_to(run)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            require(record(target, output / 'source') == record(source, run), 'Copy hash mismatch')
        summary = {'build': report['build'], 'sourceDigest': report['fixedSourceDigest'],
                   'sourceCommit': args.source_commit, 'technicalStatus': 'passed', 'visualReview': 'pending',
                   'targetPcTested': False, 'environment': report['environment'], 'limits': report['limits'],
                   'sampling': {'fps': 2, 'columns': 2, 'rows': 6, 'frameWidth': 720,
                                'filter': 'fps=2:start_time=0:round=down,scale=720:-2',
                                'timestamps': 'Output sampling grid, not original frame PTS. Discrete samples do not establish continuous visual acceptance.'},
                   'cases': {}}
        for layout, body in CASES:
            name = f'{layout}-{body}'
            summary['cases'][name] = contact_sheets(output / 'source' / name / 'normal1x.webm', output, name)
        require(before == [record(path, run) for path in sources], 'Input changed during packaging')
        (output / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        write_page(output, summary)
        files = [record(path, output) for path in sorted(output.rglob('*')) if path.is_file()]
        (output / 'hashes.json').write_text(json.dumps({'algorithm': 'SHA256', 'files': files}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    except Exception as error:
        (output / 'failure.json').write_text(json.dumps({'status': 'failed', 'error': str(error)}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        raise
    print(json.dumps({'out': str(output), 'build': report['build'], 'visualReview': 'pending'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
