"""Verify authored source pins against Git bytes before or after committing.

This reads the existing source manifest; it never rewrites pins to match Git.
Use --revision INDEX before committing a new bundle, or an exact commit after.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--manifest', required=True)
parser.add_argument('--revision', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
manifest_path = (root / args.manifest).resolve()
output = (root / args.output).resolve()
if not manifest_path.is_relative_to(root) or not output.is_relative_to(root):
    raise ValueError('Manifest and report must stay inside this checkout')
if output.exists():
    raise FileExistsError('Use a new report path; keep prior failure evidence')
revision = args.revision
if revision != 'INDEX':
    revision = subprocess.check_output(
        ['git', 'rev-parse', revision + '^{commit}'], cwd=root, text=True).strip()
manifest_bytes = manifest_path.read_bytes()
manifest = json.loads(manifest_bytes)
if not isinstance(manifest.get('files'), list) or not manifest['files']:
    raise ValueError('Expected a nonempty files list with path and sha256')
rows = []
for entry in manifest['files']:
    name = entry['path']
    relative = PurePosixPath(name)
    if relative.is_absolute() or '..' in relative.parts or ':' in name:
        raise ValueError('Expected a repository-relative source path: ' + name)
    ref = (':' if revision == 'INDEX' else revision + ':') + name
    result = subprocess.run(['git', 'cat-file', 'blob', ref], cwd=root, capture_output=True)
    actual = hashlib.sha256(result.stdout).hexdigest() if result.returncode == 0 else None
    rows.append({'path': name, 'expectedSha256': entry['sha256'],
                 'gitSha256': actual, 'passed': actual == entry['sha256'],
                 'error': result.stderr.decode('utf-8', errors='replace').strip() or None})
report = {'revision': revision, 'manifest': manifest_path.relative_to(root).as_posix(),
          'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
          'scope': 'Listed source file bytes only; no source generation, runtime or visual acceptance.',
          'passed': all(row['passed'] for row in rows), 'files': rows}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'passed': report['passed'], 'files': len(rows),
                  'report': output.relative_to(root).as_posix()}))
raise SystemExit(0 if report['passed'] else 1)
