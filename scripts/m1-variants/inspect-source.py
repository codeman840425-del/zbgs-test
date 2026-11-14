import bpy,json,pathlib,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
p=ROOT/'assets-source/foundation/base-female-editable.blend'
bpy.ops.wm.open_mainfile(filepath=str(p))
out={'source':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'meshes':[]}
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 materials=[]
 for mi,m in enumerate(o.data.materials):
  ids=sorted({v for poly in o.data.polygons if poly.material_index==mi for v in poly.vertices})
  vertices=[o.data.vertices[i].co for i in ids]
  bounds=[[min(v[k] for v in vertices) for k in range(3)],[max(v[k] for v in vertices) for k in range(3)]]
  materials.append({'name':m.name,'vertices':len(ids),'boundsBlenderLocal':bounds})
 rows=[]
 if o.name=='Body':
  skinid=next(i for i,m in enumerate(o.data.materials) if 'Body_00_SKIN' in m.name)
  ids={v for poly in o.data.polygons if poly.material_index==skinid for v in poly.vertices}
  for z in [.7,.8,.9,1.,1.05,1.1,1.15,1.2]:
   points=[o.data.vertices[i].co for i in ids if abs(o.data.vertices[i].co.z-z)<.012]
   if points:rows.append({'z':z,'n':len(points),'xmin':min(v.x for v in points),'xmax':max(v.x for v in points),'ymin':min(v.y for v in points),'ymax':max(v.y for v in points)})
 out['meshes'].append({'name':o.name,'matrixWorld':list(map(list,o.matrix_world)),'materials':materials,'rows':rows,'keys':[k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else []})
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
out['bones']=[{'name':b.name,'head':list(b.head_local),'tail':list(b.tail_local)} for b in rig.data.bones if any(x in b.name for x in ['Hips','Spine','Head','Neck','UpperLeg'])]
(ROOT/'assets-source/m1-variants/source-inspection.json').write_text(json.dumps(out,indent=2),encoding='utf8')
print(json.dumps(out,indent=2))
