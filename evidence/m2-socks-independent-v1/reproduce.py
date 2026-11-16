import hashlib
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
root = Path('F:/gamemake')
evidence = root / 'evidence/m2-socks-independent-v1'
source = root / 'assets-source/m2-socks-layer-v1'
builder_path = root / 'scripts/m2-socks-layer-v1/build.py'
spec = importlib.util.spec_from_file_location('independent_sock_builder', builder_path)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
reproduction = evidence / 'reproduction'
reproduction.mkdir(exist_ok=True)
(reproduction / 'spec.json').write_bytes((source / 'spec.json').read_bytes())
builder.PACKAGE = reproduction
digest = lambda data: hashlib.sha256(data).hexdigest()
before = {str(p.relative_to(source)): digest(p.read_bytes()) for p in source.rglob('*') if p.is_file()}
builder.main()
first = {str(p.relative_to(reproduction)): digest(p.read_bytes()) for p in reproduction.rglob('*') if p.is_file()}
builder.main()
second = {str(p.relative_to(reproduction)): digest(p.read_bytes()) for p in reproduction.rglob('*') if p.is_file()}
comparisons = []
for relative, sha in first.items():
    original = source / relative
    comparisons.append({'path': relative, 'sha256': sha, 'matchesOriginal': original.is_file() and digest(original.read_bytes()) == sha,
                        'repeatedBytesEqual': second.get(relative) == sha})
after = {str(p.relative_to(source)): digest(p.read_bytes()) for p in source.rglob('*') if p.is_file()}
result = {'schema': 'independent-sock-reproduction-v1', 'generatorSha256': digest(builder_path.read_bytes()),
          'sourceDirectoryUnchanged': before == after, 'files': comparisons,
          'passed': before == after and first == second and all(row['matchesOriginal'] for row in comparisons)}
(evidence / 'reproduction-result.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'passed': result['passed'], 'files': len(comparisons), 'generatorSha256': result['generatorSha256']}))
