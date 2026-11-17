"""Offline GLB fixtures for logical expression morph readback, no editor calls."""
import copy
import hashlib
import json
from pathlib import Path
import struct

from readback import inspect_expression_payloads

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'evidence/vroid-expression-study-v1/offline-readback-qa'


def fixture(sparse=False, stride=12):
    morph = struct.pack('<9f', 0, 0, 0, .125, -.25, .5, 0, 0, 0)
    base = bytes(36)
    views = [{'buffer': 0, 'byteLength': 36}]
    accessors = [{'bufferView': 0, 'componentType': 5126, 'type': 'VEC3', 'count': 3}]
    if sparse:
        binary = base + bytes([1, 0, 0, 0]) + morph[12:24]
        views += [{'buffer': 0, 'byteOffset': 36, 'byteLength': 1},
                  {'buffer': 0, 'byteOffset': 40, 'byteLength': 12}]
        accessors.append({'componentType': 5126, 'type': 'VEC3', 'count': 3,
                          'sparse': {'count': 1, 'indices': {'bufferView': 1, 'componentType': 5121},
                                     'values': {'bufferView': 2}}})
    else:
        data = b''.join(morph[i:i + 12] + bytes(stride - 12) for i in range(0, 36, 12))
        binary = base + data
        views.append({'buffer': 0, 'byteOffset': 36, 'byteLength': len(data), 'byteStride': stride})
        accessors.append({'bufferView': 1, 'componentType': 5126, 'type': 'VEC3', 'count': 3})
    document = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': len(binary)}],
                'bufferViews': views, 'accessors': accessors,
                'nodes': [{'name': 'Face', 'mesh': 0, 'skin': 0}, {'name': 'Head'}],
                'skins': [{'joints': [1]}],
                'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'targets': [{'POSITION': 1}]}]}],
                'extensions': {'VRMC_vrm': {'specVersion': '1.0',
                    'meta': {'name': 'synthetic-offline-only', 'authors': ['QA']},
                    'expressions': {'preset': {'happy': {'morphTargetBinds': [
                        {'node': 0, 'index': 0, 'weight': 1}]}}}}}}
    return document, binary, hashlib.sha256(morph).hexdigest()


def save(name, document, binary):
    encoded = json.dumps(document).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary += bytes(-len(binary) % 4)
    raw = struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
    raw += struct.pack('<I4s', len(encoded), b'JSON') + encoded
    raw += struct.pack('<I4s', len(binary), b'BIN\0') + binary
    path = OUT / (name + '.vrm')
    path.write_bytes(raw)
    return path


def main():
    OUT.mkdir(exist_ok=False)
    rows = []
    for name, sparse, stride in [('dense', False, 12), ('interleaved', False, 16), ('sparse', True, 12)]:
        document, binary, expected = fixture(sparse, stride)
        result = inspect_expression_payloads(save(name, document, binary))
        actual = result['expressions']['preset/happy']['referencedMorphData'][0]['targets'][0]['POSITION']
        assert actual == {'count': 3, 'sha256': expected}
        rows.append({'case': name, 'passed': True, 'logicalMorphSha256': expected})
    document, binary, _ = fixture()
    before = inspect_expression_payloads(save('before', document, binary))
    changed = binary[:48] + struct.pack('<f', .5) + binary[52:]
    after = inspect_expression_payloads(save('changed-one-coordinate', document, changed))
    assert before['expressions'] != after['expressions']
    rows.append({'case': 'actual-morph-payload-change-detected', 'passed': True})
    for name in ['invalid-view-bounds', 'invalid-target-index', 'unsupported-component-type']:
        invalid = copy.deepcopy(document)
        if name == 'invalid-view-bounds':
            invalid['bufferViews'][1]['byteLength'] = 4
        elif name == 'invalid-target-index':
            invalid['extensions']['VRMC_vrm']['expressions']['preset']['happy']['morphTargetBinds'][0]['index'] = 9
        else:
            invalid['accessors'][1]['componentType'] = 5123
        try:
            inspect_expression_payloads(save(name, invalid, binary))
        except ValueError as error:
            rows.append({'case': name, 'passed': True, 'rejection': str(error)})
        else:
            raise AssertionError('Invalid fixture accepted: ' + name)
    report = {'schema': 'vroid-expression-readback-offline-qa-v1', 'status': 'passed',
              'editorLaunches': 0, 'nativeCalls': 0, 'checks': rows,
              'limits': ['Synthetic container and morph readback only',
                         'Canonical expression payload includes original binding IDs, so reorder can differ',
                         'No claim of native parameter persistence or visual correctness']}
    (OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'{len(rows)} offline readback checks passed')


if __name__ == '__main__':
    main()
