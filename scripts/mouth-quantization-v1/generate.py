"""One fixed male -12% candidate: canonical glTF affine quantization, not raw Blender.
No runtime import, per-vertex offsets, threshold fitting, or public writes.
"""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import argparse,copy,gzip,hashlib,json,sys
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sys.path.insert(0,str(ROOT/'scripts/mouth-visible-v2'))
from normal_core import normals,append_vec3,write_glb
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
BASE=ROOT/'assets-source/mouth-quantization-v1'
PINS={
 'prototype/public/assets/foundation/base-male-roundtrip.vrm':'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',
 'assets-source/mouth-visible-v2/male-mouth-width.recipe.json':'1b3e019f92c799bc2486b4608584e347aa5c8fe1bfda8170a2d3e54e16f0009c',
 'assets-source/mouth-visible-v2/generated/male-mouth-width-88-v2/mapping.json.gz':'52c6c6302497cb501b86aba9d61a682ce3c740eee20921937eeeb74e2aa684ad',
 'assets-source/mouth-visible-v2/generated/male-mouth-width-88-v2/selection.json':'18493e25a298177e248e84d54674eb1371dab0ce8c607b177dd37801ff0477bb',
 'assets-source/mouth-visible-v2/generated/male-mouth-width-88-v2/editable.blend':'3f868cc51362c195a5dc77eae72058c91e357bbdde132c9b4070b71c8fb0cc82',
}
RAW_SHA='1b7579a040b85576b4b888a983741bc1ad7494b25d5dac18d65697084e5f337e'
def run():
 parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--raw',default='assets-source/mouth-visible-v2/generated/male-mouth-width-88-v2/addon-export.vrm');args=parser.parse_args()
 out=(BASE/args.out).resolve();assert out.is_relative_to(BASE.resolve()) and out!=BASE.resolve() and not out.exists(),'New isolated output required'
 for name,pin in PINS.items():assert sha(ROOT/name)==pin,('Input identity mismatch',name)
 rawpath=(ROOT/args.raw).resolve();assert sha(rawpath)==RAW_SHA,'Unexpected raw author export'
 source=GLB(ROOT/next(iter(PINS)));raw=GLB(rawpath)
 recipe=json.loads((ROOT/list(PINS)[1]).read_text(encoding='utf8'));selection=json.loads((ROOT/list(PINS)[3]).read_text(encoding='utf8'));mapping=json.loads(gzip.decompress((ROOT/list(PINS)[2]).read_bytes()))
 mi=next(i for i,m in enumerate(source.doc['meshes'])if m['name'].startswith('Face'));mesh=source.doc['meshes'][mi];p=mesh['primitives'][0];rp=raw.doc['meshes'][mi]['primitives'][0]
 b=source.acc(p['attributes']['POSITION']);d=np.stack([source.acc(t['POSITION'])for t in p['targets']]);n=source.acc(p['attributes']['NORMAL']);tri=np.concatenate([source.acc(v['indices']).reshape(-1,3)for v in mesh['primitives']])
 assert len(d)==54 and np.array_equal(recipe['weights'],selection['weights']) and recipe['centerX']==mapping['centerX']
 # The source mapping, not a positional nearest-neighbor inference, supplies weights.
 assert np.array_equal(np.array(mapping['sourceVertexWeights'])[selection['sourceVertexMap']],recipe['weights'])
 weight=np.array(recipe['weights']);scale=1+(-.12)*weight;edited=np.flatnonzero(scale!=1);protected=np.flatnonzero(scale==1)
 affected=np.unique(tri[np.any(np.isin(tri,edited),axis=1)]);assert np.array_equal(affected,selection['normalNeighborhoodVertices'])
 q=b.copy();delta=d.copy();q[edited,0]=(recipe['centerX']+(b[edited,0].astype(float)-recipe['centerX'])*scale[edited]).astype('<f4');delta[:,edited,0]=(d[:,edited,0].astype(float)*scale[edited]).astype('<f4')
 # Quantize stored Basis and stored relative morph independently, once. Absolute
 # shape coordinates for normal evaluation are their Float64 sum, as in glTF.
 assert np.array_equal(q[protected],b[protected]) and np.array_equal(delta[:,protected],d[:,protected])
 rb=raw.acc(rp['attributes']['POSITION']);rd=np.stack([raw.acc(t['POSITION'])for t in rp['targets']]);shapes=[]
 N=n.copy();N[affected]=normals(q.astype(float),tri)[affected];DN=[]
 for si,name in enumerate(['Basis']+mesh['extras']['targetNames']):
  absolute=q.astype(float)+(delta[si-1].astype(float)if si else 0);author=rb.astype(float)+(rd[si-1].astype(float)if si else 0)
  error=float(np.max(abs(absolute-author)));assert error<3e-7,(name,'raw author position gate',error)
  assert np.array_equal(absolute[protected],author[protected]),(name,'protected author shape')
  if si:
   nd=np.zeros_like(n);computed=normals(absolute,tri);nd[affected]=(computed[affected]-N[affected].astype(float)).astype('<f4');DN.append(nd)
  shapes.append({'name':name,'canonicalVsRawMaxComponentM':error,'protectedAuthorExact':True})
 # Keep all author structure/material/skin/indices; append new explicitly
 # canonicalized attributes. This is NOT labeled an unchanged Blender export.
 doc=copy.deepcopy(raw.doc);blob=bytearray(raw.bin)
 def add_position(a):
  i=append_vec3(doc,blob,a);doc['accessors'][i]['min']=a.min(axis=0).astype(float).tolist();doc['accessors'][i]['max']=a.max(axis=0).astype(float).tolist();return i
 qi=add_position(q);di=[add_position(a)for a in delta];ni=append_vec3(doc,blob,N);dni=[append_vec3(doc,blob,a)for a in DN]
 for prim in doc['meshes'][mi]['primitives']:
  prim['attributes']['POSITION']=qi;prim['attributes']['NORMAL']=ni
  for t,a,z in zip(prim['targets'],di,dni):t['POSITION']=a;t['NORMAL']=z
 identifier='male-mouth-width-88-canonical-v1';doc['extensions']['VRM']['meta']['title']=identifier
 doc.setdefault('extras',{})['sourceQuantization']={'schema':'gltf-affine-quantization-v1','id':identifier,'authorRawSha256':RAW_SHA,'baseAvatarSha256':recipe['baseAvatarSha256'],'authorRecipeSha256':PINS[list(PINS)[1]],'parameter':-.12,'positionStorage':'Float32 Basis and relative delta independently; normals on Float64 sum','notRawBlenderExport':True}
 out.mkdir(parents=True);write_glb(out/'avatar.vrm',doc,blob)
 finalrecipe=copy.deepcopy(recipe);finalrecipe['id']='male-mouth-canonical-v1';finalrecipe['range']=[-.12,0];finalrecipe['supportedValues']=[-.12,0];finalrecipe['rangeStatus']='One independently canonicalized -12% endpoint only; original +12% remains separate.'
 finalrecipe['sourceQuantization']=doc['extras']['sourceQuantization'];finalrecipe['sourceEndpoints']=[{'parameter':-.12,'id':identifier,'finalEndpointSha256':sha(out/'avatar.vrm'),'finalPath':'avatar.vrm','authorRawSha256':RAW_SHA}]
 # Remove old endpoint claims wherever the earlier schema stored them.
 for k in ['endpoints','sourceSamples']:
  if k in finalrecipe:finalrecipe[k]=finalrecipe['sourceEndpoints']
 (out/'male-mouth-width.recipe.json').write_text(json.dumps(finalrecipe,indent=2)+'\n',encoding='utf8')
 report={'schema':'canonical-affine-source-quantization-v1','id':identifier,'inputPins':PINS,'rawInput':str(rawpath.relative_to(ROOT)).replace('\\','/'),'rawSha256':RAW_SHA,'generatorSha256':sha(Path(__file__)),'normalCoreSha256':sha(ROOT/'scripts/mouth-visible-v2/normal_core.py'),'parameter':-.12,'changedVertices':len(edited),'normalNeighborhoodCount':len(affected),'shapes':shapes,'positionToleranceM':3e-7,'normalTolerance':1e-5,'sourceVsRuntimeStatus':'Not tested by generator; separate runtime checker required','finalSha256':sha(out/'avatar.vrm'),'recipeSha256':sha(out/'male-mouth-width.recipe.json')}
 (out/'generation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
 print(json.dumps({'output':str(out),'sha256':report['finalSha256'],'rawPositionMaxM':max(v['canonicalVsRawMaxComponentM']for v in shapes)}))
if __name__=='__main__':run()
