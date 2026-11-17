"""Complete original GLB groups and fixed semantic masks; no old mapped partition."""
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import numpy as np

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-axial-head-evaluation-v1'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ref(path):
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': sha(path)}


def clean(value):
    if isinstance(value, np.generic):
        return clean(value.item())
    if isinstance(value, np.ndarray):
        return clean(value.tolist())
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, float) and not np.isfinite(value):
        return {'nonFinite': str(value)}
    return value


def save(path, value):
    path.write_bytes((json.dumps(clean(value), ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode())


def accessor_identity(g, row):
    index = row['accessor']
    actual = g.doc['accessors'][index]
    for key in ['count', 'type', 'componentType']:
        if actual[key] != row[key]:
            raise ValueError('Accessor signature differs')
    if actual.get('normalized', False) != row['normalized']:
        raise ValueError('Accessor normalization differs')
    values = g.acc(index)
    if hashlib.sha256(values.tobytes()).hexdigest() != row['decodedTightlyPackedSHA256']:
        raise ValueError('Decoded source attribute identity differs: ' + str(index))


def load(spec):
    for row in spec['inputs']:
        if sha(ROOT / row['path']) != row['sha256']:
            raise ValueError('Pinned evaluation input differs: ' + row['path'])
    inventory = json.loads((ROOT / spec['sourceInventory']['path']).read_bytes())
    loader = importlib.util.spec_from_file_location('complete_source_glb', ROOT / spec['sourceReader'])
    module = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(module)
    return module.GLB(ROOT / spec['source']['path']), inventory


def source_records(g, inventory):
    all_uses = {(mi, pi) for mi, mesh in enumerate(g.doc['meshes']) for pi, _ in enumerate(mesh['primitives'])}
    consumed, records, endpoints, groups, unused = set(), [], [], [], []
    offset = 0
    for group in inventory['positionGroups']:
        accessor = group['position']['accessor']
        accessor_identity(g, group['position'])
        P = g.acc(accessor).astype(float)
        signature = group['sharedOriginalTargetReferences']
        references, ids = [], []
        for primitive in group['primitives']:
            mi, pi = primitive['mesh'], primitive['primitive']
            actual = g.doc['meshes'][mi]['primitives'][pi]
            if (mi, pi) in consumed or actual['attributes']['POSITION'] != accessor:
                raise ValueError('Duplicate or mismatched primitive group')
            consumed.add((mi, pi))
            if actual.get('targets', []) != signature or actual.get('mode', 4) != 4:
                raise ValueError('Shared target signature or triangle mode differs')
            if g.doc['materials'][actual['material']]['name'] != primitive['material']['name']:
                raise ValueError('Material source identity differs')
            if set(actual['attributes']) != set(primitive['attributes']):
                raise ValueError('Attribute presence differs')
            for name, attribute in primitive['attributes'].items():
                if actual['attributes'][name] != attribute['accessor']:
                    raise ValueError('Source attribute accessor differs')
                accessor_identity(g, attribute)
            accessor_identity(g, primitive['index'])
            if actual['indices'] != primitive['index']['accessor']:
                raise ValueError('Source index accessor differs')
            selected = np.unique(g.acc(actual['indices'])).astype(int)
            if not np.array_equal(selected, primitive['actualReferencedSourceIndices']):
                raise ValueError('Source primitive referenced indices differ')
            for target, expected in zip(actual.get('targets', []), primitive['targets'], strict=True):
                if set(target) != set(expected['attributes']):
                    raise ValueError('Morph target attribute presence differs')
                for name, attribute in expected['attributes'].items():
                    if target[name] != attribute['accessor']:
                        raise ValueError('Morph source accessor differs')
                    accessor_identity(g, attribute)
            ids.extend(selected.tolist())
            references.append({'mesh': mi, 'primitive': pi, 'material': primitive['material']['name'],
                'materialIndex': actual['material'], 'indexAccessor': actual['indices'],
                'attributes': actual['attributes'], 'targetSignatures': signature})
        selected = np.unique(ids).astype(int)
        absent = np.setdiff1d(np.arange(len(P)), selected)
        if not np.array_equal(selected, group['actualReferencedSourceIndices']) or not np.array_equal(absent, group['unreferencedBufferSourceIndices']):
            raise ValueError('Complete source union or unused set differs')
        for consumer in group['meshNodeConsumers']:
            node = g.doc['nodes'][consumer['node']]
            roots = g.doc['scenes'][g.doc.get('scene', 0)]['nodes']
            if consumer['node'] not in roots or node['mesh'] != consumer['mesh']:
                raise ValueError('Source mesh is not the reviewed scene root')
            identity = {'matrix': np.eye(4).T.ravel().tolist(), 'translation': [0, 0, 0],
                'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1]}
            if any(key in node and not np.array_equal(node[key], value) for key, value in identity.items()):
                raise ValueError('Nonidentity source rest mesh transform')
        unused.append({'positionAccessor': accessor, 'sourceIndices': absent.tolist(), 'keptOriginal': True})
        groups.append({'positionAccessor': accessor, 'sourceIndices': selected, 'references': references, 'targets': signature})
        for endpoint in range(-1, len(signature)):
            target_accessor = None if endpoint == -1 else signature[endpoint]['POSITION']
            Q = P if endpoint == -1 else P + g.acc(target_accessor).astype(float)
            records.append({'positionAccessor': accessor, 'endpoint': endpoint, 'targetPositionAccessor': target_accessor,
                'references': references, 'sourceIndices': selected.tolist(), 'offset': offset, 'count': len(selected)})
            endpoints.append(Q[selected])
            offset += len(selected)
    if consumed != all_uses or len(groups) != 2 or sum(len(row['sourceIndices']) for row in groups) != 9911:
        raise ValueError('Complete original primitive/base coverage required')
    if len(records) != 56 or offset != 120935:
        raise ValueError('Expected real 7855 Body base plus2056 Face x55, without invented Body targets')
    return records, np.concatenate(endpoints), groups, unused


def fixed_masks(g, spec):
    eye_names = {'M00_000_00_EyeIris_00_EYE', 'M00_000_00_EyeHighlight_00_EYE', 'M00_000_00_EyeWhite_00_EYE'}
    eye = []
    for mi, mesh in enumerate(g.doc['meshes']):
        for pi, primitive in enumerate(mesh['primitives']):
            name = g.doc['materials'][primitive['material']]['name']
            if name in eye_names:
                eye.append({'mesh': mi, 'primitive': pi, 'positionAccessor': primitive['attributes']['POSITION'],
                    'sourceIndices': np.unique(g.acc(primitive['indices'])).astype(int).tolist(), 'material': name})
    if {row['material'] for row in eye} != eye_names:
        raise ValueError('Complete exact fixed eye material source masks required')
    old = json.loads((ROOT / spec['neckMaskSource']['path']).read_bytes())
    neck = [{'positionAccessor': row['positionAccessor'], 'endpoint': row['endpoint'],
        'sourceIndices': row['sourceIndices'], 'sourceMaterial': row['material']}
        for row in old if row['role'] == 'neck-preservation']
    if len(neck) != 1 or neck[0]['endpoint'] != -1 or len(neck[0]['sourceIndices']) != 68:
        raise ValueError('Expected explicit original68 neck source mask')
    frame = np.load(ROOT / spec['frameSource']['path'], allow_pickle=False)
    return {'schema': 'axial-fixed-source-masks-v1', 'source': spec['source'], 'fixedEye': eye, 'neck': neck,
        'frameSourcePointsM': frame['nodesM'][frame['frameNodes']].tolist(),
        'neckMaskSource': spec['neckMaskSource'], 'frameSource': spec['frameSource'],
        'oldMappedEndpointPartitionUsed': False}


def section_function():
    path = ROOT / 'scripts/m2-representative-head-cage-v1/batch.py'
    tree = ast.parse(path.read_bytes())
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'surface_widths')
    namespace = {'np': np}
    exec(compile(ast.Module([node], []), str(path) + ':actual-widths-only', 'exec'), namespace)
    return namespace['surface_widths']
