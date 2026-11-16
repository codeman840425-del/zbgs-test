"""Exact rational check of the frozen six-point oral pair. No Blender invocation."""
import ast, hashlib, importlib.util, json, subprocess, sys
from fractions import Fraction
from pathlib import Path
sys.dont_write_bytecode = True
import numpy as np
ROOT = Path('F:/gamemake-representative-head-cage')
OUT = Path(__file__).resolve().parent
BASE = ROOT/'assets-source/m2-representative-head-cage-v1'
PIN = '2ff35cd0548da3f9b67be1f699aa361e508141e8'
sys.path.insert(0,str(ROOT/'scripts/production'))
from flow import GLB

def sha(data): return hashlib.sha256(data).hexdigest()
def vector(v): return [Fraction(float(x)) for x in v]
def sub(a,b): return [x-y for x,y in zip(a,b)]
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]

def exact_edge(a,b,triangle):
    direction=sub(b,a);e1=sub(triangle[1],triangle[0]);e2=sub(triangle[2],triangle[0])
    h=cross(direction,e2);det=dot(e1,h)
    if det==0:return None
    delta=sub(a,triangle[0]);u=dot(delta,h)/det;q=cross(delta,e1)
    v=dot(direction,q)/det;t=dot(e2,q)/det
    if not (u>=0 and v>=0 and u+v<=1 and t>=0 and t<=1):return None
    point=[x+t*y for x,y in zip(a,direction)]
    return {'point':point,'barycentric':[1-u-v,u,v],'t':t,'determinant':det}

predicate_path=ROOT/'scripts/m2-hairstyle-v1/check-head-space.py'
node=next(n for n in ast.parse(predicate_path.read_bytes()).body if isinstance(n,ast.FunctionDef) and n.name=='segment_hits')
namespace={'np':np};exec(compile(ast.Module([node],[]),str(predicate_path),'exec'),namespace)
segment_hits=namespace['segment_hits']

def add(a,b): return [x+y for x,y in zip(a,b)]
def scale(a,s): return [x*s for x in a]
def clamp01(x): return min(Fraction(1),max(Fraction(0),x))

def disjoint_distance_squared(A,B):
    # Exact rational closest-feature distances for this fixed triangle pair.
    # Noncoplanar intersection has already been checked separately.
    values=[]
    for points,triangle in [(A,B),(B,A)]:
        e1=sub(triangle[1],triangle[0]);e2=sub(triangle[2],triangle[0])
        aa,bb,cc=dot(e1,e1),dot(e1,e2),dot(e2,e2)
        determinant=aa*cc-bb*bb
        for point in points:
            delta=sub(point,triangle[0]);r1,r2=dot(e1,delta),dot(e2,delta)
            u=(cc*r1-bb*r2)/determinant;v=(aa*r2-bb*r1)/determinant
            if u>=0 and v>=0 and u+v<=1:
                closest=add(triangle[0],add(scale(e1,u),scale(e2,v)))
                difference=sub(point,closest);values.append(dot(difference,difference))
    for i in range(3):
        a=A[i];u=sub(A[(i+1)%3],a)
        for j in range(3):
            b=B[j];v=sub(B[(j+1)%3],b);w=sub(a,b)
            aa,bb,cc,dd,ee=dot(u,u),dot(u,v),dot(v,v),dot(u,w),dot(v,w)
            candidates=[(Fraction(0),clamp01(ee/cc)),(Fraction(1),clamp01((ee+bb)/cc)),
                        (clamp01(-dd/aa),Fraction(0)),(clamp01((bb-dd)/aa),Fraction(1))]
            determinant=aa*cc-bb*bb
            if determinant:
                s=(bb*ee-cc*dd)/determinant;t=(aa*ee-bb*dd)/determinant
                if 0<=s<=1 and 0<=t<=1:candidates.append((s,t))
            for s,t in candidates:
                difference=sub(add(w,scale(u,s)),scale(v,t));values.append(dot(difference,difference))
    return min(values)

