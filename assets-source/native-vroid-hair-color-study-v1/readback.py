"""CPU readback for the native hair+brow color export."""
from pathlib import Path
import copy,hashlib,importlib.util,io,json,sys,time
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
sp=importlib.util.spec_from_file_location('glb',ROOT/'scripts/m2-male-face-v1/glb.py');mod=importlib.util.module_from_spec(sp);sp.loader.exec_module(mod)
SOURCE=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm';SOURCE_SHA='a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da'
def raw(g,i):
 info=g.doc['images'][i];v=g.doc['bufferViews'][info['bufferView']];return g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def consumers(g,mi):
 r=[]
 for ni,n in enumerate(g.doc['nodes']):
  if 'mesh' not in n:continue
  for pi,p in enumerate(g.doc['meshes'][n['mesh']]['primitives']):
   if p.get('material')==mi:r.append(dict(node=ni,mesh=n['mesh'],primitive=pi,indices=p['indices'],attributes=p['attributes'],targets=p.get('targets',[])))
 return r
def image_info(g,i):
 b=raw(g,i);px=np.asarray(Image.open(io.BytesIO(b)).convert('RGBA'));return dict(index=i,encodedSHA256=sha(b),bytes=len(b),dimensions=[px.shape[1],px.shape[0]],rgbaSHA256=sha(px.tobytes()),alphaSHA256=sha(px[:,:,3].tobytes()),visiblePixels=int((px[:,:,3]>0).sum()))
def canon_material(g,m):
 v=copy.deepcopy(m)
 def walk(x):
  if isinstance(x,dict):
   for k,y in x.items():
    if isinstance(y,dict) and 'index' in y and 'texture' in k.lower():
     t=g.doc['textures'][y['index']];y['index']=dict(sourceImage=t['source'],sampler=g.doc.get('samplers',[])[t['sampler']] if 'sampler' in t else {})
    else:walk(y)
  elif isinstance(x,list):
   for y in x:walk(y)
 walk(v);return v
