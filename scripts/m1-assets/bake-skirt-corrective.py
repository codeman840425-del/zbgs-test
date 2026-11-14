"""Blender-only isolated cloth authoring trial. Never writes prototype/.
Run via run-skirt-corrective-bake.py after an exclusive capture window.
Configuration is provisional; first trial is bounded by the launcher timeout.
"""
import bpy, hashlib, json, pathlib, sys, time
import numpy as np
from mathutils import Matrix

ROOT=pathlib.Path(__file__).resolve().parents[2]
EXP=ROOT/'experiments/skirt-offline-corrective'
cfg=json.loads((ROOT/'assets-source/m1/offline-corrective/config.json').read_text(encoding='utf8'))
capturePath=pathlib.Path(sys.argv[sys.argv.index('--')+1]).resolve()
capture=json.loads((capturePath/'capture.json').read_text(encoding='utf8'))
topology=json.loads((EXP/'source-topology.json').read_text(encoding='utf8'))
assert topology['sha256']==cfg['sourceSha256']
assert capture['identity']['primary']['actualSha256']==cfg['bodySha256']
assert all(f['bodyVisible'] and f['outfit']==1 for f in capture['frames'])
OUT=pathlib.Path(sys.argv[sys.argv.index('--')+2]).resolve()
assert OUT.is_relative_to(capturePath),'All trial output must stay within its isolated capture'
OUT.mkdir(exist_ok=True)
assert not (OUT/'targets.json').exists(),'Refuse existing output'
for filename in ['source.f32','colliders.f32']:
    assert hashlib.sha256((capturePath/filename).read_bytes()).hexdigest()==capture[filename]['sha256']
source=np.fromfile(capturePath/'source.f32',dtype='<f4').reshape(len(capture['frames']),-1,3)
colliders=np.fromfile(capturePath/'colliders.f32',dtype='<f4').reshape(len(capture['frames']),-1,3)
def blender(points):return np.asarray(points)[...,[0,2,1]]*np.array([1,-1,1])
def three(points):return np.asarray(points)[...,[0,2,1]]*np.array([1,1,-1])
mapping=np.array(topology['renderToWeld']);count=len(topology['position'])
welded=np.zeros((len(source),count,3),dtype=np.float64);counts=np.bincount(mapping)
for f in range(len(source)):
    np.add.at(welded[f],mapping,source[f]);welded[f]/=counts[:,None]
seamError=float(np.max(np.linalg.norm(source-welded[:,mapping],axis=-1)))
assert seamError<.001,f'Original render seams deform differently by {seamError}m'
started=time.monotonic();bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.fps=capture['fps'];scene.frame_start=1;scene.frame_end=len(source);scene.gravity=(0,0,-9.81)

def make_mesh(name,points,triangles):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(blender(points).tolist(),[],triangles);mesh.update()
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);return obj
def linear_keys(obj,poses):
    """Native upstream shape-key animation: cloth pins/body collision follow input."""
    obj.shape_key_add(name='Basis')
    for index,points in enumerate(poses):
        key=obj.shape_key_add(name=f'Input_{index+1:03d}')
        key.data.foreach_set('co',blender(points).astype(np.float32).ravel())
        for frame,value in [(index,0),(index+1,1),(index+2,0)]:
            key.value=value;key.keyframe_insert('value',frame=frame)
    anim=obj.data.shape_keys.animation_data;action=anim.action
    curves=[]
    if hasattr(action,'layers'):
        for layer in action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(anim.action_slot) if hasattr(strip,'channelbag') else None
                if bag:curves.extend(bag.fcurves)
    elif hasattr(action,'fcurves'):curves.extend(action.fcurves)
    assert curves,'Shape animation curves not accessible; do not silently use unverified interpolation'
    for curve in curves:
        for key in curve.keyframe_points:key.interpolation='LINEAR'
    return obj

