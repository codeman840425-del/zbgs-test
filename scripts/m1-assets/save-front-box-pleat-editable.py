"""Blender editable checkpoint/readback; normative export remains source + parameters."""
from pathlib import Path
import bpy,json,hashlib
R=Path(__file__).resolve().parents[2];O=R/'assets-source/m1/front-box-pleat-v1';asset=O/'m1-front-box-pleat-v1.glb';expected=json.loads((O/'build-report.json').read_text(encoding='utf-8'))['outputSha256']
assert hashlib.sha256(asset.read_bytes()).hexdigest()==expected
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(asset))
def stats():
 return [{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'uvLayers':len(o.data.uv_layers),'vertexGroups':len(o.vertex_groups),'armatureModifiers':[m.object.name for m in o.modifiers if m.type=='ARMATURE'],'materials':[s.material.name for s in o.material_slots]}for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
before=stats();print(before);assert len(before)==1 and before[0]['polygons']==724 and before[0]['uvLayers'] and before[0]['vertexGroups'] and before[0]['armatureModifiers']
bpy.context.scene['candidate_status']='REJECTED: added standing top crossings; no product acceptance'
bpy.context.scene['source_asset_sha256']=expected
bpy.context.scene['editable_contract']='Mesh, UV, texture, armature and weights editable. Parameters + generator is normative; hand edits are not silently regenerated.'
for image in bpy.data.images:
 if image.source=='FILE' and image.has_data:image.pack()
file=O/'m1-front-box-pleat-v1.blend';bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True)
bpy.ops.wm.open_mainfile(filepath=str(file));after=stats();assert before==after
(O/'editable-readback.json').write_text(json.dumps({'status':'editable-save-reopen-passed-not-geometry-acceptance','assetSha256':expected,'blenderVersion':bpy.app.version_string,'blendSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'mesh':after,'notPassed':['standing top contact','four-weight transfer budget','runtime integration','visual style']},indent=2)+'\n',encoding='utf-8')
print('Saved/reopened isolated failed source sample',file)
