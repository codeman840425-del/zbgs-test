"""Bounded background CPU render, leaving the source project unchanged."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

import psutil

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
BLENDER=ROOT/'experiments/tools/blender-4.5.9-windows-x64/blender.exe'
SOURCE=ROOT/'assets-source/mpfb-author-study-v1/generated/mpfb-original-sample-02.blend'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(BLENDER)=='42c096b04d79bd0ff234429f67178881047c1c370d25ad3aef2766f3eeac4024'
if (OUT/'execution.json').exists():raise FileExistsError('Evidence exists')
env=os.environ.copy()
env.update(OMP_NUM_THREADS='4',OPENBLAS_NUM_THREADS='4',MKL_NUM_THREADS='4',
    BLENDER_USER_CONFIG=str(OUT/'private-config'),BLENDER_USER_SCRIPTS=str(OUT/'private-scripts'))
command=[str(BLENDER),'--background','--factory-startup','--offline-mode','--threads','4',
         '--python-exit-code','1','--python',str(OUT/'render.py')]
report={'schema':'mpfb-author-study-visual-execution-v1','status':'running',
    'command':command,'sourceSHA256':sha(SOURCE),'workerSHA256':sha(OUT/'render.py'),
    'runnerSHA256':sha(Path(__file__)),'maximumSeconds':300,'maximumProcessTreeRSSBytes':3*1024**3,
    'requestedDevice':'CPU','requestedThreads':4,'gpuRendering':False}
(OUT/'execution.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
start=time.perf_counter();peak=0;reason=None
with (OUT/'render.log').open('wb') as log:
    process=subprocess.Popen(command,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
    while process.poll() is None:
        try:
            parent=psutil.Process(process.pid);tree=[parent]+parent.children(recursive=True)
            rss=sum(p.memory_info().rss for p in tree if p.is_running())
            peak=max(peak,rss)
            if rss>3*1024**3:reason='memory-limit'
            if time.perf_counter()-start>300:reason='time-limit'
            if reason:
                for p in reversed(tree):
                    try:p.kill()
                    except psutil.NoSuchProcess:pass
                break
        except psutil.NoSuchProcess:pass
        time.sleep(.2)
    code=process.wait()
report.update(status='rendered' if code==0 and reason is None else 'failed',
    exitCode=code,stopReason=reason,elapsedSeconds=time.perf_counter()-start,
    observedPeakRecursiveRSSBytes=peak,sourceAfterSHA256=sha(SOURCE),
    sourceUnchanged=sha(SOURCE)==report['sourceSHA256'],logSHA256=sha(OUT/'render.log'))
(OUT/'execution.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
raise SystemExit(code or (1 if reason else 0))
