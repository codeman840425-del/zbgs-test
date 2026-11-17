"""Seal read-only rebuild/refusal results; never export or mutate source resources."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encoded = lambda x: (json.dumps(x, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
protected = ['equipment.json', 'source-fit.json', 'indexed-skin.json', 'input-pins.json']
before = {name: sha(BASE / name) for name in protected}
command = [sys.executable, '-B', str(BASE / 'build.py'), '--check']
repeat = subprocess.run(command, capture_output=True, text=True, cwd=ROOT)
assert repeat.returncode == 0, repeat.stderr
refusal = subprocess.run(command[:-1], capture_output=True, text=True, cwd=ROOT)
assert refusal.returncode != 0 and 'Output conflict: equipment.json' in refusal.stderr
assert before == {name: sha(BASE / name) for name in protected}
fit = json.loads((BASE / 'source-fit.json').read_bytes())
cpu = json.loads((BASE / 'cpu-verification.json').read_bytes())
receipt = {'schema': 'native-unmasked-custom-top-package-receipt-v1',
    'status': 'source-fit-and-actual843ac-adapter-cpu-verified-runtime-pending',
    'id': fit['styleId'], 'targetAvatarSha256': fit['targetAvatarSha256'],
    'garmentSha256': fit['garmentSha256'], 'sourceFitSha256': before['source-fit.json'],
    'manifestSha256': before['equipment.json'], 'cpuVerificationSha256': sha(BASE / 'cpu-verification.json'),
    'rebuild': {'command': ['python', '-B', 'assets-source/native-vroid-custom-top-unmasked-fit-v1/build.py', '--check'],
        'exitCode': repeat.returncode, 'result': json.loads(repeat.stdout)},
    'existingOutputRefusal': {'exitCode': refusal.returncode, 'stderr': refusal.stderr,
        'allFourGeneratedOutputsUnchanged': True},
    'actualCpuStatus': cpu['status'], 'actualCpuPoses': cpu['poses'],
    'negativeCases': {'old78912AvatarIdentityRejected': cpu['old78912IdentityRejected'],
        'damagedInverseBindRejected': cpu['damagedInverseBindRejected']},
    'geometryExportCalls': 0, 'gpuOrStudioCalls': 0, 'publicOrRuntimeEdited': False,
    'runtimeAccepted': False, 'crossPlatformByteDeterminismVerified': False}
with (BASE / 'receipt.json').open('xb') as f:
    f.write(encoded(receipt))
files = [{'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size, 'sha256': sha(p)}
    for p in sorted(BASE.rglob('*')) if p.is_file() and p.name != 'package-files.json']
with (BASE / 'package-files.json').open('xb') as f:
    f.write(encoded({'schema': 'native-unmasked-custom-top-package-files-v1', 'files': files}))
print(json.dumps({'files': len(files), 'manifestSha256': before['equipment.json'],
    'receiptSha256': sha(BASE / 'receipt.json')}))
