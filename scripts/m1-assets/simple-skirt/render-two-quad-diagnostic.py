"""Render saved output in captured room coordinates. No cloth or animation evaluation."""
from pathlib import Path
import ast,gzip,hashlib,json,struct
import numpy as np
import bpy
from mathutils import Vector
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';A=S/'two-quad-thirds-v1';O=A/'native-author-trial-v1/views';O.mkdir(exist_ok=True)
helper=R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py';tree=ast.parse(helper.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='load'],type_ignores=[]),str(helper),'exec'),globals())
raw,d,read=load(A/'m1-sixfold-skirt-two-quad-thirds-v1.glb');ps=d['meshes'][0]['primitives'];counts=[len(read(p['attributes']['POSITION']))for p in ps];rf=np.concatenate([read(p['indices']).reshape(-1,3)+sum(counts[:i])for i,p in enumerate(ps)]);prep=json.loads((A/'native-author-trial-v1/preparation.json').read_text());mapping=np.array(prep['renderToSim']);faces=mapping[rf];cap=json.loads(gzip.decompress((S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()))
def conv(p):return np.asarray(p)[...,[0,2,1]]*np.array([1,-1,1])
def material(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=.8;return m
def mesh(name,p,f,mat):
    data=bpy.data.meshes.new(name);data.from_pydata(conv(p).tolist(),[],np.asarray(f).tolist());data.update();obj=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(obj);data.materials.append(mat)
    for poly in data.polygons:poly.use_smooth=True
    return obj
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=800;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False;scene.world=bpy.data.worlds.new('DiagnosticWorld');scene.world.color=(.7,.7,.7);scene.view_settings.view_transform='Standard';scene.view_settings.exposure=-2
skin=material('Diagnostic_skin_all_recorded_body_faces',(.66,.43,.32));top=material('Diagnostic_open_top_all_faces',(.78,.80,.85));cloth=material('Diagnostic_actual_skirt_all_faces',(.045,.12,.26));chair=material('Recorded_chair_boxes',(.25,.30,.37));floorMat=material('Coordinate_ground',(.82,.85,.88))
cameraData=bpy.data.cameras.new('Fixed_diagnostic_camera');camera=bpy.data.objects.new('Fixed_diagnostic_camera',cameraData);scene.collection.objects.link(camera);scene.camera=camera;cameraData.type='ORTHO';cameraData.ortho_scale=1.95
target=np.array([2.65,.85,1.10]);ground=mesh('Ground_y0',[[.65,0,-.9],[4.65,0,-.9],[4.65,0,3.1],[.65,0,3.1]],[[0,1,2],[0,2,3]],floorMat)
for name,pos,energy,size in [('Key',[1.1,3.8,3.5],700,4),('Fill',[4.5,2.4,.1],400,3)]:
    ld=bpy.data.lights.new(name,'AREA');ld.energy=energy;ld.shape='DISK';ld.size=size;ob=bpy.data.objects.new(name,ld);scene.collection.objects.link(ob);ob.location=Vector(conv(pos));ob.rotation_euler=(Vector(conv(target))-ob.location).to_track_quat('-Z','Y').to_euler()
boxFaces=np.array([[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]])
cameraRows=[];outputs=[];dynamic=[]
for frameNumber in [1,7,18]:
    for obj in dynamic:bpy.data.objects.remove(obj,do_unlink=True)
    dynamic=[];fr=cap['frames'][frameNumber-1];saved=json.loads(gzip.decompress((A/'native-author-trial-v1'/('frame-%02d.json.gz'%frameNumber)).read_bytes()));dynamic.append(mesh('Actual_saved_cloth_frame',np.array(saved['positionsWorld']),faces,cloth))
    for m in fr['colliders']:dynamic.append(mesh(m['name'],np.array(m['positions']).reshape(-1,3),np.array(m['triangles']).reshape(-1,3),skin if m['name']=='Bodybaked'else top))
    for box in fr['chair']:
        lo=box['min'];hi=box['max'];p=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(box['matrixWorld']).reshape(4,4);ob=mesh(box['name'],p[:,:3],boxFaces,chair)
        for poly in ob.data.polygons:poly.use_smooth=False
        dynamic.append(ob)
    for view,location in [('front',target+np.array([0,.12,3.])),('side',target+np.array([3.,.12,0]))]:
        camera.location=Vector(conv(location));camera.rotation_euler=(Vector(conv(target))-camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update();out=O/('%02d-%s.png'%(frameNumber,view));scene.render.filepath=str(out);bpy.ops.render.render(write_still=True);cameraRows.append({'frame':frameNumber,'view':view,'worldThreeLocation':location.tolist(),'worldThreeTarget':target.tolist(),'blenderWorldMatrix':[list(row)for row in camera.matrix_world],'orthoScale':cameraData.ortho_scale});outputs.append({'path':out.name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'frame':frameNumber,'actionSeconds':saved['sourceActionSeconds'],'bodyPairs':saved['colliderPairs']['Bodybaked'],'topPairs':saved['colliderPairs']['m1-uniform-top_1'],'maxEdgeStretch':saved['maxEdgeStretch']})
(O/'render-report.json').write_text(json.dumps({'status':'offline-failed-shape-diagnostic-not-game-integration','sourceSha256':hashlib.sha256(raw).hexdigest(),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'cameras':cameraRows,'outputs':outputs,'limits':['Actual saved mesh coordinates and recorded body/top/chair are unmodified.','Constant camera per view across all frames, captured room coordinates preserved.','Solid diagnostic colors, no textures/hair/room furnishings beyond captured collision boxes; not a GPU material visibility gate or final art.','No physics evaluated; selected frames1,7,18, not a complete real-time video.','All recorded body/clothing faces shown; no failing triangles deleted or masked.']},indent=2)+'\n',encoding='utf-8')
