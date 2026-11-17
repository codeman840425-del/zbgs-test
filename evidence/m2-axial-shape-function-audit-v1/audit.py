"""Independent exact reparameterization and bounded synthetic proof checks."""
import sys
sys.dont_write_bytecode=True
from fractions import Fraction as Q
from math import comb
from pathlib import Path
import hashlib,json,importlib.util
import numpy as np

ROOT=Path(__file__).resolve().parents[2]

def rat(x):
    return Q.from_float(float(x))

def decoded(x):
    return Q(int(x['numerator']),int(x['denominator']))

def polyeval(a,x):
    total=Q(0)
    for v in reversed(a):total=total*x+v
    return total

def mul(a,b):
    out=[Q(0)]*(len(a)+len(b)-1)
    for i in range(len(a)):
        for j in range(len(b)):out[i+j]+=a[i]*b[j]
    return out

def sampled_power(function,degree):
    # Recover coefficients independently by exact Lagrange interpolation of
    # polynomial values, rather than reusing producer's coefficient scaling.
    xs=[Q(i,degree) for i in range(degree+1)]
    result=[Q(0)]*(degree+1)
    for i,x in enumerate(xs):
        basis=[Q(1)];denom=Q(1)
        for j,z in enumerate(xs):
            if i==j:continue
            basis=mul(basis,[-z,Q(1)]);denom*=x-z
        weight=function(x)/denom
        for k,a in enumerate(basis):result[k]+=a*weight
    return result

def independent_beta(function,degree,lo=Q(0),hi=Q(1)):
    power=sampled_power(lambda t:function(lo+(hi-lo)*t),degree)
    beta=[sum((power[k]*Q(comb(i,k),comb(degree,k)) for k in range(i+1)),Q(0)) for i in range(degree+1)]
    # An extra rational evaluation outside interpolation nodes checks the basis.
    t=Q(2,13)
    assert sum((beta[i]*comb(degree,i)*t**i*(1-t)**(degree-i) for i in range(degree+1)),Q(0))==function(lo+(hi-lo)*t)
    return beta

def verify_certificate(knots,c,certificate):
    checked=0;unproved=0;failed=0;max_value_seam=Q(0);max_derivative_seam=Q(0)
    assert len(knots)>=2 and np.asarray(c).shape==(4,len(knots)-1,3)
    for segment in range(len(knots)-1):
        width=rat(knots[segment+1])-rat(knots[segment]);assert width>0
        coefficients=[[rat(c[3-k][segment][axis]) for k in range(4)] for axis in range(3)]
        def component(t,axis):return polyeval(coefficients[axis],width*t)
        def derivative(t,axis):return polyeval([(k+1)*coefficients[axis][k+1] for k in range(3)],width*t)
        functions={'s':lambda t:component(t,0),'q':lambda t:component(t,0)*(1+derivative(t,1))}
        for name,function in functions.items():
            degree=3 if name=='s' else 5;threshold=Q(0) if name=='s' else Q(3,25)
            initial=next(r for r in certificate['segmentBernstein'] if r['segment']==segment and r['component']==name)
            assert [decoded(v) for v in initial['originalBernstein']]==independent_beta(function,degree)
            leaves=sorted((r for r in certificate['leaves'] if r['segment']==segment and r['component']==name),key=lambda r:decoded(r['tLow']))
            cursor=Q(0);assert leaves
            for row in leaves:
                low,high=decoded(row['tLow']),decoded(row['tHigh'])
                assert low==cursor and high>low and high<=1;cursor=high
                assert high-low==Q(1,2**row['depth'])
                beta=independent_beta(function,degree,low,high)
                if 'lower' in row:
                    assert decoded(row['lower'])==min(beta) and decoded(row['upper'])==max(beta)
                if row['status']=='certified-strictly-above':assert min(beta)>threshold
                elif row['status']=='certified-at-or-below':assert max(beta)<=threshold;failed+=1
                else:assert row['status'].startswith('unproven-');unproved+=1
                checked+=1
            assert cursor==1
        if segment+1<len(knots)-1:
            seam=next(r for r in certificate['seams'] if r['knotIndex']==segment+1)
            for axis,row in enumerate(seam['components']):
                dv=component(Q(1),axis)-rat(c[3][segment+1][axis])
                dd=derivative(Q(1),axis)-rat(c[2][segment+1][axis])
                assert decoded(row['valueDifference'])==dv and decoded(row['derivativeDifference'])==dd
                max_value_seam=max(max_value_seam,abs(dv));max_derivative_seam=max(max_derivative_seam,abs(dd))
    assert certificate['allCertified']==(unproved==0 and failed==0)
    return {'leavesIndependentlyChecked':checked,'unprovenLeaves':unproved,'failedLeaves':failed,
        'maximumExactValueSeam':float(max_value_seam),'maximumExactDerivativeSeam':float(max_derivative_seam),
        'method':'Exact rational Lagrange recovery from raw local-coordinate function evaluations, independent leaf reparameterization, complete disjoint partition coverage.'}

