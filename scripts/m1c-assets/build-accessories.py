"""Original bounded accessories. Blender4.5.9 --background --factory-startup --python FILE.
No avatar/animation/runtime changes. Source units and glTF socket convention are explicit.
"""
import bpy, json, math, pathlib, hashlib, argparse, sys, struct
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
args=argparse.ArgumentParser();args.add_argument('--output');args.add_argument('--no-preview',action='store_true');args=args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
SRC=ROOT/'assets-source/m1c-accessories';OUT=pathlib.Path(args.output).resolve() if args.output else ROOT/'prototype/public/assets/m1c'
PARAM=json.loads((SRC/'parameters.json').read_text(encoding='utf8'))
OUT.mkdir(parents=True,exist_ok=True)
PREVIEW=ROOT/'evidence/m1c-accessories';PREVIEW.mkdir(parents=True,exist_ok=True)
assert bpy.app.version_string.startswith('4.5.9')
bpy.context.preferences.filepaths.save_version=0
def xyz(p):return (p[0],-p[2],p[1])
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=.6;return m
def mat(o,m):o.data.materials.append(m)
def cylinder(name,r,bottom,top,m,segments=24):
 bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=r,depth=top-bottom,location=xyz((0,(bottom+top)/2,0)));o=bpy.context.object;o.name=name;mat(o,m);return o
def line(name,points,m,r,cyclic=False):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=1;curve.bevel_depth=r;curve.bevel_resolution=2
 s=curve.splines.new('POLY');s.points.add(len(points)-1)
 for p,co in zip(s.points,points):p.co=(*xyz(co),1)
 s.use_cyclic_u=cyclic;o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);mat(o,m);return o
def empty(name,p,extras):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=xyz(p)
 for k,v in extras.items():o[k]=v
 return o
def canonicalize_opaque_triangles(path):
 # Blender sphere export may permute triangles between processes. Keep every
 # oriented triangle and all vertex attributes, changing only opaque draw order.
 data=bytearray(path.read_bytes());length=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+length]);base=28+length
 for mesh in g['meshes']:
  for primitive in mesh['primitives']:
   assert primitive.get('mode',4)==4 and g['materials'][primitive['material']].get('alphaMode','OPAQUE')=='OPAQUE'
   a=g['accessors'][primitive['indices']];v=g['bufferViews'][a['bufferView']];assert not v.get('byteStride') and a['count']%3==0
   fmt={5121:'B',5123:'H',5125:'I'}[a['componentType']];offset=base+v.get('byteOffset',0)+a.get('byteOffset',0)
   indices=struct.unpack_from('<'+fmt*a['count'],data,offset);triangles=[]
   for i in range(0,len(indices),3):
    t=indices[i:i+3];triangles.append(min(t,t[1:]+t[:1],t[2:]+t[:2]))
   canonical=[n for t in sorted(triangles) for n in t]
   struct.pack_into('<'+fmt*len(canonical),data,offset,*canonical)
 path.write_bytes(data)
