"""Package completed fixed lower-leg recordings for pending visual review."""
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
BODIES = {'male': '原男性', 'm2-male-lower-leg-v1': '小腿 +20 mm 派生男性'}
STILLS = {'base-standing': '基础身体侧面', 'dressed-standing': '独立装备侧面',
          'seated': '坐姿', 'risen': '起立后', 'expression': '说话与表情'}


def file_record(path):
    with path.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    return {'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', default='a367ba9dd96d')
    parser.add_argument('--source-commit', default='a40403857df58e2b2cff345bd6d2da34b6711111')
    parser.add_argument('--room', default='evidence/m2-lower-leg-room-a367-v3')
    parser.add_argument('--out', default='evidence/m2-lower-leg-review-a367-v1')
    args = parser.parse_args()
    room = ROOT/args.room
    report = json.loads((room/'report.json').read_text(encoding='utf-8'))
    if report.get('status') != 'technical-checks-passed-visual-pending' or report.get('errors'):
        raise ValueError('Recording failed or incomplete; preserve source evidence without a success page')
    if report['build'] != args.build or {b['body'] for b in report['bodies']} != set(BODIES):
        raise ValueError('Expected fixed build and both original/derived bodies')
    rows = {b['body']: b for b in report['bodies']}
    for body, row in rows.items():
        for key in ['runtimeBuild', 'servedBuild']:
            if row['identity'][key]['shortId'] != args.build:
                raise ValueError('Recorded runtime and served build identity mismatch')
        if [s['name'] for s in row['stages']] != list(STILLS) or row['restore'].get('applied') is not True:
            raise ValueError('Required screenshots or closed-context recipe restoration incomplete')
        for name in ['normal1x.webm', 'recipe.json', 'contact-samples.json']+[s+'.png' for s in STILLS]:
            if not (room/body/name).is_file():
                raise FileNotFoundError(room/body/name)
    out = ROOT/args.out
    out.mkdir(parents=True, exist_ok=True)
    summary = {
        'build': args.build, 'sourceCommit': args.source_commit,
        'sourceCommitProvenance': 'Fixed-source work order supplied commit identity',
        'sourceDigest': rows['male']['identity']['runtimeBuild']['sourceDigest'],
        'visualReview': 'pending', 'ordinaryPcTested': False,
        'sampling': {'fps': 2, 'framesPerPage': 12, 'sheetWidth': 1440, 'cpuThreads': 2},
        'sourceFiles': [], 'bodies': {}, 'historicalEvidence': [],
        'limits': [
            'One male local bilateral lower-leg +20 mm source derivative. No whole-body scaling.',
            'Shoes have new geometry/raw binds. Original shorts/top GLB bytes retain distinct derived-body fits.',
            'Female, socks, other body changes, unlisted equipment and frozen 30-second dance do not inherit acceptance.',
            'Recorded source floor alignment is explicit model offset. Scene ground belongs to actor root.',
            'Posed vertex samples and seat rectangle gaps do not establish continuous collision depth or zero intersections.',
            'Each video runs at original 1x. Different loading durations prevent exact phase synchronization.',
            report['scope'],
        ],
    }

    def register(path):
        summary['sourceFiles'].append(file_record(path))
        return html.escape(Path(os.path.relpath(path, out)).as_posix(), quote=True)

    report_link = register(room/'report.json')
    register(room/'executed-script.cjs')
    register(Path(__file__).resolve())
    source = ROOT/'assets-source/m2-lower-leg-proportion-v1'
    fit_link = register(source/'generated/fit.json')
    build_link = register(source/'generated/build-report.json')
    upper_link = register(source/'generated/upper-body-fit.json')
    inventory_link = register(source/'generated/package-files.json')
    sections = [
        '<h1>小腿比例固定版本对照</h1>',
        f'<p>构建 {html.escape(args.build)} · 源码 {html.escape(args.source_commit)} · 观感待审。</p>',
        '<p>派生样件沿双侧膝至踝轴各延长 20 mm。鞋的几何和脚部绑定重新适配，上衣、短裤保留原 GLB 字节并使用派生身体专属 fit。其他部位变形、女性、袜和旧 30 秒舞仍须各自验证。</p>',
        '<p>本版显式配置源鞋底平面与模型 Y 偏移。技术报告通过后，足底、坐姿与连续动作观感继续待审。开发机资料尚未完成普通电脑验证。</p>',
        f'<p><a href="{report_link}">本版原始报告</a> · <a href="{fit_link}">源 fit</a> · <a href="{build_link}">源变形与装备依据</a> · <a href="{upper_link}">上身等价证据</a> · <a href="{inventory_link}">源文件清单</a> · <a href="summary.json">哈希与抽帧索引</a></p>',
        '<h2>历史失败保留</h2>',
    ]
    for folder, text in [
        ('m2-lower-leg-room-807-v1', '807 初版在派生身体基础模式切换时拒绝，原始报告状态为 failed-or-incomplete。'),
        ('m2-lower-leg-room-778-v2', '778 版记录了动作技术检查，派生鞋底仍带约 −2 cm 源平面偏差，保留为鞋底对齐失败证据。'),
    ]:
        historical_path = ROOT/'evidence'/folder/'report.json'
        historical = json.loads(historical_path.read_text(encoding='utf-8'))
        history_link = register(historical_path)
        summary['historicalEvidence'].append({'build': historical['build'], 'status': historical['status'],
                                               'report': historical_path.relative_to(ROOT).as_posix()})
        sections.append(f'<p>{text} <a href="{history_link}">原始版本报告</a></p>')
    old_still = register(ROOT/'evidence/m2-lower-leg-room-778-v2/m2-male-lower-leg-v1/dressed-standing.png')
    old_samples = register(ROOT/'evidence/m2-lower-leg-room-778-v2/m2-male-lower-leg-v1/contact-samples.json')
    sections.append(f'<p><a href="{old_still}">778 派生身体原图</a> · <a href="{old_samples}">778 原始接触采样</a>。本页 a367 资料独立保留其构建身份。</p>')
    sections.append('<h2>完整原始 1× 录像</h2><p>两条录像的加载时间不同。请各自播放，或按下方同名截图阶段对照。</p><div class="pair">')
    for body, label in BODIES.items():
        movie_link = register(room/body/'normal1x.webm')
        recipe_link = register(room/body/'recipe.json')
        samples_link = register(room/body/'contact-samples.json')
        row = rows[body]
        summary['bodies'][body] = {'floorAlignment': row['floorAlignment'], 'seatedContact': row['seatedContact'],
                                   'recipeRestored': row['restore']['applied'], 'sheets': []}
        sections.append(f'<section><h3>{label}</h3><video controls playsinline preload="metadata" src="{movie_link}"></video>'
                        f'<p><a href="{movie_link}">原始录像</a> · <a href="{recipe_link}">保存配方</a> · <a href="{samples_link}">接触采样</a></p></section>')
    sections.append('</div><h2>记录中的地面与坐姿数据</h2><div class="table"><table><thead><tr><th>样件</th><th>源平面 Y（mm）</th><th>模型偏移 Y（mm）</th><th>坐姿鞋底最低 Y（mm）</th><th>坐姿衣物最小座面间距（mm）</th><th>选中下装顶点</th></tr></thead><tbody>')
    for body, label in BODIES.items():
        row = rows[body]
        floor, seat = row['floorAlignment'], row['seatedContact']
        sections.append(f'<tr><td>{label}</td><td>{floor["sourceFloorY"]*1000:.3f}</td><td>{floor["modelOffsetY"]*1000:.3f}</td>'
                        f'<td>{seat["soleMinimumY"]*1000:.3f}</td><td>{seat["garmentGapMin"]*1000:.3f}</td><td>{seat["selectedBottomVertices"]}</td></tr>')
    sections.append('</tbody></table></div><p>坐姿数据取实际姿态下当前座面矩形内的顶点，单位为 mm。连续时段的三角交叉与穿透深度仍需另测，当前未作零穿模结论。</p>')
    for name, caption in STILLS.items():
        sections.append(f'<h2>{caption}</h2><div class="pair">')
        for body, label in BODIES.items():
            still_link = register(room/body/(name+'.png'))
            sections.append(f'<figure><figcaption>{label}</figcaption><a href="{still_link}"><img loading="lazy" src="{still_link}" alt="{label} {caption}"></a></figure>')
        sections.append('</div>')
    sections.append('<h2>完整时段 2fps 抽帧</h2>')
    for body, label in BODIES.items():
        row = summary['bodies'][body]
        with tempfile.TemporaryDirectory(prefix='lower-leg-review-') as temp:
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-threads', '2', '-filter_threads', '2',
                            '-i', str(room/body/'normal1x.webm'), '-vf', 'fps=2:start_time=0,scale=720:-2',
                            '-threads', '2', str(Path(temp)/'%06d.jpg')], check=True)
            frames = sorted(Path(temp).glob('*.jpg'))
            if not frames:
                raise ValueError('No recording frames decoded')
            for start in range(0, len(frames), 12):
                page = frames[start:start+12]
                with Image.open(page[0]) as sample:
                    cell_height = sample.height+26
                sheet = Image.new('RGB', (1440, math.ceil(len(page)/2)*cell_height), '#eeeeee')
                draw = ImageDraw.Draw(sheet)
                for index, frame in enumerate(page):
                    x, y = (index % 2)*720, (index // 2)*cell_height
                    draw.text((x+6, y+6), f'{body} {(start+index)/2:.1f}s', fill='black')
                    with Image.open(frame) as image:
                        sheet.paste(image, (x, y+26))
                name = f'{body}-sheet-{start//12:02d}.jpg'
                sheet.save(out/name, quality=87)
                row['sheets'].append({'file': name, 'frames': len(page), 'firstSampleSeconds': start/2,
                                      'lastSampleSeconds': (start+len(page)-1)/2})
            row['sampledFrames'] = len(frames)
        sections.append(f'<details><summary>{label}</summary>')
        for sheet in row['sheets']:
            name = sheet['file']
            sections.append(f'<a href="{name}"><img loading="lazy" src="{name}" alt="{label} {sheet["firstSampleSeconds"]:.1f}s – {sheet["lastSampleSeconds"]:.1f}s"></a>')
        sections.append('</details>')
    for source_file in summary['sourceFiles']:
        if file_record(ROOT/source_file['path']) != source_file:
            raise ValueError('Source changed during packaging')
    (out/'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (out/'index.html').write_text(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>小腿比例固定版本对照</title><style>body{max-width:1440px;margin:auto;padding:24px;font:18px/1.6 system-ui;color:#181818;background:#eee}'
        'img,video{display:block;width:100%;height:auto}.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}'
        'figure{margin:0}summary{padding:16px;cursor:pointer}details img{margin:12px 0}a{color:#164d9b}.table{overflow-x:auto}'
        'table{border-collapse:collapse}th,td{padding:10px;border:1px solid #aaa;text-align:left}</style>'+''.join(sections)+'</html>', encoding='utf-8')
    print(json.dumps({'out': str(out), 'frames': {b: r['sampledFrames'] for b, r in summary['bodies'].items()},
                      'sheets': {b: len(r['sheets']) for b, r in summary['bodies'].items()}}))


if __name__ == '__main__':
    main()
