"""Fixed nose endpoint from original blend; no public/src writes. See spec for normal finalization."""
import bpy,json,hashlib,struct,gzip,sys,importlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-nose-parameters-v1'
SPEC=json.loads((BASE/'spec.json').read_text());MEASURE=json.loads((BASE/'measurements.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(BASE/'measurements.json')==SPEC['measurementSha256']
outname=sys.argv[sys.argv.index('--out')+1] if '--out'in sys.argv else 'generated';OUT=(BASE/outname).resolve()
assert OUT.is_relative_to(BASE.resolve())and OUT!=BASE.resolve()
assert bpy.app.version_string.startswith(SPEC['toolchain']['blender'])
sys.path.insert(0,str(ROOT/'experiments/tools/vrm-addon'));addon='VRM_Addon_for_Blender-release';bpy.ops.preferences.addon_enable(module=addon)
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
 identifier=f'{sex}-nose-{SPEC["sampleId"]}';folder=OUT/identifier;assert not folder.exists(),f'Refuse overwrite: {folder}'
 blend=ROOT/source['sourceBlend'];vrm=ROOT/source['sourceVRM'];assert sha(blend)==source['sourceBlendSha256']and sha(vrm)==source['sourceVRMSha256']
 mapfile=ROOT/source['sourceMapRecipe'];assert sha(mapfile)==source['sourceMapRecipeSha256'];sourceMap=json.loads(mapfile.read_text())['sourceVertexMap'];measure=MEASURE['bodies'][sex]
 bpy.ops.wm.open_mainfile(filepath=str(blend));face=bpy.data.objects['Face'];body=bpy.data.objects['Body'];rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
 assert len(face.data.shape_keys.key_blocks)==source['expectedShapeKeys'];before={o.name:invariant(o)for o in [face,body]};bones=skeleton(rig);bodypos=numeric_hash(x for p in body.data.vertices for x in p.co)
 keys={k.name:[p.co.copy()for p in k.data]for k in face.data.shape_keys.key_blocks};basis=next(iter(keys.values()));weights=[0.]*len(basis)
 for i,w in zip(measure['supportVertices'],measure['supportWeights']):weights[sourceMap[i]]=w
 changed={i for i,w in enumerate(weights)if w>0};assert len(changed)==source['expectedMovedVertices'];protected=set(range(len(basis)))-changed
 skin={v for p in face.data.polygons if face.data.materials[p.material_index].name==source['skinMaterial']for v in p.vertices};assert changed<=skin
 for name,lm in measure['landmarks'].items():
  assert (basis[lm['sourceBlendVertex']]-__import__('mathutils').Vector(lm['blenderLocalM'])).length<1e-6
  if name not in ['T_tip','U_tipUpper']:assert weights[lm['sourceBlendVertex']]==0
 for i in measure['mouthSeamVertices']+measure['neckSeamVertices']+[i for c in measure['boundaryComponents']for i in c['vertices']]:assert weights[sourceMap[i]]==0
 shapechecks=[]
 for key in face.data.shape_keys.key_blocks:
  old=keys[key.name]
  for i,p in enumerate(key.data):
   p.co=old[i]
   if weights[i]:p.co.y+=SPEC['endpoint']*weights[i]
  nb=face.data.shape_keys.key_blocks[0].data;residual=max(((p.co-nb[i].co)-(old[i]-basis[i])).length for i,p in enumerate(key.data));guard=max((key.data[i].co-old[i]).length for i in protected)
  assert residual<3e-7 and guard==0
  shapechecks.append({'name':key.name,'relativeDeltaErrorM':residual,'protectedMaxDisplacementM':guard})
 face.data.update();assert invariant(face)==before['Face']and invariant(body)==before['Body']and skeleton(rig)==bones
 assert numeric_hash(x for p in body.data.vertices for x in p.co)==bodypos
 rig.data.vrm_addon_extension.vrm0.meta.title=identifier;folder.mkdir(parents=True);bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
 target=folder/'editable.blend';bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
 hashes=[]
 for name in ['addon-export.vrm','addon-repeat-export.vrm']:
  bpy.ops.wm.open_mainfile(filepath=str(target));rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');assert skeleton(rig)==bones
  assert bpy.ops.export_scene.vrm(filepath=str(folder/name),armature_object_name=rig.name,export_invisibles=True,ignore_warning=True)=={'FINISHED'};hashes.append(sha(folder/name))
 assert hashes[0]==hashes[1]
 if outname!='generated':assert json.loads((BASE/'generated'/identifier/'build-report.json').read_text())['addonExportSha256']==hashes[0]
 mapping={'sourcePositions':[list(p)for p in basis],'weights':weights,'changedSourceVertices':sorted(changed),'protectedSourceVertices':sorted(protected),'sourceVertexMap':sourceMap,'shapeKeyNames':list(keys),'coordinateSystem':'Blender original Face local metres; +Y forward; fixed per-Basis weights on all absolute shapes.'}
 (folder/'mapping.json.gz').write_bytes(gzip.compress(json.dumps(mapping,separators=(',',':')).encode(),mtime=0))
 report={'id':identifier,'sex':sex,'source':source,'endpointM':SPEC['endpoint'],'movedSourceVertices':len(changed),'addonExportSha256':hashes[0],'addonRepeatExportSha256':hashes[1],'editableBlendSha256':sha(target),'generatorSha256':sha(Path(__file__)),'specSha256':sha(BASE/'spec.json'),'mappingSha256':sha(folder/'mapping.json.gz'),'toolchain':SPEC['toolchain'],'invariants':before,'bodyPositionsHash':bodypos,'skeletonRestHash':bones,'shapeChecks':shapechecks,'normalStatus':'Native addon export retained; final deterministic per-shape normal step is required before final avatar.vrm exists.','status':'Source only; no game acceptance.'}
 (folder/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');reports.append(report)
 assert sha(blend)==source['sourceBlendSha256']and sha(vrm)==source['sourceVRMSha256'];print('NOSE_SOURCE',identifier,hashes[0],flush=True)
(OUT/'build-report.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf-8')
