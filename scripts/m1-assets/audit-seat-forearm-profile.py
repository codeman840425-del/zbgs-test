"""Read-only semantic forearm surface sizing for fitSeatHands implementation.
No runtime modifications or browser. Actual source primitive index match required.
"""
import hashlib,json,pathlib,struct
import numpy as np
R=pathlib.Path(__file__).resolve().parents[2];S=R/'prototype/public/assets/foundation/base-female-roundtrip.vrm';raw=S.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);binary=raw[28+n:]
def acc(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize))
c=json.loads((R/'experiments/skirt-offline-corrective/capture-ca72ada827d2/capture.json').read_text(encoding='utf8'));bb=next(x for x in c['topology']['colliders']if x['name']=='Bodybaked');idx=np.array(bb['triangles']).reshape(-1,3);match=None
for mi,m in enumerate(d['meshes']):
 for p in m['primitives']:
  ii=acc(p['indices']).reshape(-1,3)
  if ii.shape==idx.shape and np.array_equal(ii,idx):match=(mi,p)
assert match;mi,p=match;node=next(x for x in d['nodes']if x.get('mesh')==mi);skin=d['skins'][node['skin']];names=[d['nodes'][i]['name']for i in skin['joints']];ibm=acc(skin['inverseBindMatrices']);pos=acc(p['attributes']['POSITION']);j=acc(p['attributes']['JOINTS_0']);w=acc(p['attributes']['WEIGHTS_0']);out=[]
for side in ['L','R']:
 li=names.index('J_Bip_'+side+'_LowerArm');hi=names.index('J_Bip_'+side+'_Hand');a=np.linalg.inv(ibm[li].reshape(4,4).T)[:3,3];h=np.linalg.inv(ibm[hi].reshape(4,4).T)[:3,3];axis=h-a;length=np.linalg.norm(axis);axis/=length;u=(pos-a)@axis/length;radius=np.linalg.norm(pos-a-u[:,None]*length*axis,axis=1);mask=(np.where(j==li,w,0).sum(axis=1)>.5)&(u>=0)&(u<=1)&np.isin(np.arange(len(pos)),np.unique(idx));row={'side':side,'length':float(length),'samples':int(sum(mask)),'radiusP50':float(np.median(radius[mask])),'radiusP95':float(np.percentile(radius[mask],95)),'radiusMax':float(max(radius[mask])),'sections':[]}
 for lo,hi in zip(np.arange(0,1,.2),np.arange(.2,1.2,.2)):
  use=mask&(u>=lo)&(u<hi)
  if any(use):row['sections'].append({'from':float(lo),'to':float(hi),'maxRadius':float(max(radius[use])),'p95':float(np.percentile(radius[use],95))})
 if side=='L':row['failedFaces']=[{'face':f,'axialFractions':u[idx[f]].tolist(),'radii':radius[idx[f]].tolist()}for f in [3556,3557,3792,3794]]
 out.append(row)
result={'method':'Actual body primitive exact index match; vertex lower-arm weight>.5, within elbow-wrist bind interval; inverse bind bone origins; source metres. These are actual source geometry radii, not posed collision proof. Failed elbow-adjacent faces also recorded outside axial interval.','sourceSHA256':hashlib.sha256(raw).hexdigest(),'currentMotionSHA256':hashlib.sha256((R/'prototype/src/motion.js').read_bytes()).hexdigest(),'currentRailRadius':.012,'currentRailMargin':.008,'profiles':out}
(R/'assets-source/m1/offline-corrective/ring-cage-v1/forearm-profile-audit.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps([{'side':x['side'],'length':x['length'],'radiusP95':x['radiusP95'],'radiusMax':x['radiusMax']}for x in out]))
