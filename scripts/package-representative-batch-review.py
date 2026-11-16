"""Build a native-video review page after all published browser sessions finish.

No encoding, browser, GPU, or frame-samples JSON parsing. Original evidence stays
in the room directory. Optional visual-review.json is a separate root-authored
record and must name the same build. Run again after updating that record.
"""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    'female-round-full': 'female', 'female-long-slender': 'female',
    'female-square-athletic': 'female', 'female-soft-wide': 'female',
    'male-wide-muscular': 'male', 'male-long-lean': 'male',
    'male-round-stocky': 'male', 'male-angular-athletic': 'male',
}
PASSED = 'technical-checks-passed-visual-pending'
STILLS = [
    ('full-front', '全身正面'), ('full-side', '全身侧面'), ('full-back', '全身背面'),
    ('face-front', '脸部正面'), ('face-side', '脸部侧面'), ('face-back', '脸部背面'),
    ('face-neutral', '脸部正面 · 中性'), ('face-happy', '脸部正面 · 笑容'),
    ('face-aa', '脸部正面 · 张口'), ('face-speaking', '笑容、讲话与眨眼'),
    ('base', '基础模式'), ('seated', '原侧视 · 坐稳'), ('standing', '原侧视 · 起身后'),
    ('seated-front', '补充正面 · 坐稳'), ('standing-front', '补充正面 · 起身后'), ('failure', '失败现场'),
]
REQUIRED_STILLS = {'full-front', 'full-side', 'full-back', 'face-neutral', 'face-happy',
                   'face-aa', 'face-speaking', 'base', 'seated', 'standing'}


def batch_layout(index):
    if index.get('schema') != 'representative-runtime-index-v1':
        raise ValueError('Missing actual executed runtime index')
    partial = index.get('completeBatch') is False
    failed = {'female-long-slender-v2', 'male-long-lean-v2'}
    expected = {key+'-v2': sex for key, sex in EXPECTED.items() if key+'-v2' not in failed} if partial else EXPECTED
    presets = index.get('presets', [])
    if len(presets) != len(expected) or {p.get('id') for p in presets} != set(expected):
        raise ValueError('Executed index has unexpected or duplicate published identities')
    if any(p.get('sex') != expected[p['id']] for p in presets):
        raise ValueError('Executed index sex differs from preset identity')
    unpublished = index.get('unpublished', [])
    if partial:
        if index.get('declaredBatchSize') != 8 or len(unpublished) != 2 or {p.get('id') for p in unpublished} != failed:
            raise ValueError('Six-candidate preview must declare both original source failures')
        if any(p.get('status') != 'not-published-source-failed' for p in unpublished):
            raise ValueError('Unpublished entries must retain source-failure status')
    elif unpublished:
        raise ValueError('Complete legacy batch cannot contain unpublished outcomes')
    coverage = {'declaredBatchSize': 8, 'publishedCount': len(presets), 'completeBatch': not partial, 'unpublished': unpublished,
                'faceParameterLimit': '脸宽参数仅部分实现，源意图投影差与实际轮廓仍待审查。' if partial else None}
    return expected, coverage


def load_json(path):
    if path.stat().st_size > 8 * 1024 * 1024:
        raise ValueError('Expected a small report or index, not frame traces: ' + str(path))
    return json.loads(path.read_text(encoding='utf-8-sig'))


