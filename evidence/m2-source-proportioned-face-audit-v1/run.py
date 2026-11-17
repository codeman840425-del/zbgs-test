"""One bounded CPU run with sampled recursive process-tree budget."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import psutil
OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[1]
log=OUT/'execution.log'
if log.exists() or (OUT/'STARTED.json').exists():raise RuntimeError('Preserve first authorized run')
start=time.monotonic();peak=0;stop=None
with log.open('xb') as stream:
    child=subprocess.Popen([str(ROOT/'experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe'),'-B',str(OUT/'audit.py')],cwd=ROOT,stdout=stream,stderr=subprocess.STDOUT,
        env={**os.environ,'OMP_NUM_THREADS':'2','OPENBLAS_NUM_THREADS':'2','MKL_NUM_THREADS':'2'})
    monitor=psutil.Process(child.pid)
    while child.poll() is None:
        try:tree=[monitor]+monitor.children(recursive=True)
        except psutil.NoSuchProcess:tree=[]
        rss=0
        for item in tree:
            try:rss+=item.memory_info().rss
            except psutil.NoSuchProcess:pass
        peak=max(peak,rss)
        if rss>3*1024**3 or time.monotonic()-start>600:
            stop='memory-budget' if rss>3*1024**3 else 'time-budget'
            for item in reversed(tree):
                try:item.kill()
                except psutil.NoSuchProcess:pass
            break
        time.sleep(.1)
    code=child.wait(timeout=15)
receipt={'schema':'independent-face-strict-budget-receipt-v1','exitCode':code,'stop':stop,'seconds':time.monotonic()-start,
    'peakSampledProcessTreeRssBytes':peak,'maxSeconds':600,'maxRssBytes':3*1024**3,'sampleIntervalSeconds':.1,
    'threadsEnvironment':2,'samplingIsNotInstantaneousPeak':True,'auditScriptSHA256':hashlib.sha256((OUT/'audit.py').read_bytes()).hexdigest()}
(OUT/'run-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(json.dumps(receipt));raise SystemExit(code or (2 if stop else 0))
