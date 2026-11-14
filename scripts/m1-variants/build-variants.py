"""Pinned Blender4.5.9 + VRM addon4.10.5. Two independent local specimens.
Reads the preserved full female .blend each time; never overwrites original.
Run blender --background --factory-startup --python scripts/m1-variants/build-variants.py
Each saved candidate is reopened and exported twice to verify deterministic output.
"""
import bpy,pathlib,json,hashlib,sys,importlib,math,struct
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
SPEC=json.loads((ROOT/'assets-source/m1-variants/spec.json').read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=ROOT/SPEC['sourceBlend'];assert sha(source)==SPEC['sourceBlendSha256']
assert sha(ROOT/SPEC['sourceVRM'])==SPEC['sourceVRMSha256']
sys.path.insert(0,str(ROOT/'experiments/tools/vrm-addon'));addon='VRM_Addon_for_Blender-release';bpy.ops.preferences.addon_enable(module=addon)
assert bpy.app.version_string.startswith('4.5.9');assert tuple(importlib.import_module(addon).bl_info['version'])==(4,10,5)

def smooth(x):
 x=max(0,min(1,x));return x*x*(3-2*x)
def bump(x):return max(0,1-x*x)**2 if abs(x)<1 else 0

def delta(p,v):
 x,y,z=p;cx=SPEC['centerX'];dx=x-cx
 if v['kind']=='jaw':
  j=v['jaw'];front=smooth((y-j['forwardStartY'])/j['forwardFade']);lower=smooth((j['upperZ']-z)/j['fadeHeight']);chin=smooth((j['chinUpperZ']-z)/j['chinFadeHeight'])*math.exp(-(dx/j['chinHalfWidth'])**2)*front
  return Vector((-dx*j['widthReduction']*lower*front,j['chinForward']*chin,-j['chinDrop']*chin))
 w,h=v['waist'],v['hip'];ww=bump((z-w['centerZ'])/w['halfHeight']);hw=bump((z-h['centerZ'])/h['halfHeight']);mask=v['lateralMask'];lateral=1-smooth((abs(dx)-mask['inner'])/(mask['outer']-mask['inner']));dc=v['depthCenter'];cy=dc['lowY']+(dc['highY']-dc['lowY'])*smooth((z-dc['lowZ'])/(dc['highZ']-dc['lowZ']))
 return Vector((dx*(w['widthIncrease']*ww+h['widthIncrease']*hw)*lateral,(y-cy)*(w['depthIncrease']*ww+h['depthIncrease']*hw)*lateral,0))

def numeric_hash(values):
 h=hashlib.sha256()
 for n in values:h.update(struct.pack('<d',float(n)))
 return h.hexdigest()
def snapshot(o):
 m=o.data
 return {'polygons':numeric_hash(i for p in m.polygons for i in [p.material_index,*p.vertices]),'uv':numeric_hash(v for uv in m.uv_layers for p in uv.data for v in p.uv),'weights':numeric_hash(v for p in m.vertices for g in p.groups for v in [g.group,g.weight]),'matrix':numeric_hash(v for row in o.matrix_world for v in row),'counts':[len(m.vertices),len(m.polygons)]}
def skeleton_hash(rig):return numeric_hash(v for b in rig.data.bones for row in b.matrix_local for v in row)
def sections(o,coords):
 ids={i for p in o.data.polygons if 'Body_00_SKIN' in o.data.materials[p.material_index].name for i in p.vertices};result=[]
 for z in [.80,.88,.90,1.0,1.05,1.10,1.18]:
  pts=[coords[i] for i in ids if abs(coords[i].z-z)<.012]
  if pts:
   lo=[min(p[k] for p in pts) for k in range(3)];hi=[max(p[k] for p in pts) for k in range(3)];result.append({'sampleZ':z,'vertices':len(pts),'width':hi[0]-lo[0],'depth':hi[1]-lo[1],'bounds':[lo,hi]})
 return result
reports=[]
for variant in SPEC['variants']:
 bpy.ops.wm.open_mainfile(filepath=str(source));rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');bonehash=skeleton_hash(rig)
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];before={o.name:snapshot(o) for o in meshes};details=[]
 for o in meshes:
  modify=(variant['kind']=='jaw' and o.name=='Face') or (variant['kind']=='waisthip' and o.name=='Body')
  base=o.data.shape_keys.key_blocks[0] if o.data.shape_keys else None;original=[p.co.copy() for p in (base.data if base else o.data.vertices)];deltas=[delta(p,variant) if modify else Vector((0,0,0)) for p in original]
  keyerror=0
  if base:
   originals={k.name:[p.co.copy() for p in k.data] for k in o.data.shape_keys.key_blocks}
   for key in o.data.shape_keys.key_blocks:
    for i,p in enumerate(key.data):p.co=originals[key.name][i]+deltas[i]
   for key in o.data.shape_keys.key_blocks:
    for i,p in enumerate(key.data):keyerror=max(keyerror,((p.co-base.data[i].co)-(originals[key.name][i]-original[i])).length)
  else:
   for i,p in enumerate(o.data.vertices):p.co=original[i]+deltas[i]
  o.data.update();assert snapshot(o)==before[o.name],'Topology/UV/weights/object matrix changed'
  assert keyerror<3e-7,'Expression deltas changed beyond float storage tolerance'
  actual=[p.co.copy() for p in (base.data if base else o.data.vertices)]
  details.append({'mesh':o.name,'changedVertices':sum(d.length>1e-9 for d in deltas),'maxDisplacement':max(d.length for d in deltas),'shapeKeys':len(o.data.shape_keys.key_blocks) if base else 0,'maxShapeDeltaError':keyerror,'invariants':before[o.name],'bodySectionsBefore':sections(o,original) if o.name=='Body' else [],'bodySectionsAfter':sections(o,actual) if o.name=='Body' else []})
 assert skeleton_hash(rig)==bonehash
 rig.data.vrm_addon_extension.vrm0.meta.title=variant['title']
 bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
 folder=ROOT/'assets-source/m1-variants'/variant['id'];folder.mkdir(parents=True,exist_ok=True)
 blend=folder/'editable.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
 out=ROOT/'prototype/public/assets/m1-variants'/variant['id'];out.mkdir(parents=True,exist_ok=True);vrm=out/'avatar.vrm'
 hashes=[]
 for repeat in range(2):
  bpy.ops.wm.open_mainfile(filepath=str(blend));rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');assert skeleton_hash(rig)==bonehash
  target=vrm if repeat==0 else ROOT/'output'/f'{variant["id"]}-repeat.vrm';target.parent.mkdir(parents=True,exist_ok=True)
  assert bpy.ops.export_scene.vrm(filepath=str(target),armature_object_name=rig.name,export_invisibles=True,ignore_warning=True)=={'FINISHED'};hashes.append(sha(target))
 assert hashes[0]==hashes[1],'Saved .blend repeated export differs'
 report={'id':variant['id'],'kind':variant['kind'],'parameters':variant,'sourceBlend':SPEC['sourceBlend'],'sourceBlendSha256':SPEC['sourceBlendSha256'],'sourceVRMSha256':SPEC['sourceVRMSha256'],'editableBlend':str(blend.relative_to(ROOT)).replace('\\','/'),'editableBlendSha256':sha(blend),'url':'/assets/m1-variants/'+variant['id']+'/avatar.vrm','vrmSha256':hashes[0],'repeatExportSha256':hashes[1],'vrmBytes':vrm.stat().st_size,'skeletonRestHash':bonehash,'blender':bpy.app.version_string,'addonVersion':list(importlib.import_module(addon).bl_info['version']),'meshes':details,'limits':SPEC['limits']}
 (folder/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');reports.append(report)
 assert sha(source)==SPEC['sourceBlendSha256']
print('LOCAL_VARIANTS',json.dumps([{'id':r['id'],'sha256':r['vrmSha256'],'meshes':[{k:m[k] for k in ['mesh','changedVertices','maxDisplacement','shapeKeys','maxShapeDeltaError']}for m in r['meshes']]}for r in reports]))
(ROOT/'assets-source/m1-variants/build-report.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf8')

