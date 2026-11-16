# Isolated male -12% author rebuild; original geometry algorithm unchanged.
# Adapted from mouth-visible-v2/build.py SHA256 2e6382b1d787035ef8605d65b567b9f150d1f92f7f4e5e33f838c6cdf5410a2f.
"""Four visible mouth-width source candidates; fixed interior protection. No public/runtime writes.
Blender --background --factory-startup --disable-autoexec --threads 2
 --python-exit-code 1 --python scripts/mouth-visible-v2/build.py -- --out generated
Re-run from original with --out rebuild; exact VRM hashes must match generated.
"""
import bpy,json,hashlib,struct,heapq,gzip,sys,importlib
from pathlib import Path
from mathutils import kdtree
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/mouth-visible-v2'
SPEC=json.loads((BASE/'spec.json').read_text(encoding='utf-8'))
SPEC['bodies']={'male':SPEC['bodies']['male']}
SPEC['factors']=[.88]
outname=sys.argv[sys.argv.index('--out')+1] if '--out' in sys.argv else 'author-rebuild'
OUTPUT_BASE=ROOT/'assets-source/mouth-quantization-v1'
OUT=(OUTPUT_BASE/outname).resolve()
assert OUT.is_relative_to(OUTPUT_BASE.resolve()) and OUT!=OUTPUT_BASE.resolve()
assert not OUT.exists(),'Refuse overwrite isolated raw export directory'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert bpy.app.version_string.startswith(SPEC['toolchain']['blender'])
sys.path.insert(0,str(ROOT/'experiments/tools/vrm-addon'))
addon='VRM_Addon_for_Blender-release'
bpy.ops.preferences.addon_enable(module=addon)
assert list(importlib.import_module(addon).bl_info['version'])==SPEC['toolchain']['vrmAddon']

def numeric_hash(values):
 h=hashlib.sha256()
 for v in values:h.update(struct.pack('<d',float(v)))
 return h.hexdigest()

def invariant(o):
 m=o.data
 return {'indicesMaterials':numeric_hash(x for p in m.polygons for x in [p.material_index,*p.vertices]),
  'uv':numeric_hash(x for uv in m.uv_layers for p in uv.data for x in p.uv),
  'weights':numeric_hash(x for p in m.vertices for g in p.groups for x in [g.group,g.weight]),
  'matrix':numeric_hash(x for row in o.matrix_world for x in row)}

def skeleton(rig):return numeric_hash(x for b in rig.data.bones for row in b.matrix_local for x in row)
def smooth(x):return x*x*(3-2*x)

