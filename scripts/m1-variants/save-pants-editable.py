"""Save packed editable fitted-pants checkpoints for both local specimens.
The complete candidate editable.blend already contains its top/skirt/shoes.
Canonical pants regeneration remains build-equipment.py against the exact body.
"""
import bpy,pathlib,json,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2];reports=[]
for identifier in ['m1a-jaw-v1','m1a-waisthip-v1']:
 folder=ROOT/'prototype/public/assets/m1-variants'/identifier/'equipment';manifest=json.loads((folder/'equipment.json').read_text(encoding='utf8'));item=next(i for i in manifest['items'] if i['id'].endswith('-training-pants'));source=folder/item['url'];assert hashlib.sha256(source.read_bytes()).hexdigest()==item['sha256']
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source));meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(item['id'])];rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];assert meshes and len(rigs)==1
 assert all(o.vertex_groups and any(m.type=='ARMATURE' for m in o.modifiers) for o in meshes)
 bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0;target=ROOT/'assets-source/m1-variants'/identifier/'training-pants-editable.blend';bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
 bpy.ops.wm.open_mainfile(filepath=str(target));assert len([o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(item['id'])])==len(meshes)
 reports.append({'id':identifier,'equipment':item['id'],'sourceGlbSha256':item['sha256'],'file':str(target.relative_to(ROOT)).replace('\\','/'),'fileSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'savedAndReopened':True,'limits':['Source recipe, not arbitrary edited garment re-export acceptance']})
(ROOT/'assets-source/m1-variants/pants-editable-report.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf8');print(json.dumps(reports,indent=2))