def inspect(A,B):
    A=np.asarray(A,float);B=np.asarray(B,float);inclusive=[];strict=[]
    for first,second,label in [(A,B,'mouth-to-skin'),(B,A,'skin-to-mouth')]:
        lengths=np.array([np.linalg.norm(second[(i+1)%3]-second[(i+2)%3]) for i in range(3)])
        double_area=np.linalg.norm(np.cross(second[1]-second[0],second[2]-second[0]))
        altitudes=double_area/lengths
        for i in range(3):
            actual_strict=bool(segment_hits(first[i],first[(i+1)%3],second[None])[0])
            if actual_strict:strict.append({'direction':label,'edge':i})
            hit=exact_edge(vector(first[i]),vector(first[(i+1)%3]),[vector(p) for p in second])
            if hit:
                bary=np.array(list(map(float,hit['barycentric'])))
                inclusive.append({'direction':label,'edge':i,'pointM':list(map(float,hit['point'])),
                    'barycentric':bary.tolist(),'t':float(hit['t']),'absoluteDeterminantM3':float(abs(hit['determinant'])),
                    'distanceToNearestTargetTriangleEdgeM':float(np.min(bary*altitudes)),
                    'oldStrictBarycentricEpsilonPhysicalScalesM':(1e-7*altitudes).tolist()})
    length=float(np.linalg.norm(np.array(inclusive[0]['pointM'])-inclusive[1]['pointM'])) if len(inclusive)==2 else None
    return {'strictHitEdges':strict,'exactInclusiveHits':inclusive,'intersectionSegmentLengthM':length,
            'exactRepresentedTriangleMinimumDistanceM':0.0 if inclusive else float(disjoint_distance_squared([vector(p) for p in A],[vector(p) for p in B]))**.5,
            'distanceScope':'Exact rational inclusive intersection gives zero, otherwise exact rational closest vertex-face/edge-edge squared distance. Square root reported as float. No penetration-depth inference.'}

assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==PIN
spec=json.loads((BASE/'spec.json').read_bytes());diagnosis=json.loads((BASE/'generated/pair-diagnosis.json').read_bytes())
expected={'generated/preflight.json':'da45d4f1fb6d3e5222de827de659ba53bb5be6c212f7783bad16927b0c98eab9','generated/pair-diagnosis.json':'39a75b618693c6732e2270a5291d4c2e11072e3b121269f8e15b510729c3b628'}
for path,digest in expected.items():assert sha((BASE/path).read_bytes())==digest
raw=(ROOT/spec['sources']['male']['body']['path']).read_bytes();assert sha(raw)==spec['sources']['male']['body']['sha256']
g=GLB(raw)
face=next(p for m in g.doc['meshes'] for p in m['primitives'] if 'Face_00_SKIN' in g.doc['materials'][p['material']]['name'])
mouth=next(p for m in g.doc['meshes'] for p in m['primitives'] if 'FaceMouth' in g.doc['materials'][p['material']]['name'])
assert face['attributes']['POSITION']==mouth['attributes']['POSITION']
P=np.asarray(g.accessor(face['attributes']['POSITION']),float)
D=np.asarray(g.accessor(face['targets'][0]['POSITION']),float);E=P+D
mouth_ids=np.asarray(g.accessor(mouth['indices']),int).reshape(-1,3)[47]
skin_ids=np.asarray(g.accessor(face['indices']),int).reshape(-1,3)[1007]
assert mouth_ids.tolist()==diagnosis['sourceIndices']['mouth'] and skin_ids.tolist()==diagnosis['sourceIndices']['skin']
source=diagnosis['sourceFloat64Endpoint'];assert np.array_equal(E[mouth_ids],source['mouthTriangleM']) and np.array_equal(E[skin_ids],source['skinTriangleM'])
assert np.array_equal(np.asarray(E[mouth_ids],np.float32).astype(float),diagnosis['sourceFloat32Endpoint']['mouthTriangleM'])
assert np.array_equal(np.asarray(E[skin_ids],np.float32).astype(float),diagnosis['sourceFloat32Endpoint']['skinTriangleM'])
head_path=ROOT/'scripts/m2-representative-head-cage-v1/head.py'
contact_node=next(n for n in ast.parse(head_path.read_bytes()).body if isinstance(n,ast.FunctionDef) and n.name=='contacts')
contact_namespace={'np':np,'segment_hits':segment_hits}
exec(compile(ast.Module([contact_node],[]),str(head_path),'exec'),contact_namespace)
mouth_faces=np.asarray(g.accessor(mouth['indices']),int).reshape(-1,3)
skin_faces=np.asarray(g.accessor(face['indices']),int).reshape(-1,3)
source_pairs=contact_namespace['contacts'](E,mouth_faces,skin_faces)
rest_pairs=contact_namespace['contacts'](P,mouth_faces,skin_faces)
assert [list(pair) for pair in sorted(source_pairs)]==diagnosis['sourceStrictPairs']
assert set(map(tuple,diagnosis['probeStrictPairs']))-source_pairs=={(47,1007)}
assert diagnosis['sourceWeights']=={'mouth':[1,1,1],'skin':[1,1,1]}
analytic={'mouthTriangleM':(E[mouth_ids]+[.003,0,0]).tolist(),'skinTriangleM':(E[skin_ids]+[.003,0,0]).tolist()}
assert analytic=={k:diagnosis['analyticWeightedTranslation'][k] for k in analytic}
stages={name:inspect(diagnosis[name]['mouthTriangleM'],diagnosis[name]['skinTriangleM']) for name in ['sourceFloat64Endpoint','sourceFloat32Endpoint','analyticWeightedTranslation','actualModifierEndpoint','actualFloat32Endpoint']}
stages['analyticTranslationFloat32']=inspect(np.asarray(analytic['mouthTriangleM'],np.float32).astype(float),np.asarray(analytic['skinTriangleM'],np.float32).astype(float))
A=np.array(diagnosis['actualModifierEndpoint']['mouthTriangleM']);B=np.array(diagnosis['actualModifierEndpoint']['skinTriangleM'])
assert np.array_equal(A,np.asarray(A,np.float32).astype(float)) and np.array_equal(B,np.asarray(B,np.float32).astype(float))
points=np.vstack((A,B));ideal=np.vstack((analytic['mouthTriangleM'],analytic['skinTriangleM']))
residual=points-ideal
hit=np.asarray(stages['actualModifierEndpoint']['exactInclusiveHits'][0]['pointM'],np.float32)
ulp=np.spacing(abs(hit)).astype(float)
assert ulp.tolist()==diagnosis['float32ULPMAtIntersection']
assert abs(stages['actualModifierEndpoint']['intersectionSegmentLengthM']-diagnosis['actualIntersectionLineLengthM'])<1e-20
bindings=[x for x in g.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups'] if any(b['mesh']==1 and b['index']==0 for b in x['binds'])]
assert bindings==diagnosis['expressionBinding']
result={'commit':PIN,'pinnedFiles':expected,'sourceAvatarSha256':sha(raw),'sourceIndices':diagnosis['sourceIndices'],'expressionBinding':bindings,
 'predicate':{'sourceSha256':sha(predicate_path.read_bytes()),'absoluteDeterminantThresholdM3':1e-12,'dimensionlessInteriorThreshold':1e-7,'endpointParameterThreshold':1e-7,'scope':'Strict excludes edge/vertex neighborhoods; determinant threshold has cubic length units. Exact rational inclusive tests use exact float-input representations.'},
 'independentlyRecomputedSourceStrictCounts':{'rest':len(rest_pairs),'target0':len(source_pairs)},'probeStrictCountAuthorReadback':len(diagnosis['probeStrictPairs']),'stages':stages,'actualSixPointDisplacementRangeM':{'min':np.min(points-np.vstack((E[mouth_ids],E[skin_ids])),axis=0).tolist(),'max':np.max(points-np.vstack((E[mouth_ids],E[skin_ids])),axis=0).tolist()},
 'actualVersusAnalyticMaximumPerAxisErrorM':np.max(abs(residual),axis=0).tolist(),'actualVersusAnalyticMaximumDifferentialResidualM':float(np.max(np.linalg.norm(residual[:,None]-residual[None,:],axis=2))),
 'float32ULPAtIntersectionPerAxisM':ulp.tolist(),'float32HalfULPBoxRadiusM':float(np.linalg.norm(.5*ulp)),
 'classification':'precision-boundary-uncertain; existing inclusive source contact crosses an old strict exclusion threshold. Retain original failure and pair. Not a resolved new intersection, not proven separated or generally safe.',
 'limits':['Exact arithmetic establishes represented-coordinate topology, not physical certainty beyond float32 source/modifier precision.','Actual modifier six-point output is the pinned saved readback, independently source-linked and recomputed geometrically. Blender was not rerun.','No eight-shape batch/achieved shape, full expression mixing, pose or visual approval.']}
(OUT/'pair-probe.json').write_bytes((json.dumps(result,indent=2)+'\n').encode())
print(json.dumps({'sourceSegmentM':stages['sourceFloat64Endpoint']['intersectionSegmentLengthM'],'modifierSegmentM':stages['actualModifierEndpoint']['intersectionSegmentLengthM'],'analyticFloat32StrictHits':len(stages['analyticTranslationFloat32']['strictHitEdges']),'maxPerAxisResidualM':result['actualVersusAnalyticMaximumPerAxisErrorM'],'maxDifferentialResidualM':result['actualVersusAnalyticMaximumDifferentialResidualM'],'ulp':ulp.tolist()}))