reports=[]
for sex,source in SPEC['bodies'].items():
 for factor in SPEC['factors']:
  identifier=f'{sex}-mouth-width-{round(factor*100)}-v2'
  folder=OUT/identifier
  assert not folder.exists(),f'Refuse overwrite: {folder}'
  folder.mkdir(parents=True)
  blend=ROOT/source['sourceBlend'];original_vrm=ROOT/source['sourceVRM']
  assert sha(blend)==source['sourceBlendSha256'] and sha(original_vrm)==source['sourceVRMSha256']
  bpy.ops.wm.open_mainfile(filepath=str(blend))
  face=bpy.data.objects['Face'];body=bpy.data.objects['Body']
  rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
  assert len(face.data.shape_keys.key_blocks)==source['expectedShapeKeys']
  before={o.name:invariant(o)for o in [face,body]};bones=skeleton(rig)
  body_positions=numeric_hash(x for p in body.data.vertices for x in p.co)
  keys={k.name:[p.co.copy()for p in k.data]for k in face.data.shape_keys.key_blocks}
  basis=next(iter(keys.values()));count=len(basis)
  sets={m.name:{v for p in face.data.polygons if face.data.materials[p.material_index]==m for v in p.vertices}for m in face.data.materials}
  skin=sets[source['skinMaterial']];mouth=sets[source['mouthMaterial']]
  # Separate material seam vertices may be duplicated; pair actual positions.
  mouth_tree=kdtree.KDTree(len(mouth))
  for i in mouth:mouth_tree.insert(basis[i],i)
  mouth_tree.balance()
  seam_pairs=[(i,mouth_tree.find(basis[i])[1])for i in skin if mouth_tree.find(basis[i])[2]<1e-7]
  ring={a for a,b in seam_pairs}
  assert len(ring)==32 and len({b for a,b in seam_pairs})==32,('Unexpected source mouth seam',sex,len(ring))
  cx=(min(basis[i].x for i in ring)+max(basis[i].x for i in ring))/2
  adjacency={i:{}for i in skin}
  for p in face.data.polygons:
   if face.data.materials[p.material_index].name!=source['skinMaterial']:continue
   vs=list(p.vertices)
   for a,b in zip(vs,vs[1:]+vs[:1]):
    length=(basis[a]-basis[b]).length
    adjacency[a][b]=length;adjacency[b][a]=length
  dist={i:0. for i in ring};queue=[(0.,i)for i in ring];heapq.heapify(queue)
  while queue:
   d,i=heapq.heappop(queue)
   if d!=dist[i]:continue
   for j,length in adjacency[i].items():
    n=d+length
    if n<SPEC['transitionGeodesicM'] and n<dist.get(j,float('inf')):
     dist[j]=n;heapq.heappush(queue,(n,j))
  weights=[0.]*count
  for i,d in dist.items():weights[i]=1-smooth(d/SPEC['transitionGeodesicM'])
  # Only mouth surface components incident to the actual material seam move.
  # Disconnected oral pieces (including teeth/tongue/gums) remain unchanged.
  mouth_adj={i:set()for i in mouth}
  for poly in face.data.polygons:
   if face.data.materials[poly.material_index].name!=source['mouthMaterial']:continue
   for a in poly.vertices:mouth_adj[a].update(b for b in poly.vertices if b!=a)
  oral_wall={b for a,b in seam_pairs};stack=list(oral_wall)
  while stack:
   i=stack.pop()
   for j in mouth_adj[i]:
    if j not in oral_wall:oral_wall.add(j);stack.append(j)
  protected_oral=mouth-oral_wall
  for i in oral_wall:weights[i]=1.
  assert oral_wall and protected_oral and all(weights[i]==0 for i in protected_oral)

  # No eye/brow/lash/other material may be moved by this mouth-only operator.
  protected=set().union(*(v for k,v in sets.items()if k not in [source['skinMaterial'],source['mouthMaterial']]))|protected_oral
  assert all(weights[i]==0 for i in protected)
  body_skin={v for p in body.data.polygons if 'Body_00_SKIN' in body.data.materials[p.material_index].name for v in p.vertices}
  tree=kdtree.KDTree(len(body_skin))
  for i in body_skin:tree.insert(body.matrix_world@body.data.vertices[i].co,i)
  tree.balance()
  neck={i for i in skin if tree.find(face.matrix_world@basis[i])[2]<=.0001}
  assert all(weights[i]==0 for i in neck)
  scales=[1+(factor-1)*w for w in weights]
  keychecks=[]
  for key in face.data.shape_keys.key_blocks:
   old=keys[key.name]
   for i,p in enumerate(key.data):
    p.co=old[i];p.co.x=cx+(old[i].x-cx)*scales[i]
   # Fixed affine coefficients transform deltas as well as Basis. No pose-selected mask.
   newbasis=face.data.shape_keys.key_blocks[0].data
   residual=0.;protected_error=0.;maximum=0.
   for i,p in enumerate(key.data):
    expected=old[i]-basis[i];expected.x*=scales[i]
    residual=max(residual,((p.co-newbasis[i].co)-expected).length)
    maximum=max(maximum,(p.co-old[i]).length)
    if weights[i]==0:protected_error=max(protected_error,(p.co-old[i]).length)
   assert residual<3e-7 and protected_error<1e-8,(key.name,residual,protected_error)
   keychecks.append({'name':key.name,'maxAffineDeltaResidualM':residual,'protectedMaxDisplacementM':protected_error,'maxDisplacementM':maximum})
  face.data.update()
  assert invariant(face)==before['Face'] and invariant(body)==before['Body']
  assert skeleton(rig)==bones and numeric_hash(x for p in body.data.vertices for x in p.co)==body_positions
  # Preserve IDs and origin/source metadata; title identifies the new candidate.
  rig.data.vrm_addon_extension.vrm0.meta.title=identifier
  bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
  target_blend=folder/'editable.blend'
  bpy.ops.wm.save_as_mainfile(filepath=str(target_blend),compress=True)
  exports=[]
  for name in ['addon-export.vrm','addon-repeat-export.vrm']:
   bpy.ops.wm.open_mainfile(filepath=str(target_blend))
   rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
   assert skeleton(rig)==bones
   assert bpy.ops.export_scene.vrm(filepath=str(folder/name),armature_object_name=rig.name,export_invisibles=True,ignore_warning=True)=={'FINISHED'}
   exports.append(sha(folder/name))
  assert exports[0]==exports[1]
  if outname!='generated':
   original=json.loads((BASE/'generated'/identifier/'build-report.json').read_text(encoding='utf-8'))
   assert original['rawAvatarSha256']==exports[0],('Independent regeneration differs',identifier)
  mapping={'sourceCoordinateSpace':SPEC['sourceSpace'],'sourcePositions':[list(p)for p in basis],'sourceVertexWeights':weights,'xScale':scales,'centerX':cx,'mouthVertices':sorted(mouth),'oralWallVertices':sorted(oral_wall),'protectedOralVertices':sorted(protected_oral),'mouthSeamVertices':sorted(ring),'mouthSeamPairs':seam_pairs,'skinTransitionVertices':sorted(set(dist)-mouth),'protectedMaterialVertices':sorted(protected),'protectedNeckVertices':sorted(neck),'shapeKeyNames':list(keys)}
  (folder/'mapping.json.gz').write_bytes(gzip.compress(json.dumps(mapping,separators=(',',':')).encode(),mtime=0))
  report={'id':identifier,'sex':sex,'factor':factor,'source':source,'rawAvatarSha256':exports[0],'rawRepeatExportSha256':exports[1],'avatarBytes':(folder/'addon-export.vrm').stat().st_size,'editableBlendSha256':sha(target_blend),'mappingSha256':sha(folder/'mapping.json.gz'),'toolchain':SPEC['toolchain'],'generatorSha256':sha(Path(__file__)),'specSha256':sha(BASE/'spec.json'),'bodyPositionHash':body_positions,'skeletonRestHash':bones,'invariants':before,'sourceFaceVertices':count,'sourceMouthSeamVertices':len(ring),'sourceMouthVertices':len(mouth),'changedBasisVertices':sum(abs((basis[i].x-cx)*(scales[i]-1))>1e-9 for i in range(count)),'shapeChecks':keychecks,'runtimeStatus':'Source-only, no game/visual acceptance, no inherited prop/gear/animation fit'}
  (folder/'build-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
  reports.append(report)
  assert sha(blend)==source['sourceBlendSha256'] and sha(original_vrm)==source['sourceVRMSha256']
  print('FACE_PARAMETER',identifier,exports[0],flush=True)
(OUT/'build-report.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')