def escape(value):
    return html.escape(str(value), quote=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, epilog='Optional visual review format: {"build":"<12hex>","cases":{"<preset>":{"status":"pending","defects":[],"notes":""}}}')
    parser.add_argument('--room', type=Path, default=Path('evidence/m2-representative-room-374-v1'))
    parser.add_argument('--out', type=Path, default=Path('evidence/m2-representative-review-374-v1'))
    parser.add_argument('--build', required=True)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--visual-review', type=Path)
    args = parser.parse_args()
    room, out = (ROOT / args.room).resolve(), (ROOT / args.out).resolve()
    if room == out:
        raise ValueError('Use a separate review directory to preserve original evidence')
    if len(args.build) != 12 or len(args.source_commit) != 40 or any(c not in '0123456789abcdef' for c in args.build + args.source_commit):
        raise ValueError('Provide the exact 12-hex build and 40-hex source commit')
    report_path = room / 'report.json'
    report = load_json(report_path)
    if report.get('build') != args.build or report.get('status') not in {PASSED, 'incomplete-or-failed'}:
        raise ValueError('Room report is running, unknown, or from a different build')
    cases = report.get('cases', [])
    index_path = room / 'executed-runtime-index.json'
    index = load_json(index_path)
    expected, coverage = batch_layout(index)
    presets = {p['id']: p for p in index['presets']}
    if len(cases) != len(expected) or {c.get('id') for c in cases} != set(expected):
        raise ValueError('Wait for every distinct published preset session to finish')
    modern_capture = report.get('captureSchema') == 'representative-room-capture-v2'
    if not coverage['completeBatch'] and not modern_capture:
        raise ValueError('Partial preview requires an explicit current capture scope')
    if modern_capture:
        if report.get('batchCoverage') != coverage:
            raise ValueError('Capture coverage differs from executed index')
        if report.get('runtimeIndexSha256') != hashlib.sha256(index_path.read_bytes()).hexdigest():
            raise ValueError('Executed runtime index SHA differs from capture receipt')
    visual_path = (ROOT / args.visual_review).resolve() if args.visual_review else out / 'visual-review.json'
    visual = load_json(visual_path) if visual_path.exists() else {'build': args.build, 'cases': {}}
    if visual.get('build') != args.build or not isinstance(visual.get('cases'), dict) or not set(visual['cases']).issubset(expected):
        raise ValueError('Visual review must name this exact build and valid preset IDs')
    if any(not isinstance(v, dict) for v in visual['cases'].values()):
        raise ValueError('Each visual review entry must be an object')
    summary = {'build': args.build, 'sourceCommit': args.source_commit,
               'sourceCommitProvenance': 'Explicit fixed-source work order; browser receipts independently pin sourceDigest',
               'roomStatus': report['status'], 'batchCoverage': coverage, 'captureSchema': report.get('captureSchema'),
               'indexSourceManifestSha256': index.get('sourceManifestSha256'), 'indexAuditSha256': index.get('auditSha256'),
               'ordinaryPcTested': False, 'cases': [], 'files': []}
    registered = {}

    def link(path):
        return escape(Path(os.path.relpath(path, out)).as_posix())

    def register(path):
        if not path.is_file():
            raise FileNotFoundError(path)
        key = str(path.resolve())
        if key not in registered:
            with path.open('rb') as stream:
                sha = hashlib.file_digest(stream, 'sha256').hexdigest()
            registered[key] = {'file': Path(os.path.relpath(path, out)).as_posix(), 'bytes': path.stat().st_size, 'sha256': sha}
            summary['files'].append(registered[key])
        return link(path)

    report_link = register(report_path)
    index_link = register(index_path)
    script_link = register(room / 'executed-script.cjs')
    register(Path(__file__).resolve())
    if visual_path.exists():
        register(visual_path)
    sections, options = [], []
    for number, case in enumerate(cases):
        identifier = case['id']
        preset = presets[identifier]
        folder = room / identifier
        if case.get('sex') != expected[identifier] or preset.get('sex') != expected[identifier] or case.get('build') != args.build:
            raise ValueError('Preset sex or build identity mismatch: ' + identifier)
        if case.get('status') not in {PASSED, 'failed'}:
            raise ValueError('Session not finished: ' + identifier)
        native_report = folder / 'report.json'
        if load_json(native_report) != case:
            raise ValueError('Per-session report and final room report differ: ' + identifier)
        receipt = case.get('identity', {})
        if case['status'] == PASSED:
            if case.get('errors') or not case.get('checks') or any(c.get('passed') is not True for c in case['checks']):
                raise ValueError('Passed status conflicts with actual checks: ' + identifier)
            for name in ['runtimeBuild', 'servedBuild']:
                identity = receipt.get(name, {})
                if identity.get('shortId') != args.build or not identity.get('sourceDigest', '').startswith(args.build):
                    raise ValueError('Fixed build receipt missing or mismatched: ' + identifier)
            if receipt['runtimeBuild']['sourceDigest'] != receipt['servedBuild']['sourceDigest']:
                raise ValueError('Runtime and served source digests differ: ' + identifier)
            primary = receipt.get('primary', {})
            if primary.get('id') != preset['profile']['id'] or primary.get('actualSha256') != preset['profile']['sha256'] or primary.get('declaredSha256') != preset['profile']['sha256']:
                raise ValueError('Actual body identity differs from executed index: ' + identifier)
            if any(t.get('result', {}).get('state') != 'completed' for t in case.get('tasks', [])):
                raise ValueError('Passed session contains incomplete action tasks: ' + identifier)
            required_stills = REQUIRED_STILLS | ({'face-front', 'face-side', 'face-back'} if modern_capture else set())
            front = case.get('supplementalFrontSeat', {})
            if not coverage['completeBatch'] and front.get('requested') is not True:
                raise ValueError('Partial preview is missing its supplemental front seat scope: ' + identifier)
            if front.get('requested'):
                if front.get('camera') != 'inspect-full-front' or front.get('completed') is not True:
                    raise ValueError('Supplemental front seat capture is incomplete: ' + identifier)
                tasks = {task['requestId']: task for task in case.get('tasks', [])}
                if any(tasks.get(front.get(key), {}).get('kind') != kind for key, kind in [('sitRequestId', 'sit'), ('standRequestId', 'stand')]):
                    raise ValueError('Supplemental front seat tasks are not identified: ' + identifier)
                required_stills |= {'seated-front', 'standing-front'}
            missing = [name for name in required_stills if not (folder / (name + '.png')).is_file()]
            if missing:
                raise ValueError('Completed session is missing screenshots: ' + identifier + ' ' + ', '.join(sorted(missing)))
        label = preset.get('label', identifier)
        options.append(f'<option value="case-{number}">{escape(label)} · {escape(identifier)}</option>')
        technical = '技术检查通过' if case['status'] == PASSED else '技术检查失败'
        review = visual['cases'].get(identifier, {})
        visual_status = review.get('status', 'pending')
        body = [f'<section id="case-{number}" class="case"' + ('' if number == 0 else ' hidden') + '>',
                f'<h2>{escape(label)}</h2><p>{escape(identifier)} · {technical} · root观感记录 {escape(visual_status)}</p>',
                f'<p>身体 SHA256 <code>{escape(preset["profile"]["sha256"])}</code></p>',
                f'<p><a href="{register(native_report)}">本体原始报告</a></p>',
                f'<video controls playsinline preload="none" data-native="{register(folder / "normal1x.webm")}"></video>',
                '<p>完整原始录像默认 1×，保留加载、动作、恢复及失败过程。各片加载起点独立。</p>']
        body.append(f'<p><a href="{link(folder / "normal1x.webm")}">直接打开原始录像</a></p>')
        if case.get('error') or case.get('errors'):
            body.append('<details open><summary>实际失败记录</summary><pre>' + escape(case.get('error') or '\n'.join(case['errors'])) + '</pre></details>')
        if case.get('supplementalFrontSeat', {}).get('requested'):
            body.append('<p>补充正面坐入/起身保留在同一原速录像内，原侧视镜头仍按其实际家具遮挡记录。</p>')
        if case.get('hairLimit'):
            body.append('<p class="notice">发型组合缺口 ' + escape(case['hairLimit']) + '</p>')
        if review:
            body.append('<details open><summary>root填写的观感记录</summary><pre>' + escape(json.dumps(review, ensure_ascii=False, indent=2)) + '</pre></details>')
        else:
            body.append('<p>尚无root填写的观感记录。</p>')
        frames = case.get('frameTimes', {})
        if frames:
            def metric(key):
                value = frames.get(key)
                return f'{value:.2f}' if isinstance(value, (int, float)) else '未记录'
            body.append('<p>开发机录制期间 rAF 样本 ' + escape(frames.get('sampleCount', '未记录')) +
                        '，p95 ' + metric('p95') + ' ms，最大 ' + metric('max') + ' ms，超过50 ms ' +
                        escape(frames.get('over50ms', '未记录')) + '。此值来自原报告，含录制开销，普通电脑未测。</p>')
        recipe = folder / 'recipe.json'
        if recipe.exists():
            body.append(f'<p><a href="{register(recipe)}">实际保存的外观配方</a></p>')
        trace = folder / 'frame-samples.json'
        if trace.exists():
            body.append(f'<p><a href="{register(trace)}">原始逐帧时间与100ms状态采样</a>，页面不解析该大文件。</p>')
        body.append('<div class="stills">')
        shown = []
        for filename, caption in STILLS:
            path = folder / (filename + '.png')
            if not path.exists():
                continue
            shown.append(filename)
            image = register(path)
            stage = folder / (filename + '-stage.png')
            stage_link = f' · <a href="{register(stage)}">原始舞台图</a>' if stage.exists() else ''
            body.append(f'<figure><figcaption>{caption}{stage_link}</figcaption><a href="{image}" target="_blank" rel="noopener"><img loading="lazy" src="{image}" alt="{caption}"></a></figure>')
        body.append('</div>')
        absent = [caption for filename, caption in STILLS[3:6] if filename not in shown and not (filename == 'face-front' and 'face-neutral' in shown)]
        if absent:
            body.append('<p>本报告未采集独立截图 ' + escape('、'.join(absent)) + '。正面表情图及全身正侧背图按实际文件展示。</p>')
        body.append('</section>')
        sections.extend(body)
        summary['cases'].append({'id': identifier, 'sex': case['sex'], 'technicalStatus': case['status'], 'visualReview': review or {'status': 'pending'},
                                 'bodySha256': preset['profile']['sha256'], 'sourceDigest': receipt.get('runtimeBuild', {}).get('sourceDigest'),
                                 'frameTimes': frames, 'stills': shown, 'hairLimit': case.get('hairLimit'),
                                 'supplementalFrontSeat': case.get('supplementalFrontSeat')})
    if report['status'] == PASSED and any(c['status'] != PASSED for c in cases):
        raise ValueError('Room success status conflicts with a failed session')
    title = '六候选原速观看 · 两项源失败' if not coverage['completeBatch'] else '八预设原速观看'
    header = [f'<h1>{title}</h1><p>构建 <code>{escape(args.build)}</code> · 源码 <code>{escape(args.source_commit)}</code></p>',
              '<p class="notice">失败卷发候选未上线。本批仅覆盖各自配套裤装；长发椅背折弯等接触和连续观感仍待审，普通电脑未测。</p>',
              '<p>技术状态按实际报告显示。未填写人工记录的角色观感待审，几何、程序检查和动作终态不代表造型通过。</p>',
              f'<p><a href="{report_link}">整批原始报告</a> · <a href="{index_link}">实际执行资源索引</a> · <a href="{script_link}">实际执行脚本</a> · <a href="summary.json">来源 SHA 与统计</a></p>',
              '<p>本动作片未重新覆盖所有配色错误路径，同会话改变外观再恢复和女性 bob 等补充范围按对应独立证据确认。</p>']
    if not coverage['completeBatch']:
        header.insert(1, '<p class="notice">原批声明8项，实际发布6个候选（3女3男），2项源失败未发布。脸宽参数仅部分实现，技术完成与观感仍分别记录。</p>')
        header.append('<details><summary>两项未发布源结果</summary><ul>' + ''.join('<li><code>'+escape(row['id'])+'</code> · '+escape(row.get('reason', row['status']))+'</li>' for row in coverage['unpublished']) + '</ul></details>')
    header.append('<p>原侧视坐入过程存在家具遮挡。补充正面片段按实际记录展示，原视角的遮挡区间仍未完整验证。</p>')
    if visual_path.exists():
        header.append(f'<p><a href="{link(visual_path)}">root视觉审查原记录</a></p>')
    header.append('<label for="preset">观看角色</label> <select id="preset">' + ''.join(options) + '</select>')
    page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__REVIEW_TITLE__</title>
