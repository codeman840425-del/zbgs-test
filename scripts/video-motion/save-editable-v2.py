import bpy,json,pathlib,hashlib
root=pathlib.Path(__file__).resolve().parents[2];out=root/'assets-source/video-motion-v2'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps=30000;bpy.context.scene.render.fps_base=1001
bpy.ops.import_scene.gltf(filepath=str(out/'video-squat-dvids-wrists-v2.glb'))
assert len(bpy.data.actions)>0
bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=240
bpy.context.preferences.filepaths.save_version=0
file=out/'video-squat-dvids-wrists-v2.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True);bpy.ops.wm.open_mainfile(filepath=str(file))
(out/'editable-readback.json').write_text(json.dumps({'blender':bpy.app.version_string,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'actions':[a.name for a in bpy.data.actions],'reopened':True},indent=2),encoding='utf-8')
