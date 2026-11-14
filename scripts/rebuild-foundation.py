"""Run with the pinned Blender, not system Python.

blender --background --factory-startup --python scripts/rebuild-foundation.py
Append -- --from-blend to export the saved editable project without reimporting.
This reconstructs a source; it does not recover .vroid data.
"""
import hashlib
import importlib
import json
import pathlib
import sys
import bpy

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'prototype/public/assets/foundation/base-female.vrm'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == '1995f174f6c8f2211f3c56c9e5fe4f9daf27ee5e648f129479582a259238149b'
addon_dir = ROOT / 'experiments/tools/vrm-addon'
sys.path.insert(0, str(addon_dir))
module = 'VRM_Addon_for_Blender-release'
bpy.ops.preferences.addon_enable(module=module)
out = ROOT / 'assets-source/foundation'
out.mkdir(parents=True, exist_ok=True)
blend = out / 'base-female-editable.blend'
from_blend = '--from-blend' in sys.argv
if from_blend:
    bpy.ops.wm.open_mainfile(filepath=str(blend))
else:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    result = bpy.ops.import_scene.vrm(filepath=str(SOURCE), enable_mtoon_outline_preview=False)
    assert result == {'FINISHED'}, result
meshes = []
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH': continue
    meshes.append({'name': obj.name, 'vertices':len(obj.data.vertices), 'polygons':len(obj.data.polygons),
                   'uvLayers':[u.name for u in obj.data.uv_layers], 'vertexGroups':len(obj.vertex_groups),
                   'shapeKeys':[k.name for k in obj.data.shape_keys.key_blocks] if obj.data.shape_keys else [],
                   'materials':[m.name if m else None for m in obj.data.materials],
                   'armatureModifiers':[m.object.name for m in obj.modifiers if m.type=='ARMATURE' and m.object]})
armatures = [{'name':o.name,'bones':len(o.data.bones)} for o in bpy.context.scene.objects if o.type=='ARMATURE']
assert len(armatures)==1
assert any(len(m['shapeKeys'])>=56 for m in meshes), 'Face shapes were lost'
assert all(m['uvLayers'] and m['armatureModifiers'] for m in meshes)
bpy.ops.file.pack_all()
images=[{'name':i.name,'source':i.source,'packed':bool(i.packed_file)} for i in bpy.data.images if i.source=='FILE']
assert all(i['packed'] for i in images), 'Editable project depends on unpacked external images'
bpy.context.preferences.filepaths.save_version=0
if not from_blend:
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
target=ROOT/'prototype/public/assets/foundation/base-female-roundtrip.vrm'
result=bpy.ops.export_scene.vrm(filepath=str(target), armature_object_name=armatures[0]['name'], export_invisibles=True, ignore_warning=True)
assert result=={'FINISHED'},result
report={'blender':bpy.app.version_string, 'addon':importlib.import_module(module).bl_info['version'],
        'exportedFromSavedBlend':from_blend,
        'sourceType':'Reconstructed editable project from preserved VRM; original .vroid not recovered',
        'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'exportSha256':hashlib.sha256(target.read_bytes()).hexdigest(),
        'meshes':meshes,'armatures':armatures,'images':images,
        'limits':['No authored body morphs or automatic garment fitting supplied','Roundtrip visual comparison must be run in browser','Vertex/shape-key presence alone does not pass visual acceptance']}
(out/'rebuild-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
print('FOUNDATION_REPORT',json.dumps(report,ensure_ascii=False))
