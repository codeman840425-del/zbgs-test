"""CPU source, rest-pose fit and deterministic export checks for the paired stud."""
from collections import Counter
import copy
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build
from flow import GLB


def nearest_surface(points, triangles):
    best = np.full(len(points), np.inf)
    best_face = np.zeros(len(points), dtype=int)
    for index, triangle in enumerate(triangles):
        a, b, c = triangle
        ab, ac = b-a, c-a
        normal = np.cross(ab, ac)
        denominator = float(np.dot(normal, normal))
        if denominator < 1e-20:
            continue
        projected = points-((points-a) @ normal / denominator)[:, None]*normal
        dot00, dot01, dot11 = np.dot(ab, ab), np.dot(ab, ac), np.dot(ac, ac)
        dot20, dot21 = (projected-a) @ ab, (projected-a) @ ac
        inverse = 1/(dot00*dot11-dot01*dot01)
        u = (dot11*dot20-dot01*dot21)*inverse
        v = (dot00*dot21-dot01*dot20)*inverse
        inside = (u >= 0) & (v >= 0) & (u+v <= 1)
        squared = np.full(len(points), np.inf)
        for start, end in [(a, b), (a, c), (b, c)]:
            edge = end-start
            t = np.clip((points-start) @ edge / np.dot(edge, edge), 0, 1)
            closest = start+t[:, None]*edge
            squared = np.minimum(squared, ((points-closest)**2).sum(1))
        squared[inside] = ((points[inside]-projected[inside])**2).sum(1)
        replace = squared < best
        best[replace] = squared[replace]
        best_face[replace] = index
    return np.sqrt(best), best_face


