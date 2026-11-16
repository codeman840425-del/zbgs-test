"""Record exact editable export and fit, retaining rejected source admission."""
from pathlib import Path
import copy,hashlib,json,sys
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-layered-outer-v1';OUT=BASE/'generated'
sys.path.insert(0,str(ROOT/'scripts/production'))
from flow import GLB,Validator
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
S=json.loads((BASE/'spec.json').read_text(encoding='utf-8'));entry=json.loads((OUT/'equipment-entry.json').read_text(encoding='utf-8'))
asset=OUT/'author-export.glb';entry.update(url='author-export.glb',sha256=sha(asset),bytes=asset.stat().st_size)
entry['sourceSpec']='assets-source/m2-layered-outer-v1/spec.json'
entry['admission']='rejected-static-source-contact; do not install as accepted equipment'
body=GLB((ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm').read_bytes())
v=Validator(ROOT);result=v.equipment(entry,S['bodySha256'],body,'assets-source/m2-layered-outer-v1/generated/author-equipment.json')
failures=[]
for label,bad in [('wrong-body',dict(entry,compatibleAvatarSha256='0'*64)),('wrong-asset',dict(entry,sha256='0'*64))]:
 try:v.equipment(bad,S['bodySha256'],body,'assets-source/m2-layered-outer-v1/generated/author-equipment.json')
 except ValueError as error:failures.append({'case':label,'rejected':str(error)})
 else:raise AssertionError(label)
fit={'schema':'m2-layered-garment-fit-v1','id':S['fitId'],'version':1,'styleId':S['styleId'],'assetSha256':entry['sha256'],
     'targetBodySha256':S['bodySha256'],'innerTopSha256':S['parentTopSha256'],'layerWith':S['layerWith'],'allowedBottoms':S['allowedBottoms'],
     'sourceSpecSha256':sha(BASE/'spec.json'),'bindingMode':'raw skeleton with exact original inverse binds; skin interpolated through clipped material coordinates',
     'coverage':[],'physics':'skinning-only','sourceAdmission':'rejected','reason':'167 top contacts / 1088 self strict crossings at source T pose; no body/pants/shorts crossings',
     'notRuntimeRegistered':True}
(OUT/'author-equipment.json').write_text(json.dumps({'schema':'zbgs-equipment-v1','items':[entry]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'fit.json').write_text(json.dumps(fit,indent=2)+'\n',encoding='utf-8')
(OUT/'binding-check.json').write_text(json.dumps({'structuralBindingPassed':True,'result':result,'negativeChecks':failures,'sourceGeometryAdmission':False,'gameAcceptance':False},indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
