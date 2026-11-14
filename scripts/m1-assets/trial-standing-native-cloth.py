"""Blender isolated <=60frame native cloth test, no browser or production edits.
Launch under short-cloth runner; only actual initial shapes, no old rigid pose drive.
"""
import bpy,json,pathlib,sys,time
import numpy as np
from mathutils.bvhtree import BVHTree
R=pathlib.Path(__file__).resolve().parents[2];S=R/'assets-source/m1/offline-corrective/open-waist-v1';cfg=json.loads((S/'standing-cloth-config.json').read_text(encoding='utf8'));rest=json.loads((S/'standing-rest-candidate.json').read_text(encoding='utf8'));top=json.loads((S/'top-edit.json').read_text(encoding='utf8'));t=json.loads((S/'topology.json').read_text(encoding='utf8'));validation=json.loads((S/'native-initial-validation.json').read_text(encoding='utf8'));capture=json.loads((R/'experiments/skirt-offline-corrective/displayed-initial-0df63cf2bdea/standing-01/initial.json').read_text(encoding='utf8'))
ringMode='--ring-cage'in sys.argv;ring=None
if ringMode:
 ringPath=R/'assets-source/m1/offline-corrective/ring-cage-v1';ring=json.loads((ringPath/'cage-and-binding.json').read_text(encoding='utf8'));validation=json.loads((ringPath/'native-initial-validation.json').read_text(encoding='utf8'))
assert validation['status']=='native-bvh-clear-not-cloth-accepted'
scale=cfg['authoringScale'];gap=(cfg['clothDistanceAuthoring']+cfg['colliderThicknessAuthoring'])/scale
for row in validation['colliders']:
 if row['exactNearTriangleMinimum']:assert row['exactNearTriangleMinimum']['distance']>gap,'Initial true gap cannot fit requested thin cloth distances'
out=pathlib.Path(sys.argv[sys.argv.index('--')+1]).resolve();assert out.is_relative_to(R/'experiments/skirt-offline-corrective');out.mkdir(parents=True,exist_ok=True);assert not(out/'result.json').exists()
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.fps=cfg['fps'];scene.frame_start=1;scene.frame_end=cfg['frames'];scene.gravity=(0,0,-cfg['gravityMetres']*scale)
def blender(p):return np.asarray(p)[...,[0,2,1]]*np.array([1,-1,1])*scale
def three(p):return np.asarray(p)[...,[0,2,1]]*np.array([1,1,-1])/scale
def mesh(name,p,f):
 m=bpy.data.meshes.new(name);m.from_pydata(blender(p).tolist(),[],f);m.update();o=bpy.data.objects.new(name,m);scene.collection.objects.link(o);return o
bpy.ops.import_scene.gltf(filepath=str(S/'m1-uniform-skirt-open-waist.glb'));source=next(o for o in scene.objects if o.type=='MESH');materials=list(source.data.materials)
for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
points=np.array(rest['positionsWorld']);faces=t['triangles'];skirt=mesh('SameSkirt_OpenWaist_FittedRest',points,faces)
localMode='--local-sim' in sys.argv;localMesh=None
if localMode:
 localMesh=json.loads((R/'assets-source/m1/offline-corrective/local-sim-v1/simulation-mesh.json').read_text(encoding='utf8'));hip=np.array(rest['hipWorld']).reshape(4,4).T
 points=(np.c_[localMesh['restPositionsHipLocal'],np.ones(localMesh['simulationVertices'])]@hip.T)[:,:3];faces=localMesh['simulationTriangles'];bpy.data.objects.remove(skirt,do_unlink=True);skirt=mesh('LocallyRefined_SimulationCage',points,faces)
if ringMode:
 points=np.array(ring['positionsWorld']);faces=ring['quads'];bpy.data.objects.remove(skirt,do_unlink=True);skirt=mesh('Independent_RegularRing_Cage',points,faces)
physicsFaces=faces;gateFaces=ring['triangles']if ringMode else faces
for m in materials:skirt.data.materials.append(m)
if not(localMode or ringMode):
 uv=skirt.data.uv_layers.new(name='OriginalSourceUV');uv.data.foreach_set('uv',np.array(t['uv'])[np.array(t['renderTriangles']).ravel()].astype(np.float32).ravel())
for p in skirt.data.polygons:p.use_smooth=True
pins=skirt.vertex_groups.new(name='ActualWaistRingAndBand')
pinValues=localMesh['pinWeights']if localMode else[float(np.clip((p[1]-.065)/.025,0,1))for p in t['hipLocalPosition']]
if ringMode:
 pinValues=[];angular=ring['angularSegments']
 for i in range(len(points)):
  band=i//angular;distance=sum(np.linalg.norm(points[k*angular+i%angular]-points[(k-1)*angular+i%angular])for k in range(1,band+1));w=float(np.clip(1-distance/.025,0,1));pinValues.append(w*w*(3-2*w))
