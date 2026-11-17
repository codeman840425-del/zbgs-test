"""One CPU Blender process under a bounded watchdog; no render/export/G."""
import hashlib,json,os,subprocess,time
from pathlib import Path
import psutil
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/m2-boundary-refinement-preflight-v1'
OUT=BASE/'generated';EXE=ROOT/'experiments/tools/blender-4.5.9-windows-x64/blender.exe'
if OUT.exists() or (BASE/'spec.json').exists():raise RuntimeError('Refuse previous execution/spec')
BASE.mkdir(exist_ok=True)
files=['prototype/public/assets/foundation/base-male-roundtrip.vrm','scripts/m2-male-face-v1/glb.py',
 'assets-source/m2-source-subdivision-seam-v1/generated/group-7.npz',
 'assets-source/m2-source-subdivision-seam-v1/generated/group-21.npz',
 'assets-source/m2-source-subdivision-seam-v1/generated/S-21.npz',
 'assets-source/m2-source-subdivision-seam-v1/generated/provenance-7.json',
 'assets-source/m2-source-subdivision-seam-v1/generated/provenance-21.json',
 'assets-source/m2-source-subdivision-seam-v1/generated/cross-accessor-seams.json',
 'evidence/m2-boundary-refinement-method-review-v1/readback.json',
 'scripts/m2-boundary-refinement-preflight-v1/blender_worker.py',
 'scripts/m2-boundary-refinement-preflight-v1/run.py',EXE.relative_to(ROOT).as_posix()]
spec={'schema':'boundary-refinement-preflight-spec-v1','sourceSHA256':'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',
 'maxSeconds':180,'maxRssBytes':2*1024**3,'threads':2,'expectedBlenderVersion':[4,5,9],
 'inputs':[{'path':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()} for p in files],
 'sourceRuns':1,'apiTests':3,'faceSubdivisionCalls':0,'GCalled':False,'render':False,'export':False,
 'operatorParameters':{'cuts':1,'smooth':0.0,'fractal':0.0,'along_normal':0.0,'use_single_edge':True,
 'use_grid_fill':False,'use_only_quads':False,'use_sphere':False,'quad_method':'FIXED','ngon_method':'EAR_CLIP'}}
(BASE/'spec.json').write_text(json.dumps(spec,indent=2)+'\n',encoding='utf-8');OUT.mkdir()
start=time.monotonic();peak=0;stop=None
command=[str(EXE),'--background','--factory-startup','--threads','2','--python-exit-code','2','--python',str(Path(__file__).with_name('blender_worker.py'))]
with (OUT/'execution.log').open('wb') as log:
 p=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'OMP_NUM_THREADS':'2','OPENBLAS_NUM_THREADS':'2','MKL_NUM_THREADS':'2'})
 parent=psutil.Process(p.pid)
 while p.poll() is None:
  try:tree=[parent]+parent.children(recursive=True)
  except psutil.NoSuchProcess:tree=[]
  rss=0
  for c in tree:
   try:rss+=c.memory_info().rss
   except psutil.NoSuchProcess:pass
  peak=max(peak,rss)
  if rss>spec['maxRssBytes'] or time.monotonic()-start>180:
   stop='time-or-memory-budget'
   for c in reversed(tree):
    try:c.kill()
    except psutil.NoSuchProcess:pass
   break
  time.sleep(.05)
 code=p.wait(timeout=15)
result={'exitCode':code,'stop':stop,'seconds':time.monotonic()-start,'peakSampledBlenderProcessTreeRssBytes':peak,
 'sampleSeconds':.05,'samplingLimit':'Not instantaneous peak; shared pages can repeat.',
 'singleBlenderWorker':True,'watchdogSeparatePython':True,'command':command,
 'specSHA256':hashlib.sha256((BASE/'spec.json').read_bytes()).hexdigest()}
(OUT/'run-report.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result));raise SystemExit(2 if code or stop else 0)
