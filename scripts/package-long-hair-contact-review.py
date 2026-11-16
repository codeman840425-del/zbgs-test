"""Package fixed hair/clothing/chair diagnostics and native normal-time media."""
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
STATUS = 'technical-actions-complete-contact-and-visual-review-required'
STILLS = [('pants-seated-side', '原裤装与原椅坐姿侧面'),
          ('skirt-dance-ended', '裙装指定短舞结束后'),
          ('skirt-moved-seated-side', '裙装与移位转向椅坐姿侧面'),
          ('skirt-moved-seated-back', '裙装与移位转向椅坐姿背面')]


def record(path):
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--room', default='evidence/m2-long-hair-contacts-363-v3')
    parser.add_argument('--out', default='evidence/m2-long-hair-contacts-review-363-v1')
    parser.add_argument('--build', default='36365874e557')
    parser.add_argument('--source-commit', default='fc8c91d4231cd8579548a33b72bad625dd14c189')
    args = parser.parse_args()
    room, out = ROOT/args.room, ROOT/args.out
    report = json.loads((room/'report.json').read_text(encoding='utf-8'))
    diagnostic = json.loads((room/'diagnostic-summary.json').read_text(encoding='utf-8'))
    if report['build'] != args.build or diagnostic['build'] != args.build or report['status'] != STATUS or diagnostic['status'] != STATUS or report['errors']:
        raise ValueError('Expected exact completed technical actions and unresolved contact review')
    for key in ['runtimeBuild', 'servedBuild']:
        if report['identity'][key]['shortId'] != args.build:
            raise ValueError('Recorded/served fixed identity mismatch')
    for name in ['normal1x.webm', 'executed-script.cjs']+[n+'.png' for n, _ in STILLS]:
        if not (room/name).is_file():
            raise FileNotFoundError(room/name)
    out.mkdir(parents=True, exist_ok=True)
    summary = {'build': args.build, 'sourceCommit': args.source_commit, 'sourceCommitProvenance': 'Exact fixed-source work order',
               'sourceDigest': report['identity']['runtimeBuild']['sourceDigest'], 'status': report['status'],
               'visualReview': 'not-accepted', 'knownDefects': ['Visible hair-root separation from original cap', 'Hair/chair overlap retained'],
               'ordinaryPcTested': False, 'sourceFiles': [], 'sheets': [],
               'sampling': {'fps': 2, 'framesPerPage': 12, 'sheetWidth': 1440, 'cpuThreads': 2},
               'contactDiagnostic': diagnostic,
               'limits': [report['scope'], *diagnostic['limits'],
                          'Every 200ms actual skinned vertices sampled inside chair OBBs. Local box depth is not full triangle penetration or continuous collision detection.',
                          'appearance.updateDynamics wrapper duration excludes garment update and rendering. Instrumentation and video are active on development PC.',
                          'v1 identity typo and v2 insufficient dance space failures retained at their original evidence locations.']}

    def register(path):
        summary['sourceFiles'].append(record(path))
        return html.escape(Path(os.path.relpath(path, out)).as_posix(), quote=True)

    report_link = register(room/'report.json')
    diagnostic_link = register(room/'diagnostic-summary.json')
    movie_link = register(room/'normal1x.webm')
    register(room/'executed-script.cjs')
    script_link = register(Path(__file__).resolve())
    parts = ['<h1>长发、衣物与椅子接触基线</h1>',
             f'<p>构建 {html.escape(args.build)} · 源码 {html.escape(args.source_commit)} · 技术动作已完成，接触与观感仍需审查。</p>',
             '<p>本基线仍有发根与原发帽脱离及长发与椅子重叠，观感未通过。记录使用原女性、指定长发、既有裤装与裙装，以及原椅和移位转向后的椅子。</p>',
             '<p>每 200 ms 采样实际蒙皮后顶点是否位于椅子 OBB 内。下表保留各阶段峰值，局部盒内深度仅描述盒体采样，完整三角穿透与连续碰撞仍未验证。</p>',
             f'<p><a href="{report_link}">完整原始报告</a> · <a href="{diagnostic_link}">原始诊断汇总</a> · <a href="summary.json">源文件 SHA 与抽帧索引</a> · <a href="{script_link}">包装脚本</a></p>',
             '<div class="table"><table><thead><tr><th>阶段</th><th>采样次数</th><th>OBB 内顶点峰值</th><th>局部盒内深度峰值（mm）</th></tr></thead><tbody>']
    for key, label in [('pants-seat', '原裤装 / 原椅'), ('skirt-moved-seat', '裙装 / 移位转向椅')]:
        row = diagnostic['phases'][key]
        parts.append(f'<tr><td>{label}</td><td>{row["samples"]}</td><td>{row["insideMax"]}</td><td>{row["depthMaxLocalM"]*1000:.2f}</td></tr>')
    parts.append('</tbody></table></div><h2>保留的早期失败</h2>')
    for folder, text in [('m2-long-hair-contacts-363-v1', 'v1 期望 SHA 录入错误，被实时主角色身份门禁拒绝。'),
                         ('m2-long-hair-contacts-363-v2', 'v2 在空间不足的位置使用默认舞蹈，任务返回 insufficient-dance-space。')]:
        old_path = ROOT/'evidence'/folder/'report.json'
        old = json.loads(old_path.read_text(encoding='utf-8'))
        old_link = register(old_path)
        if old['status'] != 'failed-or-incomplete':
            raise ValueError('Expected retained failed attempt')
        parts.append(f'<p>{text} <a href="{old_link}">原始失败记录</a></p>')
    parts.append('<p>v3 明确在安全位置 (−0.5, 1.8) 使用既有 dance-technical-once-v1 并完成任务。各次证据保留自身结果。</p>')
    parts.append(f'<video controls playsinline preload="metadata" src="{movie_link}"></video><p><a href="{movie_link}">完整原始正常时间录像</a></p><div class="stills">')
    for name, caption in STILLS:
        link = register(room/(name+'.png'))
        parts.append(f'<figure><figcaption>{caption}</figcaption><a href="{link}"><img loading="lazy" src="{link}" alt="{caption}"></a></figure>')
    parts.append('</div><h2>计时范围</h2><p>原始 solverTimes 实际计量 appearance.updateDynamics 调用，未包含衣物更新和渲染。rAF 间隔保留在诊断汇总中。开发机录制同时运行视频和几何诊断，普通电脑尚未验证。约 0.1 ms 的计时量化会产生零值，零值不能解释为零开销。</p>')
    with tempfile.TemporaryDirectory(prefix='long-hair-contact-review-') as temp:
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
        '<title>长发衣物椅子接触基线</title><style>body{max-width:1440px;margin:auto;padding:24px;font:18px/1.6 system-ui;background:#eee;color:#181818}'
        'img,video{display:block;width:100%;height:auto}.stills{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px}'
        'figure{margin:0}summary{padding:16px;cursor:pointer}.table{overflow-x:auto}table{border-collapse:collapse}th,td{padding:10px;border:1px solid #aaa}'
        'a{color:#164d9b}@media(max-width:480px){.stills{grid-template-columns:1fr}}</style>'+''.join(parts)+'</html>', encoding='utf-8')
    print(json.dumps({'out': str(out), 'frames': len(frames), 'sheets': len(summary['sheets']), 'visualReview': summary['visualReview']}))


if __name__ == '__main__':
    main()
