"""Append the sampled-review viewer and hash the package, without re-encoding media."""
from pathlib import Path
import hashlib
import html
import json
import urllib.request

root = Path(__file__).resolve().parent
sheets = sorted(root.glob('*-review-2fps/*.jpg'))
page = (root / 'index.html').read_text(encoding='utf-8')
if 'id="review-sheet"' not in page:
    options = ''.join(f'<option value="{html.escape(p.relative_to(root).as_posix())}">{html.escape(p.relative_to(root).as_posix())}</option>' for p in sheets)
    section = '<section><h2>全时段 2fps 工程抽审</h2><p>17 张时序图、191 个采样帧已逐张检查。抽帧不等同连续 1× 自然度验收，视频保留完整原片。</p><select id="review-sheet">' + options + '</select><img id="review-image" src="' + sheets[0].relative_to(root).as_posix() + '" alt="全时段抽帧时序图"></section><script>document.getElementById("review-sheet").onchange=function(){document.getElementById("review-image").src=this.value;};</script>'
    page = page.replace('</html>', section + '</html>')
    (root / 'index.html').write_text(page, encoding='utf-8')
url = 'http://127.0.0.1:4174/evidence/' + root.name + '/'
with urllib.request.urlopen(url, timeout=10) as response:
    body = response.read()
    receipt = {'url': url, 'status': response.status, 'bytes': len(body), 'localHTMLMatches': body == (root / 'index.html').read_bytes()}
    assert response.status == 200 and receipt['localHTMLMatches']
(root / 'http-check.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
files = []
for p in sorted(root.rglob('*')):
    if p.is_file() and p != root / 'manifest.json':
        files.append({'path': p.relative_to(root).as_posix(), 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
manifest = {'build': '836d46881d8b', 'sourceCommitShort': '9addff3', 'scope': 'QA evidence; original fixed dist unchanged; sampled visual review only.', 'files': files, 'fileCount': len(files), 'totalBytes': sum(f['bytes'] for f in files)}
(root / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'http': receipt, 'fileCount': len(files), 'totalBytes': manifest['totalBytes']}))
