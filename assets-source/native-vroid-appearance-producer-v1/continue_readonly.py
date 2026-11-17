"""Continue independent reads after a preserved non-editable hair-layer error."""
from inspect import ROOT,BASE,client,payload,write
from pathlib import Path
import json

def main():
    out=BASE/'read-only';req=BASE/'requests'
    def call(name,tool,args):
        assert tool in {'vroid_status','vroid_list_presets','vroid_get_params'}
        path=req/(name+'.json');write(path,dict(method='tools/call',params=dict(name=tool,arguments=args)))
        return payload(client.run_call(path,out/(name+'.json')))
    before=payload(json.loads((out/'01-status-before.json').read_bytes()))
    status=call('05-status-after-hair-read-error','vroid_status',{})
    assert status['ready'] and status['dirty'] is False and status['currentFile']==before['currentFile']
    groups=payload(json.loads((out/'02-groups.json').read_bytes()))
    presets=call('06-free-hair-catalog','vroid_list_presets',dict(filter='Hair',include_locked=False,limit=12))
    parameters={}
    for index,token in enumerate(['FaceSkin','BodySkin','Iris','Mouth','FaceShape','Chest'],7):
        matches=[g for g in groups if g['type'].split('.')[-1]==token]
        assert len(matches)==1,(token,matches)
        parameters[token]=dict(group=matches[0],payload=call(f'{index:02d}-params-{token.lower()}','vroid_get_params',{'group':matches[0]['id']}))
    final=call('13-status-final','vroid_status',{})
    assert final['ready'] and final['dirty'] is False and final['currentFile']==before['currentFile']
    write(BASE/'continued-read-only-summary.json',dict(schema='native-appearance-independent-query-continuation-v1',
        status='other-read-only-queries-complete-hair-layer-error-retained',before=before,after=final,
        parameters=parameters,presetCatalog=presets,partialFailure='04-hair-materials.json: two layer-query errors retained; no retry/edit/init',
        mutationCalls=0,modelOpenedOrChanged=False,saveOrExportCalls=0,screenshotsOrGPUCalls=0))
    print(json.dumps({'remainingReadOnlyQueries':9,'cleanModelUnchanged':True,'parameterGroups':list(parameters)}))

if __name__=='__main__':main()
