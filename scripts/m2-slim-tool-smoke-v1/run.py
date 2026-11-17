"""Execute the approved smoke once, two threads and bounded memory/time."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

import psutil

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'evidence/m2-slim-tool-smoke-v1'
python = ROOT / 'experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe'
if (OUT / 'run-report.json').exists() or (OUT / 'result.json').exists():
    raise ValueError('This smoke output is already occupied. Preserve it.')
preparation = json.loads((OUT / 'prepare-report.json').read_bytes())
if preparation['status'] != 'isolated-binary-install-complete':
    raise ValueError('Isolated binary preparation must pass first')
command = [str(python), '-B', str(Path(__file__).with_name('smoke.py'))]
started, peak, stop = time.monotonic(), 0, None
with (OUT / 'smoke.log').open('wb') as log:
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
        env={**os.environ, 'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2', 'MKL_NUM_THREADS': '2'})
    observed = psutil.Process(process.pid)
    while process.poll() is None:
        try:
            peak = max(peak, observed.memory_info().rss)
        except psutil.NoSuchProcess:
            break
        if peak > 3 * 1024 ** 3 or time.monotonic() - started > 600:
            stop = 'resource-limit'
            process.terminate()
            break
        time.sleep(.05)
    code = process.wait(timeout=15)
result = {'schema': 'slim-tool-smoke-run-v1', 'exitCode': code, 'stop': stop,
    'seconds': time.monotonic() - started, 'peakRssBytes': peak, 'threads': 2,
    'command': command, 'systemSitePackages': False, 'characterSolved': False,
    'sourceScripts': [{'path': p.relative_to(ROOT).as_posix(),
        'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(Path(__file__).parent.glob('*.py'))]}
(OUT / 'run-report.json').write_bytes((json.dumps(result, indent=2) + '\n').encode())
print(json.dumps(result))
raise SystemExit(2 if code or stop else 0)
