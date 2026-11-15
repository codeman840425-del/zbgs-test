"""Read frozen source/native outputs only; no Blender/cloth evaluation."""
from pathlib import Path
import gzip,hashlib,importlib.util,json
import numpy as np
ROOT=Path(__file__).resolve().parents[1];R=ROOT/'experiments/m1-simple-skirt-worktree';A=R/'assets-source/m1/simple-skirt-v1/active-gap-hem-v1';O=A/'native-author-trial-v1'
spec=importlib.util.spec_from_file_location('space',ROOT/'scripts/audit-skirt-layer-space.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
packed=(A/'continuous-input-v1/capture.json.gz').read_bytes();assert hashlib.sha256(packed).hexdigest()=='e494fa798bd954554b430635f43d4aa4417d346aac6391511c08502daebc6d58';capture=json.loads(gzip.decompress(packed));body=next(x for x in capture['frames'][0]['colliders']if x['name']=='Bodybaked');bp=np.array(body['positions']).reshape(-1,3);bf=np.array(body['triangles']).reshape(-1,3);B=bp[bf]
prep=json.loads((O/'preparation.json').read_text());mapping=np.array(prep['renderToSim']);frame=json.loads(gzip.decompress((O/'frame-03.json.gz').read_bytes()));p=np.array(frame['positionsWorld']);d,a,sha=m.glb(A/'m1-sixfold-skirt-active-gap-hem-v1.glb');assert sha=='8e0887b54bf8849d789c4f91e85be0bd5a54c706d2e5343c0a4462639042f157';pr=d['meshes'][0]['primitives'];faces=np.concatenate([a(pr[0]['indices']).reshape(-1,3),a(pr[1]['indices']).reshape(-1,3)+162]);shared=sorted(int(v)for v in set(faces[770])&set(faces[773]));assert shared==[440,561];sim=mapping[shared];assert not set(sim)&set(prep['fixedVertices'])
def nearest(point):
 a=B[:,0];u=B[:,1]-a;v=B[:,2]-a;q=point-a;uu=(u*u).sum(1);uv=(u*v).sum(1);vv=(v*v).sum(1);qu=(q*u).sum(1);qv=(q*v).sum(1);den=uu*vv-uv*uv;good=abs(den)>1e-24;inv=np.divide(1,den,out=np.zeros_like(den),where=good);s=(qu*vv-qv*uv)*inv;t=(qv*uu-qu*uv)*inv;closest=a+s[:,None]*u+t[:,None]*v;dist=((point-closest)**2).sum(1);dist[~(good&(s>=0)&(t>=0)&(s+t<=1))]=np.inf
 for i,j in [(0,1),(1,2),(2,0)]:
  delta=B[:,j]-B[:,i];r=np.divide(((point-B[:,i])*delta).sum(1),(delta*delta).sum(1),out=np.zeros(len(delta)),where=(delta*delta).sum(1)>1e-24);q=B[:,i]+np.clip(r,0,1)[:,None]*delta;candidate=((point-q)**2).sum(1);mask=candidate<dist;closest[mask]=q[mask];dist=np.minimum(dist,candidate)
 i=int(dist.argmin());normal=np.cross(B[i,1]-B[i,0],B[i,2]-B[i,0]);normal/=np.linalg.norm(normal);return {'bodyFace':i,'distanceMetres':float(np.sqrt(dist[i])),'signedNearestNormalMetres':float((point-closest[i])@normal)}
def hits(first,second):
 out=[]
 for label,x,y in [('skirt',first,second),('body',second,first)]:
  for i in range(3):
   q=x[i];delta=x[(i+1)%3]-q;e1=y[1]-y[0];e2=y[2]-y[0];h=np.cross(delta,e2);det=e1@h
   if abs(det)<1e-15:continue
   s=q-y[0];u=s@h/det;c=np.cross(s,e1);v=delta@c/det;t=e2@c/det
   if 0<t<1 and 0<u and 0<v and u+v<1:out.append({'origin':label,'edge':i,'t':float(t),'barycentric':[float(1-u-v),float(u),float(v)]})
 return out
pairrows=[{'skirtFace':x,'bodyFace':y,'strictInteriorHits':hits(p[mapping[faces[x]]],B[y])}for x in [770,773]for y in [825,834]];assert all(len(x['strictInteriorHits'])==2 for x in pairrows)
edge=p[sim];samples=[{'t':t,**nearest(edge[0]*(1-t)+edge[1]*t)}for t in [0,1/3,.5,2/3,1]]
position=np.concatenate([a(x['attributes']['POSITION'])for x in pr]);uv=np.concatenate([a(x['attributes']['TEXCOORD_0'])for x in pr]);joints=np.concatenate([a(x['attributes']['JOINTS_0'])for x in pr]);weights=np.concatenate([a(x['attributes']['WEIGHTS_0'])for x in pr]);names=[d['nodes'][i]['name']for i in d['skins'][0]['joints']]
result={'scope':'Independent strict segment-triangle and finite edge sampling on saved frame03; no new source or simulation','sourceSha256':sha,'captureGzipSha256':hashlib.sha256(packed).hexdigest(),'actualAuthorFrame':3,'bodyTriangles':{str(i):{'indices':bf[i].tolist(),'world':B[i].tolist()}for i in [825,834]},'pairRows':pairrows,'sharedEdge':{'render':shared,'sim':sim.tolist(),'fixed':False,'world':edge.tolist(),'lengthMetres':float(np.linalg.norm(edge[1]-edge[0])),'source':position[shared].tolist(),'uv':uv[shared].tolist(),'weights':[{names[int(j)]:float(w)for j,w in zip(joints[i],weights[i])if w>0}for i in shared],'samples':samples},'proposedBoundedTrial':{'operation':'Split only sharededge440-561 into3segments in SOURCE; split both incident triangles770/773 conformingly into3 each; no smoothing or projection','addedVertices':2,'addedTriangles':4,'bindSurfaceCoplanarOnly':True,'posedNewLbsPointNotGuaranteedOnOldSkinnedEdge':True,'noImmediateCrossingCure':True,'preserveOriginal120AndBoundary20':True,'sourceRestNotFailedOutput':True,'needSameFrozenFirst3ThenFullSequence':True}}
(ROOT/'evidence/author-first-crossing-independent.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'pairsCertified':len(pairrows),'edge':shared,'edgeLength':result['sharedEdge']['lengthMetres'],'samples':samples,'weights':result['sharedEdge']['weights']},indent=2))

