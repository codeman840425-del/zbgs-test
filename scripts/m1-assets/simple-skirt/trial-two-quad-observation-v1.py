"""Two explicitly rejected observations. No source or physical parameter changes."""
from pathlib import Path
import os,hashlib,json
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1'
mode=os.environ.get('SKIRT_OBSERVATION','moving');assert mode in ('moving','static')
folder='native-full-observation-v1' if mode=='moving' else 'native-static-control-v1'
O=S/'two-quad-thirds-v1'/folder;O.mkdir(exist_ok=True)
# Reuse frozen adapter transformations, inserting observer-only changes before compilation.
adapter=R/'scripts/m1-assets/simple-skirt/trial-two-quad-diagnostic-v1.py'
wrapper=adapter.read_text(encoding='utf-8')
wrapper=wrapper.replace("O=S/'two-quad-thirds-v1/native-author-trial-v1'","O=S/'two-quad-thirds-v1'/folder")
end=";exec(compile(text,str(source),'exec'),globals())"
assert wrapper.count(end)==1
wrapper=wrapper.replace(end,'')
exec(compile(wrapper,str(adapter),'exec'),globals())
replace("O=A/'native-author-trial-v1'", "O=A/"+repr(folder))
replace("results=[];reason=None;firstFailure=None", "results=[];reason=None;firstFailure=None;firstMaterial=None;comparisons=[]")
if mode=='static':
    replace("gate=json.loads", "frames=[frames[0] for _ in range(18)]\ngate=json.loads")
    replace("animate(skirt,targets);", "animate(skirt,targets);") if False else None
# Record original gates separately; observation hard limit never changes admission status.
replace("    if reason:\n        if firstFailure is None:", "    if stretch.max()>1.25 and firstMaterial is None:\n        firstMaterial={'frame':i+1,'maxEdgeStretch':float(stretch.max())}\n    if reason:\n        if firstFailure is None:")
replace("        if reason!='actual-triangle-crossing':break", "        if reason not in ('actual-triangle-crossing','material-edge-stretch'):break\n    if stretch.max()>2.0:reason='diagnostic-hard-edge2';break")
anchor="    lengths=np.linalg.norm"
check=r"""    if mode=='moving' and i<18:
        old=json.loads(gzip.decompress((A/'native-author-trial-v1'/('frame-%02d.json.gz'%(i+1))).read_bytes()))
        oldP=np.array(old['positionsWorld']);equal=bool(np.array_equal(oldP,p));comparisons.append({'frame':i+1,'exact':equal,'maxAbsoluteDifference':float(np.max(np.abs(oldP-p)))})
        (O/'first18-comparison.json').write_text(json.dumps(comparisons,indent=2)+'\n',encoding='utf-8')
        assert equal,'First18 changed: stop without retry'
"""
replace(anchor,check+anchor)
replace("'maxEdgeStretch':float(stretch.max()),", "'maxEdgeStretch':float(stretch.max()),'originalHemEdgeLengthMetres':float(np.linalg.norm(p[1239]-p[1240])),'originalHemEdgeRatio':float(np.linalg.norm(p[1239]-p[1240])/np.linalg.norm(points[1239]-points[1240])),")
replace("'firstFailure':firstFailure,", "'firstFailure':firstFailure,'firstMaterialFailure':firstMaterial,'observationMode':mode,'originalAdmissionEdgeLimit':1.25,'diagnosticHardEdgeLimit':2.0,'first18Exact':all(c['exact'] for c in comparisons) if mode=='moving' else None,")
replace("'completed60-diagnostic-frames'if len(results)==60 else reason", "'completed-observation-frames'if len(results)==len(frames) else reason")
(O/'trial-adapter.json').write_text(json.dumps({'mode':mode,'compiledTrialSha256':hashlib.sha256(text.encode()).hexdigest(),'changes':changes,'physicsParameterChanges':[],'sourceUnchanged':True,'admissionUnchanged':True,'purpose':'Rejected observation only; original first contact and1.25 material failures remain permanent.'},indent=2)+'\n',encoding='utf-8')
exec(compile(text,str(source),'exec'),globals())
