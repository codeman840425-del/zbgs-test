"""Independent asset-budget extension accounting reproduction. CPU files only."""
import sys
sys.dont_write_bytecode = True
import json
from pathlib import Path
import struct
import subprocess

ROOT = Path('F:/gamemake')
OUT = ROOT / 'evidence/m2-asset-budget-independent-v1'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from asset_budget import budget_config, check

binary = struct.pack('<9f', 0, 0, 0, 1, 0, 0, 0, 1, 0)
instance_count = 10000
binary += bytes(instance_count * 12)
doc = {
    'asset': {'version': '2.0'},
    'extensionsUsed': ['EXT_mesh_gpu_instancing'],
    'buffers': [{'byteLength': len(binary)}],
    'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 36},
                    {'buffer': 0, 'byteOffset': 36, 'byteLength': instance_count * 12}],
    'accessors': [{'bufferView': 0, 'componentType': 5126, 'type': 'VEC3', 'count': 3, 'min': [0, 0, 0], 'max': [1, 1, 0]},
                  {'bufferView': 1, 'componentType': 5126, 'type': 'VEC3', 'count': instance_count}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': 0}}]}],
    'nodes': [{'mesh': 0, 'extensions': {'EXT_mesh_gpu_instancing': {'attributes': {'TRANSLATION': 1}}}}],
    'scene': 0, 'scenes': [{'nodes': [0]}],
}
text = json.dumps(doc, separators=(',', ':')).encode()
text += b' ' * (-len(text) % 4)
binary += b'\0' * (-len(binary) % 4)
asset = OUT / 'optional-instancing-10000.glb'
asset.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(text) + len(binary))
                  + struct.pack('<I4s', len(text), b'JSON') + text
                  + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
config = budget_config(ROOT / 'scripts/production/asset-budgets-v1.json', 'm2-technical-v1')
result = check(asset, 'accessory', config)
(OUT / 'optional-instancing-result.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': result['status'], 'nodeTriangles': result['metrics']['nodeTriangles'],
                  'declaredInstances': instance_count, 'accessoryTriangleLimit': config['classes']['accessory']['nodeTriangles']}))
