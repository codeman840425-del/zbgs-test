import pathlib,json,struct,gzip,hashlib,sys,math
import numpy as np
from scipy.optimize import linprog
P=pathlib.Path(__file__).resolve().parents[1];R=P.parents[1];O=P/'generated';O.mkdir(exist_ok=True)
E=json.loads((P/'environment.json').read_text(encoding='utf-8'))
for name,expected in E['profileInputs'].items():
 assert hashlib.sha256((P/'input-269'/name).read_bytes()).hexdigest()==expected,'Input identity mismatch: '+name
asset=R/'prototype/public/assets/m1c/studio-glasses-v1.glb';buf=asset.read_bytes();assert hashlib.sha256(buf).hexdigest()==E['sourceAccessorySHA256'],'Source glasses identity mismatch'
n=struct.unpack_from('<I',buf,12)[0];g=json.loads(buf[20:20+n]);binary=buf[28+n:]
def access(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];assert not v.get('byteStride');dims={'VEC3':3,'SCALAR':1};dt={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']];return np.frombuffer(binary,dtype=dt,count=a['count']*dims[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],dims[a['type']]).copy()
sources={m['name']:access(m['primitives'][0]['attributes']['POSITION'])for m in g['meshes']if m['name'].startswith('Temple')}
def transform(a,m):return(np.c_[a,np.ones(len(a))]@m.T)[:,:3]
def rotation(a,b):
 a=a/np.linalg.norm(a);b=b/np.linalg.norm(b);v=np.cross(a,b);c=a@b;K=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]);return np.eye(3)+K+K@K/(1+c)
profiles=[]
for body in ['female','male']:
 p=P/f'input-269/{body}-stand.json.gz';d=json.loads(gzip.decompress(p.read_bytes()));iv=np.linalg.inv(np.array(d['glassesMatrix']).reshape(4,4).T);scale=np.linalg.norm(np.array(d['glassesMatrix'])[:3]);ts=[];face=None
 for m in d['meshes']:
  if m['role']=='skin':
   vertices=transform(np.array(m['positions']),iv);ts.extend(vertices[np.array(m['triangles'])]);
   if 'Face'in m['name']:face=vertices[np.unique(np.array(m['triangles']).ravel())]
 t=np.array(ts);a=t[:,0,1:];u=t[:,1,1:]-a;v=t[:,2,1:]-a;den=u[:,0]*v[:,1]-u[:,1]*v[:,0]
 def surface(y,z,sign):
  q=np.array([y,z])-a;ok=np.abs(den)>1e-14;b=np.zeros(len(t));c=b.copy();b[ok]=(q[ok,0]*v[ok,1]-q[ok,1]*v[ok,0])/den[ok];c[ok]=(u[ok,0]*q[ok,1]-u[ok,1]*q[ok,0])/den[ok];ok&=(b>=-1e-8)&(c>=-1e-8)&(b+c<=1+1e-8);x=(t[:,0,0]+b*(t[:,1,0]-t[:,0,0])+c*(t[:,2,0]-t[:,0,0]))*sign;return max(x[ok],default=0)
 controls=[]
 for sign in [-1,1]:
  name='Temple'+str(sign);old=np.array([[sign*.059,0,0],[sign*.062,0,-.025],[sign*.060,-.001,-.105],[sign*.055,-.012,-.117]])
  # Current exact source-family ear patch; explicit bounded selection, not arbitrary heads.
  ear=face[(face[:,0]*sign>.072)&(face[:,2]<-.065)];crest=ear[np.argmax(ear[:,1])];new=old.copy();new[2]=[crest[0],crest[1]+.00135+.0004/scale,crest[2]];new[3]=[sign*.067,crest[1]-.009,ear[:,2].min()-.009]
  A=[];B=[]
  for seg in range(3):
   for j in range(65):
    q=j/64;point=new[seg]*(1-q)+new[seg+1]*q;sx=surface(point[1],point[2],sign)
    if sx<=0:continue
    w=np.zeros(4);w[seg]=1-q;w[seg+1]=q;A.append(-w[1:]);B.append(-(sx+.00135+.00035/scale-w[0]*.059))
  result=linprog([1,1,1],A_ub=A,b_ub=B,bounds=[(.061,.085),(.072,.09),(.058,.09)],method='highs');assert result.success,result.message;new[1:,0]=result.x*sign
  original=sources[name];assert original.shape==(36,3);fitted=original.astype(np.float64).copy();rings=[]
  for k in range(4):
   tangent=lambda pts: (pts[min(3,k+1)]-pts[max(0,k-1)])
   rot=rotation(tangent(old),tangent(new));ids=list(range(k*9,(k+1)*9));fitted[ids]=(original[ids]-old[k])@rot.T+new[k];rings.append({'indices':ids,'sourceCenter':old[k].tolist(),'targetCenter':new[k].tolist(),'rotationRowMajor':rot.ravel().tolist()})
  controls.append({'mesh':name,'positionSHA256':hashlib.sha256(original.astype('<f4').tobytes()).hexdigest(),'vertices':36,'rings':rings,'earCrestAccessoryLocal':crest.tolist(),'earBounds':[ear.min(axis=0).tolist(),ear.max(axis=0).tolist()]})
  print(body,name,'new',new.tolist(),'maxMoveWorldmm',np.linalg.norm(fitted-original,axis=1).max()*scale*1000)
 profile={'schema':'m1.glasses-temple-fit.1','id':f'{body}-temple-fit-v1','bodySHA256':d['live']['avatarSha256'],'accessorySHA256':hashlib.sha256(buf).hexdigest(),'units':'metres in original accessory GLB mesh coordinates before whole-frame fit scale','controls':controls,'limits':['Exact F/M original identity only. Authored finite 4-ring fit, not arbitrary head adaptation.','Original frame, hinge, bridge, source GLB and topology preserved; changed temple positions require this versioned fit identity.','Ear upper contact and rear-hook clearance require actual posed geometry and normal-speed visual review.']}
 dest=O/f'{body}.json';dest.write_text(json.dumps(profile,indent=2)+'\n',encoding='utf-8');profiles.append({'body':body,'url':f'/assets/m1c/glasses-fit/{body}.json','sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size,'bodySHA256':profile['bodySHA256']})
 for pose in ['stand','sit']:
  d=json.loads(gzip.decompress((P/f'input-269/{body}-{pose}.json.gz').read_bytes()));mat=np.array(d['glassesMatrix']).reshape(4,4).T
  for ctrl in controls:
   m=next(m for m in d['meshes']if m['name']==ctrl['mesh']);orig=sources[ctrl['mesh']];fit=orig.astype(float).copy()
   for c in ctrl['rings']:
    ids=c['indices'];rot=np.array(c['rotationRowMajor']).reshape(3,3);fit[ids]=(orig[ids]-c['sourceCenter'])@rot.T+c['targetCenter']
   m['positions']=transform(fit,mat).tolist()
  (O/'offline-candidate').mkdir(exist_ok=True);(O/f'offline-candidate/{body}-{pose}.json.gz').write_bytes(gzip.compress(json.dumps(d).encode(),compresslevel=1,mtime=0))
(O/'manifest.json').write_text(json.dumps({'schema':'m1.glasses-temple-fit-manifest.1','profiles':profiles},indent=2)+'\n',encoding='utf-8')
