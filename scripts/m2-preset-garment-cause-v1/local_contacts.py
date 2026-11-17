"""One bounded official-CGAL left-armpit source/target comparison, no repairs."""
import importlib.util
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys

sys.dont_write_bytecode=True
import numpy as np
import igl.copyleft.cgal as cgal

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'evidence/m2-preset-garment-cause-v1'
official=json.loads((ROOT/'evidence/m2-official-intersection-preflight-v1/report.json').read_bytes())
native=[{'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
        for p in sorted(Path(cgal.__file__).parent.glob('*.pyd'))]
assert native==official['native'],'Installed CGAL binary differs from existing official API smoke'
spec=importlib.util.spec_from_file_location('cause_reader',ROOT/'scripts/m2-male-face-v1/glb.py')
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
source=reader.GLB(ROOT/'prototype/public/assets/m1b/m1b-uniform-top.glb')
target=reader.GLB(ROOT/'assets-source/m2-representative-batch-v2/generated/male-wide-muscular-v2/male-wide-muscular-v2-top.glb')
p=source.doc['meshes'][0]['primitives'][0];q=target.doc['meshes'][0]['primitives'][0]
P=source.acc(p['attributes']['POSITION']).astype(float);Q=target.acc(q['attributes']['POSITION']).astype(float)
F=source.acc(p['indices']).reshape(-1,3).astype(np.int64);assert np.array_equal(F,target.acc(q['indices']).reshape(-1,3))
C=P[F].mean(1)
ids=np.flatnonzero((C[:,0]<-.10)&(C[:,0]>-.30)&(C[:,1]>1.25)&(C[:,1]<1.44)&(C[:,2]<.04))
pose=json.loads((OUT/'male-wide-muscular-v2-cpu-idle.json').read_bytes())
live=next(m for m in pose['meshes'] if m['visible'] and 'Tops_01' in m['materialNames'][0])
mat=lambda a:np.asarray(a).reshape(4,4).T


def skin(points):
    joints=np.asarray(live['joints']).reshape(-1,4);weights=np.asarray(live['weights']).reshape(-1,4)
    base=np.column_stack((points,np.ones(len(points))))@mat(live['bindMatrix']).T
    result=np.zeros_like(base)
    for i,b in enumerate(live['bones']):
        w=np.where(joints==i,weights,0).sum(1)
        result+=(base@(mat(b['matrixWorld'])@mat(b['inverseBind'])).T)*w[:,None]
    result[:,3]=1
    return (result@mat(live['bindMatrixInverse']).T@mat(live['matrixWorld']).T)[:,:3]


def category(a,b):
    if a==b:return 'same-face'
    if np.intersect1d(F[a],F[b]).size:return 'shared-source-index'
    if any(np.array_equal(u,v) for u in P[F[a]] for v in P[F[b]]):return 'source-coordinate-alias'
    return 'no-shared-source-index-or-coordinate'


def detect(points):
    raw=cgal.intersect_other(np.ascontiguousarray(points),F[ids],np.ascontiguousarray(points),F[ids],
        detect_only=True,first_only=False,stitch_all=False,slow_and_more_precise_rounding=False,cutoff=1000)
    assert len(raw)==5 and all(np.asarray(a).size==0 for a in raw[1:])
    pairs=sorted(set(tuple(sorted((int(ids[a]),int(ids[b])))) for a,b in np.asarray(raw[0]).reshape(-1,2)))
    groups={}
    for a,b in pairs:groups.setdefault(category(a,b),[]).append([a,b])
    return {'allPairs':pairs,'categories':groups,'count':len(pairs)}


world=skin(Q);assert np.max(np.linalg.norm(world-np.asarray(live['worldPositionsM']),axis=1))<1e-12
states={name:detect(points) for name,points in [('source-bind',P),('target-bind',Q),('source-common-idle',skin(P)),('target-common-idle',world)]}
added={}
for suffix in ['bind','common-idle']:
    old=set(map(tuple,states['source-'+suffix]['allPairs']));new=set(map(tuple,states['target-'+suffix]['allPairs']))
    added[suffix]=[{'pair':list(pair),'category':category(*pair),'sourceIndices':[F[f].tolist()for f in pair]}for pair in sorted(new-old)]
report={'schema':'local-garment-inclusive-contact-comparison-v1','material':source.doc['materials'][p['material']]['name'],
    'native':native,'versions':{name:importlib.metadata.version(name)for name in ['libigl','numpy','scipy']},
    'selectedSourceTriangleIndices':ids.tolist(),'states':states,'addedPairs':added,
    'sourceAndTargetCommonPaletteMaxErrorM':float(np.max(np.linalg.norm(world-np.asarray(live['worldPositionsM']),axis=1))),
    'scope':'Same left-armpit original triangle set, inclusive CGAL; categories retained, no pairs silently discarded. Common idle is virtual, not captured browser frame.',
    'pins':{},'runtimeAccepted':False}
for path in [Path(__file__),ROOT/'prototype/public/assets/m1b/m1b-uniform-top.glb',
 ROOT/'assets-source/m2-representative-batch-v2/generated/male-wide-muscular-v2/male-wide-muscular-v2-top.glb',
 OUT/'male-wide-muscular-v2-cpu-idle.json',ROOT/'scripts/m2-official-intersection-preflight-v1/check.py',
 ROOT/'evidence/m2-official-intersection-preflight-v1/report.json']:
    report['pins'][path.relative_to(ROOT).as_posix()]=hashlib.sha256(path.read_bytes()).hexdigest()
(OUT/'male-local-contacts.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
print(json.dumps({'triangles':len(ids),'counts':{k:v['count']for k,v in states.items()},'added':{k:len(v)for k,v in added.items()},
 'addedNonadjacent':{k:sum(a['category']=='no-shared-source-index-or-coordinate'for a in v)for k,v in added.items()}}))
