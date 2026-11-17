"""Single bounded process-tree runner for the new semantic experiment."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time

import psutil

from adapter import BASE, ROOT, common, save

parser = argparse.ArgumentParser()
parser.add_argument('--execute-once', action='store_true', required=True)
args = parser.parse_args()
out = BASE / 'generated'
if out.exists():
    raise ValueError('Preserve the first new-semantic execution')
execution = json.loads((BASE / 'execution-spec.json').read_bytes())
out.mkdir()
command = [str(ROOT / 'experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe'), '-B',
    str(Path(__file__).with_name('solve.py')), '--out', str(out)]
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
                if memory > execution['maxRssBytes']:
                    oversized.append(child.pid)
            except psutil.NoSuchProcess:
                pass
        peak = max(peak, rss)
        if oversized or rss > execution['maxRssBytes'] or time.monotonic() - start > execution['maxSeconds']:
            stop = {'reason': 'time-or-process-tree-memory-limit', 'oversizedChildren': oversized}
            for child in reversed(children):
                try:
                    child.kill()
                except psutil.NoSuchProcess:
                    pass
            break
        time.sleep(.05)
    code = process.wait(timeout=15)
result = {'schema': 'semantic-head-attachment-run-v1', 'exitCode': code, 'stop': stop,
    'seconds': time.monotonic() - start, 'peakSampledProcessTreeRssBytes': peak,
    'maximumSampledSingleProcessRssBytes': single, 'observedProcessCount': len(seen),
    'executionSpecSha256': common.digest(BASE / 'execution-spec.json'), 'command': command,
    'sampleIntervalSeconds': .05, 'samplingLimit': 'Recursive live RSS sum, shared pages may repeat; instantaneous peaks can be missed.'}
save(out / 'run-report.json', result)
print(json.dumps(result))
raise SystemExit(2 if code or stop else 0)
