"""Packed editable source + original/candidate material head views. Blender 4.5."""
import bpy, pathlib, json, struct, math
from mathutils import Matrix, Vector, Quaternion
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/m2-male-hairstyle-v1'
report=json.loads((OUT/'build-report.json').read_text(encoding='utf-8'))
src=ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm'
raw=src.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
# Disposable preview uses the complete original body/face, excluding only HAIR primitive.
doc['meshes'][0]['primitives'].pop(5)
jb=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();jb+=b' '*((-len(jb))%4)
temp=OUT/'preview-body.glb';temp.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(temp))
nodes=doc['nodes'];parents={c:i for i,v in enumerate(nodes)for c in v.get('children',[])}
def world(i):
 v=nodes[i];q=v.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(v.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(v.get('scale',[1,1,1])))
 return world(parents[i])@m if i in parents else m
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
head=next(i for i,v in enumerate(nodes)if v.get('name')=='J_Bip_C_Head');H=C@world(head)@C.inverted()
hairsets={}
for tag,file in [('original','original-head-local.glb'),('candidate','male-sidepart-v1.glb')]:
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/file));new=list(set(bpy.data.objects)-before)
 for o in new:
  if o.type=='MESH':o.matrix_world=H@o.matrix_world;o.name='Hair_'+tag
 hairsets[tag]=new
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('StudioWorld');scene.world.color=(.7,.7,.7);scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.78,.84,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
bpy.ops.object.light_add(type='AREA',location=(0,-2,3));bpy.context.object.data.energy=120;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=3
target=Vector((0,0,1.615))
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=.46;camera.data.lens=70
views={'front':(0,1.2,1.615),'side':(1.2,0,1.615),'back':(0,-1.2,1.615)}
(OUT/'views').mkdir(exist_ok=True)
for tag in hairsets:
 for k,objs in hairsets.items():
  for o in objs:o.hide_render=k!=tag;o.hide_set(k!=tag)
 for name,pos in views.items():
  camera.location=pos;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'views'/f'{tag}-{name}.png');bpy.ops.render.render(write_still=True)
for o in hairsets['original']:o.hide_render=True;o.hide_set(True)
camera.location=views['front'];camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'editable.blend'),compress=True)
temp.unlink()
(OUT/'preview-report.json').write_text(json.dumps({'blender':bpy.app.version_string,'originalBodyFacePreserved':True,'previewOnlyRemovedPrimitive':5,'material':'Source glTF baseColor/normal/emissive/unlit retained; Blender glTF renderer, not game GPU equivalence.','headWorldBlender':[list(row)for row in H],'views':views},indent=2),encoding='utf-8')