def create(kind):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 p=PARAM[kind];mats={n:material(n,c) for n,c in p['materialColors'].items()}
 if kind=='microphone':
  cylinder('Handle',p['handleRadius'],p['handleBottomY'],p['handleTopY'],mats['handle'],p['radialSegments'])
  cylinder('Collar',.017,.078,.09,mats['accent'])
  cylinder('BaseCap',.0135,-.078,-.072,mats['accent'])
  bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=xyz((0,p['grilleCenterY'],0)));o=bpy.context.object;o.name='Grille';o.scale=(p['grilleRadii'][0],p['grilleRadii'][2],p['grilleRadii'][1]);mat(o,mats['grille'])
  for k in range(5):
   y=.091+k*.010;r=.026*math.sqrt(max(0,1-((y-.113)/.035)**2))+.00035
   line('GrilleBand'+str(k),[(r*math.cos(t*math.tau/48),y,r*math.sin(t*math.tau/48)) for t in range(48)],mats['handle'],.00055,True)
 else:
  w,h,sep,r=p['lensWidth'],p['lensHeight'],p['lensCenterSeparation'],p['frameRadius']
  for side in [-1,1]:
   # Superellipse frame preserves an editable continuous contour.
   pts=[]
   for k in range(64):
    t=k*math.tau/64;c,s=math.cos(t),math.sin(t)
    pts.append((side*sep/2+w/2*math.copysign(abs(c)**.65,c),h/2*math.copysign(abs(s)**.65,s),0))
   line(('Left' if side<0 else 'Right')+'Frame',pts,mats['frame'],r,True)
   x=side*(sep+w)/2
   line('Temple'+str(side),[(x,0,0),(x+side*.003,0,-.025),(x+side*.001,-.001,-p['templeDepth']),(x-side*.004,-.012,-p['templeDepth']-.012)],mats['frame'],r)
   line('Hinge'+str(side),[(x,0,0),(x+side*.003,0,-.012)],mats['accent'],r*1.25)
  line('Bridge',[(-.005,0,0),(0,.004,0),(.005,0,0)],mats['frame'],r)
 for name,socket in p['sockets'].items():empty('socket_'+name,socket['position'],{'semantic':name,'units':'meters'})
 for o in bpy.context.scene.objects:
  if o.type=='MESH':
   for poly in o.data.polygons:poly.use_smooth=True
 # Editable .blend contains curves and real socket empties, not a flattened render.
 if not args.output:bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(p['id']+'.blend')))
 # Convert only the export copy of curves, preserving source above.
 bpy.ops.object.select_all(action='DESELECT')
 for o in bpy.context.scene.objects:
  if o.type=='CURVE':o.select_set(True);bpy.context.view_layer.objects.active=o
 if bpy.context.selected_objects:bpy.ops.object.convert(target='MESH')
 bpy.ops.export_scene.gltf(filepath=str(OUT/(p['id']+'.glb')),export_format='GLB',export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
 canonicalize_opaque_triangles(OUT/(p['id']+'.glb'))
 objects=list(bpy.context.scene.objects)
 verts=sum(len(o.data.vertices) for o in objects if o.type=='MESH');tris=sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in objects if o.type=='MESH')
 # Simple transparent preview is evidence of generated geometry, not avatar fit.
 bpy.ops.object.camera_add(location=(.32,-.48,.24) if kind=='microphone' else (.20,-.35,.17));cam=bpy.context.object;target=Vector((0,0,.035)) if kind=='microphone' else Vector((0,.025,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.29 if kind=='microphone' else .19;bpy.context.scene.camera=cam
 sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='STUDIO';sc.display.shading.color_type='MATERIAL';sc.display.shading.show_shadows=True;sc.display.shading.show_cavity=True;sc.render.resolution_x=640;sc.render.resolution_y=640;sc.render.resolution_percentage=100;sc.render.film_transparent=True;sc.render.image_settings.file_format='PNG';sc.render.filepath=str(PREVIEW/(p['id']+'.png'))
 if not args.no_preview:bpy.ops.render.render(write_still=True)
 path=OUT/(p['id']+'.glb');return {'id':p['id'],'url':'/assets/m1c/'+path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'vertices':verts,'triangles':tris,'sourceBlend':str((SRC/(p['id']+'.blend')).relative_to(ROOT)).replace('\\','/'),'sockets':p['sockets'],'bodyFit':p['bodyFit']}
items=[create(kind) for kind in ['microphone','glasses']]
report={'schema':'zbgs-accessory-candidate-v1','blender':bpy.app.version_string,'units':'meters','license':'CC0-1.0','parameterSha256':hashlib.sha256((SRC/'parameters.json').read_bytes()).hexdigest(),'items':items,'limits':['Generated resources only; no runtime attachment or holding animation approval','Per-body mount transforms intentionally null until fitted against actual male/female bones','Glasses have opaque frames and no transparent lenses']}
for dest in ([OUT/'accessories.json'] if args.output else [SRC/'build-report.json',OUT/'accessories.json']):dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('ACCESSORIES_EXPORTED',json.dumps(items))
