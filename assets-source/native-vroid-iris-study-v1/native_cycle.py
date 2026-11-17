"""One native paired iris color edit, cold reopen, VRM1 export and restoration."""
from pathlib import PureWindowsPath
import hashlib,json,sys,time
sys.dont_write_bytecode=True
from call_step import ROOT,BASE,call,payload
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
SOURCE=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid'
SOURCE_SHA='c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a'
ENTRY=ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/male-before-skin-study.vroid'
ENTRY_SHA='2b01fecfdd0a1fafead21f9e9fe8aba3504e51964f72fe5b9a6c4223ac2493ed'
RGBA=dict(r=79/255,g=122/255,b=74/255,a=1)
KEYS=['Level3Iris_LeftOverlayColor','Level3Iris_RightOverlayColor']

def write(name,value):
    with (BASE/name).open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def colors(value):
    return {p['key']:p['value'] for p in value if p['kind']=='color'}

def main():
    started=time.monotonic()
    assert sha(SOURCE)==SOURCE_SHA and sha(ENTRY)==ENTRY_SHA
    entering=payload(json.loads((BASE/'records/01-status.json').read_bytes()))
    assert entering['ready'] and entering['dirty'] is False and PureWindowsPath(entering['currentFile'])==PureWindowsPath(ENTRY)
    out=BASE/'generated';out.mkdir()
    checkpoint=out/'entry-checkpoint.vroid';candidate=out/'male-iris-green.vroid';vrm=out/'male-iris-green.vrm'
    call('02-entry-checkpoint','vroid_save',{'path':str(checkpoint)})
    failure=None
    try:
        call('03-main-menu','vroid_main_menu',{})
        call('04-open-original','vroid_open',{'path':str(SOURCE)})
        call('05-save-working','vroid_save',{'path':str(out/'male-before-iris.vroid')})
        groups=call('06-fresh-groups','vroid_list_groups',{})
        matches=[g for g in groups if g['type']=='TransferableGroupType.N00.Level3.Iris']
        assert len(matches)==1
        group=matches[0]['id']
        before=call('07-iris-before','vroid_get_params',{'group':group})
        before_colors=colors(before)
        assert all(k in before_colors for k in KEYS)
        for i,key in enumerate(KEYS):
            call('08'+str(i)+'-set-'+key,'vroid_set_color',dict(group=group,key=key,**RGBA))
        after=call('09-iris-after','vroid_get_params',{'group':group})
        call('10-save-candidate','vroid_save',{'path':str(candidate)})
        call('11-menu-for-cold-open','vroid_main_menu',{})
        call('12-cold-open','vroid_open',{'path':str(candidate)})
        reopened_groups=call('13-reopened-groups','vroid_list_groups',{})
        assert groups==reopened_groups
        reopened=call('14-iris-reopened','vroid_get_params',{'group':group})
        after_colors=colors(after);cold_colors=colors(reopened)
        assert after==reopened
        for key in KEYS:
            assert max(abs(cold_colors[key][c]-RGBA[c]) for c in RGBA)<1e-7
        assert {k:v for k,v in before_colors.items() if k not in KEYS}=={k:v for k,v in cold_colors.items() if k not in KEYS}
        clean=call('15-reopened-status','vroid_status',{})
        assert clean['ready'] and clean['dirty'] is False and PureWindowsPath(clean['currentFile'])==PureWindowsPath(candidate)
        write('cold-reopen-readback.json',dict(schema='native-iris-color-cold-reopen-v1',sourceGroup=matches[0],targetRGBA=RGBA,targetHex='#4f7a4a',keys=KEYS,before=before,after=after,reopened=reopened,exactColdReadback=True,nonTargetColorsExact=True,groupsExact=True))
        exported=call('16-export-vrm1','vroid_export_vrm',dict(path=str(vrm),version='1',title='Native male production study',author='gamemake technical study',model_version='study-v1',delete_transparent=False,hair_smoothness=0,hair=0,face=0,body=0,outfit=0,material_mode=0,texture_mode=0,hair_bones=0,leave=True))
        assert exported.get('warnings')==[]
    except BaseException as exc:
        failure=dict(type=type(exc).__name__,message=str(exc));write('native-failure.json',failure)
    finally:
        current=call('90-status-for-restore','vroid_status',{})
        assert current['ready'],'Not ready; do not discard unknown state'
        if current['dirty']:call('91-save-failure-state','vroid_save',{'path':str(out/'failure-state.vroid')})
        call('92-menu-restore','vroid_main_menu',{})
        call('93-restore-entry','vroid_open',{'path':str(ENTRY)})
        restored=call('94-status-restored','vroid_status',{})
        assert restored['ready'] and restored['dirty'] is False and PureWindowsPath(restored['currentFile'])==PureWindowsPath(ENTRY)
        assert sha(SOURCE)==SOURCE_SHA and sha(ENTRY)==ENTRY_SHA
        write('native-cycle.json',dict(schema='native-paired-iris-color-cycle-v1',status='native-cycle-complete-cpu-pending' if not failure else 'failed-restored',source=dict(path=SOURCE.relative_to(ROOT).as_posix(),sha256=SOURCE_SHA),entry=dict(path=ENTRY.relative_to(ROOT).as_posix(),sha256=ENTRY_SHA),targetRGBA=RGBA,targetHex='#4f7a4a',failure=failure,restored=restored,windowReleased=True,desktopInput=False,wallSeconds=time.monotonic()-started,generated=[dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size) for p in out.iterdir() if p.is_file()]))
    if failure:raise SystemExit('Native candidate failed; retained and restored. No retry.')

if __name__=='__main__':main()
