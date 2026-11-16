"""CPU checks for the pinned garment coverage candidate."""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / 'assets-source/m2-garment-coverage-v1'
sys.path.insert(0, str(ROOT / 'scripts/m2-garment-coverage-v1'))
import build


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check():
    spec = json.loads((PACKAGE / 'spec.json').read_text(encoding='utf-8'))
    mask_path = PACKAGE / 'coverage-mask.json'
    before = digest(mask_path)
    top_path = ROOT / spec['innerTop']
    outer_path = ROOT / spec['outer']
    top_glb, top_primitive, top_positions, top_indices = build.arrays(top_path, spec['innerTopPrimitive'])
    outer_glb, outer_primitive, outer_positions, outer_indices = build.arrays(outer_path)
    mask = json.loads(mask_path.read_text(encoding='utf-8'))
    assert digest(top_path) == spec['innerTopSha256'] == mask['innerTopSha256']
    assert digest(outer_path) == spec['outerSha256'] == mask['outerAssetSha256']
    assert mask['topFaceCount'] == len(top_indices)
    assert mask['topIndexComponentType'] == 5125
    index_view = top_glb.doc['bufferViews'][top_primitive['indices']]
    index_bytes = top_glb.binary[index_view.get('byteOffset', 0):index_view.get('byteOffset', 0) + index_view['byteLength']]
    assert digest_bytes(index_bytes) == mask['topIndexAccessorSha256']
    selected = mask['selectedFaceIds']
    assert selected and len(selected) == len(set(selected))
    assert all(0 <= face < len(top_indices) for face in selected)
    assert mask['selectedTriangles'] == top_indices[selected].astype(int).tolist()
    top_triangles = top_positions[top_indices]
    outer_triangles = outer_positions[outer_indices]
    distances = build.point_triangle_distance(top_triangles.reshape(-1, 3), outer_triangles).reshape(-1, 3)
    centroids = top_triangles.mean(1)
    assert np.all(distances[selected].max(1) <= spec['distanceLimitM'] + 1e-9)
    assert np.all(centroids[selected, 2] >= spec['backZMinM'])
    assert np.all((centroids[selected, 1] >= spec['centroidYRangeM'][0]) & (centroids[selected, 1] <= spec['centroidYRangeM'][1]))
    assert np.all(np.abs(centroids[selected, 0]) <= spec['centroidAbsXMaxM'])
    normals = np.array(outer_glb.accessor(outer_primitive['attributes']['NORMAL']), dtype=float)[outer_indices].mean(1)
    normals /= np.maximum(np.linalg.norm(normals, axis=1), 1e-20)[:, None]
    samples = np.concatenate((top_triangles[selected], top_triangles[selected].mean(1)[:, None, :],
                              (top_triangles[selected][:, [0, 1, 2]] + top_triangles[selected][:, [1, 2, 0]]) / 2), axis=1).reshape(-1, 3)
    nearest_distance, nearest_triangle, nearest_points = build.nearest_surface(samples, outer_triangles, normals)
    signed_inside = np.einsum('ki,ki->k', samples - nearest_points, normals[nearest_triangle])
    assert np.all(signed_inside >= -1e-7)
    construction = json.loads((ROOT / 'assets-source/m2-outer-panels-v2/generated/construction.json').read_text(encoding='utf-8'))
    boundary = outer_positions[np.array(construction['boundaryEdges'], dtype=int)]
    boundary_margin = build.boundary_distance(samples, boundary)
    assert boundary_margin.min() >= 0.005
    source_hashes = {str(top_path): digest(top_path), str(outer_path): digest(outer_path)}
    build.build()
    assert digest(mask_path) == before
    assert source_hashes == {str(top_path): digest(top_path), str(outer_path): digest(outer_path)}
    result = {
        'schema': 'zbgs-garment-coverage-qa-v1',
        'passed': True,
        'checks': ['pinned source SHA', 'top index identity', 'nonempty face selection', 'back-region criteria',
                   'all corner distances within 6mm', 'all vertex/edge-midpoint samples on inner side',
                   'open-boundary margin >= 5mm', 'deterministic rebuild', 'source bytes unchanged'],
        'selectedTriangles': len(selected),
        'coveredAreaM2': mask['coveredAreaM2'],
        'sampleCount': len(samples),
        'minNearestOuterDistanceM': float(nearest_distance.min()),
        'maxNearestOuterDistanceM': float(nearest_distance.max()),
        'minInnerSideSignedM': float(signed_inside.min()),
        'minOpenBoundaryMarginM': float(boundary_margin.min()),
        'sourceSha256': source_hashes,
        'GPUUsed': False,
        'runtimeOrVisualAcceptance': False,
    }
    (PACKAGE / 'qa-report.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))


def digest_bytes(value):
    return hashlib.sha256(value).hexdigest()


if __name__ == '__main__':
    check()
