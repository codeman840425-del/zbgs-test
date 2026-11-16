"""Actual publisher CPU rejection checks in disposable roots, no publication."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parents[2]
script = root/'scripts/publish-representative-batch.py'
spec = importlib.util.spec_from_file_location('actual_batch_publisher', script)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)
results = []
for case in ['failed-audit', 'different-manifest-path', 'changed-manifest-bytes', 'changed-old-palette']:
    with tempfile.TemporaryDirectory(prefix='representative-publisher-qa-') as temp:
        fixture = Path(temp)
        manifest = fixture/'source/manifest.json'
        manifest.parent.mkdir()
        manifest.write_text(json.dumps({'variants': [{'id': key} for key in publisher.LABELS]}), encoding='utf-8')
        expected_sha = hashlib.sha256(manifest.read_bytes()).hexdigest()
        audit = {'status': 'body-garment-cpu-readback-passed-appearance-runtime-pending', 'root': str(fixture),
                 'manifest': 'source/manifest.json', 'files': [{'path': 'source/manifest.json', 'sha256': expected_sha}]}
        selected = manifest
        if case == 'failed-audit':
            audit['status'] = 'cpu-readback-incomplete-or-failed'
        if case == 'different-manifest-path':
            selected = fixture/'other.json'
            selected.write_bytes(manifest.read_bytes())
        if case == 'changed-manifest-bytes':
            manifest.write_text('{}', encoding='utf-8')
        if case == 'changed-old-palette':
            palette = fixture/'prototype/public/assets/appearance-color-v3/runtime-manifest.json'
            palette.parent.mkdir(parents=True)
            palette.write_text('{}', encoding='utf-8')
        receipt = fixture/'audit.json'
        receipt.write_text(json.dumps(audit), encoding='utf-8')
        publisher.ROOT = fixture
        publisher.SOURCE = fixture/'assets-source/m2-representative-batch-v1'
        publisher.PUBLIC = fixture/'prototype/public/assets/m2-representative-batch-v1'
        sys.argv = [str(script), '--manifest', str(selected), '--audit', str(receipt)]
        before = {str(path.relative_to(fixture)): hashlib.sha256(path.read_bytes()).hexdigest() for path in fixture.rglob('*') if path.is_file()}
        try:
            publisher.main()
        except ValueError as error:
            after = {str(path.relative_to(fixture)): hashlib.sha256(path.read_bytes()).hexdigest() for path in fixture.rglob('*') if path.is_file()}
            assert before == after
            assert not publisher.PUBLIC.exists() and not publisher.SOURCE.exists()
            results.append({'case': case, 'passed': True, 'zeroWrites': True, 'error': str(error)})
        else:
            raise AssertionError('Expected rejection: ' + case)
report = {'status': 'passed', 'publisherSha256': hashlib.sha256(script.read_bytes()).hexdigest(), 'cases': results,
          'scope': 'Actual imported publisher with temporary minimal CLI inputs and altered ROOT. Only pre-write identity gates, no successful publication or runtime claim.'}
Path(__file__).with_name('publisher-gate-results.json').write_text(json.dumps(report, separators=(',', ':'))+'\n', encoding='utf-8')
print(json.dumps(report))
