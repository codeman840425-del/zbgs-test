"""Source-only semantic arm envelopes. No runtime edits or browser required.
Metres in glTF mesh bind coordinates; joint origins from inverse bind matrices.
"""
import hashlib,json,pathlib,struct
import numpy as np

ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'assets-source/forearm-collision-v1'
def sha(b): return hashlib.sha256(b).hexdigest()
def clip(poly,origin,axis,level,keep_below):
 out=[]
 for a,b in zip(poly,np.roll(poly,-1,axis=0)):
  da=(a-origin)@axis-level;db=(b-origin)@axis-level
  ina=da<=0 if keep_below else da>=0;inb=db<=0 if keep_below else db>=0
  if ina:out.append(a)
  if ina!=inb:out.append(a+(b-a)*da/(da-db))
 return np.array(out)
def load(sex):
 path=ROOT/f'prototype/public/assets/foundation/base-{sex}-roundtrip.vrm'
 raw=path.read_bytes(); n=struct.unpack_from('<I',raw,12)[0]
 d=json.loads(raw[20:20+n]); binary=raw[28+n:]
 def acc(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']]
  dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
  return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 matches=[(mi,pi,p) for mi,m in enumerate(d['meshes']) for pi,p in enumerate(m['primitives']) if '_Body_' in d['materials'][p['material']]['name'] and d['materials'][p['material']]['name'].endswith('_SKIN')]
 assert len(matches)==1
 mi,pi,p=matches[0];node=next(n for n in d['nodes'] if n.get('mesh')==mi);skin=d['skins'][node['skin']]
 return {'path':path,'sha':sha(raw),'d':d,'p':p,'mesh':mi,'primitive':pi,'skin':skin,'ibm':acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1),'pos':acc(p['attributes']['POSITION']).astype(float),'j':acc(p['attributes']['JOINTS_0']),'w':acc(p['attributes']['WEIGHTS_0']).astype(float),'tri':acc(p['indices']).reshape(-1,3),'humanoid':{b['bone']:b['node'] for b in d['extensions']['VRM']['humanoid']['humanBones']}}

def prepare(src,side):
 joints=src['skin']['joints']; lower=joints.index(src['humanoid'][side+'LowerArm']);hand=joints.index(src['humanoid'][side+'Hand'])
 elbow=np.linalg.inv(src['ibm'][lower])[:3,3];wrist=np.linalg.inv(src['ibm'][hand])[:3,3]
 axis=wrist-elbow;length=np.linalg.norm(axis);axis/=length
 weights=np.where(src['j']==lower,src['w'],0).sum(axis=1)
 faces=np.flatnonzero((weights[src['tri']]>.5).any(axis=1));ids=np.unique(src['tri'][faces])
 delta=src['pos']-elbow;u=delta@axis/length;rad=np.linalg.norm(delta-u[:,None]*length*axis,axis=1)
 return lower,elbow,wrist,axis,length,weights,faces,ids,u,rad

