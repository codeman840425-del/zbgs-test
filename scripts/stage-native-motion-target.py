"""Stage the four native motion candidates as a separate, explicitly pending entry."""
from __future__ import annotations
import argparse, hashlib, json, os, shutil, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets-source/native-motion-target-v1/generated-v2'
PUBLIC=ROOT/'prototype/public/assets/motion/m1c'
DEST=PUBLIC/'native-rokoko-target-v2'
MANIFEST=PUBLIC/'dance-imports.json'
IDS=['native-female-843ac-v1','native-female-face-v1','native-female-waist-v1','native-male-7586-v1']
AVATARS={
 'native-female-843ac-v1':'843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef',
 'native-female-face-v1':'cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce',
 'native-female-waist-v1':'cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5',
 'native-male-7586-v1':'7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81',
}
def digest(data:bytes)->str:return hashlib.sha256(data).hexdigest()
def receipt(p:Path):
 b=p.read_bytes(); return {'path':p.relative_to(ROOT).as_posix(),'bytes':len(b),'sha256':digest(b)}
def files(d:Path): return sorted(p for p in d.rglob('*') if p.is_file())
def fail(msg): raise RuntimeError(msg)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--check',action='store_true');a=ap.parse_args()
 if not SOURCE.is_dir(): fail('missing generated-v2 source')
 source_manifest=json.loads((SOURCE/'manifest.json').read_text(encoding='utf8'))
 if source_manifest.get('revision')!='generated-v2' or len(source_manifest.get('targets',[]))!=4: fail('unexpected source manifest')
 src=[]; max_hips=0.0; max_skeleton=0.0
 for ident in IDS:
  motion=SOURCE/ident/'motion.json'; rig=SOURCE/ident/'target-rig.json'
  if not motion.is_file() or not rig.is_file(): fail(f'missing {ident}')
  data=json.loads(motion.read_text()); r=json.loads(rig.read_text())
  if data.get('avatarSha256')!=AVATARS[ident] or r.get('avatarSha256')!=AVATARS[ident]: fail(f'avatar identity {ident}')
  if data.get('schema')!='normalized-vrm-motion.1' or data.get('clip',{}).get('duration')!=30: fail(f'clip contract {ident}')
  if len(data['clip']['tracks'])!=53: fail(f'track count {ident}')
  source_entry=next((x for x in source_manifest['targets'] if x['id']==ident),None)
  if not source_entry or source_entry['motion']['sha256']!=digest(motion.read_bytes()) or source_entry['motion']['bytes']!=motion.stat().st_size: fail(f'source manifest motion pin {ident}')
  hip=next(t for t in data['clip']['tracks'] if t['name']=='hips.position')
  hp=r['normalizedBones']['hips']['restWorldPositionM']
  max_hips=max(max_hips,max(((float(hip['values'][i])-hp[0])**2+(float(hip['values'][i+2])-hp[2])**2)**.5 for i in range(0,len(hip['values']),3)))
  max_skeleton=max(max_skeleton,max((sum((x-hp[j])**2 for j,x in enumerate(b['restWorldPositionM']))**.5 for b in r['normalizedBones'].values()),default=0))
  src.extend([receipt(motion),receipt(rig)])
 radius=max_hips+max_skeleton+0.25
 old=MANIFEST.read_bytes(); manifest=json.loads(old)
 old_ids={e['id'] for e in manifest.get('entries',[])}
 entry={
  'id':'native-rokoko-5359146-30s-v2','label':'30秒舞蹈 · 原生骨架接入候选','format':'normalized-vrm-motion.1','clip':'Rokoko_Pexels5359146_30s_v1','duration':30,
  'playback':'once-then-idle','rootPolicy':'local-displacement','origin':'Pinned Rokoko vendor trial converted for exact native targets; internal technical candidate only, no production/commercial license claim; source/runtime admission pending','rootTranslationOwner':'clip hips only; no path locomotion','heldPropsAllowed':False,
  'space':{'kind':'local-footprint','radiusTargetM':radius,'radiusBasis':{'maxTargetHipHorizontalDisplacementM':max_hips,'maxTargetSkeletonRestRadiusM':max_skeleton,'safetyMarginM':0.25,'dynamicClothesHairIncluded':False},'navigationAllowedDuringPlayback':False},
  'variants':[]
 }
 for ident in IDS:
  filename=f'{ident}.motion.json'; b=(SOURCE/ident/'motion.json').read_bytes(); entry['variants'].append({'avatarSha256':AVATARS[ident],'file':f'native-rokoko-target-v2/{filename}','sha256':digest(b),'bytes':len(b)})
 if 'native-rokoko-5359146-30s-v2' in old_ids:
  existing=next(e for e in manifest['entries'] if e['id']==entry['id'])
  if existing!=entry: fail('existing candidate entry differs; refusing overwrite')
  if DEST.exists():
   for v in entry['variants']:
    p=PUBLIC/v['file'];
    if not p.is_file() or receipt(p)['sha256']!=v['sha256']: fail('existing candidate resource conflict')
  status='already-identical'
 else:
  if DEST.exists(): fail('destination exists without matching manifest entry')
  if a.check: status='preflight-only'
  else:
   stage=Path(tempfile.mkdtemp(prefix='.native-motion-stage-',dir=PUBLIC))
   try:
    staged=stage/'native-rokoko-target-v2';staged.mkdir()
    for ident in IDS: shutil.copyfile(SOURCE/ident/'motion.json',staged/f'{ident}.motion.json')
    check={v['file'].split('/')[-1]:v['sha256'] for v in entry['variants']}
    for p in files(staged):
     if digest(p.read_bytes())!=check[p.name]: fail('staged resource digest')
    out_manifest=dict(manifest);out_manifest['entries']=manifest['entries']+[entry]
    tmp=stage/'dance-imports.json';tmp.write_text(json.dumps(out_manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    if MANIFEST.read_bytes()!=old: fail('manifest changed during stage')
    os.replace(tmp,MANIFEST);os.replace(staged,DEST);status='published'
   finally:
    shutil.rmtree(stage,ignore_errors=True)
 prior_path=ROOT/'evidence/native-motion-reuse-audit-v1/native-motion-stage.json'; prior=json.loads(prior_path.read_text(encoding='utf8')) if prior_path.exists() else {}
 report={'schema':'native-motion-target-stage-v1','status':status,'runtimeAdmission':False,'sourceManifest':receipt(SOURCE/'manifest.json'),'sourceFiles':src,'prePublishDanceManifestSha256':prior.get('prePublishDanceManifestSha256',digest(old)),'currentDanceManifestSha256':digest(MANIFEST.read_bytes()),'entry':entry,'oldEntriesUntouched':True,'rawSourceExcluded':True}
 out=ROOT/'evidence/native-motion-reuse-audit-v1';out.mkdir(parents=True,exist_ok=True);(out/'native-motion-stage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
