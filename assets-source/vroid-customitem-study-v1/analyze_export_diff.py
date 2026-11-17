"""CPU comparison of actual native exports by each primitive's referenced IDs."""
import hashlib
import json
import math
from pathlib import Path
import struct

from study import ROOT, EVIDENCE, validate_vrm


def load(path):
    validate_vrm(path, 1)
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20 + size]), raw[28 + size:]


def accessor(document, binary, index):
    entry = document['accessors'][index]
    if 'sparse' in entry or entry.get('normalized'):
        raise ValueError('This readback requires actual dense nonnormalized native accessors')
    code = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[entry['componentType']]
    components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[entry['type']]
    width = struct.calcsize('<' + code * components)
    view = document['bufferViews'][entry['bufferView']]
    start = view.get('byteOffset', 0) + entry.get('byteOffset', 0)
    stride = view.get('byteStride', width)
    packed = [binary[start + row * stride:start + row * stride + width] for row in range(entry['count'])]
    if any(len(row) != width for row in packed):
        raise ValueError('Incomplete actual native accessor')
    return packed, [struct.unpack('<' + code * components, row) for row in packed]


def digest(rows):
    return hashlib.sha256(b''.join(rows)).hexdigest()


def main():
    source = EVIDENCE / 'native-single-top-v1'
    before_path = source / 'customitem-study-baseline.vrm'
    after_path = source / 'customitem-study-direct.vrm'
    before, bin_before = load(before_path)
    after, bin_after = load(after_path)
    if len(before['meshes']) != len(after['meshes']):
        raise ValueError('Mesh consumer count changed')
    rows = []
    for mesh_index, mesh in enumerate(before['meshes']):
        next_mesh = after['meshes'][mesh_index]
        if len(mesh['primitives']) != len(next_mesh['primitives']):
            raise ValueError('Primitive consumer count changed')
        for primitive_index, primitive in enumerate(mesh['primitives']):
            next_primitive = next_mesh['primitives'][primitive_index]
            material = before['materials'][primitive['material']]['name']
            if material != after['materials'][next_primitive['material']]['name']:
                raise ValueError('Primitive material identity changed')
            packed, triangles = accessor(before, bin_before, primitive['indices'])
            next_packed, next_triangles = accessor(after, bin_after, next_primitive['indices'])
            if packed != next_packed:
                raise ValueError('Actual triangle topology changed')
            ids = sorted({vertex for row in triangles for vertex in row})
            attributes = {}
            if primitive['attributes'].keys() != next_primitive['attributes'].keys():
                raise ValueError('Native attribute signature changed')
            for name, index in primitive['attributes'].items():
                packed, values = accessor(before, bin_before, index)
                next_packed, next_values = accessor(after, bin_after, next_primitive['attributes'][name])
                if len(packed) != len(next_packed) or not ids or ids[-1] >= len(packed):
                    raise ValueError('Actual referenced vertex domain changed')
                changed = [vertex for vertex in ids if packed[vertex] != next_packed[vertex]]
                attributes[name] = {'beforeReferencedSha256': digest([packed[v] for v in ids]),
                    'afterReferencedSha256': digest([next_packed[v] for v in ids]),
                    'changedReferencedVertices': len(changed),
                    'changedWholeAccessorVertices': sum(a != b for a, b in zip(packed, next_packed))}
                if name == 'POSITION':
                    distances = [(math.dist(values[v], next_values[v]), v) for v in ids]
                    maximum, vertex = max(distances)
                    attributes[name].update(maximumReferencedDisplacementM=maximum,
                        maximumSourceIndex=vertex, maximumBeforeM=values[vertex], maximumAfterM=next_values[vertex])
            rows.append({'mesh': mesh_index, 'primitive': primitive_index, 'materialName': material,
                'sourcePositionAccessor': primitive['attributes']['POSITION'], 'indexCount': len(triangles),
                'referencedVertexCount': len(ids),
                'referencedSourceIndicesSha256': hashlib.sha256(struct.pack('<' + 'I' * len(ids), *ids)).hexdigest(),
                'indicesUnchanged': True, 'attributes': attributes})
    skins = []
    for index, skin in enumerate(before['skins']):
        next_skin = after['skins'][index]
        a, _ = accessor(before, bin_before, skin['inverseBindMatrices'])
        b, _ = accessor(after, bin_after, next_skin['inverseBindMatrices'])
        skins.append({'skin': index, 'jointCount': len(skin['joints']),
            'jointIndicesUnchanged': skin['joints'] == next_skin['joints'],
            'jointNodesUnchanged': [before['nodes'][n] for n in skin['joints']] == [after['nodes'][n] for n in next_skin['joints']],
            'inverseBindMatricesBeforeSha256': digest(a), 'inverseBindMatricesAfterSha256': digest(b),
            'inverseBindMatricesUnchanged': a == b})
    files = [{'path': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
             for path in [before_path, after_path]]
    result = {'schema': 'vroid-customitem-native-export-reference-diff-v1', 'status': 'measured',
        'inputs': files, 'deleteTransparent': True, 'primitiveRows': rows, 'skins': skins,
        'nodeConsumersUnchanged': before['nodes'] == after['nodes'],
        'limits': ['Actual same-setting native baseline/direct comparison only',
            'SourceIndices are this exporter output topology, not historical78912 source IDs',
            'No game/collision/animation validation or original full-body identity admission']}
    out = EVIDENCE / 'export-reference-diff.json'
    if out.exists():
        raise FileExistsError('Preserve existing differential evidence')
    out.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    for row in rows:
        pos = row['attributes']['POSITION']
        print(row['materialName'], row['referencedVertexCount'], pos['changedReferencedVertices'], pos['maximumReferencedDisplacementM'])
    print('skins exact', all(x['inverseBindMatricesUnchanged'] and x['jointIndicesUnchanged'] and x['jointNodesUnchanged'] for x in skins))


if __name__ == '__main__':
    main()
