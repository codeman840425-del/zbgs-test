"""One source-only finite elliptical-cylinder profile per hand/finger bone.
Includes all assigned source triangle corners and true axial extrema (tip/endcap).
Not a proof of arbitrary posed blended skin containment. Runtime QA decides that.
"""
from pathlib import Path
import importlib.util,json,hashlib,argparse
import numpy as np
R=Path(__file__).resolve().parents[3];O=R/'assets-source/hand-joint-contact-v1';O.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('arm',R/'scripts/m1-assets/build-forearm-collision-profile.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
parser=argparse.ArgumentParser();parser.add_argument('--source');parser.add_argument('--output',default='female.profile.json');args=parser.parse_args()
s=g.load('female',source_path=args.source)
profiles=[];all_faces=set()
for side in ['left','right']:
 names=[side+'Hand']+[side+finger+part for finger in ['Thumb','Index','Middle','Ring','Little']for part in (['Metacarpal','Proximal','Distal']if finger=='Thumb'else['Proximal','Intermediate','Distal'])]
 # Source is VRM0: three-vrm remaps old ThumbProximal/Intermediate to
 # normalized/raw semantic ThumbMetacarpal/Proximal. Keep runtime names explicit.
 source_names=[n.replace('ThumbMetacarpal','ThumbProximal')if'ThumbMetacarpal'in n else n.replace('ThumbProximal','ThumbIntermediate')if'ThumbProximal'in n else n for n in names]
 joints=[s['skin']['joints'].index(s['humanoid'][n])for n in source_names]
 scores=np.stack([np.where(s['j']==joint,s['w'],0).sum(axis=1)for joint in joints],axis=1)
 face_scores=scores[s['tri']].mean(axis=1);faces=np.flatnonzero(face_scores.sum(axis=1)>=.25);labels=face_scores.argmax(axis=1);all_faces.update(faces.tolist())
 for i,(name,joint)in enumerate(zip(names,joints)):
  fs=faces[labels[faces]==i];ids=np.unique(s['tri'][fs]);assert len(ids)>3
  pos=(s['ibm'][joint]@np.column_stack([s['pos'][ids],np.ones(len(ids))]).T).T[:,:3]
  origin=pos.mean(axis=0);cov=np.cov((pos-origin).T);_,axes=np.linalg.eigh(cov);axis=axes[:,2];u=axes[:,1]
  if axis[np.argmax(abs(axis))]<0:axis=-axis
  if u[np.argmax(abs(u))]<0:u=-u
  v=np.cross(axis,u);v/=np.linalg.norm(v);u=np.cross(v,axis)
  xyz=np.stack([(pos-origin)@axis,(pos-origin)@u,(pos-origin)@v],axis=1)
  center=(xyz.min(axis=0)+xyz.max(axis=0))/2;origin+=axis*center[0]+u*center[1]+v*center[2];xyz-=center
  radius=np.max(abs(xyz[:,1:]),axis=0);assert np.all(radius>1e-6)
  ellipse_scale=np.max(np.linalg.norm(xyz[:,1:]/radius,axis=1));radius*=ellipse_scale
  tmin,tmax=float(xyz[:,0].min()),float(xyz[:,0].max())
  assert np.max(np.linalg.norm(xyz[:,1:]/radius,axis=1))<=1+1e-12
  foreign=1-np.where(s['j'][ids]==joint,s['w'][ids],0).sum(axis=1)
  profiles.append({'side':side,'semantic':name,'joint':joint,'sourceNode':s['skin']['joints'][joint],'sourceInverseBindMatrix':s['ibm'][joint].T.ravel().tolist(),'origin':origin.tolist(),'axis':axis.tolist(),'u':u.tolist(),'v':v.tolist(),'tmin':tmin,'tmax':tmax,'radiusU':float(radius[0]),'radiusV':float(radius[1]),'sourceFaces':fs.tolist(),'sourceVertices':ids.tolist(),'mixedVertices':[int(k)for k,f in zip(ids,foreign)if f>1e-5],'maxForeignWeight':float(foreign.max()),'endcaps':{'kind':'finite ellipse at measured axial extrema, no extrapolated joint endpoint','proximal':(origin+axis*tmin).tolist(),'distal':(origin+axis*tmax).tolist()},'sourceMaxEllipseNorm':float(np.max(np.linalg.norm(xyz[:,1:]/radius,axis=1)))})
result={'schema':'m1.semantic-joint-hand-envelope.1','bodySHA256':s['sha'],'source':str(s['path'].relative_to(R)),'units':'metres','coordinates':'actual raw glTF bone local via inverse bind; transform using current raw bone matrixWorld','sourceIndexSHA256':hashlib.sha256(s['tri'].astype('<u4').tobytes()).hexdigest(),'sourceFaces':sorted(all_faces),'profiles':profiles,'limits':['Bind assigned triangles enclosed by measured convex finite elliptical cylinder. Current posed mixed skin is not proved enclosed.','Runtime five finite longitudinal rails include endpoint samples only: this is NOT continuous cylinder/cap collision.','No scale inflation or source motion editing; only original female opted in; exact actual skin gate mandatory.'],'qa':{'sourceFaceCount':len(all_faces),'jointEnvelopes':len(profiles),'nominalRailsPerHand':80,'fingerMotionSource':'UAL1 Sitting Enter/Exit mapped finger channels preserved'}}
(O/args.output).write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps({'bodySHA256':s['sha'],'faces':len(all_faces),'envelopes':len(profiles),'railsPerHand':80,'maxMixedWeight':max(p['maxForeignWeight']for p in profiles),'maxRadii':max(max(p['radiusU'],p['radiusV'])for p in profiles),'output':str(O/args.output)}))
