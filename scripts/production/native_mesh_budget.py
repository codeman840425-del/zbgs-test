"""Rebuild the CPU-only native body partition experiment from the fixed selected record."""
import copy
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

from asset_budget import COMPONENTS, DIMENSIONS, budget_config, check
from flow import GLB, ROOT, require


SELECTED = ROOT / 'evidence/m2-native-short-socks-room-v1/selected-budget-verified.json'
OUTPUT = ROOT / 'evidence/m2-native-body-cost-v1/mesh'
BUDGET = ROOT / 'scripts/production/asset-budgets-v1.json'
SOURCE_SHA = '7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81'


def accessor(glb, index):
    a = glb.doc['accessors'][index]
    view = glb.doc['bufferViews'][a['bufferView']]
    require('sparse' not in a and 'byteStride' not in view, 'only densely packed source ranges supported')
    dtype = np.dtype('<' + COMPONENTS[a['componentType']][0])
    return np.frombuffer(glb.binary, dtype, a['count'] * DIMENSIONS[a['type']],
                         view.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], -1)


def encode(doc, binary):
    header = json.dumps(doc, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()
    header += b' ' * (-len(header) % 4)
    require(len(binary) % 4 == 0, 'unaligned source BIN')
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(header) + len(binary))
            + struct.pack('<I4s', len(header), b'JSON') + header
            + struct.pack('<I4s', len(binary), b'BIN\0') + binary)


def partition(source, mesh):
    """Accept only shared, morph-free streams split into exact disjoint intervals."""
    primitives = mesh['primitives']
    if len(primitives) < 2 or any(p.get('targets') for p in primitives):
        return None
    shared = primitives[0]['attributes']
    if any(p['attributes'] != shared for p in primitives):
        return None
    ranges = []
    count = source.doc['accessors'][shared['POSITION']]['count']
    for p in primitives:
        indices = accessor(source, p['indices']).ravel()
        used = np.unique(indices)
        first, end = int(used[0]), int(used[-1]) + 1
        if first < 0 or end > count or len(used) != end - first:
            return None
        ranges.append((first, end))
    cursor = 0
    for first, end in sorted(ranges):
        if first != cursor:
            return None
        cursor = end
    return ranges if cursor == count else None


def derive(source):
    doc = copy.deepcopy(source.doc)
    binary = bytearray(source.binary)
    remaps = {}
    for mi, mesh in enumerate(source.doc['meshes']):
        ranges = partition(source, mesh)
        if ranges is None:
            continue
        for pi, (first, end) in enumerate(ranges):
            p = doc['meshes'][mi]['primitives'][pi]
            for name, original in p['attributes'].copy().items():
                a = copy.copy(source.doc['accessors'][original])
                rows = accessor(source, original)[first:end]
                a.update(byteOffset=a.get('byteOffset', 0) + first * rows.strides[0], count=end - first)
                for key in ('min', 'max'):
                    if key in a:
                        a[key] = getattr(rows, key)(axis=0).tolist()
                # The fixed source uses these streams only in this mesh. Reuse its
                # existing entries for the first interval; the other four are views.
                if pi == 0:
                    doc['accessors'][original] = a
                else:
                    p['attributes'][name] = len(doc['accessors'])
                    doc['accessors'].append(a)
            indices = accessor(source, p['indices'])
            index_accessor = doc['accessors'][p['indices']]
            index_view = doc['bufferViews'][index_accessor['bufferView']]
            offset = index_view.get('byteOffset', 0) + index_accessor.get('byteOffset', 0)
            binary[offset:offset + indices.nbytes] = (indices - first).tobytes()
            remaps[mi, pi] = first
    require(remaps, 'no eligible primitive partition')
    return encode(doc, binary), remaps


