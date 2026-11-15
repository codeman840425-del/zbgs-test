"""One 6x3 longitudinal author specimen. No runtime guide or iterative fit.
Builds support polylines from actual lower-body section hulls, then evaluates
18 rigid transforms with continuous bilinear sector/length weights once.
"""
from pathlib import Path
import ast,struct,json,gzip,hashlib,argparse
import numpy as np
from scipy.spatial import ConvexHull
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'longitudinal-bones-v1';parser=argparse.ArgumentParser();parser.add_argument('--out',default='assets-source/m1/simple-skirt-v1/longitudinal-bones-v1/author-target-v1');args=parser.parse_args();OUT=(R/args.out).resolve();assert OUT.is_relative_to(R)
assert R.name=='m1-simple-skirt-worktree' and not OUT.exists()
def reuse(file,names):
 t=ast.parse(file.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(file),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py',['load'])
reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed'])
source=R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-skirt-open-waist.glb';a=asset(source)
assert a['sha']=='a5de096be20211ea9a875434893fff6c9d37b25b58cacc27c9bd8d7b8c772d66'
capPath=O/'input-038/four-poses.json.gz';cap=json.loads(gzip.decompress(capPath.read_bytes()));fr=cap['frames'][2]
mat=lambda x:np.array(x).reshape(4,4).T
hi=a['names'].index('J_Bip_C_Hips');bindHip=np.linalg.inv(a['inv'][hi]);hip=mat(fr['bones']['J_Bip_C_Hips']);invHip=np.linalg.inv(hip)
P=a['P'].astype(float);H=(np.c_[P,np.ones(len(P))]@a['inv'][hi].T)[:,:3];base=posed(a,fr);baseLocal=(np.c_[base,np.ones(len(P))]@invHip.T)[:,:3]
bodyPath=R/'prototype/public/assets/foundation/base-female-roundtrip.vrm';raw,bd,read=load(bodyPath);bp=bd['meshes'][0]['primitives'][0];BF=read(bp['indices']).reshape(-1,3);BJ=read(bp['attributes']['JOINTS_0']);BW=read(bp['attributes']['WEIGHTS_0']);names=[bd['nodes'][i]['name']for i in bd['skins'][0]['joints']]
body=next(m for m in fr['colliders']if m['name']=='Bodybaked');B=(np.c_[np.array(body['positions']).reshape(-1,3),np.ones(len(BJ))]@invHip.T)[:,:3]
allowed=np.array([any(k in n for k in ['Hips','Spine','Chest','UpperLeg'])for n in names]);valid=(allowed[BJ]*BW).sum(1)>.95;constructF=BF[np.all(valid[BF],axis=1)]
fixed=H[:,1]>=.09;theta=np.arctan2(H[:,2],H[:,0]);angles=-np.pi/2+np.arange(6)*2*np.pi/6
clearance=.002;controls=[];curves=[];weights=np.zeros((len(P),18));meridians=[]
def norm(x):return x/max(np.linalg.norm(x),1e-12)
def sample(path,s):
 lengths=np.linalg.norm(np.diff(path,axis=0),axis=1);cs=np.r_[0,np.cumsum(lengths)];s=np.clip(s,0,cs[-1]);j=min(np.searchsorted(cs,s,side='right')-1,len(path)-2);return path[j]+(path[j+1]-path[j])*(s-cs[j])/max(lengths[j],1e-12)
def frame(tangent,side):
 y=-norm(tangent);x=norm(side-y*np.dot(side,y));z=np.cross(x,y);return np.stack([x,y,z],axis=1)
for sector,angle in enumerate(angles):
 radial=np.array([np.cos(angle),0,np.sin(angle)]);side=np.array([-np.sin(angle),0,np.cos(angle)]);delta=np.angle(np.exp(1j*(theta-angle)));sectorMask=np.abs(delta)<np.pi/6
 near=sectorMask&(H[:,1]>=.06)&(H[:,1]<.10);assert near.any()
 rootIds=np.flatnonzero(near);anchor=baseLocal[rootIds].mean(0);anchor[0:3:2]=radial[0:3:2]*np.mean(H[rootIds]@radial);anchor[1]=np.mean(baseLocal[rootIds,1])
 low=sectorMask&(H[:,1]<.09);bottom=float(np.quantile(H[low,1],.015));length=.09-bottom
 # Real lower body section in the fixed sector plane. No hand/arm fitting inputs.
 section=[]
 for ids in constructF:
  q=B[ids];d=q@side
  for i,j in [(0,1),(1,2),(2,0)]:
   if d[i]*d[j]<0:
    hit=q[i]+(q[j]-q[i])*d[i]/(d[i]-d[j]);r=hit@radial
    if r>=0 and hit[1]<=anchor[1]+.015:section.append([r,hit[1]])
 pts=np.unique(np.round(section,8),axis=0);assert len(pts)>5,(sector,len(pts));hull=pts[ConvexHull(pts).vertices]
 # ConvexHull is CCW: right edge normal is exterior. One fixed 2mm author allowance.
 edge=np.roll(hull,-1,axis=0)-hull;n=np.stack([edge[:,1],-edge[:,0]],axis=1);n/=np.linalg.norm(n,axis=1)[:,None];prev=np.roll(n,1,axis=0);m=prev+n;m/=np.linalg.norm(m,axis=1)[:,None];hull=hull+m*(clearance/np.maximum((m*n).sum(1),.2))[:,None]
 ar=np.array([anchor@radial,anchor[1]]);best=None
 for j in range(len(hull)):
  x,y=hull[j],hull[(j+1)%len(hull)];t=np.clip(np.dot(ar-x,y-x)/np.dot(y-x,y-x),0,1);h=x+t*(y-x);dist=np.linalg.norm(ar-h)
  if best is None or dist<best[0]:best=(dist,j,h)
 _,j,h=best;paths=[]
 for sign in [1,-1]:
  ids=[(j+1+k)%len(hull)for k in range(len(hull))]if sign==1 else[(j-k)%len(hull)for k in range(len(hull))]
  q=np.vstack([ar,h,hull[ids]]);q=q[np.r_[True,np.linalg.norm(np.diff(q,axis=0),axis=1)>1e-8]];paths.append(q)
 # Follow the lower outside contour, not the upper closure through the torso.
 path=min(paths,key=lambda q:sample(q,min(.04,length))[1]);curve=np.array([radial*r+np.array([0,y,0])for r,y in path]);curves.append(curve.tolist())
 lengths=np.linspace(0,length,4);endpoints=np.array([sample(curve,t)for t in lengths]);restEndpoints=np.array([radial*np.mean(H[near]@radial)+np.array([0,.09-t,0])for t in lengths]);targetFrames=[]
 for k in range(3):
  c=(endpoints[k]+endpoints[k+1])/2;rest=(restEndpoints[k]+restEndpoints[k+1])/2;rot=frame(endpoints[k+1]-endpoints[k],side)@frame(restEndpoints[k+1]-restEndpoints[k],side).T;T=np.eye(4);T[:3,:3]=rot;T[:3,3]=c-rot@rest
  controls.append({'id':f'sector{sector}-segment{k}','parent':None if k==0 else f'sector{sector}-segment{k-1}','restHead':restEndpoints[k].tolist(),'restTail':restEndpoints[k+1].tolist(),'targetHead':endpoints[k].tolist(),'targetTail':endpoints[k+1].tolist(),'effectiveHipLocalMatrix':T.tolist()})
 meridians.append({'sector':sector,'angle':float(angle),'sourceLengthM':length,'anchorHipLocal':anchor.tolist(),'bodySectionPoints':len(pts),'supportedCurveLengthM':float(np.linalg.norm(np.diff(curve,axis=0),axis=1).sum()),'segmentLengthRatio':(np.linalg.norm(np.diff(endpoints,axis=0),axis=1)/(length/3)).tolist()})
 # Linear B-spline weights between sector centres and longitudinal segment centres.
 angular=np.clip(1-np.abs(delta)/(np.pi/3),0,1);t=np.clip((.09-H[:,1])/length*3-.5,0,2)
 for k in range(3):weights[:,sector*3+k]=angular*np.clip(1-np.abs(t-k),0,1)
weights[fixed]=0;sums=weights.sum(1);weights[~fixed]/=sums[~fixed,None]
M=np.array([c['effectiveHipLocalMatrix']for c in controls]);targetLocal=np.einsum('vj,jab,vb->va',weights,M,np.c_[H,np.ones(len(H))])[:,:3]
# Original complete source skin is retained through the existing fixed band.
# The 30mm free-side boundary transition is explicit source weighting, not a per-frame guide.
blend=np.clip((.09-H[:,1])/.03,0,1);blend=blend*blend*(3-2*blend)
targetLocal=baseLocal*(1-blend[:,None])+targetLocal*blend[:,None];targetLocal[fixed]=baseLocal[fixed]
target=(np.c_[targetLocal,np.ones(len(P))]@hip.T)[:,:3]
E=np.unique(np.sort(np.concatenate([a['F'][:,[0,1]],a['F'][:,[1,2]],a['F'][:,[2,0]]]),axis=1),axis=0);L=np.linalg.norm(P[E[:,1]]-P[E[:,0]],axis=1);ratio=np.linalg.norm(target[E[:,1]]-target[E[:,0]],axis=1)/np.maximum(L,1e-12);worst=int(np.argmax(ratio))
OUT.mkdir(parents=True)
np.savez_compressed(OUT/'author-arrays.npz',source=P,hipLocal=H,faces=a['F'],target=target,rawSourceWorld=base,weights18=weights,blend=blend,fixed=fixed,completeBodyFaces=BF)
spec={'schema':'longitudinal-private-skirt-author-target.1','id':'original-skirt-longitudinal-6x3-v1','sourceSha256':a['sha'],'sourceFile':str(source.relative_to(R)).replace(chr(92),'/'),'bodySHA256':hashlib.sha256(raw).hexdigest(),'captureSHA256':hashlib.sha256(capPath.read_bytes()).hexdigest(),'build':'038341558517','pose':'seated','qualified':False,'method':'One actual lower-body radial-section exterior hull per sector; fixed2mm surface allowance; consume original axial source length; three independent longitudinal rigid segment frames with continuous sector/length weights. Not cloth, not old six-bone target, no iterative pose fit.','controls':controls,'curvesHipLocal':curves,'meridians':meridians,'fixedSourceSkin':{'hipLocalMinY':.09,'count':int(fixed.sum()),'freeSideTransitionM':.03},'edgeGate':{'maximum':float(ratio[worst]),'sourceVertices':E[worst].tolist(),'sourceLengthM':float(L[worst]),'targetLengthM':float(L[worst]*ratio[worst]),'limit':1.25},'limitations':['Initial author target only; target must pass full body/top/chair/self/material before bone binding fit/export.','Body section hull is construction support only; final collision uses all original Body faces including covered torso.','18helper plus source transition influence pruning not exported or claimed lossless.','Three chord segments may cut a curved support; this is an explicit falsifiable representation limit.']}
(OUT/'author-spec.json').write_text(json.dumps(spec,indent=2)+'\n',encoding='utf-8');print(json.dumps({'vertices':len(P),'faces':len(a['F']),'fixed':int(fixed.sum()),'maxEdge':spec['edgeGate'],'meridians':meridians},indent=2))
