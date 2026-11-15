"""One standard Blender modifier author pass, no cloth or custom fitting solver.
Immutable source029 and actual58394 seated capture; all stages saved for review.
"""
from pathlib import Path
import ast,json,gzip,struct,hashlib,math
import numpy as np
import bpy
from mathutils import Matrix,Vector
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'blender-seated-author-v1';O.mkdir(exist_ok=True)
assert not(O/'author-result.json').exists(), 'Frozen single attempt: refuse overwrite'
def reuse(path,names):
 t=ast.parse(path.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py',['load']);reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed'])
sourcePath=S/'two-quad-thirds-v1/m1-sixfold-skirt-two-quad-thirds-v1.glb';a=asset(sourcePath);assert a['sha']=='02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7';cp=S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz';cap=json.loads(gzip.decompress(cp.read_bytes()));fr=cap['frames'][59];oldPosed=posed(a,fr,True);P=a['P'];F=a['F'];hip=np.array(fr['bones']['J_Bip_C_Hips']).reshape(4,4).T;hipPalette=hip@a['inv'][a['names'].index('J_Bip_C_Hips')];staging=(np.c_[P,np.ones(len(P))]@hipPalette.T)[:,:3];fixed=np.unique(F[:260]);staging[fixed]=oldPosed[fixed]
conv=lambda p:np.asarray(p)[...,[0,2,1]]*np.array([1,-1,1]);unconv=lambda p:np.asarray(p)[...,[0,2,1]]*np.array([1,1,-1]);smooth=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
row=np.clip((.95675-P[:,1])/.23458,0,1);front=smooth((-P[:,2]-.015)/.08);back=smooth((P[:,2]-.015)/.08);release=smooth(row/.22);front[fixed]=0;back[fixed]=0;release[fixed]=0
inner=np.zeros(len(P),bool);inner[1271:1392]=True
# Existing1402 topology; ordinary named weight/selection groups, no added/removal faces.
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.unit_settings.system='METRIC'
def mesh(name,p,f):
 d=bpy.data.meshes.new(name);d.from_pydata(conv(p).tolist(),[],np.asarray(f).tolist());d.update();ob=bpy.data.objects.new(name,d);scene.collection.objects.link(ob);return ob
edit=mesh('SeatedAuthor_EditableWorld',staging,F);bpy.context.view_layer.objects.active=edit;edit.select_set(True)
def group(name,w):
 g=edit.vertex_groups.new(name=name)
 for i,x in enumerate(w):
  if x>1e-8:g.add([i],float(x),'REPLACE')
 return g.name
fixedMask=np.zeros(len(P));fixedMask[fixed]=1;group('KEEP_actual_safe_upper_and_seam',fixedMask)
frontGroup=group('AUTHOR_front_panel',front);backGroup=group('AUTHOR_rear_panel',back)
ops=[];stages={'stagingRigidHipsWithExactFixed':staging.copy()}
def stage(name):
 bpy.context.view_layer.update();v=np.array([v.co[:]for v in edit.data.vertices]);q=unconv(v);stages[name]=q.copy();return q

def bend(name,groupName,origin,angle,hinge):
 empty=bpy.data.objects.new(name+'_Origin',None);scene.collection.objects.link(empty);empty.location=conv(origin);bpy.context.view_layer.update();coords=np.array([v.co[:]for v in edit.data.vertices]);z=coords[:,2]-empty.location.z;low,high=z.min(),z.max();limits=[float(np.clip((-hinge-low)/(high-low),0,1)),float(np.clip((0-low)/(high-low),0,1))];m=edit.modifiers.new(name,'SIMPLE_DEFORM');m.deform_method='BEND';m.deform_axis='X';m.origin=empty;m.angle=angle;m.limits=limits;m.vertex_group=groupName;ops.append({'operator':'SimpleDeform/BEND','name':name,'group':groupName,'originWorld':np.array(origin).tolist(),'angleRadians':angle,'hingeLengthMetres':hinge,'limits':limits});bpy.ops.object.modifier_apply(modifier=m.name);stage(name)
