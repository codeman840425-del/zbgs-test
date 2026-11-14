"""Create actual editable, packed Blender garment projects from M1B male exports.
Canonical reproducible geometry remains spec.json + build.py. These files are
editable checkpoints, not a claim of a tested arbitrary hand-edit/re-export loop.
Run: blender --background --factory-startup --python scripts/m1b-assets/save-editable.py
"""
import bpy, pathlib, json, hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
manifest=json.loads((ROOT/'prototype/public/assets/m1b/equipment.json').read_text(encoding='utf-8'))
reports=[]
for item in manifest['items']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'prototype/public/assets/m1b'/item['url']))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(item['id'])]
    rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
    assert meshes and rigs
    assert all(any(m.type=='ARMATURE' for m in o.modifiers) for o in meshes)
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version=0
    target=ROOT/'assets-source/m1b'/(item['id']+'.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
    reports.append({'id':item['id'],'file':str(target.relative_to(ROOT)),'sourceGlbSha256':item['sha256'],
        'meshes':[{'name':o.name,'vertices':len(o.data.vertices),'faces':len(o.data.polygons),'groups':len(o.vertex_groups),'materials':[m.name for m in o.data.materials]} for o in meshes],
        'armatures':len(rigs),'imagesPacked':all(i.packed_file for i in bpy.data.images if i.source=='FILE')})
    bpy.ops.wm.open_mainfile(filepath=str(target))
    reopened=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(item['id'])]
    assert sum(len(o.data.vertices) for o in reopened)==sum(m['vertices'] for m in reports[-1]['meshes'])
    assert all(any(m.type=='ARMATURE' for m in o.modifiers) for o in reopened)
    assert all(i.packed_file for i in bpy.data.images if i.source=='FILE')
    reports[-1]['reopenedVerified']=True
    reports[-1]['nonEquipmentHelperMeshes']=[o.name for o in bpy.context.scene.objects if o.type=='MESH' and o not in reopened]
    reports[-1]['blendSha256']=hashlib.sha256(target.read_bytes()).hexdigest()
(ROOT/'assets-source/m1b/editable-report.json').write_text(json.dumps({'blender':bpy.app.version_string,'assets':reports},indent=2),encoding='utf-8')
