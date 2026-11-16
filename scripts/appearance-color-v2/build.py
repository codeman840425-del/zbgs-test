"""One authored iris-mask revision; no runtime, source VRM or v1 writes.
Rebuild in a temporary directory and compare using --verify.
"""
from pathlib import Path
import argparse, colorsys, hashlib, io, json, shutil, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, distance_transform_edt, label

ROOT = Path(__file__).resolve().parents[2]
V1 = ROOT / 'assets-source/appearance-color-v1'
DEST = ROOT / 'assets-source/appearance-color-v2'
sys.path.insert(0, str(ROOT / 'scripts/m2-male-face-v1'))
from glb import GLB

PROFILES = {
 'female': ('foundation/base-female-roundtrip.vrm', 'female'),
 'male': ('foundation/base-male-roundtrip.vrm', 'male'),
 'm1a-jaw-v1': ('m1-variants/m1a-jaw-v1/avatar.vrm', 'female'),
 'm1a-waisthip-v1': ('m1-variants/m1a-waisthip-v1/avatar.vrm', 'female'),
 'm2-male-jaw-v1': ('m2-male-face-v1/avatar.vrm', 'male'),
}
sha = lambda b: hashlib.sha256(b).hexdigest()
def write_json(p, d): p.write_text(json.dumps(d, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
def smooth(x):
 x = np.clip(x, 0, 1)
 return x*x*(3-2*x)
def material(g, token):
 return next((mi, pi, p, g.doc['materials'][p['material']]) for mi,m in enumerate(g.doc['meshes']) for pi,p in enumerate(m['primitives']) if token in g.doc['materials'][p['material']]['name'])
def texture(g, mat):
 ti=mat['pbrMetallicRoughness']['baseColorTexture']['index']; im=g.doc['images'][g.doc['textures'][ti]['source']]; bv=g.doc['bufferViews'][im['bufferView']]
 raw=g.bin[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]
 return raw, np.array(Image.open(io.BytesIO(raw)).convert('RGBA'))
def identity(g, token):
 mi,pi,p,m=material(g,token);raw,a=texture(g,m)
 return dict(material=m['name'],mesh=mi,primitive=pi,indexSha256=sha(g.acc(p['indices']).tobytes()),uvSha256=sha(g.acc(p['attributes']['TEXCOORD_0']).tobytes()),sourceImageSha256=sha(raw),decodedRgbaSha256=sha(a.tobytes()),imageSize=[a.shape[1],a.shape[0]],morphCount=len(p.get('targets',[])),morphTargetKeys=sorted({k for t in p.get('targets',[]) for k in t}))

def hue_preview(a, mask, target='#5e8b60'):
 # HSV in source's encoded RGB space, not a linear-light luminance claim.
 rgb=a[:,:,:3].astype(float)/255; hi=rgb.max(2);lo=rgb.min(2);d=hi-lo
 h=np.zeros_like(hi); nz=d>0
 r=(rgb[:,:,0]==hi)&nz;g=(~r)&(rgb[:,:,1]==hi)&nz;b=(~r)&(~g)&nz
 h[r]=((rgb[:,:,1][r]-rgb[:,:,2][r])/d[r])%6
 h[g]=(rgb[:,:,2][g]-rgb[:,:,0][g])/d[g]+2
 h[b]=(rgb[:,:,0][b]-rgb[:,:,1][b])/d[b]+4
 h/=6;s=np.divide(d,hi,out=np.zeros_like(hi),where=hi>0)
 th=colorsys.rgb_to_hsv(*[int(target[i:i+2],16)/255 for i in [1,3,5]])[0]
 h=(h+(((th-h+.5)%1)-.5)*(mask/255))%1
 sector=np.floor(h*6).astype(int);f=h*6-sector
 p=hi*(1-s);q=hi*(1-s*f);t=hi*(1-s*(1-f))
 choices=[(hi,t,p),(q,hi,p),(p,hi,t),(p,q,hi),(t,p,hi),(hi,p,q)]
 out=a.copy()
 for i,channels in enumerate(choices):
  pick=sector==i
  for j,c in enumerate(channels): out[:,:,j][pick]=np.floor(c[pick]*255+.5).astype('uint8')
 out[mask==0]=a[mask==0]
 return out

def build(out):
 out.mkdir(parents=True,exist_ok=True)
 old=json.loads((V1/'manifest.json').read_text(encoding='utf8'))
 runtime=json.loads((V1/'runtime-manifest.json').read_text(encoding='utf8'))
 report={'schema':'appearance-color-mask-source-v2','method':{'uvRaster':'Actual indexed EyeIris triangles, original glTF top-left v; Pillow polygon raster plus 2px filtering support','coverage':'UV support AND original alpha > 0; no ellipse and no global dark-pixel exclusion','pupilCore':{'centresUV':[[.25,.5],[.75,.5]],'searchRadiusUV':[.05078125,.1484375],'maxRGBInclusive':45,'connectedToCentre':True,'featherOutsidePixels':3,'scope':'Authored core for these exact two textures; not universal pupil segmentation'},'neutralGlint':'minRGB >= 210 AND maxRGB-minRGB <= 3 protected','colorOperation':'iris only: HSV shortest-arc hue interpolation by mask; retain source S/V and alpha. Lips keep v1 operation.','greenPreview':'#5e8b60, texture diagnostic only; no game render'},'baseMasks':{},'bodies':{},'checks':[],'dependencies':{}}
 dep=[V1/'manifest.json',V1/'runtime-manifest.json',V1/'female-outer-lip-mask.png',V1/'male-outer-lip-mask.png',ROOT/'scripts/m2-male-face-v1/glb.py',Path(__file__)]
 for body,(rel,sex) in PROFILES.items():
  path=ROOT/'prototype/public/assets'/rel;dep.append(path);g=GLB(path)
  bodysha=sha(path.read_bytes());assert bodysha==old['bodies'][body]['avatarSha256'],body
  ids={k:identity(g,t) for k,t in [('iris','EyeIris'),('lips','Face_00_SKIN')]}
  for k in ids:
   for field in ['material','indexSha256','uvSha256','sourceImageSha256','decodedRgbaSha256','imageSize']:
    assert ids[k][field]==old['bodies'][body]['identity'][k][field],(body,k,field)
   assert 'TEXCOORD_0' not in ids[k]['morphTargetKeys']
  mv=[v for group in g.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups'] for v in group.get('materialValues',[]) if v.get('materialName') in [i['material']for i in ids.values()]]
  assert not mv
  report['bodies'][body]={'avatarSha256':bodysha,'maskSet':sex,'identity':ids,'uvMorphAbsent':True,'materialValueBindings':mv,'exactV1Identity':True}
  if sex in report['baseMasks']:continue
  mi,pi,primitive,mat=material(g,'EyeIris');raw,a=texture(g,mat);height,width=a.shape[:2]
  uv=g.acc(primitive['attributes']['TEXCOORD_0']);tris=g.acc(primitive['indices']).reshape(-1,3)
  image=Image.new('L',(width,height));draw=ImageDraw.Draw(image)
  for tri in tris:draw.polygon([tuple(v*[width,height])for v in uv[tri]],fill=255)
  support=binary_dilation(np.array(image)>0,iterations=2)
  yy,xx=np.mgrid[:height,:width];hi=a[:,:,:3].max(2);lo=a[:,:,:3].min(2);core=np.zeros_like(hi,dtype=bool);components=[]
  for cx in [width*.25,width*.75]:
   search=((xx-cx)/(width*.05078125))**2+((yy-height*.5)/(height*.1484375))**2<1
   labels,_=label(search&(hi<=45)&(a[:,:,3]>0));lab=labels[height//2,int(cx)];assert lab>0
   part=labels==lab;core|=part
   ys,xs=np.where(part);components.append({'pixels':int(part.sum()),'bboxXY':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())]})
  glint=(lo>=210)&((hi.astype(int)-lo.astype(int))<=3)
  alpha=a[:,:,3]>0
  weight=smooth(distance_transform_edt(~core)/3)*support*alpha*(~glint)
  mask=np.floor(weight*255+.5).astype('uint8')
  Image.fromarray(mask).save(out/f'{sex}-iris-mask.png')
  shutil.copyfile(V1/f'{sex}-outer-lip-mask.png',out/f'{sex}-outer-lip-mask.png')
  Image.fromarray(a).save(out/f'{sex}-iris-source.png')
  preview=hue_preview(a,mask);Image.fromarray(preview).save(out/f'{sex}-iris-green-hue.png')
  # Both full eyes, transparent atlas rendered over a neutral backdrop for inspection.
  board=Image.new('RGB',(width,height*2),(224,224,224))
  for row,tex in enumerate([a,preview]):
   tile=Image.fromarray(tex);board.paste(tile,(0,row*height),tile)
  board.save(out/f'{sex}-source-green-comparison.png')
  before=a[:,:,:3].astype(int);after=preview[:,:,:3].astype(int)
  sv_exact_max=bool(np.array_equal(before.max(2),after.max(2)))
  sv_exact_min=bool(np.array_equal(before.min(2),after.min(2)))
  assert sv_exact_max and sv_exact_min
  assert np.array_equal(a[:,:,3],preview[:,:,3]) and np.array_equal(a[mask==0],preview[mask==0])
  assert np.all(mask[core]==0) and np.all(mask[~alpha]==0) and np.all(mask[glint]==0)
  far=support&alpha&(~glint)&(distance_transform_edt(~core)>=3)
  assert np.all(mask[far]==255)
  probes=[]
  for x,y in [(256,130),(256,155),(256,200),(256,256),(256,310),(140,250),(256,380)]:
   probes.append({'xy':[x,y],'source':a[y,x].tolist(),'mask':int(mask[y,x]),'greenHue':preview[y,x].tolist()})
  report['baseMasks'][sex]={'iris':{'file':f'{sex}-iris-mask.png','sha256':sha((out/f'{sex}-iris-mask.png').read_bytes()),'material':mat['name'],'mapSize':[width,height],'indexedTriangleCount':len(tris),'referencedVertexCount':len(np.unique(tris)),'uvBounds':[uv[np.unique(tris)].min(0).tolist(),uv[np.unique(tris)].max(0).tolist()],'pupilComponents':components,'corePixels':int(core.sum()),'fullPixels':int((mask==255).sum()),'featherPixels':int(((mask>0)&(mask<255)).sum()),'probes':probes},'lips':{'file':f'{sex}-outer-lip-mask.png','sha256':sha((out/f'{sex}-outer-lip-mask.png').read_bytes()),'v1BytesExact':True}}
  report['checks'].append({'sex':sex,'alphaExact':True,'maskZeroExact':True,'coreExact':True,'neutralGlintExact':True,'HSVValueExact8bit':sv_exact_max,'HSVChromaExtremaExact8bit':sv_exact_min,'allColoredSupportedPixelsOutsideCoreFeatherFullyCovered':True,'EyeWhiteAndEyeHighlight':'Separate source materials, not modified or included in runtime parts','previewNotGame':True})
 for variant in runtime['variants']:
  sex=report['bodies'][variant['bodyType']]['maskSet']
  for key in ['iris','lips']:
   mask=report['baseMasks'][sex][key];part=variant['parts'][key]
   part['maskUrl']='/assets/appearance-color-v2/'+mask['file'];part['maskSha256']=mask['sha256']
   if key=='iris':part['colorOperation']='hsv-hue-preserve-sv-v2'
 runtime['sourceVersion']='appearance-color-v2'
 write_json(out/'runtime-manifest.json',runtime)
 for f in dep:report['dependencies'][f.relative_to(ROOT).as_posix()]={'sha256':sha(f.read_bytes()),'bytes':f.stat().st_size}
 report['limits']=['CPU texture/UV checks only; actual gaze, blink, expressions, closeup lighting and neutral pupils must be checked in game.','Colored dark iris/limbus is recolored without changing its source S/V; only the central black core and neutral glints are source-RGB protected.','Original painted bright lower iris remains; no claim to redesign or soften its artwork.','No new body/fit identities; exactly the original five registrations.']
 write_json(out/'check-report.json',report)
 files={f.name:{'sha256':sha(f.read_bytes()),'bytes':f.stat().st_size} for f in sorted(out.iterdir()) if f.is_file()}
 write_json(out/'manifest.json',{'schema':'appearance-color-v2-source-package','files':files,'dependencies':report['dependencies']})
 return report

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--verify',action='store_true');args=parser.parse_args()
 if args.verify:
  with tempfile.TemporaryDirectory(prefix='iris-v2-') as d:
   result=build(Path(d));files=json.loads((Path(d)/'manifest.json').read_text())['files']
   for name in list(files)+['manifest.json']:assert (Path(d)/name).read_bytes()==(DEST/name).read_bytes(),name
  print(json.dumps({'verified':True,'files':len(files)+1,'bodyCount':len(result['bodies'])}))
 else:
  if (DEST/'manifest.json').exists():raise SystemExit('Output already frozen; use --verify. Do not overwrite source evidence.')
  result=build(DEST);print(json.dumps({'output':str(DEST),'checks':result['checks'],'bodies':len(result['bodies'])}))
