"""Freeze once, run CPU coordinate probes once, retain every log and failed result."""
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time
import psutil

ROOT=Path(__file__).resolve().parents[2]
PACKAGE=Path(__file__).resolve().parent
EVIDENCE=ROOT/'evidence/vrm-mink-roundtrip-v1'
PYTHON=ROOT/'experiments/tools/mink-author-study/.venv/Scripts/python.exe'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,o):
    with p.open('x',encoding='utf-8') as f: json.dump(o,f,indent=2,allow_nan=False)

if (PACKAGE/'spec.json').exists() or EVIDENCE.exists():
    raise SystemExit('Refuse overwrite: preserve frozen execution; restore in isolated checkout for reproduction.')
EVIDENCE.mkdir()
paths=['prototype/public/assets/foundation/base-male-roundtrip.vrm','prototype/src/foundation-profiles.js','prototype/src/normalized-motion.js','prototype/src/foundation-avatar.js','prototype/package-lock.json','prototype/node_modules/three/build/three.module.js','prototype/node_modules/three/build/three.core.js','prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js','prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js','scripts/video-motion/export-target-rigs.mjs','assets-source/mink-author-study-v1/requirements-lock.txt','assets-source/mink-author-study-v1/prepared/source-receipt.json']
paths += [str(p.relative_to(ROOT)).replace('\\','/') for p in [PACKAGE/'rig.mjs',PACKAGE/'roundtrip.py',Path(__file__)]]
receipt=json.loads((ROOT/'assets-source/mink-author-study-v1/prepared/source-receipt.json').read_bytes())
for row in receipt['sourceFiles']:
    p=ROOT/receipt['sourceRoot']/row['path']
    assert sha(p)==row['sha256'],str(p)
    if row['path'].startswith('src/') or row['path'] in ['LICENSE','pyproject.toml']:
        paths.append(str(p.relative_to(ROOT)).replace('\\','/'))
spec={'schema':'vrm-mink-roundtrip-spec-v1','avatarId':'beta-base-male-m1b','avatarSha256':'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff','minkCommit':receipt['commit'],'scope':'Original male, both shoulder-elbow-wrist semantic chains and ancestors, fixed normalized anchor; no equipment loading or collision/IK','coordinateContract':'actual three-vrm 3.5.5 normalized local absolute after rotateVRM0 exactly once; Three XYZW, MJCF WXYZ; solver world C(x,y,z)=(x,-z,y); retain local frames; reverse from actual FK world frames','positionToleranceMm':0.00001,'rotationToleranceRad':1e-8,'rootFreedom':'fixed; no free joint or root translation test in this bounded package','jointFreedom':'ball for selected normalized bones, no anatomical limits claimed','cases':[{'id':'rest','kind':'rest'},{'id':'zero-action','kind':'normalized-reset-and-update'},{'id':'left-upper-arm-local-z-30deg','kind':'single-bone','bone':'leftUpperArm','axis':[0,0,1],'angleRadians':math.pi/6}],'budget':{'totalSeconds':120,'rssBytes':2*1024**3,'threads':2},'pins':{p:sha(ROOT/p) for p in paths}}
save(PACKAGE/'spec.json',spec)
env=dict(os.environ)
env.update({k:'2' for k in ['OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS']})
env['MINK_DISABLE_NATIVE']='1'
commands=[['node',str(PACKAGE/'rig.mjs'),'export'],[str(PYTHON),str(PACKAGE/'roundtrip.py')],['node',str(PACKAGE/'rig.mjs'),'replay']]
records=[];start=time.monotonic();success=True
for i,cmd in enumerate(commands):
    log=EVIDENCE/f'{i+1:02d}.log';t=time.monotonic();peak=0;stop=None
    with log.open('x',encoding='utf-8') as f:
        proc=subprocess.Popen(cmd,cwd=ROOT,env=env,stdout=f,stderr=subprocess.STDOUT)
        while proc.poll() is None:
            try:
                ps=psutil.Process(proc.pid);rss=sum(p.memory_info().rss for p in [ps]+ps.children(recursive=True));peak=max(peak,rss)
            except psutil.Error: pass
            if time.monotonic()-start>120: stop='time-budget'
            if peak>2*1024**3: stop='memory-budget'
            if stop:
                proc.terminate();break
            time.sleep(.05)
        code=proc.wait(timeout=10)
    records.append({'command':cmd,'exitCode':code,'stop':stop,'wallSeconds':time.monotonic()-t,'peakObservedRssBytes':peak,'logSha256':sha(log)})
    if code or stop: success=False;break
save(EVIDENCE/'execution.json',{'schema':'vrm-mink-roundtrip-execution-v1','status':'completed' if success else 'failed','specSha256':sha(PACKAGE/'spec.json'),'runnerSha256':sha(Path(__file__)),'wallSeconds':time.monotonic()-start,'steps':records,'gpuUsed':False,'viewerCreated':False,'ikSolveCalls':0})
print(json.dumps({'status':'completed' if success else 'failed','steps':records},indent=2))
sys.exit(0 if success else 2)