for i,w in enumerate(pinValues):
 if not(localMode or ringMode):w=w*w*(3-2*w)
 if w>0:pins.add([i],w,'REPLACE')
cloth=skirt.modifiers.new('BlenderNativeCloth','CLOTH');cloth.settings.quality=8;cloth.settings.mass=.15;cloth.settings.air_damping=2;cloth.settings.tension_stiffness=15;cloth.settings.compression_stiffness=15;cloth.settings.shear_stiffness=8;cloth.settings.bending_model='ANGULAR';cloth.settings.bending_stiffness=.6;cloth.settings.vertex_group_mass=pins.name;cloth.settings.pin_stiffness=1
if localMode:cloth.settings.mass=.15*localMesh['originalWeldedCount']/localMesh['simulationVertices']
if ringMode:cloth.settings.mass=.15*len(t['position'])/len(points)
cc=cloth.collision_settings;cc.use_collision=True;cc.distance_min=cfg['clothDistanceAuthoring'];cc.collision_quality=4;cc.use_self_collision=True;cc.self_distance_min=cfg['selfDistanceAuthoring'];cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=cfg['frames']
colliders=[];material=bpy.data.materials.new('AuthoringColliderClay');material.diffuse_color=(.45,.5,.55,1)
for m in capture['colliders']:
 f=np.array(m['triangles']).reshape(-1,3)
 if m['name']=='m1-uniform-top_1':f=np.delete(f,top['removedOriginalFaces'],axis=0)
 # Top encloses skirt: inward physics orientation expresses layer order,
 # while all actual visible sidewall/tie surfaces remain present.
 if m['name'].startswith('m1-uniform-top'):f=f[:,::-1]
 obj=mesh('Actual_'+m['name'],m['positions'],f.tolist());obj.modifiers.new('NativeCollision','COLLISION');obj.collision.thickness_outer=cfg['colliderThicknessAuthoring'];obj.collision.thickness_inner=cfg['colliderThicknessAuthoring'];obj.data.materials.append(material)
 colliders.append((m['name'],BVHTree.FromPolygons(m['positions'],f.tolist(),all_triangles=True)))
edges=np.array(sorted(set(tuple(sorted((a,b)))for t in faces for a,b in zip(t,t[1:]+t[:1]))));length=np.linalg.norm(points[edges[:,0]]-points[edges[:,1]],axis=1);started=time.monotonic();frames=[];reason=None
def ringRender(p):
 out=[]
 for binding in ring['renderWeldedBindings']:
  tri=p[np.array(ring['triangles'][binding['triangle']])];q=np.array(binding['barycentric'])@tri;x=tri[1]-tri[0];x/=max(np.linalg.norm(x),1e-15);normal=np.cross(tri[1]-tri[0],tri[2]-tri[0]);normal/=max(np.linalg.norm(normal),1e-15);basis=np.array([x,np.cross(normal,x),normal]);out.append(q+np.array(binding['restDetailInTriangleFrame'])@basis)
 return np.array(out)