def main():
    package = build.PACKAGE
    spec = json.loads((package/'spec.json').read_text(encoding='utf-8'))
    generated = package/'generated'
    original_avatar_hashes = {name: build.digest(build.local(build.ROOT, row['path']).read_bytes()) for name, row in spec['inputs'].items()}
    ignored = {'qa-report.json', 'package-files.json'}
    before = {path.name: build.digest(path.read_bytes()) for path in generated.iterdir() if path.is_file() and path.name not in ignored}
    build.main()
    require = build.require
    require(before == {path.name: build.digest(path.read_bytes()) for path in generated.iterdir() if path.is_file() and path.name not in ignored}, 'Repeated source production changed outputs')
    asset = GLB((generated/'stud.glb').read_bytes())
    primitive = asset.doc['meshes'][0]['primitives'][0]
    positions = np.array(asset.accessor(primitive['attributes']['POSITION']))
    normals = np.array(asset.accessor(primitive['attributes']['NORMAL']))
    indices = np.array(asset.accessor(primitive['indices']), dtype=int).reshape(-1, 3)
    variant = GLB((generated/'stud-parameter-variant.glb').read_bytes())
    variant_primitive = variant.doc['meshes'][0]['primitives'][0]
    variant_positions = np.array(variant.accessor(variant_primitive['attributes']['POSITION']))
    require(np.max(np.abs(positions[:, 0])) != np.max(np.abs(variant_positions[:, 0])) and
            abs(np.max(variant_positions[:, 0])-spec['parameterVariant']['value']) < 1e-8,
            'Parameter edit must change actual exported radius')
    triangles = positions[indices]
    cross = np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0])
    require(np.min(np.linalg.norm(cross, axis=1)) > 1e-10, 'Degenerate accessory triangle')
    require(np.all((cross*normals[indices].mean(1)).sum(1) > 0), 'Accessory winding/normal mismatch')
    edges = Counter(tuple(sorted((int(a), int(b)))) for tri in indices for a, b in zip(tri, np.roll(tri, -1)))
    require(set(edges.values()) == {2}, 'Accessory must be a closed two-manifold mesh')
    require(not asset.doc.get('skins') and not asset.doc.get('textures') and not asset.doc.get('animations'), 'Unexpected skinned/textured/dynamic stud')
    observations = []
    for body_type, source in spec['inputs'].items():
        fit = json.loads((generated/(body_type+'-fit.json')).read_text(encoding='utf-8'))
        pair = GLB((generated/(body_type+'-pair-head-local.glb')).read_bytes()).doc
        require(pair['scenes'][0]['nodes'] == [0, 1] and len(pair['nodes']) == 2 and
                pair['nodes'][0]['name'] != pair['nodes'][1]['name'], 'Pair must contain independent side nodes')
        for node, mount in zip(pair['nodes'], fit['mounts']):
            require(node['translation'] == mount['position'] and node['rotation'] == mount['quaternion'] and
                    node['scale'] == [1, 1, 1] and node['extras']['semanticSocket'] == mount['socket'], 'Pair fixture and fit differ')
        source_glb = GLB(build.local(build.ROOT, source['path']).read_bytes())
        p = source_glb.doc['meshes'][source['meshIndex']]['primitives'][source['primitiveIndex']]
        face_positions = np.array(source_glb.accessor(p['attributes']['POSITION']))
        face_normals = np.array(source_glb.accessor(p['attributes']['NORMAL']))
        face_indices = np.array(source_glb.accessor(p['indices']), dtype=int).reshape(-1, 3)
        head_world = np.array(fit['headWorldRestMatrixColumnMajor']).reshape(4, 4).T
        face_world = np.array(fit['faceWorldRestMatrixColumnMajor']).reshape(4, 4).T
        source_world = (face_world @ np.column_stack([face_positions, np.ones(len(face_positions))]).T).T[:, :3]
        source_normals = (np.linalg.inv(face_world[:3, :3]).T @ face_normals.T).T
        for mount in fit['mounts']:
            require(mount['scale'] == [1, 1, 1] and mount['trace']['basisDeterminant'] > .999999, 'Invalid mount handedness')
            matrix = build.rotation(mount['quaternion'])
            world = (head_world @ np.column_stack([positions @ matrix.T+mount['position'], np.ones(len(positions))]).T).T[:, :3]
            samples = np.vstack([world, world[indices].mean(1)])
            distance, nearest = nearest_surface(samples, source_world[face_indices])
            surface_normals = source_normals[face_indices[nearest]].mean(1)
            surface_normals /= np.linalg.norm(surface_normals, axis=1)[:, None]
            # Signed distance uses the nearest source triangle plane. It is a
            # sampled rest-pose witness, not a full triangle collision solver.
            signed = ((samples-source_world[face_indices[nearest, 0]])*surface_normals).sum(1)
            require(signed.min() >= -.0001, 'Stud rest samples visibly inside source ear: '+body_type+'/'+mount['side'])
            observations.append({'bodyType': body_type, 'side': mount['side'], 'socket': mount['socket'],
                                 'sampleCount': len(samples), 'minimumDistanceToFaceM': float(distance.min()),
                                 'minimumSignedSourceNormalDistanceM': float(signed.min()),
                                 'earComponentVertices': mount['trace']['earComponentVertexCount']})
        require(build.digest(build.local(build.ROOT, source['path']).read_bytes()) == original_avatar_hashes[body_type], 'Original avatar changed')
    changed = copy.deepcopy(spec)
    changed['inputs']['male']['sha256'] = '0'*64
    try:
        build.source_fit('male', changed['inputs']['male'], changed, build.digest((generated/'stud.glb').read_bytes()))
    except ValueError:
        pass
    else:
        raise AssertionError('Wrong base identity accepted')
    report = {'schema': 'zbgs-paired-ear-accessory-qa-v1', 'passed': True, 'vertices': len(positions), 'triangles': len(indices),
              'checks': ['positive-scale independent semantic sides', 'actual ear component/triangle and head-weight trace', 'closed oriented geometry',
                         'source parameter edit changes export', 'repeated export bytes identical', 'sampled source-ear clearance',
                         'wrong base SHA rejected', 'original avatar SHA unchanged'], 'observations': observations,
              'GPUUsed': False, 'BlenderUsed': False, 'runtimeAccepted': False,
              'limits': ['Surface sampling only, not full triangle collision or movement acceptance', 'Hair/glasses coexistence and room visibility remain untested']}
    build.write_json(generated/'qa-report.json', report)
    files = []
    for directory in [package, generated, Path(__file__).resolve().parent]:
        for path in sorted(directory.iterdir()):
            if path.is_file() and path.name != 'package-files.json':
                files.append({'path': path.relative_to(build.ROOT).as_posix(), 'sha256': build.digest(path.read_bytes()), 'bytes': path.stat().st_size})
    build.write_json(generated/'package-files.json', {'schema': 'zbgs-paired-ear-accessory-files-v1', 'files': files})
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
