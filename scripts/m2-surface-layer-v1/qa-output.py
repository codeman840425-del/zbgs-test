"""Actual CLI valid-side export, idempotency and whole-plan conflict refusal."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build
from flow import require

generated = build.BASE/'generated'
fingerprint = lambda folder: {p.name: build.sha(p.read_bytes()) for p in folder.iterdir() if p.is_file() and p.name != 'output-qa.json'}
before = fingerprint(generated)
spec = json.loads((build.BASE/'spec.json').read_text(encoding='utf-8'))
for layer in spec['layers'].values(): layer['sides'] = ['left']
exports = build.BASE/'exports'; exports.mkdir(exist_ok=True)


def run(source, output=None):
    args = [sys.executable, '-B', str(Path(__file__).with_name('build.py')), '--spec', source.relative_to(build.ROOT).as_posix()]
    if output is not None: args += ['--out', output.relative_to(build.ROOT).as_posix()]
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8')
    return result.returncode, json.loads(result.stdout)


with tempfile.TemporaryDirectory(dir=exports, prefix='qa-') as directory:
    folder = Path(directory); source = folder/'left-spec.json'; source.write_bytes(build.json_bytes(spec)); output = folder/'output'
    code, first = run(source, output); require(code == 0 and first['status'] == 'exported', 'Valid source did not export to isolated output')
    manifest = json.loads((output/'manifest.json').read_text(encoding='utf-8'))
    require(all(layer['sourceParameters']['sides'] == ['left'] for v in manifest['variants'] for layer in v['layers']), 'CLI ignored valid single-side source')
    exported = fingerprint(output); times = {p.name: p.stat().st_mtime_ns for p in output.iterdir()}
    code, second = run(source, output)
    require(code == 0 and first == second and exported == fingerprint(output) and times == {p.name: p.stat().st_mtime_ns for p in output.iterdir()}, 'Same-byte repeat rewrote or changed output')
    code, default_conflict = run(source)
    require(code == 2 and 'Differing existing output' in default_conflict['error'], 'Changed valid source silently replaced frozen default output')
    (output/'build-report.json').write_bytes(b'conflict')
    (output/'female-freckles.png').unlink()
    conflict_snapshot = fingerprint(output)
    code, conflict = run(source, output)
    require(code == 2 and 'build-report.json' in conflict['error'] and conflict_snapshot == fingerprint(output), 'Full preflight failed to preserve conflicting/missing output fixture')
    require(not (output/'female-freckles.png').exists(), 'Conflict rejection created an earlier missing output')
    code, boundary = run(source, build.BASE/'unapproved-output')
    require(code == 2 and 'Output must be' in boundary['error'], 'Output boundary was not enforced')
require(before == fingerprint(generated), 'Default source exports changed during output checks')
report = {'passed': True, 'validSingleSideCLIExport': True, 'repeatBytesAndModificationTimesUnchanged': True,
    'defaultConflictExitCode': 2, 'isolatedConflictExitCode': 2, 'wholePlanCheckedBeforeAnyWrite': True,
    'defaultOutputHashesUnchanged': True, 'boundedOutputExitCode': 2, 'temporaryExportRemoved': True,
    'GPUUsed': False, 'runtimeAccepted': False}
(generated/'output-qa.json').write_bytes(build.json_bytes(report))
print(json.dumps(report))
