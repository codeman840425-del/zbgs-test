"""One discrete male jaw source specimen. Never writes runtime/public or original source.
Blender4.5.9 + VRM addon4.10.5; -- --rebuild recreates from preserved original.
"""
import bpy,pathlib,json,hashlib,sys,importlib,math,struct,gzip
from mathutils import Vector,kdtree
ROOT=pathlib.Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-male-face-v1';SPEC=json.loads((BASE/'spec.json').read_text());rebuild='--rebuild'in sys.argv;OUT=BASE/('rebuild'if rebuild else'generated');OUT.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=ROOT/SPEC['sourceBlend'];assert sha(source)==SPEC['sourceBlendSha256'];assert sha(ROOT/SPEC['sourceVRM'])==SPEC['sourceVRMSha256'];assert not(OUT/'avatar.vrm').exists(),'Refuse overwrite independent source candidate'
sys.path.insert(0,str(ROOT/'experiments/tools/vrm-addon'));addon='VRM_Addon_for_Blender-release';bpy.ops.preferences.addon_enable(module=addon);assert bpy.app.version_string.startswith('4.5.9');assert tuple(importlib.import_module(addon).bl_info['version'])==(4,10,5)
bpy.ops.wm.open_mainfile(filepath=str(source));rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');face=bpy.data.objects['Face'];body=bpy.data.objects['Body'];meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert len(face.data.shape_keys.key_blocks)==55

def nh(values):
 h=hashlib.sha256()
 for v in values:h.update(struct.pack('<d',float(v)))
 return h.hexdigest()
def invariant(o):
 m=o.data
 return {'polygons':nh(v for f in m.polygons for v in[f.material_index,*f.vertices]),'uv':nh(v for uv in m.uv_layers for p in uv.data for v in p.uv),'weights':nh(v for p in m.vertices for g in p.groups for v in[g.group,g.weight]),'objectMatrix':nh(v for row in o.matrix_world for v in row),'counts':[len(m.vertices),len(m.polygons)]}
def skeleton():return nh(v for b in rig.data.bones for row in b.matrix_local for v in row)
before={o.name:invariant(o)for o in meshes};bonehash=skeleton();bodypos=nh(v for p in body.data.vertices for v in p.co)
base=face.data.shape_keys.key_blocks[0];original=[v.co.copy()for v in base.data];skinids={v for f in face.data.polygons if face.data.materials[f.material_index].name==SPEC['skinMaterial']for v in f.vertices};skinbody={v for f in body.data.polygons if'Body_00_SKIN'in body.data.materials[f.material_index].name for v in f.vertices};tree=kdtree.KDTree(len(skinbody))
for i in skinbody:tree.insert(body.matrix_world@body.data.vertices[i].co,i)
tree.balance();seam={i for i in skinids if tree.find(face.matrix_world@original[i])[2]<=SPEC['neckSeam']['matchDistanceM']};protected=set(seam)
for _ in range(SPEC['neckSeam']['protectAdjacencyRings']):
 protected|={v for f in face.data.polygons if set(f.vertices)&protected for v in f.vertices}
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def delta(p,i):
 if i not in skinids or i in protected:return Vector((0,0,0))
 x,y,z=p;dx=x-SPEC['centerX'];j=SPEC['jaw'];m=SPEC['mouthProtection'];front=smooth((y-j['forwardStartY'])/j['forwardFade']);lower=smooth((j['upperZ']-z)/j['fadeHeight']);lateral=smooth((j['lateralZero']-abs(dx))/(j['lateralZero']-j['lateralFull']))
 mouth=(1-smooth((abs(dx)-m['innerX'])/(m['outerX']-m['innerX'])))*smooth((z-m['bottomZ'])/m['heightFade'])*smooth((m['topZ']-z)/m['heightFade'])*smooth((y-m['startY'])/m['depthFade']);mask=(1-mouth)*front*lateral;chin=smooth((j['chinUpperZ']-z)/j['chinFadeHeight'])*math.exp(-(dx/j['chinHalfWidth'])**2)
 return Vector((dx*j['widthIncrease']*lower*mask,j['chinForward']*chin*mask,-j['chinDrop']*chin*mask))
deltas=[delta(p,i)for i,p in enumerate(original)];assert max(d.length for d in deltas)<=SPEC['maximumAllowedDisplacementM'];changed=[i for i,d in enumerate(deltas)if d.length>1e-9];assert len(changed)>20
keyerrors=[]
for key in face.data.shape_keys.key_blocks:
 old=[p.co.copy()for p in key.data]
 for i,p in enumerate(key.data):p.co=old[i]+deltas[i]
 err=max(((p.co-base.data[i].co)-(old[i]-original[i])).length for i,p in enumerate(key.data))if key!=base else 0
 keyerrors.append({'name':key.name,'maxRelativeDeltaErrorM':err});assert err<3e-7
face.data.update();assert all(invariant(o)==before[o.name]for o in meshes);assert skeleton()==bonehash;assert nh(v for p in body.data.vertices for v in p.co)==bodypos
rig.data.vrm_addon_extension.vrm0.meta.title=SPEC['title'];bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0;blend=OUT/'editable.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
hashes=[]
for name in ['avatar.vrm','repeat-export.vrm']:
 bpy.ops.wm.open_mainfile(filepath=str(blend));rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');assert skeleton()==bonehash;target=OUT/name;assert bpy.ops.export_scene.vrm(filepath=str(target),armature_object_name=rig.name,export_invisibles=True,ignore_warning=True)=={'FINISHED'};hashes.append(sha(target))
assert hashes[0]==hashes[1]
if rebuild:assert hashes[0]==json.loads((BASE/'generated/build-report.json').read_text())['avatarSha256'],'Independent original-source regeneration differs'
report={'id':SPEC['id'],'newSourceVariantNotOriginalRecovery':True,'sourceBlendSha256':sha(source),'sourceVRMSha256':SPEC['sourceVRMSha256'],'avatarSha256':hashes[0],'repeatExportSha256':hashes[1],'avatarBytes':(OUT/'avatar.vrm').stat().st_size,'editableBlendSha256':sha(blend),'independentRegenerationFromOriginal':rebuild,'toolchain':{'blender':bpy.app.version_string,'addon':[4,10,5]},'changedVertices':len(changed),'changedBounds':[[min(original[i][k]for i in changed)for k in range(3)],[max(original[i][k]for i in changed)for k in range(3)]],'maxDeltaM':max(d.length for d in deltas),'skinVertexCount':len(skinids),'seamMatchedIds':sorted(seam),'protectedAdjacencyIds':sorted(protected),'invariants':before,'skeletonRestHash':bonehash,'bodyPositionHash':bodypos,'shapeDeltaChecks':keyerrors,'limits':SPEC['limits']}
(OUT/'build-report.json').write_text(json.dumps(report,indent=2),encoding='utf8');(OUT/'source-delta.json.gz').write_bytes(gzip.compress(json.dumps({'sourcePositions':[list(p)for p in original],'delta':[list(d)for d in deltas],'changedIds':changed},separators=(',',':')).encode(),mtime=0));print('MALE_JAW',json.dumps({k:report[k]for k in['id','avatarSha256','changedVertices','maxDeltaM','independentRegenerationFromOriginal']}));assert sha(source)==SPEC['sourceBlendSha256']
