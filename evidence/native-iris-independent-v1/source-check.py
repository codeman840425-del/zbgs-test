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
import io,copy
from PIL import Image
source=GLB('assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm')
target=GLB('assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm')
new=GLB('assets-source/native-vroid-iris-study-v1/generated/male-iris-green.vrm')
pins=['a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da','7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81','bbe292aa51dcb1a6cb455ec87b0156b332574f456a9d36df62305657f406d51f']
for g,h in zip([source,target,new],pins):assert sha(g.raw)==h
keys=['asset','scene','scenes','nodes','meshes','skins','materials','textures','samplers','animations','extensionsUsed','extensionsRequired','extensions']
checks={}
for label,g in [('nativeEdit',new),('runtimeTarget',target)]:
 same={k:source.doc.get(k)==g.doc.get(k) for k in keys};assert all(same.values()),same
 assert len(source.doc['accessors'])==len(g.doc['accessors'])
 access=[]
 for i,a in enumerate(source.doc['accessors']):
  b=g.doc['accessors'][i];clean=lambda x:{k:v for k,v in x.items() if k not in ['bufferView','byteOffset']}
  assert clean(a)==clean(b)
  assert source.acc(i).tobytes()==g.acc(i).tobytes()
  access.append({'accessor':i,'type':a['type'],'componentType':a['componentType'],'count':a['count'],'packedSHA256':sha(source.acc(i).tobytes())})
 checks[label]={'allSemanticJSONExact':same,'allAccessorMetadataAndBytesExact':True,'accessors':access}
mi=next(i for i,m in enumerate(source.doc['materials']) if '_EyeIris_' in m['name'])
m=source.doc['materials'][mi];ti=m['pbrMetallicRoughness']['baseColorTexture']['index'];ii=source.doc['textures'][ti]['source'];thumbnail=source.doc['extensions']['VRMC_vrm']['meta']['thumbnailImage']
images=[]
for i in range(len(source.doc['images'])):
 images.append({'image':i,'sourceSHA256':sha(source.image(i)),'newSHA256':sha(new.image(i)),'targetSHA256':sha(target.image(i)),'sourceNewExact':source.image(i)==new.image(i),'sourceTargetExact':source.image(i)==target.image(i),'thumbnail':i==thumbnail})