<style>body{font:16px/1.65 system-ui,sans-serif;max-width:1440px;margin:24px auto;padding:0 20px;color:#222;background:#f8f8f6}a{color:#175a96}h1,h2{line-height:1.25}code{overflow-wrap:anywhere}.notice{background:#fff0d7;padding:12px}video{width:100%;max-width:1440px;background:#222}.stills{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}figure{margin:0}img{width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}select{max-width:100%;font:inherit;padding:6px}[hidden]{display:none!important}</style><body>'''
    page = page.replace('__REVIEW_TITLE__', title)
    page += ''.join(header + sections)
    page += '''<script>const select=document.querySelector('#preset');function show(){for(const section of document.querySelectorAll('.case')){const active=section.id===select.value;section.hidden=!active;const video=section.querySelector('video');if(!active)video.pause();else if(!video.src){video.src=video.dataset.native;video.defaultPlaybackRate=1;video.playbackRate=1;}}}select.addEventListener('change',show);show();</script></body></html>'''
    # Check the completion report again before writing a review of its snapshot.
    with report_path.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != registered[str(report_path.resolve())]['sha256']:
            raise ValueError('Room report changed while packaging; wait for completion')
    out.mkdir(parents=True, exist_ok=True)
    (out / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    (out / 'index.html').write_text(page, encoding='utf-8')
    print(json.dumps({'page': str(out / 'index.html'), 'cases': len(cases), 'roomStatus': report['status'], 'sourceFiles': len(summary['files']), 'encoding': 'none'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
