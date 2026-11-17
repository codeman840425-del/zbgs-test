"""One explicitly authorized native male Tops-removal cycle, preserving inputs."""
from pathlib import Path, PureWindowsPath
import hashlib
import json
import sys
sys.dont_write_bytecode = True
from call_step import ROOT, BASE, EVIDENCE, call, payload

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
SOURCE = ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid'
SOURCE_SHA = 'c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a'
ENTRY = ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/male-before-skin-study.vroid'
ENTRY_SHA = '2b01fecfdd0a1fafead21f9e9fe8aba3504e51964f72fe5b9a6c4223ac2493ed'

def write(path, value):
    with path.open('x', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write('\n')

def main():
    assert sha(SOURCE)==SOURCE_SHA and sha(ENTRY)==ENTRY_SHA
    before=payload(EVIDENCE/'01-status.json')
    assert before['ready'] and before['modelOpen'] and before['dirty'] is False
    assert PureWindowsPath(before['currentFile'])==PureWindowsPath(ENTRY)
    generated=BASE/'generated'
    generated.mkdir()
    entry_checkpoint=generated/'male-entry-checkpoint.vroid'
    source_checkpoint=generated/'male-before-tops-removal.vroid'
    saved=generated/'male-tops-removed.vroid'
    vrm=generated/'male-tops-removed.vrm'
    call('02-save-entry-checkpoint','vroid_save',{'path':str(entry_checkpoint)})
    call('03-menu','vroid_main_menu',{})
    call('04-open-fixed-male','vroid_open',{'path':str(SOURCE)})
    status=call('05-status-fixed-male','vroid_status',{})
    assert status['ready'] and status['dirty'] is False
    assert PureWindowsPath(status['currentFile'])==PureWindowsPath(SOURCE)
    groups=call('06-fresh-groups-before','vroid_list_groups',{})
    tops=[g for g in groups if g['type']=='TransferableGroupType.N00.Level1.Tops']
    assert len(tops)==1, tops
    write(BASE/'native-selection.json',dict(schema='male-native-tops-selection-v1',sourceSha256=SOURCE_SHA,
          freshGroupRecord='evidence/native-vroid-male-skin-recovery-v1/06-fresh-groups-before.json',
          removedGroup=tops[0],beforeGroups=groups,entryFile=ENTRY.relative_to(ROOT).as_posix(),entrySha256=ENTRY_SHA))
    call('07-save-fixed-copy','vroid_save',{'path':str(source_checkpoint)})
    call('08-remove-actual-tops','vroid_remove_item',{'group':tops[0]['id']})
    after=call('09-groups-after','vroid_list_groups',{})
    expected=[g for g in groups if g['id']!=tops[0]['id']]
    assert after==expected, ('Unexpected other group changes',after,expected)
    call('10-save-result','vroid_save',{'path':str(saved)})
    call('11-export-result','vroid_export_vrm',dict(path=str(vrm),version='1',title='Native male skin-mask Tops removal probe',
         author='gamemake technical study',model_version='male-skin-mask-probe-v1',delete_transparent=False,
         hair_smoothness=0,hair=0,face=0,body=0,outfit=0,material_mode=0,texture_mode=0,hair_bones=0,leave=True))
    call('12-menu-after-export','vroid_main_menu',{})
    call('13-reopen-result','vroid_open',{'path':str(saved)})
    reopened=call('14-groups-reopened','vroid_list_groups',{})
    assert reopened==after, 'Saved/reopened group identity differs'
    call('15-status-reopened','vroid_status',{})
    call('16-menu-restore','vroid_main_menu',{})
    call('17-open-entry-snapshot','vroid_open',{'path':str(ENTRY)})
    restored=call('18-status-restored','vroid_status',{})
    assert restored['ready'] and restored['dirty'] is False
    assert PureWindowsPath(restored['currentFile'])==PureWindowsPath(ENTRY)
    assert sha(SOURCE)==SOURCE_SHA and sha(ENTRY)==ENTRY_SHA
    write(BASE/'native-cycle.json',dict(schema='male-native-skin-recovery-cycle-v1',status='native-cycle-complete-cpu-readback-pending',
          source=dict(path=SOURCE.relative_to(ROOT).as_posix(),sha256=SOURCE_SHA),entryRestored=restored,
          originalsUnchanged=True,groupsAfterAndReopenedExact=True,removedGroup=tops[0],
          generated=[dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size) for p in [entry_checkpoint,source_checkpoint,saved,vrm]],
          desktopInput=False,studioLaunched=False,otherStudioVersionUsed=False))

if __name__=='__main__':
    main()
