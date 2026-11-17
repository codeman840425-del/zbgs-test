from pathlib import Path,PureWindowsPath
import hashlib,json,sys,time
sys.dont_write_bytecode=True
from call_step import ROOT,BASE,call,payload
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
SOURCE=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid';SOURCE_SHA='c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a'
ENTRY=ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/male-before-skin-study.vroid';ENTRY_SHA='2b01fecfdd0a1fafead21f9e9fe8aba3504e51964f72fe5b9a6c4223ac2493ed'
HAIR='283e41807fdb34cdf4b0280ccbe897bae6fda1b9';BASE_KEY='base:388a671cd6920c61af4172818a056aad61d81f91';RGBA=dict(r=58/255,g=36/255,b=30/255,a=1)
def write(n,v):
 with (BASE/n).open('xb') as f:f.write((json.dumps(v,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())
def main():
 start=time.monotonic();assert sha(SOURCE)==SOURCE_SHA and sha(ENTRY)==ENTRY_SHA
 st=payload(json.loads((BASE/'records/01-status.json').read_bytes()));assert st['ready'] and not st['dirty'] and PureWindowsPath(st['currentFile'])==PureWindowsPath(ENTRY)
 out=BASE/'generated';out.mkdir();fail=None;checkpoint=out/'entry-checkpoint.vroid';candidate=out/'male-hair-base-brown.vroid';vrm=out/'male-hair-base-brown.vrm';call('02-entry-checkpoint','vroid_save',{'path':str(checkpoint)})
 try:
  call('03-main-menu','vroid_main_menu',{});call('04-open-source','vroid_open',{'path':str(SOURCE)});call('05-save-working','vroid_save',{'path':str(out/'male-before-hair-base.vroid')});materials=call('06-materials-before','vroid_list_hair_materials',{},True);assert any(x['material']==HAIR and any(c['key']==BASE_KEY for c in x['colors']) for x in materials)
  call('07-set-base-color','vroid_set_hair_color',dict(material=HAIR,key=BASE_KEY,**RGBA));after=call('08-materials-after','vroid_list_hair_materials',{},True);call('09-save-candidate','vroid_save',{'path':str(candidate)});call('10-main-menu-cold','vroid_main_menu',{});call('11-cold-open','vroid_open',{'path':str(candidate)});reopened=call('12-materials-reopened','vroid_list_hair_materials',{},True);assert after==reopened
  clean=call('13-status-reopened','vroid_status',{});assert clean['ready'] and not clean['dirty'] and PureWindowsPath(clean['currentFile'])==PureWindowsPath(candidate);write('cold-reopen-readback.json',dict(schema='native-hair-base-color-cold-reopen-v1',sourceMaterials=materials,after=after,reopened=reopened,targetRGBA=RGBA,targetHex='#3a241e',baseKey=BASE_KEY,coldExact=True));exp=call('14-export-vrm1','vroid_export_vrm',dict(path=str(vrm),version='1',title='Native male hair base color study',author='gamemake technical study',model_version='hair-base-color-study-v1',delete_transparent=False,hair_smoothness=0,hair=0,face=0,body=0,outfit=0,material_mode=0,texture_mode=0,hair_bones=0,leave=True));assert exp.get('warnings')==[]
 except BaseException as e:fail=dict(type=type(e).__name__,message=str(e));write('native-failure.json',fail)
 finally:
  cur=call('90-status-for-restore','vroid_status',{});assert cur['ready'];
  if cur['dirty']:call('91-save-failure-state','vroid_save',{'path':str(out/'failure-state.vroid')})
  call('92-main-menu-restore','vroid_main_menu',{});call('93-restore-entry','vroid_open',{'path':str(ENTRY)});rest=call('94-status-restored','vroid_status',{});assert rest['ready'] and not rest['dirty'] and PureWindowsPath(rest['currentFile'])==PureWindowsPath(ENTRY);assert sha(SOURCE)==SOURCE_SHA and sha(ENTRY)==ENTRY_SHA
  write('native-cycle.json',dict(schema='native-hair-base-color-cycle-v1',status='native-cycle-complete-cpu-pending' if not fail else 'failed-restored',source={'path':SOURCE.relative_to(ROOT).as_posix(),'sha256':SOURCE_SHA},entry={'path':ENTRY.relative_to(ROOT).as_posix(),'sha256':ENTRY_SHA},baseKey=BASE_KEY,targetRGBA=RGBA,targetHex='#3a241e',failure=fail,restored=rest,windowReleased=True,desktopInput=False,wallSeconds=time.monotonic()-start,generated=[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size} for p in out.iterdir() if p.is_file()]))
 if fail:raise SystemExit('Base-color candidate failed; restored and retained.')
if __name__=='__main__':main()
