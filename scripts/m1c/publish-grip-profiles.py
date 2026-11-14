"""Publish explicit fitted pose data, keeping numerical fitting out of runtime."""
import hashlib
import json
import pathlib

root=pathlib.Path(__file__).resolve().parents[2]
out=root/'prototype/public/assets/m1c/grips';out.mkdir(parents=True,exist_ok=True)
manifest={'schema':'zbgs-grip-profile-manifest-v1','items':[]}
accessories=json.loads((root/'prototype/public/assets/m1c/accessories.json').read_text(encoding='utf8'))
mic=next(item for item in accessories['items'] if item['id']=='studio-microphone-v1')
for body in ['female','male']:
    src=root/'assets-source/m1c-grip'/body/'grip.json';fit=json.loads(src.read_text(encoding='utf8'))
    data={'schema':'zbgs-grip-profile-v1','id':body+'-source-grip-v1',
          'compatibleAvatarSha256':fit['avatarSha256'],'accessoryId':'studio-microphone-v1',
          'compatibleAccessorySha256':mic['sha256'],'fitVersion':'source-grip-v1',
          'normalizedFingerRotations':fit['normalizedFingerRotations'],'micRawHandLocal':fit['micRawHandLocal'],
          'source':'assets-source/m1c-grip/'+body+'/grip.json',
          'method':fit['method'],'verified':False,
          'validation':'Fixed ca72 diagnostic source-pose-thumb-height: stand/sit/walk representative samples; full motion chain pending.',
          'limits':['No more than 1mm handle-cylinder penetration in tested samples; not full triangle CCD.','Palm/hand aesthetic fit and complete dynamics are not universally accepted.','Exact body SHA only; no inherited variant fit.']}
    raw=(json.dumps(data,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode('utf8');name=body+'-source-grip-v1.json';(out/name).write_bytes(raw)
    manifest['items'].append({'id':data['id'],'compatibleAvatarSha256':fit['avatarSha256'],'accessoryId':mic['id'],'accessorySha256':mic['sha256'],'url':'/assets/m1c/grips/'+name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
print(json.dumps(manifest,indent=2))
