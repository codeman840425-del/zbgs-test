"""Exact-input profile regeneration. Never writes runtime assets/config.
Keeps original V1 measurement + V2 axial clipping/knots; uses each VRM's own
positions, weights, indices and inverse binds. No Blender is required.
"""
import argparse,hashlib,importlib.util,json,pathlib,platform,time
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--input',required=True)
parser.add_argument('--body-id',required=True)
parser.add_argument('--expect-sha',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args()
source=(ROOT/args.input).resolve();out=(ROOT/args.output).resolve()
assert out.is_relative_to(ROOT) and not out.is_relative_to(ROOT/'prototype') and not out.is_relative_to(ROOT/'baseline'),'Only isolated project evidence/source outputs permitted'
assert all(c.isalnum() or c in '-_' for c in args.body_id),'Unsafe body ID'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(source)==args.expect_sha,'Exact input identity mismatch'
builder=ROOT/'scripts/m1-assets/build-forearm-collision-profile.py'
spec=importlib.util.spec_from_file_location('forearm_source',builder);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
start=time.perf_counter();out.mkdir(parents=True,exist_ok=True)
d=g.build(args.body_id,source,out/'bind-v1');src=g.load(args.body_id,source)
checks=[]
for p in d['profiles']:
 _,a,b,axis,length,weights,faces,ids,u,rad=g.prepare(src,p['side'])
 lo=float(u[ids].min());hi=float(u[ids].max());knots=np.array([lo,lo/2,0,.2,.4,.6,.8,1,(1+hi)/2,hi]);bands=[]
 assert lo<0 and hi>1 and np.all(np.diff(knots)>0),'This bounded V2 construction requires measured elbow/wrist overhang'
 for first,last in zip(knots[:-1],knots[1:]):
  points=[]
  for t in src['tri'][faces]:
   if max(u[t])<first or min(u[t])>last:continue
   clipped=g.clip(src['pos'][t],a,axis,first*length,False)
   if len(clipped):clipped=g.clip(clipped,a,axis,last*length,True)
   if len(clipped):points.extend(clipped)
  points=np.array(points);delta=points-a;ax=delta@axis;bands.append(float(np.linalg.norm(delta-ax[:,None]*axis,axis=1).max()))
 radii=[bands[0]]+[max(bands[i-1:i+1])for i in range(1,len(bands))]+[bands[-1]]
 p['extendedKnots']=[{'t':float(t),'radius':r}for t,r in zip(knots,radii)]
 p['extendedScope']='Axis-aligned measured boundary in bind only; mixed elbow deformation requires actual posed verification. No full-radius elbow sphere.'
 tri=src['pos'][src['tri'][faces]]
 samples=np.concatenate([tri[:,0]*(i/8)+tri[:,1]*(j/8)+tri[:,2]*(1-(i+j)/8)for i in range(9)for j in range(9-i)])
 delta=samples-a;phase=delta@axis/length;radius=np.linalg.norm(delta-phase[:,None]*length*axis,axis=1)
 outside=radius-np.interp(phase,knots,radii)
 assert np.max(outside)<1e-9,'Bind surface outside measured axial contour'
 checks.append({'side':p['side'],'length':float(length),'triangles':len(faces),'samples':len(samples),'maxOutsideEnvelope':float(max(0,np.max(outside))),'extendedKnots':p['extendedKnots']})
d['railCandidate']='v2 measured axial extension,8circumferential rails+end diameters; finite contours do not guarantee coverage of every small triangle'
(out/'profile.json').write_text(json.dumps(d,indent=2),encoding='utf8')
receipt={'bodyId':args.body_id,'input':source.relative_to(ROOT).as_posix(),'inputSHA256':sha(source),'primitive':d['primitive'],'profileSHA256':sha(out/'profile.json'),'v1SHA256':sha(out/'bind-v1'/f'{args.body_id}.json'),'generatorSHA256':sha(pathlib.Path(__file__)),'v1GeneratorSHA256':sha(builder),'v2ReferenceAlgorithmSHA256':sha(ROOT/'assets-source/forearm-collision-v2/scripts/build-forearm-rails-v2.py'),'python':platform.python_version(),'numpy':np.__version__,'elapsedSeconds':time.perf_counter()-start,'checks':checks,'runtimeIntegrated':False,'limits':['Bind-only enclosure of measured LowerArm selected skin; not posed mixed-weight coverage or hand/palm coverage.','Exact body identity preserved; no female profile or result inherited.','Finite runtime contour collision can still miss actual skin/garment intersections; independent posed/raw triangle regression remains required.']}
(out/'generation.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:receipt[k]for k in ['bodyId','inputSHA256','profileSHA256','elapsedSeconds','runtimeIntegrated']}))