def verify(source, derived, remaps):
    for key in source.doc.keys() - {'meshes', 'accessors'}:
        require(source.doc[key] == derived.doc[key], 'changed document field ' + key)
    measured = []
    for mi, mesh in enumerate(source.doc['meshes']):
        for pi, p in enumerate(mesh['primitives']):
            q = derived.doc['meshes'][mi]['primitives'][pi]
            first = remaps.get((mi, pi), 0)
            old, new = [accessor(model, entry['indices']).ravel()
                        for model, entry in ((source, p), (derived, q))]
            require(np.array_equal(old.astype(np.int64), new.astype(np.int64) + first), 'corner order mismatch')
            require({k: v for k, v in p.items() if k not in ('attributes', 'targets')} ==
                    {k: v for k, v in q.items() if k not in ('attributes', 'targets')}, 'primitive contract mismatch')
            require(len(p.get('targets', [])) == len(q.get('targets', [])), 'morph count changed')
            streams = [(p['attributes'], q['attributes']), *zip(p.get('targets', []), q.get('targets', []))]
            corner_bytes = 0
            for src, dst in streams:
                require(src.keys() == dst.keys(), 'attribute semantics mismatch')
                for key in src:
                    a, b = accessor(source, src[key])[old], accessor(derived, dst[key])[new]
                    require(a.dtype == b.dtype and a.tobytes() == b.tobytes(), key + ' corner bytes differ')
                    corner_bytes += a.nbytes
            if (mi, pi) not in remaps:
                require(p == q, 'canonical primitive declaration changed')
            measured.append({
                'mesh': mi, 'primitive': pi, 'material': source.doc['materials'][p['material']]['name'],
                'sourcePositionAccessor': p['attributes']['POSITION'],
                'sourcePositionCount': len(accessor(source, p['attributes']['POSITION'])),
                'derivedPositionCount': len(accessor(derived, q['attributes']['POSITION'])),
                'sourceReferencedVertices': len(np.unique(old)), 'sourceIndexMin': int(old.min()),
                'sourceIndexMax': int(old.max()), 'corners': len(old), 'morphTargets': len(p.get('targets', [])),
                'sourceIndexEqualsDerivedIndexPlus': first, 'comparedCornerAttributeBytes': corner_bytes,
            })
    return measured


def fixed_input():
    selected = json.loads(SELECTED.read_bytes())
    bodies = [asset for record in selected['records'] for asset in record['models'] if asset['class'] == 'body']
    require(bodies and all(b['sha256'] == SOURCE_SHA and b['path'] == bodies[0]['path'] for b in bodies),
            'selected body identity changed')
    path = ROOT / 'prototype/public' / bodies[0]['path']
    data = path.read_bytes()
    require(hashlib.sha256(data).hexdigest() == SOURCE_SHA, 'source bytes mismatch')
    require(hashlib.sha256(BUDGET.read_bytes()).hexdigest() == selected['budgetFileSha256'], 'budget bytes changed')
    return selected, bodies, path, data


def run(derive_candidate, output_name, report_name, scope):
    selected, bodies, path, data = fixed_input()
    source = GLB(data)
    output, remaps = derive_candidate(source)
    derived = GLB(output)
    rows = verify(source, derived, remaps)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    target = OUTPUT / output_name
    target.write_bytes(output)
    config = budget_config(BUDGET, selected['budgetVersion'])
    checks = {}
    for key, file in [('source', path), ('derived', target)]:
        cost = check(file, 'body', config)
        checks[key] = {k: cost[k] for k in ['sha256', 'metrics', 'positionAccessors', 'violations', 'status']}
    require(checks['source']['metrics'] == bodies[0]['cost']['metrics'], 'fixed record costs differ')
    report = {
        'sourceGameCommit': selected['sourceCommit'], 'sourcePath': path.relative_to(ROOT).as_posix(),
        'budgetFileSha256': selected['budgetFileSha256'], 'assetBudgetChecks': checks,
        'primitives': rows, 'renderedTriangleCornersPerModelDefinition': sum(row['corners'] for row in rows),
        'cornerAttributeBytesChecked': sum(row['comparedCornerAttributeBytes'] for row in rows),
        'upstreamAlgorithm': 'https://github.com/pixiv/three-vrm/blob/v3.5.5/packages/three-vrm/src/VRMUtils/removeUnnecessaryVertices.ts',
        'binChunkSha256': {name: hashlib.sha256(g.binary).hexdigest()
                           for name, g in [('source', source), ('derived', derived)]},
        'derivedFile': output_name, 'scope': scope,
    }
    (OUTPUT / report_name).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: [v['sha256'], v['metrics']['primitiveVertices'], v['violations']] for k, v in checks.items()}))


if __name__ == '__main__':
    run(derive, 'partitioned-body.vrm', 'analysis.json',
        'Diagnostic. File corners match, but GLTFLoader normalizes shared weights once per primitive. See three-comparison.json.')
