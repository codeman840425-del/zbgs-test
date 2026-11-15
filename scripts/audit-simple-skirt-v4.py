"""Bounded read-only v4 diagnostics on existing pair IDs; never an admission gate."""
from pathlib import Path
import collections, gzip, hashlib, json, struct
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
R=ROOT/'experiments/m1-simple-skirt-worktree';S=R/'assets-source/m1/simple-skirt-v1'
def load(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);binary=b[28+n:]
 def read(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
  return np.ndarray((a['count'],w),dt,binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 ps=[({k:read(v)for k,v in p['attributes'].items()},read(p['indices']).reshape(-1,3))for p in d['meshes'][0]['primitives']]
 return d,ps,read(d['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1),hashlib.sha256(b).hexdigest()
d,pr,ib,assetsha=load(S/'generated-v4/m1-sixfold-skirt-v4.glb')
assert assetsha=='cdd2d206650aa7375b335e42b8cea93dcebea9c9269e360124d198964240c885'
old,op,_,_=load(R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-skirt-open-waist.glb')
_,lp,_,_=load(S/'generated-v3/m1-sixfold-skirt-v3.glb')
_,tp,_,_=load(R/'prototype/public/assets/m1/m1-uniform-top.glb')
frame=json.loads(gzip.decompress((S/'input-269/four-poses.json.gz').read_bytes()))['frames'][0]
report=json.loads((S/'generated-v4/build-report.json').read_text())
gate=json.loads((S/'generated-v4/four-pose-gate.json').read_text())
tc=next(m for m in frame['colliders']if m['name']=='m1-uniform-top_1')
record=next(m for m in gate['poses'][0]['collisions']if m['name']=='m1-uniform-top_1')
names=[d['nodes'][i]['name']for i in d['skins'][0]['joints']]
palette=np.array([np.array(frame['bones'][n]).reshape(4,4).T for n in names])@ib
def dense(a):
 out=np.zeros((len(a['POSITION']),len(names)))
 for k in range(4):np.add.at(out,(np.arange(len(out)),a['JOINTS_0'][:,k]),a['WEIGHTS_0'][:,k])
 return out
def pose(p,w):
 h=np.c_[p,np.ones(len(p))];transformed=np.einsum('bij,nj->nbi',palette,h)
 return np.einsum('nbi,nb->ni',transformed,w)[:,:3]
upper,uf=pr[0];low,lf=pr[1];u=len(upper['POSITION']);points=np.vstack([upper['POSITION'],low['POSITION']]);faces=np.vstack([uf,lf+u]);actual=np.vstack([pose(upper['POSITION'],dense(upper)),pose(low['POSITION'],dense(low))])
raw=np.array(tc['positions']).reshape(-1,3);topfaces=np.array(tc['triangles']).reshape(-1,3)
boundary=report['boundaryOriginalRenderIds'];oa=op[0][0];bp=oa['POSITION'][boundary];center=oa['POSITION'][report['preservedOriginalRenderVertices']][:,[0,2]].mean(0)
# Reconstruct the exact builder angular center from topology waist component.
topology=json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/topology.json').read_text());weld=np.array(topology['position']);edges=topology['boundaryEdges'];remain=set(v for e in edges for v in e);components=[]
while remain:
 todo=[next(iter(remain))];comp=set()
 while todo:
  v=todo.pop()
  if v in comp:continue
  comp.add(v);remain.discard(v)
  for a,b in edges:
   if a==v:todo.append(b)
   if b==v:todo.append(a)
 components.append(comp)
waist=max(components,key=lambda x:weld[list(x),1].mean());center=weld[list(waist)][:,[0,2]].mean(0)
angles=np.mod(np.arctan2(bp[:,2]-center[1],bp[:,0]-center[0]),2*np.pi)
bw=dense(oa)[boundary];lw=dense(lp[0][0]);desired=dense(low).copy();boundaryonly=desired.copy();loss=[]
for row,source_row in enumerate(range(7,17)):
 for col in range(121):
  theta=col/120*2*np.pi;end=int(np.searchsorted(angles,theta))%20;start=(end-1)%20;lo=angles[start];hi=angles[end]
  if hi<=lo:hi+=2*np.pi
  theta+=2*np.pi if theta<lo else 0;f=(theta-lo)/(hi-lo);w=(1-f)*bw[start]+f*bw[end];mix=min(1,(row+1)/3);v=20+row*121+col
  desired[v]=(1-mix)*w+mix*lw[source_row*121+col];boundaryonly[v]=w;loss.append(1-sum(sorted(desired[v],reverse=True)[:4]))
unpruned=np.vstack([actual[:u],pose(low['POSITION'],desired)])
boundaryworld=np.vstack([actual[:u],pose(low['POSITION'],boundaryonly)])
def crossing(a,b):
 hits=[]
 for first,other in [(a,b),(b,a)]:
  for k in range(3):
   start=first[k];direction=first[(k+1)%3]-start;e1=other[1]-other[0];e2=other[2]-other[0];h=np.cross(direction,e2);det=e1@h
   if abs(det)<1e-12:continue
   q=start-other[0];s=q@h/det;t=direction@np.cross(q,e1)/det;v=e2@np.cross(q,e1)/det
   if s>=-1e-7 and t>=-1e-7 and s+t<=1+1e-7 and 1e-6<v<1-1e-6:hits.append(start+direction*v)
 return hits
pairs=record['otherPairs'];rows=[]
for a,b in pairs:
 ix=faces[a];row={'candidateFace':a,'topFace':b,'region':'retained'if a<120 else 'zipper'if a<260 else 'lower-row-'+str((a-260)//240),'lowVertexIds':(ix-u).tolist(),'sourceCentroid':points[ix].mean(0).tolist(),'actualCross':bool(crossing(actual[ix],raw[topfaces[b]])),'restCross':bool(crossing(points[ix],tp[0][0]['POSITION'][tp[0][1][b]])),'unprunedCross':bool(crossing(unpruned[ix],raw[topfaces[b]])),'boundaryOnlyCross':bool(crossing(boundaryworld[ix],raw[topfaces[b]])),'maxPruningDeltaMetres':float(np.linalg.norm(unpruned[ix]-actual[ix],axis=1).max()),'maxBoundaryOnlyDeltaMetres':float(np.linalg.norm(boundaryworld[ix]-actual[ix],axis=1).max())};rows.append(row)
details=[]
for v in [110,231,232,352,353,473,474]:
 details.append({'lowVertex':v,'position':low['POSITION'][v].tolist(),'actualWeights':{n:float(w)for n,w in zip(names,dense(low)[v])if w>1e-8},'desiredUnprunedWeights':{n:float(w)for n,w in zip(names,desired[v])if w>1e-8},'pruningWorldDelta':(unpruned[u+v]-actual[u+v]).tolist(),'boundaryOnlyWorldDelta':(boundaryworld[u+v]-actual[u+v]).tolist()})
summary={'assetSha256':assetsha,'scope':'Only existing190 noncap pair IDs. Counterfactual point/weight diagnostics, no generated candidate or global admission.','totalTopPairs':record['candidatePairCount'],'capPairs':len(record['knownOriginalTopCapPairs']),'noncapPairs':len(pairs),'regions':dict(collections.Counter(x['region']for x in rows)),'countsOnSamePairs':{k:sum(x[k]for x in rows)for k in ['actualCross','restCross','unprunedCross','boundaryOnlyCross']},'maximumPruningPositionChangeMetres':float(np.linalg.norm(unpruned-actual,axis=1).max()),'maximumPruningWeightLoss':max(loss),'representativeVertices':details,'rows':rows}
out=ROOT/'evidence/simple-skirt-v4-source-diagnosis.json';out.write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in summary.items()if k!='rows'},indent=2))
