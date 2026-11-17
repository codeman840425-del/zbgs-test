"""Bounded one-shot contact readback monitor; numeric worker stays in the pinned venv."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import shutil
import time

import psutil

from common import BASE, ROOT, io, require

parser = argparse.ArgumentParser()
parser.add_argument('--execute-once', action='store_true', required=True)
args = parser.parse_args()
folder = BASE / 'execution'
require(not folder.exists(), 'Preserve first contact readback receipt')
folder.mkdir()
spec=json.loads((BASE/'spec.json').read_bytes())
snapshot=folder/'source-snapshot'
for reference in spec['inputs']:
    path=ROOT/reference['path']
    require(io.sha(path)==reference['sha256'],'Pre-run source/input differs: '+reference['path'])
    if path.suffix=='.py':
        target=snapshot/reference['path'];target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(path,target)
shutil.copyfile(BASE/'spec.json',folder/'executed-spec.json')
io.save(folder/'input-receipt.json',{'methodSpec':io.ref(BASE/'spec.json'),'inputs':spec['inputs']})
command = [str(ROOT / 'experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe'), '-B',
    str(Path(__file__).with_name('readback.py'))]
start, peak, maximum_single, stopped = time.monotonic(), 0, 0, None
with (folder / 'execution.log').open('wb') as log:
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
        env={**os.environ, 'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2', 'MKL_NUM_THREADS': '2'})
    io.save(folder/'process.json',{'launcherPid':os.getpid(),'workerPid':process.pid,
        'command':command,'methodSpec':io.ref(BASE/'spec.json')})
    parent = psutil.Process(process.pid)
    while process.poll() is None:
        children = [parent]
        try:
            children += parent.children(recursive=True)
        except psutil.NoSuchProcess:
            pass
        rss, single_limit = 0, False
        for child in children:
            try:
                value = child.memory_info().rss
                rss += value
                maximum_single = max(maximum_single, value)
                single_limit |= value > 3221225472
            except psutil.NoSuchProcess:
                pass
        peak = max(peak, rss)
        if single_limit or rss > 3221225472 or time.monotonic()-start > 600:
            stopped = '600s-or-3GiB-process-tree-budget'
            for child in reversed(children):
                try:
                    child.kill()
                except psutil.NoSuchProcess:
                    pass
            break
        time.sleep(.05)
    code = process.wait(timeout=15)
result = {'schema': 'axial-body-contact-readback-execution-v1', 'exitCode': code, 'stop': stopped,
    'seconds': time.monotonic()-start, 'peakSampledProcessTreeRssBytes': peak,
    'maximumSampledSingleProcessRssBytes': maximum_single, 'methodSpec': io.ref(BASE / 'spec.json'),
    'monitorPsutilVersion': psutil.__version__, 'childThreads': 2, 'maxSeconds': 600, 'maxRssBytes': 3221225472,
    'samplingLimit': 'Recursive RSS sum every50ms; shared pages may repeat and instantaneous peaks may be missed.'}
io.save(folder / 'report.json', result)
print(json.dumps(result))
raise SystemExit(2 if code or stopped else 0)
