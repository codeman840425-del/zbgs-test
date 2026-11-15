"""One OFFLINE editable bent-tube author target from actual body/seat space.
No runtime guide, simulation, fitting iteration, source overwrite or body edit.
"""
from pathlib import Path
import gzip,hashlib,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'pose-support-v1'
assert R.name=='m1-simple-skirt-worktree'and not O.exists()
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);buf=b[28+n:]
 def read(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']]);w={'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16,'SCALAR':1}[a['type']]
  return np.ndarray((a['count'],w),dtype=dt,buffer=buf,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 return b,d,read
asset=S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb';raw,doc,read=load(asset);assert sha(raw)=='d7b5a881d1a64bdaf5e1d92a72573c2cef34abe859e53af0f9a2c8b091bd55fa'
packed=(S/'input-269/four-poses.json.gz').read_bytes();capture=json.loads(gzip.decompress(packed));f=capture['frames'][2];mat=lambda m:np.array(m).reshape(4,4).T;bones={k:mat(v)for k,v in f['bones'].items()};hips=bones['J_Bip_C_Hips'];hi=np.linalg.inv(hips)
positions=[];faces=[];js=[];ws=[];offset=0
for p in doc['meshes'][0]['primitives']:
 points=read(p['attributes']['POSITION']);positions.append(points);faces.append(read(p['indices']).reshape(-1,3)+offset);js.append(read(p['attributes']['JOINTS_0']));ws.append(read(p['attributes']['WEIGHTS_0']));offset+=len(points)
upperCount=len(positions[0]);source=np.concatenate(positions);tri=np.concatenate(faces);joint=np.concatenate(js);weight=np.concatenate(ws);skin=doc['skins'][0];names=[doc['nodes'][i]['name']for i in skin['joints']];inverse=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);rest=np.linalg.inv(inverse)
# Match actual exclusive palette: current raw parent, unchanged source rest.
world=np.array([bones[n]for n in names])
for i,name in enumerate(names):
 if 'Skirt'in name:
  parent=names.index('J_Bip_'+('L'if '_L_'in name else'R')+'_UpperLeg');world[i]=world[parent]@inverse[parent]@rest[i]
palette=world@inverse;P=np.c_[source,np.ones(len(source))];posed=np.zeros((len(source),4))
for k in range(4):posed+=np.einsum('nij,nj->ni',palette[joint[:,k]],P)*weight[:,k,None]
posed=posed[:,:3];local=(np.c_[posed,np.ones(len(posed))]@hi.T)[:,:3]
rows=np.array([np.arange(upperCount+20+i*121,upperCount+20+(i+1)*121)for i in range(10)])
# One axial material budget from actual source geometry, outer row0->outerhem8.
sourceLines=source[rows[:9,:120]];sourceLengths=np.linalg.norm(np.diff(sourceLines,axis=0),axis=2).sum(0);budget=float(np.median(sourceLengths))
p0=local[rows[0,:120]].mean(0);heads=[];knees=[]
for side in ['L','R']:
 heads.append((hi@bones[f'J_Bip_{side}_UpperLeg'])[:3,3]);knees.append((hi@bones[f'J_Bip_{side}_LowerLeg'])[:3,3])
