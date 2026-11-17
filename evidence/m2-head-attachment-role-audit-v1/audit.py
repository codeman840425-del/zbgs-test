"""Independent source-role/native-control audit; no Delaunay or SLIM."""
import sys
sys.dont_write_bytecode=True
import hashlib
import importlib.util
import json
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/m2-head-attachment-slim-v1'
OUT=Path(__file__).with_name('result.json')
if OUT.exists(): raise SystemExit('Refusing to overwrite evidence')
spec=json.loads((BASE/'spec.json').read_bytes())
report=json.loads((BASE/'preflight/report.json').read_bytes())
classification=json.loads((BASE/'preflight/classification.json').read_bytes())
C=np.load(BASE/'preflight/classification-nodes.npz',allow_pickle=False)
D=np.load(ROOT/spec['unchangedDomain'],allow_pickle=False)
V,T=D['nodesM'],D['tetrahedra']
old_records=json.loads((ROOT/'assets-source/m2-head-volume-domain-v1/generated/endpoint-records.json').read_bytes())
native=json.loads((ROOT/spec['nativeTarget']).read_bytes())
guide=next(r for r in native['sexes'] if r['sex']=='male')
loader=importlib.util.spec_from_file_location('role_source',ROOT/'scripts/m2-representative-batch-v1/deform.py')
legacy=importlib.util.module_from_spec(loader);loader.loader.exec_module(legacy)
source=legacy.GLB((ROOT/spec['source']['path']).read_bytes())
fixed_names={'M00_000_00_EyeIris_00_EYE','M00_000_00_EyeHighlight_00_EYE','M00_000_00_EyeWhite_00_EYE'}
adaptive_names={'M00_000_00_FaceEyeline_00_FACE','M00_000_00_FaceEyelash_00_FACE','M00_000_00_EyeExtra_01_EYE','M00_000_HairBack_00_HAIR'}
lookup={tuple(p):i for i,p in enumerate(V)}
fixed,adaptive=set(),set()
checks=[]
def check(name,condition,detail=None):checks.append({'name':name,'passed':bool(condition),'detail':detail})
check('source-pin',hashlib.sha256((ROOT/spec['source']['path']).read_bytes()).hexdigest()==spec['source']['sha256'])
check('exact-native-domain-node-coordinates-unique',len(lookup)==len(V))
by_material={}
for mesh in source.doc['meshes']:
    for primitive in mesh['primitives']:
        name=source.doc['materials'][primitive['material']]['name']
        if name not in fixed_names|adaptive_names:continue
        ids=np.unique(source.accessor(primitive['indices']))
        P=np.asarray(source.accessor(primitive['attributes']['POSITION']),float)
        ends=[P]+[P+np.asarray(source.accessor(t['POSITION']),float) for t in primitive.get('targets',[])]
        nodes=set()
        for E in ends:
            nodes.update(lookup[tuple(p)] for p in E[ids])
        by_material[name]={'sourceEndpointCount':len(ends),'uniqueNodes':len(nodes),'nodes':nodes}
        (fixed if name in fixed_names else adaptive).update(nodes)
neck=set()
for old in old_records:
    if old['role']!='neck-preservation':continue
    primitive=source.doc['meshes'][old['mesh']]['primitives'][old['primitive']]
    P=np.asarray(source.accessor(old['positionAccessor']),float)
    if old['endpoint']>=0:P+=np.asarray(source.accessor(primitive['targets'][old['endpoint']]['POSITION']),float)
    neck.update(lookup[tuple(p)] for p in P[old['sourceIndices']])
fixed|=neck
check('fixed-exact-source-iris-highlight-white-and-neck',fixed==set(C['newProtectedNodes']),{'count':len(fixed),'neck':len(neck)})
check('adaptive-exact-source-four-requested-materials',adaptive==set(C['adaptiveNodes']),len(adaptive))
check('old-protected-partition-complete',fixed|adaptive==set(D['protectedNodes']))
check('released-exact-no-coincident-protection-lost',set(classification['releasedOldProtectedNodes'])==set(D['protectedNodes'])-fixed==adaptive-fixed)
check('shared-coordinate-protection-wins',set(C['sharedRetainedProtectedNodes'])==fixed&adaptive,len(fixed&adaptive))
check('old-domain-protected-list-unmodified',np.array_equal(C['oldProtectedNodes'],D['protectedNodes']))
check('all-endpoint-records-preserved',len(classification['endpointRecords'])==len(old_records))
for i,(old,new) in enumerate(zip(old_records,classification['endpointRecords'])):
    if any(old[k]!=new[k] for k in ['mesh','primitive','material','endpoint','sourceIndices','count']):
        raise AssertionError('Changed source record '+str(i))
    role='fixed-neck' if old['role']=='neck-preservation' else 'fixed-eye' if old['material'] in fixed_names else 'adaptive-attachment' if old['material'] in adaptive_names else spec['materialRoles'][old['material']]
    if new['newRole']!=role:raise AssertionError('Unexpected role '+str(i))
