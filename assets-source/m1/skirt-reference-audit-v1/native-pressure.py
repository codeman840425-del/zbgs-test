"""One native FK pressure pose. No cloth fit, mesh/weight editing or addon execution."""
import bpy,math,json,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
O=Path(__file__).resolve().parent/'native-pressure-v1';O.mkdir(exist_ok=True)
rig=bpy.data.objects['BlenderChan Rig_rig'];sc=bpy.context.scene
original=Path(__file__).resolve().parent/'BlenderChan-Free.blend'
assert hashlib.sha256(original.read_bytes()).hexdigest()=='f2e6cf2ccc7799bb614a0b6ef982a2b9bbd446884c358796d5ba5eba5f2c22ad'
# Preserve original source; only this derived scene gets a new control action.
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks: track.mute=True
for b in rig.pose.bones: b.matrix_basis=Matrix.Identity(4)
for side in ['l','r']:
 for limb in ['foot','hand']:rig.pose.bones[f'c_{limb}_ik.{side}']['ik_fk_switch']=1.0
rig.update_tag();bpy.context.view_layer.update()
controls=['c_root_master.x']+[f'c_{part}.{side}'for side in ['l','r']for part in ['thigh_fk','leg_fk','foot_fk','arm_fk','forearm_fk','hand_fk']]
def setdir(name,direction):
 b=rig.pose.bones[name];rest=b.bone.matrix_local.copy();rot=(b.bone.tail_local-b.bone.head_local).normalized().rotation_difference(Vector(direction).normalized()).to_matrix()
 m=(rot@rest.to_3x3()).to_4x4();m.translation=b.matrix.translation.copy();b.matrix=m;bpy.context.view_layer.update()
def pose(t):
 # +Z up, character front is -Y (measured toes/face in source).
 for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
 bpy.context.view_layer.update()
 b=rig.pose.bones['c_root_master.x'];m=b.matrix.copy();m.translation.z-=.38*t;b.matrix=m;bpy.context.view_layer.update()
 for side,sign in [('l',1),('r',-1)]:
  thigh=rig.pose.bones['c_thigh_fk.'+side].bone
  rest=(thigh.tail_local-thigh.head_local).normalized();goal=Vector((sign*.012,-1,0)).normalized()
  setdir('c_thigh_fk.'+side,rest.lerp(goal,t))
  leg=rig.pose.bones['c_leg_fk.'+side].bone
  setdir('c_leg_fk.'+side,(leg.tail_local-leg.head_local).normalized().lerp(Vector((0,0,-1)),t))
  # Foot world rest orientation, no IK endpoint teleport or leg scaling.
  b=rig.pose.bones['c_foot_fk.'+side];m=b.bone.matrix_local.copy();m.translation=b.matrix.translation;b.matrix=m;bpy.context.view_layer.update()
  setdir('c_arm_fk.'+side,(sign*.35,-.02,-1))
  setdir('c_forearm_fk.'+side,(sign*.20,-.65*t,-1+.45*t))
  # Hands keep rest local rotation. No finger or palm contact was authored.
 for name in controls:
  b=rig.pose.bones[name];b.rotation_mode='QUATERNION'
  b.keyframe_insert('location',frame=1+60*t,group=name);b.keyframe_insert('rotation_quaternion',frame=1+60*t,group=name);b.keyframe_insert('scale',frame=1+60*t,group=name)
 bpy.context.view_layer.update()
for t in [0,.25,.5,.75,1]:pose(t)
rig.animation_data.action.name='Native_Standing_To_Seated_Pressure_v1'
for f in rig.animation_data.action.fcurves:
 for k in f.keyframe_points:k.interpolation='LINEAR'
sc.frame_start=1;sc.frame_end=61;sc.render.fps=30
# Keep source character objects/materials; remove only rig widgets/staging helpers from render.
for o in bpy.data.objects:
 if o.name.startswith('cs_') or o.name in ['Camera_Parent','FreeLights_Parent','Solid_Base']:o.hide_render=True