def synthetic_checks(proof):
    results=[]
    def check(name,knots,c,expected,**kwargs):
        p=proof.certify(knots,c,**kwargs)
        independent=verify_certificate(knots,c,p)
        assert p['allCertified']==expected
        results.append({'name':name,'expectedCertified':expected,'actualCertified':p['allCertified'],
            'maxLeafDepth':max(r['depth'] for r in p['leaves']),**independent})
    def blank():
        c=np.zeros((4,1,3));c[3,0,0]=1;return c
    check('constant-identity-nonzero-origin-nonunit-width',[3.,5.],blank(),True)
    c=blank();c[2,0,1]=-2
    check('negative-fprime-fold-rejected',[3.,5.],c,False)
    # q(u)=u²-u+0.38 has minimum0.13; initial degree5 Bernstein lower fails.
    c=blank();c[0,0,1]=1/3;c[1,0,1]=-.5;c[2,0,1]=-.62
    check('positive-function-requires-subdivision',[4.,5.],c,True)
    assert results[-1]['maxLeafDepth']>0
    check('positive-but-depth-budget-unproven-rejects',[4.,5.],c,False,maximum_depth=0)
    check('positive-but-visit-budget-unproven-rejects',[4.,5.],c,False,maximum_intervals=1)
    # Almost threshold minimum, not safely certifiable with depth0.
    c=blank();c[0,0,1]=1/3;c[1,0,1]=-.5;c[2,0,1]=-.62999999999999
    check('near-threshold-unproven-rejects',[4.,5.],c,False,maximum_depth=0)
    # Nonzero local origin and width test every normalization power in s and d.
    c=blank();c[:,0,0]=[.001,.002,.01,1.];c[:,0,1]=[.001,.002,.03,.07];c[:,0,2]=[.004,.005,.006,.007]
    check('all-cubic-powers-nonunit-width',[3.,5.],c,True)
    return results

def evaluate_stored(y,knots,c,L,U):
    y=np.asarray(y,float);values=np.zeros((len(y),3));values[:,0]=1
    inside=(y>L)&(y<U)
    k=np.minimum(np.searchsorted(knots,y[inside],side='right')-1,len(knots)-2)
    u=y[inside]-knots[k]
    values[inside]=((c[0,k]*u[:,None]+c[1,k])*u[:,None]+c[2,k])*u[:,None]+c[3,k]
    return values

