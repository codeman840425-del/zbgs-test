"""Package existing fixed surface-layer movies and stills for pending review."""
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
STILLS = [('original', '原始肤色与唇色，无皮肤叠层'),
          ('freckles', '雀斑 1.0，warm 肤色与 rose 唇色'),
          ('layered', '雀斑 1.0 + 腮红 0.65，warm 肤色与 rose 唇色'),
          ('layered-colors', '同叠层，deep 肤色、coral 唇色与 green 瞳色'),
          ('expression-neutral', 'neutral 表情'), ('expression-happy', 'happy 表情'),
          ('expression-aa', 'aa 表情'), ('gaze-speaking', '视线与说话'),
          ('side', '侧面'), ('seated-speaking', '坐姿说话')]


def file_record(path):
    with path.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    return {'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--room', default='evidence/m2-surface-room-aed-v1')
    parser.add_argument('--out', default='evidence/m2-surface-review-aed-v1')
    parser.add_argument('--build', default='aed6ec9ff061')
    parser.add_argument('--source-commit', default='57076e969971fc5caf010630cd2b99a25965deae')
    args = parser.parse_args()
    room = ROOT/args.room
    report = json.loads((room/'report.json').read_text(encoding='utf-8'))
    if report.get('status') != 'technical-checks-passed-visual-pending' or report.get('errors'):
        raise ValueError('Source recording failed or incomplete; preserve failure without a success page')
    if report['build'] != args.build or {b['body'] for b in report['bodies']} != {'female', 'male'}:
        raise ValueError('Expected exact fixed build and both bodies')
    for body in report['bodies']:
        if not body['checks'] or not all(c['passed'] is True for c in body['checks']):
            raise ValueError('Incomplete source checks')
        for key in ['runtimeBuild', 'servedBuild']:
            if body['identity'][key]['shortId'] != args.build:
                raise ValueError('Recorded and served build mismatch')
        for name in ['normal1x.webm', 'recipe-v7.json']+[name+'.png' for name, _ in STILLS]:
            if not (room/body['body']/name).is_file():
                raise FileNotFoundError(room/body['body']/name)
    out = ROOT/args.out
    out.mkdir(parents=True, exist_ok=True)
    summary = {'build': args.build, 'sourceCommit': args.source_commit,
               'sourceCommitProvenance': 'Exact fixed runtime source supplied in work order',
               'sourceDigest': report['bodies'][0]['identity']['runtimeBuild']['sourceDigest'],
               'visualReview': 'pending', 'ordinaryPcTested': False,
               'sampling': {'fps': 2, 'framesPerPage': 12, 'sheetWidth': 1440, 'cpuThreads': 2},
               'limits': report['limits']+[
                   'Original native videos include deliberately paused final instance-isolation checks; other actions run at 1x.',
                   'Loading durations differ between recordings. Same-name stills provide stage comparisons.',
                   'Pixel protection checks use the same rose lip base and exact package masks. They do not establish visual acceptance.',
                   'Only original female/male bases and freckles/blush tested. Other bodies, full makeup and body surfaces need their own evidence.',
                   'Agent commands set actual selections. Existing UI dropdown labels do not automatically synchronize and are not UI selection verification.',
               ], 'sourceFiles': [], 'bodies': {}}

    def register(path):
        summary['sourceFiles'].append(file_record(path))
        return html.escape(Path(os.path.relpath(path, out)).as_posix(), quote=True)

    report_link = register(room/'report.json')
    script_link = register(Path(__file__).resolve())
    register(room/'executed-script.cjs')
    sections = ['<h1>皮肤叠层固定版本观看</h1>',
                f'<p>构建 {html.escape(args.build)} · 源码 {html.escape(args.source_commit)} · 观感待审。</p>',
                '<p>本次样件为原女性与原男性的独立雀斑和腮红叠层，包含配色、表情、眨眼、视线、说话、行走和坐起记录。其他身体、完整妆容及身体其他表面的制作与验收仍需另有证据。</p>',
                '<p>原始录像末尾为实例隔离检查，主角色与对照角色均刻意暂停。其他动作按 1× 播放。两条录像加载时间不同，请各自播放并按同名原图对照。</p>',
                '<p>本包通过 agent 共用 command 设置实际配色和叠层。原 UI 下拉文字未自动同步，图注按实际输入标注。配色叠层图为 deep 肤色、coral 唇色、green 瞳色及同两层，截图下拉文字仍有显示限制，UI 选择路径尚未验证。</p>',
                '<p>记录来自开发机，普通电脑尚未验证。技术检查通过后，正常速度连续观感仍待审。</p>',
                f'<p><a href="{report_link}">完整浏览器原始报告</a> · <a href="summary.json">文件哈希与抽帧索引</a> · <a href="{script_link}">重建观看页脚本</a></p>']
    for body in report['bodies']:
        name = body['body']
        label = '女性' if name == 'female' else '男性'
        movie = room/name/'normal1x.webm'
        movie_link = register(movie)
        recipe_link = register(room/name/'recipe-v7.json')
        recipe = json.loads((room/name/'recipe-v7.json').read_text(encoding='utf-8'))
        if recipe['schema'] != 'workbench-appearance-recipe-v7' or not recipe['surface']['layers']:
            raise ValueError('Expected saved v7 surface recipe')
        protection = body['pixelProtection']
        row = {'recipeSchema': recipe['schema'], 'surface': recipe['surface'],
               'pixelProtection': protection, 'blink': body['blink'], 'sheets': []}
        summary['bodies'][name] = row
        sections.extend([f'<h2>{label}</h2>',
                         f'<video controls playsinline preload="metadata" src="{movie_link}"></video>',
                         f'<p><a href="{movie_link}">完整原始录像</a> · <a href="{recipe_link}">保存的 v7 配方</a></p>',
                         f'<p>同一 rose 唇色底图的浏览器像素对照记录，变化 {protection["changed"]} 像素，保护区变化 {protection["protectedChanged"]}，叠层遮罩外变化 {protection["outsideChanged"]}，alpha 变化 {protection["alphaChanged"]}。具体采样范围见原始报告。</p>',
                         '<div class="stills">'])
        for filename, caption in STILLS:
            still_link = register(room/name/(filename+'.png'))
            sections.append(f'<figure><figcaption>{caption}</figcaption><a href="{still_link}"><img loading="lazy" src="{still_link}" alt="{label} {caption}"></a></figure>')
        sections.append('</div>')
        with tempfile.TemporaryDirectory(prefix='surface-review-') as temp:
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-threads', '2', '-filter_threads', '2',
                            '-i', str(movie), '-vf', 'fps=2:start_time=0,scale=720:-2', '-threads', '2',
                            str(Path(temp)/'%06d.jpg')], check=True)
            frames = sorted(Path(temp).glob('*.jpg'))
            if not frames:
                raise ValueError('No decoded recording frames')
            for start in range(0, len(frames), 12):
                page = frames[start:start+12]
                with Image.open(page[0]) as sample:
                    cell_height = sample.height+26
                sheet = Image.new('RGB', (1440, math.ceil(len(page)/2)*cell_height), '#eee')
                draw = ImageDraw.Draw(sheet)
                for index, frame in enumerate(page):
                    x, y = (index % 2)*720, (index // 2)*cell_height
                    draw.text((x+6, y+6), f'{name} {(start+index)/2:.1f}s', fill='black')
                    with Image.open(frame) as image:
                        sheet.paste(image, (x, y+26))
                filename = f'{name}-sheet-{start//12:02d}.jpg'
                sheet.save(out/filename, quality=87)
                row['sheets'].append({'file': filename, 'frames': len(page), 'firstSampleSeconds': start/2,
                                      'lastSampleSeconds': (start+len(page)-1)/2})
            row['sampledFrames'] = len(frames)
        sections.append('<details><summary>完整时段 2fps 抽帧，含末尾刻意暂停片段</summary>')
        for sheet in row['sheets']:
            filename = sheet['file']
            sections.append(f'<a href="{filename}"><img loading="lazy" src="{filename}" alt="{label} {sheet["firstSampleSeconds"]:.1f}s – {sheet["lastSampleSeconds"]:.1f}s"></a>')
        sections.append('</details>')
    for source in summary['sourceFiles']:
        if file_record(ROOT/source['path']) != source:
            raise ValueError('Source file changed during packaging')
    (out/'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (out/'index.html').write_text(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>皮肤叠层固定版本观看</title><style>body{max-width:1440px;margin:auto;padding:24px;font:18px/1.6 system-ui;background:#eee;color:#181818}'
        'video,img{display:block;width:100%;height:auto}.stills{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:16px}'
        'figure{margin:0}summary{padding:16px;cursor:pointer}details img{margin:12px 0}a{color:#164d9b}@media(max-width:500px){.stills{grid-template-columns:1fr}}</style>'
        +''.join(sections)+'</html>', encoding='utf-8')
    print(json.dumps({'out': str(out), 'frames': {b: r['sampledFrames'] for b, r in summary['bodies'].items()},
                      'sheets': {b: len(r['sheets']) for b, r in summary['bodies'].items()}}))


if __name__ == '__main__':
    main()
