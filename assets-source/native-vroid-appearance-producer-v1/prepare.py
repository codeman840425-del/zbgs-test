"""Build bounded recipe templates from recorded reads; never calls Bridge."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def write(path,value):
    with path.open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def extract(name,require_ok=True):
    record=json.loads((BASE/'read-only'/name).read_bytes())
    if require_ok:assert record['ok'] is True
    response=next(x for x in record['responses'] if x.get('id')==2)
    return json.loads(next(x['text'] for x in response['result']['content'] if x.get('type')=='text'))

def main():
    before=extract('01-status-before.json');after=extract('16-final-status.json')
    assert before['ready'] and after['ready'] and before['dirty'] is False and after['dirty'] is False
    assert before['currentFile']==after['currentFile']
    catalog=extract('14-free-hairset-catalog.json')
    selected=catalog['presets'][0]
    assert selected['usable'] is True and selected['price']==0 and '/HairSet/N00/001/' in selected['resource']
    summary=json.loads((BASE/'continued-read-only-summary.json').read_bytes())
    params=summary['parameters']
    colors={name:dict(group=group['group'],colors=[p for p in group['payload'] if p['kind']=='color']) for name,group in params.items() if name in ['FaceSkin','BodySkin','Iris','Mouth']}
    source='assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid'
    source_sha='c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a'
    assert sha(ROOT/source)==source_sha
    template=dict(schema='native-appearance-bounded-recipe-template-v1',id='native-hairset-001-study-v1',version=1,
        status='prepared-not-executed',source=dict(path=source,sha256=source_sha),
        nativeVersions=dict(studio='2.16.0',bridge='0.15.0',bridgeCommit='c7367a548626cbe69e26b533e48fc9ddaf85851e'),
        operations=[
          dict(tool='vroid_status',arguments={},assertions=['ready=true','dirty=false','known currentFile; otherwise stop without opening/saving']),
          dict(tool='vroid_save',arguments={'path':'${newEntryCheckpoint.vroid}'},condition='future authorized native window only; exclusive new path'),
          dict(tool='vroid_main_menu',arguments={}),
          dict(tool='vroid_open',arguments={'path':'${root}/'+source}),
          dict(tool='vroid_save',arguments={'path':'${newWorkingCopy.vroid}'}),
          dict(tool='vroid_list_presets',arguments={'filter':'HairSet/N00/001','include_locked':False,'limit':4},assertions=['same selected id/resource usable=true price=0']),
          dict(tool='vroid_list_groups',arguments={},capture='beforeGroups'),
          dict(tool='vroid_apply_preset',arguments={'id':selected['id'],'preserve_material':False}),
          dict(tool='vroid_list_groups',arguments={},assertions=['all non-hair source group IDs/resources unchanged; whole hairstyle may replace multiple hair slots']),
          dict(tool='vroid_list_hair_groups',arguments={},capture='actual nonempty group kind/strand IDs; empty is explicit limitation'),
          dict(tool='vroid_list_hair_materials',arguments={},capture='actual material/Color/base keys and texture layer errors without suppressing failed call'),
          dict(tool='vroid_save',arguments={'path':'${newCandidate.vroid}'}),
          dict(tool='vroid_main_menu',arguments={}),
          dict(tool='vroid_open',arguments={'path':'${newCandidate.vroid}'}),
          dict(tool='vroid_list_groups',arguments={},assertions=['same saved hair membership and non-hair groups']),
          dict(tool='vroid_list_hair_groups',arguments={},assertions=['same group/strand count and parameters']),
          dict(tool='vroid_export_vrm',arguments=dict(path='${newCandidate.vrm}',version='1',delete_transparent=False,
               hair_smoothness=0,hair=0,face=0,body=0,outfit=0,material_mode=0,texture_mode=0,hair_bones=0,leave=True),
               assertions=['warnings=[] or explicit failure retained','preserve license fields; author/title/version only explicitly sourced']),
          dict(tool='vroid_main_menu',arguments={}),
          dict(tool='vroid_open',arguments={'path':'${newEntryCheckpoint.vroid}'}),
          dict(tool='vroid_status',arguments={},assertions=['ready=true dirty=false checkpoint restored'])],
        selectedFreePreset=selected,
        stopConditions=['No unknown/dirty editor state discarded','No paid/locked or changed source/preset',
                        'No silent unrelated group change','No source file overwritten','No retry/sweep on repeated mechanism failure'],
        offlineAcceptance=['New VRM exact SHA/meta/native saved source pins',
                           'Real hair primitive/index/weights/IBM/spring/material/texture readback',
                           'Original Body/Face/clothing attributes and expressions compared; changes reported',
                           'New equipment fits must be recomputed by exact target identity, never copied from7586',
                           'Same-room head/side/eyes and actual motion review pending'],
        placeholdersResolved=False,executionAuthorizedByThisTemplate=False,artisticAcceptance=False)
    write(BASE/'next-hair-sample-template.json',template)
    color_template=dict(schema='native-color-edit-recipe-template-v1',status='prepared-not-executed',
        sourceModelOfObservedIDs=before['currentFile'],observedColors=colors,
        skin=dict(tool='vroid_set_color',targets=[dict(groupType='FaceSkin',key='Level1FaceSkin_MainColor'),dict(groupType='BodySkin',key='Level1BodySkin_MainColor')],
                  coupling='Read both actual before values, set one shared RGBA only when intended, preserve separately-read shade/highlight/emission/outline; exported pixels must prove scope'),
        iris=dict(tool='vroid_set_color',targets=[dict(groupType='Iris',key='Level3Iris_LeftOverlayColor'),dict(groupType='Iris',key='Level3Iris_RightOverlayColor')],
                  coupling='Apply both for a paired color or explicitly choose one; keep white/highlight groups and bone sliders unchanged'),
        lips=dict(currentDedicatedLipGroupPresent=False,currentMouthOverlayKey='Level1Mouth_OverlayColor',
                  limitation='Mouth overlay/material color is not evidence of isolated outer-lip coverage; do not tint oral interior blindly',
                  availableFreeLipPresets=extract('15-free-lip-catalog.json')['presets'],
                  nextStep='Separate free native Lip overlay experiment; fresh list_groups/get_params/list_layers first, retain original mouth/teeth and compare exported layer scope'),
        hair=dict(tool='vroid_set_hair_color',material='${freshHairMaterial.id}',key='Color',color='${explicitRGBA0to1}',
                  observedMaterialColorHasReadableValue=True,baseTintGetterReturnsNullByDesign=True,
                  limitation='Material multiply Color and preset base tint are distinct; choose one mechanism per trial. Null base getter needs exported material/image and cold-open evidence.',
                  layerRoute='Only if painted color needs actual layer edit, explicit begin_hair_edit is a mutation; outside this read-only package'),
        sharedLifecycle='New copy → one bounded edit → exact get/readback → save/cold-open → export → offline affected/unaffected scope check → restore entry snapshot',
        valuesSelected=False,mutationCalls=0,notCurrentRuntimePaletteAdmission=True)
    write(BASE/'color-recipe-template.json',color_template)
    receipts=[]
    for p in sorted((BASE/'read-only').glob('*.json')):
        r=json.loads(p.read_bytes());receipts.append(dict(path=p.relative_to(ROOT).as_posix(),ok=r['ok'],failures=r['failures'],sha256=sha(p)))
    failed=[r for r in receipts if not r['ok']]
    assert len(receipts)==16 and len(failed)==1 and failed[0]['path'].endswith('04-hair-materials.json')
    refs=['assets-source/vroid-bridge-study-v1/call.py','evidence/vroid-bridge-study-v1/tools-list.json',
          'assets-source/vroid-bridge-study-v1/environment.json',
          'experiments/tools/vroid-mcp-bridge-0.15.0/package/VRoidMcp-v0.15.0/mcp_server/vroid_mcp.py',
          'experiments/tools/vroid-mcp-bridge-0.15.0/package/VRoidMcp-v0.15.0/docs/AGENT_REFERENCE_EN.md',
          'experiments/tools/vroid-mcp-bridge-0.15.0/package/VRoidMcp-v0.15.0/agent/skills/vroid-studio/SKILL.md']
    write(BASE/'readback.json',dict(schema='native-appearance-producer-input-readback-v1',status='read-only-preparation-with-preserved-hair-layer-query-failure',
        receipts=receipts,before=before,after=after,cleanModelUnchanged=True,
        currentFileSha256=sha(Path(before['currentFile'])),source=dict(path=source,sha256=source_sha),
        readonlyHairGroupsEmpty=extract('03-hair-groups.json')==[],
        hairMaterialPartialData=extract('04-hair-materials.json',False),colorParameterGroups=colors,
        queriedFreeHairSetTotal=catalog['total'],queriedFreeHairSetsReturned=len(catalog['presets']),
        sourceReferences=[dict(path=p,sha256=sha(ROOT/p)) for p in refs],
        nativeWrites=0,modelsOpened=0,exports=0,screenshots=0,desktopInput=False,GPUCalls=0,
        templatesExecuted=False,commercialOrDistributionPermissionInferred=False))
    print(json.dumps({'readOnlyCalls':16,'successfulCalls':15,'preservedPartialFailureCalls':1,'newTemplates':2,'nativeWrites':0}))

if __name__=='__main__':main()
