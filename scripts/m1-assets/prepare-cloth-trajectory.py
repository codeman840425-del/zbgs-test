"""Reuse recorded complete 270-frame sit/rise authoring track, identity checked.
No browser; this historical capture is not current product acceptance.
"""
import hashlib,json,pathlib
import numpy as np
R=pathlib.Path(__file__).resolve().parents[2];S=R/'assets-source/m1/offline-corrective/open-waist-v1';O=R/'assets-source/m1/offline-corrective/local-sim-v1';C=R/'experiments/skirt-offline-corrective/capture-ca72ada827d2';c=json.loads((C/'capture.json').read_text(encoding='utf8'));fixed=json.loads((R/'experiments/skirt-offline-corrective/displayed-initial-0df63cf2bdea/standing-01/initial.json').read_text(encoding='utf8'));mesh=json.loads((O/'simulation-mesh.json').read_text(encoding='utf8'));rest=json.loads((S/'standing-rest-candidate.json').read_text(encoding='utf8'));edit=json.loads((S/'edit.json').read_text(encoding='utf8'));t=json.loads((S/'topology.json').read_text(encoding='utf8'))
for name in ['source.f32','colliders.f32']:assert hashlib.sha256((C/name).read_bytes()).hexdigest()==c[name]['sha256']
assert c['identity']['primary']['actualSha256']==fixed['identity']['primary']['actualSha256'];assert len(c['frames'])==270 and min(x['sitProgress']for x in c['frames'])==0 and max(x['sitProgress']for x in c['frames'])==1
used=np.array(edit['resultRenderVertexToOriginal']);mapping=np.array(t['renderToWeld']);N=len(t['position']);counts=np.bincount(mapping)
def weld(p):
 out=np.zeros((N,3));np.add.at(out,mapping,p[used]);return out/counts[:,None]
hip0=np.array(fixed['hipWorld']).reshape(4,4).T;raw0=weld(np.array(fixed['raw']['positions']));localRaw=(np.c_[raw0,np.ones(N)]@np.linalg.inv(hip0).T)[:,:3];delta=np.array(rest['positionsHipLocal'])-localRaw
raw=np.fromfile(C/'source.f32',dtype='<f4').reshape(270,-1,3);pin=[]
for frame,p in zip(c['frames'],raw):
 h=np.array(frame['hipWorld']).reshape(4,4).T;w=weld(p)+delta@h[:3,:3].T
 pin.append([sum(w[i]*weight for i,weight in weights)for weights in mesh['simulationVertexFromOriginalSparseWeights']])
pin=np.array(pin,dtype='<f4');pinFile=O/'pin-targets.f32';pinFile.write_bytes(pin.tobytes())
manifest={'schema':'m1.complete-source-pose-trajectory.1','capture':str(C.relative_to(R)),'captureBuild':c['identity']['runtimeBuild']['shortId'],'captureJSONSHA256':hashlib.sha256((C/'capture.json').read_bytes()).hexdigest(),'fixedRestBuild':fixed['identity']['runtimeBuild']['shortId'],'sameBodySHA256':c['identity']['primary']['actualSha256'],'frames':len(c['frames']),'fps':c['fps'],'simulationVertices':mesh['simulationVertices'],'pinTargetsSHA256':hashlib.sha256(pinFile.read_bytes()).hexdigest(),'sourcePositionsHash':c['source.f32']['sha256'],'colliderPositionsHash':c['colliders.f32']['sha256'],'method':'Actual captured original weighted skirt positions plus constant fitted offset in current hips orientation. Interpolate new simulation vertices using exact recorded midpoint weights; original vertices preserved. Only pin targets drive cloth, unpinned old authored poses do not replace simulation.','events':[{'frame':i+1,'mode':x['mode'],'sitProgress':x['sitProgress']}for i,x in enumerate(c['frames'])if i in [0,59,60,90,120,179,180,210,269]],'limits':['Historical ca72 source-authoring data, not final-product runtime test','Initial pose must be independently rechecked after applying fitted source offset','Full collider geometry retained except approved top cap opening']}
(O/'trajectory.json').write_text(json.dumps(manifest,indent=2),encoding='utf8');print(json.dumps({'frames':270,'vertices':mesh['simulationVertices'],'events':manifest['events']}))