assert [r['image']for r in images if not r['sourceNewExact']]==[ii,thumbnail]
bodyMi=next(i for i,m in enumerate(source.doc['materials']) if '_Body_' in m['name'] and '_SKIN' in m['name'])
bodyIi=source.doc['textures'][source.doc['materials'][bodyMi]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
assert [r['image']for r in images if not r['sourceTargetExact']]==[bodyIi]
# Compare every non-image buffer view, including any unused data, by view identity and bytes.
imgviews={im['bufferView']for im in source.doc['images']}
nonimage=[]
for i,v in enumerate(source.doc['bufferViews']):
 if i in imgviews:continue
 a=source.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
 for g in [new,target]:
  w=g.doc['bufferViews'][i];b=g.bin[w.get('byteOffset',0):w.get('byteOffset',0)+w['byteLength']];assert a==b
 nonimage.append({'view':i,'sha256':sha(a),'bytes':len(a)})
consumers=[]
def scan(v,path):
 if isinstance(v,list):
  for i,x in enumerate(v):scan(x,path+[i])
 elif isinstance(v,dict):
  if 'index' in v and path and 'texture' in str(path[-1]).lower() and source.doc['textures'][v['index']]['source']==ii:consumers.append({'path':path,'textureInfo':v,'texture':source.doc['textures'][v['index']]})
  for k,x in v.items():scan(x,path+[k])
scan(source.doc['materials'],['materials'])
assert len(consumers)==2 and all(c['path'][1]==mi for c in consumers)
raw0,raw1=source.image(ii),new.image(ii)
assert sha(raw1)=='9ae7830f3840c8bcc17047fe974eabf9090140c84b275a182ef75b6192076c2d'
assert raw0==target.image(ii)
a=np.asarray(Image.open(io.BytesIO(raw0)).convert('RGBA'));b=np.asarray(Image.open(io.BytesIO(raw1)).convert('RGBA'));assert a.shape==b.shape and np.array_equal(a[:,:,3],b[:,:,3])
visible=a[:,:,3]>0;changed=np.any(a[:,:,:3]!=b[:,:,:3],axis=2);black=np.all(a[:,:,:3]==0,axis=2)&visible;white=np.all(a[:,:,:3]==255,axis=2)&visible;dark=(a[:,:,:3].max(2)<=32)&visible
# Fixed diagnostic ROIs encompass the visibly dark central pupil and the top-right painted patch, not anatomical segmentations.
roi=[]
for name,rect in [('left-dark-center',[238,240,282,286]),('right-dark-center',[750,240,794,286]),('left-painted-patch',[306,180,324,210])]:
 x0,y0,x1,y1=rect;x=a[y0:y1,x0:x1];y=b[y0:y1,x0:x1];v=x[:,:,3]>0
 roi.append({'label':name,'rectangleXYXY':rect,'sourceMeanRGB':x[:,:,:3][v].mean(0).tolist(),'newMeanRGB':y[:,:,:3][v].mean(0).tolist(),'visiblePixels':int(v.sum()),'RGBChangedPixels':int((np.any(x[:,:,:3]!=y[:,:,:3],axis=2)&v).sum()),'notAnatomicalMask':True})
protected=[]
for j,mat in enumerate(source.doc['materials']):
 if '_EyeWhite_'in mat['name'] or '_EyeHighlight_'in mat['name']:
  image=source.doc['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source'];assert source.image(image)==new.image(image)==target.image(image)
  protected.append({'material':j,'name':mat['name'],'image':image,'SHA256':sha(source.image(image)),'allThreeExact':True})
metrics={'dimensionsWH':[a.shape[1],a.shape[0]],'alphaExact':True,'visiblePixels':int(visible.sum()),'RGBChangedPixels':int(changed.sum()),'visibleRGBChangedPixels':int((changed&visible).sum()),'transparentRGBChangedPixels':int((changed&~visible).sum()),'sourceVisiblePureBlackPixels':int(black.sum()),'pureBlackPixelsChanged':int((changed&black).sum()),'sourceVisiblePureWhitePixels':int(white.sum()),'pureWhitePixelsChanged':int((changed&white).sum()),'sourceDarkMaxRGB32Pixels':int(dark.sum()),'sourceDarkMaxRGB32ChangedPixels':int((changed&dark).sum()),'diagnosticROIs':roi,'samplePixelXY256_260':{'source':a[260,256].tolist(),'new':b[260,256].tolist()}}
result={'schema':'native-iris-source-independent-v1','status':'source-readback-pass-runtime-pending','pins':{g.path:sha(g.raw)for g in [source,target,new]},'pairChecks':checks,'images':images,'nonImageBufferViews':nonimage,'iris':{'material':mi,'image':ii,'sourcePNG_SHA256':sha(raw0),'newPNG_SHA256':sha(raw1),'targetOriginalPNGExact':True,'consumers':consumers,'pixelMetrics':metrics},'separateEyeWhiteHighlight':protected,'interpretation':['a18 to bbe changes only iris image and export thumbnail; actual geometry, UV, skin, expressions and material parameters exact.','7586 differs from a18 only by Body image; iris PNG/consumer UV/material/bind/expression baseline exact. Native green image is eligible for a pinned iris-only runtime mapping, not replacing whole bbe avatar.','Native recolor also changes dark central RGB and painted highlight RGB inside the iris image; alpha and separate EyeWhite/Highlight assets exact. No claim all pupil pixels unchanged.'],'scope':'One source, one paired native green color; no GPU, editor, new asset export, runtime or universal palette acceptance.'}
(OUT/'source-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'status':result['status'],'accessors':len(checks['nativeEdit']['accessors']),'images':len(images),'pixelMetrics':metrics},ensure_ascii=False))
