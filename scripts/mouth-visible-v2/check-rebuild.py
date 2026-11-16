"""Actual independent original-source rebuild comparison, not reopened-only export."""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/mouth-visible-v2';spec=json.loads((BASE/'spec.json').read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for sex in spec['bodies']:
 for factor in spec['factors']:
  name=f'{sex}-mouth-width-{round(factor*100)}-v2';a=BASE/'generated'/name;b=BASE/'fresh-check'/name;files=[]
  for filename in ['addon-export.vrm','addon-repeat-export.vrm','avatar.vrm','repeat-export.vrm','mapping.json.gz','selection.json','normal-reference.npz','editable.blend']:
   p=a/filename;q=b/filename;ha,hb=sha(p),sha(q);equal=ha==hb
   if filename!='editable.blend':assert equal,(name,filename)
   files.append({'name':filename,'byteEqual':equal,'generatedSha256':ha,'freshSha256':hb,'generatedBytes':p.stat().st_size,'freshBytes':q.stat().st_size})
  ga=json.loads((a/'build-report.json').read_text(encoding='utf-8'));gb=json.loads((b/'build-report.json').read_text(encoding='utf-8'));keys=['source','factor','rawAvatarSha256','rawRepeatExportSha256','generatorSha256','specSha256','mappingSha256','invariants','bodyPositionHash','skeletonRestHash','shapeChecks']
  for k in keys:assert ga[k]==gb[k],(name,k)
  rows.append({'id':name,'files':files,'buildFieldsEqual':keys})
for src in spec['bodies'].values():
 for k in ['sourceBlend','sourceVRM']:assert sha(ROOT/src[k])==src[k+'Sha256'],k
r={'passed':True,'scope':'Each fresh candidate starts from the original pinned male/female editable.blend. Each candidate also reopened and exported twice. Raw and finalized VRMs match byte-for-byte. Blender container byte equality is recorded separately.','endpoints':rows,'sourceStillPinned':True,'runtimeAdmitted':False};(BASE/'fresh-check/rebuild-comparison.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':True,'endpoints':[{x['id']:{f['name']:f['byteEqual']for f in x['files']}}for x in rows]}))
