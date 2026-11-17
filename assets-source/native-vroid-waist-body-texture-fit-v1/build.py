"""Pinned native Waist mask/fit data. All outputs planned before conflict checks; byte-stable LF."""
from pathlib import Path
import argparse,copy,hashlib,importlib.util,io,json,subprocess,sys
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
encode=lambda value:(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
sp=importlib.util.spec_from_file_location('glb_reader',ROOT/'scripts/m2-male-face-v1/glb.py');gmod=importlib.util.module_from_spec(sp);sp.loader.exec_module(gmod)
def same(a,b):return a.dtype==b.dtype and a.shape==b.shape and a.tobytes()==b.tobytes()
def image(g,i):
 v=g.doc['bufferViews'][g.doc['images'][i]['bufferView']];return g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def body(g):
 found=[(mi,pi,p)for mi,m in enumerate(g.doc['meshes'])for pi,p in enumerate(m['primitives'])if '_Body_'in g.doc['materials'][p['material']]['name']and '_SKIN'in g.doc['materials'][p['material']]['name']];assert len(found)==1
 mi,pi,p=found[0];mat=g.doc['materials'][p['material']];base=mat['pbrMetallicRoughness']['baseColorTexture'];shade=mat['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture'];assert base['index']==shade['index']
 for info in [base,shade]:
  assert info.get('texCoord',0)==0 and set(info.get('extensions',{}))<={'KHR_texture_transform'}
  tr=info.get('extensions',{}).get('KHR_texture_transform',{});assert tr.get('texCoord',0)==0 and tr.get('offset',[0,0])==[0,0]and tr.get('scale',[1,1])==[1,1]and tr.get('rotation',0)==0
 t=g.doc['textures'][base['index']];sam=g.doc['samplers'][t['sampler']];assert sam['minFilter']==sam['magFilter']==9729 and sam.get('wrapS',10497)==sam.get('wrapT',10497)==10497
 assert mat['alphaMode']=='MASK'and mat.get('alphaCutoff',.5)==.5
 consumers=[]
 def walk(x,path,material):
  if isinstance(x,dict):
   for k,v in x.items():
    if 'texture'in k.lower()and isinstance(v,dict)and 'index'in v and g.doc['textures'][v['index']]['source']==t['source']:consumers.append({'material':material,'path':path+'/'+k})
    else:walk(v,path+'/'+k,material)
  elif isinstance(x,list):
   for i,v in enumerate(x):walk(v,path+'/'+str(i),material)
 for i,m in enumerate(g.doc['materials']):walk(m,'',i)
 assert consumers==[{'material':p['material'],'path':'/pbrMetallicRoughness/baseColorTexture'},{'material':p['material'],'path':'/extensions/VRMC_materials_mtoon/shadeMultiplyTexture'}]
 return p,mat,image(g,t['source']),{'mesh':mi,'primitive':pi,'material':p['material'],'image':t['source'],'texture':base['index'],'baseTextureInfo':base,'shadeTextureInfo':shade,'effectiveUV':0,'effectiveTransformIdentity':True,'sampler':sam,'consumers':consumers}
def plan():
 spec=json.loads((BASE/'spec.json').read_text(encoding='utf8'));inputs={}
 for k,v in spec.items():
  if isinstance(v,dict)and 'path'in v:
   b=(ROOT/v['path']).read_bytes();assert sha(b)==v['sha256'],k;inputs[k]=v
 gs={k:gmod.GLB(ROOT/inputs[k]['path'])for k in ['avatar','nativeMasked','originalFemale','completeSkinDonor']}
 g,raw,old,don=(gs[k]for k in ['avatar','nativeMasked','originalFemale','completeSkinDonor']);AS=inputs['avatar']['sha256'];p,mat,full,consumer=body(g);rp,rmat,mask,rc=body(raw);op,omat,oldMask,oc=body(old);dp,dmat,donorPNG,dc=body(don)
 assert mat==rmat==omat==dmat and consumer==rc==oc==dc
 assert mask==oldMask==(ROOT/inputs['oldMask']['path']).read_bytes();assert full==donorPNG
 a,b=np.asarray(Image.open(io.BytesIO(full)).convert('RGBA')),np.asarray(Image.open(io.BytesIO(mask)).convert('RGBA'));assert a.shape==b.shape==(2048,2048,4)and np.all(a[:,:,3]==255)and np.array_equal(a[:,:,:3],b[:,:,:3])
 assert g.doc['nodes']==raw.doc['nodes']and g.doc['skins']==raw.doc['skins']and g.doc['meshes']==raw.doc['meshes'];assert g.doc['extensions']==raw.doc['extensions']
 assert len(g.doc['accessors'])==len(raw.doc['accessors'])
 for i in range(len(g.doc['accessors'])):assert same(g.acc(i),raw.acc(i)),i
 ids=np.unique(g.acc(p['indices']));assert same(g.acc(p['indices']),old.acc(op['indices']))
 for attr in ['TEXCOORD_0','JOINTS_0','WEIGHTS_0']:assert same(g.acc(p['attributes'][attr])[ids],old.acc(op['attributes'][attr])[ids]),attr
 delta=g.acc(p['attributes']['POSITION'])[ids].astype(float)-old.acc(op['attributes']['POSITION'])[ids];assert np.any(delta)
 catalog=json.loads((ROOT/inputs['equipment']['path']).read_text(encoding='utf8'));assert len(catalog['items'])==3;rules=[];equipment=[]
 for entry in catalog['items']:
  assert entry['compatibleAvatarSha256']==AS and entry['slot']in ['top','bottom','shoes'];path=Path(inputs['equipment']['path']).parent/entry['url'];bytes=(ROOT/path).read_bytes();assert sha(bytes)==entry['sha256']and len(bytes)==entry['bytes']
  own=gmod.GLB(ROOT/path);ep=own.doc['meshes'][0]['primitives'][0];source=g.doc['meshes'][own.doc['extras']['sourceMesh']]['primitives'][own.doc['extras']['sourcePrimitive']];assert same(own.acc(ep['indices']),g.acc(source['indices']))
  for attr,ai in source['attributes'].items():assert same(g.acc(ai),own.acc(ep['attributes'][attr]))
  skin=g.doc['skins'][1];assert own.doc['skins'][0]['joints']==skin['joints'];ibm=g.acc(skin['inverseBindMatrices']);assert same(ibm,own.acc(own.doc['skins'][0]['inverseBindMatrices']))
  assert len(entry['bindings'])==len(skin['joints'])
  for i,bind in enumerate(entry['bindings']):assert bind['sourceBone']==bind['targetRawBone']==g.doc['nodes'][skin['joints'][i]]['name'] and np.array_equal(ibm[i].astype(float),bind['inverseBindMatrix'])
  rules.append({k:entry[k]for k in ['id','slot','sha256','compatibleAvatarSha256']}|{'covered':entry['slot']=='top','required':True})
  equipment.append({'id':entry['id'],'path':path.as_posix(),'sha256':entry['sha256'],'bindings':len(entry['bindings']),'actualSourceAttributesAndIBMExact':True})
 assert {r['slot']for r in rules}=={'top','bottom','shoes'}
 floor=json.loads(subprocess.run(['node',str(BASE/'measure-floor.mjs')],cwd=ROOT,check=True,capture_output=True,text=True,encoding='utf8').stdout);assert floor['avatarSha256']==AS;row=floor['rows'][0]
 manifest={'schema':'native-body-texture-coverage-v1','id':'native-vroid-waist-geometry-body-texture-fit-v1','avatarSha256':AS,'materialName':mat['name'],'width':2048,'height':2048,'alphaTest':.5,'basePngSha256':sha(full),'covered':{'url':'native-tops-body.png','sha256':sha(mask)},'rgbPreserved':True,'equipment':rules,'sourceMaskLineage':{'nativeWaistMaskedVRM':inputs['nativeMasked'],'oldMask':inputs['oldMask'],'reason':'Actual native Waist export Body PNG equals prior native Top mask; Body indexed UV, sampler, base/shade and RGB verified. Shape and garment contact remain separate.'},'scope':'Only same-source Waist three garments; mask active for top only; no new fit/visual admission or license expansion'}
 pixels={'schema':'native-waist-body-texture-readback-v1','inputs':inputs,'bodyConsumer':consumer,'nativeWaistBodyPNGIsMaskExact':True,'completeDonorPNGExact':True,'RGBExact':True,'alphaChangedPixels':int(np.count_nonzero(a[:,:,3]!=b[:,:,3])),'baseAllOpaque':True,'actualBodyUVIndicesJointsWeightsExactOriginal':True,'waistBodyChangedVertices':int(np.count_nonzero(np.any(delta!=0,axis=1))),'waistBodyMaxPositionDeltaM':float(np.max(np.linalg.norm(delta,axis=1))),'unmaskAllAccessorsNodesSkinExpressionsSpringExactNative':True,'equipment':equipment,'floorScriptSha256':sha((BASE/'measure-floor.mjs').read_bytes()),'readerSha256':sha((ROOT/'scripts/m2-male-face-v1/glb.py').read_bytes()),'runtimeAccepted':False}
 profile={'schema':'native-waist-factory-profile-input-v1','status':'data-only-not-registered','suggestedBodyType':'native-female-waist-v1','profile':{'id':'native-vroid-waist-geometry-unmasked-v1','url':'../native-vroid-geometry-factory-input-v1/generated/female-geometry-waist-unmasked.vrm','sha256':AS,'manifestUrl':'../native-vroid-waist-factory-equipment-v1/equipment.json','sourceFloorY':row['runtimeRestMinY'],'sourceRawFloorY':row['rawPositionMinY'],'baseBodyDisplay':'source-with-hair','bodyTextureCoverage':{'url':'manifest.json','sha256':sha(encode(manifest))},'ids':{('shorts'if e['slot']=='bottom'else e['slot']):e['id']for e in rules},'defaultOutfit':{'index':0,'role':'shorts','bottomRole':'shorts','equipmentRoles':['top','shorts','shoes']},'seatLayerThickness':0,'fitStatus':'Own Waist source/mask/skin CPU input only; gameplay/contact/expressions/visual pending'},'pending':['Own runtime identity admission; no inherited Face fit','Same-room clothing/skin coverage and motion contact','Expression and restore verification']}
 lineage={'schema':'native-waist-skin-mask-lineage-v1','inputs':inputs,'nativeWaistMeta':raw.doc['extensions']['VRMC_vrm']['meta'],'originalMaskMeta':old.doc['extensions']['VRMC_vrm']['meta'],'scope':'Internal technical specimen; exact original native RGBA reuse; no enlargement of source metadata license','production':'Native Waist saved/reopened by menu and exported; no process cold restart claimed; this package CPU only'}
 return {'manifest.json':encode(manifest),'native-tops-body.png':mask,'pixel-readback.json':encode(pixels),'floor-readback.json':encode(floor),'profile-candidate.json':encode(profile),'source-lineage.json':encode(lineage)}
def build(out=BASE,check=False):
 outputs=plan()
 for name,data in outputs.items():
  p=out/name
  if p.exists()and p.read_bytes()!=data:raise ValueError('Output conflict: '+name)
  if check and not p.exists():raise FileNotFoundError('Missing output: '+name)
 if not check:
  for name,data in outputs.items():
   p=out/name
   if not p.exists():p.parent.mkdir(parents=True,exist_ok=True);p.open('xb').write(data)
 return {'status':'checked'if check else'built','files':{n:{'sha256':sha(b),'bytes':len(b)}for n,b in outputs.items()},'encoding':'UTF-8 LF; exact PNG unchanged'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args();print(json.dumps(build(check=args.check)))