def main():
 start=time.monotonic();out=BASE/'cpu-readback';assert not out.exists()
 out.mkdir()
 cycle=json.loads((BASE/'native-cycle.json').read_bytes());assert cycle['failure'] is None
 cold=json.loads((BASE/'cold-reopen-readback.json').read_bytes())
 candidate=BASE/'generated/male-hair-brown-brow.vrm';pin=next(x for x in cycle['generated'] if x['path'].endswith('.vrm'));assert sha(SOURCE.read_bytes())==SOURCE_SHA and sha(candidate.read_bytes())==pin['sha256']
 g0,g1=mod.GLB(SOURCE),mod.GLB(candidate);d0,d1=g0.doc,g1.doc;failures=[]
 accessors=[]
 for i in range(len(d0['accessors'])):
  a,b=g0.acc(i),g1.acc(i);same=a.dtype==b.dtype and a.shape==b.shape and a.tobytes()==b.tobytes();accessors.append(dict(index=i,exact=same,sourceSHA256=sha(a.tobytes()),candidateSHA256=sha(b.tobytes())));assert same,('accessor',i)
 static=['nodes','meshes','skins','scenes','scene','textures','samplers','animations','extensionsUsed','extensionsRequired','asset'];identity={k:d0.get(k)==d1.get(k) for k in static};assert all(identity.values()),identity
 e0,e1=copy.deepcopy(d0['extensions']),copy.deepcopy(d1['extensions']);
 for x in (e0['VRMC_vrm']['meta'],e1['VRMC_vrm']['meta']):
  for k in ['thumbnailImage','name','version']:x.pop(k,None)
 assert e0==e1
 changedMaterials=[]
 for i,(a,b) in enumerate(zip(d0['materials'],d1['materials'])):
  if canon_material(g0,a)!=canon_material(g1,b):changedMaterials.append(dict(index=i,name=a['name'],source=canon_material(g0,a),candidate=canon_material(g1,b),consumers=consumers(g1,i)))
 # Native color calibration can bake into PNGs while leaving material JSON unchanged.
 imgs=[];changedImageIds=[]
 assert len(d0['images'])==len(d1['images'])
 for i in range(len(d0['images'])):
  a,b=raw(g0,i),raw(g1,i);row=dict(**image_info(g0,i),candidate=dict(**image_info(g1,i)),encodedExact=a==b,pixelsExact=bool(np.array_equal(np.asarray(Image.open(io.BytesIO(a)).convert('RGBA')),np.asarray(Image.open(io.BytesIO(b)).convert('RGBA')))),role='non-target')
  users=[m['name'] for m in d0['materials'] if any(y.get('source')==i for y in d0['textures'] if False)]
  if not row['encodedExact']:changedImageIds.append(i);row['role']='changed-or-export-thumbnail'
  imgs.append(row)
 assert len(changedImageIds)>=1
 changedMaterialImages=[]
 for mi,m in enumerate(d1['materials']):
  tex=m.get('pbrMetallicRoughness',{}).get('baseColorTexture')
  if tex:
   ii=d1['textures'][tex['index']]['source']
   if ii in changedImageIds: changedMaterialImages.append(dict(index=mi,name=m['name'],image=ii,consumers=consumers(g1,mi)))
 # Compare expression bindings and all original attributes, while preserving exact target identities.
 exprExact=d0['extensions']['VRMC_vrm']['expressions']==d1['extensions']['VRMC_vrm']['expressions'];assert exprExact
 for i in range(len(d0['materials'])):
  if d0['materials'][i]['name'].endswith('_EyeIris_00_EYE (Instance)') or '_EyeWhite_' in d0['materials'][i]['name'] or '_EyeHighlight_' in d0['materials'][i]['name']:
   assert canon_material(g0,d0['materials'][i])==canon_material(g1,d1['materials'][i])
 hairMi=next(i for i,m in enumerate(d0['materials']) if '_HAIR' in m['name'])
 hairTi=d0['materials'][hairMi]['pbrMetallicRoughness']['baseColorTexture']['index']; hairIi=d0['textures'][hairTi]['source']
 with out.joinpath('source-hair-main.png').open('xb') as f:f.write(raw(g0,hairIi))
 writeImage=lambda name,i:(out.joinpath(name).write_bytes(raw(g1,i)))
 # Extract every image referenced by changed hair/brow base maps.
 extracted=[]
 for row in changedMaterialImages:
  mi=row['index'];i=row['image'];name='changed-'+('hair' if '_HAIR' in row['name'] else 'brow')+'.png';writeImage(name,i);extracted.append(dict(material=row['name'],image=i,path=(out/name).relative_to(ROOT).as_posix(),sha256=sha(raw(g1,i)),bytes=len(raw(g1,i))))
 browIi=next((x['image'] for x in changedMaterialImages if '_FaceBrow_' in x['name']),None)
 if browIi is not None:
  (out/'source-brow.png').write_bytes(raw(g0,browIi));extracted.append(dict(material='source-brow',image=browIi,path=(out/'source-brow.png').relative_to(ROOT).as_posix(),sha256=sha(raw(g0,browIi)),bytes=len(raw(g0,browIi))))
 hairColdValues=lambda entry:{k:v for k,v in [(x['key'],x['value']) for m in entry for x in m['colors'] if x['key'] in ['Color','ShadeColor','OutlineColor']]}
 hairStateChanged=hairColdValues(cold['hairBefore'])!=hairColdValues(cold['hairReopened'])
 hairExportRepresented=any('_HAIR' in x['name'] for x in changedMaterialImages) or any((i in changedImageIds) for i,m in enumerate(d1['materials']) if '_HAIR' in m['name'] for i in [d1['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source']])
 failures=[]
 if hairStateChanged and not hairExportRepresented:failures.append('Hair native color values survived vroid cold reopen but were not represented by any exported hair material/image')
 status='failed-hair-export-not-represented-brow-exported' if failures else 'native-hair-brow-source-produced-runtime-pending'
 result=dict(schema='native-hair-brow-color-export-readback-v1',status=status,source=dict(path=SOURCE.relative_to(ROOT).as_posix(),sha256=SOURCE_SHA,bytes=SOURCE.stat().st_size),candidate=pin,targetColors=cycle['targetColors'],allAccessorsExact=True,accessorCount=len(accessors),jsonIdentity=identity,nonThumbnailExtensionsExact=True,changedMaterialImages=changedMaterialImages,images=imgs,changedImageIds=changedImageIds,extractedImages=extracted,hairColorStateChangedOnColdOpen=hairStateChanged,hairColorRepresentedInExport=hairExportRepresented,browColorRepresentedInExport=any('_FaceBrow_' in x['name'] for x in changedMaterialImages),eyeWhiteHighlightIrisUnchanged=True,expressionsExact=exprExact,skinAndBodyMaterialNames=[m['name'] for m in d1['materials'] if '_SKIN' in m['name']],nodes=len(d1['nodes']),skinJointCounts=[len(s['joints']) for s in d1['skins']],repeatedReadback='not rerun; byte identities fixed by source/candidate and image extraction',wallSeconds=time.monotonic()-start,failures=failures,limits=['Hair base color getter returns null in Bridge, so exported image/material evidence is required','Hair texture query retained known texture-is-not-editable errors','No game/runtime visual or resource admission','HairSet001 may not reuse this rule without its own source/material image ownership check','Dark brown RGB difference does not prove a particular visual hue under shader lighting'])
 with out.joinpath('result.json').open('xb') as f:f.write((json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode())
 print(json.dumps(dict(status=result['status'],accessorCount=len(accessors),changedMaterialImages=[x['name'] for x in changedMaterialImages],changedImageIds=changedImageIds,extracted=extracted)))
if __name__=='__main__':main()
