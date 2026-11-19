"""Blender source for the independent chevron example. Distances use metres."""
import sys
from pathlib import Path

import bpy

root = Path(__file__).resolve().parents[3]
owner = root
for entry in root.parents:
    if entry.name in ("output", "company-workspace") and (entry.parent / "scripts/company-platform/local-workspace.ps1").is_file():
        owner = entry.parent
arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(arguments) > 1:
    raise ValueError("Pass one optional project output filename after --")
requested = Path(arguments[0]) if arguments else Path("output/wall-absorber-v1/production/timber-chevron.glb")
target = owner / requested
valid_roots = [owner / "output", owner / "company-workspace/production-trials"]
if (".." in requested.parts or target.suffix != ".glb" or target.resolve() != target or
        not any(parent in target.parents for parent in valid_roots) or target.exists()):
    raise ValueError("Choose a new .glb in the managed project outputs")
target.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def finish(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    pbr = mat.node_tree.nodes.get("Principled BSDF")
    pbr.inputs["Base Color"].default_value = (*color, 1)
    pbr.inputs["Roughness"].default_value = roughness
    return mat


def slab(name, outline, back, front, material, bevel=0):
    n = len(outline)
    vertices = [(x, -z, y) for z in [back, front] for x, y in outline]
    faces = [list(reversed(range(n))), list(range(n, 2*n))]
    faces += [(i, (i+1)%n, n+(i+1)%n, n+i) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    if bevel:
        edge = obj.modifiers.new("Planed arris", "BEVEL")
        edge.width, edge.segments = bevel, 2
    return obj


base = finish("Warm charcoal backing", (.048, .042, .036), .96)
oak = [finish("Oiled oak", (.47, .28, .14), .64), finish("Light oak", (.58, .36, .19), .67)]
slab("Mounting board", [(-.30,-.60),(.30,-.60),(.30,.60),(-.30,.60)], 0, .023, base)
for row in range(8):
    y = -.574 + .141*row
    for side in [-1, 1]:
        xa, xb = (-.286,-.003) if side == -1 else (.003,.286)
        ya, yb = (y, y+.083) if side == -1 else (y+.083, y)
        profile = [(xa,ya),(xb,yb),(xb,yb+.055),(xa,ya+.055)]
        slab(f"Chevron {row+1} {'left' if side<0 else 'right'}", profile, .0225, .080,
             oak[(row + (side == 1)) % 2], .002)
bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", export_yup=True, export_apply=True,
                          export_animations=False, export_cameras=False, export_lights=False)
