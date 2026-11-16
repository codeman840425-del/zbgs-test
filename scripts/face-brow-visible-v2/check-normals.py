"""Actual all-shape rigid geometry/normal drift audit; no normal target invention."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-brow-visible-v2'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rows=[]
for sex in ['female','male']:
 source=ROOT/f'prototype/public/assets/foundation/base-{sex}-roundtrip.vrm';folder=BASE/f'generated/{sex}-brow-height3-spacing3-v2';a=GLB(source);b=GLB(folder/'avatar.vrm');m=a.doc['meshes'][1];p=m['primitives'][0];q=b.doc['meshes'][1]['primitives'][0];pos=a.acc(p['attributes']['POSITION']).astype(float);pn=b.acc(q['attributes']['POSITION']).astype(float);brow=next(pr for pr in m['primitives']if 'FaceBrow'in a.doc['materials'][pr['material']]['name']);tri=a.acc(brow['indices']).reshape(-1,3);ids=np.unique(tri);fixed=np.setdiff1d(np.arange(len(pos)),ids);N=a.acc(p['attributes']['NORMAL']);NN=b.acc(q['attributes']['NORMAL']);shapeRows=[]
 for i,name in enumerate(['Basis']+m['extras']['targetNames']):
  pa=pos+(a.acc(p['targets'][i-1]['POSITION'])if i else 0);pb=pn+(b.acc(q['targets'][i-1]['POSITION'])if i else 0);edgeError=max(float(np.linalg.norm((pb[tri[:,u]]-pb[tri[:,v]])-(pa[tri[:,u]]-pa[tri[:,v]]),axis=1).max())for u,v in [(0,1),(1,2),(2,0)]);na=np.cross(pa[tri[:,1]]-pa[tri[:,0]],pa[tri[:,2]]-pa[tri[:,0]]);nb=np.cross(pb[tri[:,1]]-pb[tri[:,0]],pb[tri[:,2]]-pb[tri[:,0]]);la=np.linalg.norm(na,axis=1);lb=np.linalg.norm(nb,axis=1);valid=la>1e-12;flips=int((valid&((na*nb).sum(1)<=0)).sum());degen=int((valid&(lb<=1e-12)).sum());assert edgeError<3e-7 and flips==0 and degen==0;shapeRows.append({'name':name,'triangleEdgeVectorErrorM':edgeError,'newFlips':flips,'newDegenerates':degen})
 protectedError=float(np.linalg.norm(N[fixed]-NN[fixed],axis=1).max());normalError=float(np.linalg.norm(N-NN,axis=1).max());assert protectedError==0 and normalError<1e-4
 rows.append({'sex':sex,'sourceSha256':sha(source),'endpointSha256':sha(folder/'avatar.vrm'),'rawExportNormalMaxComponentVectorError':normalError,'protectedNormalMaxError':protectedError,'targetAttributes':['POSITION'],'normalExplanation':'Each brow side is rigidly translated, so all actual triangle edge vectors are invariant within export float error. Native addon recalculates brow Basis normals with small float drift. Runtime can preserve original authored normals; this export does not invent morph NORMAL targets.','shapes':shapeRows})
(BASE/'normal-audit.json').write_text(json.dumps({'scriptSha256':sha(Path(__file__)),'bodies':rows,'runtimeAdmitted':False},indent=2)+'\n',encoding='utf-8');print(json.dumps([{'sex':r['sex'],'normalError':r['rawExportNormalMaxComponentVectorError'],'protectedNormalError':r['protectedNormalMaxError'],'maxEdgeError':max(s['triangleEdgeVectorErrorM']for s in r['shapes'])}for r in rows]))
