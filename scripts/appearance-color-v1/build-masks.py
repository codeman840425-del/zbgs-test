"""Bounded eye/lip texture-mask specimens from actual material/UV topology.
No original textures, geometry, morphs or runtime files are changed.
"""
from pathlib import Path
import sys,json,hashlib,io,collections
import numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import distance_transform_edt, label, binary_dilation
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/appearance-color-v1';OUT.mkdir(exist_ok=True,parents=True)
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'));from glb import GLB
PROFILES={
 'female':('foundation/base-female-roundtrip.vrm','female'),
 'male':('foundation/base-male-roundtrip.vrm','male'),
 'm1a-jaw-v1':('m1-variants/m1a-jaw-v1/avatar.vrm','female'),
 'm1a-waisthip-v1':('m1-variants/m1a-waisthip-v1/avatar.vrm','female'),
 'm2-male-jaw-v1':('m2-male-face-v1/avatar.vrm','male'),
}
def sha(b):return hashlib.sha256(b).hexdigest()
def smooth(x):x=np.clip(x,0,1);return x*x*(3-2*x)
def material(g,suffix):return next((mi,pi,p,g.doc['materials'][p['material']])for mi,m in enumerate(g.doc['meshes'])for pi,p in enumerate(m['primitives'])if suffix in g.doc['materials'][p['material']]['name'])
def texture(g,m):
 ti=m['pbrMetallicRoughness']['baseColorTexture']['index'];im=g.doc['images'][g.doc['textures'][ti]['source']];v=g.doc['bufferViews'][im['bufferView']];raw=g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];return raw,np.array(Image.open(io.BytesIO(raw)).convert('RGBA'))
def identity(g,suffix):
 mi,pi,p,m=material(g,suffix);raw,a=texture(g,m)
 return {'material':m['name'],'mesh':mi,'primitive':pi,'indexSha256':sha(g.acc(p['indices']).tobytes()),'uvSha256':sha(g.acc(p['attributes']['TEXCOORD_0']).tobytes()),'sourceImageSha256':sha(raw),'decodedRgbaSha256':sha(a.tobytes()),'imageSize':[a.shape[1],a.shape[0]],'morphCount':len(p.get('targets',[])),'morphTargetKeys':sorted(set(k for target in p.get('targets',[])for k in target))}
def save_mask(path,a):
 v=np.round(a*255).clip(0,255).astype('uint8');Image.fromarray(v).save(path);return {'file':path.name,'sha256':sha(path.read_bytes()),'nonzeroPixels':int(np.count_nonzero(v)),'channel':'red/luminance','encoding':'8-bit linear weight, NOT sRGB color','uvConvention':'image top-left y equals glTF TEXCOORD_0.v; image/texture flipY=false','size':[v.shape[1],v.shape[0]]}
def preview(tex,mask,color):
 # Offline-only review swatch; runtime may use its own color operation.
 rgb=tex[:,:,:3].astype(float);target=np.array(color,dtype=float);value=rgb.max(2)/255
 out=tex.copy();out[:,:,:3]=np.round(rgb*(1-mask[:,:,None])+target[None,None,:]*value[:,:,None]*mask[:,:,None]).astype('uint8');return out
