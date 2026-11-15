"""Compare the independent original-source rebuild with frozen generated endpoints."""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-brow-parameters-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def equal(a,b):
 if a.stat().st_size!=b.stat().st_size:return False
 with a.open('rb')as f,b.open('rb')as g:
  while True:
   x=f.read(1024*1024);y=g.read(1024*1024)
   if x!=y:return False
   if not x:return True
rows=[]
for sex in ['female','male']:
 name=f'{sex}-brow-height1-spacing1-v1';a=BASE/'generated'/name;b=BASE/'fresh-check'/name
 ra=json.loads((a/'build-report.json').read_text());rb=json.loads((b/'build-report.json').read_text())
 invariants=['source','candidate','avatarSha256','repeatExportSha256','mappingSha256','generatorSha256','specSha256','toolchain','invariants','skeletonRestHash','bodyPositionsHash','browSourceVertices','sourceVertexCount','centerX','shapeChecks']
 for key in invariants:assert ra[key]==rb[key],(sex,key)
 files=[]
 for filename in ['avatar.vrm','repeat-export.vrm','mapping.json.gz','editable.blend']:
  fa,fb=a/filename,b/filename;same=equal(fa,fb)
  if filename!='editable.blend':assert same,(sex,filename)
  files.append({'file':filename,'generatedBytes':fa.stat().st_size,'freshBytes':fb.stat().st_size,'generatedSHA256':sha(fa),'freshSHA256':sha(fb),'byteEqual':same})
 for key,digest in [('sourceBlend','sourceBlendSha256'),('sourceVRM','sourceVRMSha256')]:assert sha(ROOT/ra['source'][key])==ra['source'][digest]
 rows.append({'sex':sex,'fromOriginalBlend':ra['source']['sourceBlend'],'candidate':ra['candidate'],'sourceFilesStillPinned':True,'buildReportInvariantFieldsEqual':invariants,'files':files})
result={'scope':'Fresh Blender process loaded pinned original female/male sources; rebuilt only existing +1mm/+1mm endpoints with 2 CPU threads. Export byte identity checked independently.','passed':True,'blenderExitCode':0,'bodies':rows,'limitations':['This proves source regeneration/export reproducibility, not game appearance or parameter-range safety.','Editable blend byte equality is recorded separately; native container identity is not inferred from VRM identity.']}
(BASE/'fresh-check-result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'files':{r['sex']:{f['file']:f['byteEqual']for f in r['files']}for r in rows}},indent=2))
