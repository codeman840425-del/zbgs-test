"""One native coordinated dark-brown hair and brow edit, cold reopen, export and restore."""
from pathlib import Path
from pathlib import PureWindowsPath
import hashlib,json,sys,time
sys.dont_write_bytecode=True
from call_step import ROOT,BASE,call,payload
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
SOURCE=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid'; SOURCE_SHA='c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a'
ENTRY=ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/male-before-skin-study.vroid'; ENTRY_SHA='2b01fecfdd0a1fafead21f9e9fe8aba3504e51964f72fe5b9a6c4223ac2493ed'
BROW='0fcdd5194752f6fe61cee7494d055ee4e0c3737b.transferablegroup'; HAIR='283e41807fdb34cdf4b0280ccbe897bae6fda1b9'
HAIR_COLOR=dict(r=58/255,g=36/255,b=30/255,a=1); HAIR_SHADE=dict(r=33/255,g=21/255,b=22/255,a=1); HAIR_OUTLINE=dict(r=18/255,g=13/255,b=13/255,a=1); BROW_RGBA=dict(r=58/255,g=36/255,b=30/255,a=1)
def write(name,value):
 with (BASE/name).open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())
def colors(value): return {p['key']:p['value'] for p in value if p.get('kind')=='color'}
def main():
 started=time.monotonic(); assert sha(SOURCE)==SOURCE_SHA and sha(ENTRY)==ENTRY_SHA
 entering=payload(json.loads((BASE/'records/01-status.json').read_bytes())); assert entering['ready'] and not entering['dirty'] and PureWindowsPath(entering['currentFile'])==PureWindowsPath(ENTRY)
 out=BASE/'generated';out.mkdir(); checkpoint=out/'entry-checkpoint.vroid'; candidate=out/'male-hair-brown-brow.vroid'; vrm=out/'male-hair-brown-brow.vrm'; failure=None
 call('02-entry-checkpoint','vroid_save',{'path':str(checkpoint)})
 try:
  call('03-main-menu','vroid_main_menu',{});call('04-open-original','vroid_open',{'path':str(SOURCE)});call('05-save-working','vroid_save',{'path':str(out/'male-before-hair-brown.vroid')})
  groups=call('06-groups','vroid_list_groups',{}); brows=[g for g in groups if g['type']=='TransferableGroupType.N00.Level1.Eyebrow']; assert len(brows)==1 and brows[0]['id']==BROW
  browBefore=call('07-brow-before','vroid_get_params',{'group':BROW}); hairBefore=call('08-hair-before','vroid_list_hair_materials',{},True)
  call('09-set-hair-color','vroid_set_hair_color',dict(material=HAIR,key='Color',**HAIR_COLOR));call('10-set-hair-shade','vroid_set_hair_color',dict(material=HAIR,key='ShadeColor',**HAIR_SHADE));call('11-set-hair-outline','vroid_set_hair_color',dict(material=HAIR,key='OutlineColor',**HAIR_OUTLINE));call('12-set-brow-color','vroid_set_color',dict(group=BROW,key='Level1Eyebrow_OverlayColor',**BROW_RGBA))
  hairAfter=call('13-hair-after','vroid_list_hair_materials',{},True);browAfter=call('14-brow-after','vroid_get_params',{'group':BROW});call('15-save-candidate','vroid_save',{'path':str(candidate)});call('16-menu-cold-open','vroid_main_menu',{});call('17-cold-open','vroid_open',{'path':str(candidate)})
  groups2=call('18-groups-reopened','vroid_list_groups',{}); assert groups2==groups
  hairReopen=call('19-hair-reopened','vroid_list_hair_materials',{},True);browReopen=call('20-brow-reopened','vroid_get_params',{'group':BROW});assert browAfter==browReopen
  write('cold-reopen-readback.json',dict(schema='native-hair-brow-color-cold-reopen-v1',hairBefore=hairBefore,hairAfter=hairAfter,hairReopened=hairReopen,browBefore=browBefore,browAfter=browAfter,browReopened=browReopen,targetColors=dict(hair=HAIR_COLOR,shade=HAIR_SHADE,outline=HAIR_OUTLINE,brow=BROW_RGBA),browColdExact=True,hairColdReadback=True,groupsColdExact=True))
  clean=call('21-reopened-status','vroid_status',{});assert clean['ready'] and not clean['dirty'] and PureWindowsPath(clean['currentFile'])==PureWindowsPath(candidate)
  exported=call('22-export-vrm1','vroid_export_vrm',dict(path=str(vrm),version='1',title='Native male hair and brow color study',author='gamemake technical study',model_version='hair-brow-color-study-v1',delete_transparent=False,hair_smoothness=0,hair=0,face=0,body=0,outfit=0,material_mode=0,texture_mode=0,hair_bones=0,leave=True));assert exported.get('warnings')==[]
 except BaseException as exc: failure=dict(type=type(exc).__name__,message=str(exc));write('native-failure.json',failure)
 finally:
  current=call('90-status-for-restore','vroid_status',{});assert current['ready']
  if current['dirty']:call('91-save-failure-state','vroid_save',{'path':str(out/'failure-state.vroid')})
  call('92-menu-restore','vroid_main_menu',{});call('93-restore-entry','vroid_open',{'path':str(ENTRY)});restored=call('94-status-restored','vroid_status',{});assert restored['ready'] and not restored['dirty'] and PureWindowsPath(restored['currentFile'])==PureWindowsPath(ENTRY);assert sha(SOURCE)==SOURCE_SHA and sha(ENTRY)==ENTRY_SHA
  write('native-cycle.json',dict(schema='native-hair-brow-color-cycle-v1',status='native-cycle-complete-cpu-pending' if not failure else 'failed-restored',source=dict(path=SOURCE.relative_to(ROOT).as_posix(),sha256=SOURCE_SHA),entry=dict(path=ENTRY.relative_to(ROOT).as_posix(),sha256=ENTRY_SHA),targetColors=dict(hair=HAIR_COLOR,shade=HAIR_SHADE,outline=HAIR_OUTLINE,brow=BROW_RGBA),failure=failure,restored=restored,windowReleased=True,desktopInput=False,wallSeconds=time.monotonic()-started,generated=[dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size) for p in out.iterdir() if p.is_file()]))
 if failure:raise SystemExit('Native candidate failed; restored and retained. No retry.')
if __name__=='__main__':main()
