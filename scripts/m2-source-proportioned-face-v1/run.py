"""Bounded unique source-proportioned worker; no engine or public changes."""
import sys
sys.dont_write_bytecode=True
import hashlib,json,os,subprocess,time
from pathlib import Path
import psutil
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-source-proportioned-face-v1'
if (BASE/'generated').exists() or (BASE/'execution.log').exists():raise ValueError('Preserve first run')
spec=json.loads((BASE/'execution-spec.json').read_bytes())
for r in spec['inputs']:
    assert hashlib.sha256((ROOT/r['path']).read_bytes()).hexdigest()==r['sha256'],r['path']
start=time.monotonic();peak=0;stop=None
with (BASE/'execution.log').open('xb') as log:
    p=subprocess.Popen([str(ROOT/'experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe'),'-B',str(Path(__file__).with_name('build.py')),'--execute-once'],stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'OMP_NUM_THREADS':'2','OPENBLAS_NUM_THREADS':'2','MKL_NUM_THREADS':'2'})
    monitor=psutil.Process(p.pid)
    while p.poll() is None:
        try:tree=[monitor]+monitor.children(recursive=True)
        except psutil.NoSuchProcess:tree=[]
        rss=0
        for c in tree:
            try:rss+=c.memory_info().rss
            except psutil.NoSuchProcess:pass
        peak=max(peak,rss)
        if rss>3*1024**3 or time.monotonic()-start>600:
            stop='budget-exceeded'
            for c in reversed(tree):
                try:c.kill()
                except psutil.NoSuchProcess:pass
            break
        time.sleep(.05)
    code=p.wait(timeout=15)
result=dict(schema='source-proportioned-preview-execution-v1',exitCode=code,stop=stop,seconds=time.monotonic()-start,peakSampledProcessTreeRSSBytes=peak,threadsEnvironment=2,sampleIntervalSeconds=.05,executionSpecSHA=hashlib.sha256((BASE/'execution-spec.json').read_bytes()).hexdigest())
(BASE/'run-receipt.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result));raise SystemExit(code or (2 if stop else 0))
