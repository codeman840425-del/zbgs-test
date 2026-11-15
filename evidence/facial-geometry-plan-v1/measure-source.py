"""Read-only source measurements for one proposed mouth-width specimen. No asset writes."""
from pathlib import Path
import sys,json,hashlib,collections
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
mask=json.loads((ROOT/'assets-source/appearance-color-v1/manifest.json').read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
out={'scope':'Read-only pinned original VRM geometry/morph measurements; no deformed sample exported or visually accepted','bodies':{}}
for sex in ['female','male']:
 p=ROOT/f'prototype/public/assets/foundation/base-{sex}-roundtrip.vrm';g=GLB(p)
 assert sha(p)==mask['bodies'][sex]['avatarSha256']
 mi=next(i for i,m in enumerate(g.doc['meshes'])if m['name'].startswith('Face'))
 mesh=g.doc['meshes'][mi];names=mesh['extras']['targetNames'];node=next(n for n in g.doc['nodes']if n.get('mesh')==mi);skin=g.doc['skins'][node['skin']];jointnames=[g.doc['nodes'][j]['name']for j in skin['joints']]
 materials={g.doc['materials'][prim['material']]['name']:prim for prim in mesh['primitives']}
 skinprim=next(v for k,v in materials.items()if 'Face_00_SKIN'in k);mouth=next(v for k,v in materials.items()if 'FaceMouth'in k)
 xyz=g.acc(skinprim['attributes']['POSITION']);ring=mask['baseMasks'][sex]['lips']['mouthBoundaryVertices'];r=xyz[ring];cx=float((r[:,0].min()+r[:,0].max())/2)
 measurements=[]
 for name,prim in materials.items():
  inds=g.acc(prim['indices']).ravel();used=np.unique(inds);q=g.acc(prim['attributes']['POSITION']);weights=g.acc(prim['attributes']['WEIGHTS_0'])[used];joints=g.acc(prim['attributes']['JOINTS_0'])[used]
  sums={jointnames[int(j)]:float(weights[joints==j].sum()) for j in np.unique(joints[weights>1e-6])}
  measurements.append({'material':name,'usedVertices':len(used),'triangles':len(inds)//3,'bounds':[q[used].min(0).tolist(),q[used].max(0).tolist()],'weightedJoints':sums})
 # Material components describe source authoring, not inferred teeth/tongue semantics.
 tris=g.acc(mouth['indices']).reshape(-1,3);adj=collections.defaultdict(set)
 for tri in tris:
  for a in tri:
   adj[int(a)].update(int(b)for b in tri)
 unseen=set(adj);comps=[]
 while unseen:
  todo=[unseen.pop()];comp=set(todo)
  while todo:
   for b in adj[todo.pop()]:
    if b in unseen:unseen.remove(b);comp.add(b);todo.append(b)
  q=xyz[sorted(comp)];comps.append({'vertices':len(comp),'bounds':[q.min(0).tolist(),q.max(0).tolist()]})
 morphs=[]
 for name,target in zip(names,skinprim.get('targets',[])):
  d=g.acc(target['POSITION']);m=float(np.linalg.norm(d[ring],axis=1).max())
  if m>1e-7:morphs.append({'name':name,'maxBoundaryDisplacementM':m,'posedBoundaryWidthM':float(np.ptp((xyz+d)[ring,0]))})
 # Check direct seam correspondence at the external mouth opening; not a visual closure proof.
 mouthids=np.unique(tris);d=np.linalg.norm(r[:,None,:]-xyz[mouthids][None,:,:],axis=2);closest=d.min(1)
 out['bodies'][sex]={'source':str(p.relative_to(ROOT)).replace('\\','/'),'avatarSha256':sha(p),'faceMeshIndex':mi,'faceBufferVertices':len(xyz),'expressionTargets':len(names),'mouthBoundaryVertices':ring,'mouthBoundaryWidthM':float(np.ptp(r[:,0])),'mouthBoundaryBounds':[r.min(0).tolist(),r.max(0).tolist()],'mouthCenterX':cx,'proposal4PercentWidthDeltaM':float(np.ptp(r[:,0])*.04),'proposalMaxCoreRestLateralOffsetM':float(max(abs(r[:,0]-cx))*.04),'mouthInnerNearestBoundaryDistanceM':{'min':float(closest.min()),'max':float(closest.max()),'within0_1mm':int((closest<.0001).sum())},'mouthPrimitiveIndex':mesh['primitives'].index(mouth),'mouthIndexComponents':sorted(comps,key=lambda x:-x['vertices']),'mouthBoundaryMorphs':morphs,'materials':measurements,'vrmLookAt':g.doc['extensions']['VRM']['firstPerson'],'expressionPresetNames':[x['presetName']for x in g.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']]}
out['inputs']={str(p.relative_to(ROOT)).replace('\\','/'):sha(p)for p in [ROOT/'scripts/m1-variants/build-variants.py',ROOT/'scripts/m2-male-face-v1/build.py',ROOT/'scripts/appearance-color-v1/build-masks.py',ROOT/'assets-source/appearance-color-v1/manifest.json']}
(ROOT/'evidence/facial-geometry-plan-v1/source-measurements.json').write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps({s:{k:d[k]for k in ['faceBufferVertices','expressionTargets','mouthBoundaryWidthM','proposal4PercentWidthDeltaM','mouthInnerNearestBoundaryDistanceM']}for s,d in out['bodies'].items()},indent=2))
