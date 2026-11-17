"""Bounded coefficient worker, recursive process-tree RSS, never character export."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

import psutil

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-axial-shape-function-v1'
out = BASE / 'generated'
if out.exists():
    raise ValueError('Keep first coefficient attempt. Output already exists.')
spec = json.loads((BASE / 'spec.json').read_bytes())
out.mkdir()
command = [str(ROOT / 'experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe'), '-B',
    str(Path(__file__).with_name('build.py'))]
start, peak, single, stop, seen = time.monotonic(), 0, 0, None, set()
with (out / 'execution.log').open('wb') as log:
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
        env={**os.environ, 'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2', 'MKL_NUM_THREADS': '2'})
    parent = psutil.Process(process.pid)
    while process.poll() is None:
        children = [parent]
        try:
            children += parent.children(recursive=True)
        except psutil.NoSuchProcess:
            pass
        rss, oversized = 0, []
        for child in children:
            try:
                memory = child.memory_info().rss
                rss += memory
                seen.add(child.pid)
                single = max(single, memory)
                if memory > spec['maxRssBytes']:
                    oversized.append(child.pid)
            except psutil.NoSuchProcess:
                pass
        peak = max(peak, rss)
        if oversized or rss > spec['maxRssBytes'] or time.monotonic() - start > spec['maxSeconds']:
            stop = {'reason': 'time-or-process-tree-memory-limit', 'oversizedChildren': oversized}
            for child in reversed(children):
                try:
                    child.kill()
                except psutil.NoSuchProcess:
                    pass
            break
        time.sleep(.05)
    code = process.wait(timeout=15)
report = {'schema': 'axial-function-process-run-v1', 'exitCode': code, 'stop': stop,
    'seconds': time.monotonic() - start, 'peakSampledProcessTreeRssBytes': peak,
    'maximumSampledSingleProcessRssBytes': single, 'observedProcessCount': len(seen),
    'sampleIntervalSeconds': .05, 'specSha256': hashlib.sha256((BASE / 'spec.json').read_bytes()).hexdigest(),
    'command': command, 'sourceScripts': spec['scripts'], 'characterExported': False,
    'samplingLimit': 'Sampled recursive live RSS sum; shared pages may repeat and instantaneous peaks can be missed.'}
(out / 'run-report.json').write_bytes((json.dumps(report, indent=2) + '\n').encode())
print(json.dumps(report))
raise SystemExit(2 if code or stop else 0)
