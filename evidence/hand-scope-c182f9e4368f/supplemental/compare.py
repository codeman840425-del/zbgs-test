from pathlib import Path
import gzip,json,math,hashlib,subprocess
R=Path(__file__).resolve().parent;E=R/'evidence'
a=json.loads(gzip.decompress((E/'baseline/actual-surfaces.json.gz').read_bytes()));b=json.loads(gzip.decompress((E/'candidate/actual-surfaces.json.gz').read_bytes()))
def pct(v,p):return sorted(v)[min(len(v)-1,int(len(v)*p))]
def rotation(p,q):
 p=[x/math.sqrt(sum(v*v for v in p))for x in p];q=[x/math.sqrt(sum(v*v for v in q))for x in q];return math.degrees(2*math.acos(min(1,abs(sum(x*y for x,y in zip(p,q))))))
st={};maxd=(0,None);maxq=(0,None);maxstep=(0,None);root=phase=0;prior={}
assert len(a['timeline'])==len(b['timeline'])
for x,y in zip(a['timeline'],b['timeline']):
 assert abs(x['t']-y['t'])<1e-10
 root=max(root,math.dist(x['root'],y['root']));phase=max(phase,abs(x['jogPhase']-y['jogPhase']))
 s=st.setdefault(x['stage'],{'old':[],'new':[],'wristMax':0,'rotMaxDegrees':0,'contactsOld':0,'contactsNew':0})
 s['old'].append(x['simulateMs']);s['new'].append(y['simulateMs']);s['contactsOld']+=bool(x['handContacts']);s['contactsNew']+=bool(y['handContacts'])
 for p,q in zip(x['wrists'],y['wrists']):
  d=math.dist(p['position'],q['position']);angle=rotation(p['quaternion'],q['quaternion']);s['wristMax']=max(s['wristMax'],d);s['rotMaxDegrees']=max(s['rotMaxDegrees'],angle)
  at={'t':x['t'],'stage':x['stage'],'side':p['side']}
  if d>maxd[0]:maxd=(d,at)
  if angle>maxq[0]:maxq=(angle,at)
  offset=[v-u for u,v in zip(p['position'],q['position'])]
  if p['side']in prior:
   change=math.dist(offset,prior[p['side']])
   if change>maxstep[0]:maxstep=(change,at)
  prior[p['side']]=offset
for s in st.values():
 for k in ['old','new']:
  v=s[k];s[k]={'steps':len(v),'mean':sum(v)/len(v),'p50':pct(v,.5),'p95':pct(v,.95),'max':max(v)}
result={'baseline':a['build'],'candidate':b['build'],'steps':len(a['timeline']),'duration':a['timeline'][-1]['t'],'rootMaxError':root,'jogPhaseMaxError':phase,'maxWristDisplacement':maxd,'maxWristRotationDegreesNormalizedQuaternion':maxq,'maxCorrectionChangePer120HzStep':maxstep,'stages':st,'geometrySamples':{'old':[{'t':r['t'],'stage':r['stage'],'pairs':len(r['hits'])}for r in a['rows']],'new':[{'t':r['t'],'stage':r['stage'],'pairs':len(r['hits'])}for r in b['rows']]},'scope':'Synchronous 1/120 simulate costs only; excludes GPU draw/capture/serialization. No real rAF or target device claim.'}
(E/'comparison.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:result[k]for k in ['rootMaxError','jogPhaseMaxError','maxWristDisplacement','maxWristRotationDegreesNormalizedQuaternion','maxCorrectionChangePer120HzStep']},indent=2))
patch=subprocess.check_output(['git','diff','--','prototype/src/motion.js'],cwd=R);(E/'portable.patch').write_bytes(patch)
files=[R/'prototype/src/motion.js',R/'qa-hand-scope.cjs',Path(__file__),E/'portable.patch',E/'comparison.json']
files += [R/'qa-related-video.cjs', R/'qa-run-video.cjs', E/'HAND-SCOPE-RESULT.md', E/'hand-scope-index.html', E/'wrist-step-review.json',R/'decompose-snap.py',E/'wrist-snap-cause.json',E/'WRIST-SNAP-CAUSE.md',E/'left-snap-decomposition.json']
files += [R/'archive-snap.py',R/'qa-snap-video.cjs',R/'qa-rail-local.cjs',E/'EXACT-TRANSITION-RESULT.md',E/'snap-normal-summary.json',E/'c182-motion-original.js',E/'diagnostic-motion.js',E/'diagnostic.patch']
for directory in ['baseline','candidate','related-video','run-video','snap-normal-baseline','snap-normal-candidate','snap-paired-frames','rail-diagnostic']:
 files += [p for p in (E/directory).rglob('*') if p.is_file()]
receipt={'baseCommit':'39238212ef07fcc526cb40654135da66fdfc0bdd','baseBuild':a['build'],'candidateBuild':b['build'],'dependencies':'npm ci --ignore-scripts, locked package-lock, 33 packages, npm audit 0 vulnerabilities','change':'Only skip leavingIdle early return for requested walk/dance; no solver/cache/targets/threshold/constants changed. Legacy no-calibration cache branch retained; calibrated original female never enters it.','files':[{'file':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in files]}
(E/'manifest.json').write_text(json.dumps(receipt,indent=2))
