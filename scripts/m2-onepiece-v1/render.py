"""CPU source inspection with every original Body triangle retained, no masks."""
from pathlib import Path
import hashlib
import importlib.util
import json
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-onepiece-v1'
OUT = BASE / 'generated/views'
OUT.mkdir(parents=True, exist_ok=True)
module_spec = importlib.util.spec_from_file_location('glb', ROOT / 'scripts/m2-male-face-v1/glb.py')
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)
bpy.ops.wm.read_factory_settings(use_empty=True)
body_triangles = 0
for path, garment in [(ROOT / 'prototype/public/assets/foundation/base-male-roundtrip.vrm', False), (BASE / 'generated/author-export.glb', True)]:
    glb = module.GLB(path)
    for source_mesh in glb.doc['meshes']:
        for primitive in source_mesh['primitives']:
            name = glb.doc['materials'][primitive['material']]['name']
            if not garment and not any(token in name for token in ['_Body_00_SKIN', '_Face', '_HAIR', '_Shoes_']):
                continue
            points = glb.acc(primitive['attributes']['POSITION'])
            faces = glb.acc(primitive['indices']).reshape(-1, 3)
            if '_Body_00_SKIN' in name:
                body_triangles += len(faces)
            mesh = bpy.data.meshes.new(name)
            mesh.from_pydata([(float(p[0]), float(-p[2]), float(p[1])) for p in points], [], faces.tolist())
            mesh.update()
            obj = bpy.data.objects.new(name, mesh)
            bpy.context.scene.collection.objects.link(obj)
            material = bpy.data.materials.new(name)
            material.diffuse_color = (.055, .16, .19, 1) if garment else (.62, .47, .36, 1)
            material.use_nodes = True
            material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = material.diffuse_color
            material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .9
            mesh.materials.append(material)
            for polygon in mesh.polygons:
                polygon.use_smooth = True
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.render.resolution_x = scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world = bpy.data.worlds.new('OnePieceSourceWorld')
scene.world.color = (.3, .3, .3)
scene.view_settings.view_transform = 'Standard'
for location in [(2, 3, 3), (-2, 1, 2), (0, -3, 3)]:
    light = bpy.data.lights.new('SourceArea', 'AREA')
    light.energy, light.size = 250, 3
    obj = bpy.data.objects.new('SourceArea', light)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 1.1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
camera = bpy.data.cameras.new('SourceCamera')
obj = bpy.data.objects.new('SourceCamera', camera)
scene.collection.objects.link(obj)
scene.camera = obj
camera.type = 'ORTHO'
for name, location, target, scale in [('front', (0, 3, 1.1), (0, 0, 1.1), 1.35), ('side', (3, 0, 1.1), (0, 0, 1.1), 1.35),
                                      ('back', (0, -3, 1.1), (0, 0, 1.1), 1.35), ('crotch-front', (0, 3, .96), (0, 0, .96), .38)]:
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera.ortho_scale = scale
    scene.render.filepath = str(OUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)
(OUT / 'views.json').write_text(json.dumps({'sourceAssetSha256': hashlib.sha256((BASE / 'generated/author-export.glb').read_bytes()).hexdigest(),
    'originalBodyTrianglesRetained': body_triangles, 'bodyMasks': False, 'renderer': 'Cycles CPU, diffuse source inspection materials', 'gameAcceptance': False}, indent=2) + '\n')
