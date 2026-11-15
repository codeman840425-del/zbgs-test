"""Frozen candidate deformation metrics and same-camera offline source comparison."""
from pathlib import Path
import ast,struct,json,hashlib,gzip,time
import numpy as np
import bpy
from mathutils import Vector
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'top-hem-fit-v1';V=O/'views';V.mkdir(exist_ok=True)
def reuse(path,names):
 t=ast.parse(path.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py',['load']);reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed']);reuse(R/'scripts/m1-assets/simple-skirt/render-two-quad-diagnostic.py',['conv','material','mesh'])
old=asset(R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb');new=asset(O/'m1-uniform-top-open-hem-thighfit-v1.glb');pants=asset(R/'prototype/public/assets/m1/m1-training-pants.glb');skirt=asset(S/'two-quad-thirds-v1/m1-sixfold-skirt-two-quad-thirds-v1.glb');cap=json.loads(gzip.decompress((S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()));four=json.loads(gzip.decompress((S/'private-layer-initial/capture.json.gz').read_bytes()));gate=json.loads((O/'actual-60-gate.json').read_text());F=old['F'];AF=np.array(gate['affectedTopFaces']);changed=json.loads((O/'build-report.json').read_text())['changedVertices'];edges=np.unique(np.sort(np.concatenate([F[AF][:,[0,1]],F[AF][:,[1,2]],F[AF][:,[2,0]]]),axis=1),axis=0);adj={}
for i,face in enumerate(F):
 for a,b in [(face[0],face[1]),(face[1],face[2]),(face[2],face[0])]:adj.setdefault(tuple(sorted([int(a),int(b)])),[]).append(i)
neighbor=np.array([ids for ids in adj.values()if len(ids)==2 and any(i in AF for i in ids)])
br,bd,ba=load(R/'prototype/public/assets/foundation/base-female-roundtrip.vrm');bp=bd['meshes'][0]['primitives'][0];BF=ba(bp['indices']).reshape(-1,3);BJ=ba(bp['attributes']['JOINTS_0']);BW=ba(bp['attributes']['WEIGHTS_0']);bs=bd['skins'][next(n['skin']for n in bd['nodes']if n.get('mesh')==0)];bn=[bd['nodes'][i]['name']for i in bs['joints']]
def roles(fi):
 totals={}
 for vi in BF[fi]:
  for j,w in zip(BJ[vi],BW[vi]):totals[bn[j]]=totals.get(bn[j],0)+float(w)/3
 return {k:v for k,v in sorted(totals.items(),key=lambda x:-x[1])if v>.01}
def stats(P):
 cross=np.cross(P[F[:,1]]-P[F[:,0]],P[F[:,2]]-P[F[:,0]]);area=np.linalg.norm(cross,axis=1)*.5;norm=cross/np.maximum(2*area[:,None],1e-15);angle=np.degrees(np.arccos(np.clip(np.sum(norm[neighbor[:,0]]*norm[neighbor[:,1]],axis=1),-1,1)));return np.linalg.norm(P[edges[:,0]]-P[edges[:,1]],axis=1),area[AF],angle
rows=[]
for r,fr in zip(gate['rows'],cap['frames']+four['frames']):
 a=posed(old,fr);b=posed(new,fr);x=stats(a);y=stats(b);er=y[0]/x[0];ar=y[1]/x[1];nd=y[2]-x[2];pairs=r['variants']['candidate']['affectedBodyPairs'];rows.append({'frame':r['frame'],'edgeRatioMinMax':list(map(float,[er.min(),er.max()])),'areaRatioMinMax':list(map(float,[ar.min(),ar.max()])),'adjacentNormalAngleOldNewMax':list(map(float,[x[2].max(),y[2].max()])),'maxAdjacentNormalAngleChangeDegrees':float(abs(nd).max()),'maxEdgeRenderVertices':edges[er.argmax()].tolist(),'maxAreaTopFace':int(AF[ar.argmax()]),'remainingBodyFaceRoles':{str(i):roles(i)for i in sorted({j for i,j in pairs})},'newBodyPairs':r['newBodyPairs'],'newPantsPairs':sorted(set(map(tuple,r['variants']['candidate']['pantsPairs']))-set(map(tuple,r['variants']['parentOpenTop']['pantsPairs']))),'newFixedSkirtPairs':sorted(set(map(tuple,r['variants']['candidate']['fixedSkirtPairs']))-set(map(tuple,r['variants']['parentOpenTop']['fixedSkirtPairs'])))})
(O/'deformation-and-region.json').write_text(json.dumps({'candidateSha256':new['sha'],'rows':rows,'limits':['Same-pose candidate/parent ratios, not source-rest strain.','Bone role classification reports actual face weights, not proof of visual occlusion.','No threshold is used to declare natural folding.']},indent=2)+'\n',encoding='utf-8');print('metrics complete',flush=True)
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=700;scene.render.resolution_y=850;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('DiagnosticWorld');scene.world.color=(.7,.7,.7);scene.view_settings.view_transform='Standard';scene.view_settings.exposure=-2
skin=material('All_captured_body_faces',(.66,.43,.32));topMat=material('All_open_top_faces',(.78,.80,.85));pantsMat=material('Original_pants',(.025,.065,.15));chairMat=material('Actual_chair_boxes',(.25,.30,.37));cameraData=bpy.data.cameras.new('SameCamera');camera=bpy.data.objects.new('SameCamera',cameraData);scene.collection.objects.link(camera);scene.camera=camera;cameraData.type='ORTHO';cameraData.ortho_scale=1.25;target=np.array([2.65,.95,1.1]);outputs=[];dynamic=[]
for name,pos,energy,size in [('Key',[1.1,3.8,3.5],700,4),('Fill',[4.5,2.4,.1],400,3)]:
 ld=bpy.data.lights.new(name,'AREA');ld.energy=energy;ld.size=size;ob=bpy.data.objects.new(name,ld);scene.collection.objects.link(ob);ob.location=Vector(conv(pos));ob.rotation_euler=(Vector(conv(target))-ob.location).to_track_quat('-Z','Y').to_euler()
boxFaces=np.array([[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]])
for index,fr in [(1,cap['frames'][0]),(19,cap['frames'][18]),(60,cap['frames'][59]),('rise',four['frames'][3])]:
 for tag,a in [('parent',old),('candidate',new)]:
  for ob in dynamic:bpy.data.objects.remove(ob,do_unlink=True)
  dynamic=[];body=next(m for m in fr['colliders']if m['name']=='Bodybaked');dynamic.append(mesh('All_body',np.array(body['positions']).reshape(-1,3),np.array(body['triangles']).reshape(-1,3),skin));dynamic.append(mesh('All_top',posed(a,fr),F,topMat));dynamic.append(mesh('Original_pants',posed(pants,fr),pants['F'],pantsMat))
  for box in fr['chair']:
   lo=box['min'];hi=box['max'];p=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(box['matrixWorld']).reshape(4,4);dynamic.append(mesh(box['name'],p[:,:3],boxFaces,chairMat))
  for view,offset in [('front',[0,.05,3]),('side',[3,.05,0])]:
   camera.location=Vector(conv(target+offset));camera.rotation_euler=(Vector(conv(target))-camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update();out=V/f'{index}-{tag}-{view}.png';scene.render.filepath=str(out);bpy.ops.render.render(write_still=True);outputs.append({'path':out.name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'frame':index,'variant':tag,'view':view,'cameraWorld':[list(row)for row in camera.matrix_world],'orthoScale':cameraData.ortho_scale})
(V/'report.json').write_text(json.dumps({'candidateSha256':new['sha'],'parentOpenTopSha256':old['sha'],'outputs':outputs,'limits':['Offline actual-LBS source comparison, not game capture.','Constant camera perview allposes; complete captured body and oldpants shown.','Solid materials no textures/hair, cannot certify GPU alpha/outline visibility.','This top source parent already has openhem cap removal, distinct public closed27bc top unchanged.','No native cloth or newhand fit executed.']},indent=2)+'\n',encoding='utf-8')
