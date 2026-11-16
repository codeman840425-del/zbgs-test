"""Save editable skin/rig, optionally edit an earlier source, reopen and export."""
from pathlib import Path
import argparse
import hashlib
import json
import sys
import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-onepiece-v1'
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
parser.add_argument('--edit-from')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
output = (BASE / args.out).resolve()
assert output.is_relative_to(BASE) and output != BASE
spec = json.loads((output / 'source-spec.json').read_text(encoding='utf-8'))
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
blend = output / 'editable.blend'
assert not blend.exists()
delta = 0.
if args.edit_from:
    previous = (BASE / args.edit_from).resolve()
    assert previous.is_relative_to(BASE)
    bpy.ops.wm.open_mainfile(filepath=str(previous / 'editable.blend'), use_scripts=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(output / (spec['id'] + '.glb')))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.name.startswith(spec['id'])]
assert len(meshes) == 1 and any(mod.type == 'ARMATURE' for mod in meshes[0].modifiers)
mesh = meshes[0]
if args.edit_from:
    old = np.load(previous / 'mesh-source.npz')['positions']
    target = np.load(output / 'mesh-source.npz')['positions']
    assert old.shape == target.shape
    tree = KDTree(len(old))
    for i, point in enumerate(old):
        tree.insert(point, i)
    tree.balance()
    inverse = mesh.matrix_world.inverted()
    for vertex in mesh.data.vertices:
        point = mesh.matrix_world @ vertex.co
        source_point = Vector((point.x, point.z, -point.y))
        _, index, distance = tree.find(source_point)
        assert distance < 2e-7, ('editable source differs from pattern', distance)
        wanted = target[index]
        vertex.co = inverse @ Vector((wanted[0], -wanted[2], wanted[1]))
        delta = max(delta, float(np.linalg.norm(wanted - old[index])))
    assert delta > .001, 'source parameter edit must actually change the mesh'
    normals = [Vector((0, 0, 0)) for _ in mesh.data.vertices]
    for polygon in mesh.data.polygons:
        a, b, c = polygon.vertices
        cross = (mesh.data.vertices[b].co - mesh.data.vertices[a].co).cross(mesh.data.vertices[c].co - mesh.data.vertices[a].co)
        for index in polygon.vertices:
            normals[index] += cross
    mesh.data.normals_split_custom_set_from_vertices([normal.normalized() for normal in normals])
    mesh.data.update()
mesh['sourceSpec'] = json.dumps(spec, sort_keys=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
hashes = []
for filename in ['author-export.glb', 'author-repeat-export.glb']:
    bpy.ops.wm.open_mainfile(filepath=str(blend), use_scripts=False)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type == 'ARMATURE' or (obj.type == 'MESH' and obj.name.startswith(spec['id'])):
            obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(output / filename), export_format='GLB', export_yup=True, export_animations=False, export_extras=True, use_selection=True)
    hashes.append(sha(output / filename))
assert hashes[0] == hashes[1]
report = {'blender': bpy.app.version_string, 'editableSha256': sha(blend), 'sourceSpecSha256': sha(output / 'source-spec.json'),
          'patternSha256': sha(output / (spec['id'] + '.glb')), 'authorExportSha256': hashes[0], 'repeatExportSha256': hashes[1],
          'editedFromEarlierSource': args.edit_from, 'maximumActualSourceEditMetres': delta, 'reopenedForEachExport': True, 'gameAcceptance': False}
(output / 'author-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
