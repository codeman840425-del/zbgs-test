from pathlib import Path
import bpy,json,hashlib
R=Path(__file__).resolve().parents[3];O=R/'assets-source/m1/simple-skirt-v1/local-retailor-shared-columns-v1';rows=[]
for name in ['m1-sidevent-top-layout-v2.blend','m1-panel-skirt-shared-columns-v1.blend','hem-seated-author.blend']:
 p=O/name;before=hashlib.sha256(p.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(p));rows.append({'file':name,'sha256':before,'sameBytesAfterRead':hashlib.sha256(p.read_bytes()).hexdigest()==before,'meshes':[{'name':o.name,'vertices':len(o.data.vertices),'faces':len(o.data.polygons),'shapeKeys':[k.name for k in o.data.shape_keys.key_blocks]if o.data.shape_keys else[],'modifiers':[{'name':m.name,'type':m.type}for m in o.modifiers]}for o in bpy.data.objects if o.type=='MESH'],'blender':bpy.app.version_string,'unitScale':bpy.context.scene.unit_settings.scale_length})
(O/'blend-readback.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8');print(json.dumps(rows))
