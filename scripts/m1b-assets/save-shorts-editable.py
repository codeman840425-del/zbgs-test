"""Create/reopen the shorts edit source and export it twice with pinned Blender.
Run Blender background; --reuse preserves actual edits in the saved blend.
The normalized runtime repack is a separate Python step.
"""
import bpy, pathlib, json, hashlib, sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
folder=ROOT/'assets-source/m1b/shorts';target=folder/'m1b-uniform-shorts-v1.blend'
scratch=ROOT/'output/m1b-shorts';scratch.mkdir(parents=True,exist_ok=True)
assert bpy.app.version==(4,5,9)
if '--reuse' in sys.argv:
    bpy.ops.wm.open_mainfile(filepath=str(target))
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'prototype/public/assets/m1b/m1b-uniform-shorts-v1.glb'))
    bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
reports=[]
for i in range(2):
    bpy.ops.wm.open_mainfile(filepath=str(target))
    bpy.ops.object.select_all(action='DESELECT')
    selected=[]
    for o in bpy.context.scene.objects:
        if o.type=='ARMATURE' or (o.type=='MESH' and o.name.startswith('m1b-uniform-shorts-v1')):
            o.select_set(True);selected.append(o)
    meshes=[o for o in selected if o.type=='MESH'];assert meshes and all(any(m.type=='ARMATURE' for m in o.modifiers)for o in meshes)
    bpy.context.view_layer.objects.active=meshes[0]
    out=scratch/f'editable-export-{i+1}.glb'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_morph=False,export_yup=True)
    reports.append({'file':str(out.relative_to(ROOT)),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'meshVertices':sum(len(o.data.vertices)for o in meshes),'faces':sum(len(o.data.polygons)for o in meshes),'allImagesPacked':all(im.packed_file for im in bpy.data.images if im.source=='FILE')})
report={'blender':bpy.app.version_string,'blend':str(target.relative_to(ROOT)),'blendSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'exports':reports,'repeatedExportByteIdentical':reports[0]['sha256']==reports[1]['sha256']}
(folder/'editable-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');assert report['repeatedExportByteIdentical'];print(json.dumps(report,indent=2))
