"""Generate the exact original-male Body shape dependency sidecar.

This is a read/write producer. Runtime reads the generated sidecar and still
checks the live Three.js Body attributes before admitting the garment.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import sys
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-onepiece-v1'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--body', default='prototype/public/assets/foundation/base-male-roundtrip.vrm')
    parser.add_argument('--garment', default='assets-source/m2-onepiece-v1/generated/author-export.glb')
    parser.add_argument('--out', default='assets-source/m2-onepiece-v1/generated/shape-fit.json')
    parser.add_argument('--public-out', default='prototype/public/assets/m2-onepiece-v1/shape-fit.json')
    args = parser.parse_args()
    body = (ROOT / args.body).resolve()
    garment = (ROOT / args.garment).resolve()
    output = (ROOT / args.out).resolve()
    public = (ROOT / args.public_out).resolve()
    assert body.is_relative_to(ROOT) and garment.is_relative_to(ROOT) and output.is_relative_to(ROOT) and public.is_relative_to(ROOT)
    module_spec = importlib.util.spec_from_file_location('glb', ROOT / 'scripts/m2-male-face-v1/glb.py')
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    source = module.GLB(body)
    garment_sha = sha(garment.read_bytes())
    body_sha = sha(body.read_bytes())
    assert body_sha == '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff', 'Only the registered original male body may produce this sidecar'
    assert garment_sha == 'e0cac5041a50bc07dde65c75414f98bab1501125939302eec0b9e1a5de826c7b', 'Only the registered onePiece author export may produce this sidecar'
    runtime_digest = json.loads(subprocess.check_output(['node', str(ROOT/'scripts/m2-onepiece-v1/runtime-shape-digest.mjs'), str(body)], text=True))
    rows = []
    for mesh_index, mesh in enumerate(source.doc['meshes']):
        node_index = next((index for index, node in enumerate(source.doc['nodes']) if node.get('mesh') == mesh_index), None)
        if node_index is None:
            continue
        node = source.doc['nodes'][node_index]
        for primitive_index, primitive in enumerate(mesh['primitives']):
            material_name = source.doc['materials'][primitive['material']]['name']
            if '_Body_' not in material_name or '_SKIN' not in material_name:
                continue
            geometry = {}
            for semantic, key in [('POSITION', 'position'), ('indices', 'index'), ('JOINTS_0', 'skinIndex'), ('WEIGHTS_0', 'skinWeight')]:
                accessor_index = primitive['indices'] if semantic == 'indices' else primitive['attributes'][semantic]
                accessor = source.doc['accessors'][accessor_index]
                values = source.acc(accessor_index)
                raw_source = values.tobytes()
                raw_sha = sha(raw_source)
                runtime_sha = None
                if semantic == 'WEIGHTS_0':
                    values = np.asarray(values, dtype='<f4')
                    normalized = np.empty_like(values, dtype='<f4')
                    for row_index, row in enumerate(values):
                        scale = 1.0 / (abs(float(row[0])) + abs(float(row[1])) + abs(float(row[2])) + abs(float(row[3])))
                        normalized[row_index] = np.asarray([float(value) * scale for value in row], dtype='<f4')
                    values = normalized
                    runtime_sha = runtime_digest['sha256']
                raw = values.tobytes()
                geometry[key] = {'sha256': runtime_sha or sha(raw), **({'rawSha256': raw_sha, 'runtimeNormalization': 'three-0.187.0 SkinnedMesh.normalizeSkinWeights'} if runtime_sha else {}), 'componentType': accessor['componentType'],
                                 'type': accessor['type'], 'count': accessor['count'], 'itemSize': len(values[0])}
            node_matrix = node.get('matrix', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
            assert node_matrix == [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 'Registered original male Body node transform changed'
            rows.append({'meshIndex': mesh_index, 'primitiveIndex': primitive_index, 'meshName': mesh.get('name'),
                         'nodeName': node.get('name'), 'materialName': material_name, 'nodeIndex': node_index,
                         'nodeMatrix': node_matrix,
                         'geometry': geometry})
    assert rows
    payload = {'schema': 'm2-shape-fit-v1', 'id': 'original-male-training-onepiece-shape-fit-v1', 'version': 1,
               'dependency': 'body-surface', 'baseAvatarSha256': body_sha, 'garmentId': 'm2-male-training-onepiece-v1',
               'garmentSha256': garment_sha, 'bodyPath': args.body, 'source': 'exact body POSITION/index/skin attributes and authored mesh transform',
               'generator': 'scripts/m2-onepiece-v1/build-shape-fit.py', 'generatorSha256': sha(Path(__file__).read_bytes()),
               'runtimeDigestSource': 'scripts/m2-onepiece-v1/runtime-shape-digest.mjs', 'runtimeDigest': runtime_digest,
               'surfaces': rows, 'limits': ['Checks loaded canonical Body geometry and static mesh transform.',
                                            'Does not inspect face geometry or expression morphs.',
                                            'Cannot detect an out-of-band typed-array mutation that skips the normal revision/needsUpdate path.']}
    text = json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n'
    output.parent.mkdir(parents=True, exist_ok=True); public.parent.mkdir(parents=True, exist_ok=True)
    encoded = text.encode('utf-8')
    for destination in [output, public]:
        if destination.exists() and destination.read_bytes() != encoded: raise ValueError(f'Existing shape-fit differs: {destination}')
        destination.write_bytes(encoded)
    print(json.dumps({'output': str(output), 'public': str(public), 'sha256': sha(text.encode()), 'surfaces': len(rows)}))


if __name__ == '__main__':
    main()
