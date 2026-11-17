"""Independent saved-domain audit. No Delaunay, SLIM, or asset generation."""
import sys
sys.dont_write_bytecode = True
import hashlib
import importlib.util
import itertools
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-head-volume-domain-v1'
OUT = Path(__file__).with_name('result.json')
if OUT.exists():
    raise SystemExit('Refusing to overwrite evidence')
checks = []
def check(name, condition, detail=None):
    checks.append({'name': name, 'passed': bool(condition), 'detail': detail})
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
spec = json.loads((BASE/'spec.json').read_bytes())
report = json.loads((BASE/'generated/report.json').read_bytes())
records = json.loads((BASE/'generated/endpoint-records.json').read_bytes())
native = json.loads((ROOT/spec['nativeGuide']).read_bytes())
native = next(row for row in native['sexes'] if row['sex']=='male')
domain = np.load(BASE/'generated/domain.npz', allow_pickle=False)
embedding = np.load(BASE/'generated/embedding.npz', allow_pickle=False)
V, T, P = domain['nodesM'], domain['tetrahedra'], domain['sourceEndpointsM']
B, I = embedding['barycentric'], embedding['simplexVertexIndices']
for row in spec['inputs']:
    check('input-pin:'+row['path'], sha(ROOT/row['path'])==row['sha256'])
loader = importlib.util.spec_from_file_location('independent_source_reader', ROOT/spec['sourceReader'])
legacy = importlib.util.module_from_spec(loader)
loader.loader.exec_module(legacy)
g = legacy.GLB((ROOT/spec['source']['path']).read_bytes())
context = legacy.source_context(g)
neck_y = float(context['joints']['neck'][1]-.005)
primary, base, frozen, body = [], [], [], []
expected_occurrences = set()
source_blocks = {}
for mi, mesh in enumerate(g.doc['meshes']):
    for pi, primitive in enumerate(mesh['primitives']):
        name = g.doc['materials'][primitive['material']]['name']
        isface = any(s in name for s in ('Face_00_SKIN','FaceMouth','FaceBrow'))
        isbody = 'Body_00_SKIN' in name
        isfixed = any(s in name for s in ('_EYE','Eyeline','Eyelash','HAIR'))
        if not (isface or isbody or isfixed):
            continue
        ids = np.unique(g.accessor(primitive['indices']))
        points = np.asarray(g.accessor(primitive['attributes']['POSITION']), dtype=np.float64)
        ends = [points]+[points+np.asarray(g.accessor(t['POSITION']), dtype=np.float64) for t in primitive.get('targets', [])]
        for ei, endpoint in enumerate(ends):
            source_blocks[(mi,pi,ei-1)] = endpoint
            selected = ids[endpoint[ids,1]>=neck_y] if isbody else ids
            Q = endpoint[selected]
            if isbody:
                body.append((mi,pi,ei-1,ids,endpoint[ids]))
            if isface or isbody:
                primary.append(Q)
                if ei==0:
                    base.append(Q)
            if isfixed:
                frozen.append(Q)
            role = 'feature-preservation' if isfixed else 'required-head-endpoint'
            expected_occurrences.update((mi,pi,ei-1,role,int(i)) for i in selected)
needed = np.concatenate(primary)
low, high = needed.min(0)-.02, needed.max(0)+.02
neck = []
for mi,pi,ei,ids,Q in body:
    selected = (Q[:,1]<=neck_y)&np.all((Q>=low)&(Q<=high),axis=1)
    neck.append(Q[selected])
    expected_occurrences.update((mi,pi,ei,'neck-preservation',int(i)) for i in ids[selected])
fixed = np.unique(np.concatenate([*frozen,*neck]),axis=0)
corners = np.asarray(list(itertools.product(*zip(low, high))))
guides = np.asarray(native['sourcePointsM'])
reconstructed_nodes = np.unique(np.concatenate([*base,fixed,corners,guides]),axis=0)
check('node-coordinates-exact-from-independent-selection', np.array_equal(V,reconstructed_nodes),len(V))
check('bounds-exact',np.array_equal(report['boundsM'],[low,high]))
check('guide-source-ids-exact',np.array_equal(domain['guideSourceIndices'],native['guideVertexIndices']))
check('guide-native-node-positions-exact',np.array_equal(V[domain['guideNodes']],guides))
check('protected-node-positions-exact',np.array_equal(V[domain['protectedNodes']],fixed))
check('frame-node-positions-exact',np.array_equal(V[domain['frameNodes']],corners))
control = np.concatenate([domain['guideNodes'],domain['protectedNodes'],domain['frameNodes']])
check('native-b-no-duplicate-or-conflicting-node',len(control)==len(np.unique(control)))
check('all-controls-referenced-by-tet',not len(np.setdiff1d(control,np.unique(T))))
seen = set()
offset=0
for row in records:
    ids = np.asarray(row['sourceIndices'])
    key = (row['mesh'],row['primitive'],row['endpoint'])
    exact = source_blocks[key][ids]
    valid = row['offset']==offset and row['count']==len(ids) and np.array_equal(P[offset:offset+len(ids)],exact)
    if not valid:
        raise AssertionError('Source endpoint record mismatch '+str(key))
    seen.update((*key,row['role'],int(i)) for i in ids)
    offset += len(ids)