base={};report={'schema':'appearance-color-mask-v1','bodies':{},'baseMasks':{},'limits':['Author mask sample, not actual game expression/lighting acceptance.','No global material recoloring for iris or lip: both contain protected pixels.']}
for sex in ['female','male']:
 g=GLB(ROOT/'prototype/public/assets'/PROFILES[sex][0]);base[sex]=g
 mi,pi,p,m=material(g,'EyeIris');raw,eye=texture(g,m);h,w=eye.shape[:2];yy,xx=np.mgrid[:h,:w];mask=np.zeros((h,w),dtype=float)
 # Both source atlases visibly contain an iris/pupil at each quarter. Bounds
 # deliberately remain inside the painted limbus. Keep central pupil+soft edge.
 for cx in [w*.25,w*.75]:
  outer=np.sqrt(((xx-cx)/(w*.112))**2+((yy-h*.5)/(h*.252))**2)
  domain=((xx-cx)/(w*.05078125))**2+((yy-h*.5)/(h*.1484375))**2<1
  labels,_=label(domain&(eye[:,:,:3].max(2)<64));centreLabel=labels[int(h*.5),int(cx)]
  assert centreLabel>0
  pupil=binary_dilation(labels==centreLabel,iterations=1)
  pupilWeight=smooth(distance_transform_edt(~pupil)/3)
  mask=np.maximum(mask,smooth((1-outer)/.08)*pupilWeight)
 # Retain any authored very dark pupil/limbus and bright neutral reflection.
 bright=eye[:,:,:3].max(2)/255;neutral=eye[:,:,:3].min(2)/255
 mask*=smooth((bright-.13)/.08)*(1-smooth((neutral-.82)/.12))*(eye[:,:,3]/255)
 iris=save_mask(OUT/(sex+'-iris-mask.png'),mask)
 iris.update({'material':m['name'],'protectedPupilMethod':{'centresUV':[[.25,.5],[.75,.5]],'boundedSearchRadiiUV':[.05078125,.1484375],'maxRgbThreshold':64,'connectedToCentre':True,'dilatePixels':1,'featherPixels':3},'outerEllipseRadiiUV':[.112,.252],'method':'Bounded authored annulus + source-dark connected pupil component + original alpha; central pupil and bright-neutral reflections unchanged. Original EyeWhite/EyeHighlight materials untouched.'})
 Image.fromarray(preview(eye,mask,[65,160,122])).save(OUT/(sex+'-iris-green-swatch.png'))
 mi,pi,p,m=material(g,'Face_00_SKIN');raw,face=texture(g,m);uv=g.acc(p['attributes']['TEXCOORD_0']);tris=g.acc(p['indices']).reshape(-1,3)
 edgeCounts=collections.Counter(tuple(sorted((int(a),int(b))))for tri in tris for a,b in zip(tri,np.roll(tri,-1)))
 boundary=[e for e,n in edgeCounts.items()if n==1 and all(.42<uv[v,0]<.58 and .73<uv[v,1]<.79 for v in e)]
 assert len(boundary)==32
 ring=set(v for e in boundary for v in e);adj=collections.Counter(v for e in boundary for v in e);assert all(n==2 for n in adj.values())
 # A complete single manifold loop in the actual Face_SKIN mouth opening.
 selected=np.array([i for i,t in enumerate(tris)if any(int(v)in ring for v in t)])
 h,w=face.shape[:2];region=Image.new('L',(w,h));d=ImageDraw.Draw(region)
 for t in tris[selected]:d.polygon([tuple(v*[w,h])for v in uv[t]],fill=255)
 binary=np.array(region)>0;dist=distance_transform_edt(binary);lip=np.minimum(dist/2,1)*binary
 # Preserve the original white lip glint; teeth/tongue are another material.
 lip*=1-smooth((face[:,:,:3].min(2)/255-.87)/.1)
 lips=save_mask(OUT/(sex+'-outer-lip-mask.png'),lip)
 used=np.unique(tris[selected]);v=g.acc(p['attributes']['POSITION'])
 lips.update({'material':m['name'],'mouthBoundaryVertices':sorted(ring),'mouthBoundaryEdges':[list(e)for e in boundary],'selectedFaceIndices':selected.tolist(),'selectedVertices':used.tolist(),'uvBounds':[uv[used].min(0).tolist(),uv[used].max(0).tolist()],'sourceBoundsM':[v[used].min(0).tolist(),v[used].max(0).tolist()],'method':'Only one face ring incident on the real Face_SKIN mouth boundary; 2px inward feather. Mouth cavity is absent from this ring. Preserve bright lip glint. Not a broad ellipse on the face.'})
 Image.fromarray(preview(face,lip,[165,57,82])).save(OUT/(sex+'-lip-rose-swatch.png'))
 overlay=Image.fromarray(face.copy());d=ImageDraw.Draw(overlay)
 for t in tris[selected]:d.line([tuple(v*[w,h])for v in uv[np.r_[t,t[0]]]],fill=(0,180,80,255),width=1)
 for a,b in boundary:d.line([tuple(uv[a]*[w,h]),tuple(uv[b]*[w,h])],fill=(20,40,240,255),width=1)
 overlay.crop((int(w*.40),int(h*.72),int(w*.60),int(h*.79))).resize((820,288)).save(OUT/(sex+'-lip-topology-review.png'))
 Image.fromarray(preview(face,lip,[165,57,82])).crop((int(w*.40),int(h*.72),int(w*.60),int(h*.79))).resize((820,288)).save(OUT/(sex+'-lip-swatch-close.png'))
 report['baseMasks'][sex]={'iris':iris,'lips':lips,'identity':{'iris':identity(g,'EyeIris'),'lips':identity(g,'Face_00_SKIN')}}
for body,(path,sex) in PROFILES.items():
 f=ROOT/'prototype/public/assets'/path;g=GLB(f);ids={'iris':identity(g,'EyeIris'),'lips':identity(g,'Face_00_SKIN')};expected=report['baseMasks'][sex]['identity']
 checks={kind:{k:ids[kind][k]==expected[kind][k]for k in ['material','indexSha256','uvSha256','sourceImageSha256','decodedRgbaSha256','imageSize']}for kind in ids}
 assert all(all(c.values())for c in checks.values()),(body,checks)
 assert all('TEXCOORD_0'not in ids[kind]['morphTargetKeys']for kind in ids)
 report['bodies'][body]={'avatarSha256':sha(f.read_bytes()),'maskSet':sex,'identity':ids,'exactReferenceChecks':checks,'uvMorphAbsent':True,'materialValueBindings':[v for group in g.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']for v in group.get('materialValues',[])if v.get('materialName')in [ids['iris']['material'],ids['lips']['material']]]}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'bodies':list(report['bodies']),'masks':{sex:{k:(d[k]['nonzeroPixels'],len(d[k].get('selectedFaceIndices',[])))for k in ['iris','lips']}for sex,d in report['baseMasks'].items()}}))

runtime={'schema':'character-facial-palette-v1','variants':[]}
for body,data in report['bodies'].items():
 parts={}
 for kind in ['iris','lips']:
  m=report['baseMasks'][data['maskSet']][kind];ident=data['identity'][kind]
  parts[kind]={'materialName':ident['material'],'maskUrl':'/assets/appearance-color-v1/'+m['file'],'maskSha256':m['sha256'],'mapSize':ident['imageSize'],'sourceMapSha256':ident['sourceImageSha256'],'uvSha256':ident['uvSha256'],'maskChannel':'r','imageYEqualsUVv':True,'preserveAlpha':True}
 runtime['variants'].append({'bodyType':body,'avatarSha256':data['avatarSha256'],'parts':parts})
(OUT/'runtime-manifest.json').write_text(json.dumps(runtime,indent=2,ensure_ascii=False),encoding='utf-8')