hipPoint=hip[:3,3];knee=(np.array(fr['bones']['J_Bip_L_LowerLeg']).reshape(4,4).T[:3,3]+np.array(fr['bones']['J_Bip_R_LowerLeg']).reshape(4,4).T[:3,3])*.5;upper=(np.array(fr['bones']['J_Bip_L_UpperLeg']).reshape(4,4).T[:3,3]+np.array(fr['bones']['J_Bip_R_UpperLeg']).reshape(4,4).T[:3,3])*.5;slope=math.atan2(upper[1]-knee[1],np.linalg.norm((knee-upper)[[0,2]]));frontAngle=-(math.pi/2-slope)
frontOrigin=staging[272].copy();bend('FrontNearWaistBend',frontGroup,frontOrigin,frontAngle,.06)
rearOrigin=np.array([hipPoint[0],.51,.75]);bend('RearLast50mmReturn',backGroup,rearOrigin,-math.pi/2,.05)
body=next(m for m in fr['colliders']if m['name']=='Bodybaked');BP=np.array(body['positions']).reshape(-1,3);BF=np.array(body['triangles']).reshape(-1,3);norm=np.cross(BP[BF[:,1]]-BP[BF[:,0]],BP[BF[:,2]]-BP[BF[:,0]]);norm/=np.maximum(np.linalg.norm(norm,axis=1)[:,None],1e-20);center=BP[BF].mean(1)
# Anatomical author-support subsets only; full Body remains in final gate and GPU.
bodyRaw,bd,ba=load(R/'prototype/public/assets/foundation/base-female-roundtrip.vrm');bp=bd['meshes'][0]['primitives'][0];BJ=ba(bp['attributes']['JOINTS_0']);BW=ba(bp['attributes']['WEIGHTS_0']);skin=bd['skins'][next(n['skin']for n in bd['nodes']if n.get('mesh')==0)];bn=[bd['nodes'][i]['name']for i in skin['joints']];allowed={'J_Bip_C_Hips','J_Bip_L_UpperLeg','J_Bip_R_UpperLeg'};roles=np.sum(BW*np.array([[bn[j]in allowed for j in js]for js in BJ]),axis=1);region=np.all(roles[BF]>.90,axis=1);frontFaces=np.flatnonzero(region&(norm[:,1]>.15)&(center[:,2]>.93));backFaces=np.flatnonzero(region&(norm[:,1]<-.15)&(center[:,1]<.57));targets={}
for name,ids in [('ThighUpperSupport',frontFaces),('BodySeatUndersideSupport',backFaces)]:targets[name]=mesh(name,BP,BF[ids]);targets[name].hide_render=True;targets[name].display_type='WIRE'
bridge=smooth(np.abs(P[:,0]-.000255)/.04);frontSupport=front*release*bridge;rearSupport=back*smooth((row-.45)/.25);frontSupport[fixed]=rearSupport[fixed]=0
for area,weights,target in [('Front',frontSupport,targets['ThighUpperSupport']),('Rear',rearSupport,targets['BodySeatUndersideSupport'])]:
 for shell,mask,offset in [('Outer',~inner,.0032),('InnerReturn',inner,.0024)]:
  name=group('SUPPORT_'+area+shell,weights*mask);m=edit.modifiers.new('NativeShrinkwrap_'+area+shell,'SHRINKWRAP');m.target=target;m.wrap_method='NEAREST_SURFACEPOINT';m.wrap_mode='OUTSIDE_SURFACE';m.offset=offset;m.vertex_group=name;ops.append({'operator':'Shrinkwrap/NEAREST_SURFACEPOINT/OUTSIDE_SURFACE','name':m.name,'group':name,'support':target.name,'offsetMetres':offset});bpy.ops.object.modifier_apply(modifier=m.name);stage('Support_'+area+shell)
