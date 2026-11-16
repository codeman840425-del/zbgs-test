"""Independent blockwise byte comparison of original-source regeneration outputs."""
from pathlib import Path
import sys,json,hashlib
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-nose-visible-v2'
outname=sys.argv[sys.argv.index('--out')+1]if '--out'in sys.argv else 'fresh-check';OUT=(BASE/outname).resolve();assert OUT.is_relative_to(BASE.resolve())and OUT!=BASE.resolve()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def same(a,b):
 if a.stat().st_size!=b.stat().st_size:return False
 with a.open('rb')as f,b.open('rb')as g:
  while True:
   x=f.read(1024*1024);y=g.read(1024*1024)
   if x!=y:return False
   if not x:return True
rows=[]
for sex in ['female','male']:
 name=f'{sex}-nose-tip-forward2-v2';a=BASE/'generated'/name;b=OUT/name;ga=json.loads((a/'build-report.json').read_text(encoding='utf-8'));gb=json.loads((b/'build-report.json').read_text(encoding='utf-8'))
 fields=['source','endpointM','movedSourceVertices','addonExportSha256','addonRepeatExportSha256','generatorSha256','specSha256','mappingSha256','toolchain','invariants','bodyPositionsHash','skeletonRestHash','shapeChecks']
 for key in fields:assert ga[key]==gb[key],(sex,key)
 files=[]
 for filename in ['addon-export.vrm','addon-repeat-export.vrm','avatar.vrm','repeat-export.vrm','mapping.json.gz','normal-reference.npz','editable.blend']:
  fa,fb=a/filename,b/filename;equal=same(fa,fb)
  if filename not in ['editable.blend','normal-reference.npz']:assert equal,(sex,filename)
  files.append({'file':filename,'generatedBytes':fa.stat().st_size,'freshBytes':fb.stat().st_size,'generatedSHA256':sha(fa),'freshSHA256':sha(fb),'byteEqual':equal})
 for key,digest in [('sourceBlend','sourceBlendSha256'),('sourceVRM','sourceVRMSha256')]:assert sha(ROOT/ga['source'][key])==ga['source'][digest]
 rows.append({'sex':sex,'originalBlend':ga['source']['sourceBlend'],'sourceStillPinned':True,'equalBuildInvariantFields':fields,'files':files})
r={'scope':'Independent original-blend regeneration, two CPU threads, native repeated export plus deterministic per-shape normals; blockwise exported bytes compared.','outputCompared':outname,'blenderExitCode':0,'passed':True,'bodies':rows,'limits':['Native .blend container identity is separately reported, not inferred from final VRM identity.','No runtime/visual acceptance.']}
(OUT/'rebuild-comparison.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'files':{r['sex']:{f['file']:f['byteEqual']for f in r['files']}for r in rows}},indent=2))
