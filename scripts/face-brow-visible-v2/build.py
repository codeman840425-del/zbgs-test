"""One fixed combined brow endpoint per original sex. No public/runtime writes.
Blender --background --factory-startup --disable-autoexec --threads 2
 --python-exit-code 1 --python scripts/face-brow-visible-v2/build.py -- --out generated
"""
import bpy,json,hashlib,struct,gzip,sys,importlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-brow-visible-v2'
SPEC=json.loads((BASE/'spec.json').read_text(encoding='utf-8'))
outname=sys.argv[sys.argv.index('--out')+1] if '--out' in sys.argv else 'generated'
OUT=(BASE/outname).resolve();assert OUT.is_relative_to(BASE.resolve()) and OUT!=BASE.resolve()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert bpy.app.version_string.startswith(SPEC['toolchain']['blender'])
sys.path.insert(0,str(ROOT/'experiments/tools/vrm-addon'));addon='VRM_Addon_for_Blender-release'
bpy.ops.preferences.addon_enable(module=addon)
assert list(importlib.import_module(addon).bl_info['version'])==SPEC['toolchain']['vrmAddon']
def numeric_hash(values):
 h=hashlib.sha256()
 for v in values:h.update(struct.pack('<d',float(v)))
 return h.hexdigest()
def invariant(o):
 m=o.data
 return {'indicesMaterials':numeric_hash(x for p in m.polygons for x in [p.material_index,*p.vertices]),'uv':numeric_hash(x for uv in m.uv_layers for p in uv.data for x in p.uv),'weights':numeric_hash(x for p in m.vertices for g in p.groups for x in [g.group,g.weight]),'matrix':numeric_hash(x for row in o.matrix_world for x in row)}
def skeleton(rig):return numeric_hash(x for b in rig.data.bones for row in b.matrix_local for x in row)
reports=[]
for sex,source in SPEC['bodies'].items():
 identifier=f'{sex}-brow-height3-spacing3-v2';folder=OUT/identifier
 assert not folder.exists(),f'Refuse overwrite: {folder}'
 blend=ROOT/source['sourceBlend'];vrm=ROOT/source['sourceVRM']
 assert sha(blend)==source['sourceBlendSha256'] and sha(vrm)==source['sourceVRMSha256']
 bpy.ops.wm.open_mainfile(filepath=str(blend))
 face=bpy.data.objects['Face'];body=bpy.data.objects['Body'];rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
 assert len(face.data.shape_keys.key_blocks)==source['expectedShapeKeys']
 before={o.name:invariant(o)for o in [face,body]};bones=skeleton(rig);bodypos=numeric_hash(x for p in body.data.vertices for x in p.co)
 keys={k.name:[p.co.copy()for p in k.data]for k in face.data.shape_keys.key_blocks};basis=next(iter(keys.values()));count=len(basis)
 sets={m.name:{v for p in face.data.polygons if face.data.materials[p.material_index]==m for v in p.vertices}for m in face.data.materials}
 brow=sets[source['browMaterial']];protected=set(range(count))-brow
 assert len(brow)==110
 assert not brow.intersection(set().union(*(v for k,v in sets.items()if k!=source['browMaterial'])))
 center=(min(basis[i].x for i in brow)+max(basis[i].x for i in brow))/2
 signs=[(-1 if basis[i].x<center else 1)if i in brow else 0 for i in range(count)]
 for p in face.data.polygons:
  if face.data.materials[p.material_index].name==source['browMaterial']:assert len({signs[i]for i in p.vertices})==1
 translations=[[SPEC['candidate']['browHalfSpacingM']*signs[i],0,SPEC['candidate']['browHeightM'] if i in brow else 0]for i in range(count)]
 checks=[]
 for key in face.data.shape_keys.key_blocks:
  old=keys[key.name]
  for i,p in enumerate(key.data):
   p.co=old[i]
   if i in brow:p.co.x+=translations[i][0];p.co.z+=translations[i][2]
  nb=face.data.shape_keys.key_blocks[0].data
  residual=max(((p.co-nb[i].co)-(old[i]-basis[i])).length for i,p in enumerate(key.data))
  guard=max((key.data[i].co-old[i]).length for i in protected)
  assert residual<3e-7 and guard==0
  checks.append({'name':key.name,'maxRelativeDeltaErrorM':residual,'protectedMaxDisplacementM':guard})
 face.data.update()
 assert invariant(face)==before['Face'] and invariant(body)==before['Body'] and skeleton(rig)==bones
 assert numeric_hash(x for p in body.data.vertices for x in p.co)==bodypos
 rig.data.vrm_addon_extension.vrm0.meta.title=identifier
 folder.mkdir(parents=True);bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
 target=folder/'editable.blend';bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
 hashes=[]
 for name in ['avatar.vrm','repeat-export.vrm']:
  bpy.ops.wm.open_mainfile(filepath=str(target));rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');assert skeleton(rig)==bones
  assert bpy.ops.export_scene.vrm(filepath=str(folder/name),armature_object_name=rig.name,export_invisibles=True,ignore_warning=True)=={'FINISHED'}
  hashes.append(sha(folder/name))
 assert hashes[0]==hashes[1]
 if outname!='generated':assert json.loads((BASE/'generated'/identifier/'build-report.json').read_text(encoding='utf-8'))['avatarSha256']==hashes[0]
 mapping={'sourcePositions':[list(p)for p in basis],'sourceBrowVertices':sorted(brow),'sideSigns':signs,'translationVectors':translations,'centerX':center,'shapeKeyNames':list(keys),'protectedVertices':sorted(protected)}
 (folder/'mapping.json.gz').write_bytes(gzip.compress(json.dumps(mapping,separators=(',',':')).encode(),mtime=0))
 report={'id':identifier,'sex':sex,'source':source,'candidate':SPEC['candidate'],'avatarSha256':hashes[0],'repeatExportSha256':hashes[1],'editableBlendSha256':sha(target),'generatorSha256':sha(Path(__file__)),'specSha256':sha(BASE/'spec.json'),'mappingSha256':sha(folder/'mapping.json.gz'),'toolchain':SPEC['toolchain'],'invariants':before,'skeletonRestHash':bones,'bodyPositionsHash':bodypos,'browSourceVertices':len(brow),'sourceVertexCount':count,'centerX':center,'shapeChecks':checks,'status':'Source candidate only. No runtime, clearance or appearance acceptance is implied by export.'}
 (folder/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');reports.append(report)
 assert sha(blend)==source['sourceBlendSha256'] and sha(vrm)==source['sourceVRMSha256']
 print('BROW_SOURCE',identifier,hashes[0],flush=True)
(OUT/'build-report.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf-8')
