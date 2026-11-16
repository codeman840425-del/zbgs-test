"""Package fixed socks recordings and 2 fps contact sheets for pending review."""
import argparse
import hashlib
import html
import json
import math
import os
import subprocess
import tempfile
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]


def file_record(path):
    with path.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    return {
        'path': path.relative_to(ROOT).as_posix(),
        'bytes': path.stat().st_size,
        'sha256': digest,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', default='4fdc1b3e1667')
    parser.add_argument('--source-commit', default='af47b6a')
    parser.add_argument('--room', default='evidence/m2-socks-room-4fd-v1')
    parser.add_argument('--detail', default='evidence/m2-socks-detail-4fd-v1')
    parser.add_argument('--out', default='evidence/m2-socks-review-4fd-v1')
    args = parser.parse_args()
    room = ROOT / args.room
    detail = ROOT / args.detail
    out = ROOT / args.out
    report = json.loads((room / 'report.json').read_text(encoding='utf-8'))
    diagnostic = json.loads((detail / 'report.json').read_text(encoding='utf-8'))
    if report['build'] != args.build or diagnostic['build'] != args.build:
        raise ValueError('Source reports must match the requested fixed build')
    if report['status'] != 'technical-checks-passed-visual-pending':
        raise ValueError('Room report must contain completed technical checks')
    if {b['body'] for b in report['bodies']} != {'female', 'male'}:
        raise ValueError('Room report must contain both bodies')
    if {b['body'] for b in diagnostic['bodies']} != {'female', 'male'}:
        raise ValueError('Diagnostic report must contain both bodies')
    for body in report['bodies']:
        for stage in body['stages']:
            if stage['snapshot']['buildInfo']['shortId'] != args.build:
                raise ValueError('A room stage has a mismatched fixed build')
    out.mkdir(parents=True, exist_ok=True)
    summary = {
        'build': args.build,
        'sourceCommit': args.source_commit,
        'sourceCommitProvenance': 'Fixed-source commit supplied with packaging work order',
        'sourceDigest': report['bodies'][0]['identity']['runtimeBuild']['sourceDigest'],
        'visualReview': 'pending',
        'targetPcTested': False,
        'sampling': {'fps': 2, 'framesPerPage': 12, 'sheetWidth': 1440, 'cpuThreads': 2},
        'sourceFiles': [],
        'bodies': {},
        'limits': report['limits'] + [
            'Female original Body retains painted dark long stockings above the independent white crew layer; male original Body retains a dark ring.',
            diagnostic['scope'],
            'Contact sheets cover the recording timeline at 2 fps; visual review remains pending.',
        ],
    }

    def link(path):
        return html.escape(Path(os.path.relpath(path, out)).as_posix(), quote=True)

    def register(path):
        summary['sourceFiles'].append(file_record(path))
        return link(path)

    room_report_link = register(room / 'report.json')
    diagnostic_report_link = register(detail / 'report.json')
    script_link = register(Path(__file__).resolve())
    sections = [
        '<h1>独立袜层固定版本观看</h1>',
        f'<p>构建 {html.escape(args.build)} · 源码 {html.escape(args.source_commit)} · 观感待审。</p>',
        '<p>女性原 Body 的深色长袜贴图仍在白色短袜上方，男性原 Body 的深色袜口环仍保留。当前新增独立网格没有消除这些贴图。</p>',
        '<p>原始录像按 1× 播放。近景使用小腿诊断相机裁切。开发机资料尚未完成普通电脑验证。源鞋三角交叉计数仅记录交叉，穿透深度仍未测量。</p>',
        f'<p><a href="{room_report_link}">房间原始报告</a> · <a href="{diagnostic_report_link}">近景原始报告</a> · <a href="summary.json">文件哈希和抽帧索引</a> · <a href="{script_link}">重建脚本</a></p>',
    ]
    for body in ['female', 'male']:
        sections.append(f'<h2>{"女性" if body == "female" else "男性"}</h2>')
        recipe_link = register(room / body / 'recipe.json')
        sections.append(f'<p><a href="{recipe_link}">保存配方</a></p>')
        summary['bodies'][body] = {}
        for kind, folder, filename, title in [
            ('room', room, 'normal1x.webm', '正常房间镜头'),
            ('diagnostic', detail, 'diagnostic1x.webm', '小腿诊断相机裁切'),
        ]:
            movie = folder / body / filename
            movie_link = register(movie)
            sections.extend([
                f'<h3>{title}</h3>',
                f'<video controls preload="metadata" playsinline src="{movie_link}"></video>',
                f'<p><a href="{movie_link}">完整原始 1× 录像</a></p>',
            ])
            stills = [('before.png', '原服装，无新增袜层'), ('socks-front.png', '新增独立袜层，正面'),
                      ('socks-side.png', '新增独立袜层，侧面'), ('seated-side.png', '坐姿侧面')]
            if kind == 'room' and body == 'male':
                stills.append(('long-pants.png', '同袜层配长裤'))
            if kind == 'diagnostic':
                stills = [('standing-shoe-contact.png', '站立鞋口近景'),
                          ('seated-shoe-contact.png', '坐姿鞋口近景'),
                          ('risen-shoe-contact.png', '起立后鞋口近景')]
            sections.append('<div class="stills">')
            for filename, caption in stills:
                still_link = register(folder / body / filename)
                sections.append(f'<figure><figcaption>{caption}</figcaption><a href="{still_link}"><img loading="lazy" src="{still_link}" alt="{caption}"></a></figure>')
            sections.append('</div>')
            row = {'movie': movie.relative_to(ROOT).as_posix(), 'sheets': []}
            with tempfile.TemporaryDirectory(prefix='socks-review-') as temp:
                subprocess.run([
                    imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-threads', '2',
                    '-i', str(movie), '-vf', 'fps=2:start_time=0,scale=720:-2',
                    '-threads', '2', str(Path(temp) / '%06d.jpg'),
                ], check=True)
                frames = sorted(Path(temp).glob('*.jpg'))
                if not frames:
                    raise ValueError(f'No frames decoded from {movie}')
                for start in range(0, len(frames), 12):
                    page = frames[start:start + 12]
                    with Image.open(page[0]) as sample:
                        cell_height = sample.height + 26
                    sheet = Image.new('RGB', (1440, math.ceil(len(page) / 2) * cell_height), '#eeeeee')
                    draw = ImageDraw.Draw(sheet)
                    for index, frame in enumerate(page):
                        x = (index % 2) * 720
                        y = (index // 2) * cell_height
                        draw.text((x + 6, y + 6), f'{body} {kind} {(start + index) / 2:.1f}s', fill='black')
                        with Image.open(frame) as image:
                            sheet.paste(image, (x, y + 26))
                    name = f'{body}-{kind}-sheet-{start // 12:02d}.jpg'
                    sheet.save(out / name, quality=87)
                    row['sheets'].append({'file': name, 'frames': len(page),
                                          'firstSampleSeconds': start / 2,
                                          'lastSampleSeconds': (start + len(page) - 1) / 2})
                row['sampledFrames'] = len(frames)
                row['lastSampleSeconds'] = (len(frames) - 1) / 2
            summary['bodies'][body][kind] = row
            sections.append('<details><summary>完整时段 2fps 辅助抽帧</summary>')
            for sheet in row['sheets']:
                name = sheet['file']
                sections.append(f'<a href="{name}"><img loading="lazy" src="{name}" alt="{body} {kind} {sheet["firstSampleSeconds"]:.1f}s – {sheet["lastSampleSeconds"]:.1f}s"></a>')
            sections.append('</details>')
    # Verify native inputs were stable throughout extraction.
    for source in summary['sourceFiles']:
        if file_record(ROOT / source['path']) != source:
            raise ValueError(f'Source changed during packaging: {source["path"]}')
    (out / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (out / 'index.html').write_text(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>独立袜层固定版本观看</title><style>body{max-width:1440px;margin:auto;padding:24px;font:18px/1.6 system-ui;background:#eee;color:#181818}'
        'video,img{display:block;max-width:100%;height:auto}video{width:100%}.stills{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}'
        'figure{margin:0}summary{cursor:pointer;padding:16px}details img{margin:12px 0}a{color:#164d9b}</style>'
        + ''.join(sections) + '</html>', encoding='utf-8')
    print(json.dumps({'out': str(out), 'sheets': {
        body: {kind: len(row['sheets']) for kind, row in kinds.items()}
        for body, kinds in summary['bodies'].items()
    }}))


if __name__ == '__main__':
    main()