# Restore the declared immutable boundary exactly; any near-boundary distortion remains gated.
for i in fixed:edit.data.vertices[int(i)].co=conv(oldPosed[i]);target=stage('final');assert len(edit.data.vertices)==len(P)and len(edit.data.polygons)==len(F)
np.savez_compressed(O/'author-stages.npz',**stages,source=P,faces=F,originalSeated=oldPosed,fixed=fixed,innerIndices=np.flatnonzero(inner));np.savez_compressed(O/'selection-groups.npz',front=front,back=back,release=release,frontSupport=frontSupport,rearSupport=rearSupport)
# Import original source as an independently editable Basis, then add this one shape in bind space.
edit.select_set(False);bpy.ops.import_scene.gltf(filepath=str(sourcePath));garment=next(o for o in bpy.context.scene.objects if o.type=='MESH'and len(o.data.vertices)==len(P)and o!=edit);srcBlender=np.array([v.co[:]for v in garment.data.vertices]);mapping=[];pool={}
for i,p in enumerate(np.round(conv(P),6)):pool.setdefault(tuple(p),[]).append(i)
for p in np.round(srcBlender,6):
 ids=pool.get(tuple(p));assert ids,'Import position mapping mismatch';mapping.append(ids.pop(0))
world=np.array([np.array(fr['bones'][n]).reshape(4,4).T for n in a['names']])
for c in fr['controls']:world[a['names'].index(c['name'])]=np.array(c['privateWorld']).reshape(4,4).T
pal=world@a['inv'];linear=sum(pal[a['J'][:,k],:3,:3]*a['W'][:,k,None,None]for k in range(4));delta=np.linalg.solve(linear,(target-oldPosed)[:,:,None])[:,:,0];bindTarget=P+delta;basis=garment.shape_key_add(name='Basis');key=garment.shape_key_add(name='seated_author_v1');
for i,j in enumerate(mapping):key.data[i].co=conv(bindTarget[j]);key.value=0
edit.hide_render=True;edit.hide_set(True);bpy.ops.wm.save_as_mainfile(filepath=str(O/'seated-author-v1.blend'));bpy.ops.object.select_all(action='DESELECT');garment.select_set(True);arm=garment.find_armature();assert arm;arm.select_set(True);bpy.context.view_layer.objects.active=garment
out=O/'m1-sixfold-skirt-seated-author-v1.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_skins=True,export_morph=True,export_morph_normal=True,export_animations=False,export_apply=False)
report={'id':'m1-sixfold-skirt-seated-author-v1','status':'single-standard-author-pass-pending-gates','sourceSha256':a['sha'],'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'captureSha256':hashlib.sha256(cp.read_bytes()).hexdigest(),'frame':60,'bodySha256':'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95','operators':ops,'safeFixedVertices':fixed.tolist(),'supportBodyFaceIds':{'front':frontFaces.tolist(),'rear':backFaces.tolist()},'blenderImportToSourceVertex':mapping,'maxWorldEditMetres':float(np.linalg.norm(target-oldPosed,axis=1).max()),'sourceAxialLengthPriorMetres':[.234,.252],'frontBendDerivedThighSlopeRadians':slope,'sourceAndTargetTopologyCounts':[len(P),len(F)],'blenderVersion':bpy.app.version_string,'blendSha256':hashlib.sha256((O/'seated-author-v1.blend').read_bytes()).hexdigest(),'limits':['One explicit Blender author pass, no iterative parameter search, no cloth','Support subsets only define author modifier targets; final geometry gate uses complete actual Body/top/chair','Inner return remains all121points/all240faces, with native support offsets preserving planned.8mm layer difference, actual minimum not yet accepted','Bind-space Basis/source weights preserved in author; standard exporter may split/reorder vertices and must be read back','Single pose only, no continuous driver or acceptance']};(O/'author-result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'outputSha256':report['outputSha256'],'maxEdit':report['maxWorldEditMetres'],'frontAngle':frontAngle,'supportFaces':[len(frontFaces),len(backFaces)]}))
