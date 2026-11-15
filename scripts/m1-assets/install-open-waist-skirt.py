"""Reuse the existing verified source edit as an independent experimental fit.

This does not repair the old visible face587 plate; the runtime skin fix does.
Only the source's physically closed waist fan is removed. No top/body edits.
"""
import copy, hashlib, json, pathlib, shutil

ROOT=pathlib.Path(__file__).resolve().parents[2]
source=ROOT/'assets-source/m1/offline-corrective/open-waist-v1'
edit=json.loads((source/'edit.json').read_text(encoding='utf-8'))
raw=(source/'m1-uniform-skirt-open-waist.glb').read_bytes()
digest=hashlib.sha256(raw).hexdigest()
assert digest==edit['resultSha256']=='a5de096be20211ea9a875434893fff6c9d37b25b58cacc27c9bd8d7b8c772d66'
assert edit['resultRenderVertices']==682 and edit['originalTriangles']-edit['resultTriangles']==20
manifestPath=ROOT/'prototype/public/assets/m1/equipment.json'
manifest=json.loads(manifestPath.read_text(encoding='utf-8'))
old=next(e for e in manifest['items'] if e['id']=='m1-uniform-skirt')
assert old['sha256']=='065305626976c59b370d082baa6fd1e2aed8c262490e04e39543345170eb8d8d'
newId='m1-uniform-skirt-open-waist-v1'
entry=copy.deepcopy(old)
entry.update(id=newId,name='原制服裙 · 开放腰口修订候选',url=newId+'.glb',sha256=digest,bytes=len(raw),
             sourceRevision='open-waist-v1',sourceEdit='remove original internal waist fan faces 0..19; preserve surviving geometry, weights and material')
existing=next((e for e in manifest['items'] if e['id']==newId),None)
if existing is None:manifest['items'].append(entry)
else:assert existing==entry,'Refuse changing an existing resource version'
target=manifestPath.parent/(newId+'.glb')
if target.exists():assert target.read_bytes()==raw
else:target.write_bytes(raw)
manifestPath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
fitsPath=ROOT/'prototype/src/skirt-fit-profiles.json'
fits=json.loads(fitsPath.read_text(encoding='utf-8'))
fit=copy.deepcopy(next(f for f in fits['fits'] if f['garmentId']==old['id']))
fit.update(id=newId+'-pose-guide-v1',garmentId=newId,garmentSha256=digest,vertexCount=682)
existingFit=next((f for f in fits['fits'] if f['garmentId']==newId),None)
if existingFit is None:fits['fits'].append(fit)
else:assert existingFit==fit
fitsPath.write_text(json.dumps(fits,indent=2)+'\n',encoding='utf-8')
profile=ROOT/'prototype/src/foundation-profiles.js'
s=profile.read_text(encoding='utf-8')
oldText='skirt: "m1-uniform-skirt"'
assert oldText in s or ('skirt: "'+newId+'"') in s
profile.write_text(s.replace(oldText,'skirt: "'+newId+'"'),encoding='utf-8')
out=ROOT/'assets-source/skirt-open-waist-runtime-v1';out.mkdir(exist_ok=True)
receipt={'source':str(source.relative_to(ROOT)).replace('\\','/'),'resourceId':newId,'sha256':digest,'bytes':len(raw),
         'sourceEditSHA256':hashlib.sha256((source/'edit.json').read_bytes()).hexdigest(),
         'fit':fit,'entry':entry,'limits':['Original female only. Jaw/waist variants not modified.','Runtime/visual/contact validation is separate.','No new wardrobe style, controller or body mask.']}
(out/'install-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'id':newId,'sha256':digest,'vertices':682,'triangles':680}))
