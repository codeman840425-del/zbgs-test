"""CPU export of the retained editable hair; no rendering or source writes."""
from pathlib import Path
import argparse,sys,json,hashlib,time
import bpy
from mathutils import Matrix
ROOT=Path(__file__).resolve().parents[2]
PACKAGE=ROOT/'assets-source/m2-male-jaw-hair-fit-v1'
ap=argparse.ArgumentParser();ap.add_argument('--out',default='editable-export.glb');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--'in sys.argv else [])
out=(PACKAGE/args.out).resolve();assert out.is_relative_to(PACKAGE.resolve()) and out.suffix=='.glb'
pins=json.loads((PACKAGE/'source-pins.json').read_text(encoding='utf8'))
pin=next(x for x in pins['files']if x['path'].endswith('/editable.blend'))
assert hashlib.sha256((PACKAGE/'editable.blend').read_bytes()).hexdigest()==pin['sha256']
t=time.perf_counter();bpy.ops.wm.open_mainfile(filepath=str(PACKAGE/'editable.blend'),use_scripts=False)
o=bpy.data.objects['Hair_candidate'];assert o.type=='MESH'
o.hide_set(False);o.hide_render=False;bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
o.matrix_world=Matrix.Identity(4)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
report={'blender':bpy.app.version_string,'threadsRequested':2,'rendered':False,'seconds':time.perf_counter()-t,'output':out.name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'editableUnchanged':hashlib.sha256((PACKAGE/'editable.blend').read_bytes()).hexdigest()==pin['sha256']}
ev=ROOT/'evidence/m2-male-jaw-hair-fit-v1';ev.mkdir(exist_ok=True,parents=True)
(ev/(out.stem+'-receipt.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report))
