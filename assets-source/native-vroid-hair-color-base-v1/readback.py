"""Read back the targeted SetBaseColor export without calling native tools."""
from pathlib import Path
import copy,hashlib,importlib.util,json,sys,time
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
sp=importlib.util.spec_from_file_location('g',ROOT/'scripts/m2-male-face-v1/glb.py')
m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
SOURCE=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm'
SRC='a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da'
def raw(g,i):
 x=g.doc['images'][i];v=g.doc['bufferViews'][x['bufferView']];return g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def write(n,v):
 with (BASE/n).open('xb') as f:f.write((json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode())
def main():
 start=time.monotonic();out=BASE/'cpu-readback';assert not out.exists();out.mkdir()
 cycle=json.loads((BASE/'native-cycle.json').read_bytes());cand=BASE/'generated/male-hair-base-brown.vrm';pin=next(x for x in cycle['generated'] if x['path'].endswith('.vrm'))
 assert sha(SOURCE.read_bytes())==SRC and sha(cand.read_bytes())==pin['sha256'];g0,g1=m.GLB(SOURCE),m.GLB(cand);d0,d1=g0.doc,g1.doc
 accessors=[]
 for i in range(len(d0['accessors'])):
  a,b=g0.acc(i),g1.acc(i);same=a.dtype==b.dtype and a.shape==b.shape and a.tobytes()==b.tobytes();accessors.append(same);assert same
 images=[]
 for i in range(len(d0['images'])):
  a,b=raw(g0,i),raw(g1,i);images.append(dict(index=i,encodedExact=a==b,sourceSHA256=sha(a),candidateSHA256=sha(b)))
 ext0,ext1=copy.deepcopy(d0['extensions']),copy.deepcopy(d1['extensions'])
 for x in (ext0['VRMC_vrm']['meta'],ext1['VRMC_vrm']['meta']):
  for k in ['name','version','thumbnailImage']:x.pop(k,None)
 assert ext0==ext1
 write('result.json',dict(schema='native-hair-base-color-export-readback-v1',status='failed-base-color-not-represented',source={'path':SOURCE.relative_to(ROOT).as_posix(),'sha256':SRC,'bytes':SOURCE.stat().st_size},candidate=pin,targetRGBA=cycle['targetRGBA'],baseKey=cycle['baseKey'],all139AccessorsExact=all(accessors),accessorCount=len(accessors),imageCount=len(images),allImagesEncodedExact=all(x['encodedExact'] for x in images),images=images,nonThumbnailExtensionsExact=True,coldReopenExact=json.loads((BASE/'cold-reopen-readback.json').read_bytes())['coldExact'],coldReopenBaseGetterRemainsNull=True,failures=['SetBaseColorCommand completed without a readable changed value and produced no exported image/material difference','Hair color is not admitted; no runtime/public change'],wallSeconds=time.monotonic()-start,limits=['Base-color getter is intentionally null in Bridge','No native texture edit was attempted after the targeted command','No game/runtime visual acceptance']))
 print(json.dumps({'status':'failed-base-color-not-represented','allImagesEncodedExact':all(x['encodedExact'] for x in images),'accessors':len(accessors)}))
if __name__=='__main__':main()
