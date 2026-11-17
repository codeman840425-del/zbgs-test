"""Freeze one evaluation; no G is called by preparation."""
from common import *
if BASE.exists():raise ValueError('Refuse overwrite')
BASE.mkdir();out=BASE/'prepared';out.mkdir()
old=read('assets-source/m2-axial-head-evaluation-v1/spec.json');check(old['inputs'])
entry=read('assets-source/m2-boundary-refinement-api-recovery-v1/pre-G-source-inputs.json')
audit=ref(ROOT/'evidence/m2-boundary-refinement-api-recovery-audit-v1/result.json')
assert audit['sha256']=='6d471ca9ffa08f3a776d871ab006d61087539ec961a29ab74845ee04dcd928d4'
assert read(audit['path'])['status']=='no-new-topology-preflight-blocker'
inputs=old['inputs']+[audit,ref(ROOT/'assets-source/m2-boundary-refinement-api-recovery-v1/pre-G-source-inputs.json')]
for g in entry['groups']:inputs.extend(g[k] for k in ['arrays','provenance','sparseMapping'])
inputs += [ref(ROOT/p) for p in ['scripts/m2-axial-head-evaluation-v1/evaluate.py','scripts/m2-axial-head-evaluation-v1/source.py','scripts/m2-representative-batch-v1/deform.py','evidence/m2-axial-head-export-audit-v1/check_combinations.py','prototype/src/eye-blink-compatibility.js','prototype/src/live-presentation.js']]
check(inputs);gs=groups();g,_=io.load(old);masks=io.fixed_masks(g,old)
records=[];points=[];offset=0
for group in gs:
    acc=group['accessor'];P,D,N=group['P'],group['D'],group['N']
    np.savez_compressed(out/f'source-group-{acc}.npz',basePositionM=P,positionDeltasM=D,baseNormal=N,basePositionFloat32=P.astype(np.float32),positionDeltasFloat32=D.astype(np.float32))
    np.savez_compressed(out/f'topology-{acc}.npz',triangles=group['T'],parentTriangle=group['parent'],parentBary=group['bary'])
    for endpoint in range(-1,len(D)):
        Q=P if endpoint==-1 else P+D[endpoint]
        records.append(dict(positionAccessor=acc,endpoint=endpoint,offset=offset,count=len(P)))
        points.append(Q);offset+=len(P)
    for mask in masks['fixedEye']:
        if mask['positionAccessor']==acc:
            c=next(c for c in group['consumers'] if c['mesh']==mask['mesh'] and c['primitive']==mask['primitive'])
            mask['sourceIndices']=c['vertexIndices']
assert offset==406701 and len(records)==56
save(out/'endpoint-records.json',dict(schema='refined-axial-endpoint-records-v1',records=records,totalEndpointOccurrences=offset))
save(out/'consumer-records.json',dict(schema='refined-axial-consumer-records-v1',groups=[dict(positionAccessor=x['accessor'],consumers=x['consumers'],parentMetadata=x['parentMetadata'],originalProvenance=x['provenance']) for x in gs]))
save(out/'fixed-source-masks.json',masks)
np.savez_compressed(out/'source-endpoints.npz',sourceEndpointsM=np.concatenate(points))
names=g.doc['meshes'][1]['extras']['targetNames'];mapping={}
for preset,name,suffix in [('joy','happy','ALL_Joy'),('blink','blink','EYE_Close'),('o','oh','MTH_O')]:
    b=next(x for x in g.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups'] if x['presetName']==preset)
    assert not b['isBinary'] and len(b['binds'])==1
    bind=b['binds'][0];assert bind['mesh']==1 and bind['weight']==100 and names[bind['index']].endswith('_Fcl_'+suffix)
    mapping[name]=bind['index']
mapping['eyeJoy']=next(i for i,n in enumerate(names) if n.endswith('_Fcl_EYE_Joy'))
corrected={'Face_00_SKIN','EyeWhite_00_EYE','FaceEyeline_00_FACE','FaceEyelash_00_FACE'}
face=gs[1];ids=np.unique(np.concatenate([c['vertexIndices'] for c in face['consumers'] if c['material'].removeprefix('M00_000_00_') in corrected]))
other=np.unique(np.concatenate([c['vertexIndices'] for c in face['consumers'] if c['material'].removeprefix('M00_000_00_') not in corrected]))
assert not np.intersect1d(ids,other).size and len(np.union1d(ids,other))==7251
save(out/'known-oh.json',dict(schema='refined-known-oh-lanes-v1',mapping=mapping,weights={'happy':.65,'blink':1.,'oh':.66,'eyeJoyCorrectedOnly':-.65},correctedVertexIndices=ids,correctedMaterials=sorted(corrected),supplementaryBInputPoints=7251,realManagerExecuted=False,precision='Ordered Float64 sums; baked variant reads Float32 base/deltas into Float64, not GPU arithmetic'))
spec={**{k:old[k] for k in ['source','cases','versions','minimumJacobian','maximumFixedErrorM','maximumFloat32ReadbackErrorM','maximum101ErrorM','response','coefficientAudit']},'schema':'refined-axial-evaluation-spec-v1','id':'m2-refined-axial-evaluation-v1','topologyAudit':audit,'inputs':list({r['path']:r for r in inputs}.values()),'baseVertices':15147,'endpointOccurrences':406701,'maxSeconds':600,'maxRssBytes':3*1024**3,'threads':2,'extraGEvaluationsPerCase':{'frame':8,'knownOhSourceMix':7251},'noContactsOrExport':True,'headOnly':True}
save(BASE/'spec.json',spec)
print('Prepared406701 source endpoints; no G executed')
