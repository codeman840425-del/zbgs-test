"""Create actual editable, packed Blender garment projects from M1 exports.
Canonical reproducible geometry remains spec.json + build.py. These files are
editable checkpoints, not a claim of a tested arbitrary hand-edit/re-export loop.
Run: blender --background --factory-startup --python scripts/m1-assets/save-editable.py
"""
import bpy, pathlib, json
ROOT=pathlib.Path(__file__).resolve().parents[2]
manifest=json.loads((ROOT/'prototype/public/assets/m1/equipment.json').read_text(encoding='utf-8'))
reports=[]
for item in manifest['items']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'prototype/public/assets/m1'/item['url']))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(item['id'])]
    rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
    assert meshes and rigs
    assert all(any(m.type=='ARMATURE' for m in o.modifiers) for o in meshes)
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version=0
    target=ROOT/'assets-source/m1'/(item['id']+'.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
    reports.append({'id':item['id'],'file':str(target.relative_to(ROOT)),'sourceGlbSha256':item['sha256'],
        'meshes':[{'name':o.name,'vertices':len(o.data.vertices),'faces':len(o.data.polygons),'groups':len(o.vertex_groups),'materials':[m.name for m in o.data.materials]} for o in meshes],
        'armatures':len(rigs),'imagesPacked':all(i.packed_file for i in bpy.data.images if i.source=='FILE')})
(ROOT/'assets-source/m1/editable-report.json').write_text(json.dumps({'blender':bpy.app.version_string,'assets':reports},indent=2),encoding='utf-8')
