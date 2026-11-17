from pathlib import Path
import sys,json,hashlib,importlib.util,tempfile,subprocess
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[2];O=Path(__file__).resolve().parent;B=R/'assets-source/native-vroid-waist-body-texture-fit-v1';h=lambda b:hashlib.sha256(b).hexdigest()
sp=importlib.util.spec_from_file_location('build',B/'build.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
names=list(m.plan());snap=lambda p:{n:{'sha256':h((p/n).read_bytes()),'mtimeNs':(p/n).stat().st_mtime_ns}for n in names if(p/n).exists()}
before=snap(B);assert len(before)==6
calls=[]
for args in [[],['--check']]:
 run=subprocess.run(['python','-B',str(B/'build.py'),*args],cwd=R,capture_output=True,text=True,encoding='utf8');assert run.returncode==0,run.stderr;assert snap(B)==before
 calls.append({'args':args,'exitCode':0,'result':json.loads(run.stdout),'mtimesAndBytesUnchanged':True})
for n in names:
 if n.endswith('.json'):
  b=(B/n).read_bytes();assert b.endswith(b'\n')and b'\r'not in b and not b.startswith(b'\xef\xbb\xbf')
with tempfile.TemporaryDirectory(prefix='waist-preflight-',dir=O)as tmp:
 t=Path(tmp);assert t.resolve().is_relative_to(O.resolve());(t/'source-lineage.json').write_bytes(b'late-conflict')
 try:m.build(out=t);raise AssertionError('expected conflict rejection')
 except ValueError as e:assert str(e)=='Output conflict: source-lineage.json';conflict=str(e)
 assert [p.name for p in t.iterdir()]==['source-lineage.json'];assert(t/'source-lineage.json').read_bytes()==b'late-conflict'
 fake=t/'bad-source';f=fake/json.loads((B/'spec.json').read_text(encoding='utf8'))['avatar']['path'];f.parent.mkdir(parents=True);f.write_bytes(b'wrong input')
 prior=m.ROOT;m.ROOT=fake
 try:
  try:m.plan();raise RuntimeError('wrong source must reject')
  except AssertionError as e:assert str(e)=='avatar';wrong=str(e)
 finally:m.ROOT=prior
 assert snap(B)==before
manifest=json.loads((B/'manifest.json').read_text(encoding='utf8'));assert manifest['avatarSha256'].startswith('cf1574')
assert [(e['slot'],e['covered'])for e in manifest['equipment']]==[('top',True),('bottom',False),('shoes',False)]
result={'schema':'native-waist-body-fit-production-check-v1','status':'CPU-data-ready-runtime-unregistered','buildScriptSHA':h((B/'build.py').read_bytes()),'specSHA':h((B/'spec.json').read_bytes()),'calls':calls,'allGeneratedJSON':'UTF8-noBOM-LF-final-newline','lateOutputConflict':{'error':conflict,'noOtherFilesWritten':True},'wrongSourceHash':{'rejectedKey':wrong,'noGeneratedFilesChanged':True},'temporaryCopiesRemoved':True,'runtimeAdmissionExecuted':False,'gpuOperations':0,'fixedOutputs':before}
with(O/'result.json').open('x',encoding='utf8')as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps({'status':result['status'],'tests':['repeat-identical-mtime','check-identical-mtime','late-conflict-no-write','wrong-source-refusal','LF-byte-contract'],'manifestSHA':h((B/'manifest.json').read_bytes())}))
