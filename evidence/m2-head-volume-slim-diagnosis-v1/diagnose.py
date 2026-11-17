"""Existing raw solve readback only. No optimization or candidate generation."""
import sys
sys.dont_write_bytecode=True
import hashlib
import importlib.util
import json
from decimal import Decimal, localcontext, ROUND_FLOOR, ROUND_CEILING
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).with_name('result-v2.json')
if OUT.exists(): raise SystemExit('Refusing to overwrite evidence')
DOMAIN=ROOT/'assets-source/m2-head-volume-domain-v1/generated'
SOLVE=ROOT/'assets-source/m2-head-volume-slim-v1/generated'
D=np.load(DOMAIN/'domain.npz',allow_pickle=False)
V,T,P=D['nodesM'],D['tetrahedra'],D['sourceEndpointsM']
E=np.swapaxes(V[T[:,1:]]-V[T[:,:1]],1,2)
rest_det=np.linalg.det(E)
vol=rest_det/6
condition=np.linalg.cond(E)
G,Pr,Fr=D['guideNodes'],D['protectedNodes'],D['frameNodes']
sets={'guide':set(map(int,G)),'protected':set(map(int,Pr)),'frame':set(map(int,Fr))}
records=json.loads((DOMAIN/'endpoint-records.json').read_bytes())
loader=importlib.util.spec_from_file_location('readonly_source',ROOT/'scripts/m2-representative-batch-v1/deform.py')
legacy=importlib.util.module_from_spec(loader);loader.loader.exec_module(legacy)
source=legacy.GLB((ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm').read_bytes())
human={a['node']:a['bone'] for a in source.doc['extensions']['VRM']['humanoid']['humanBones']}
joint_names=[human.get(i,source.doc['nodes'][i].get('name',str(i))) for i in source.doc['skins'][0]['joints']]
meaning={}
for row in records:
    if row['role']=='required-head-endpoint': continue
    for j,p in enumerate(P[row['offset']:row['offset']+row['count']]):
        meaning.setdefault(tuple(p),[]).append((row,j))
def semantic(node):
    groups={}
    for row,j in meaning.get(tuple(V[node]),[]):
        key=(row['material'],row['sourceIndices'][j]);groups.setdefault(key,[]).append(row['endpoint'])
    out=[]
    for (material,index),ends in groups.items():
        row=next(r for r in records if r['material']==material)
        primitive=source.doc['meshes'][row['mesh']]['primitives'][row['primitive']]
        ji=np.asarray(source.accessor(primitive['attributes']['JOINTS_0']))[index]
        we=np.asarray(source.accessor(primitive['attributes']['WEIGHTS_0']))[index]
        out.append({'material':material,'sourceVertex':index,'endpointIndices':sorted(set(ends)),
                    'weights':[(joint_names[int(j)],float(w)) for j,w in zip(ji,we) if w>0]})
    return out
def add(a,b):
    with localcontext() as c:
        c.prec=70;c.rounding=ROUND_FLOOR;lo=a[0]+b[0]
        c.rounding=ROUND_CEILING;hi=a[1]+b[1]
    return lo,hi
def neg(a):return a[1].copy_negate(),a[0].copy_negate()
def sub(a,b):return add(a,neg(b))
def mul(a,b):
    with localcontext() as c:
        c.prec=70;c.rounding=ROUND_FLOOR;lo=min(x*y for x in a for y in b)
        c.rounding=ROUND_CEILING;hi=max(x*y for x in a for y in b)
    return lo,hi
def interval_determinant(points,ids):
    vertices=[]
    for p,node in zip(points,ids):
        e=Decimal('0.002') if int(node) in sets['guide'] else Decimal('0.000002')
        vertices.append([add((Decimal.from_float(float(x)),)*2,(-e,e)) for x in p])
    A=[[sub(vertices[j+1][i],vertices[0][i]) for j in range(3)] for i in range(3)]
    out=(Decimal(0),Decimal(0))
    for perm,sign in [((0,1,2),1),((1,2,0),1),((2,0,1),1),((2,1,0),-1),((1,0,2),-1),((0,2,1),-1)]:
        term=mul(mul(A[0][perm[0]],A[1][perm[1]]),A[2][perm[2]])
        out=add(out,term if sign==1 else neg(term))
    return out
def energy(X,ids,bc):
    J=np.linalg.solve(E.transpose(0,2,1),np.swapaxes(X[T[:,1:]]-X[T[:,:1]],1,2).transpose(0,2,1)).transpose(0,2,1)
    sv=np.linalg.svd(J,compute_uv=False)
    elastic=float(np.dot(vol,(sv**2+sv**-2).sum(1)))
    penalty=float(1e5*np.square(X[ids]-bc).sum())
    return J,{'elasticIntegral':elastic,'softPenalty':penalty,'normalizedTotal':(elastic+penalty)/float(vol.sum())}
result={'schema':'native-head-slim-readonly-diagnosis-v1','shapeSolveCalled':False,'candidateGenerated':False,
        'worstRestConditionTet':int(condition.argmax()),'worstRestCondition':float(condition.max()),'cases':[],'inputHashes':{}}
for name in ('male-long-lean-v2','male-round-stocky-v2'):
    path=SOLVE/name/'solved-nodes.npz';raw=path.read_bytes()
    result['inputHashes'][path.relative_to(ROOT).as_posix()]=hashlib.sha256(raw).hexdigest()
    saved=np.load(path,allow_pickle=False);X=saved['positionsM'];ids=saved['constraintIndices'];bc=saved['constraintTargetsM']
    _,initial=energy(V,ids,bc);J,actual=energy(X,ids,bc);jd=np.linalg.det(J)
    bad=np.flatnonzero(jd<=.12)
    target=V.copy();target[ids]=bc
    full=np.all(np.isin(T,ids),axis=1)
    requested_ratio=np.linalg.det(np.swapaxes(target[T[:,1:]]-target[T[:,:1]],1,2))/rest_det
    target_bad=np.flatnonzero(full&(requested_ratio<=0))
    guide_res=np.linalg.norm(X[G]-target[G],axis=1)
    record={'id':name,'initialEnergy':initial,'actualEnergy':actual,
            'totalEnergyReductionFraction':1-actual['normalizedTotal']/initial['normalizedTotal'],
            'guideResidualMinMedianMaxM':np.quantile(guide_res,[0,.5,1]).tolist(),
            'guideResidualsM':guide_res.tolist(),
            'minimumActualDet':float(jd.min()),'worstRestConditionTetActualDet':float(jd[condition.argmax()]),
            'failedTets':[],'exactAllControlledTargetFlips':[],'protectedMovedNodes':[],
            'softPenaltyByRole':{role:float(1e5*np.square(X[list(nodes)]-target[list(nodes)]).sum()) for role,nodes in sets.items()}}
    for ti in bad:
        record['failedTets'].append({'tet':int(ti),'nodes':T[ti].tolist(),'restCondition':float(condition[ti]),
            'restVolumeM3':float(vol[ti]),'actualDet':float(jd[ti]),
            'roles':{role:sum(int(n) in nodes for n in T[ti]) for role,nodes in sets.items()}})
    for ti in target_bad:
        nodes=T[ti];gs=[int(i) for i in nodes if int(i) in sets['guide']];ps=[int(i) for i in nodes if int(i) in sets['protected']]
        row={'tet':int(ti),'guideNodes':gs,'protectedNodes':ps,'exactTargetDetRatio':float(requested_ratio[ti]),
             'protectedSemantics':{str(i):semantic(i) for i in ps}}
        interval=interval_determinant(target[nodes],nodes)
        row['targetBoxDeterminantIntervalM3']=[str(v) for v in interval]
        row['negativeEvenWithGuideEachCoordinate2mmAndProtectedEachCoordinate2um']=bool(interval[1]<0)
        if len(gs)==1 and len(ps)==3:
            a,b,c=V[ps];normal=np.cross(b-a,c-a);normal/=np.linalg.norm(normal)
            h=float(normal@(V[gs[0]]-a));normal*=np.sign(h);h=abs(h)
            height=float(normal@(target[gs[0]]-a))
            row.update(restGuidePlaneHeightM=h,targetGuidePlaneHeightM=height,
                       minimumGuideDeviationForDet012WithExactlyFrozenPlaneM=.12*h-height)
        record['exactAllControlledTargetFlips'].append(row)
    movement=np.linalg.norm(X[Pr]-V[Pr],axis=1)
    for i in np.flatnonzero(movement>2e-6):
        node=int(Pr[i]);record['protectedMovedNodes'].append({'node':node,'displacementM':float(movement[i]),'semantics':semantic(node)})
    record['limitations']=['Exact-target and interval witnesses concern this piecewise-linear tetrahedron topology and native vertex guide, not actual 101-section widths.',
        'No intermediate iterations, gradient norm or stationarity certificate are available. Initial/final energy cannot establish convergence or impossibility.']
    result['cases'].append(record)
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
print(json.dumps([{'id':r['id'],'energyReduction':r['totalEnergyReductionFraction'],'badTets':len(r['failedTets']),
    'boxWitnesses':[q['tet'] for q in r['exactAllControlledTargetFlips'] if q['negativeEvenWithGuideEachCoordinate2mmAndProtectedEachCoordinate2um']],
    'penalties':r['softPenaltyByRole']} for r in result['cases']]))
