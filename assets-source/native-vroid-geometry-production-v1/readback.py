"""CPU comparison of native baseline, face-only and waist-only exports."""
from pathlib import Path
import hashlib,importlib.util,json,sys,io,time,copy
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
sp=importlib.util.spec_from_file_location('g',ROOT/'scripts/m2-male-face-v1/glb.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
FILES={'baseline':BASE/'generated/female-geometry-baseline.vrm','face':BASE/'generated/female-face-derived-correct.vrm','waist':BASE/'generated/female-waist-derived.vrm'}
def image(g,i):
 x=g.doc['images'][i];v=g.doc['bufferViews'][x['bufferView']];return g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def main():
 start=time.monotonic();out=BASE/'cpu-readback';assert not out.exists();out.mkdir(); gs={k:m.GLB(v) for k,v in FILES.items()}; docs={k:g.doc for k,g in gs.items()};base=gs['baseline'];fail=[];cases=[]
 for k in ['face','waist']:
  g=gs[k];d=g.doc; rows=[]; changed=[]
  assert len(base.doc['accessors'])==len(d['accessors'])
  for i in range(len(base.doc['accessors'])):
   a,b=base.acc(i),g.acc(i);exact=a.dtype==b.dtype and a.shape==b.shape and a.tobytes()==b.tobytes()
   if not exact:
    delta=np.asarray(b,dtype=float)-np.asarray(a,dtype=float);changed.append(dict(accessor=i,shape=list(a.shape),sourceSHA256=sha(a.tobytes()),candidateSHA256=sha(b.tobytes()),changedValues=int(np.count_nonzero(delta)),maxAbs=float(np.max(np.abs(delta))),meanAbs=float(np.mean(np.abs(delta)))))
  imgs=[]
  for i in range(len(base.doc['images'])):
   a,b=image(base,i),image(g,i);imgs.append(dict(index=i,encodedExact=a==b,sourceSHA256=sha(a),candidateSHA256=sha(b)))
  nodes=[]
  for i,(a,b) in enumerate(zip(base.doc['nodes'],d['nodes'])):
   if a!=b:nodes.append(dict(index=i,source=a,candidate=b))
  ext0,ext1=copy.deepcopy(base.doc['extensions']),copy.deepcopy(d['extensions'])
  for x in (ext0['VRMC_vrm']['meta'],ext1['VRMC_vrm']['meta']):
   for q in ['name','version','thumbnailImage']:x.pop(q,None)
  exprExact=ext0['VRMC_vrm']['expressions']==ext1['VRMC_vrm']['expressions']
  extensionExactExceptMeta=ext0==ext1
  human={v['node']:k for k,v in base.doc['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()}
  nodeDiffNames=[dict(index=i,name=d['nodes'][i].get('name'),humanoid=human.get(i),source=a,candidate=b) for i,(a,b) in enumerate(zip(base.doc['nodes'],d['nodes'])) if a!=b]
  ibmChanged=[]
  for si,(ss,ds) in enumerate(zip(base.doc['skins'],d['skins'])):
   ia,ib=ss.get('inverseBindMatrices'),ds.get('inverseBindMatrices')
   aa,bb=base.acc(ia),g.acc(ib)
   if not np.array_equal(aa,bb): ibmChanged.append(dict(skin=si,sourceAccessor=ia,candidateAccessor=ib,changedMatrices=int(np.any(aa!=bb,axis=1).sum()),maxAbs=float(np.max(np.abs(aa.astype(float)-bb.astype(float))))))
  basePos=g.acc(7) if 7 < len(g.doc['accessors']) else None
  # actual POSITION accessors are recorded in meshes, avoiding assumptions from generated indexing.
  positions=[]
  for mi,mesh in enumerate(d['meshes']):
   for pi,p in enumerate(mesh['primitives']):
    ai=p['attributes'].get('POSITION');
    if ai is None:continue
    a=np.asarray(base.acc(base.doc['meshes'][mi]['primitives'][pi]['attributes']['POSITION']),dtype=float);b=np.asarray(g.acc(ai),dtype=float)
    if a.shape==b.shape and not np.array_equal(a,b):
     baseP=base.doc['meshes'][mi]['primitives'][pi]; idx=np.unique(base.acc(baseP['indices'])); changedIdx=np.flatnonzero(np.any(a!=b,axis=1)); changedRef=np.intersect1d(changedIdx,idx)
     positions.append(dict(mesh=mi,primitive=pi,materialName=d['materials'][p['material']]['name'],accessor=ai,vertices=int(len(a)),changedVertices=int(len(changedIdx)),changedReferencedVertices=int(len(changedRef)),changedSourceIndices=changedRef.tolist(),maxAbs=float(np.max(np.abs(a-b))),meanAbs=float(np.mean(np.abs(a-b))),sourceBounds=[a.min(0).tolist(),a.max(0).tolist()],candidateBounds=[b.min(0).tolist(),b.max(0).tolist()]))
  if not positions:fail.append(k+': no POSITION geometry changed')
  cases.append(dict(id='female-'+k+'-geometry-v1',kind=k,status='geometry-changed' if positions else 'failed-no-geometry-change',source={'path':FILES['baseline'].relative_to(ROOT).as_posix(),'sha256':sha(FILES['baseline'].read_bytes())},candidate={'path':FILES[k].relative_to(ROOT).as_posix(),'sha256':sha(FILES[k].read_bytes()),'bytes':FILES[k].stat().st_size},accessorCount=len(d['accessors']),changedAccessors=changed,changedPositionGroups=positions,changedNodes=nodes,nodeDiffNames=nodeDiffNames,humanoidNodeChanges=[x for x in nodeDiffNames if x['humanoid']],auxiliaryNodeChanges=[x for x in nodeDiffNames if not x['humanoid']],changedIBM=ibmChanged,changedImages=[x for x in imgs if not x['encodedExact']],nonPositionChangedAccessors=[x['accessor'] for x in changed if x['accessor'] not in [p['attributes'].get('POSITION') for mesh in d['meshes'] for p in mesh['primitives']]],expressionsExact=exprExact,extensionsExactExceptMeta=extensionExactExceptMeta,sourceSkinCounts=[len(x['joints']) for x in base.doc['skins']],candidateSkinCounts=[len(x['joints']) for x in d['skins']],geometryParameters='Face candidate changed ChinRoundness .60->.78 and ChinFullCheeked .30->.48. Waist candidate changed WaistScaleMag .40->.58.',limits=['No runtime/factory/garment fit or game visual acceptance','Baseline is exported from the same female .vroid and settings, not an untouched parameter baseline','Position differences identify changed meshes but are not an anatomical quality judgment']))
 with (out/'result.json').open('xb') as f:f.write((json.dumps(dict(schema='native-geometry-production-readback-v1',status='two-native-geometry-derivatives-readback' if not fail else 'failed',baseline={'path':FILES['baseline'].relative_to(ROOT).as_posix(),'sha256':sha(FILES['baseline'].read_bytes()),'bytes':FILES['baseline'].stat().st_size},cases=cases,failures=fail,wallSeconds=time.monotonic()-start,sourceFemaleVroid={'path':'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vroid','sha256':'311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de'},originalEntryRestored=True,desktopInput=False,gpuOperations=0),ensure_ascii=False,indent=2)+'\n').encode())
 print(json.dumps({'status':'two-native-geometry-derivatives-readback' if not fail else 'failed','cases':[(x['kind'],len(x['changedPositionGroups']),len(x['changedAccessors'])) for x in cases],'failures':fail}))
if __name__=='__main__':main()
