"""Independent GLB inspection: distinguish a bone hierarchy from blended skinning."""
import json
import pathlib
import struct
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
path = ROOT / 'prototype/public/assets' / (sys.argv[1] if len(sys.argv) > 1 else 'RobotExpressive.glb')
if not path.exists():
    path = ROOT / 'experiments/assets' / path.name
raw = path.read_bytes()
assert raw[:4] == b'glTF'
assert len(raw) == struct.unpack_from('<I', raw, 8)[0], 'GLB length mismatch: download may still be in progress'
size, kind = struct.unpack_from('<II', raw, 12)
doc = json.loads(raw[20:20 + size])
binary_start = 20 + size + 8
binary = raw[binary_start:]
components = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def accessor(index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    fmt, width = components[a['componentType']]
    n = widths[a['type']]
    offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = view.get('byteStride', width * n)
    values = [struct.unpack_from('<' + fmt * n, binary, offset + i * stride) for i in range(a['count'])]
    if a.get('normalized') and a['componentType'] != 5126:
        maximum = (1 << (8 * width)) - 1
        values = [tuple(v / maximum for v in row) for row in values]
    return values

meshes = []
for mesh in doc['meshes']:
    record = {'name': mesh.get('name'), 'vertices': 0, 'weightedVertices': 0, 'blendedVertices': 0, 'nonUnitWeightSums': 0, 'maxWeightSumError': 0}
    for primitive in mesh['primitives']:
        attributes = primitive['attributes']
        record['vertices'] += doc['accessors'][attributes['POSITION']]['count']
        if 'WEIGHTS_0' not in attributes:
            continue
        rows = accessor(attributes['WEIGHTS_0'])
        joints = accessor(attributes['JOINTS_0'])
        record['weightedVertices'] += len(rows)
        for weights, indices in zip(rows, joints):
            error = abs(sum(weights) - 1)
            record['nonUnitWeightSums'] += error > .001
            record['maxWeightSumError'] = max(record['maxWeightSumError'], error)
            active = {joint for weight, joint in zip(weights, indices) if weight > 1e-5}
            record['blendedVertices'] += len(active) > 1
    meshes.append(record)
result = {
    'asset': str(path.relative_to(ROOT)), 'bytes': len(raw), 'skins': len(doc.get('skins', [])),
    'animations': [a.get('name') for a in doc.get('animations', [])], 'meshes': meshes,
    'note': 'These are raw exported weights. The runtime loader may normalize them. Only positive multi-joint weights count as blended deformation; a skeleton hierarchy alone does not.'
}
out = ROOT / 'output/playwright' / (path.stem + '-asset-inspection.json')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
