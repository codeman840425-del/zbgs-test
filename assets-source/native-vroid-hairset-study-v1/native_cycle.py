"""Single authorized free HairSet001 native cycle; no other style/parameter edits."""
from pathlib import Path,PureWindowsPath
import hashlib,json,sys
sys.dont_write_bytecode=True
from call_step import ROOT,BASE,call,payload
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
SOURCE=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid'
SOURCE_SHA='c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a'
ENTRY=ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/male-before-skin-study.vroid'
ENTRY_SHA='2b01fecfdd0a1fafead21f9e9fe8aba3504e51964f72fe5b9a6c4223ac2493ed'
PRESET='a051cb96c59e4dce033c3223d63829b7642efabf.transferablegroup'

def write(path,value):
    with path.open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def main():
    assert sha(SOURCE)==SOURCE_SHA and sha(ENTRY)==ENTRY_SHA
    template=ROOT/'assets-source/native-vroid-appearance-producer-v1/next-hair-sample-template.json'
    assert sha(template)=='75d02b3e568fe0107f1d831aac50e03d428a9652fb62735193521457c3457635'
    status=payload(json.loads((BASE/'records/01-status.json').read_bytes()))
    assert status['ready'] and status['dirty'] is False and PureWindowsPath(status['currentFile'])==PureWindowsPath(ENTRY)
    generated=BASE/'generated';generated.mkdir()
    entry_checkpoint=generated/'entry-checkpoint.vroid'
    working=generated/'male-before-hairset001.vroid'
    candidate=generated/'male-hairset001.vroid'
    vrm=generated/'male-hairset001.vrm'
    failure=None;restored=None;observations={}
    call('02-save-entry-checkpoint','vroid_save',{'path':str(entry_checkpoint)})
    try:
        call('03-menu','vroid_main_menu',{})
        call('04-open-fixed-male','vroid_open',{'path':str(SOURCE)})
        call('05-save-working-copy','vroid_save',{'path':str(working)})
        available=call('06-fresh-free-preset','vroid_list_presets',{'filter':'HairSet/N00/001','include_locked':False,'limit':4})
        chosen=[p for p in available['presets'] if p['id']==PRESET]
        assert len(chosen)==1 and chosen[0]['usable'] is True and chosen[0]['price']==0
        before=call('07-groups-before','vroid_list_groups',{})
        call('08-apply-hairset001','vroid_apply_preset',{'id':PRESET,'preserve_material':False})
        after=call('09-groups-after','vroid_list_groups',{})
        nonhair=lambda groups:[g for g in groups if 'Hair' not in g['type']]
        assert nonhair(before)==nonhair(after),'Unrelated non-hair group replacement'
        hair=call('10-hair-groups-after','vroid_list_hair_groups',{})
        materials=call('11-materials-after','vroid_list_hair_materials',{},True)
        call('12-save-candidate','vroid_save',{'path':str(candidate)})
        call('13-menu-cold-reopen','vroid_main_menu',{})
        call('14-reopen-candidate','vroid_open',{'path':str(candidate)})
        reopened=call('15-groups-reopened','vroid_list_groups',{})
        reopened_hair=call('16-hair-groups-reopened','vroid_list_hair_groups',{})
        reopened_materials=call('17-materials-reopened','vroid_list_hair_materials',{},True)
        clean=call('18-status-reopened','vroid_status',{})
        assert clean['ready'] and clean['dirty'] is False
        assert PureWindowsPath(clean['currentFile'])==PureWindowsPath(candidate)
        observations=dict(selectedPreset=chosen[0],beforeGroups=before,afterGroups=after,reopenedGroups=reopened,
            nonHairGroupsUnchanged=True,groupsColdReopenExact=after==reopened,
            hairGroups=hair,reopenedHairGroups=reopened_hair,hairGroupsColdReopenExact=hair==reopened_hair,
            materials=materials,reopenedMaterials=reopened_materials,materialsColdReopenExact=materials==reopened_materials)
        write(BASE/'cold-reopen-readback.json',observations)
        assert after==reopened and hair==reopened_hair,'Saved hairset changed on cold reopen'
        exported=call('19-export-vrm1','vroid_export_vrm',dict(path=str(vrm),version='1',title='Native male HairSet001 study',
            author='gamemake technical study',model_version='hairset001-study-v1',delete_transparent=False,hair_smoothness=0,
            hair=0,face=0,body=0,outfit=0,material_mode=0,texture_mode=0,hair_bones=0,leave=True))
        assert exported.get('warnings')==[], 'Export options warnings retained'
    except BaseException as exc:
        failure=dict(type=type(exc).__name__,message=str(exc))
        write(BASE/'native-failure.json',failure)
    finally:
        current=call('90-status-for-restore','vroid_status',{})
        assert current['ready'],'Editor not ready for safe restoration; leave state intact'
        if current['dirty']:
            call('91-save-failure-state','vroid_save',{'path':str(generated/'failure-state.vroid')})
        call('92-menu-restore','vroid_main_menu',{})
        call('93-open-entry','vroid_open',{'path':str(ENTRY)})
        restored=call('94-status-restored','vroid_status',{})
        assert restored['ready'] and restored['dirty'] is False and PureWindowsPath(restored['currentFile'])==PureWindowsPath(ENTRY)
        assert sha(SOURCE)==SOURCE_SHA and sha(ENTRY)==ENTRY_SHA
        write(BASE/'native-cycle.json',dict(schema='native-hairset001-cycle-v1',status='native-cycle-complete-CPU-pending' if not failure else 'failed-restored',
            source=dict(path=SOURCE.relative_to(ROOT).as_posix(),sha256=SOURCE_SHA),
            preparedTemplate=dict(path=template.relative_to(ROOT).as_posix(),sha256=sha(template)),
            entryOriginal=dict(path=ENTRY.relative_to(ROOT).as_posix(),sha256=ENTRY_SHA),entryRestored=restored,
            failure=failure,originalsUnchanged=True,windowReleased=True,desktopInput=False,
            generated=[dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size) for p in generated.iterdir() if p.is_file()]))
    if failure:raise SystemExit('Single candidate failed; restored and retained. No retry.')

if __name__=='__main__':main()
