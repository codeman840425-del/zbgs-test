"""Actual rest-pose triangle audit in Blender. Body remains complete and visible."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-onepiece-v1'
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
output = (BASE / args.out).resolve()
assert output.is_relative_to(BASE)
module_spec = importlib.util.spec_from_file_location('glb', ROOT / 'scripts/m2-male-face-v1/glb.py')
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)
spec = json.loads((output / 'source-spec.json').read_text(encoding='utf-8'))
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def surface(path, body_only=False):
    glb = module.GLB(path)
    positions, faces = [], []
    for mesh in glb.doc['meshes']:
        for primitive in mesh['primitives']:
            if body_only and '_Body_00_SKIN' not in glb.doc['materials'][primitive['material']]['name']:
                continue
            points = glb.acc(primitive['attributes']['POSITION'])
            triangles = glb.acc(primitive['indices']).reshape(-1, 3)
            faces.extend(triangles + len(positions))
            positions.extend(points)
    return np.array(positions), np.array(faces)


asset = output / 'author-export.glb'
positions, faces = surface(asset)
tree = BVHTree.FromPolygons(positions.tolist(), faces.tolist(), all_triangles=True, epsilon=0.)
body_points, body_faces = surface(ROOT / spec['bodyPath'], True)
body_tree = BVHTree.FromPolygons(body_points.tolist(), body_faces.tolist(), all_triangles=True, epsilon=0.)
body_pairs = tree.overlap(body_tree)
lookup, welded = {}, []
for point in positions:
    key = tuple(np.round(point, 6))
    lookup.setdefault(key, len(lookup))
    welded.append(lookup[key])
self_pairs = [(a, b) for a, b in tree.overlap(tree) if a < b and not(set(welded[i] for i in faces[a]) & set(welded[i] for i in faces[b]))]
cross = np.cross(positions[faces[:, 1]] - positions[faces[:, 0]], positions[faces[:, 2]] - positions[faces[:, 0]])
distances = [body_tree.find_nearest(Vector(point))[3] for point in positions]
samples = np.vstack([positions, positions[faces].mean(1), (positions[faces[:, 0]] + positions[faces[:, 1]]) / 2,
                     (positions[faces[:, 1]] + positions[faces[:, 2]]) / 2, (positions[faces[:, 2]] + positions[faces[:, 0]]) / 2])
signed = []
for point in samples:
    location, normal, _, _ = body_tree.find_nearest(Vector(point))
    signed.append((Vector(point) - location).dot(normal))
intersecting_centers = positions[faces[np.unique(np.array(body_pairs)[:, 0])]].mean(1) if body_pairs else np.zeros((0, 3))
report = {'pose': 'original raw-bind T pose only', 'assetSha256': sha(asset), 'bodySha256': sha(ROOT / spec['bodyPath']),
          'vertices': len(positions), 'triangles': len(faces), 'bodyTriangleIntersections': len(body_pairs), 'bodyPairs': body_pairs,
          'selfNonAdjacentIntersections': len(self_pairs), 'selfPairs': self_pairs, 'degenerateFaces': np.flatnonzero(np.linalg.norm(cross, axis=1) < 1e-12).tolist(),
          'minimumVertexToBodyDistanceMetres': min(distances), 'distanceLimitation': 'vertex-to-face diagnostic; not a full separation bound',
          'maximumSampledNearestNormalPenetrationMetres': max(0, -min(signed)), 'signedSampleCount': len(signed),
          'signedDepthLimitation': 'nearest source face normal, sampled vertices/centroids/edge midpoints; not a solid signed-distance or maximum triangle penetration proof',
          'bodyIntersectionFaceCenterBounds': [intersecting_centers.min(0).tolist(), intersecting_centers.max(0).tolist()] if body_pairs else None,
          'bodyHiddenOrModified': False, 'staticPassed': not body_pairs and not self_pairs and np.min(np.linalg.norm(cross, axis=1)) > 1e-12,
          'runtimeAcceptance': False}
(output / 'static-audit.json').write_text(json.dumps(report, separators=(',', ':')) + '\n', encoding='utf-8')
print(json.dumps({key: value for key, value in report.items() if key not in ['bodyPairs', 'selfPairs']}))
