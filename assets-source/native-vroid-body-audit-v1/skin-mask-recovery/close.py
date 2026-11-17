"""Close the completed single native probe from saved files; no tool/editor calls."""
from pathlib import Path
import hashlib,json,io,sys,datetime
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
from prepare import ROOT,OUT,GENERATED,payload,write
import readback as rb
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=ROOT/'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm'
new=GENERATED/'female-tops-removed.vrm'
result=json.loads((OUT/'actual-readback/result.json').read_text(encoding='utf-8'))
before,after=rb.a.reader.GLB(source),rb.a.reader.GLB(new)
def image_bytes(g,index):
    im=g.doc['images'][index];v=g.doc['bufferViews'][im['bufferView']]
    return g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def normalize_material(g,value,key=''):
    if isinstance(value,dict):
        if key.lower().endswith('texture') and 'index' in value:
            tex=g.doc['textures'][value['index']]
            return {**{k:normalize_material(g,v,k) for k,v in value.items() if k!='index'},'resolvedTexture':dict(imageSha256=hashlib.sha256(image_bytes(g,tex['source'])).hexdigest(),sampler=g.doc['samplers'][tex['sampler']] if 'sampler' in tex else {})}
        return {k:normalize_material(g,v,k) for k,v in value.items()}
    if isinstance(value,list):return [normalize_material(g,v) for v in value]
    return value
material={}
for kind in ['body','bottoms','shoes']:
    pair=result['primitives'][kind]
    material[kind]=dict(resolvedMaterialExact=normalize_material(before,pair['before']['materialJSON'])==normalize_material(after,pair['after']['materialJSON']))
tex=result['primitives']['body']['alpha']
x=np.asarray(Image.open(io.BytesIO(image_bytes(before,tex['beforeTexture']['image']))).convert('RGBA'))
y=np.asarray(Image.open(io.BytesIO(image_bytes(after,tex['afterTexture']['image']))).convert('RGBA'))
texture=dict(sameDimensions=x.shape==y.shape,entireDecodedRGBExact=bool(np.array_equal(x[:,:,:3],y[:,:,:3])),
    beforeAlpha=dict(zero=int((x[:,:,3]==0).sum()),full=int((x[:,:,3]==255).sum())),
    afterAlpha=dict(zero=int((y[:,:,3]==0).sum()),full=int((y[:,:,3]==255).sum())),
    changedAlphaTexels=int((x[:,:,3]!=y[:,:,3]).sum()))
sb,wb,nb=rb.skeleton(before)
topname=next(m['name'] for m in before.doc['materials'] if '_Tops_'in m['name'])
top=rb.primitive(before,wb,nb,topname)
ji=top['attrs']['JOINTS_0'][top['ids']];weights=top['attrs']['WEIGHTS_0'][top['ids']]
names=np.array(top['jointNames'])[ji.astype(int)]
active=sorted(set(names[weights>0].tolist()));removed=result['skeleton']['removed']
missing=sorted(set(active)&set(removed))
lanes=np.isin(names,missing)&(weights>0)
topRisk=dict(sourceTopReferencedVertices=len(top['ids']),activeSourceBones=active,missingActiveBones=missing,affectedReferencedVertices=int(lanes.any(1).sum()),maxMissingWeightPerVertex=float(np.where(lanes,weights,0).sum(1).max()),
    interpretation='Actual original Tops weights require absent target bones; old standalone equipment cannot be rebound by editing compatibleAvatarSha256')
run=OUT/'run';calls=[]
for p in sorted(run.glob('*.json')):
    v=json.loads(p.read_text(encoding='utf-8'));assert v['ok'] is True,p
    calls.append(dict(path=str(p),tool=v['request']['params']['name'],wallSeconds=v['wallSeconds'],sha256=sha(p)))
assert len(calls)==17
removedResponse=payload(run/'06-remove-exact-top.json');assert removedResponse['removed']==['0651673b88702f454523c48963fd21a01d976554.transferablegroup']
groupsBefore=payload(run/'04-groups-before.json');groupsAfter=payload(run/'07-groups-after.json');groupsReopened=payload(run/'12-groups-reopened.json')
assert groupsAfter==groupsReopened
expected=[g for g in groupsBefore if g['id']!=removedResponse['removed'][0]];assert groupsAfter==expected
status=payload(run/'15-status-restored-male.json')
assert Path(status['currentFile']).resolve()==(GENERATED/'male-before-skin-study.vroid').resolve() and status['ready'] and not status['dirty']
femaleSource=ROOT/'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vroid'
maleSource=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid'
assert sha(femaleSource)=='311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de'
assert sha(maleSource)=='c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a'
export=payload(run/'09-export-new-result.json');assert not export['warnings'] and export['settings']['meshErasure'] is False
oldEnvelope=json.loads((ROOT/'evidence/vroid-bridge-study-v1/export-female-216.json').read_text(encoding='utf-8'))
oldResult=next(r for r in oldEnvelope['responses'] if r.get('id')==2)['result']
assert not oldResult.get('isError',False)
oldExport=json.loads(oldResult['content'][0]['text']);assert oldExport['ok'] is True
settingsKeys=['meshErasure','hairCrossSection','hairSmoothness','hair','face','body','outfit','hairBones','combineHair','materialMode','textureMode','atlasResolution']
settingDiff={k:dict(before=oldExport.get('settings',{}).get(k),after=export['settings'].get(k)) for k in settingsKeys if oldExport.get('settings',{}).get(k)!=export['settings'].get(k)}
closure=dict(schema='native-skin-mask-tops-removal-closure-v1',status='native-mask-causal-probe-complete-equipment-rebind-blocked',
    calls=calls,actualNativeCalls=17,exports=1,exactTopsRemoval=removedResponse,groupCounts=[len(groupsBefore),len(groupsAfter),len(groupsReopened)],
    savedOutputs=[dict(path=str(p),bytes=p.stat().st_size,sha256=sha(p)) for p in sorted(GENERATED.iterdir()) if p.is_file()],
    originalSourcesUnchanged=True,restoredMaleSnapshotStatus=status,exclusiveGpuWindowReleased=True,closedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    decodedBodyTexture=texture,resolvedMaterials=material,originalTopBindingRisk=topRisk,exportSettingDifferences=settingDiff,
    actualReadback=dict(path=str(OUT/'actual-readback/result.json'),sha256=sha(OUT/'actual-readback/result.json')),
    scope='One female exact Tops removal, native save/export/cold reopen. No other item removal, pixel edits, joint/weight mutation, runtime/public registration or visual admission. Alpha samples are bounded, not exhaustive coverage.')
write(OUT/'closure.json',closure)
print(json.dumps({k:closure[k] for k in ['status','groupCounts','decodedBodyTexture','resolvedMaterials','originalTopBindingRisk','exportSettingDifferences']},ensure_ascii=False))
