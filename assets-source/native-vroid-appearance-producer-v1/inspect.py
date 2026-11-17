"""Finite recorded read-only Bridge queries; never edits or opens a model."""
from pathlib import Path
import hashlib,importlib.util,json,sys
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
CLIENT=ROOT/'assets-source/vroid-bridge-study-v1/call.py'
sp=importlib.util.spec_from_file_location('original_bridge_call',CLIENT)
client=importlib.util.module_from_spec(sp);sp.loader.exec_module(client)

def payload(record):
    assert record['ok'] is True,record.get('failures')
    response=next(x for x in record['responses'] if x.get('id')==2)
    for b in response['result']['content']:
        if b.get('type')=='text':
            try:return json.loads(b['text'])
            except ValueError:continue
    raise AssertionError('Missing structured tool payload')

def write(path,value):
    with path.open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode())

def main():
    req=BASE/'requests';out=BASE/'read-only'
    req.mkdir(parents=True);out.mkdir()
    allowed={'vroid_status','vroid_list_groups','vroid_list_hair_groups','vroid_list_hair_materials','vroid_list_presets','vroid_get_params'}
    receipts=[]
    def call(name,tool,args):
        assert tool in allowed
        request=req/(name+'.json');write(request,dict(method='tools/call',params=dict(name=tool,arguments=args)))
        record=client.run_call(request,out/(name+'.json'))
        value=payload(record);receipts.append(dict(name=name,tool=tool,ok=True))
        return value
    before=call('01-status-before','vroid_status',{})
    assert before.get('ready') is True and before.get('modelOpen') is True and before.get('dirty') is False,'Read-only model inspection stopped: not ready/clean'
    groups=call('02-groups','vroid_list_groups',{})
    hair_groups=call('03-hair-groups','vroid_list_hair_groups',{})
    hair_materials=call('04-hair-materials','vroid_list_hair_materials',{})
    presets=call('05-free-hair-catalog','vroid_list_presets',dict(filter='Hair',include_locked=False,limit=12))
    parameters={}
    for index,token in enumerate(['FaceSkin','BodySkin','Iris','Mouth','FaceShape','Chest'],6):
        matches=[g for g in groups if g['type']=='TransferableGroupType.N00.Level1.'+token]
        # Iris lives under Level3; discover its actual type instead of guessing.
        if not matches:matches=[g for g in groups if g['type'].split('.')[-1]==token]
        assert len(matches)==1,(token,matches)
        parameters[token]=dict(group=matches[0],payload=call(f'{index:02d}-params-{token.lower()}','vroid_get_params',{'group':matches[0]['id']}))
    after=call('12-status-after','vroid_status',{})
    assert after['ready'] and after['dirty'] is False and after['currentFile']==before['currentFile']
    write(BASE/'read-only-summary.json',dict(schema='native-appearance-producer-read-only-v1',status='queried-only-not-edit-export-validation',
        before=before,after=after,receipts=receipts,parameters=parameters,hairGroups=hair_groups,hairMaterials=hair_materials,presetCatalog=presets,
        client=dict(path=CLIENT.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(CLIENT.read_bytes()).hexdigest()),
        mutationCalls=0,modelOpenedOrChanged=False,screenshotsOrExport=0,desktopInput=False))
    print(json.dumps({'readOnlyCalls':len(receipts),'cleanModelUnchanged':True,'currentFile':before['currentFile']}))

if __name__=='__main__':main()
