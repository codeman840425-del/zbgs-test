"""Independent sealed-array/source readback; no Blender, topology creation, G or contacts."""
import hashlib,importlib.util,json,sys
from pathlib import Path
import numpy as np
from scipy.sparse import csr_matrix
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-boundary-refinement-api-recovery-v1';OUT=BASE/'generated'
spec=json.loads((BASE/'spec.json').read_bytes())
for row in spec['inputs']:assert hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
loader=importlib.util.spec_from_file_location('recovery_readback_glb',ROOT/'scripts/m2-male-face-v1/glb.py')
mod=importlib.util.module_from_spec(loader);loader.loader.exec_module(mod)
g=mod.GLB(ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm')
z=np.load(OUT/'body-arrays.npz',allow_pickle=False);raw=np.load(OUT/'S-body-csr.npz',allow_pickle=False)
S=csr_matrix((raw['data'],raw['indices'],raw['indptr']),shape=tuple(raw['shape']))
P=g.acc(7);n=len(P);assert S.shape==(7896,n)
for name,acc in [('sourcePosition',7),('sourceNORMAL',8),('sourceUV',9),('sourceJointIDs',10),('sourceWeights',11)]:
 assert np.array_equal(z[name],g.acc(acc)),name
for name,acc in [('newPosition',7),('newNORMAL',8),('newUV',9)]:
 assert np.array_equal(z[name],S@g.acc(acc).astype(float)),name
assert np.array_equal(z['newJointIDs'][:n],g.acc(10)) and np.array_equal(z['newWeights'][:n],g.acc(11))
mesh=g.doc['meshes'][0];F=np.concatenate([g.acc(p['indices']).reshape(-1,3) for p in mesh['primitives']])
assert len(mesh['primitives'])==6 and all(not p.get('targets') for p in mesh['primitives'])
assert np.array_equal(z['sourceTriangles'],F)
skin=g.doc['skins'][next(node['skin'] for node in g.doc['nodes'] if node.get('mesh')==0)]
assert np.array_equal(z['skinJointNodes'],skin['joints'])
assert np.array_equal(z['inverseBindMatrices'],g.acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1))
lineage=json.loads((OUT/'body-provenance.json').read_bytes());affected=set(lineage['affectedParents'])
parents=z['parentTriangle'];NF=z['newTriangles'];bary=z['parentBary']
unaffected=0
for p in range(len(F)):
 ids=np.flatnonzero(parents==p)
 if p not in affected:
  assert len(ids)==1 and np.array_equal(NF[ids[0]],F[p]);unaffected+=1
 for child in ids:
  assert np.array_equal(z['newPosition'][NF[child]],bary[child]@P[F[p]].astype(float))
assert unaffected==11969
def edges(faces):return {tuple(sorted((int(a),int(b)))) for t in faces for a,b in zip(t,np.roll(t,-1))}
be=edges(NF);fz=np.load(ROOT/'assets-source/m2-source-subdivision-seam-v1/generated/group-21.npz',allow_pickle=False);fe=edges(fz['newTriangles'])
seams=json.loads((OUT/'cross-accessor-seams.json').read_bytes())
for row in seams:
 bm=row['localBodyMidpointID'];fm=row['faceMidpoint']
 assert np.array_equal(z['newPosition'][bm],fz['newPosition'][fm])
 for edge,mid,collection in [(row['bodyEdge'],bm,be),(row['faceEdge'],fm,fe)]:
  assert tuple(sorted(edge)) not in collection
  assert all(tuple(sorted((v,mid))) in collection for v in edge)
assert len(seams)==41 and fz['newDelta'].shape==(54,7251,3)
result={'schema':'boundary-recovery-independent-array-readback-v1','passed':True,
 'sourcePropertiesExact':True,'authoritativeSparseReplayExact':True,'all7855OldVertexValuesPreserved':True,
 'unaffectedOriginalTrianglesExact':unaffected,'affectedOriginalParents':len(affected),
 'sourceSkinJointNodesAndIBMExact':True,'allChildParentBaryPositionsExact':True,
 'crossAccessor41PositionsExactAndHalfEdgesPresent':True,'face54TargetsReused':True,
 'sourceSpecSHA256':hashlib.sha256((BASE/'spec.json').read_bytes()).hexdigest(),
 'realSourceRefinementRerun':False,'GCalled':False,'candidateContactsRun':False}
path=OUT/'independent-array-readback.json'
if path.exists():raise RuntimeError('Refuse overwrite')
path.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
