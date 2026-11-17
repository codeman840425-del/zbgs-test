"""Actual sealed staging implementation; outputs are temporary and never public."""
from pathlib import Path
import sys,importlib.util,tempfile,hashlib,json
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[2];O=Path(__file__).resolve().parent;h=lambda b:hashlib.sha256(b).hexdigest()
file=R/'scripts/stage-native-face-factory.py';s=importlib.util.spec_from_file_location('stage',file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def snapshot(p):return {x.relative_to(p).as_posix():{'sha256':h(x.read_bytes()),'mtimeNs':x.stat().st_mtime_ns,'bytes':x.stat().st_size}for x in sorted(p.rglob('*'))if x.is_file()}
results={'scriptSha256':h(file.read_bytes()),'tests':[]}
with tempfile.TemporaryDirectory(prefix='temporary-stage-',dir=O)as tmp:
 t=Path(tmp);assert t.resolve().is_relative_to(O.resolve())
 dst=t/'good';first=m.stage(destination=dst);before=snapshot(dst);second=m.stage(destination=dst);assert snapshot(dst)==before;assert len(before)==8
 results['tests'].append({'case':'actual-first-stage-and-repeat','first':first,'second':second,'files':before,'secondBytesAndMtimesExact':True})
 conflict=t/'conflict';conflict.mkdir();(conflict/'staging-manifest.json').write_bytes(b'late-plan-conflict');old=snapshot(conflict)
 try:m.stage(destination=conflict);raise AssertionError('expected conflict refusal')
 except ValueError as e:assert 'Refusing different staged output' in str(e);reason=str(e)
 assert snapshot(conflict)==old;results['tests'].append({'case':'last-plan-target-conflict','refusal':reason,'noOtherWrites':True})
 fake=t/'wrong-source';source=next(iter(m.FILES.values()))[0];p=fake/source;p.parent.mkdir(parents=True);p.write_bytes(b'wrong-source-sha')
 wrongDest=t/'wrong-destination'
 try:m.stage(destination=wrongDest,source_root=fake);raise AssertionError('expected source refusal')
 except ValueError as e:assert 'Source identity mismatch' in str(e);reason=str(e)
 assert not wrongDest.exists();results['tests'].append({'case':'wrong-source-hash','refusal':reason,'noDestinationCreated':True})
results.update(passed=True,temporaryResourceCopiesRemoved=True,scope='CPU staging only; exact plan eight files. No public writes or game acceptance')
with(O/'staging-regression.json').open('x',encoding='utf8')as f:json.dump(results,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps({'passed':True,'tests':len(results['tests'])}))
