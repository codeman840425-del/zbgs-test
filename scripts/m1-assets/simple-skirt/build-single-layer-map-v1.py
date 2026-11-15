"""Authoring-only surface map; original render asset bytes are never edited."""
from pathlib import Path
import hashlib
R=Path(__file__).resolve().parents[3];src=R/'scripts/m1-assets/simple-skirt/diagnose-two-quad-dynamic.py';exec(compile(src.read_text().split('initialRender=')[0],str(src),'exec'),globals())
D=A/'single-layer-author-v1';assert not(D/'mapping.json').exists();D.mkdir(exist_ok=True);P=posed(cap['frames'][0])[representatives];innerRender=np.arange(counts[0]+1109,counts[0]+1230);inner=np.unique(mapping[innerRender]);keep=np.setdiff1d(np.arange(len(P)),inner);faceMask=~np.any(np.isin(faces,inner),axis=1);authorFaces=faces[faceMask];assert np.all(lineage[~faceMask]>=2180)and len(inner)==120
T=P[authorFaces];v0=T[:,1]-T[:,0];v1=T[:,2]-T[:,0];d00=np.einsum('ij,ij->i',v0,v0);d01=np.einsum('ij,ij->i',v0,v1);d11=np.einsum('ij,ij->i',v1,v1);den=d00*d11-d01*d01;records=[];errors=[]
for idx in inner:
 q=P[idx];v2=q-T[:,0];d20=np.einsum('ij,ij->i',v2,v0);d21=np.einsum('ij,ij->i',v2,v1);b=(d11*d20-d01*d21)/den;c=(d00*d21-d01*d20)/den;a=1-b-c;valid=(a>=0)&(b>=0)&(c>=0);proj=T[:,0]+b[:,None]*v0+c[:,None]*v1;dist=np.linalg.norm(proj-q,axis=1);dist[~valid]=np.inf;barys=np.stack([a,b,c],axis=1)
 for ea,eb in [(0,1),(1,2),(2,0)]:
  edge=T[:,eb]-T[:,ea];t0=np.clip(np.einsum('ij,ij->i',q-T[:,ea],edge)/np.einsum('ij,ij->i',edge,edge),0,1);ep=T[:,ea]+t0[:,None]*edge;ed=np.linalg.norm(ep-q,axis=1);best=ed<dist;dist[best]=ed[best];bb=np.zeros((len(T),3));bb[:,ea]=1-t0;bb[:,eb]=t0;barys[best]=bb[best]
 j=int(dist.argmin());assert np.isfinite(dist[j]);bary=barys[j];t=authorFaces[j];u=v0[j]/np.linalg.norm(v0[j]);n=np.cross(v0[j],v1[j]);n/=np.linalg.norm(n);v=np.cross(n,u);frame=np.stack([u,v,n],axis=1);coeff=frame.T@(q-bary@P[t]);rebuild=bary@P[t]+frame@coeff;errors.append(float(np.linalg.norm(rebuild-q)));records.append({'innerSim':int(idx),'renderIndices':np.flatnonzero(mapping==idx).tolist(),'outerTriangleOldSim':t.tolist(),'outerRenderFace':int(np.flatnonzero(faceMask)[j]),'barycentric':bary.tolist(),'localOffsetUVNMetres':coeff.tolist(),'signedNormalOffsetMetres':float(coeff[2])})
assert max(errors)<1e-6 and all(int(i)not in fixed for i in inner)
report={'sourceSha256':hashlib.sha256(raw).hexdigest(),'basis':'exact58394private initial posed surface; no body/raw source change','authorKeepOldSim':keep.tolist(),'authorFaceIndices':np.flatnonzero(faceMask).tolist(),'innerMap':records,'renderToOldSim':mapping.tolist(),'originalRenderVertices':len(source),'originalRenderFaces':len(faces),'originalWeldedVertices':len(P),'authorVertices':len(keep),'authorFaces':len(authorFaces),'removedAuthorDOFVertices':len(inner),'removedAuthorFaces':int(np.sum(~faceMask)),'initialRebuildMaxMetres':max(errors),'sourceUnchanged':True,'physicalEquivalenceClaim':False,'limits':['Author totalmass and degrees of freedom change; not physics-equivalent.','All original render triangles are reconstructed and remain in final contact/material gates.','Frame uses two actual outer edges; degeneracy is a hard error, not masked.']};(D/'mapping.json').write_text(json.dumps(report,indent=2)+'\n')
fr=json.loads(gzip.decompress((A/'native-self025-object12-moving-v1/frame-35.json.gz').read_bytes()));categories={}
for name,pairs in fr['exactColliderPairs'].items():
 rows=[];totals={'allPin':0,'mixed':0,'allFree':0}
 for fi,other in pairs:
  n=sum(int(v)in fixed for v in faces[fi]);kind='allPin'if n==3 else'mixed'if n else'allFree';totals[kind]+=1;rows.append({'face':fi,'parentFace':int(lineage[fi]),'otherFace':other,'category':kind})
 categories[name]={'pairCounts':totals,'pairs':rows}
(D/'baseline-B35-face-classification.json').write_text(json.dumps(categories,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['authorVertices','authorFaces','removedAuthorDOFVertices','removedAuthorFaces','initialRebuildMaxMetres']}));print(json.dumps({k:v['pairCounts']for k,v in categories.items()}))
