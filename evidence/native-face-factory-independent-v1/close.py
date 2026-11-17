from pathlib import Path
import json,hashlib,subprocess
R=Path(__file__).resolve().parents[2];O=Path(__file__).resolve().parent;h=lambda b:hashlib.sha256(b).hexdigest()
data=json.loads((O/'admission-v1/result.json').read_text(encoding='utf8'));stage=json.loads((O/'stage-result.json').read_text(encoding='utf8'));pins={};normalizations=[]
for file,expected in {**stage['pins'],**{'prototype/src/'+k:v for k,v in data['runtimeSHA'].items()}}.items():
 raw=(R/file).read_bytes();actual=h(raw)
 if actual!=expected:
  assert file=='prototype/src/appearance-color-policy.js' and h(raw.replace(b'\r\n',b'\n'))==expected
  normalizations.append({'path':file,'testedLF':expected,'finalCRLF':actual,'LFNormalizedExact':True})
 pins[file]=actual
packages=[]
for name in ['native-vroid-face-factory-equipment-v1','native-vroid-face-body-texture-fit-v1']:
 p=R/'assets-source'/name/'package-files.json';d=json.loads(p.read_text(encoding='utf8'))
 for row in d['files']:assert h((R/row['path']).read_bytes())==row['sha256'],row['path']
 packages.append({'path':p.relative_to(R).as_posix(),'sha256':h(p.read_bytes()),'checkedFiles':len(d['files'])})
assert packages[1]['sha256']=='c21a6c4936128ecf8910ba522a293a6980061f4580a93c4d97667186220f678b'
commands=[]
for script in ['assets-source/native-vroid-face-body-texture-fit-v1/build.py','scripts/stage-native-face-factory.py']:
 run=subprocess.run(['python','-B',script,'--check'],cwd=R,capture_output=True,text=True,encoding='utf8');assert run.returncode==0,run.stderr
 commands.append({'command':['python','-B',script,'--check'],'scriptSha256':h((R/script).read_bytes()),'exitCode':run.returncode,'stdout':run.stdout,'stderr':run.stderr})
artifacts={f:h((O/f).read_bytes())for f in ['source-result.json','floor-result.json','coverage-v1/result.json','admission-v1/result.json','stage-result.json','staging-regression.json','REVIEW.md']}
closure={'schema':'native-face-factory-independent-closure-v1','status':'no-new-blocker-in-source-and-CPU-factory-scope','artifacts':artifacts,'finalRuntimePins':pins,'newlineOnlyChanges':normalizations,'sourcePackages':packages,'finalReadOnlyChecks':commands,'stageManifestSHA':'95c1523a074ea9fdc0fc08ea12b2ba46f99ec0523c3d7ad7810da2fea0b3f629','gpuAccepted':False,'motionContactAccepted':False,'productionFilesModified':False,'requestedConfiguration':'gpt-6-astra/high; actual provider/hook not independently verified'}
with(O/'closure.json').open('x',encoding='utf8')as f:json.dump(closure,f,ensure_ascii=False,indent=2);f.write('\n')
files=[{'path':p.relative_to(R).as_posix(),'sha256':h(p.read_bytes()),'bytes':p.stat().st_size}for p in sorted(O.rglob('*'))if p.is_file() and p.name!='package-files.json']
with(O/'package-files.json').open('x',encoding='utf8')as f:json.dump({'schema':'native-face-factory-independent-files-v1','files':files},f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps({'closureSHA':h((O/'closure.json').read_bytes()),'packageSHA':h((O/'package-files.json').read_bytes()),'files':len(files),'status':closure['status']}))
