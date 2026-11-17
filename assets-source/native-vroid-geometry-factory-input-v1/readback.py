from pathlib import Path
import hashlib,importlib.util,json,struct,sys
sys.dont_write_bytecode=True
import numpy as np
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
sp=importlib.util.spec_from_file_location('g',ROOT/'scripts/m2-male-face-v1/glb.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
def body(g):
 rows=[(i,x) for i,x in enumerate(g.doc['materials']) if '_Body_' in x['name'] and '_SKIN' in x['name']];assert len(rows)==1
 mi,x=rows[0];ti=x['pbrMetallicRoughness']['baseColorTexture']['index'];return mi,g.doc['textures'][ti]['source']
def raw(g,i):
 v=g.doc['bufferViews'][g.doc['images'][i]['bufferView']];return g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def main():
 pre=json.loads((BASE/'body-image-preflight.json').read_bytes());donor=m.GLB(ROOT/'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm');dm,di=body(donor);donorPNG=raw(donor,di);cases=[];fail=[]
 for row in pre['cases']:
  src=m.GLB(ROOT/row['source']['path']);out=m.GLB(ROOT/row['output']['path']);smi,sii=body(src);omi,oi=body(out);assert smi==omi and sii==oi==11
  changed=[]
  for i in range(len(src.doc['accessors'])):
   if not np.array_equal(src.acc(i),out.acc(i)):changed.append(i)
  imgs=[i for i in range(len(src.doc['images'])) if raw(src,i)!=raw(out,i)]
  exact=[i for i in range(len(src.doc['images'])) if i!=11 and raw(src,i)==raw(out,i)]
  ok=(changed==[] and imgs==[11] and raw(out,11)==donorPNG)
  if not ok:fail.append(row['kind'])
  cases.append(dict(kind=row['kind'],source=row['source'],output=row['output'],bodyMaterial=omi,bodyImage=oi,accessorCount=len(src.doc['accessors']),allAccessorsExact=not changed,changedAccessorIndices=changed,changedImageIndices=imgs,nonBodyImagesExact=len(exact)==len(src.doc['images'])-1,donorBodyPNGExact=raw(out,11)==donorPNG,sourceBodyPNG=row['sourceBodyImageSHA256'],donorBodyPNG=sha(donorPNG),nodes=len(out.doc['nodes']),skinJointCounts=[len(x['joints']) for x in out.doc['skins']],morphTargets=[[len(p.get('targets',[])) for p in x['primitives']] for x in out.doc['meshes']],status='skin-derived-source-ready' if ok else 'failed'))
 result=dict(schema='native-geometry-factory-input-readback-v1',status='three-skin-derived-inputs-ready' if not fail else 'failed',donor={'path':'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm','sha256':'843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef','bodyPNGsha256':sha(donorPNG)},cases=cases,failures=fail,limitations=['Body PNG reuse is source-level only; garment fit/coverage and runtime admission remain pending','These outputs retain original native source geometry and do not prove skin visual or game acceptance','No generic new bodySHA compatibility is claimed'])
 (BASE/'readback.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'status':result['status'],'cases':[(x['kind'],x['status'],x['output']['sha256']) for x in cases]}))
if __name__=='__main__':main()
