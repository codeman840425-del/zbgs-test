"""Generate one editable neutral iris substrate from exact v2 UV/alpha/core.
No public/runtime/v1/v2 writes; verify reconstructs in a temporary directory.
"""
from pathlib import Path
import argparse, hashlib, importlib.util, json, shutil, tempfile
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter, label

ROOT=Path(__file__).resolve().parents[2]
V2=ROOT/'assets-source/appearance-color-v2'
DEST=ROOT/'assets-source/appearance-color-v3'
PARAMS=DEST/'parameters.json'
sha=lambda b:hashlib.sha256(b).hexdigest()
def write_json(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
spec=importlib.util.spec_from_file_location('iris_v2_source',ROOT/'scripts/appearance-color-v2/build.py')
v2=importlib.util.module_from_spec(spec);spec.loader.exec_module(v2)

def build(out):
 out.mkdir(parents=True,exist_ok=True);cfg=json.loads(PARAMS.read_text(encoding='utf8'))
 source_manifest=json.loads((V2/'manifest.json').read_text(encoding='utf8'))
 for name,meta in source_manifest['files'].items():assert sha((V2/name).read_bytes())==meta['sha256'],name
 for name,meta in source_manifest['dependencies'].items():assert sha((ROOT/name).read_bytes())==meta['sha256'],name
 runtime=json.loads((V2/'runtime-manifest.json').read_text(encoding='utf8'))
 source_report=json.loads((V2/'check-report.json').read_text(encoding='utf8'))
 report={'schema':'authored-neutral-iris-v3-check','parameters':cfg,'sourceManifestSha256':sha((V2/'manifest.json').read_bytes()),'bodies':source_report['bodies'],'checks':{},'limits':['Texture source candidate only; no actual GPU/lighting/expressions accepted.','Brightness and saturation are intentionally no longer copied from the original large lower reflection.','No change to eye geometry, gaze pivots, source core, alpha, separate white/highlight materials, or lips.']}
 dep=[PARAMS,Path(__file__),ROOT/'scripts/appearance-color-v2/build.py',V2/'manifest.json',V2/'runtime-manifest.json']
 for sex in ['female','male']:
  source=V2/f'{sex}-iris-source.png';a=np.array(Image.open(source).convert('RGBA'))
  maskpath=V2/f'{sex}-iris-mask.png';mask=np.array(Image.open(maskpath));height,width=mask.shape
  dep.extend([source,maskpath,V2/f'{sex}-outer-lip-mask.png',V2/f'{sex}-iris-green-hue.png'])
  yy,xx=np.mgrid[:height,:width];hi=a[:,:,:3].max(2)
  neutral=a.copy();gray=np.zeros(mask.shape,dtype=float);outer_distance=np.zeros(mask.shape);core_all=np.zeros(mask.shape,bool);eye_records=[]
  # Explicit source high frequencies only, bounded to +/-2 encoded gray levels.
  luma=a[:,:,:3].astype(float)@np.array([.2126,.7152,.0722])
  detail=np.clip(gaussian_filter(luma,cfg['sourceDetailBlurSigma'][0])-gaussian_filter(luma,cfg['sourceDetailBlurSigma'][1]),-cfg['sourceDetailMaxGray'],cfg['sourceDetailMaxGray'])
  for eye,cx in enumerate([width*.25,width*.75]):
   half=(xx<width/2) if eye==0 else (xx>=width/2)
   # Actual opaque iris component defines silhouette, not an arbitrary outer ellipse.
   labels,_=label((a[:,:,3]>=128)&half);lab=labels[height//2,int(cx)];assert lab>0
   silhouette=labels==lab;ys,xs=np.where(silhouette);x0,x1=xs.min(),xs.max();y0,y1=ys.min(),ys.max()
   search=((xx-cx)/(width*.05078125))**2+((yy-height*.5)/(height*.1484375))**2<1
   labels,_=label(search&(hi<=45)&(a[:,:,3]>0));lab=labels[height//2,int(cx)];assert lab>0
   core=labels==lab;assert np.all(mask[core]==0);core_all|=core
   cy,cxx=np.argwhere(core).mean(0)
   outside_core=distance_transform_edt(~core)
   inside=distance_transform_edt(silhouette);outer_distance[half]=inside[half]
   vertical=v2.smooth((yy-y0)/max(1,y1-y0))
   grad=cfg['gradientTopGray']+(cfg['gradientBottomGray']-cfg['gradientTopGray'])*vertical
   outer=v2.smooth(inside/cfg['outerTransitionPixels'])
   level=cfg['outerRingGray']+(grad-cfg['outerRingGray'])*outer
   pupil=v2.smooth(outside_core/cfg['pupilTransitionPixels'])
   level*=cfg['pupilAdjacentBrightnessRatio']+(1-cfg['pupilAdjacentBrightnessRatio'])*pupil
   nx=(xx-cxx)/max(1,(x1-x0)/2);ny=(yy-cy)/max(1,(y1-y0)/2)
   angle=np.arctan2(ny,nx);radius=np.sqrt(nx*nx+ny*ny)
   k1,k2=cfg['radialFiberCounts']
   fibers=cfg['radialFiberAmplitudeGray']*(.7*np.sin(k1*angle+1.5*np.sin(5*angle)+3*radius)+.3*np.sin(k2*angle-2*radius))
   level+=(fibers+detail)*outer*pupil
   gray[half]=level[half]
   eye_records.append({'opaqueSourceBoundsXY':[int(x0),int(y0),int(x1),int(y1)],'corePixels':int(core.sum()),'coreCentroidXY':[float(cxx),float(cy)],'opaqueComponentPixels':int(silhouette.sum())})
  gray=np.floor(np.clip(gray,0,255)+.5).astype('uint8');editable=mask>0
  for c in range(3):neutral[:,:,c][editable]=gray[editable]
  # The neutral texture has grayscale data only where the mask is nonzero.
  # Runtime should blend the tinted substrate against the untouched original, not tint its core.
  target=np.array([int(cfg['previewColor'][i:i+2],16)for i in [1,3,5]],float)
  tinted=np.clip(target[None,None,:]*(gray[:,:,None]/cfg['neutralMultiplierReference']),0,255)
  weight=mask[:,:,None]/255
  preview=a.copy();preview[:,:,:3]=np.floor(a[:,:,:3]*(1-weight)+tinted*weight+.5).astype('uint8')
  assert np.array_equal(neutral[~editable],a[~editable]) and np.array_equal(preview[~editable],a[~editable])
  assert np.array_equal(neutral[:,:,3],a[:,:,3]) and np.array_equal(preview[:,:,3],a[:,:,3])
  assert np.array_equal(preview[core_all],a[core_all]) and np.array_equal(neutral[core_all],a[core_all])
  assert np.array_equal(neutral[:,:,0][editable],neutral[:,:,1][editable]) and np.array_equal(neutral[:,:,1][editable],neutral[:,:,2][editable])
  assert np.all(preview[:,:,:3][mask==255].max(1)<=target.max())
  Image.fromarray(neutral).save(out/f'{sex}-iris-neutral.png')
  Image.fromarray(preview).save(out/f'{sex}-iris-green-soft.png')
  shutil.copyfile(maskpath,out/f'{sex}-iris-mask.png');shutil.copyfile(V2/f'{sex}-outer-lip-mask.png',out/f'{sex}-outer-lip-mask.png')
  # Atlas comparison and left-eye closeup: old v2 green / new substrate green.
  old=np.array(Image.open(V2/f'{sex}-iris-green-hue.png').convert('RGBA'))
  board=Image.new('RGB',(width,height*2),(224,224,224))
  for row,tex in enumerate([old,preview]):
   tile=Image.fromarray(tex);board.paste(tile,(0,row*height),tile)
  board.save(out/f'{sex}-old-green-soft-comparison.png')
  close=Image.new('RGB',(600,900),(224,224,224))
  for row,tex in enumerate([old,preview]):
   tile=Image.fromarray(tex).crop((110,105,402,410)).resize((430,449),Image.Resampling.LANCZOS)
   close.paste(tile,(85,row*450),tile)
  close.save(out/f'{sex}-old-green-soft-close.png')
  probes=[]
  for x,y in [(256,130),(256,155),(256,200),(256,256),(256,310),(140,250),(256,380)]:
   probes.append({'xy':[x,y],'mask':int(mask[y,x]),'sourceRGBA':a[y,x].tolist(),'v2Green':old[y,x].tolist(),'neutral':neutral[y,x].tolist(),'softGreen':preview[y,x].tolist()})
  report['checks'][sex]={'alphaExact':True,'coreExact':True,'maskZeroExact':True,'v2MaskBytesExact':True,'lipV1V2BytesExact':True,'neutralIsGrayWithinEditableDomain':True,'fullTintValueNeverExceedsChosenColorValue':True,'neutralEditableMinMax':[int(gray[editable].min()),int(gray[editable].max())],'sourceDetailRange':[float(detail.min()),float(detail.max())],'eyeGeometry':eye_records,'probes':probes}
  neutralsha=sha((out/f'{sex}-iris-neutral.png').read_bytes())
  for variant in runtime['variants']:
   if source_report['bodies'][variant['bodyType']]['maskSet']!=sex:continue
   for key in ['iris','lips']:
    part=variant['parts'][key];part['maskUrl']=part['maskUrl'].replace('/appearance-color-v2/','/appearance-color-v3/')
   part=variant['parts']['iris'];part.update(colorOperation='neutral-iris-multiply-v3',neutralMapUrl=f'/assets/appearance-color-v3/{sex}-iris-neutral.png',neutralMapSha256=neutralsha,neutralMapSize=[width,height],neutralChannel='r',neutralMultiplierReference=cfg['neutralMultiplierReference'])
 runtime['sourceVersion']='appearance-color-v3';write_json(out/'runtime-manifest.json',runtime)
 report['dependencies']={p.relative_to(ROOT).as_posix():{'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size}for p in dep}
 write_json(out/'check-report.json',report)
 files={p.name:{'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size}for p in sorted(out.iterdir())if p.is_file()}
 write_json(out/'manifest.json',{'schema':'appearance-color-v3-source-package','files':files,'dependencies':report['dependencies']})
 return report

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--verify',action='store_true');args=parser.parse_args()
 if args.verify:
  with tempfile.TemporaryDirectory(prefix='iris-v3-')as temp:
   result=build(Path(temp));files=json.loads((Path(temp)/'manifest.json').read_text())['files']
   for name in list(files)+['manifest.json']:assert (Path(temp)/name).read_bytes()==(DEST/name).read_bytes(),name
  print(json.dumps({'verified':True,'files':len(files)+1,'checks':result['checks']},ensure_ascii=False))
 else:
  if (DEST/'manifest.json').exists():raise SystemExit('Frozen output exists. Use --verify; do not overwrite evidence.')
  # Always generate from an empty staging dir, so author notes are not mistaken for generated outputs.
  with tempfile.TemporaryDirectory(prefix='iris-v3-build-')as temp:
   result=build(Path(temp))
   for p in Path(temp).iterdir():shutil.copyfile(p,DEST/p.name)
  print(json.dumps({'out':str(DEST),'checks':result['checks']},ensure_ascii=False))
