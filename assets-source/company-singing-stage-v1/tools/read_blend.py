"""Read the source meshes without modifying either Blender project."""
from pathlib import Path
import sys
import bpy
import numpy as np

sources, output = map(Path, sys.argv[-2:])
data = {}
for source in sorted(sources.glob('*.blend')):
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        points = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
        data[obj.name + '_pos'] = np.asarray([(p.x, p.z, -p.y) for p in points], float)
        data[obj.name + '_idx'] = np.asarray([t.vertices[:] for t in mesh.loop_triangles], np.int32)
np.savez_compressed(output, **data)
