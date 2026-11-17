"""One bounded full-source direct-G evaluation, without a solver or export."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time

import psutil

import hashlib
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/m2-refined-axial-evaluation-v1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):p.write_text(json.dumps(v,indent=2)+'\n',encoding='utf-8')

parser = argparse.ArgumentParser()
parser.add_argument('--execute-once', action='store_true', required=True)
parser.parse_args()
out = BASE / 'generated'
if out.exists():
    raise ValueError('Preserve the first complete-source execution')
execution = json.loads((BASE / 'execution-spec.json').read_bytes())
for row in execution['inputs']:
    if sha(ROOT / row['path']) != row['sha256']:
        raise ValueError('Frozen evaluation input differs: ' + row['path'])
out.mkdir()
command = [str(ROOT / 'experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe'), '-B',
    str(Path(__file__).with_name('evaluate.py'))]
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
result = {'schema': 'axial-head-evaluation-execution-v1', 'exitCode': code, 'stop': stop,
    'seconds': time.monotonic() - start, 'peakSampledProcessTreeRssBytes': peak,
    'maximumSampledSingleProcessRssBytes': single, 'observedProcessCount': len(seen),
    'executionSpecSha256': sha(BASE / 'execution-spec.json'),
    'command': ['experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe', '-B',
        'scripts/m2-refined-axial-evaluation-v1/evaluate.py'],
    'sampleIntervalSeconds': .05,
    'samplingLimit': 'Recursive live RSS sum, shared pages may repeat; instantaneous peaks can be missed.'}
save(out / 'run-report.json', result)
print(json.dumps(result))
raise SystemExit(2 if code or stop else 0)
