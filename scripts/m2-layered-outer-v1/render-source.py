"""Fixed failure specimen views; original body/clothes retained. Not game QA."""
from pathlib import Path
import bpy,json,math
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-layered-outer-v1';OUT=ROOT/'evidence/m2-layered-outer-v1/views';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
for path in [ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm',BASE/'generated/author-export.glb']:
 bpy.ops.import_scene.gltf(filepath=str(path))
for o in bpy.context.scene.objects:
 if o.type=='MESH' and o.name.startswith('Icosphere'):o.hide_render=True
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16
scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('SourcePreviewWorld');scene.world.color=(.25,.25,.25)
scene.view_settings.view_transform='Standard'
for location,energy,size in [((2,3,3),350,3),((-2,1,2),180,3),((0,-3,3),250,3)]:
 light=bpy.data.lights.new('SourcePreviewArea','AREA');light.energy=energy;light.shape='DISK';light.size=size;o=bpy.data.objects.new('SourcePreviewArea',light);scene.collection.objects.link(o);o.location=location;o.rotation_euler=(Vector((0,0,1.3))-o.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.cameras.new('SourcePreviewCamera');o=bpy.data.objects.new('SourcePreviewCamera',camera);scene.collection.objects.link(o);scene.camera=o;camera.type='ORTHO';camera.ortho_scale=.6
views=[]
for name,location in [('front',(0,3,1.32)),('side',(3,0,1.32)),('back',(0,-3,1.32))]:
 o.location=location;o.rotation_euler=(Vector((0,0,1.32))-o.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
 views.append({'name':name,'cameraPosition':list(location),'target':[0,0,1.32],'orthoScale':.6})
(OUT/'views.json').write_text(json.dumps({'views':views,'scope':'Original rest T pose, original body/top/trousers plus rejected vest; original materials imported as standard glTF, not game MToon/room or motion acceptance','bodyHidden':False,'geometryModifiedForPreview':False},indent=2)+'\n',encoding='utf-8')