bpy.context.view_layer.objects.active=skirt;skirt.select_set(True)
for frame in range(1,cfg['frames']+1):
 scene.frame_set(frame);deps=bpy.context.evaluated_depsgraph_get();evaluated=skirt.evaluated_get(deps);me=evaluated.to_mesh();xyz=np.empty(len(me.vertices)*3);me.vertices.foreach_get('co',xyz);p=three(xyz.reshape(-1,3));evaluated.to_mesh_clear()
 stretch=float(np.max(np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)/length));displacement=float(np.max(np.linalg.norm(p-points,axis=1)));tree=BVHTree.FromPolygons(p.tolist(),gateFaces,all_triangles=True);pairs={name:tree.overlap(bt)for name,bt in colliders};selfpairs=[(a,b)for a,b in tree.overlap(tree)if a<b and not(set(gateFaces[a])&set(gateFaces[b]))]
 renderPairs={};renderSelf=[]
 if localMode:
  rt=BVHTree.FromPolygons(p[:localMesh['originalWeldedCount']].tolist(),localMesh['originalWeldedTriangles'],all_triangles=True);renderPairs={name:rt.overlap(bt)for name,bt in colliders}
 if ringMode:
  renderPoints=ringRender(p);rt=BVHTree.FromPolygons(renderPoints.tolist(),t['triangles'],all_triangles=True);renderPairs={name:rt.overlap(bt)for name,bt in colliders}
 if localMode or ringMode:
  originalFaces=localMesh['originalWeldedTriangles']if localMode else t['triangles'];renderSelf=[(a,b)for a,b in rt.overlap(rt)if a<b and not(set(originalFaces[a])&set(originalFaces[b]))]
 row={'frame':frame,'seconds':(frame-1)/cfg['fps'],'maxEdgeStretch':stretch,'maxDisplacement':displacement,'colliderPairs':{name:len(v)for name,v in pairs.items()},'originalRenderColliderPairs':{name:len(v)for name,v in renderPairs.items()},'selfPairs':len(selfpairs),'positionsWorld':p.tolist()};frames.append(row)
 row['originalRenderSelfPairs']=len(renderSelf)
 if ringMode:row['originalRenderWeldedPositionsWorld']=renderPoints.tolist()
 if stretch>cfg['maxEdgeStretch']:reason='material-edge-stretch'
 elif displacement>cfg['maxDisplacementMetres']:reason='excessive-displacement'
 elif any(pairs.values())or selfpairs:reason='native-triangle-crossing'
 elif any(renderPairs.values())or renderSelf:reason='original-render-remap-crossing'
 if reason:
  (out/'rejected-shape.json').write_text(json.dumps({'reason':reason,'frame':row,'exactColliderPairs':pairs,'exactOriginalRenderPairs':renderPairs,'exactSelfPairs':selfpairs,'exactOriginalRenderSelfPairs':renderSelf},indent=2),encoding='utf8');break
 if frame%15==0:(out/'progress.json').write_text(json.dumps({k:v for k,v in row.items()if k!='positionsWorld'},indent=2),encoding='utf8')
result={'status':'rejected'if reason else'stationary-stability-only-unreviewed','reason':reason,'config':cfg,'actualDistancesAuthoring':{'cloth':cc.distance_min,'self':cc.self_distance_min,'scale':scale},'elapsedSeconds':time.monotonic()-started,'frames':frames,'limits':['No walk/sit/run/dance motion','No visual/production acceptance','Physics proxy uses corrected opened top source while production remains unchanged','Clay collider presentation is authoring only, not finished game art']}
if localMode:
 result.update(simulationMesh='local-sim-v1',simulationVertices=localMesh['simulationVertices'],originalRenderVertices=len(localMesh['originalRenderFromSimulation']),pinDefinition=localMesh['pinDefinition'],massPerVertex=cloth.settings.mass,massScaling='Total nominal vertex mass preserved relative to380vertex experiment; not calibrated real fabric')
 render=mesh('Original_Render_ExplicitRemap',p[np.array(localMesh['originalRenderFromSimulation'])],localMesh['originalRenderTriangles']);uv=render.data.uv_layers.new(name='OriginalSourceUV');uv.data.foreach_set('uv',np.array(localMesh['uv'])[np.array(localMesh['originalRenderTriangles']).ravel()].astype(np.float32).ravel())
 for material in materials:render.data.materials.append(material)
 skirt.hide_render=True;skirt.display_type='WIRE' # Authoring cage; original render remains independently gated.
if ringMode:
 result.update(simulationMesh='ring-cage-v1',simulationVertices=len(points),simulationQuads=len(physicsFaces),originalRenderVertices=len(ring['originalRenderToWeld']),pinDefinition='Actual regular waist boundary,25mm column-distance smooth release',massPerVertex=cloth.settings.mass,remap='Barycentric carrier + transported triangle-frame original pleat detail')
 render=mesh('Original_Pleats_TransportedDetailRemap',renderPoints[np.array(ring['originalRenderToWeld'])],ring['originalRenderTriangles']);uv=render.data.uv_layers.new(name='OriginalSourceUV');uv.data.foreach_set('uv',np.array(ring['originalUV'])[np.array(ring['originalRenderTriangles']).ravel()].astype(np.float32).ravel())
 for material in materials:render.data.materials.append(material)
 skirt.hide_render=True;skirt.display_type='WIRE'
(out/'result.json').write_text(json.dumps(result),encoding='utf8');bpy.ops.wm.save_as_mainfile(filepath=str(out/'native-standing-trial.blend'),compress=True)
print(json.dumps({'status':result['status'],'reason':reason,'frames':len(frames),'seconds':result['elapsedSeconds'],'last':{k:v for k,v in frames[-1].items()if k not in ['positionsWorld','originalRenderWeldedPositionsWorld']}}))
if reason:raise RuntimeError('Bounded native cloth rejected: '+reason)
