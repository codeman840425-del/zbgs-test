"""Small identity/difference and full-neck seam checks, no full-source run."""
import json

from common import BASE,ROOT,body,body_values,compose,io,load,neck_decomposition,np,original_function,require

spec,source,records,points,context,masks=load()
out=BASE/spec.get('preparationDirectory','prepared')
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
# The nonlinear stored G has its own independently audited analytic derivative.
# Keep the full secant residual, but do not mistake finite-step truncation for a derivative error.
body_columns=[]
for axis in range(3):
    step=np.eye(3)[axis]*epsilon
    body_columns.append((body.body_displacement(P+step,case['parameters'],context)-
        body.body_displacement(P-step,case['parameters'],context))/(2*epsilon))
body_difference_error=float(abs(np.stack(body_columns,axis=2)-(actual_J-np.eye(3))).max())
require(body_difference_error<=1e-5,'Body derivative two-step regression fails')
affine_G=np.array([[1.2,.1,0.],[0.,.8,0.],[0.,.2,1.]])
affine_B=np.array([[.05,0.,0.],[0.,0.,.02],[0.,0.,-.03]])
test_G=P@affine_G.T;test_B=P@affine_B.T
test_F,test_J=compose(test_G,np.broadcast_to(affine_G,(len(P),3,3)),test_B,
    np.broadcast_to(np.eye(3)+affine_B,(len(P),3,3)))
require(np.allclose(test_F,P@(affine_G+affine_B).T,rtol=0,atol=1e-15) and
    np.allclose(test_J,affine_G+affine_B,rtol=0,atol=1e-15),'Affine same-source composition regression fails')
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
frame=np.asarray(masks['frameSourcePointsM'])
frame_G,_,_=operator(frame,curve)
frame_B=body.body_displacement(frame,case['parameters'],context)
frame_F=frame_G+frame_B
frame_rows={'sourcePointsM':frame,'bodyDisplacementM':frame_B,
    'headOperationDisplacementM':frame_F-(frame+frame_B),'finalDisplacementFromOriginalM':frame_F-frame,
    'maximumBodyDisplacementM':float(np.linalg.norm(frame_B,axis=1).max()),
    'maximumHeadOperationDisplacementM':float(np.linalg.norm(frame_F-(frame+frame_B),axis=1).max()),
    'maximumFinalDisplacementFromOriginalM':float(np.linalg.norm(frame_F-frame,axis=1).max())}
report={'schema':'axial-body-composition-preparation-v1','status':'prepared-pending-root-seam-check',
    'spec':io.ref(BASE/'spec.json'),'sourceEndpointOccurrences':len(points),'records':len(records),
    'bodyIdentityRegressionPassed':True,'bodyReferenceMaximumErrorM':component_error,
    'differenceRegression':{'occurrenceIndices':sample_ids,'independentEpsilonM':epsilon,'bodyJacobianEpsilonM':1e-5,
        'wholeFNonlinearSecantResidualDiagnostic':difference_error,'bodyMaximumEntryError':body_difference_error,
        'bodyDifferenceTolerance':1e-5,'affineCompositionPassed':True,
        'JGSource':'Existing independent stored-coefficient and full-source analytic G audit; no secant substitution'},
    'neckOriginalBodyHeadDecomposition':neck_rows,'frameOriginalBodyHeadDecomposition':frame_rows,
    'neckProtectionContract':spec['neckProtectionContract'],
    'frameProtectionContract':spec['frameProtectionContract'],
    'fullSourceCompositionEvaluated':False,'oldHeadOnlyResultsRelabeled':False,'characterExported':False}
io.save(out/'report.json',report)
print(json.dumps({'status':report['status'],'differenceError':difference_error,
    'neckMaximumBodyM':max(r['maximumBodyDisplacementM'] for r in neck_rows),
    'neckMaximumHeadM':max(r['maximumHeadOperationDisplacementM'] for r in neck_rows),
    'neckMaximumFinalM':max(r['maximumFinalDisplacementFromOriginalM'] for r in neck_rows)}))
