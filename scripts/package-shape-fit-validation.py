"""Package bounded fixed-build fit checks; never changes their recorded identity."""
import argparse
import html
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--shape', required=True)
p.add_argument('--missing-fit', required=True)
p.add_argument('--source-commit', required=True)
p.add_argument('--rebuild', required=True)
p.add_argument('--candidate-url', required=True)
a = p.parse_args()
root = Path(__file__).resolve().parents[1]
shape_dir = (root / a.shape).resolve()
missing_dir = (root / a.missing_fit).resolve()
shape = json.loads((shape_dir / 'report.json').read_text(encoding='utf-8'))
missing = json.loads((missing_dir / 'report.json').read_text(encoding='utf-8'))
rebuild = json.loads((root / a.rebuild / 'report.json').read_text(encoding='utf-8'))
assert shape_dir.is_relative_to(root / 'evidence') and missing_dir.is_relative_to(root / 'evidence')
assert shape['status'] == missing['status'] == rebuild['status'] == 'passed'
assert shape['build'] == missing['build'] == rebuild['rebuiltBuild']['shortId']
assert rebuild['commit'] == a.source_commit
assert (shape_dir / 'normal1x.webm').is_file()
delivery = {
    'sourceCommit': a.source_commit, 'build': shape['build'],
    'candidateURL': a.candidate_url, 'shapeReport': str(shape_dir.relative_to(root) / 'report.json'),
    'missingFitReport': str(missing_dir.relative_to(root) / 'report.json'),
    'rebuild': a.rebuild, 'checks': shape['checks'],
    'scope': 'Original male and exact onePiece Body dependency; normal face reset and seated outfit switching.',
    'limits': [
        'Diagnostic Body mutation is not an admitted new body editor or automatically refitted garment.',
        'Only the registered onePiece has the new surface dependency. Legacy garments retain their prior checks.',
        'Equipment still eagerly preloads; missing unselected onePiece fit can block male preparation, preserving the old actor.',
        'CPU, browser checks and engineer image sampling do not constitute human visual acceptance or ordinary-PC performance.',
    ],
}
(shape_dir / 'delivery.json').write_text(json.dumps(delivery, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
checks = ''.join('<li>' + html.escape(c) + '</li>' for c in shape['checks'])
page = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>形体与服装适配检查 · {html.escape(shape['build'])}</title>
<style>body{{font:16px/1.6 system-ui;max-width:1440px;margin:24px auto;padding:20px;background:#eef1ef;color:#20322a}}video{{width:100%;max-height:900px}}a{{color:#12634a}}</style>
<h1>实际形体与服装适配 · {html.escape(shape['build'])}</h1>
<p>改嘴形与复位、连体服切换、重新加载恢复，以及坐稳后换装。录像按正常时间播放，包含资源加载等待；这不是新增步态演示。</p>
<video controls preload="metadata" src="normal1x.webm"></video>
<p>身体测试点变化后，旧适配会拒绝；测试点已还原，并通过正常男女切换重新载入。该负例不代表新增体型参数已获准使用。</p>
<p>缺失适配资源会使新人物准备失败，原人物与造型保留。目前装备仍预载，后续将单独改为按实际选择加载。</p>
<p><a href="{html.escape(a.candidate_url, quote=True)}">打开固定候选</a> · <a href="delivery.json">版本与限制</a> · <a href="report.json">运行记录</a> · <a href="../{html.escape(missing_dir.name)}/report.json">缺失资源检查</a></p>
<ul>{checks}</ul><p>未扩大到其他身体或任意服装；普通电脑性能未测，工程检查不代替人工观感验收。</p></html>'''
(shape_dir / 'index.html').write_text(page, encoding='utf-8')
print(json.dumps({'build': shape['build'], 'page': str(shape_dir / 'index.html')}))
