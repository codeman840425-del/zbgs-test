"""Reopen the verified male editable checkpoint and export its actual VRM.
Pinned Blender: --background --factory-startup --python this-file.py
Never edits the female source, runtime JS, or the preserved male source blend.
"""
import bpy, pathlib, json, hashlib, sys, importlib, shutil
ROOT=pathlib.Path(__file__).resolve().parents[2]
SPEC=json.loads((ROOT/'assets-source/m1b/spec.json').read_text(encoding='utf8'))
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=ROOT/SPEC['source'];blend=ROOT/SPEC['editableSource']
assert digest(source)==SPEC['sourceSha256'],'Original male VRM changed'
assert digest(blend)==SPEC['editableSourceSha256'],'Preserved male editable source changed'
sys.path.insert(0,str(ROOT/'experiments/tools/vrm-addon'))
module='VRM_Addon_for_Blender-release'
bpy.ops.preferences.addon_enable(module=module)
assert bpy.app.version_string.startswith('4.5.9')
assert tuple(importlib.import_module(module).bl_info['version'])==(4,10,5)
bpy.ops.wm.open_mainfile(filepath=str(blend))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
assert len(rigs)==1 and len(meshes)==2
assert all(o.data.uv_layers and any(m.type=='ARMATURE' for m in o.modifiers) for o in meshes)
face=next(o for o in meshes if o.name.startswith('Face'))
assert len(face.data.shape_keys.key_blocks)==55,'Expected 54 male face shapes plus Basis'
images=[i for i in bpy.data.images if i.source=='FILE']
assert all(i.packed_file for i in images),'Source depends on unpacked image files'
temporary=ROOT/'output/m1b-export/base-male-roundtrip.vrm';temporary.parent.mkdir(parents=True,exist_ok=True)
assert bpy.ops.export_scene.vrm(filepath=str(temporary),armature_object_name=rigs[0].name,export_invisibles=True,ignore_warning=True)=={'FINISHED'}
sha=digest(temporary)
if SPEC['roundtripSha256']:assert sha==SPEC['roundtripSha256'],'Export differs from the pinned roundtrip'
target=ROOT/SPEC['roundtrip'];target.parent.mkdir(parents=True,exist_ok=True)
shutil.copyfile(temporary,target)
report={'blender':bpy.app.version_string,'addon':list(importlib.import_module(module).bl_info['version']),
 'exportedFromSavedBlend':True,'sourceVRMSha256':digest(source),'editableSource':SPEC['editableSource'],'editableSourceSha256':digest(blend),
 'roundtrip':SPEC['roundtrip'],'roundtripSha256':sha,'roundtripBytes':target.stat().st_size,'packedImages':len(images),
 'meshes':[{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'uvLayers':[x.name for x in o.data.uv_layers],
 'vertexGroups':len(o.vertex_groups),'shapeKeys':[k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else [],'materials':[m.name for m in o.data.materials]} for o in meshes],
 'limits':['Reconstructed source, not original .vroid recovery','Export and structure are not runtime animation/visual approval']}
(ROOT/'assets-source/m1b/body-export-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print('M1B_BODY_EXPORTED',json.dumps({'sha256':sha,'bytes':target.stat().st_size,'sourceBlendUnchanged':digest(blend)==SPEC['editableSourceSha256']}))
