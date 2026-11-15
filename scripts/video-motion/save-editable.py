"""GLB retains editable motion; this additionally saves/reopens real Blender action."""
import bpy,json,pathlib,hashlib
root=pathlib.Path(__file__).resolve().parents[2];out=root/'assets-source/video-motion-v1'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps=30000;bpy.context.scene.render.fps_base=1001
bpy.ops.import_scene.gltf(filepath=str(out/'video-squat-dvids-v1.glb'))
assert any(o.type=='ARMATURE' for o in bpy.context.scene.objects)
assert len(bpy.data.actions)>0
bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=240
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'video-squat-dvids-v1.blend'),compress=True)
bpy.ops.wm.open_mainfile(filepath=str(out/'video-squat-dvids-v1.blend'))
report={'blender':bpy.app.version_string,'sha256':hashlib.sha256((out/'video-squat-dvids-v1.blend').read_bytes()).hexdigest(),'actions':[a.name for a in bpy.data.actions],'armatures':[o.name for o in bpy.context.scene.objects if o.type=='ARMATURE'],'reopened':True,'fps':bpy.context.scene.render.fps/bpy.context.scene.render.fps_base,'note':'Canonical rebuild is build.py; artist changes to Blend require a separately reviewed derivative export, not overwrite of pinned GLB'}
(out/'editable-readback.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(report)
