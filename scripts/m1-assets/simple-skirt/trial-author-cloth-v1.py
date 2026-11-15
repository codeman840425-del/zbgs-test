"""One native offline authoring attempt, 3 static +57 actual action samples.
No runtime solver, guide, free-vertex animation or threshold sweep.
The external runner kills this process after60 seconds, including preparation.
"""
from pathlib import Path
import ast,gzip,hashlib,json,struct,time
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';A=S/'active-gap-hem-v1';O=A/'native-author-trial-v1'
assert R.name=='m1-simple-skirt-worktree'and not(O/'result.json').exists()
O.mkdir(exist_ok=True);started=time.monotonic()
helper=R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py';parsed=ast.parse(helper.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in parsed.body if isinstance(n,ast.FunctionDef)and n.name=='load'],type_ignores=[]),str(helper),'exec'),globals())
asset=A/'m1-sixfold-skirt-active-gap-hem-v1.glb';raw,doc,read=load(asset);assert hashlib.sha256(raw).hexdigest()=='8e0887b54bf8849d789c4f91e85be0bd5a54c706d2e5343c0a4462639042f157'
inputPath=A/'continuous-input-v1/capture.json.gz';capture=json.loads(gzip.decompress(inputPath.read_bytes()));frames=capture['frames'];assert len(frames)==60 and capture['identity']['runtimeBuild']['shortId']=='58394ce674e4'
gate=json.loads((A/'geometry-gate.json').read_text(encoding='utf-8'));assert gate['candidateSha256']==hashlib.sha256(raw).hexdigest()
assert gate['rows'][0]['selfCount']==0 and all(c['count']==0 for c in gate['rows'][0]['contacts'])
assert all(c.get('activeDomain2mmPass',True)for c in gate['rows'][0]['contacts'])
primitives=doc['meshes'][0]['primitives'];counts=[len(read(p['attributes']['POSITION']))for p in primitives]
source=np.concatenate([read(p['attributes']['POSITION'])for p in primitives]);uv=np.concatenate([read(p['attributes']['TEXCOORD_0'])for p in primitives]);rf=np.concatenate([read(p['indices']).reshape(-1,3)+sum(counts[:i])for i,p in enumerate(primitives)])
js=np.concatenate([read(p['attributes']['JOINTS_0'])for p in primitives]);ws=np.concatenate([read(p['attributes']['WEIGHTS_0'])for p in primitives]);skin=doc['skins'][0];names=[doc['nodes'][i]['name']for i in skin['joints']];inverse=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);hipName=next(n for n in names if n.endswith('_Hips'))
mat=lambda x:np.array(x).reshape(4,4).T
lookup={};renderToSim=[];groups=[]
for i,p in enumerate(np.round(source,7)):
    key=tuple(p)
    if key not in lookup:lookup[key]=len(groups);groups.append([])
    g=lookup[key];groups[g].append(i);renderToSim.append(g)
renderToSim=np.array(renderToSim);faces=renderToSim[rf];assert all(len(set(f))==3 for f in faces)
representatives=np.array([g[0]for g in groups]);fixed=np.unique(faces[:260]);pin=np.zeros(len(groups),bool);pin[fixed]=True
posed=[];duplicateError=0
for frame in frames:
    world=np.array([mat(frame['bones'][name])for name in names])
    for c in frame['controls']:world[names.index(c['name'])]=mat(c['privateWorld'])
    palette=world@inverse;out=np.zeros((len(source),4));P=np.c_[source,np.ones(len(source))]
    for k in range(4):out+=np.einsum('nij,nj->ni',palette[js[:,k]],P)*ws[:,k,None]
    q=out[:,:3]
    for ids in groups:duplicateError=max(duplicateError,float(np.linalg.norm(q[ids]-q[ids[0]],axis=1).max()))
    posed.append(q[representatives])
assert duplicateError<.000002,'Source weld is not a common animated surface'
points=posed[0];edges=np.unique(np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1),axis=0);restLengths=np.linalg.norm(points[edges[:,0]]-points[edges[:,1]],axis=1)
area=lambda p:np.linalg.norm(np.cross(p[faces[:,1]]-p[faces[:,0]],p[faces[:,2]]-p[faces[:,0]]),axis=1)*.5
restArea=area(points);assert np.min(restArea)>1e-12
scale=10.;cfg={'frames':60,'fps':30,'threads':2,'authoringScale':scale,'quality':8,'collisionQuality':4,'clothDistanceAuthoring':.002,'colliderThicknessAuthoring':.001,'selfDistanceAuthoring':.005,'maxEdgeStretch':1.25,'staticAbsoluteDisplacementMetres':.1,'pinResidualMetres':.00002,'timeoutSeconds':60,'motionAbsoluteDisplacementGate':'reported, not certified as old stationary100mm pass','deformation':'actual geometry, frozen source material rest, no animated free vertices'}
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=1;scene.frame_end=60;scene.gravity=(0,0,-9.81*scale)
def blender(p):return np.asarray(p)[...,[0,2,1]]*np.array([1,-1,1])*scale
def three(p):return np.asarray(p)[...,[0,2,1]]*np.array([1,1,-1])/scale
def mesh(name,p,f):
    m=bpy.data.meshes.new(name);m.from_pydata(blender(p).tolist(),[],np.asarray(f).tolist());m.update();obj=bpy.data.objects.new(name,m);scene.collection.objects.link(obj);return obj
