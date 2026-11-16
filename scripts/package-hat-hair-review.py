"""Package native hat/hair evidence and 2 fps sheets for pending review."""
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
STILLS = [('front', '正面帽子与原女性'), ('side', '侧面帽檐与马尾'), ('back', '背面帽子与马尾'),
          ('expression-glasses-ears', '表情、眼镜与耳饰'), ('seated', '坐姿'), ('unloaded', '卸载并恢复原发型'), ('cold-restored', '新上下文恢复后')]


def record(path):
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--room', default='evidence/m2-hat-hair-room-6e0-v1')
    parser.add_argument('--out', default='evidence/m2-hat-hair-review-6e0-v1')
    parser.add_argument('--build', default='6e053cd1e905')
    parser.add_argument('--source-commit', default='b3d6bb3d197bcb6a7b8d7a718b77bf05bc59c5f5')
    args = parser.parse_args()
    room, out = ROOT/args.room, ROOT/args.out
    report = json.loads((room/'report.json').read_text(encoding='utf-8'))
    if report['build'] != args.build or report['status'] != 'technical-checks-passed-visual-pending' or report['errors']:
        raise ValueError('Expected completed fixed hat browser evidence')
    if not all(c['passed'] is True for c in report['checks']):
        raise ValueError('Hat browser checks incomplete')
    for key in ['runtimeBuild', 'servedBuild']:
        if report['identity'][key]['shortId'] != args.build:
            raise ValueError('Fixed build identity mismatch')
    for name in ['normal1x.webm', 'executed-script.cjs', 'appearance-v7.json', 'hat-side-record.json']+[n+'.png' for n, _ in STILLS]:
        if not (room/name).is_file():
            raise FileNotFoundError(room/name)
    recipe = json.loads((room/'appearance-v7.json').read_text(encoding='utf-8'))
    side = json.loads((room/'hat-side-record.json').read_text(encoding='utf-8'))
    if recipe.get('schema') not in {'workbench-appearance-recipe-v6', 'workbench-appearance-recipe-v7'} or side.get('schema') != 'zbgs-rigid-accessory-layer-state-v1':
        raise ValueError('Expected appearance recipe plus explicit hat side-record')
    out.mkdir(parents=True, exist_ok=True)
    summary = {'build': args.build, 'sourceCommit': args.source_commit, 'sourceCommitProvenance': 'Exact fixed-source work order',
               'sourceDigest': report['identity']['runtimeBuild']['sourceDigest'], 'visualReview': 'pending',
               'ordinaryPcTested': False, 'sourceFiles': [], 'sheets': [], 'nativeRecipe': recipe,
               'hatSideRecord': side, 'checks': [{'name': c['name'], 'passed': c['passed']} for c in report['checks']],
               'limits': report['limits']+['Normal-speed movement and expression evidence is development-PC material without a performance claim.',
                          'The hat side-record is replayed explicitly. It is separate from atomic v7 appearance storage.',
                          'Exact original female neutral face plus rootjoin-v2 ponytail only. Other hairs, bodies and arbitrary hat compatibility require separate evidence.',
                          'Hat and full hair visual acceptance remains pending.']}

    def register(path):
        summary['sourceFiles'].append(record(path))
        return html.escape(Path(os.path.relpath(path, out)).as_posix(), quote=True)

    report_link = register(room/'report.json'); movie_link = register(room/'normal1x.webm'); script_link = register(room/'executed-script.cjs')
    recipe_link = register(room/'appearance-v7.json'); side_link = register(room/'hat-side-record.json'); script_pack_link = register(Path(__file__).resolve())
    parts = ['<h1>帽子与长发固定版本观看</h1>',
             f'<p>构建 {html.escape(args.build)} · 源码 {html.escape(args.source_commit)} · 观感待审。</p>',
             '<p>这是帽子专属准入记录，使用原女性中性脸、精确 rootjoin-v2 长发和独立刚性帽子。页面保留帽子/马尾正侧背面、表情配饰、坐姿、卸载和新上下文恢复。</p>',
             f'<p>帽子状态由单独 hat-side-record.json 明确回放，当前保存的外观配方是 {html.escape(recipe["schema"])}。它们的恢复路径和语义分别记录，不能把帽子状态当作原子 v7 外观字段。</p>',
             '<p>开发机记录不提供性能结论，普通电脑和任意身体/发型兼容性尚未验证。</p>',
             f'<p><a href="{report_link}">原始浏览器报告</a> · <a href="{recipe_link}">appearance-v7 配方</a> · <a href="{side_link}">帽子 side-record</a> · <a href="summary.json">文件 SHA 与抽帧索引</a> · <a href="{script_pack_link}">包装脚本</a></p>',
             f'<video controls playsinline preload="metadata" src="{movie_link}"></video><p><a href="{movie_link}">完整原始 1× 录像</a></p><div class="stills">']
    for name, caption in STILLS:
        link = register(room/(name+'.png'))
        parts.append(f'<figure><figcaption>{caption}</figcaption><a href="{link}"><img loading="lazy" src="{link}" alt="{caption}"></a></figure>')
    parts.append('</div><p>首个不兼容发型请求、缺失资源保留和重试均写入原始报告。帽子和马尾的连续动态、表情、视线及动作观感仍待主线审查。</p>')
    with tempfile.TemporaryDirectory(prefix='hat-hair-review-') as temp:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-threads', '2', '-filter_threads', '2', '-i', str(room/'normal1x.webm'),
                        '-vf', 'fps=2:start_time=0,scale=720:-2', '-threads', '2', str(Path(temp)/'%06d.jpg')], check=True)
        frames = sorted(Path(temp).glob('*.jpg'))
        if not frames:
            raise ValueError('No frames decoded from native hat movie')
        for start in range(0, len(frames), 12):
            page = frames[start:start+12]
            with Image.open(page[0]) as sample: cell_height = sample.height+26
            sheet = Image.new('RGB', (1440, math.ceil(len(page)/2)*cell_height), '#eee'); draw = ImageDraw.Draw(sheet)
            for index, frame in enumerate(page):
                x, y = (index%2)*720, (index//2)*cell_height; draw.text((x+6,y+6), f'{args.build} {(start+index)/2:.1f}s', fill='black')
                with Image.open(frame) as image: sheet.paste(image, (x,y+26))
            name = f'sheet-{start//12:02d}.jpg'; sheet.save(out/name, quality=87)
            summary['sheets'].append({'file':name,'frames':len(page),'firstSampleSeconds':start/2,'lastSampleSeconds':(start+len(page)-1)/2})
        summary['sampledFrames'] = len(frames)
    parts.append('<details><summary>完整时段 2fps 辅助抽帧</summary>')
    for sheet in summary['sheets']:
        name = sheet['file']; parts.append(f'<a href="{name}"><img loading="lazy" src="{name}" alt="{sheet["firstSampleSeconds"]:.1f}s – {sheet["lastSampleSeconds"]:.1f}s"></a>')
    parts.append('</details>')
    for source in summary['sourceFiles']:
        if record(ROOT/source['path']) != source: raise ValueError('Source changed during packaging')
    (out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>帽子与长发固定版本观看</title><style>body{max-width:1440px;margin:auto;padding:24px;font:18px/1.6 system-ui;background:#eee;color:#181818}img,video{display:block;width:100%;height:auto}.stills{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px}figure{margin:0}summary{padding:16px;cursor:pointer}a{color:#164d9b}@media(max-width:480px){.stills{grid-template-columns:1fr}}</style>'+''.join(parts)+'</html>',encoding='utf-8')
    print(json.dumps({'out':str(out),'frames':len(frames),'sheets':len(summary['sheets']),'visualReview':summary['visualReview']}))


if __name__ == '__main__': main()