check('all-record-source-identity-and-new-role-exact',True,len(old_records))
for row in classification['table']:
    if row['material'] in by_material:
        expected=by_material[row['material']]
        check('all-base-and-morph-nodes:'+row['material'],row['endpointRecords']==expected['sourceEndpointCount'] and set(row['actualNodes'])==expected['nodes'])
old_conflicts={'male-long-lean-v2':[3465,3467,4111,6274],'male-round-stocky-v2':[4112,5339,5376,6281,8505]}
cases=[]
for row in report['cases']:
    request=next(r for r in guide['cases'] if r['id']==row['id'])
    check('native-guide-request-identical:'+row['id'],row['nativeRequestUnchanged']==request)
    saved=np.load(BASE/'preflight'/(row['id']+'-controlled-targets.npz'),allow_pickle=False)
    b=np.r_[D['guideNodes'],sorted(fixed),D['frameNodes']]
    bc=np.vstack([request['requestedVertexPointsM'],V[sorted(fixed)],V[D['frameNodes']]])
    check('b-bc-exact:'+row['id'],np.array_equal(saved['constraintIndices'],b) and np.array_equal(saved['constraintTargetsM'],bc))
    controlled=np.flatnonzero(np.all(np.isin(T,b),axis=1))
    Q=V.copy();Q[b]=bc
    oldedge=np.swapaxes(V[T[controlled,1:]]-V[T[controlled,:1]],1,2)
    newedge=np.swapaxes(Q[T[controlled,1:]]-Q[T[controlled,:1]],1,2)
    ratios=np.linalg.det(newedge)/np.linalg.det(oldedge)
    check('fully-controlled-sets-and-direct-volume-readback:'+row['id'],np.array_equal(controlled,saved['controlledTetIndices']) and np.max(abs(ratios-saved['targetDeterminants']))<1e-7)
    check('fully-controlled-actual-targets-pass-012:'+row['id'],bool((ratios>.12).all()))
    removed=[i for i in old_conflicts[row['id']] if i not in set(controlled)]
    check('all-old-fixed-tet-conflicts-now-have-adaptive-nodes:'+row['id'],removed==old_conflicts[row['id']])
    cases.append({'id':row['id'],'bCount':len(b),'freeNodes':len(V)-len(b),'fullyControlledTets':len(controlled),
        'minimumTargetVolumeRatio':float(ratios.min()),'oldConflictsNoLongerFullyControlled':removed,
        'meaning':'Former exact-fixed contradiction removed; no certificate for free tets or actual solve.'})
check('original-gates-and-budget-not-relaxed',spec['toleranceM']==2e-6 and spec['minimumDeterminant']==.12 and spec['horizontalHalfwidthToleranceM']==.002 and spec['softP']==1e5 and spec['requestIterations']==20 and spec['identityIterations']==1)
check('pending-contract-preserved',report['pending']==spec['pending'] and any('hair-root' in s for s in spec['pending']) and any('eyewhite' in s and 'closed-eye' in s for s in spec['pending']) and any('strict contacts' in s for s in spec['pending']) and any('G(P+D)' in s for s in spec['pending']))
check('preflight-does-not-claim-shape-or-production',report['solverCalled'] is False and report['characterExported'] is False and report['runtimeAccepted'] is False)
pins={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in [BASE/'spec.json',BASE/'preflight/report.json',BASE/'preflight/classification.json',BASE/'preflight/classification-nodes.npz',ROOT/spec['unchangedDomain'],ROOT/spec['unchangedEmbedding'],ROOT/spec['nativeTarget']]}
result={'schema':'head-attachment-role-independent-audit-v1','status':'role-contract-passed-not-shape-admission' if all(c['passed'] for c in checks) else 'blocked',
    'checks':checks,'cases':cases,'pins':pins,'solverCalled':False,'delaunayCalled':False,
    'newRoleCounts':{'fixedEyeAndNeck':len(fixed),'adaptive':len(adaptive),'shared':len(fixed&adaptive)},
    'pending':spec['pending']}
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
print(json.dumps({'status':result['status'],'checks':len(checks),'failed':[r['name'] for r in checks if not r['passed']],'cases':cases}))
