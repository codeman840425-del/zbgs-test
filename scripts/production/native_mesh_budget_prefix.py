"""Crop a single indexed primitive's unused suffix while retaining every triangle's original indices."""
import copy

import numpy as np

from native_mesh_budget import BUDGET, accessor, budget_config, encode, require, run


def derive_prefix(source):
    limits = budget_config(BUDGET, 'm2-technical-v1')['classes']['body']
    primitives = [(mi, pi, p) for mi, mesh in enumerate(source.doc['meshes'])
                  for pi, p in enumerate(mesh['primitives'])]
    total = sum(source.doc['accessors'][p['attributes']['POSITION']]['count'] for _, _, p in primitives)
    candidates = []
    for mi, pi, p in primitives:
        indices = accessor(source, p['indices']).ravel()
        end = int(indices.max()) + 1
        old_count = source.doc['accessors'][p['attributes']['POSITION']]['count']
        if (end < old_count and len(np.unique(indices)) == end
                and total - old_count + end <= limits['primitiveVertices']):
            candidates.append((old_count - end, mi, pi, end))
    require(candidates, 'no single contiguous zero-based primitive can bring vertex count under limit')
    _, mi, pi, end = min(candidates)
    doc = copy.deepcopy(source.doc)
    primitive = doc['meshes'][mi]['primitives'][pi]
    seen = {}
    for stream in [primitive['attributes'], *primitive.get('targets', [])]:
        for name, index in stream.copy().items():
            if index not in seen:
                a = copy.copy(source.doc['accessors'][index])
                a['count'] = end
                rows = accessor(source, index)[:end]
                for key in ('min', 'max'):
                    if key in a:
                        a[key] = getattr(rows, key)(axis=0).tolist()
                seen[index] = len(doc['accessors'])
                doc['accessors'].append(a)
            stream[name] = seen[index]
    return encode(doc, source.binary), {(mi, pi): 0}


if __name__ == '__main__':
    run(derive_prefix, 'prefix-body.vrm', 'prefix-analysis.json',
        'CPU-only candidate. All original triangle vertex numbers and source BIN bytes are preserved. One primitive has a shorter position and morph accessor count. Rebuild exact identity-dependent fits before runtime admission.')
