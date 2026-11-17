"""Publish the bounded male thumb revision as new data, keeping v1 resources."""
import hashlib,json,pathlib,os
R=pathlib.Path(__file__).resolve().parents[1]
S=R/'assets-source/native-live-accessory-fit-v3'
D=R/'prototype/public/assets/native-live-accessory-fit-v3'
M=R/'prototype/public/assets/m1c/grips/manifest.json'
def h(b):return hashlib.sha256(b).hexdigest()
def enc(d):return (json.dumps(d,indent=2)+'\n').encode('utf8')
raw=(S/'male-grip.json').read_bytes()
assert h(raw)=='e5ec286a759fb1089ce3a9280a544509ef7ff9896fd5b44e0147744ccfa035c3'
source=json.loads(raw);check=json.loads((S/'vrm-readback.json').read_bytes())
assert check['passed']
old=(R/'prototype/public/assets/native-live-accessory-fit-v1/male-7586.json').read_bytes()
profile=json.loads(old)
assert source['avatarSha256']==profile['compatibleAvatarSha256']
assert source['micRawHandLocal']==profile['micRawHandLocal'],'Unreviewed mount change'
profile.update(id='native-male-7586-grip-v3',fitVersion='native-vrm1-thumb-revision-v3',
    normalizedFingerRotations=source['normalizedFingerRotations'],sourceGripSha256=h(raw),
    status='cpu-readback-passed-browser-candidate',limits=[
        'Only male thumb revised; v1 non-thumb controls and microphone mount preserved.',
        'Zero sampled cylinder penetration is not full mesh contact or visual acceptance.'])
profile.pop('sourceCandidateSha256',None)
data=enc(profile);dest=D/'male-7586.json'
registry_before=M.read_bytes();registry=json.loads(registry_before)
entry=next(x for x in registry['items'] if x['compatibleAvatarSha256']==profile['compatibleAvatarSha256'])
allowed={h(old),h(data)}
assert entry['sha256'] in allowed,'Unreviewed prior male grip revision'
entry.update(id=profile['id'],url='/assets/native-live-accessory-fit-v3/male-7586.json',sha256=h(data),bytes=len(data))
if dest.exists() and dest.read_bytes()!=data:raise ValueError('Immutable v3 resource conflict')
assert M.read_bytes()==registry_before
D.mkdir(exist_ok=True)
if not dest.exists():dest.write_bytes(data)
if M.read_bytes()!=enc(registry):
    tmp=M.with_name(M.name+'.native-v3.tmp');tmp.write_bytes(enc(registry));os.replace(tmp,M)
out=R/'evidence/native-live-accessory-fit-v3';out.mkdir(exist_ok=True)
(out/'stage.json').write_bytes(enc({'sourceSha256':h(raw),'profileSha256':h(data),'bytes':len(data),
    'oldProfileSha256':h(old),'runtimeCandidate':True,'visualAccepted':False}))
print(json.dumps({'profileSha256':h(data),'bytes':len(data),'status':'browser-candidate-only'}))
