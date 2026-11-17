"""Bounded one-shot background runner. No render or character export."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import psutil

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-head-cage-skin-domain-v1'

parser = argparse.ArgumentParser()
parser.add_argument('--tool-root', type=Path, default=ROOT)
parser.add_argument('--out', type=Path, default=BASE / 'generated')
args = parser.parse_args()
spec = json.loads((BASE / 'spec.json').read_bytes())
binary = args.tool_root / spec['tool']['path']
if hashlib.sha256(binary.read_bytes()).hexdigest() != spec['tool']['sha256']:
    raise ValueError('Blender binary SHA mismatch')
output = args.out.resolve()
if not output.is_relative_to(BASE.resolve()) or output == BASE.resolve() or output.exists():
    raise ValueError('Use a new response output directory inside source package')
output.mkdir(parents=True)
command = [str(binary), '--background', '--factory-startup', '--threads', '2', '--python-exit-code', '1',
           '--python', str(Path(__file__).with_name('probe.py')), '--', '--out', str(output)]
start, peak, stop = time.monotonic(), 0, None
with (output / 'blender.log').open('wb') as log:
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
        env={**os.environ, 'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2'})
    observed = psutil.Process(process.pid)
    while process.poll() is None:
        try:
            peak = max(peak, observed.memory_info().rss)
        except psutil.NoSuchProcess:
            break
        if peak > spec['setup']['maximumRssBytes'] or time.monotonic() - start > spec['setup']['maximumSeconds']:
            stop = 'resource-limit'
            process.terminate()
            break
        time.sleep(.25)
    code = process.wait(timeout=15)
result = {'schema': 'head-response-probe-run-v1', 'exitCode': code, 'stop': stop, 'seconds': time.monotonic() - start,
          'peakRssBytes': peak, 'tool': spec['tool'], 'source': [{'path': p.relative_to(ROOT).as_posix(),
          'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(Path(__file__).parent.glob('*.py'))],
          'shapeSolveCalled': False, 'characterExported': False, 'runtimeAccepted': False}
(output / 'run-report.json').write_bytes((json.dumps(result, indent=2) + '\n').encode())
print(json.dumps(result))
raise SystemExit(2 if code or stop else 0)
