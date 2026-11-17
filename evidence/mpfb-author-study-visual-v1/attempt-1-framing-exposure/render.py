"""Read-only source snapshot and same-camera head views, Cycles CPU only."""
import hashlib
import json
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
SOURCE=ROOT/'assets-source/mpfb-author-study-v1/generated/mpfb-original-sample-02.blend'
READBACK=ROOT/'assets-source/mpfb-author-study-v1/generated/create-readback.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def coordinates(mesh):
    points=np.empty(len(mesh.vertices)*3,dtype=np.float32)
    mesh.vertices.foreach_get('co',points)
    return points.reshape(-1,3)


def point_at(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def light(name,location,power,size,target):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(obj)
    obj.location=location;point_at(obj,target)


def main():
    if (OUT/'render-readback.json').exists():
        raise FileExistsError('Refusing to overwrite fixed visual evidence')
    expected=json.loads(READBACK.read_bytes())
    source_sha=sha(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    assert bpy.app.version[:2]==(4,5)
    source_objects={o.name:o for o in bpy.data.objects if o.type=='MESH'}
    assert set(source_objects)=={c['name'] for c in expected['components']}
    assert not any(o.type=='ARMATURE' for o in bpy.data.objects)
    copies=[];rows=[]
    deps=bpy.context.evaluated_depsgraph_get()
    for record in expected['components']:
        obj=source_objects[record['name']]
        keys=[{'name':k.name,'value':k.value} for k in obj.data.shape_keys.key_blocks]
        assert keys==record['shapeKeys']
        assert len(obj.material_slots)==0
        evaluated=obj.evaluated_get(deps)
        mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=deps)
        P=coordinates(mesh)
        assert len(mesh.vertices)==record['vertices'] and len(mesh.polygons)==record['faces']
        sample=bpy.data.objects.new('RenderCopy-'+obj.name,mesh)
        bpy.context.scene.collection.objects.link(sample)
        sample.location=(0,0,0)
        for poly in mesh.polygons:poly.use_smooth=True
        obj.hide_render=True;sample.hide_render=True
        copies.append(sample)
        rows.append({'originalObject':obj.name,'role':obj.get('author_study_role'),
            'sourceWorldLocationM':list(obj.location),'renderCopyLocationM':list(sample.location),
            'shapeKeys':keys,'sourceMaterialSlots':len(obj.material_slots),
            'evaluatedVertices':len(mesh.vertices),'evaluatedFaces':len(mesh.polygons),
            'evaluatedPositionSHA256':hashlib.sha256(P.tobytes()).hexdigest(),
            'boundsLocalM':[P.min(0).tolist(),P.max(0).tolist()]})
    for obj in source_objects.values():obj.hide_render=True
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16
    scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.render.film_transparent=False
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
    scene.world=bpy.data.worlds.new('Neutral technical world')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.3,.3,.3,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.3
    material=bpy.data.materials.new('TECHNICAL-Neutral-gray-not-authored-material')
    material.diffuse_color=(.42,.42,.42,1);material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(.42,.42,.42,1)
    shader.inputs['Roughness'].default_value=.75
    for obj in copies:
        obj.data.materials.clear();obj.data.materials.append(material)
    # Original MPFB uses Z-up and front toward negative Y.
    # Identical object-local framing for both source objects.
    target=(0,-.015,1.535)
    light('Technical key',(-.6,-1.0,2.3),70,.8,target)
    light('Technical fill',(.8,-.4,1.7),35,.8,target)
    light('Technical rim',(.2,.6,2.0),45,.6,target)
    data=bpy.data.cameras.new('Technical orthographic camera')
    camera=bpy.data.objects.new('Technical orthographic camera',data)
    scene.collection.objects.link(camera);scene.camera=camera
    data.type='ORTHO';data.ortho_scale=.285;data.clip_start=.01;data.clip_end=10
    cameras={'front':(0,-1.2,1.535),'side':(1.2,-.015,1.535)}
    images=[]
    for obj,row in zip(copies,rows):
        obj.hide_render=False
        for view,location in cameras.items():
            camera.location=location;point_at(camera,target)
            filename=('reference' if row['role']=='reference' else 'original-nose-targets')+'-'+view+'.png'
            scene.render.filepath=str(OUT/filename)
            bpy.ops.render.render(write_still=True)
            images.append({'originalObject':row['originalObject'],'role':row['role'],'view':view,
                'file':filename,'sha256':sha(OUT/filename),'cameraLocationM':list(camera.location),
                'cameraTargetM':list(target),'orthoScaleM':data.ortho_scale,
                'resolution':[800,800]})
        obj.hide_render=True
    # Store only the independent display project, never the input .blend.
    copies[0].hide_render=False
    camera.location=cameras['front'];point_at(camera,target)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'independent-render-copy.blend'))
    assert sha(SOURCE)==source_sha
    result={'schema':'mpfb-original-author-head-visual-readback-v1','status':'head-views-rendered-review-pending',
        'source':{'path':SOURCE.relative_to(ROOT).as_posix(),'sha256':source_sha,'bytes':SOURCE.stat().st_size},
        'createReadback':{'path':READBACK.relative_to(ROOT).as_posix(),'sha256':sha(READBACK)},
        'blenderVersion':bpy.app.version_string,'buildHash':bpy.app.build_hash.decode(),
        'renderDevice':scene.cycles.device,'threads':scene.render.threads,'samples':scene.cycles.samples,
        'technicalMaterial':{'baseColor':[.42,.42,.42,1],'roughness':.75,'sourceMaterialsAdded':False,
            'presentationMeshSmoothShading':True,'geometryDeformationAdded':False},
        'objects':rows,'images':images,'sourceUnchanged':True,
        'limits':['Technical gray surface only; original sample has no authored materials or rig.',
            'Head crop only, no animation or current-VRM compatibility conclusion.']}
    (OUT/'render-readback.json').write_bytes((json.dumps(result,indent=2)+'\n').encode())


if __name__=='__main__':main()