def run():
    out=Path(__file__).with_name('result.json')
    if out.exists():raise SystemExit('Refusing to overwrite evidence')
    base=ROOT/'assets-source/m2-axial-shape-function-v1'
    generation=json.loads((base/'generated/report.json').read_bytes())
    assert generation['status']=='coefficient-preflights-finished-no-character'
    method=json.loads((base/'spec.json').read_bytes())
    for row in method['inputs']:
        assert hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()==row['sha256']
    source_response=json.loads((ROOT/method['response']).read_bytes())
    original_native=next(r for r in json.loads((ROOT/method['nativeGuide']).read_bytes())['sexes'] if r['sex']=='male')
    band=json.loads((ROOT/method['bandAudit']).read_bytes())['sourceRequestTriangleBand']
    intervals=json.loads((ROOT/method['intervalReadback']).read_bytes())
    common_knots=json.loads((base/'generated/common-knots.json').read_bytes())
    H=np.asarray(source_response['rawHeadRestOriginM']);P=np.asarray(source_response['sourcePointsM'])
    L,U=intervals['conservativeOpenSupportLocalY_M'];frames=np.asarray(intervals['fixedFrameLocalPositionsM'])[:,1]
    expected=np.unique(np.r_[P[band['sourceVertexIndices'],1]-H[1],band['sourceLevelsM'],frames.min(),L,U,frames.max()])
    assert np.array_equal(expected,common_knots['knotsLocalY_M'])
    producer_path=ROOT/'scripts/m2-axial-shape-function-v1/proof.py'
    loader=importlib.util.spec_from_file_location('producer_proof_tests_only',producer_path)
    proof=importlib.util.module_from_spec(loader);loader.loader.exec_module(proof)
    synthetic=synthetic_checks(proof)
    pins=[Path(__file__),producer_path,ROOT/'scripts/m2-axial-shape-function-v1/build.py',base/'spec.json',base/'generated/report.json',base/'generated/common-knots.json']
    pins.extend(ROOT/method[k] for k in ['response','nativeGuide','bandAudit','intervalReadback'])
    cases=[]
    for identifier in ['identity','male-long-lean-v2','male-round-stocky-v2']:
        folder=base/'generated'/identifier
        raw=json.loads((folder/'curves.json').read_bytes());certificate=json.loads((folder/'bernstein-proof.json').read_bytes());report=json.loads((folder/'report.json').read_bytes())
        assert certificate['storedCurvesSha256']==hashlib.sha256((folder/'curves.json').read_bytes()).hexdigest()
        knots=np.asarray(raw['knotsLocalY_M']);c=np.asarray(raw['coefficients'])
        assert np.array_equal(expected,knots) and np.array_equal(raw['headOriginM'],H)
        assert raw['supportL']==L and raw['supportU']==U
        checked=verify_certificate(knots,c,certificate)
        platform=(knots[1:]<=L)|(knots[:-1]>=U)
        constant=np.zeros_like(c[:,platform]);constant[3,:,0]=1
        assert np.array_equal(c[:,platform],constant)
        marker_rows=[]
        for name,points in [('original23',np.asarray(original_native['sourcePointsM'])),('original202',np.asarray(source_response['sourceLandmarksM']))]:
            if identifier=='identity':requested=points
            elif name=='original23':requested=np.asarray(next(r for r in original_native['cases'] if r['id']==identifier)['requestedVertexPointsM'])
            else:requested=np.asarray(next(r for r in source_response['requests'] if r['id']==identifier)['requestedLandmarksM'])
            values=evaluate_stored(points[:,1]-H[1],knots,c,L,U)
            mapped=points.copy();mapped[:,0]=H[0]+values[:,0]*(points[:,0]-H[0]);mapped[:,1:]+=values[:,1:]
            residual=mapped-requested
            saved=next(r for r in report['markerReadbacks'] if r['id']==name)
            difference=float(abs(residual-np.asarray(saved['residualVectorsM'])).max())
            assert difference<1e-12
            marker_rows.append({'name':name,'maximumNormM':float(np.linalg.norm(residual,axis=1).max()),'maximumResidualVersusSavedDifferenceM':difference,
                'targetsFromOriginalPinnedRequest':True})
        source=np.asarray(source_response['sourceLandmarksM'])
        target=source if identifier=='identity' else np.asarray(next(r for r in source_response['requests'] if r['id']==identifier)['requestedLandmarksM'])
        expected_scalars=np.column_stack([(target[1::2,0]-target[::2,0])/(source[1::2,0]-source[::2,0]),target[::2,1]-source[::2,1],target[::2,2]-source[::2,2]])
        scalars=evaluate_stored(source[::2,1]-H[1],knots,c,L,U)
        scalar_residual=scalars-expected_scalars
        assert abs(scalar_residual).max()<1e-12
        # Verify refusal semantics independently from producer status text.
        expected_pass=certificate['allCertified'] and checked['maximumExactValueSeam']<=method['seamValueTolerance'] and checked['maximumExactDerivativeSeam']<=method['seamDerivativeTolerance'] and all(r['maximumNormM']<=method['markerToleranceM'] for r in marker_rows) and np.isfinite(c).all()
        assert (report['status']=='coefficient-preflight-passed-pending-geometry')==bool(expected_pass)
        assert report['floatingExecutionWholeDomainBoundEstablished'] is False
        assert report['globalStrictC1OrInjectivityProved'] is False
        assert report['actual101MeshSectionsEvaluated'] is False and report['fullSourceEndpointsEvaluated'] is False
        cases.append({'id':identifier,'producerStatus':report['status'],'segments':len(knots)-1,**checked,
            'certifiedSegmentPolynomialLowerBounds':{k:float(decoded(v['certifiedLowerBound'])) if v['certifiedLowerBound'] is not None else None for k,v in certificate['summaries'].items()},
            'identityPlatformCoefficientsExact':True,'markerReadbacks':marker_rows,
            'source101ScalarMaximumResidualByComponent':abs(scalar_residual).max(axis=0).tolist(),
            'numericSeamGuardsPass':checked['maximumExactValueSeam']<=method['seamValueTolerance'] and checked['maximumExactDerivativeSeam']<=method['seamDerivativeTolerance'],
            'exactC1AcrossStoredCoefficientSeams':checked['maximumExactValueSeam']==0 and checked['maximumExactDerivativeSeam']==0,
            'floatingExecutionWholeDomainBoundEstablished':False,'actual101MeshSectionsEvaluated':False,'fullSourceEndpointsEvaluated':False})
        pins.extend(folder/n for n in ['curves.json','bernstein-proof.json','report.json'])
    result={'schema':'axial-stored-function-independent-audit-v1','status':'independent-coefficient-audit-complete-not-geometry-admission','cases':cases,
        'commonKnotsExactlyOriginalBandAnd101AndFourIdentityGuards':True,'syntheticChecks':synthetic,
        'newCandidateConstructed':False,'sourceMeshDeformed':False,'solverCalled':False,'originalInputsUnchanged':True,
        'pins':{p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in pins}}
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps(cases,indent=2))

if __name__=='__main__':run()