def build(sex):
 src=load(sex);profiles=[]
 for side in ['left','right']:
  lower,a,b,axis,length,weights,faces,ids,u,rad=prepare(src,side)
  knots=np.linspace(0,1,6);bands=[]
  for lo,hi in zip(knots[:-1],knots[1:]):
   # Any source triangle crossing this axial slab contributes ALL its vertices.
   # Radius norm is convex: this deliberately overbounds every point of the face.
   fs=src['tri'][faces]; use=fs[(u[fs].min(axis=1)<=hi)&(u[fs].max(axis=1)>=lo)]
   bands.append(float(rad[np.unique(use)].max()))
  radii=[bands[0]]+[max(bands[i-1:i+1]) for i in range(1,5)]+[bands[-1]]
  proximal=src['tri'][faces][u[src['tri'][faces]].min(axis=1)<0]
  distal=src['tri'][faces][u[src['tri'][faces]].max(axis=1)>1]
  # Clip crossing triangles at elbow/wrist plane, then bound every polygon
  # vertex. Norm convexity covers the entire clipped polygon without pulling
  # the opposite (inside-tube) end of a long triangle into an oversized cap.
  ep=np.concatenate([clip(src['pos'][t],a,axis,0,True)for t in proximal]) if len(proximal) else np.empty((0,3))
  wp=np.concatenate([clip(src['pos'][t],a,axis,length,False)for t in distal]) if len(distal) else np.empty((0,3))
  er=float(np.linalg.norm(ep-a,axis=1).max()) if len(ep) else radii[0]
  wr=float(np.linalg.norm(wp-b,axis=1).max()) if len(wp) else radii[-1]
  profiles.append({'side':side,'semanticStart':side+'LowerArm','semanticEnd':side+'Hand','sourceJointNode':src['skin']['joints'][lower],'sourceJointName':src['d']['nodes'][src['skin']['joints'][lower]]['name'],'sourceInverseBindMatrixColumnMajor':src['ibm'][lower].T.ravel().tolist(),'bindElbow':a.tolist(),'bindWrist':b.tolist(),'bindAxis':axis.tolist(),'length':float(length),'sourceFaceIndices':faces.tolist(),'sourceVertexIndices':ids.tolist(),'sourceAxialRange':[float(u[ids].min()),float(u[ids].max())],'knots':[{'t':float(t),'radius':float(r)} for t,r in zip(knots,radii)],'slabRawRadiusMax':bands,'elbowCap':{'centerT':0,'radius':er},'wristCap':{'centerT':1,'radius':wr},'clearanceMargin':0,'radiusSummary':{'p50':float(np.percentile(rad[ids],50)),'p95':float(np.percentile(rad[ids],95)),'max':float(rad[ids].max())}})
 out={'schema':'m1.semantic-forearm-envelope.1','body':sex,'source':src['path'].relative_to(ROOT).as_posix(),'bodySHA256':src['sha'],'applicability':'Exact body SHA only; regenerate for shape morph or different body. Runtime uniform scale scales lengths/radii; nonuniform scaling requires ellipsoid handling.','units':'metres','coordinate':'Source glTF mesh bind coordinates, no VRM0 world conversion applied. Runtime constructs centerline from actual world LowerArm/Hand; radii are orientation independent.','primitive':{'mesh':src['mesh'],'primitive':src['primitive'],'indexSHA256':sha(src['tri'].astype('<u4').tobytes())},'selection':'All actual Body_SKIN triangles touching a vertex with semantic LowerArm weight >0.5; includes full boundary triangles. No garment thickness.','representation':'Piecewise linear radius on t=0..1 centerline plus spherical elbow and wrist caps. Each slab radius bounds every vertex of every selected triangle intersecting it. Adjacent knot maxima preserve that bound. Endcaps bound exact clipped source polygon beyond each endpoint plane.','limits':['Bind-space selected triangles are conservatively enclosed; arbitrary posed blend deformation is not proven enclosed.','Rotationally symmetric envelope covers empty space and may push arms too far from clothing, especially elbow cap.','Does not assert collision-free clothing, continuous collision detection, or a feasible arm pose.','Hands/palm beyond selected wrist boundary require their own profile; upper arm outside elbow boundary is excluded.','No fixed 8mm clearance baked into measured envelope; integration chooses explicit garment clearance separately.'],'profiles':profiles}
 OUT.mkdir(parents=True,exist_ok=True);(OUT/(sex+'.json')).write_text(json.dumps(out,indent=2),encoding='utf8')
 return out

if __name__=='__main__':
 for sex in ['female','male']:
  p=build(sex);print(json.dumps({'body':sex,'sha':p['bodySHA256'],'arms':[{'side':x['side'],'length':x['length'],'knots':x['knots'],'elbowCap':x['elbowCap'],'wristCap':x['wristCap']}for x in p['profiles']]}))