head=np.mean(heads,axis=0);direction=np.mean(knees,axis=0)-head;direction/=np.linalg.norm(direction);down=np.array([0,-1,0.]);handle=.35*budget
def curve(distance,ts):
 p3=head+direction*distance;p1=p0+down*handle;p2=p3-direction*handle;t=np.asarray(ts)[:,None]
 points=(1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t*t*p2+t**3*p3
 tangent=3*(1-t)**2*(p1-p0)+6*(1-t)*t*(p2-p1)+3*t*t*(p3-p2);tangent/=np.maximum(np.linalg.norm(tangent,axis=1)[:,None],1e-12)
 return points,tangent,[p0,p1,p2,p3]
low,high=0.,budget*1.5
for _ in range(40):
 mid=(low+high)/2;c,_,_=curve(mid,np.linspace(0,1,129));length=np.linalg.norm(np.diff(c,axis=0),axis=1).sum()
 if length>budget:high=mid
 else:low=mid
distance=(low+high)/2;path,tangent,control=curve(distance,np.linspace(0,1,9))
# True source weights distinguish body support from authored hands/arms; indices
# are verified against captured actual body triangles, no approximate capsules.
bodyRaw,bodyDoc,bodyRead=load(R/'prototype/public/assets/foundation/base-female-roundtrip.vrm');bp=bodyDoc['meshes'][0]['primitives'][0];bi=bodyRead(bp['indices']).reshape(-1,3);bjs=bodyRead(bp['attributes']['JOINTS_0']);bws=bodyRead(bp['attributes']['WEIGHTS_0']);bn=next(n for n in bodyDoc['nodes']if n.get('mesh')==0);bskin=bodyDoc['skins'][bn['skin']];bnames=[bodyDoc['nodes'][i]['name']for i in bskin['joints']];armIds=[i for i,n in enumerate(bnames)if any(s in n for s in ['Arm','Hand','Finger','Thumb','Index','Middle','Ring','Little'])];armw=np.zeros(len(bjs))
for i in armIds:armw+=np.where(bjs==i,bws,0).sum(1)
actualBody=next(m for m in f['colliders']if m['name']=='Bodybaked');assert np.array_equal(bi,np.array(actualBody['triangles']).reshape(-1,3));bodyPoints=np.array(actualBody['positions']).reshape(-1,3);bodyPoints=(np.c_[bodyPoints,np.ones(len(bodyPoints))]@hi.T)[:,:3];bodyFaces=bi[(armw[bi].max(1)<.05)]
topcap=set(json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/top-edit.json').read_text(encoding='utf-8'))['removedOriginalFaces']);topTriangles=[]
for mesh in f['colliders']:
 if 'uniform-top'not in mesh['name']:continue
 tp=np.array(mesh['positions']).reshape(-1,3);tp=(np.c_[tp,np.ones(len(tp))]@hi.T)[:,:3];tf=np.array(mesh['triangles']).reshape(-1,3)
 if mesh['name']=='m1-uniform-top_1':tf=np.array([t for i,t in enumerate(tf)if i not in topcap])
 topTriangles.extend(tp[tf])
def prepare(t):return t[:,0],t[:,1]-t[:,0],t[:,2]-t[:,0]
bt=prepare(bodyPoints[bodyFaces]);tt=prepare(np.array(topTriangles));seat=next(b for b in f['chair']if b['name']=='chairSeat');seatWorld=mat(seat['matrixWorld']);toSeat=np.linalg.inv(seatWorld)@hips;seatlo=np.array(seat['min']);seathi=np.array(seat['max'])
def rays(origin,direction,prepared):
 a,e1,e2=prepared;h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.einsum('ij,ij->i',e1,h);valid=abs(det)>1e-12;inv=np.zeros(len(det));inv[valid]=1/det[valid];s=origin-a;u=inv*np.einsum('ij,ij->i',s,h);q=np.cross(s,e1);v=inv*(q@direction);t=inv*np.einsum('ij,ij->i',e2,q);return t[valid&(u>=0)&(v>=0)&(u+v<=1)&(t>0)&(t<.45)]
target=local.copy();records=[];clearance=.002
for row in range(1,9):
 ids=rows[row];original=source[ids];center=original[:120].mean(0);theta=np.arctan2(original[:,2]-center[2],original[:,0]-center[0]);radii=np.linalg.norm(original[:,[0,2]]-center[[0,2]],axis=1);xaxis=np.array([1.,0,0]);normal=-np.cross(xaxis,tangent[row]);normal/=np.linalg.norm(normal)
 for column,index in enumerate(ids):
  ray=np.cos(theta[column])*xaxis+np.sin(theta[column])*normal;ray/=np.linalg.norm(ray);hits=rays(path[row],ray,bt);bodyBound=float(hits.max()+clearance)if len(hits)else 0.;topHits=rays(path[row],ray,tt);topAfter=topHits[topHits>=bodyBound-clearance];upper=float(topAfter.min()-clearance)if len(topAfter)else float('inf');seatBound=float('inf');originSeat=toSeat@np.r_[path[row],1];raySeat=toSeat[:3,:3]@ray
  if raySeat[1]<-1e-8:
   r=(seathi[1]+clearance-originSeat[1])/raySeat[1];q=originSeat[:3]+r*raySeat
   if r>0 and seatlo[0]<=q[0]<=seathi[0]and seatlo[2]<=q[2]<=seathi[2]:seatBound=float(r)
  upper=min(upper,seatBound);valid=bodyBound<=upper;desired=float(radii[column]);radius=max(bodyBound,min(desired,upper))if valid else bodyBound
  target[index]=path[row]+radius*ray;records.append({'row':row,'column':column,'vertex':int(index),'bodyBound':bodyBound,'upperBound':upper if np.isfinite(upper)else None,'seatBound':seatBound if np.isfinite(seatBound)else None,'sourceRadius':desired,'radius':radius,'feasible':bool(valid)})
# Actual turned hem follows the same deformed outer ring, 10mm material return
# and .8mm inset from original parameters; not a new hidden cloth thickness.
for col,index in enumerate(rows[9]):
 outer=target[rows[8,col]];radial=outer-path[8];radial/=np.linalg.norm(radial);target[index]=outer-tangent[8]*.01-radial*.0008
targetWorld=(np.c_[target,np.ones(len(target))]@hips.T)[:,:3];assert np.array_equal(targetWorld[:upperCount+20],(np.c_[local[:upperCount+20],np.ones(upperCount+20)]@hips.T)[:,:3])
edges=np.unique(np.sort(np.concatenate([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]]),axis=1),axis=0);oldEdge=np.linalg.norm(source[edges[:,0]]-source[edges[:,1]],axis=1);newEdge=np.linalg.norm(targetWorld[edges[:,0]]-targetWorld[edges[:,1]],axis=1);good=oldEdge>1e-5;ratios=newEdge[good]/oldEdge[good]
area=lambda p:np.linalg.norm(np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]]),axis=1)/2
oldArea=area(source);newArea=area(targetWorld);areaRatio=newArea[oldArea>1e-10]/oldArea[oldArea>1e-10];newLines=targetWorld[rows[:9,:120]];newLengths=np.linalg.norm(np.diff(newLines,axis=0),axis=2).sum(0)
report={'status':'one-author-target-awaiting-geometry-gate-not-a-morph','sourceSha256':sha(raw),'captureGzipSha256':sha(packed),'sourceBodySha256':sha(bodyRaw),'keptUpperAndBoundary':upperCount+20,'keptFirstLowerRow':121,'supportBodyTriangles':len(bodyFaces),'excludedArmTriangles':len(bi)-len(bodyFaces),'inputs':{'clearanceMetres':clearance,'note':'Authoring ray offset, not a new contact acceptance threshold','curveControlPointsHipsLocal':[p.tolist()for p in control],'sourceAxialMedianMetres':budget,'selectedThighDistanceMetres':distance},'infeasibleRays':sum(not x['feasible']for x in records),'records':records,'material':{'sourceAxialMinMedianMax':np.quantile(sourceLengths,[0,.5,1]).tolist(),'targetAxialMinMedianMax':np.quantile(newLengths,[0,.5,1]).tolist(),'edgeRatioMinMedianP95Max':np.quantile(ratios,[0,.5,.95,1]).tolist(),'triangleAreaRatioMinMedianP95Max':np.quantile(areaRatio,[0,.5,.95,1]).tolist(),'sourceArea':float(oldArea.sum()),'targetArea':float(newArea.sum()),'sourceRingCircumferences':[float(np.linalg.norm(np.diff(source[row],axis=0),axis=1).sum())for row in rows[:9]],'targetRingCircumferences':[float(np.linalg.norm(np.diff(targetWorld[row],axis=0),axis=1).sum())for row in rows[:9]]},'limits':['Offline one source pose only; no renderer/controller or inverse LBS installed','Body support excludes arm-weighted triangles only; final gate retains ALL body','Actual top/chair limits and ray feasibility are not full triangle/self acceptance','No normal-motion/transition/asymmetric/exit pass']}
O.mkdir();(O/'author-target.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');(O/'geometry.json.gz').write_bytes(gzip.compress(json.dumps({'positions':targetWorld.tolist(),'sourcePositions':source.tolist(),'triangles':tri.tolist(),'baselinePosed':posed.tolist(),'pose':'seated'}).encode(),mtime=0))
print(json.dumps({k:v for k,v in report.items()if k not in ['records','limits']},indent=2))
