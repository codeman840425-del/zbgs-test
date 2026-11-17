from pathlib import Path
import json,struct,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
sha=lambda x:hashlib.sha256(x).hexdigest()
class GLB:
 def __init__(self,path):
  self.path=path;self.raw=(ROOT/path).read_bytes();n=struct.unpack_from('<I',self.raw,12)[0];self.doc=json.loads(self.raw[20:20+n]);self.bin=self.raw[28+n:]
 def acc(self,i):
  a=self.doc['accessors'][i];v=self.doc['bufferViews'][a['bufferView']];dt={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];offset=v.get('byteOffset',0)+a.get('byteOffset',0);item=np.dtype(dt).itemsize
  return np.ndarray((a['count'],size),dtype=dt,buffer=self.bin,offset=offset,strides=(v.get('byteStride',size*item),item)).copy()
 def image(self,i):
  v=self.doc['bufferViews'][self.doc['images'][i]['bufferView']];return self.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
 def material(self,i):
  def canonical(v,key=''):
   if isinstance(v,list):return [canonical(x) for x in v]
   if not isinstance(v,dict):return v
   if 'texture' in key.lower() and 'index' in v:
    t=self.doc['textures'][v['index']];return {**{k:canonical(x,k) for k,x in v.items() if k!='index'},'imageSHA':sha(self.image(t['source'])),'sampler':self.doc.get('samplers',[{}])[t.get('sampler',0)]}
   return {k:canonical(x,k) for k,x in v.items()}
  return canonical(self.doc['materials'][i])
import io,sys,importlib.util,copy
from PIL import Image
sys.dont_write_bytecode=True
source=GLB('assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm')
target=GLB('assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm')
new=GLB('assets-source/native-vroid-hair-color-study-v1/generated/male-hair-brown-brow.vrm')
expected=['a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da','7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81','2a6b72054b3dadd13f475ebc20b62527c1ba9bedfe2c0d98398b81e61a85c3d1']
for g,pin in zip([source,target,new],expected):assert sha(g.raw)==pin
checks=[]
for label,g in [('original-to-native-brow',new),('original-to-target',target)]:
 assert len(source.doc['accessors'])==len(g.doc['accessors'])==139
 access=[]
 for i,a in enumerate(source.doc['accessors']):
  assert source.acc(i).dtype==g.acc(i).dtype and source.acc(i).shape==g.acc(i).shape and source.acc(i).tobytes()==g.acc(i).tobytes()
  clean=lambda a:{k:v for k,v in a.items() if k not in ['bufferView','byteOffset']}
  assert clean(a)==clean(g.doc['accessors'][i]);access.append({'accessor':i,'packedSHA256':sha(source.acc(i).tobytes())})
 keys=['asset','scenes','scene','nodes','meshes','skins','materials','textures','samplers','animations','extensionsUsed','extensionsRequired','extensions']
 exact={k:source.doc.get(k)==g.doc.get(k)for k in keys}
 assert all(v for k,v in exact.items() if k!='extensions'),exact
 ea,eb=copy.deepcopy(source.doc['extensions']),copy.deepcopy(g.doc['extensions']);metaChanges={}
 for key in ['name','version']:
  va=ea['VRMC_vrm']['meta'].pop(key,None);vb=eb['VRMC_vrm']['meta'].pop(key,None)
  if va!=vb:metaChanges[key]={'source':va,'other':vb}
 assert ea==eb,'unexpected expression/spring/license extension change'
 exact['extensionsExceptRecordedNameVersion']=True
 checks.append({'pair':label,'allAccessorBytesAndMetadataExact':True,'accessors':access,'semanticJSONExact':exact,'metaLabelChanges':metaChanges})
mi=next(i for i,m in enumerate(source.doc['materials']) if '_FaceBrow_'in m['name']);material=source.doc['materials'][mi];ti=material['pbrMetallicRoughness']['baseColorTexture']['index'];ii=source.doc['textures'][ti]['source'];thumbnail=source.doc['extensions']['VRMC_vrm']['meta']['thumbnailImage']
images=[]
for i in range(len(source.doc['images'])):
 images.append({'image':i,'sourceSHA':sha(source.image(i)),'newSHA':sha(new.image(i)),'targetSHA':sha(target.image(i)),'originalNewExact':source.image(i)==new.image(i),'originalTargetExact':source.image(i)==target.image(i)})
