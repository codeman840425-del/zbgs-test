"""Read-only original/export abdominal coverage audit; no GPU or asset mutation."""
from pathlib import Path
import json,struct,hashlib,io,collections
import numpy as np
from scipy.spatial import cKDTree
from PIL import Image
R=Path('F:/gamemake');OUT=Path(__file__).resolve().parents[3]/'assets-source/m1/simple-skirt-v1/abdomen-coverage-audit-v1';OUT.mkdir(exist_ok=True)
def load(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);binary=raw[28+n:]
 def read(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
  return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 return {'d':d,'read':read,'binary':binary,'path':str(path),'sha256':hashlib.sha256(raw).hexdigest()}
def weights(a,skin,J,W):
 names=[a['d']['nodes'][j]['name']for j in a['d']['skins'][skin]['joints']]
 return [{names[int(j)]:float(w)for j,w in zip(js,ws)if w>1e-8}for js,ws in zip(J,W)]
def alpha(a,p):
 d=a['d'];m=d['materials'][p['material']];tx=m['pbrMetallicRoughness']['baseColorTexture']['index'];im=d['images'][d['textures'][tx]['source']];v=d['bufferViews'][im['bufferView']];b=a['binary'][v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];img=np.array(Image.open(io.BytesIO(b)).convert('RGBA'));return {'imageSha256':hashlib.sha256(b).hexdigest(),'alphaMinMax':[int(img[:,:,3].min()),int(img[:,:,3].max())],'transparentPixels':int((img[:,:,3]<128).sum()),'material':m,'image':img}
orig=load(R/'prototype/public/assets/foundation/base-female.vrm');rt=load(R/'prototype/public/assets/foundation/base-female-roundtrip.vrm');top=load(R/'prototype/public/assets/m1/m1-uniform-top.glb')
report={'scope':'read-only source/export and two actual sampled ray hits; not all animation collision acceptance','inputs':{k:{q:a[q]for q in ['path','sha256']}for k,a in [('original',orig),('roundtrip',rt),('independentTop',top)]},'originalCoverageDeclarations':{'firstPerson':orig['d']['extensions']['VRM']['firstPerson']['meshAnnotations'],'bodyBlendShapeBinds':[g for g in orig['d']['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']if any(b['mesh']==1 for b in g.get('binds',[]))]},'export':[],'faces':[],'originalRoundtrip':{}}
for si,ti in [(1,0),(2,1)]:
 sp=rt['d']['meshes'][0]['primitives'][si];tp=top['d']['meshes'][0]['primitives'][ti];I=rt['read'](sp['indices']).reshape(-1,3);used=np.unique(I);lookup=np.full(rt['read'](sp['attributes']['POSITION']).shape[0],-1);lookup[used]=np.arange(len(used));st={k:rt['read'](v)[used]for k,v in sp['attributes'].items()};tt={k:top['read'](v)for k,v in tp['attributes'].items()};wa=weights(rt,0,st['JOINTS_0'],st['WEIGHTS_0']);wb=weights(top,0,tt['JOINTS_0'],tt['WEIGHTS_0']);weightMax=max(max(abs(a.get(k,0)-b.get(k,0))for k in set(a)|set(b))for a,b in zip(wa,wb));namesA=[rt['d']['nodes'][j]['name']for j in rt['d']['skins'][0]['joints']];namesB=[top['d']['nodes'][j]['name']for j in top['d']['skins'][0]['joints']];ia=rt['read'](rt['d']['skins'][0]['inverseBindMatrices']);ib=top['read'](top['d']['skins'][0]['inverseBindMatrices']);invMax=max(float(np.max(np.abs(ib[i]-ia[namesA.index(n)])))for i,n in enumerate(namesB));report['export'].append({'primitive':ti,'usedVertices':len(used),'faces':len(I),'indexExact':bool(np.array_equal(lookup[I],top['read'](tp['indices']).reshape(-1,3))),'attributesMaxDifference':{k:float(np.max(np.abs(st[k]-tt[k])))for k in st if k not in ['JOINTS_0','WEIGHTS_0']},'weightMaxSemanticDifference':weightMax,'inverseBindMaxDifference':invMax})
for role,omi,rmi,opis,rpis,faceids in [('body',1,0,[0,1,2,3],[0],[657,610]),('top',1,0,[4],[1],[957,956])]:
 op=orig['d']['meshes'][omi]['primitives'][opis[0]];rp=rt['d']['meshes'][rmi]['primitives'][rpis[0]];OP=orig['read'](op['attributes']['POSITION']);RP=rt['read'](rp['attributes']['POSITION']);OI=np.concatenate([orig['read'](orig['d']['meshes'][omi]['primitives'][i]['indices']).reshape(-1,3)for i in opis]);RI=np.concatenate([rt['read'](rt['d']['meshes'][rmi]['primitives'][i]['indices']).reshape(-1,3)for i in rpis]);usedO=np.unique(OI);usedR=np.unique(RI);dist,nearest=cKDTree(OP[usedO]).query(RP[usedR]);aa=alpha(orig,op);ar=alpha(rt,rp);report['originalRoundtrip'][role]={'originalFaces':len(OI),'roundtripFaces':len(RI),'usedRoundtripToOriginalMaxPositionM':float(max(dist)),'originalAlpha':{k:v for k,v in aa.items()if k!='image'},'roundtripAlpha':{k:v for k,v in ar.items()if k!='image'}}
 if role=='top':
  pr=top['d']['meshes'][0]['primitives'][0];P=top['read'](pr['attributes']['POSITION']);F=top['read'](pr['indices']).reshape(-1,3);J=top['read'](pr['attributes']['JOINTS_0']);W=top['read'](pr['attributes']['WEIGHTS_0']);A=top;UV=top['read'](pr['attributes']['TEXCOORD_0'])
 else:P=RP;F=RI;J=rt['read'](rp['attributes']['JOINTS_0']);W=rt['read'](rp['attributes']['WEIGHTS_0']);A=rt;UV=rt['read'](rp['attributes']['TEXCOORD_0'])
 for f in faceids:
  ids=F[f];v=P[ids];center=v.mean(0);oc=OP[OI].mean(1);candidates=np.argsort(np.linalg.norm(oc-center,axis=1))[:12];err=[max(cKDTree(OP[OI[i]]).query(v)[0])for i in candidates];best=int(candidates[int(np.argmin(err))]);report['faces'].append({'role':role,'face':f,'vertices':ids.tolist(),'positions':v.tolist(),'centroid':center.tolist(),'uv':UV[ids].tolist(),'weights':weights(A,0,J[ids],W[ids]),'originalMatchingFaceInMergedMaterial':best,'originalFaceMaxVertexDifferenceM':float(min(err)),'originalPositions':OP[OI[best]].tolist()})
# Read original source weights at the same located vertices, including duplicated UV vertices.
oskin=next(n['skin']for n in orig['d']['nodes']if n.get('mesh')==1)
for face in report['faces']:
 oi=0 if face['role']=='body'else 4;op=orig['d']['meshes'][1]['primitives'][oi];OP=orig['read'](op['attributes']['POSITION']);OUV=orig['read'](op['attributes']['TEXCOORD_0']);OJ=orig['read'](op['attributes']['JOINTS_0']);OW=orig['read'](op['attributes']['WEIGHTS_0']);mapped=[]
 for pos,uv in zip(face['positions'],face['uv']):mapped.append(int(np.argmin(np.linalg.norm(OP-pos,axis=1)+np.linalg.norm(OUV-uv,axis=1))))
 ow=weights(orig,oskin,OJ[mapped],OW[mapped]);face['originalWeights']=ow;face['originalWeightSemanticMaxDifference']=max(max(abs(a.get(k,0)-b.get(k,0))for k in set(a)|set(b))for a,b in zip(face['weights'],ow))
# Rest forward ray at each body centroid, source coordinate front=-Z, no posed inference.
pr=top['d']['meshes'][0]['primitives'][0];P=top['read'](pr['attributes']['POSITION']);F=top['read'](pr['indices']).reshape(-1,3);tri=P[F];report['restCoverageRays']=[]
for face in report['faces']:
 if face['role']!='body':continue
 c=np.array(face['centroid']);v0=tri[:,1,:2]-tri[:,0,:2];v1=tri[:,2,:2]-tri[:,0,:2];v2=c[:2]-tri[:,0,:2];det=v0[:,0]*v1[:,1]-v0[:,1]*v1[:,0];valid=abs(det)>1e-12;u=np.zeros(len(F));v=u.copy();u[valid]=(v2[valid,0]*v1[valid,1]-v2[valid,1]*v1[valid,0])/det[valid];v[valid]=(v0[valid,0]*v2[valid,1]-v0[valid,1]*v2[valid,0])/det[valid];inside=valid&(u>=0)&(v>=0)&(u+v<=1);z=tri[:,0,2]+u*(tri[:,1,2]-tri[:,0,2])+v*(tri[:,2,2]-tri[:,0,2]);ids=np.flatnonzero(inside&(z<c[2]));hits=[{'topFace':int(i),'outwardClearanceM':float(c[2]-z[i]),'barycentric':[float(1-u[i]-v[i]),float(u[i]),float(v[i])]}for i in ids];hits.sort(key=lambda x:x['outwardClearanceM']);report['restCoverageRays'].append({'bodyFace':face['face'],'hits':hits})
ray=json.loads((R/'evidence/garment-visible-hits-a491-source/report.json').read_text(encoding='utf-8'));report['actualRays']=[]
for row in ray['rows']:
 for s in row['samples']:
  hs=[h for h in s['hits']if(h.get('mesh')=='Bodybaked'and h.get('face')in[657,610])or(h.get('role')=='top'and h.get('face')in[957,956])]
  if hs:report['actualRays'].append({'pose':row['label'],'sample':s['name'],'hits':hs})
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'export':report['export'],'sourceMatch':{k:{q:v[q]for q in ['originalFaces','roundtripFaces','usedRoundtripToOriginalMaxPositionM']}for k,v in report['originalRoundtrip'].items()},'alpha':{k:[v['originalAlpha']['alphaMinMax'],v['originalAlpha']['transparentPixels']]for k,v in report['originalRoundtrip'].items()},'faces':[{'role':x['role'],'face':x['face'],'centroid':x['centroid'],'originalMatchError':x['originalFaceMaxVertexDifferenceM']}for x in report['faces']]}))
