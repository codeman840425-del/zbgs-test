"""One source-proportioned experimental preview; no prior strict admission claimed."""
import sys
sys.dont_write_bytecode=True
import ast,copy,importlib.util,json,time,traceback
from pathlib import Path
import numpy as np
from scipy.interpolate import PchipInterpolator,PPoly
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-source-proportioned-face-v1'
def module(path,name):
    s=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
io=module('scripts/m2-axial-head-evaluation-v1/source.py','proportioned_io')
adapter=module('scripts/m2-axial-head-export-v1/adapter.py','proportioned_export')
proof=module('scripts/m2-axial-shape-function-v1/proof.py','proportioned_proof')
save,ref,sha=io.save,io.ref,io.sha
def function(path,name):
    node=next(n for n in ast.parse((ROOT/path).read_bytes()).body if isinstance(n,ast.FunctionDef) and n.name==name)
    env={'np':np,'PPoly':PPoly};exec(compile(ast.Module([node],[]),path+':unchanged-AST','exec'),env);return env[name]
operator=function('scripts/m2-axial-head-evaluation-v1/evaluate.py','operator')
triangle_readback=function('scripts/m2-axial-head-evaluation-v1/evaluate.py','triangle_readback')
def read(p):return json.loads((ROOT/p).read_bytes())
def prepare():
    if BASE.exists():raise ValueError('Preserve first source-proportioned package')
    BASE.mkdir();out=BASE/'prepared';out.mkdir()
    old=read('assets-source/m2-axial-head-evaluation-v1/spec.json');g,inventory=io.load(old)
    records,P,groups,_=io.source_records(g,inventory);masks=io.fixed_masks(g,old)
    origin=read('assets-source/m2-axial-shape-function-v1/generated/identity/curves.json');H=np.asarray(origin['headOriginM'])
    skin=g.primitives()['M00_000_00_Face_00_SKIN'];ids=np.unique(g.acc(skin['indices'])).astype(int)
    chin=float(g.acc(skin['attributes']['POSITION'])[ids,1].astype(float).min()-H[1])
    layers=[('frame-low',origin['knotsLocalY_M'][0],1.),('fixed-neck-max',origin['supportL'],1.),('source-skin-chin-min',chin,.96),('source-head-cage-lower-jaw-ring',-.025,.92),('source-cheek-function-centre',.005,.92),('fixed-eye-min',origin['supportU'],1.),('frame-high',origin['knotsLocalY_M'][-1],1.)]
    assert all(layers[i][1]<layers[i+1][1] for i in range(len(layers)-1))
    save(out/'endpoint-records.json',dict(records=records,sourceEndpointOccurrences=len(P)))
    save(out/'fixed-masks.json',masks);np.savez_compressed(out/'source-endpoints.npz',sourceEndpointsM=P)
    paths=['scripts/m2-axial-head-evaluation-v1/source.py','scripts/m2-axial-head-evaluation-v1/evaluate.py','scripts/m2-axial-head-export-v1/adapter.py','scripts/m2-representative-head-cage-v1/export.py','scripts/m2-representative-batch-v1/deform.py','scripts/m2-axial-shape-function-v1/proof.py','assets-source/m2-axial-shape-function-v1/generated/identity/curves.json','scripts/m2-representative-batch-v1/preview.py']
    inputs=list({r['path']:r for r in old['inputs']+[ref(ROOT/p) for p in paths]}.values())
    spec=dict(schema='source-proportioned-face-preview-spec-v1',methodId='m2-source-proportioned-face-v1',candidateId='male-source-proportioned-narrow-preview-v1',label='来源比例·收窄脸型试样',source=old['source'],sourceInventory=old['sourceInventory'],sourceSpec=ref(ROOT/'assets-source/m2-axial-head-evaluation-v1/spec.json'),inputs=inputs,headOriginM=H,layers=[dict(semantic=a,sourceLocalYM=b,scale=c) for a,b,c in layers],dY=0,h=0,supportL=origin['supportL'],supportU=origin['supportU'],designAuthority='root-selected bounded preview values; not user-specified and not permanent style standard',originalJawCheekAdditiveFormulaUsed=False,originalCoarseTopology=True,bodyParametersApplied=False,oldLeanTargetClaimed=False,status='experimental-preview-only',minimumActualJ=.12,maximumProtectedErrorM=2e-6,maximumFloat32ErrorM=2e-6,sourceEndpointOccurrences=len(P),proofMaximumIntervals=4096,proofMaximumDepth=12,maxSeconds=600,maxRssBytes=3*1024**3,threads=2,strictContactsRequiredForThisPreview=False,productionAdmission=False)
    save(BASE/'spec.json',spec);print('Prepared once; no new curves/G/export executed')