assert [r['image'] for r in images if not r['originalNewExact']]==[ii,thumbnail]
assert [r['image'] for r in images if not r['originalTargetExact']]==[11]
consumers=[]
def scan(x,path):
 if isinstance(x,list):
  for i,v in enumerate(x):scan(v,path+[i])
 elif isinstance(x,dict):
  if 'index'in x and path and 'texture'in str(path[-1]).lower() and source.doc['textures'][x['index']]['source']==ii:consumers.append({'path':path,'info':x})
  for k,v in x.items():scan(v,path+[k])
scan(source.doc['materials'],['materials']);assert len(consumers)==2 and all(c['path'][1]==mi for c in consumers)
a=np.asarray(Image.open(io.BytesIO(source.image(ii))).convert('RGBA'));b=np.asarray(Image.open(io.BytesIO(new.image(ii))).convert('RGBA'));assert a.shape==b.shape and np.array_equal(a[:,:,3],b[:,:,3]);visible=a[:,:,3]>0;changed=np.any(a!=b,axis=2)
metrics={'dimensionsWH':[a.shape[1],a.shape[0]],'alphaExact':True,'visiblePixels':int(visible.sum()),'visibleRGBChanged':int((changed&visible).sum()),'inactiveAlphaZeroPixels':int((~visible).sum()),'inactiveRGBAChanged':int((changed&~visible).sum()),'RGBMaxAbsDifference':int(np.abs(a[:,:,:3].astype(int)-b[:,:,:3].astype(int)).max()),'visibleSourceRGBMean':a[:,:,:3][visible].mean(0).tolist(),'visibleNewRGBMean':b[:,:,:3][visible].mean(0).tolist()}
assert metrics['inactiveRGBAChanged']==0
protected=[]
for i,m in enumerate(source.doc['materials']):
 if any(k in m['name'] for k in ['_HAIR','_EyeIris_','_EyeWhite_','_EyeHighlight_','_SKIN']):
  tex=m.get('pbrMetallicRoughness',{}).get('baseColorTexture');image=source.doc['textures'][tex['index']]['source'];assert source.image(image)==new.image(image)
  protected.append({'name':m['name'],'image':image,'sourceNewPNGExact':True,'materialJSONExact':m==new.doc['materials'][i]})
staging=ROOT/'scripts/stage-native-eyebrow.py';spec=importlib.util.spec_from_file_location('stage_brow_audit',staging);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
stage=[]
for name,data in mod.resources().items():
 assert (ROOT/'prototype/public/assets/native-eyebrow-palette-v1'/name).read_bytes()==data;stage.append({'file':name,'sha256':sha(data),'bytes':len(data)})
assert stage[0]['sha256']=='acd3ec4703cac152890dda313f9b535d3efc5da3770fb4be28a4338e418e223a'
r={'schema':'native-eyebrow-source-independent-v1','status':'source-pass-runtime-pending','pins':{g.path:sha(g.raw)for g in [source,target,new]},'checks':checks,'images':images,'eyebrow':{'materialIndex':mi,'materialName':material['name'],'image':ii,'sourcePNG':sha(source.image(ii)),'newPNG':sha(new.image(ii)),'targetOriginalPNGExact':source.image(ii)==target.image(ii),'consumers':consumers,'pixels':metrics},'protectedMaterials':protected,'staging':stage,'scope':['One native eyebrow brown color; original hair color export failure remains.','Geometry/UV/skin/all57morph/expressions/material parameters exact; only brow image and thumbnail differ.','Image visibility/alpha-zero regions exact; no shader/GPU or combined transaction proof.']}
(OUT/'source-result.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'status':r['status'],'eyebrow':r['eyebrow'],'staging':stage},ensure_ascii=False))