# Plain spatial reference chair, not a garment collision or acceptance adjustment.
def mat(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);return m
seatmat=mat('Pressure seat reference',(.26,.29,.34))
def box(name,location,scale):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(seatmat);return o
seat=box('ReferenceSeat',(0,.025,.405),(.48,.43,.04));back=box('ReferenceBack',(0,.235,.70),(.48,.04,.60))
box('ReferenceFloor',(0,0,-.08),(200,200,.08))
sc.render.engine='BLENDER_EEVEE_NEXT'
sc.eevee.taa_render_samples=16
sc.render.resolution_x=640;sc.render.resolution_y=800;sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
sc.world=bpy.data.worlds.new('Pressure Studio');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.68,.72,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for o in list(bpy.data.objects):
 if o.type=='LIGHT':o.hide_render=True
for location,power,size in [((2,-3,4),600,4),((-3,-1,2),350,3),((0,3,3),450,3)]:
 bpy.ops.object.light_add(type='AREA',location=location);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='PressureCamera';cam.data.type='ORTHO';cam.data.ortho_scale=1.95;sc.camera=cam
sc.view_settings.view_transform='Standard'


def geo(o):
 dg=bpy.context.evaluated_depsgraph_get();ev=o.evaluated_get(dg);mesh=ev.to_mesh();mesh.calc_loop_triangles();v=[ev.matrix_world@x.co for x in mesh.vertices];f=[tuple(x.vertices)for x in mesh.loop_triangles];edges=[tuple(x.vertices)for x in mesh.edges];ev.to_mesh_clear();return v,f,edges
rows=[];reference=None
for frame in [1,16,31,46,61]:
 sc.frame_set(frame);bpy.context.view_layer.update();v,f,edges=geo(bpy.data.objects['Skirt']);a=np.array(v);length=np.array([(v[i]-v[j]).length for i,j in edges]);
 if reference is None:reference=length.copy()
 ratios=length/np.maximum(reference,1e-12);tree=BVHTree.FromPolygons(v,f,all_triangles=True)
 intersections={}
 for name in ['Body Bottom','Body Top','Leotard Reddit-Safe','Boots_ThighHighs','ReferenceSeat','ReferenceBack']:
  ob=bpy.data.objects.get(name)
  if ob:
   vv,ff,_=geo(ob);pairs=tree.overlap(BVHTree.FromPolygons(vv,ff,all_triangles=True));intersections[name]={'pairCount':len(pairs),'pairs':pairs}
 joints={n:{'head':list(rig.matrix_world@rig.pose.bones[n].head),'tail':list(rig.matrix_world@rig.pose.bones[n].tail)}for n in ['thigh.l','leg.l','foot.l','thigh.r','leg.r','foot.r']}
 rows.append({'frame':frame,'t':(frame-1)/30,'vertices':len(v),'triangles':len(f),'edgeRatioMax':float(ratios.max()),'edgeRatioP95':float(np.quantile(ratios,.95)),'edgeRatioMin':float(ratios.min()),'maxEdge':list(edges[int(ratios.argmax())]),'intersections':intersections,'joints':joints,'bbox':[a.min(axis=0).tolist(),a.max(axis=0).tolist()]})
 if frame in [1,61]:
  for label,location in [('front',(0,-4,1.0)),('side',(4,0,1.0))]:
   cam.location=location;cam.rotation_euler=(Vector((0,-.04,.85))-cam.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str(O/f'{frame:02}-{label}.png');bpy.ops.render.render(write_still=True)
report={'schema':'native-source-skirt-pressure.1','sourceSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'method':'One authored FK pose interpolation; original mesh/weights/modifier stack retained. No fitting or parameter sweep.','front':'-Y','up':'+Z','hipDropM':.38,'poseSeconds':2,'notes':['Triangle surface overlap pairs, not penetration depths; original baseline is recorded too.','Reference chair is spatial context only, no physics.','No seated corrective added. No target VRM compatibility.','Same-index evaluated-edge ratio to standing, not material strain proof.'],'frames':rows,'images':[{'name':im.name,'packed':bool(im.packed_file),'path':im.filepath}for im in bpy.data.images]}
(O/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
sc.frame_set(61);bpy.ops.wm.save_as_mainfile(filepath=str(O/'BlenderChan-Native-Pressure-v1.blend'))
print(json.dumps({'frames':[{'frame':r['frame'],'edgeMax':r['edgeRatioMax'],'pairs':{k:v['pairCount']for k,v in r['intersections'].items()}}for r in rows]},indent=2))
