from pathlib import Path
import bpy,json,hashlib,struct
O=Path(__file__).resolve().parent

def signature(o):
 h=hashlib.sha256()
 for v in o.data.vertices:
  h.update(struct.pack('<3d',*v.co))
  for g in v.groups:h.update(struct.pack('<id',g.group,g.weight))
 for p in o.data.polygons:
  h.update(struct.pack('<i',len(p.vertices)));h.update(struct.pack('<'+'i'*len(p.vertices),*p.vertices));h.update(struct.pack('<i',p.material_index))
 for uv in o.data.uv_layers:
  for x in uv.data:h.update(struct.pack('<2d',*x.uv))
 return {'hash':h.hexdigest(),'groups':[g.name for g in o.vertex_groups],'materials':[m.name if m else None for m in o.data.materials],'modifierTypes':[m.type for m in o.modifiers]}
source={o.name:signature(o)for o in bpy.data.objects if o.type=='MESH'}
results=[]
for name in ['BlenderChan-Native-Pressure-v1.blend','BlenderChan-Native-Pressure-Review-v1.blend']:
 path=O/'native-pressure-v1'/name;bpy.ops.wm.open_mainfile(filepath=str(path),use_scripts=False)
 mismatches=[n for n,s in source.items() if n not in bpy.data.objects or signature(bpy.data.objects[n])!=s]
 results.append({'file':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'originalMeshCount':len(source),'meshPositionTopologyUVWeightsMaterialSlotsModifierTypesMatch':not mismatches,'mismatches':mismatches})
(O/'native-pressure-v1/source-invariance.json').write_text(json.dumps({'sourceFileSha256':hashlib.sha256((O/'BlenderChan-Free.blend').read_bytes()).hexdigest(),'results':results},indent=2)+'\n',encoding='utf8');print(results)
