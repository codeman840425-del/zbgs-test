"""Build a continuous one-piece shell from intact male skin, not prior clothes."""
from pathlib import Path
import argparse
import collections
import hashlib
import importlib.util
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-onepiece-v1'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def exporter():
    module_spec = importlib.util.spec_from_file_location('male_export', ROOT / 'scripts/m1b-assets/build.py')
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def topology(faces, count):
    edges = collections.defaultdict(list)
    adjacent = collections.defaultdict(set)
    for tri in faces:
        for a, b in zip(tri, np.roll(tri, -1)):
            a, b = int(a), int(b)
            edges[tuple(sorted((a, b)))].append((a, b))
            adjacent[a].add(b)
            adjacent[b].add(a)
    assert all(len(uses) <= 2 for uses in edges.values()), 'nonmanifold surface'
    assert all(len(uses) == 1 or uses[0] == uses[1][::-1] for uses in edges.values()), 'inconsistent orientation'
    pending = set(range(count))
    components = 0
    while pending:
        components += 1
        stack = [pending.pop()]
        while stack:
            for other in adjacent[stack.pop()]:
                if other in pending:
                    pending.remove(other)
                    stack.append(other)
    return edges, components


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--spec', default=str(BASE / 'spec.json'))
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    spec_path = Path(args.spec).resolve()
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    output = (BASE / args.out).resolve()
    assert output.is_relative_to(BASE) and output != BASE
    output.mkdir(parents=True)
    m = exporter()
    assert sha(ROOT / spec['bodyPath']) == spec['bodySha256'] == m.SPEC['roundtripSha256']
    primitive = next(i for i, p in enumerate(m.src['meshes'][m.body_mesh]['primitives'])
                     if '_Body_00_SKIN' in m.src['materials'][p['material']]['name'])
    source, triangles = m.arrays(primitive)
    dense = np.zeros((len(source['POSITION']), len(m.skin['joints'])))
    for column in range(4):
        np.add.at(dense, (np.arange(len(dense)), source['JOINTS_0'][:, column]), source['WEIGHTS_0'][:, column])
    knee_y = []
    for i, node in enumerate(m.src['nodes']):
        if node.get('name') not in ['J_Bip_L_LowerLeg', 'J_Bip_R_LowerLeg']:
            continue
        position = np.array(node.get('translation', [0, 0, 0]), dtype=float)
        while i in m.parents:
            i = m.parents[i]
            position += m.src['nodes'][i].get('translation', [0, 0, 0])
        knee_y.append(position[1])
    assert len(knee_y) == 2
    hem = max(knee_y) + spec['hemAboveKneeMetres']
    # Each halfspace retains the body-facing interior of the garment pattern.
    planes = [(np.array([0., 1., 0.]), -hem), (np.array([0., -1., 0.]), spec['neckOpeningYMetres']),
              (np.array([-1., 0., 0.]), spec['sleeveOpeningAbsXMetres']), (np.array([1., 0., 0.]), spec['sleeveOpeningAbsXMetres'])]
    vertices, faces, lookup = [], [], {}
    seam_weight_delta = 0.

    def vertex(value):
        nonlocal seam_weight_delta
        key = tuple(np.round(value[:3], 7))
        if key not in lookup:
            lookup[key] = len(vertices)
            vertices.append(value)
        else:
            seam_weight_delta = max(seam_weight_delta, float(np.max(np.abs(vertices[lookup[key]][6:] - value[6:]))))
        return lookup[key]

    values = np.column_stack([source['POSITION'], source['NORMAL'], dense])
    for triangle in triangles:
        polygon = [values[int(i)].copy() for i in triangle]
        for normal, offset in planes:
            clipped = []
            for a, b in zip(polygon, polygon[1:] + polygon[:1]):
                da, db = np.dot(a[:3], normal) + offset, np.dot(b[:3], normal) + offset
                if da >= 0:
                    clipped.append(a)
                if (da < 0) != (db < 0):
                    clipped.append(a + (b - a) * (da / (da - db)))
            polygon = clipped
        if len(polygon) < 3:
            continue
        indices = [vertex(value) for value in polygon]
        faces.extend([indices[0], indices[i], indices[i + 1]] for i in range(1, len(indices) - 1))
    values, faces = np.array(vertices), np.array(faces, dtype=np.uint32)
    assert seam_weight_delta < 1e-5, ('coincident skin weights disagree', seam_weight_delta)
    edges, components = topology(faces, len(values))
    assert components == 1, 'chest, waist, pelvis and both legs must be connected'
    boundary = [uses[0] for uses in edges.values() if len(uses) == 1]
    boundary_graph = collections.defaultdict(set)
    for a, b in boundary:
        boundary_graph[a].add(b)
        boundary_graph[b].add(a)
    assert all(len(neighbors) == 2 for neighbors in boundary_graph.values()), 'opening is not a closed loop'
    remaining = set(boundary_graph)
    loops = []
    while remaining:
        loop, stack = [], [remaining.pop()]
        while stack:
            point = stack.pop()
            loop.append(point)
            for other in boundary_graph[point]:
                if other in remaining:
                    remaining.remove(other)
                    stack.append(other)
        loops.append(loop)
    assert len(loops) == 5, ('expected neckline, two sleeves and two leg hems', len(loops))
    points = values[:, :3]
    # UV seams contain separate authored normals. After welding, deriving the
    # normal from both sides prevents a center seam from moving into one side.
    normal = np.zeros_like(points)
    surface_cross = np.cross(points[faces[:, 1]] - points[faces[:, 0]], points[faces[:, 2]] - points[faces[:, 0]])
    for column in range(3):
        np.add.at(normal, faces[:, column], surface_cross)
    normal /= np.linalg.norm(normal, axis=1)[:, None]
    weights = values[:, 6:]
    joints = np.argsort(-weights, axis=1, kind='stable')[:, :4]
    packed = np.take_along_axis(weights, joints, axis=1)
    discarded = 1 - packed.sum(1)
    assert discarded.max() < .025, 'cut-edge interpolation loses significant skin influence'
    packed /= packed.sum(1)[:, None]
    count = len(points)
    outer = points + normal * spec['outerSurfaceOffsetMetres']
    positions = np.vstack([outer, outer - normal * spec['clothThicknessMetres']])
    rims = [[a, b + count, b] for a, b in boundary] + [[a, a + count, b + count] for a, b in boundary]
    shell_faces = np.vstack([faces, faces[:, ::-1] + count, np.array(rims, dtype=np.uint32)])
    shell_edges, shell_components = topology(shell_faces, len(positions))
    assert shell_components == 1 and all(len(uses) == 2 for uses in shell_edges.values())
    normals = np.zeros_like(positions)
    cross = np.cross(positions[shell_faces[:, 1]] - positions[shell_faces[:, 0]], positions[shell_faces[:, 2]] - positions[shell_faces[:, 0]])
    for column in range(3):
        np.add.at(normals, shell_faces[:, column], cross)
    assert np.min(np.linalg.norm(cross, axis=1)) > 1e-12
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    uv = np.column_stack([points[:, 0] + .5, points[:, 1] / 2])
    attributes = {'POSITION': positions.astype('<f4'), 'NORMAL': normals.astype('<f4'), 'TEXCOORD_0': np.vstack([uv, uv]).astype('<f4'),
                  'JOINTS_0': np.vstack([joints, joints]).astype('<u2'), 'WEIGHTS_0': np.vstack([packed, packed]).astype('<f4')}
    m.OUT = output
    material = {'name': 'M2_OnePiece_Teal', 'doubleSided': False, 'pbrMetallicRoughness': {'baseColorFactor': spec['color'], 'metallicFactor': 0, 'roughnessFactor': .9}, 'extensions': {'KHR_materials_unlit': {}}}
    entry = m.export(spec['id'], '男性短袖短腿连体练功服（技术样件）', 'onePiece', [(attributes, shell_faces, material)], spec['method'])
    entry.update(styleId=spec['styleId'], fitId=spec['fitId'], version=1, limits=['Exact original male only; no shape-variant fit.', 'Skinning-only; static and animated acceptance separate.', 'Intact body; no body coverage masks.'])
    np.savez_compressed(output / 'mesh-source.npz', bodySurface=points, surfaceFaces=faces, sourceNormals=normal, positions=positions,
                        faces=shell_faces, joints=joints, weights=packed, openingVertexCounts=np.array([len(loop) for loop in loops]))
    write(output / 'equipment-entry.json', entry)
    write(output / 'equipment.json', {'schema': 'zbgs-equipment-v1', 'items': [entry]})
    write(output / 'source-spec.json', spec)
    write(output / 'report.json', {'sourceSpecSha256': sha(spec_path), 'generatorSha256': sha(Path(__file__)), 'bodySha256': spec['bodySha256'],
          'assetSha256': entry['sha256'], 'surfaceVertices': count, 'surfaceTriangles': len(faces), 'vertices': len(positions), 'triangles': len(shell_faces),
          'connectedComponents': components, 'openingLoopCount': len(loops), 'openingVertexCounts': [len(loop) for loop in loops],
          'closedShellComponents': shell_components, 'closedShellEulerCharacteristic': len(positions) - len(shell_edges) + len(shell_faces),
          'hemYMetres': hem, 'kneesYMetres': knee_y, 'boneNames': [binding['sourceBone'] for binding in entry['bindings']],
          'maximumDiscardedWeight': float(discarded.max()), 'coincidentSourceWeightDelta': seam_weight_delta, 'originalBodyUnchanged': sha(ROOT / spec['bodyPath']) == spec['bodySha256'], 'gameAcceptance': False})
    print(json.dumps({'vertices': len(positions), 'triangles': len(shell_faces), 'openings': len(loops), 'components': components, 'maxDiscardedWeight': float(discarded.max()), 'sha256': entry['sha256']}))


if __name__ == '__main__':
    main()
