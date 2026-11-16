"""Independent NumPy recipe composition, no Blender/browser or source edits."""
from pathlib import Path
import sys,json,gzip,hashlib,os
os.environ['OPENBLAS_NUM_THREADS']='1'
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'));from glb import GLB
sys.path.insert(0,str(ROOT/'scripts/mouth-visible-v2'));from normal_core import normals
out=ROOT/sys.argv[1];out.mkdir(parents=True,exist_ok=False)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for sex in ['female','male']:
 source=ROOT/f'prototype/public/assets/foundation/base-{sex}-roundtrip.vrm';g=GLB(source)
 mesh=next(m for m in g.doc['meshes']if m['name'].startswith('Face'));p=mesh['primitives'][0]
 pos=g.acc(p['attributes']['POSITION']);normal=g.acc(p['attributes']['NORMAL'])
 morph=np.stack([g.acc(t['POSITION'])for t in p['targets']]);tris=np.concatenate([g.acc(t['indices']).reshape(-1,3)for t in mesh['primitives']])
 for name,value in [('all-new-positive',.12),('all-new-negative',-.12),('legacy-mouth-new-others',.025)]:
  directories={'mouth':'face-parameters-v1'if value==.025 else'mouth-visible-v2','brow':'face-brow-visible-v2','nose':'face-nose-visible-v2','eye':'face-eye-visible-v2'}
  files={k:ROOT/f'assets-source/{v}/{sex}-{ "mouth-width" if k=="mouth" else k}.recipe.json'for k,v in directories.items()}
  r={k:json.loads(p.read_text(encoding='utf8'))for k,p in files.items()}
  position=pos.copy();d=morph.copy();w=np.array(r['mouth']['weights']);c=r['mouth']['centerX'];scale=1+value*w
  position[:,0]=(c+(pos[:,0].astype(float)-c)*scale).astype('f4');d[:,:,0]=(morph[:,:,0].astype(float)*scale).astype('f4')
  position=(position.astype(float)+np.array(r['nose']['translationVectors'])).astype('f4')
  es=np.array(r['eye']['xScale']);ec=np.array(r['eye']['centerX']);ei=np.flatnonzero(es!=1)
  position[ei,0]=(ec[ei]+(pos[ei,0].astype(float)-ec[ei])*es[ei]).astype('f4');d[:,ei,0]=(morph[:,ei,0].astype(float)*es[ei]).astype('f4')
  selected=set(np.flatnonzero(w>0))|set(r['nose']['changedVertices'])|set(r['eye']['selectedVertices'])
  affected=np.unique(tris[np.any(np.isin(tris,list(selected)),axis=1)])
  n0=normal.copy();n0[affected]=normals(position.astype(float),tris)[affected]
  dn=[]
  for delta in d:
   absolute=position.astype(float)+delta.astype(float);n=normals(absolute,tris);nd=np.zeros_like(normal);nd[affected]=(n[affected]-n0[affected].astype(float)).astype('f4');dn.append(nd)
  dn=np.stack(dn)
  # Constant rigid eyebrow translation deliberately retains source authored normals.
  position=(position.astype(float)+.003*(np.array(r['brow']['heightVectors'])+np.array(r['brow']['spacingVectors']))).astype('f4')
  arrays={'position':position,'morph':d,'normal':n0,'morphNormal':dn};blob=bytearray();layout={}
  for key,a in arrays.items():
   a=np.asarray(a,dtype='<f4');layout[key]={'offset':len(blob),'floatCount':a.size,'shape':list(a.shape)};blob.extend(a.tobytes())
  file=f'{sex}-{name}.bin.gz';(out/file).write_bytes(gzip.compress(bytes(blob),mtime=0))
  rows.append({'sex':sex,'name':name,'file':file,'sha256':sha(out/file),'sourceSha256':sha(source),'layout':layout,'args':{'mouthWidth':value,'browSample':'height3-spacing3-v2','noseSample':'tip-forward2-v2','eyeSample':'aperture-width105-v2'},'recipePins':{k:sha(v)for k,v in files.items()},'normalAffected':affected.tolist()})
 # Explain the retained source-endpoint failure without modifying its threshold.
 if sex=='male':
  r=json.loads((ROOT/'assets-source/mouth-visible-v2/male-mouth-width.recipe.json').read_text());w=np.array(r['weights']);s=1-.12*w
  q=pos.copy();q[:,0]=(r['centerX']+(pos[:,0].astype(float)-r['centerX'])*s).astype('f4');delta=morph[2].copy();delta[:,0]=(delta[:,0].astype(float)*s).astype('f4');a=q.astype(float)+delta.astype(float)
  ep=ROOT/'assets-source/mouth-visible-v2/generated/male-mouth-width-88-v2/avatar.vrm';end=GLB(ep);em=next(m for m in end.doc['meshes']if m['name'].startswith('Face'));e=em['primitives'][0];b=end.acc(e['attributes']['POSITION']).astype(float)+end.acc(e['targets'][2]['POSITION']).astype(float)
  faces=np.where(np.any(tris==314,axis=1))[0];verts=np.unique(tris[faces]);na=normals(a,tris);nb=normals(b,tris)
  witness={'sourceSha256':sha(source),'endpointSha256':sha(ep),'shapeIndex':2,'shapeName':mesh['extras']['targetNames'][2],'vertex':314,'faceIndicesFullConcatenation':faces.tolist(),'triangles':tris[faces].tolist(),'maxNeighborPositionDifferenceM':float(abs(a[verts]-b[verts]).max()),'neighborDifferences':{str(i):(a[i]-b[i]).tolist()for i in verts},'independentNormalsOnRecipePosition':na[314].tolist(),'independentNormalsOnBlenderPosition':nb[314].tolist(),'maxNormalDifference':float(abs(na[314]-nb[314]).max()),'originalThreshold':1e-5,'status':'source-endpoint-normal-threshold-still-failed; not hidden or relaxed'}
  (out/'male-mouth88-normal-witness.json').write_text(json.dumps(witness,indent=2),encoding='utf8')
(out/'manifest.json').write_text(json.dumps({'rows':rows,'referenceMethod':'Independent NumPy complete-Face area weighted normals on parsed affine/displacement recipes. No Blender raw residual correction.','scriptSha256':sha(Path(__file__))},indent=2),encoding='utf8')
print(json.dumps({'out':str(out),'cases':len(rows),'retainedSourceNormalFailure':witness['maxNormalDifference']}))
