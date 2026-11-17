"""Single bounded original-source subdivision preflight; never evaluates G."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import psutil

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-source-subdivision-seam-v1'
OUT = BASE / 'generated'
if sys.argv[1:] != ['--execute-once'] or OUT.exists():
    raise RuntimeError('Require --execute-once and absent generated directory')
BASE.mkdir(exist_ok=True)
paths = ['prototype/public/assets/foundation/base-male-roundtrip.vrm',
    'scripts/m2-axial-head-evaluation-v1/source.py', 'scripts/m2-male-face-v1/glb.py',
    'assets-source/m2-axial-head-evaluation-v1/spec.json',
    'evidence/m2-axial-export-seam-review-v1/source-index-inventory.json',
    'scripts/m1c/fit-source-grip.py', 'scripts/m2-hairstyle-v1/check-head-space.py',
    'assets-source/m2-axial-shape-function-v1/generated/identity/curves.json',
    'scripts/m2-source-subdivision-seam-v1/worker.py',
    'scripts/m2-source-subdivision-seam-v1/contact_seam.py',
    'assets-source/m2-face-subdivision-preflight-v1/generated/face-body-seams.json',
    'scripts/m2-source-subdivision-seam-v1/run.py']
spec = {'schema':'source-subdivision-seam-spec-v1', 'maxSeconds':120,
    'maxRssBytes':2*1024**3, 'threads':2, 'subdivisionCalls':2, 'levels':1,
    'sourceSHA256':'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',
    'inputs':[{'path':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()} for p in paths],
    'GCalled':False,'export':False,'poses':'source rest plus explicit raw-bone diagnostic poses, not recorded animation'}
specpath = BASE/'spec.json'
if specpath.exists(): raise RuntimeError('Refuse existing spec')
specpath.write_text(json.dumps(spec,indent=2)+'\n',encoding='utf-8')
OUT.mkdir()
started = time.monotonic()
peak = 0
stop = None
with (OUT/'execution.log').open('wb') as log:
    process = subprocess.Popen([str(ROOT/'experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe'),
        '-B',str(Path(__file__).with_name('worker.py'))],
        stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'OMP_NUM_THREADS':'2',
        'OPENBLAS_NUM_THREADS':'2','MKL_NUM_THREADS':'2','NUMEXPR_NUM_THREADS':'2'})
    parent = psutil.Process(process.pid)
    while process.poll() is None:
        try: tree=[parent]+parent.children(recursive=True)
        except psutil.NoSuchProcess: tree=[]
        rss=0
        for item in tree:
            try: rss+=item.memory_info().rss
            except psutil.NoSuchProcess: pass
        peak=max(peak,rss)
        if rss>spec['maxRssBytes'] or time.monotonic()-started>120:
            stop='time-or-memory-limit'
            for item in reversed(tree):
                try: item.kill()
                except psutil.NoSuchProcess: pass
            break
        time.sleep(.025)
    code=process.wait(timeout=10)
result={'exitCode':code,'stop':stop,'seconds':time.monotonic()-started,
    'peakSampledProcessTreeRssBytes':peak,'sampleIntervalSeconds':.025,
    'samplingLimit':'Sampled RSS is not instantaneous peak; shared pages can be counted twice.',
    'specSHA256':hashlib.sha256(specpath.read_bytes()).hexdigest()}
(OUT/'run-report.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
raise SystemExit(2 if code or stop else 0)
