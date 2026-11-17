"""Small identity/difference and full-neck seam checks, no full-source run."""
import json

from common import BASE,ROOT,body,body_values,compose,io,load,neck_decomposition,np,original_function,require

spec,source,records,points,context,masks=load()
out=BASE/'prepared'
require(not out.exists(),'Preserve first composition preparation')
out.mkdir()
sample_ids=spec['regressionOccurrenceIndices']
P=points[sample_ids]
identity=spec['cases'][0]
D,JB=body_values(P,identity['parameters'],context)
require(np.array_equal(D,np.zeros_like(P)) and np.array_equal(JB,np.broadcast_to(np.eye(3),JB.shape)),'Body identity regression fails')
reference=body.reference_body()
case=spec['cases'][1]
actual_D,actual_J=body_values(P,case['parameters'],context)
component_error=float(abs(P+actual_D-reference(P,case['parameters'],context)).max())
require(component_error==0,'Extracted body component differs')
curve=json.loads((ROOT/case['coefficients']['path']).read_bytes())
operator=original_function('operator')
QG,JG,_=operator(P,curve)
F,JF=compose(QG,JG,actual_D,actual_J)
epsilon=1e-6
columns=[]
for axis in range(3):
    step=np.eye(3)[axis]*epsilon
    plus=operator(P+step,curve)[0]+body.body_displacement(P+step,case['parameters'],context)
    minus=operator(P-step,curve)[0]+body.body_displacement(P-step,case['parameters'],context)
    columns.append((plus-minus)/(2*epsilon))
difference_error=float(abs(np.stack(columns,axis=2)-JF).max())
require(difference_error<=1e-5,'Composite actual difference regression fails')
neck_rows=[]
with np.load(ROOT/case['headRaw']['path'],allow_pickle=False) as raw:
    for mask in masks['neck']:
        r=next(r for r in records if r['positionAccessor']==mask['positionAccessor'] and r['endpoint']==mask['endpoint'])
        ids=np.asarray(mask['sourceIndices'],int);take=r['offset']+ids
        B=body.body_displacement(points[take],case['parameters'],context)
        G=raw['mappedEndpointsM'][take];F=G+B;original=points[take]
        neck_rows.append({'sourceIndices':ids,'positionAccessor':r['positionAccessor'],'sourcePointsM':original,
            'bodyDisplacementM':B,'headOperationDisplacementM':F-(original+B),'finalDisplacementFromOriginalM':F-original,
            'maximumBodyDisplacementM':float(np.linalg.norm(B,axis=1).max()),
            'maximumHeadOperationDisplacementM':float(np.linalg.norm(F-(original+B),axis=1).max()),
            'maximumFinalDisplacementFromOriginalM':float(np.linalg.norm(F-original,axis=1).max())})
report={'schema':'axial-body-composition-preparation-v1','status':'prepared-pending-root-seam-check',
    'spec':io.ref(BASE/'spec.json'),'sourceEndpointOccurrences':len(points),'records':len(records),
    'bodyIdentityRegressionPassed':True,'bodyReferenceMaximumErrorM':component_error,
    'differenceRegression':{'occurrenceIndices':sample_ids,'independentEpsilonM':epsilon,'bodyJacobianEpsilonM':1e-5,
        'maximumEntryError':difference_error,'tolerance':1e-5},'neckOriginalBodyHeadDecomposition':neck_rows,
    'fullSourceCompositionEvaluated':False,'originalFixedGateChanged':False,'characterExported':False}
io.save(out/'report.json',report)
print(json.dumps({'status':report['status'],'differenceError':difference_error,
    'neckMaximumBodyM':max(r['maximumBodyDisplacementM'] for r in neck_rows),
    'neckMaximumHeadM':max(r['maximumHeadOperationDisplacementM'] for r in neck_rows),
    'neckMaximumFinalM':max(r['maximumFinalDisplacementFromOriginalM'] for r in neck_rows)}))
