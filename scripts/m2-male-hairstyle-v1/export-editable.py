"""Export an artist-edited Hair_candidate as a standalone rigid head-local GLB.
Does not overwrite the deterministic source candidate or change its manifest.
"""
import bpy,pathlib,json
from mathutils import Matrix
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/m2-male-hairstyle-v1'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'editable.blend'),use_scripts=False)
o=bpy.data.objects['Hair_candidate'];o.hide_set(False);o.hide_render=False
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
# The source project retains whole-character placement for editing. The mesh's
# actual local coordinates are head-local, with Blender's standard glTF basis.
o.matrix_world=Matrix.Identity(4)
bpy.ops.export_scene.gltf(filepath=str(OUT/'editable-export.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
print('Exported editable-export.glb; original candidate/manifest untouched.')