def execute():
    spec=read('assets-source/m2-source-proportioned-face-v1/spec.json')
    for pin in spec['inputs']+read('assets-source/m2-source-proportioned-face-v1/execution-spec.json')['inputs']:
        if sha(ROOT/pin['path'])!=pin['sha256']:raise ValueError('Input changed: '+pin['path'])
    out=BASE/'generated'
    if out.exists():raise ValueError('Preserve unique execution')
    out.mkdir();started=time.monotonic();run=dict(schema='source-proportioned-face-preview-run-v1',status='running',cases=[],strict55Executed=False,productionAdmission=False)
    save(out/'report.json',run)
    try:
        old=read(spec['sourceSpec']['path']);g,inventory=io.load(old);records,P,groups,_=io.source_records(g,inventory);masks=io.fixed_masks(g,old)
        assert len(P)==120935 and len(records)==56
        H=np.asarray(spec['headOriginM']);knots=np.asarray([x['sourceLocalYM'] for x in spec['layers']]);scale=np.asarray([x['scale'] for x in spec['layers']])
        source_face=P[7855:9911];source_mouth=g.primitives()['M00_000_00_FaceMouth_00_FACE'];mouthids=np.unique(g.acc(source_mouth['indices'])).astype(int)
        source_skin=g.primitives()['M00_000_00_Face_00_SKIN'];T=g.acc(source_skin['indices']).astype(int).reshape(-1,3);skinids=np.unique(T)
        gap0=float(source_face[mouthids,1].min()-source_face[skinids,1].min())
        for name in ['identity',spec['candidateId']]:
            folder=out/name;folder.mkdir();values=np.column_stack([np.ones(len(knots)) if name=='identity' else scale,np.zeros((len(knots),2))])
            curve=PchipInterpolator(knots,values,axis=0,extrapolate=False)
            data=dict(schema='source-proportioned-pchip-preview-function-v1',id=name,headOriginM=H,components=['s','dY','h'],knotsLocalY_M=knots,knotValues=values,coefficients=curve.c,supportL=spec['supportL'],supportU=spec['supportU'],pchipConstructions=1)
            save(folder/'curves.json',data);stored=json.loads((folder/'curves.json').read_bytes())
            cert=proof.certify(stored['knotsLocalY_M'],stored['coefficients'],spec['proofMaximumIntervals'],spec['proofMaximumDepth']);save(folder/'coefficient-proof.json',cert)
            assert cert['allCertified'] and np.count_nonzero(curve.c[:,:,1:])==0
            platforms=(knots[1:]<=spec['supportL'])|(knots[:-1]>=spec['supportU']);want=np.zeros_like(curve.c[:,platforms]);want[3,:,0]=1
            assert np.array_equal(curve.c[:,platforms],want)
            Q,J,_=operator(P,stored);assert np.isfinite(Q).all() and np.isfinite(J).all() and np.linalg.det(J).min()>.12
            assert np.array_equal(Q[:,1:],P[:,1:])
            decoded=np.empty_like(Q);bases={};directions=[];fixed=[]
            for record in records:
                a,n,acc,e=record['offset'],record['count'],record['positionAccessor'],record['endpoint'];q=Q[a:a+n]
                if e==-1:bases[acc]=q;v=q.astype(np.float32)
                else:v=bases[acc].astype(np.float32)+(q-bases[acc]).astype(np.float32)
                decoded[a:a+n]=v;directions+=triangle_readback(g,record,P[a:a+n],q,v.astype(float))
                for role,rows in [('eye',masks['fixedEye']),('neck',masks['neck'])]:
                    for mask in rows:
                        if mask['positionAccessor']==acc and (role=='eye' or mask['endpoint']==e):
                            ids=mask['sourceIndices'];fixed.append(dict(role=role,endpoint=e,maximumExactErrorM=float(np.linalg.norm(q[ids]-P[a:a+n][ids],axis=1).max()),maximumBakedErrorM=float(np.linalg.norm(decoded[a:a+n][ids]-P[a:a+n][ids],axis=1).max())))
            frame=np.asarray(masks['frameSourcePointsM']);F,FJ,_=operator(frame,stored);frameError=float(np.linalg.norm(F-frame,axis=1).max())
            newzero=sum(len(x['newFloat32ExactDegenerateTriangleIndices']) for x in directions);flips=sum(len(x['nonpositiveReferenceNormalDotTriangleIndices']) for x in directions)
            fixedmax=max([frameError]+[x['maximumExactErrorM'] for x in fixed]+[x['maximumBakedErrorM'] for x in fixed]);bake=float(np.linalg.norm(Q-decoded,axis=1).max())
            assert newzero==0 and flips==0 and fixedmax<=2e-6 and bake<=2e-6
            gap1=float(Q[7855:9911][mouthids,1].min()-Q[7855:9911][skinids,1].min());assert gap1==gap0
            raw=dict(sourceEndpointsM=P,mappedEndpointsM=Q,float32BakeRoundTripM=decoded,sourceJacobians=J);np.savez_compressed(folder/'mapped-endpoints.npz',**raw)
            results=adapter.assemble(g,records,raw)
            generator='m2-source-proportioned-face-v1 experimental-preview-only; no strict/mixed/fit/runtime approval; spec='+sha(BASE/'spec.json')+'; case='+name
            encoded=adapter.bake_bytes(g,results,generator);path=folder/(name+'.vrm');path.write_bytes(encoded)
            actual=type(g)(path);checked=adapter.readback(g,actual,results,identity=name=='identity')
            assert actual.doc['asset']['generator']==generator
            response=read(old['response']);levels=np.asarray(response['sourceLandmarksM'])[::2,1]-H[1]
            originalWidth=io.section_function()(source_face-H,T,levels);newWidth=io.section_function()(decoded[7855:9911]-H,T,levels)
            expected=np.asarray(originalWidth)*curve(levels)[:,0];residual=[abs(w-t) for w,t in zip(newWidth,expected) if w is not None]
            report=dict(schema='source-proportioned-face-preview-result-v1',id=name,status='experimental-preview-only',basicChecksPassed=True,source=spec['source'],recipe=ref(BASE/'spec.json'),resource=ref(path),endpointOccurrences=len(P),minimumActualJacobian=float(np.linalg.det(J).min()),fullStoredRealPolynomialLowerBound=cert['summaries']['q']['certifiedLowerBound'],maximumProtectedErrorM=fixedmax,frameErrorM=frameError,maximumFloat32BakeErrorM=bake,allSourceEndpointYZExact=True,mouthBottomToChinYProxyM={'source':gap0,'actual':gap1,'ratio':gap1/gap0},newExactDegenerateCount=newzero,nonpositiveNormalDotCount=flips,exportReadback=checked,new101Diagnostic={'sourceLocalYM':levels,'sourceHalfWidthM':originalWidth,'requestedFromNewScaleM':expected,'actualHalfWidthM':newWidth,'maximumResidualM':max(residual),'missingCount':101-len(residual),'old101TargetApplied':False},strict55Executed=False,mixedExpressionsAccepted=False,visualAccepted=False,actionsAccepted=False,fitAccepted=False,runtimeRegistered=False)
            save(folder/'triangle-diagnostics.json',directions);save(folder/'fixed-readback.json',fixed);save(folder/'report.json',report)
            run['cases'].append(dict(id=name,report=ref(folder/'report.json'),resource=ref(path)));save(out/'report.json',run)
        run['status']='experimental-previews-exported-not-production-admission'
    except Exception as e:run.update(status='failed-stopped-no-retry',error=f'{type(e).__name__}: {e}',traceback=traceback.format_exc())
    run['seconds']=time.monotonic()-started;save(out/'report.json',run);print(json.dumps(io.clean(run)))
    if run['status']=='failed-stopped-no-retry':raise SystemExit(2)
if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--prepare',action='store_true');parser.add_argument('--execute-once',action='store_true');args=parser.parse_args()
    if args.prepare==args.execute_once:raise ValueError('Select prepare or execute-once')
    prepare() if args.prepare else execute()
