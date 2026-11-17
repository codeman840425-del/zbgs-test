"""Prepare an exact-ID, saved-copy Tops-removal probe. NEVER calls MCP/editor."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'evidence/native-vroid-body-audit-v1/skin-mask-recovery'
REQUESTS=Path(__file__).resolve().parent/'requests'
GENERATED=Path(__file__).resolve().parent/'generated'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def payload(path):
    record=json.loads(path.read_text(encoding='utf-8-sig'))
    assert record['ok'] is True, 'failed historical or fresh MCP call'
    response=next(r for r in record['responses'] if r.get('id')==2)
    assert not response['result'].get('isError',False)
    return json.loads(response['result']['content'][0]['text'])
def write(path,value):
    with path.open('x',encoding='utf-8') as f:json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n')
def main():
    OUT.mkdir(parents=True,exist_ok=True)
    REQUESTS.mkdir(parents=True,exist_ok=False)
    GENERATED.mkdir(parents=True,exist_ok=False)
    original=ROOT/'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vroid'
    assert sha(original)=='311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de'
    history=ROOT/'evidence/vroid-bridge-study-v1/groups-reopened-216.json'
    groups=payload(history)
    tops=[g for g in groups if g['type']=='TransferableGroupType.N00.Level1.Tops']
    assert len(tops)==1
    assert tops[0]['id']=='0651673b88702f454523c48963fd21a01d976554.transferablegroup'
    copied=GENERATED/'female-before-tops-removal.vroid'
    saved=GENERATED/'female-tops-removed.vroid'
    vrm=GENERATED/'female-tops-removed.vrm'
    for p in [copied,saved,vrm]:assert not p.exists()
    calls=[
      ('01-status','vroid_status',{}),
      ('02-menu-after-owner-checkpoint','vroid_main_menu',{}),
      ('03-open-pinned-female','vroid_open',{'path':str(original)}),
      ('04-groups-before','vroid_list_groups',{}),
      ('05-save-new-checkpoint','vroid_save',{'path':str(copied)}),
      ('06-remove-exact-top','vroid_remove_item',{'group':tops[0]['id']}),
      ('07-groups-after','vroid_list_groups',{}),
      ('08-save-new-result','vroid_save',{'path':str(saved)}),
      ('09-export-new-result','vroid_export_vrm',dict(path=str(vrm),version='1',title='Native skin-mask Tops removal probe',author='gamemake technical study',model_version='skin-mask-probe-v1',delete_transparent=False,hair_smoothness=0,hair=0,face=0,body=0,outfit=0,material_mode=0,texture_mode=0,hair_bones=0,leave=True)),
      ('10-menu-after-saved-result','vroid_main_menu',{}),
      ('11-reopen-new-result','vroid_open',{'path':str(saved)}),
      ('12-groups-reopened','vroid_list_groups',{}),
    ]
    for name,tool,args in calls:write(REQUESTS/(name+'.json'),{'method':'tools/call','params':{'name':tool,'arguments':args}})
    write(OUT/'prepared.json',dict(schema='native-skin-mask-recovery-preparation-v1',status='prepared-not-executed',source=dict(path=str(original),sha256=sha(original)),historicalGroups=dict(path=str(history),sha256=sha(history)),removedGroup=tops[0],beforeGroups=groups,afterExpectedGroups=[g for g in groups if g['id']!=tops[0]['id']],requests=[dict(path=str(REQUESTS/(name+'.json')),sha256=sha(REQUESTS/(name+'.json'))) for name,_,_ in calls],generatedPaths=[str(p) for p in [copied,saved,vrm]],editorCalled=False))
    print(json.dumps({'status':'prepared-not-executed','requests':len(calls),'topsId':tops[0]['id']}))
if __name__=='__main__':main()
