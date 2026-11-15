"""Blockwise compare fixed-jaw fresh generation, source identities stay pinned."""
from pathlib import Path
import sys,json,hashlib
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-male-jaw-mouth-v1';spec=json.loads((BASE/'spec.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
outname=sys.argv[sys.argv.index('--out')+1]if '--out'in sys.argv else 'fresh-check';out=(BASE/outname).resolve();assert out.is_relative_to(BASE.resolve())and out!=BASE.resolve();name='male-jaw-mouth-width-104-v1';a=BASE/'generated'/name;b=out/name
def same(p,q):
 if p.stat().st_size!=q.stat().st_size:return False
 with p.open('rb')as f,q.open('rb')as g:
  while True:
   x=f.read(1024*1024);y=g.read(1024*1024)
   if x!=y:return False
   if not x:return True
files=[]
for filename in ['addon-export.vrm','addon-repeat-export.vrm','avatar.vrm','repeat-export.vrm','mapping.json.gz','selection.json','normal-reference.npz','editable.blend']:
 p=a/filename;q=b/filename;equal=same(p,q)
 if filename!='editable.blend':assert equal,filename
 files.append({'name':filename,'byteEqual':equal,'generatedSha256':sha(p),'freshSha256':sha(q),'generatedBytes':p.stat().st_size,'freshBytes':q.stat().st_size})
ga=json.loads((a/'build-report.json').read_text());gb=json.loads((b/'build-report.json').read_text());keys=['source','factor','avatarSha256','repeatExportSha256','generatorSha256','specSha256','mappingSha256','invariants','bodyPositionHash','skeletonRestHash','shapeChecks']
for k in keys:assert ga[k]==gb[k],k
for src in spec['bodies'].values():
 for k in ['sourceBlend','sourceVRM']:assert sha(ROOT/src[k])==src[k+'Sha256'],k
r={'passed':True,'scope':'Independent fresh build reads the frozen jaw editable source, not previously generated jaw+mouth blend. It does not remake upstream jaw design.','files':files,'buildFieldsEqual':keys,'sourceStillPinned':True,'runtimeAdmitted':False};(out/'rebuild-comparison.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':True,'byteEqual':{f['name']:f['byteEqual']for f in files}}))
