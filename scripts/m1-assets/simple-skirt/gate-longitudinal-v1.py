"""Complete target gate before any 18-bone fit/runtime; preserves rejected author source."""
from pathlib import Path
import ast,struct,json,gzip,hashlib,argparse,sys
import numpy as np,bpy
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';parser=argparse.ArgumentParser();parser.add_argument('--out',default='assets-source/m1/simple-skirt-v1/longitudinal-bones-v1/author-target-v1');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);O=(R/args.out).resolve();assert O.is_relative_to(R);assert not(O/'geometry-gate.json').exists()
def reuse(file,names):
 t=ast.parse(file.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(file),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py',['load']);reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed','tree'])
a=np.load(O/'author-arrays.npz');spec=json.loads((O/'author-spec.json').read_text());cap=json.loads(gzip.decompress((S/'longitudinal-bones-v1/input-038/four-poses.json.gz').read_bytes()));F=a['faces'];P=a['target'];ct=tree(P,F);fr=cap['frames'][2];rows=[]
for m in fr['colliders']:
 if not ('Body'in m['name']or'uniform-top'in m['name']):continue
 Q=np.array(m['positions']).reshape(-1,3);T=np.array(m['triangles']).reshape(-1,3)
 if m['name']=='Bodybaked':T=a['completeBodyFaces']
 pairs=sorted(ct.overlap(tree(Q,T)));rows.append({'name':m['name'],'completeSourceFaces':len(T),'pairs':pairs,'count':len(pairs)})
for box in fr['chair']:
 lo,hi=box['min'],box['max'];Q=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(box['matrixWorld']).reshape(4,4);T=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]];pairs=sorted(ct.overlap(tree(Q[:,:3],T)));rows.append({'name':box['name'],'pairs':pairs,'count':len(pairs)})
lookup={};ids=[]
for p in np.round(a['source'],7):lookup.setdefault(tuple(p),len(lookup));ids.append(lookup[tuple(p)])
W=np.array(ids)[F];selfpairs=[(i,j)for i,j in ct.overlap(ct)if i<j and not(set(W[i])&set(W[j]))];area=np.linalg.norm(np.cross(P[F[:,1]]-P[F[:,0]],P[F[:,2]]-P[F[:,0]]),axis=1)/2
report={'status':'rejected-before-bone-fit','source':spec['sourceSha256'],'captureSHA256':spec['captureSHA256'],'originalCompleteBodyRestored':True,'collisions':rows,'selfPairs':selfpairs,'minimumTriangleAreaM2':float(area.min()),'edgeGate':spec['edgeGate'],'fixedBandMaxDeltaM':float(np.linalg.norm(P[a['fixed']]-a['rawSourceWorld'][a['fixed']],axis=1).max()),'limits':['This is one author-target preflight, not an exported/loaded18bone garment or route verdict.','Captured original hands were fitted against default skirt, not this rejected target; all body triangles still counted.','No material/geometry parameter scans; no runtime/controller modifications.']}
(O/'geometry-gate.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(R/spec['sourceFile']))
source=next(x for x in bpy.context.scene.objects if x.type=='MESH');source.name='Original_Unchanged_Source';source.hide_render=True
mesh=bpy.data.meshes.new('Rejected_Author_Target_ActualWorld');mesh.from_pydata(P.tolist(),[],F.tolist());mesh.update();obj=bpy.data.objects.new('Rejected_Target_NOT_RUNTIME',mesh);bpy.context.collection.objects.link(obj)
for mat in source.data.materials:mesh.materials.append(mat)
obj['status']='REJECTED material and complete triangle gates; no bone fitting or GLB publication'
obj['sourceSHA256']=spec['sourceSha256'];obj['captureSHA256']=spec['captureSHA256']
# Real editable control chains laid out in the same actual room coordinates.
hip=np.array(fr['bones']['J_Bip_C_Hips']).reshape(4,4).T
arm=bpy.data.armatures.new('18_Longitudinal_Author_Controls');rig=bpy.data.objects.new('AuthorControlLayout_NOT_BOUND',arm);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for c in spec['controls']:
 bone=arm.edit_bones.new(c['id']);bone.head=(hip@np.r_[c['targetHead'],1])[:3];bone.tail=(hip@np.r_[c['targetTail'],1])[:3]
 if c['parent']:bone.parent=arm.edit_bones[c['parent']]
bpy.ops.object.mode_set(mode='OBJECT');rig['binding']='Not fitted or exported because initial author target failed'
for m in fr['colliders']:
 if not ('Body'in m['name']or'uniform-top'in m['name']):continue
 q=np.array(m['positions']).reshape(-1,3);t=a['completeBodyFaces']if m['name']=='Bodybaked'else np.array(m['triangles']).reshape(-1,3);g=bpy.data.meshes.new(m['name']);g.from_pydata(q.tolist(),[],t.tolist());g.update();ob=bpy.data.objects.new(m['name']+'_collision_input',g);bpy.context.collection.objects.link(ob);ob.display_type='WIRE';ob.hide_render=True
# Three author arrays use Y-up; convert only editor presentation to Blender Z-up.
axis=bpy.data.objects.new('Three_Yup_to_Blender_Zup',None);bpy.context.collection.objects.link(axis);axis.rotation_euler[0]=np.pi/2
for item in [obj,rig]+[x for x in bpy.context.scene.objects if x.name.endswith('_collision_input')]:item.parent=axis
bpy.ops.wm.save_as_mainfile(filepath=str(O/'rejected-author-target.blend'))
print(json.dumps({'status':report['status'],'counts':[(r['name'],r['count'])for r in rows],'self':len(selfpairs),'edge':report['edgeGate'],'fixedDelta':report['fixedBandMaxDeltaM']}))
