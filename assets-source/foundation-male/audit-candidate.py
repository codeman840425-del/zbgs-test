"""Pinned Blender: inspect/reconstruct male candidate only, never product assets."""
import bpy,sys,pathlib,json,struct,hashlib,math,bmesh
from mathutils import Vector,Matrix,Quaternion
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path(__file__).resolve().parent
EVIDENCE=ROOT/'evidence/m1b-selection';EVIDENCE.mkdir(parents=True,exist_ok=True)
SOURCE=OUT/'Base_Male.vrm'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='ab9af434a229283c192546486f9e6eb9cd855bf7d8d45b5037ac211938cb903c'
def gltf_audit(path):
 d=path.read_bytes();n=struct.unpack_from('<I',d,12)[0];j=json.loads(d[20:20+n]);bin=d[28+n:]
 formats={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'};sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
 def acc(i):
  a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];fmt='<'+formats[a['componentType']]*sizes[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',struct.calcsize(fmt));return [struct.unpack_from(fmt,bin,start+k*stride) for k in range(a['count'])]
 parents={c:i for i,node in enumerate(j['nodes']) for c in node.get('children',[])};cache={}
 def world(i):
  if i in cache:return cache[i]
  node=j['nodes'][i];q=node.get('rotation',[0,0,0,1]);local=Matrix.LocRotScale(Vector(node.get('translation',[0,0,0])),Quaternion([q[3],*q[:3]]),Vector(node.get('scale',[1,1,1])))
  cache[i]=(world(parents[i])@local) if i in parents else local;return cache[i]
 bones={b['bone']:list(world(b['node']).translation) for b in j['extensions']['VRM']['humanoid']['humanBones']}
 length=lambda a,b:(Vector(bones[a])-Vector(bones[b])).length
 meshes=[];skin=[]
 for mesh in j['meshes']:
  primitives=[]
  for p in mesh['primitives']:
   material=j['materials'][p['material']]['name'];pos=acc(p['attributes']['POSITION']);idx=[x[0] for x in acc(p['indices'])]
   primitives.append({'material':material,'triangles':len(idx)//3,'morphTargets':len(p.get('targets',[])),'positionAccessor':p['attributes']['POSITION']})
   if 'Body_00_SKIN' in material:skin.extend([[pos[k] for k in idx[t:t+3]] for t in range(0,len(idx),3)])
  meshes.append({'name':mesh['name'],'primitives':primitives})
 def ray(x,y):
  hits=[]
  for a,b,c in skin:
   det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
   if abs(det)<1e-12:continue
   u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det;v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det;w=1-u-v
   if min(u,v,w)>=-1e-8:hits.append(round(u*a[2]+v*b[2]+w*c[2],6))
  return {'x':x,'y':y,'distinctZ':sorted(set(hits))}
 hip=bones['hips'][1];chest=bones['chest'][1]
 rays=[ray(x,hip+(chest-hip)*f) for f in [-.1,0,.25,.5,.75,1,1.15] for x in [-.065,0,.065]]
 return {'sha256':hashlib.sha256(d).hexdigest(),'meta':j['extensions']['VRM']['meta'],'generator':j['asset'].get('generator'),'bones':bones,'measures':{'hipsHeight':hip,'legLength':length('leftUpperLeg','leftLowerLeg')+length('leftLowerLeg','leftFoot'),'armLength':length('leftUpperArm','leftLowerArm')+length('leftLowerArm','leftHand'),'shoulderSpan':length('leftUpperArm','rightUpperArm'),'ankleSpacing':length('leftFoot','rightFoot')},'meshes':meshes,'expressions':j['extensions']['VRM']['blendShapeMaster']['blendShapeGroups'],'skinTriangles':len(skin),'centralTorsoRays':rays}
report={'male':gltf_audit(SOURCE),'female':gltf_audit(ROOT/'prototype/public/assets/foundation/base-female.vrm')}
assert report['female']['sha256']=='1995f174f6c8f2211f3c56c9e5fe4f9daf27ee5e648f129479582a259238149b','Female comparison source changed'
sys.path.insert(0,str(ROOT/'experiments/tools/vrm-addon'));bpy.ops.preferences.addon_enable(module='VRM_Addon_for_Blender-release')
for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
assert bpy.ops.import_scene.vrm(filepath=str(SOURCE),enable_mtoon_outline_preview=False)=={'FINISHED'}
report['blender']={'version':bpy.app.version_string,'meshes':[{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'uvLayers':[u.name for u in o.data.uv_layers],'shapeKeys':[k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else [],'vertexGroups':len(o.vertex_groups),'materials':[m.name for m in o.data.materials]} for o in bpy.context.scene.objects if o.type=='MESH']}
face=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('Face'))
keys=face.data.shape_keys.key_blocks;basis=keys[0]
report['blender']['expressionDeltaChecks']={}
for suffix in ['EYE_Close','EYE_Close_L','EYE_Close_R','MTH_A','MTH_I','MTH_U','MTH_E','MTH_O']:
 key=next(k for k in keys if k.name.endswith('_'+suffix));delta=[(a.co-b.co).length for a,b in zip(key.data,basis.data)]
 report['blender']['expressionDeltaChecks'][suffix]={'key':key.name,'changedVertices':sum(d>1e-7 for d in delta),'maxDeltaMeters':max(delta)}
bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'base-male-candidate-editable.blend'),compress=True)
(EVIDENCE/'audit.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('MALE_AUDIT',json.dumps({'measures':report['male']['measures'],'skinTriangles':report['male']['skinTriangles'],'rays':[len(r['distinctZ']) for r in report['male']['centralTorsoRays']],'expressions':len(report['male']['expressions']),'meshes':report['blender']['meshes']}))
# Rendering is an isolated preview scene, saved blend above retains source materials.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.world.color=(.3,.3,.3);scene.view_settings.view_transform='Standard'
for loc,power,size in [((3,-4,5),700,5),((-3,-1,3),500,4)]:
 bpy.ops.object.light_add(type='AREA',location=loc);bpy.context.object.data.energy=power;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=size;bpy.context.object.rotation_euler=(Vector((0,0,1))-bpy.context.object.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.1
def render(name,loc,target=(0,0,.9),scale=2.1):
 cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;scene.render.filepath=str(EVIDENCE/(name+'.png'));bpy.ops.render.render(write_still=True)
render('male-original-front',(0,-4,1))
render('male-face-neutral',(0,-4,1.65),(0,0,1.6),.65)
for label,suffix in [('blink','EYE_Close'),('aa','MTH_A')]:
 key=next(k for k in keys if k.name.endswith('_'+suffix));key.value=1
 render('male-face-'+label,(0,-4,1.65),(0,0,1.6),.65);key.value=0
# Body geometry-only diagnostic: delete non-skin polygons in preview copy,
# assign an opaque neutral unitard; retain original face for style comparison.
body=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('Body'))
skinSlots={i for i,m in enumerate(body.data.materials) if 'Body_00_SKIN' in m.name}
bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index not in skinSlots],context='FACES');bm.to_mesh(body.data);bm.free()
mat=bpy.data.materials.new('Diagnostic opaque unitard');mat.diffuse_color=(.065,.085,.12,1);mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.065,.085,.12,1)
body.data.materials.clear();body.data.materials.append(mat)
for p in body.data.polygons:p.material_index=0
render('male-surface-front',(0,-4,1));render('male-surface-back',(0,4,1))
manifest={'status':'candidate selection only; no runtime integration or animation acceptance','blender':bpy.app.version_string,'sourceSHA256':report['male']['sha256'],'files':{}}
for p in [SOURCE,OUT/'base-male-candidate-editable.blend',pathlib.Path(__file__),OUT/'fetch-candidate.py',*sorted(OUT.glob('*.md')),*sorted(OUT.glob('*.json')),*sorted(OUT.glob('*.html')),EVIDENCE/'audit.json',*sorted(EVIDENCE.glob('*.png'))]:
 manifest['files'][p.relative_to(ROOT).as_posix()]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(EVIDENCE/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print('PREVIEW_COMPLETE')