# Exact source material/UV is retained. Imported rig is only a material source,
# not a new body and not an animation replacement.
bpy.ops.import_scene.gltf(filepath=str(ROOT/cfg['source']))
original=next(o for o in scene.objects if o.type=='MESH')
materials=list(original.data.materials)
for obj in list(scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
skirt=make_mesh('Offline_SameSourceSkirt',welded[0],topology['triangles'])
for m in materials:skirt.data.materials.append(m)
uv=skirt.data.uv_layers.new(name='OriginalUV');coords=np.asarray(topology['uv'])[np.asarray(topology['renderTriangles']).ravel()]
uv.data.foreach_set('uv',coords.astype(np.float32).ravel())
for polygon in skirt.data.polygons:polygon.use_smooth=True
linear_keys(skirt,welded)
pin=skirt.vertex_groups.new(name='Waist_Pins');low,high=cfg['pinBandHipY']
for index,p in enumerate(topology['hipLocalPosition']):
    weight=float(np.clip((p[1]-low)/(high-low),0,1));weight=weight*weight*(3-2*weight)
    if weight>0:pin.add([index],weight,'REPLACE')
cloth=skirt.modifiers.new('NativeCloth_AngularBend','CLOTH')
for key,value in cfg['cloth'].items():setattr(cloth.settings,key,value)
cloth.settings.vertex_group_mass=pin.name
for key,value in cfg['collision'].items():setattr(cloth.collision_settings,key,value)
cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=len(source)

offset=0
for info in capture['topology']['colliders']:
    n=info['vertexCount'];points=colliders[:,offset:offset+n];offset+=n
    obj=make_mesh('Collider_'+info['name'],points[0],np.array(info['triangles']).reshape(-1,3).tolist())
    linear_keys(obj,points);obj.modifiers.new('ActualBodyCollision','COLLISION');obj.collision.thickness_outer=.002
    obj.display_type='WIRE';obj.hide_render=True # Authoring collider, not game visibility.
for index,box in enumerate(capture['topology']['chair']):
    lo,hi=box['min'],box['max'];corners=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])
    matrix=np.array(box['matrixWorld']).reshape(4,4).T;points=(corners@matrix.T)[:,:3]
    # Explicit outward winding for the captured OBB; all six actual chair faces.
    faces=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]
    obj=make_mesh(f'ActualChair_{index}',points,faces);obj.modifiers.new('ActualChairCollision','COLLISION');obj.collision.thickness_outer=.002

bpy.context.view_layer.objects.active=skirt;skirt.select_set(True)
results=[];progress=[]
edges=list({tuple(sorted((a,b)))for t in topology['triangles']for a,b in zip(t,t[1:]+t[:1])})
edge=np.array(edges);rest=np.linalg.norm(welded[0,edge[:,1]]-welded[0,edge[:,0]],axis=1)
for frame,meta in enumerate(capture['frames'],1):
    scene.frame_set(frame);deps=bpy.context.evaluated_depsgraph_get();evaluated=skirt.evaluated_get(deps);mesh=evaluated.to_mesh()
    points=np.empty((len(mesh.vertices),3),dtype=np.float32);mesh.vertices.foreach_get('co',points.ravel());evaluated.to_mesh_clear()
    assert len(points)==count and np.isfinite(points).all()
    points=three(points);inverse=np.linalg.inv(np.array(meta['hipWorld']).reshape(4,4).T)
    local=(np.column_stack([points,np.ones(count)])@inverse.T)[:,:3]
    stretch=float(np.max(np.linalg.norm(points[edge[:,1]]-points[edge[:,0]],axis=1)/np.maximum(rest,1e-8)))
    results.append({'frame':frame,'sitProgress':meta['sitProgress'],'mode':meta['mode'],'positionsHipLocal':local.tolist()})
    progress.append({'frame':frame,'seconds':time.monotonic()-started,'maxEdgeRatio':stretch})
    if frame%15==0:
        (OUT/'progress.json').write_text(json.dumps(progress),encoding='utf8');print('CLOTH_TRIAL',frame,progress[-1],flush=True)
    if stretch>=8:
        lengths=np.linalg.norm(points[edge[:,1]]-points[edge[:,0]],axis=1);worst=int(np.argmax(lengths/np.maximum(rest,1e-8)))
        failure={'status':'rejected-material-stretch-not-visually-reviewed','frame':frame,'sitProgress':meta['sitProgress'],'edge':edge[worst].tolist(),'restLength':float(rest[worst]),'actualLength':float(lengths[worst]),'ratio':stretch,'positionsHipLocal':local.tolist(),'progress':progress}
        (OUT/'rejected-shape.json').write_text(json.dumps(failure),encoding='utf8')
        raise RuntimeError('Material stretch gate rejected; actual vertices retained, no visual quality claim')

result={'schema':'m1.skirt-offline-bake.1','status':'baked-unreviewed-no-runtime-acceptance','config':cfg,'captureBuild':capture['identity']['runtimeBuild']['sourceDigest'],'sourceSeamError':seamError,'blender':bpy.app.version_string,'renderToWeld':mapping.tolist(),'frames':results,'progress':progress,'limitations':['Only captured stand/sit/rise poses. No walk/run/dance acceptance.','Offline native cloth output, not a universal realtime cloth solver.','Original controller hand constraints still used reference skirt during capture; candidate hand contact must be retested.']}
(OUT/'targets.json').write_text(json.dumps(result,separators=(',',':')),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'native-cloth-authoring.blend'),compress=True)
print(json.dumps({'out':str(OUT),'frames':len(results),'seconds':time.monotonic()-started,'maxEdgeRatio':max(p['maxEdgeRatio']for p in progress)}))
