"""Independent decoded source/author audit; no generator or runtime imports."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import json,sys,hashlib,math,argparse
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--raw',default='assets-source/mouth-visible-v2/generated/male-mouth-width-88-v2/addon-export.vrm');parser.add_argument('--endpoint',default='assets-source/mouth-quantization-v1/candidate/avatar.vrm');args=parser.parse_args();out=ROOT/args.out;assert not out.exists();out.mkdir(parents=True)
sourcepath=ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm';rawpath=ROOT/args.raw;finalpath=ROOT/args.endpoint
assert sha(sourcepath)=='62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'
assert sha(rawpath)=='1b7579a040b85576b4b888a983741bc1ad7494b25d5dac18d65697084e5f337e'
source,raw,final=[GLB(p)for p in [sourcepath,rawpath,finalpath]];recipe=json.loads((ROOT/'assets-source/mouth-quantization-v1/candidate/male-mouth-width.recipe.json').read_text(encoding='utf8'))
mi=recipe['meshIndex'];sm=source.doc['meshes'][mi];rm=raw.doc['meshes'][mi];fm=final.doc['meshes'][mi];sp,rp,fp=[m['primitives'][0]for m in [sm,rm,fm]]
tri=np.concatenate([source.acc(p['indices']).reshape(-1,3)for p in sm['primitives']]);edges=np.unique(np.sort(np.concatenate([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]]),axis=1),axis=0)
b,rb,q=[g.acc(p['attributes']['POSITION']).astype(float)for g,p in [(source,sp),(raw,rp),(final,fp)]]
n=final.acc(fp['attributes']['NORMAL']).astype(float);sourceN=source.acc(sp['attributes']['NORMAL']).astype(float)
fixed=np.flatnonzero(np.array(recipe['weights'])==0);domain=np.array(recipe['normalNeighborhoodVertices']);outside=np.setdiff1d(np.arange(len(b)),domain);oral=recipe['protectedOralVertices'];pairs=np.array(recipe['mouthBoundaryPairs'])
checks=[]
def check(ok,name):
 checks.append({'name':name,'passed':bool(ok)})
 assert ok,name
check(source.doc['nodes']==raw.doc['nodes']==final.doc['nodes'],'nodes and rest exact')
check(source.doc['materials']==raw.doc['materials']==final.doc['materials'],'materials exact')
check(source.images()==raw.images()==final.images(),'texture bytes exact')
check(sm['extras']==rm['extras']==fm['extras'],'shape names and expression ordering exact')
for key in ['humanoid','firstPerson','blendShapeMaster','secondaryAnimation']:
 check(source.doc['extensions']['VRM'][key]==raw.doc['extensions']['VRM'][key]==final.doc['extensions']['VRM'][key],key+' exact')
for a,z in zip(source.doc['skins'],final.doc['skins']):
 check(a['joints']==z['joints']and np.array_equal(source.acc(a['inverseBindMatrices']),final.acc(z['inverseBindMatrices'])),'skin joints and inverse bind exact')
for im,(a,z)in enumerate(zip(source.doc['meshes'],final.doc['meshes'])):
 for ip,(p,t)in enumerate(zip(a['primitives'],z['primitives'])):
  check(np.array_equal(source.acc(p['indices']),final.acc(t['indices'])),f'mesh{im}/primitive{ip} topology')
  for attr in p['attributes']:
   if im!=mi or attr not in ['POSITION','NORMAL']:
    check(np.array_equal(source.acc(p['attributes'][attr]),final.acc(t['attributes'][attr])),f'mesh{im}/primitive{ip}/{attr} exact')
  if im!=mi:
   for si,(v,w)in enumerate(zip(p.get('targets',[]),t.get('targets',[]))):
    for attr in v:check(np.array_equal(source.acc(v[attr]),final.acc(w[attr])),f'non-face shape{si}/{attr} exact')
adj=[[]for _ in b]
for ti,t in enumerate(tri):
 for v in t:adj[v].append(ti)
def independent_normals(x):
 # Stable sum per vertex, unlike exporter corner-wise add.at accumulation.
 c=np.cross(x[tri[:,1]]-x[tri[:,0]],x[tri[:,2]]-x[tri[:,0]])
 result=np.zeros_like(x)
 for v,fs in enumerate(adj):
  vec=[math.fsum(float(c[t,k])for t in fs)for k in range(3)];length=math.sqrt(math.fsum(a*a for a in vec))
  if length>1e-20:result[v]=[a/length for a in vec]
 return result,c
rows=[];witness={}
for si,name in enumerate(['Basis']+sm['extras']['targetNames']):
 d=source.acc(sp['targets'][si-1]['POSITION']).astype(float)if si else 0
 rd=raw.acc(rp['targets'][si-1]['POSITION']).astype(float)if si else 0
 qd=final.acc(fp['targets'][si-1]['POSITION']).astype(float)if si else 0
 nd=final.acc(fp['targets'][si-1]['NORMAL']).astype(float)if si else 0
 original=b+d;author=rb+rd;x=q+qd;actualN=n+nd
 err=float(np.max(abs(x-author)));assert err<3e-7
 assert np.array_equal(x[fixed],original[fixed]) and np.array_equal(x[fixed],author[fixed])
 assert np.array_equal(x[oral],original[oral]);gap=float(np.linalg.norm(x[pairs[:,0]]-x[pairs[:,1]],axis=1).max());assert gap<1e-7
 expected,c=independent_normals(x);normalErr=float(np.max(abs(expected[domain]-actualN[domain])));assert normalErr<1e-5
 assert np.array_equal(actualN[outside],sourceN[outside])
 _,ac=independent_normals(author);alen=np.linalg.norm(ac,axis=1);clen=np.linalg.norm(c,axis=1);valid=alen>1e-12
 newDegenerate=int(np.sum(valid&(clen<=1e-12)));flipped=int(np.sum(valid&((ac*c).sum(axis=1)<=0)));assert not newDegenerate and not flipped
 angles=np.degrees(np.arccos(np.clip((ac[valid]*c[valid]).sum(axis=1)/(alen[valid]*clen[valid]),-1,1)))
 el=np.linalg.norm(author[edges[:,0]]-author[edges[:,1]],axis=1);ql=np.linalg.norm(x[edges[:,0]]-x[edges[:,1]],axis=1);ratios=ql[el>1e-12]/el[el>1e-12]
 rows.append({'shape':si-1,'name':name,'authorPositionMaxM':err,'independentNormalMaxComponent':normalErr,'protectedPositionExact':True,'outsideNormalExact':True,'oralProtectedExact':True,'seamMaxM':gap,'newDegenerateVsAuthor':newDegenerate,'flippedVsAuthor':flipped,'maxTriangleAngleVsAuthorDeg':float(angles.max()),'edgeRatioVsAuthor':[float(ratios.min()),float(ratios.max())]})
 if si==3:
  ids=np.array([290,313,314,315]);fs=np.array([388,389]);an,_=independent_normals(author)
  witness={'shape':name,'vertex':314,'triangleIndices':fs.tolist(),'triangles':tri[fs].tolist(),'authorTriangleAreaMm2':(alen[fs]*.5e6).tolist(),'canonicalTriangleAreaMm2':(clen[fs]*.5e6).tolist(),'authorCoordinatesM':author[ids].tolist(),'canonicalCoordinatesM':x[ids].tolist(),'vertexIds':ids.tolist(),'differenceM':(x[ids]-author[ids]).tolist(),'authorNormal':an[314].tolist(),'canonicalIndependentNormal':expected[314].tolist(),'canonicalStoredAbsoluteNormal':actualN[314].tolist(),'rawVsCanonicalNormalMaxComponent':float(abs(an[314]-expected[314]).max())}
report={'sourceSha256':sha(sourcepath),'authorRawSha256':sha(rawpath),'canonicalSha256':sha(finalpath),'scriptSha256':sha(Path(__file__)),'checks':checks,'shapes':rows,'witness':witness,'allPassed':True,'positionThresholdM':3e-7,'normalThreshold':1e-5,'maxAuthorPositionDifferenceM':max(r['authorPositionMaxM']for r in rows),'maxIndependentNormalDifference':max(r['independentNormalMaxComponent']for r in rows),'maxTriangleAngleVsAuthorDeg':max(r['maxTriangleAngleVsAuthorDeg']for r in rows),'scope':'Source precision only. Not game/visual or new recipe admission.'}
(out/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');(out/'executed-script.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps({k:report[k]for k in ['allPassed','maxAuthorPositionDifferenceM','maxIndependentNormalDifference','maxTriangleAngleVsAuthorDeg']}))
