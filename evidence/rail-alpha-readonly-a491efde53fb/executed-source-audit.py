"""Read-only actual skirt alpha/UV coverage audit; no runtime optimization."""
from pathlib import Path
import json,struct,hashlib,io,collections,gzip,math
from PIL import Image
R=Path(__file__).resolve().parents[1];src=R/'prototype/public/assets/m1/m1-uniform-skirt.glb';raw=src.read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);start=20+n;bn=struct.unpack_from('<I',raw,start)[0];blob=raw[start+8:start+8+bn]
def acc(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];fmt={5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']];size=struct.calcsize(fmt);dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];stride=v.get('byteStride',size*dim);off=v.get('byteOffset',0)+a.get('byteOffset',0);return[struct.unpack_from('<'+fmt*dim,blob,off+j*stride)for j in range(a['count'])]
rows=[]
for mi,m in enumerate(g['meshes']):
 for pi,pr in enumerate(m['primitives']):
  mat=g['materials'][pr['material']];tex=g['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']];im=g['images'][tex['source']];bv=g['bufferViews'][im['bufferView']];png=blob[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']];img=Image.open(io.BytesIO(png)).convert('RGBA');alpha=img.getchannel('A');hist=collections.Counter(alpha.tobytes());cut=mat.get('alphaCutoff',.5);uv=acc(pr['attributes']['TEXCOORD_0']);indices=[x[0]for x in acc(pr['indices'])];cert=[];nonfinite=[]
  for face in range(len(indices)//3):
   tri=[uv[indices[face*3+k]]for k in range(3)]
   if not all(math.isfinite(x)for p in tri for x in p):nonfinite.append(face);continue
   xs=[max(0,min(img.width-1,math.floor(p[0]*img.width)))for p in tri];ys=[max(0,min(img.height-1,math.floor(p[1]*img.height)))for p in tri]
   minimum=alpha.crop((min(xs),min(ys),max(xs)+1,max(ys)+1)).getextrema()[0]
   if minimum/255>=cut:cert.append(face)
  rows.append({'mesh':mi,'primitive':pi,'material':mat,'sampler':g.get('samplers',[{}])[tex.get('sampler',0)],'embeddedImageSHA256':hashlib.sha256(png).hexdigest(),'width':img.width,'height':img.height,'alphaHistogram':dict(hist),'wholeTexturePassesOldCutoff':all(a/255>=cut for a in hist),'triangleCount':len(indices)//3,'finiteUVTriangles':len(indices)//3-len(nonfinite),'idealUVRectangleCertifiedCount':len(cert),'idealUVRectangleCertifiedRatio':len(cert)/(len(indices)//3),'nonfiniteUVFaces':nonfinite,'uvMin':[min(p[k]for p in uv)for k in range(2)],'uvMax':[max(p[k]for p in uv)for k in range(2)]})
cap=R/'evidence/front-skirt-a491efde53fb/speed-2.40-full.json.gz';runtime=json.loads(gzip.decompress(cap.read_bytes()))
result={'source':str(src.relative_to(R)),'sourceSHA256':hashlib.sha256(raw).hexdigest(),'runtimeBuild':runtime['build'],'runtimeMaterialObservation':runtime['selection']['materials'],'rows':rows,'depthCounterexample':{'fiveSamples':[-.1,.05,.2,.35,.5],'thresholds':[-.008,.3],'originalMaxCorrection':.208,'unconditionalEndpointsOnlyCorrection':0},'limits':['All source pixels scanned. Ideal UV rectangle count is not a blanket proof for non-finite or ill-conditioned barycentric arithmetic.','Global texture proof may remove texture-region concerns, but runtime shortcut must preserve old false results for NaN/nonfinite UV/index and texture/cutoff identity.','No runtime changes, no new browser/performance sweep. Exact runtime texture pixels were not re-read this audit; source SHA and unchanged material clone pipeline support current default only.']}
out=R/'evidence/rail-alpha-readonly-a491efde53fb';out.mkdir(exist_ok=True);(out/'source-audit.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({'triangles':sum(x['triangleCount']for x in rows),'certified':sum(x['idealUVRectangleCertifiedCount']for x in rows),'rows':[{'alphaHistogram':x['alphaHistogram'],'mode':x['material'].get('alphaMode'),'cutoff':x['material'].get('alphaCutoff'),'uvMin':x['uvMin'],'uvMax':x['uvMax']}for x in rows]},indent=2))