check('all-saved-endpoint-occurrences-exact',offset==len(P),len(P))
check('selected-semantic-endpoint-coverage-complete',seen==expected_occurrences,{'missing':len(expected_occurrences-seen),'extra':len(seen-expected_occurrences)})
E = np.swapaxes(V[T[:,1:]]-V[T[:,:1]],1,2)
det = np.linalg.det(E)
sv = np.linalg.svd(E,compute_uv=False)
rankbad = sv[:,-1]<=sv[:,0]*3*np.finfo(float).eps
check('positive-finite-tets',np.isfinite(det).all() and (det>0).all(),{'minimumVolumeM3':float(det.min()/6)})
check('local-numerical-rank-three',not rankbad.any(),{'rankRule':'smin > 3*float64eps*smax','maxCondition2':float((sv[:,0]/sv[:,-1]).max())})
faces = np.sort(np.concatenate([T[:,[0,1,2]],T[:,[0,1,3]],T[:,[0,2,3]],T[:,[1,2,3]]]),axis=1)
faces, counts = np.unique(faces,axis=0,return_counts=True)
boundary = faces[counts==1]
boundary_on_box = np.any(np.all(V[boundary]==low,axis=1)|np.all(V[boundary]==high,axis=1),axis=1)
check('tet-incidence-and-box-boundary',np.all((counts==1)|(counts==2)) and boundary_on_box.all(),{'boundaryFaces':len(boundary),'maxIncidence':int(counts.max())})
box_volume=float(np.prod(high-low))
check('positive-tet-volume-matches-box',abs(det.sum()/6-box_volume)<1e-12,{'boxVolumeM3':box_volume,'tetVolumeSumM3':float(det.sum()/6)})
lookup={tuple(np.sort(t)):i for i,t in enumerate(T)}
check('tet-sets-unique',len(lookup)==len(T))
rows=np.asarray([lookup[tuple(np.sort(i))] for i in I])
check('embedding-original-order-is-existing-tet',np.array_equal(np.sort(I,axis=1),np.sort(T[rows],axis=1)))
check('embedding-barycentric-finite-partition',np.isfinite(B).all() and abs(B.sum(1)-1).max()<1e-12 and B.min()>-1e-12,{'min':float(B.min()),'sumError':float(abs(B.sum(1)-1).max())})
Q=np.sum(B[:,:,None]*V[I],axis=1)
A=np.asarray(spec['affineMatrix']); b=np.asarray(spec['affineTranslationM'])
aff=np.sum(B[:,:,None]*(V@A.T+b)[I],axis=1)
id_error=float(np.linalg.norm(Q-P,axis=1).max())
aff_error=float(np.linalg.norm(aff-(P@A.T+b),axis=1).max())
check('independent-identity-readback',id_error<=2e-6,id_error)
check('independent-affine-readback',aff_error<=2e-6,aff_error)
wrong=np.sum(B[:,:,None]*V[T[rows]],axis=1)
order_error=float(np.linalg.norm(wrong-P,axis=1).max())
controls_raw=np.concatenate([guides,fixed,corners,*base])
check('raw-concatenation-inverse-is-not-endpoint-map',np.array_equal(V[domain['sourceOccurrenceToNode']],controls_raw),{'inverseLength':len(domain['sourceOccurrenceToNode']),'endpointOccurrences':len(P)})
result={'schema':'head-volume-domain-independent-audit-v1','status':'passed-for-one-same-domain-slim-identity-only' if all(c['passed'] for c in checks) else 'blocked',
        'checks':checks,'delaunayCalled':False,'shapeSolved':False,'runtimeAccepted':False,
        'orderingTrapMaximumErrorM':order_error,
        'facts':{'nodes':len(V),'tetrahedra':len(T),'nativeBCount':len(control),'freeNodes':len(V)-len(control),'endpoints':len(P),
                 'maximumCondition2':float((sv[:,0]/sv[:,-1]).max()),'worstConditionTet':int((sv[:,0]/sv[:,-1]).argmax())},
        'inputHashes':{p.relative_to(ROOT).as_posix():sha(p) for p in [BASE/'spec.json',BASE/'generated/report.json',BASE/'generated/domain.npz',BASE/'generated/embedding.npz',BASE/'generated/endpoint-records.json']}}
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
print(json.dumps({k:result[k] for k in ('status','facts','orderingTrapMaximumErrorM')}))
print(json.dumps({'checks':len(checks),'failed':[c['name'] for c in checks if not c['passed']]}))
