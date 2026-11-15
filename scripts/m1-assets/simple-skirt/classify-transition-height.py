"""Recorded standing row2 against the actual single opened top hem loop."""
from pathlib import Path
import ast,gzip,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';A=S/'two-quad-thirds-v1';O=A/'native-author-trial-v1'
tree=ast.parse((R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py').read_text());exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='load'],type_ignores=[]),'load','exec'),globals())
raw,d,read=load(A/'m1-sixfold-skirt-two-quad-thirds-v1.glb');pr=d['meshes'][0]['primitives'];counts=[len(read(p['attributes']['POSITION']))for p in pr];rf=np.concatenate([read(p['indices']).reshape(-1,3)+sum(counts[:i])for i,p in enumerate(pr)]);origin=np.array(json.loads((A/'face-lineage.json').read_text())['oldFaceForNewFace']);prep=json.loads((O/'preparation.json').read_text());mapping=np.array(prep['renderToSim']);q=np.array(json.loads(gzip.decompress((O/'frame-01.json.gz').read_bytes()))['positionsWorld']);f=json.loads(gzip.decompress((S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()))['frames'][0];top=next(m for m in f['colliders']if m['name']=='m1-uniform-top_1');p=np.array(top['positions']).reshape(-1,3);tri=np.array(top['triangles']).reshape(-1,3);lookup={};idx=[];reps=[]
for i,v in enumerate(np.round(p,6)):
    key=tuple(v)
    if key not in lookup:lookup[key]=len(reps);reps.append(i)
    idx.append(lookup[key])
tri=np.array(idx)[tri];edges={}
for face in tri:
    for a,b in zip(face,np.roll(face,-1)):edge=tuple(sorted([int(a),int(b)]));edges[edge]=edges.get(edge,0)+1
boundary=np.array([edge for edge,count in edges.items()if count==1]);ids=np.unique(boundary);assert len(ids)==20 and len(boundary)==20
hem=p[np.array(reps)[boundary]];h0=hem[:,0][:,[0,2]];delta=hem[:,1][:,[0,2]]-h0
def compare(point):
    t=np.clip(np.einsum('ij,ij->i',point[[0,2]]-h0,delta)/np.einsum('ij,ij->i',delta,delta),0,1);closest=hem[:,0]+t[:,None]*(hem[:,1]-hem[:,0]);dist=np.linalg.norm(closest[:,[0,2]]-point[[0,2]],axis=1);i=int(dist.argmin());return{'worldY':float(point[1]),'nearestHemWorldY':float(closest[i,1]),'aboveHemMetres':float(point[1]-closest[i,1]),'xzCorrespondenceDistanceMetres':float(dist[i])}
rowFaces=np.flatnonzero((origin>=740)&(origin<980));rowPoints=q[np.unique(mapping[rf[rowFaces]])];values=[compare(point)for point in rowPoints];report={'basis':'Actual frame1 geometry, same captured world coordinates; only opened top single20point boundary','row2WorldYMinMax':np.quantile(rowPoints[:,1],[0,1]).tolist(),'hemWorldYMinMax':np.quantile(p[np.array(reps)[ids],1],[0,1]).tolist(),'row2MinusClosestXZHemHeightMinP50Max':np.quantile([v['aboveHemMetres']for v in values],[0,.5,1]).tolist(),'row2XZToHemDistanceMinP50Max':np.quantile([v['xzCorrespondenceDistanceMetres']for v in values],[0,.5,1]).tolist(),'pointsAboveHem':sum(v['aboveHemMetres']>0 for v in values),'pointsBelowHem':sum(v['aboveHemMetres']<0 for v in values),'exampleParentFaces':[],'limits':['ClosestXZ hem correspondence is geometry classification, not a promise the whole waist should be pinned.','Actual full layer crossings/edge strain still need original gates; fixed domain cannot be enlarged to hide body intersections.']}
for parent in [760,763,888,889,900,901,920,923]:
    fi=np.flatnonzero(origin==parent)[0];report['exampleParentFaces'].append({'parentFace':parent,'currentFace':int(fi),'center':compare(q[mapping[rf[fi]]].mean(0))})
(O/'transition-height.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))
