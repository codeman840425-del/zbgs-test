"""Read exported expression bindings and referenced morph data without the editor."""
import hashlib
import json
from pathlib import Path
import struct
import sys

PACKAGE = Path(__file__).resolve().parent
UPSTREAM = PACKAGE / 'private-tools/upstream'
sys.path.insert(0, str(UPSTREAM))
from vroid_mcp.vrm_export import validate_vrm


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inspect_expression_payloads(path):
    checked = validate_vrm(Path(path), 1)
    raw = Path(path).read_bytes()
    offset = 12
    document = binary = None
    while offset < len(raw):
        length, kind = struct.unpack_from('<II', raw, offset)
        payload = raw[offset + 8: offset + 8 + length]
        if kind == 0x4e4f534a:
            document = json.loads(payload)
        elif kind == 0x004e4942:
            binary = payload
        offset += 8 + length
    if document is None or binary is None:
        raise ValueError('Expected self-contained JSON/BIN GLB')

    def morph_digest(index):
        accessor = document['accessors'][index]
        if accessor['componentType'] != 5126 or accessor['type'] != 'VEC3' or accessor.get('normalized'):
            raise ValueError('This readback supports Float32 VEC3 morph data only')
        count = accessor['count']
        logical = bytearray(count * 12)
        if 'bufferView' in accessor:
            view = document['bufferViews'][accessor['bufferView']]
            start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
            stride = view.get('byteStride', 12)
            for row in range(count):
                logical[row * 12:(row + 1) * 12] = binary[start + row * stride:start + row * stride + 12]
        sparse = accessor.get('sparse')
        if sparse:
            indices, values = sparse['indices'], sparse['values']
            view = document['bufferViews'][indices['bufferView']]
            start = view.get('byteOffset', 0) + indices.get('byteOffset', 0)
            code = {5121: 'B', 5123: 'H', 5125: 'I'}[indices['componentType']]
            ids = struct.unpack_from('<' + code * sparse['count'], binary, start)
            view = document['bufferViews'][values['bufferView']]
            start = view.get('byteOffset', 0) + values.get('byteOffset', 0)
            for row, source_index in enumerate(ids):
                logical[source_index * 12:(source_index + 1) * 12] = binary[start + row * 12:start + (row + 1) * 12]
        return {'count': count, 'sha256': digest(logical)}

    expressions = document['extensions']['VRMC_vrm'].get('expressions', {})
    result = {}
    for group, entries in expressions.items():
        for name, expression in entries.items():
            binds = []
            for binding in expression.get('morphTargetBinds', []):
                node = document['nodes'][binding['node']]
                primitives = document['meshes'][node['mesh']]['primitives']
                targets = [{attribute: morph_digest(accessor) for attribute, accessor in
                            primitive['targets'][binding['index']].items()} for primitive in primitives]
                binds.append({'nodeName': node.get('name'), 'weight': binding['weight'], 'targets': targets})
            payload = {'definition': expression, 'referencedMorphData': binds}
            result[group + '/' + name] = {'payloadSha256': digest(json.dumps(payload, sort_keys=True).encode()),
                                          **payload}
    return {'container': checked, 'metadata': document['extensions']['VRMC_vrm']['meta'],
            'expressions': result}
