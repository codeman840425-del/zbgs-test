"""Deliberate one-shot runner. Preparation alone never launches this worker."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time

import psutil

from common import BASE, ROOT, SPEC, digest, save

parser = argparse.ArgumentParser()
parser.add_argument('--execute-once', action='store_true', required=True)
args = parser.parse_args()
out = BASE / 'generated'
if out.exists():
    raise ValueError('Preserve first execution. Output already exists.')
out.mkdir()
spec = json.loads(SPEC.read_bytes())
command = [str(ROOT / 'experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe'), '-B',
    str(Path(__file__).with_name('solve.py')), '--out', str(out)]
started, peak, maximum_single, stop = time.monotonic(), 0, 0, None
observed_pids = set()
with (out / 'execution.log').open('wb') as log:
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
        env={**os.environ, 'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2', 'MKL_NUM_THREADS': '2'})
    parent = psutil.Process(process.pid)
    while process.poll() is None:
        processes = [parent]
        try:
            processes += parent.children(recursive=True)
        except psutil.NoSuchProcess:
            pass
        rss, oversized = 0, []
        for child in processes:
            try:
                memory = child.memory_info().rss
                observed_pids.add(child.pid)
                rss += memory
                maximum_single = max(maximum_single, memory)
                if memory > spec['maxRssBytes']:
                    oversized.append(child.pid)
            except psutil.NoSuchProcess:
                pass
        peak = max(peak, rss)
        if oversized or rss > spec['maxRssBytes'] or time.monotonic() - started > spec['maxSeconds']:
            stop = {'reason': 'time-or-process-tree-memory-limit', 'oversizedChildren': oversized}
            for child in reversed(processes):
                try:
                    child.kill()
                except psutil.NoSuchProcess:
                    pass
            break
        time.sleep(.05)
    code = process.wait(timeout=15)
value = {'schema': 'native-head-slim-run-v1', 'exitCode': code, 'stop': stop, 'command': command,
    'seconds': time.monotonic() - started, 'peakSampledProcessTreeRssBytes': peak,
    'maximumSampledSingleProcessRssBytes': maximum_single, 'observedProcessCount': len(observed_pids),
    'sampleIntervalSeconds': .05, 'specSha256': digest(SPEC), 'scriptSha256': digest(Path(__file__)),
    'limit': 'Sampled recursive live RSS sum; shared pages can be counted more than once and instantaneous peaks may be missed.'}
save(out / 'run-report.json', value)
print(json.dumps(value))
raise SystemExit(2 if code or stop else 0)
