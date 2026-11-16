"""Save a genuine editable skinned source, reopen and export twice; no rendering."""
from pathlib import Path
import argparse,hashlib,json,sys
import bpy
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-layered-outer-v1'
ap=argparse.ArgumentParser();ap.add_argument('--out',default='generated');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]if '--'in sys.argv else [])
OUT=(BASE/args.out).resolve();assert OUT.is_relative_to(BASE) and OUT!=BASE
S=json.loads((BASE/'spec.json').read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=OUT/(S['id']+'.glb');before=sha(source);blend=OUT/'editable.blend';assert not blend.exists()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
assert len(meshes)==1 and len(rigs)==1 and any(m.type=='ARMATURE'for m in meshes[0].modifiers)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
hashes=[]
for name in ['author-export.glb','author-repeat-export.glb']:
 bpy.ops.wm.open_mainfile(filepath=str(blend),use_scripts=False)
 assert len([o for o in bpy.context.scene.objects if o.type=='ARMATURE'])==1
 bpy.ops.export_scene.gltf(filepath=str(OUT/name),export_format='GLB',export_yup=True,export_animations=False,export_extras=True)
 hashes.append(sha(OUT/name))
assert hashes[0]==hashes[1] and sha(source)==before
r={'blender':bpy.app.version_string,'sourcePatternSha256':before,'editableSha256':sha(blend),'authorExportSha256':hashes[0],'repeatExportSha256':hashes[1],'reopenedActualEditable':True,'skinnedMeshCount':1,'armatures':1,'runtimeAcceptance':False}
(OUT/'editable-report.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps(r))
