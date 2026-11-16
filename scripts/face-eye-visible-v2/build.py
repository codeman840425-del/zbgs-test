"""One fixed eye-aperture sample per original source; no public/runtime writes."""
import bpy,json,hashlib,struct,gzip,sys,importlib
from pathlib import Path
from mathutils import Vector,kdtree
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-eye-visible-v2'
SPEC=json.loads((BASE/'spec.json').read_text(encoding='utf-8'));SELECTION=json.loads((BASE/'selection.json').read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(BASE/'selection.json')==SPEC['selectionSha256']and sha(ROOT/SPEC['readOnlyStudyPath'])==SPEC['readOnlyStudySha256']
outname=sys.argv[sys.argv.index('--out')+1]if '--out'in sys.argv else 'generated';OUT=(BASE/outname).resolve();assert OUT.is_relative_to(BASE.resolve())and OUT!=BASE.resolve()
assert bpy.app.version_string.startswith(SPEC['toolchain']['blender']);sys.path.insert(0,str(ROOT/'experiments/tools/vrm-addon'));addon='VRM_Addon_for_Blender-release';bpy.ops.preferences.addon_enable(module=addon);assert list(importlib.import_module(addon).bl_info['version'])==SPEC['toolchain']['vrmAddon']
def numeric_hash(values):
 h=hashlib.sha256()
 for v in values:h.update(struct.pack('<d',float(v)))
 return h.hexdigest()
def invariant(o):
 m=o.data;return {'indicesMaterials':numeric_hash(x for p in m.polygons for x in [p.material_index,*p.vertices]),'uv':numeric_hash(x for uv in m.uv_layers for p in uv.data for x in p.uv),'weights':numeric_hash(x for p in m.vertices for g in p.groups for x in [g.group,g.weight]),'matrix':numeric_hash(x for row in o.matrix_world for x in row)}
def skeleton(rig):return numeric_hash(x for b in rig.data.bones for row in b.matrix_local for x in row)
reports=[]
for sex,source in SPEC['bodies'].items():
 identifier=f'{sex}-eye-{SPEC["sampleId"]}';folder=OUT/identifier;assert not folder.exists(),f'Refuse overwrite: {folder}';blend=ROOT/source['sourceBlend'];vrm=ROOT/source['sourceVRM'];assert sha(blend)==source['sourceBlendSha256']and sha(vrm)==source['sourceVRMSha256'];selection=SELECTION['bodies'][sex]
 bpy.ops.wm.open_mainfile(filepath=str(blend));face=bpy.data.objects['Face'];body=bpy.data.objects['Body'];rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');assert len(face.data.shape_keys.key_blocks)==source['expectedShapeKeys']
 before={o.name:invariant(o)for o in [face,body]};bones=skeleton(rig);bodypos=numeric_hash(x for p in body.data.vertices for x in p.co);keys={k.name:[p.co.copy()for p in k.data]for k in face.data.shape_keys.key_blocks};basis=next(iter(keys.values()));count=len(basis)
 scale=[1.]*count;center=[0.]*count;assigned=set();sourceByExport=[set()for _ in selection['sourcePosition']];maximumMappingError=0.
 materialSets={m.name:{v for p in face.data.polygons if face.data.materials[p.material_index]==m for v in p.vertices}for m in face.data.materials}
 # Material-aware mapping handles coincident Skin/White seam duplicates. Every
 # source vertex is evaluated, not just one arbitrary nearest export->source ID.
 for material,sourceIDs in materialSets.items():
  exportIDs=selection['layerVertexIDs'][material];tree=kdtree.KDTree(len(exportIDs))
  for i in exportIDs:
   x,y,z=selection['sourcePosition'][i];tree.insert(Vector((x,-z,y)),i)
  tree.balance()
  for i in sourceIDs:
   matches=tree.find_range(basis[i],1e-6);assert matches,(sex,material,i)
   choices=[j for point,j,distance in matches];coeffs={(selection['xScale'][j],selection['centerX'][j])for j in choices};assert len(coeffs)==1,(sex,material,i,coeffs);a,c=next(iter(coeffs));maximumMappingError=max(maximumMappingError,min(d for p,j,d in matches))
   if i in assigned:assert scale[i]==a and center[i]==c
   scale[i]=a;center[i]=c;assigned.add(i)
   for j in choices:sourceByExport[j].add(i)
 assert all(sourceByExport);selected={i for i,a in enumerate(scale)if a!=1};protected=set(range(count))-selected
 for name,ids in materialSets.items():
  if any(s in name for s in ['EyeIris','EyeHighlight','EyeExtra','FaceBrow','FaceMouth']):assert not selected.intersection(ids)
 checks=[]
 for key in face.data.shape_keys.key_blocks:
  old=keys[key.name]
  for i,p in enumerate(key.data):
   p.co=old[i]
   if scale[i]!=1:p.co.x=center[i]+(old[i].x-center[i])*scale[i]
  nb=face.data.shape_keys.key_blocks[0].data;residual=0.
  for i,p in enumerate(key.data):
   delta=old[i]-basis[i];delta.x*=scale[i];residual=max(residual,((p.co-nb[i].co)-delta).length)
  guard=max((key.data[i].co-old[i]).length for i in protected);assert residual<3e-7 and guard==0
  checks.append({'name':key.name,'relativeAffineDeltaErrorM':residual,'protectedMaxDisplacementM':guard})
 face.data.update();assert invariant(face)==before['Face']and invariant(body)==before['Body']and skeleton(rig)==bones;assert numeric_hash(x for p in body.data.vertices for x in p.co)==bodypos
 rig.data.vrm_addon_extension.vrm0.meta.title=identifier;folder.mkdir(parents=True);bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0;target=folder/'editable.blend';bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
 hashes=[]
 for filename in ['addon-export.vrm','addon-repeat-export.vrm']:
  bpy.ops.wm.open_mainfile(filepath=str(target));rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');assert skeleton(rig)==bones;assert bpy.ops.export_scene.vrm(filepath=str(folder/filename),armature_object_name=rig.name,export_invisibles=True,ignore_warning=True)=={'FINISHED'};hashes.append(sha(folder/filename))
 assert hashes[0]==hashes[1]
 if outname!='generated':assert json.loads((BASE/'generated'/identifier/'build-report.json').read_text(encoding='utf-8'))['addonExportSha256']==hashes[0]
 mapping={'sourcePositions':[list(v)for v in basis],'xScale':scale,'centerX':center,'selectedSourceVertices':sorted(selected),'protectedSourceVertices':sorted(protected),'sourceVertexMap':[min(v)for v in sourceByExport],'sourceVertexCandidates':[sorted(v)for v in sourceByExport],'maximumSourceMappingErrorM':maximumMappingError,'shapeKeyNames':list(keys),'rule':'Material-aware position matching; all coincident choices have identical affine coefficients. Unedited scale=1, center=0.'}
 (folder/'mapping.json.gz').write_bytes(gzip.compress(json.dumps(mapping,separators=(',',':')).encode(),mtime=0))
 report={'id':identifier,'sex':sex,'source':source,'factor':1.05,'selectedSourceVertices':len(selected),'addonExportSha256':hashes[0],'addonRepeatExportSha256':hashes[1],'editableBlendSha256':sha(target),'generatorSha256':sha(Path(__file__)),'specSha256':sha(BASE/'spec.json'),'mappingSha256':sha(folder/'mapping.json.gz'),'toolchain':SPEC['toolchain'],'invariants':before,'bodyPositionsHash':bodypos,'skeletonRestHash':bones,'shapeChecks':checks,'normalStatus':'Native raw retained. Per-absolute-shape final NORMAL step required.','status':'Source candidate only; no closure/gaze/render pass inferred.'};(folder/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');reports.append(report)
 assert sha(blend)==source['sourceBlendSha256']and sha(vrm)==source['sourceVRMSha256'];print('EYE_SOURCE',identifier,hashes[0],flush=True)
(OUT/'build-report.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf-8')
