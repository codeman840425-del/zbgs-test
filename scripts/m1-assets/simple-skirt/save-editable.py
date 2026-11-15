"""Save/reopen only the independent generated skirt; no source body edits."""
from pathlib import Path
import bpy, hashlib, json, sys
ROOT=Path(__file__).resolve().parents[3]
assert ROOT.name=='m1-simple-skirt-worktree'
args=sys.argv[sys.argv.index('--')+1:]
folder=(ROOT/args[0]).resolve()
assert folder.is_relative_to(ROOT)
report=json.loads((folder/'build-report.json').read_text(encoding='utf-8'))
asset=folder/(report['id']+'.glb')
assert hashlib.sha256(asset.read_bytes()).hexdigest()==report['sha256']
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(asset))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'and o.name.startswith(report['id'])]
assert len(meshes)==1 and any(m.type=='ARMATURE'for m in meshes[0].modifiers)
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene['asset_sha256']=report['sha256']
bpy.context.scene['acceptance']='Editable source checkpoint only; no four-pose admission yet'
bpy.ops.file.pack_all()
path=folder/(report['id']+'.blend')
bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
bpy.ops.wm.open_mainfile(filepath=str(path))
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH'and o.name.startswith(report['id']))
data={'blender':bpy.app.version_string,'sourceGlbSha256':report['sha256'],'blendSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'vertices':len(mesh.data.vertices),'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'uvLayers':len(mesh.data.uv_layers),'vertexGroups':len(mesh.vertex_groups),'armature':any(m.type=='ARMATURE'for m in mesh.modifiers),'status':'save-and-reopen-only'}
assert data['triangles']==report['triangles'] and data['uvLayers']>0 and data['armature']
(folder/'editable-readback.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print(json.dumps(data))