def animate(obj,positions):
    basis=obj.shape_key_add(name='Basis');basis.data.foreach_set('co',blender(positions[0]).astype(np.float32).ravel())
    for index,p in enumerate(positions[1:],start=2):
        key=obj.shape_key_add(name='ActualFrame_%02d'%index);key.data.foreach_set('co',blender(p).astype(np.float32).ravel());key.value=0;key.keyframe_insert('value',frame=index-1);key.value=1;key.keyframe_insert('value',frame=index);key.value=0;key.keyframe_insert('value',frame=index+1)
    # Linear neighbor sample interpolation, never4pose interpolation.
    action=obj.data.shape_keys.animation_data.action
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag=strip.channelbag(slot,ensure=False)
                if bag:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
    return basis
bpy.ops.import_scene.gltf(filepath=str(asset));materials=list(next(o for o in scene.objects if o.type=='MESH').data.materials)
for obj in list(scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
skirt=mesh('Actual_Source_Skirt_Offline_Cloth',points,faces)
for material in materials:skirt.data.materials.append(material)
for i,p in enumerate(skirt.data.polygons):p.use_smooth=True;p.material_index=0 if i<120 else min(1,len(materials)-1)
layer=skirt.data.uv_layers.new(name='Original_UV');layer.data.foreach_set('uv',uv[rf.ravel()].astype(np.float32).ravel())
targets=[]
for p in posed:q=points.copy();q[fixed]=p[fixed];targets.append(q)
animate(skirt,targets);vg=skirt.vertex_groups.new(name='Authored120AndNewZipperBoundary');vg.add(fixed.tolist(),1.,'REPLACE')
cloth=skirt.modifiers.new('One_Bounded_Offline_Cloth','CLOTH');s=cloth.settings;s.quality=8;s.mass=.15;s.air_damping=2;s.tension_stiffness=15;s.compression_stiffness=15;s.shear_stiffness=8;s.bending_model='ANGULAR';s.bending_stiffness=.6;s.vertex_group_mass=vg.name;s.pin_stiffness=1;s.use_dynamic_mesh=False
cc=cloth.collision_settings;cc.use_collision=True;cc.distance_min=.002;cc.collision_quality=4;cc.use_self_collision=True;cc.self_distance_min=.005;cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=60
colliderDefinitions=[]
for index,m in enumerate(frames[0]['colliders']):
    f=np.array(m['triangles']).reshape(-1,3);f=f[:,::-1]if m['name'].startswith('m1-uniform-top')else f
    seq=[np.array(fr['colliders'][index]['positions']).reshape(-1,3)for fr in frames]
    assert all(fr['colliders'][index]['name']==m['name']and fr['colliders'][index]['triangles']==m['triangles']for fr in frames)
    obj=mesh('Actual_'+m['name'],seq[0],f);animate(obj,seq);obj.modifiers.new('Actual_Collision','COLLISION');obj.collision.thickness_outer=.001;obj.collision.thickness_inner=.001;colliderDefinitions.append((m['name'],seq,f))
boxFaces=np.array([[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]])
for index,box in enumerate(frames[0]['chair']):
    seq=[]
    for fr in frames:
        b=fr['chair'][index];lo=b['min'];hi=b['max'];q=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(b['matrixWorld']).reshape(4,4);seq.append(q[:,:3])
    assert all(np.array_equal(seq[0],q)for q in seq)
    obj=mesh(box['name'],seq[0],boxFaces);obj.modifiers.new('Actual_Chair_Collision','COLLISION');obj.collision.thickness_outer=.001;obj.collision.thickness_inner=.001;colliderDefinitions.append((box['name'],seq,boxFaces))
preparation={'sourceSha256':hashlib.sha256(raw).hexdigest(),'captureSha256':hashlib.sha256(inputPath.read_bytes()).hexdigest(),'build':'58394ce674e4','config':cfg,'renderVertices':len(source),'weldedVertices':len(points),'fixedVertices':fixed.tolist(),'fixedFaces':[0,259],'activeFaces':[260,2419],'renderToSim':renderToSim.tolist(),'duplicateAnimatedPositionMaximumMetres':duplicateError,'preparationSeconds':time.monotonic()-started,'actualBlenderDistances':{'cloth':cc.distance_min,'self':cc.self_distance_min},'limits':['Collider motion is actual30Hz sampling of120Hz runtime, interpolated between adjacent samples.','No future hand-fit closure; actual captured hands remain collision surfaces.','No runtime installation or natural visual acceptance.']}
(O/'preparation.json').write_text(json.dumps(preparation,indent=2)+'\n',encoding='utf-8');bpy.context.view_layer.objects.active=skirt;skirt.select_set(True);scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(O/'authoring-trial.blend'),compress=True)
tree=lambda p,f:BVHTree.FromPolygons(np.asarray(p).tolist(),np.asarray(f).tolist(),all_triangles=True)
initialHipLocal=(np.c_[points,np.ones(len(points))]@np.linalg.inv(mat(frames[0]['bones'][hipName])).T)[:,:3]
results=[];reason=None
for i,frame in enumerate(frames):
    scene.frame_set(i+1);deps=bpy.context.evaluated_depsgraph_get();ev=skirt.evaluated_get(deps);me=ev.to_mesh();xyz=np.empty(len(me.vertices)*3);me.vertices.foreach_get('co',xyz);p=three(xyz.reshape(-1,3));ev.to_mesh_clear()
    lengths=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1);stretch=lengths/restLengths;areas=area(p);ct=tree(p,faces);pairs={name:ct.overlap(tree(seq[i],f))for name,seq,f in colliderDefinitions};selfPairs=[(a,b)for a,b in ct.overlap(ct)if a<b and not(set(faces[a])&set(faces[b]))]
    absolute=float(np.linalg.norm(p-points,axis=1).max());hipLocal=(np.c_[p,np.ones(len(p))]@np.linalg.inv(mat(frame['bones'][hipName])).T)[:,:3];relative=float(np.linalg.norm(hipLocal-initialHipLocal,axis=1).max());pinResidual=float(np.linalg.norm(p[fixed]-posed[i][fixed],axis=1).max())
    row={'frame':i+1,'label':frame['label'],'sourceActionSeconds':frame['actionSeconds'],'simulationSeconds':i/30,'maxEdgeStretch':float(stretch.max()),'minimumAreaMetres2':float(areas.min()),'areaRatioMinMax':[float((areas/restArea).min()),float((areas/restArea).max())],'absoluteDisplacementMetres':absolute,'hipsRelativeDisplacementMetres':relative,'fixedPointResidualMetres':pinResidual,'colliderPairs':{name:len(p)for name,p in pairs.items()},'selfPairs':len(selfPairs),'positionsWorld':p.tolist()};results.append(row)
    if not np.isfinite(p).all()or areas.min()<1e-12:reason='nonfinite-or-degenerate'
    elif stretch.max()>1.25:reason='material-edge-stretch'
    elif i<3 and absolute>.1:reason='static-absolute100mm-displacement'
    elif pinResidual>cfg['pinResidualMetres']:reason='fixed-pin-residual'
    elif any(pairs.values())or selfPairs:reason='actual-triangle-crossing'
    (O/'progress.json').write_text(json.dumps({k:v for k,v in row.items()if k!='positionsWorld'},indent=2)+'\n',encoding='utf-8')
    # Durable every-frame output also preserves samples if the timeout kills Blender.
    (O/('frame-%02d.json.gz'%(i+1))).write_bytes(gzip.compress(json.dumps(row).encode(),mtime=0))
    if reason:
        (O/'rejected-shape.json.gz').write_bytes(gzip.compress(json.dumps({'reason':reason,'frame':row,'exactColliderPairs':pairs,'exactSelfPairs':selfPairs}).encode(),mtime=0));break
    if time.monotonic()-started>58:reason='bounded-timeout-near-limit';break
result={'status':'rejected'if reason else'completed-author-curves-unreviewed','reason':reason,'frames':len(results),'elapsedSeconds':time.monotonic()-started,'preparation':preparation,'summaries':[{k:v for k,v in row.items()if k!='positionsWorld'}for row in results],'limits':['Not a final character/game acceptance.','Static100mm gate only applied to first3 held frames; dynamic absolute values are reported without stationary-pass claim.','No parameter retry authorized.']}
(O/'result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');bpy.ops.wm.save_as_mainfile(filepath=str(O/'authoring-trial.blend'),compress=True)
print(json.dumps({'status':result['status'],'reason':reason,'frames':len(results),'elapsedSeconds':result['elapsedSeconds'],'last':result['summaries'][-1]}))
