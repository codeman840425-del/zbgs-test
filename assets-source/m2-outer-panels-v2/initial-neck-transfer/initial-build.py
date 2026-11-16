"""Build one independent panel garment. Uses numpy and the existing exact male exporter."""
from pathlib import Path
import argparse
import collections
import hashlib
import importlib.util
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-outer-panels-v2'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_exporter():
    module_spec = importlib.util.spec_from_file_location('male_export', ROOT / 'scripts/m1b-assets/build.py')
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def build_pattern(spec):
    positions, faces, regions = [], [], []
    lookup = {}

    def vertex(point):
        key = tuple(np.round(point, 9))
        if key not in lookup:
            lookup[key] = len(positions)
            positions.append(point)
        return lookup[key]

    def grid(points, region, outward):
        indices = [[vertex(p) for p in row] for row in points]
        for row in range(len(indices) - 1):
            for col in range(len(indices[0]) - 1):
                a, b = indices[row][col:col + 2]
                c, d = indices[row + 1][col:col + 2]
                for tri in [[a, b, d], [a, d, c]]:
                    p, q, r = [np.array(positions[i]) for i in tri]
                    if np.dot(np.cross(q - p, r - p), outward) < 0:
                        tri.reverse()
                    faces.append(tri)
                    regions.append(region)
        return indices

    panels = {}
    columns = spec['panelColumns']
    for side in [-1, 1]:
        for front in [True, False]:
            points = []
            for row, (y, width, opening, front_z, back_z) in enumerate(spec['rows']):
                inner = opening if front else 0
                row_points = []
                fractions = np.linspace(0, 1, columns + 1) if front else np.r_[np.linspace(0, 2 / 3, 5)[:-1], np.linspace(2 / 3, 1, columns + 1)]
                for fraction in fractions:
                    x = inner + fraction * (width - inner)
                    z = front_z + 0.012 * (x / width) ** 2 if front else back_z - 0.008 * (x / width) ** 2
                    # Back neckline descends at centre while shoulder joins remain level.
                    py = y
                    if not front and row == len(spec['rows']) - 1:
                        py -= 0.02 * max(0, 1 - x / spec['rows'][-1][2])
                    row_points.append([side * x, py, z])
                points.append(row_points)
            panels[side, front] = grid(points, ('left' if side < 0 else 'right') + ('Front' if front else 'Back'), [0, 0, -1 if front else 1])

        side_points = []
        for row in range(spec['sideLastRow'] + 1):
            a = np.array(positions[panels[side, True][row][-1]])
            b = np.array(positions[panels[side, False][row][-1]])
            side_points.append([(a * (1 - t) + b * t + np.array([side * spec['sideBulgeM'] * np.sin(np.pi * t), 0, 0])).tolist()
                                for t in np.linspace(0, 1, spec['sideSegments'] + 1)])
        grid(side_points, 'sideSeam', [side, 0, 0])

        # Shoulder uses the front top column layout, with corresponding back edge split.
        front_top = [positions[i] for i in panels[side, True][-1]]
        shoulder_points = []
        for t in np.linspace(0, 1, spec['shoulderSegments'] + 1):
            row_points = []
            for point in front_top:
                x, y, z = point
                width, back_z = spec['rows'][-1][1], spec['rows'][-1][4]
                endpoint_z = back_z - 0.008 * (x / width) ** 2
                row_points.append([x, y + spec['shoulderArchM'] * np.sin(np.pi * t), z * (1 - t) + endpoint_z * t])
            shoulder_points.append(row_points)
        grid(shoulder_points, 'shoulderStrap', [0, 1, 0])

    return np.array(positions, dtype=float), np.array(faces, dtype=np.uint32), regions


def transfer_weights(points, source, triangles, bone_count):
    dense = np.zeros((len(source['POSITION']), bone_count))
    for column in range(4):
        np.add.at(dense, (np.arange(len(dense)), source['JOINTS_0'][:, column]), source['WEIGHTS_0'][:, column])
    corners = source['POSITION'][triangles].astype(float)
    a, b, c = corners[:, 0], corners[:, 1], corners[:, 2]
    ab, ac = b - a, c - a
    aa, bb, cc = (ab * ab).sum(1), (ab * ac).sum(1), (ac * ac).sum(1)
    denominator = aa * cc - bb * bb
    correspondence, weights = [], []
    for point in points:
        delta = point - a
        d, e = (delta * ab).sum(1), (delta * ac).sum(1)
        v = np.divide(cc * d - bb * e, denominator, out=np.zeros_like(d), where=denominator > 1e-20)
        w = np.divide(aa * e - bb * d, denominator, out=np.zeros_like(e), where=denominator > 1e-20)
        bary = np.stack([1 - v - w, v, w], axis=1)
        projected = (corners * bary[:, :, None]).sum(1)
        distances = ((projected - point) ** 2).sum(1)
        distances[(bary < 0).any(1) | (denominator <= 1e-20)] = np.inf
        candidates = [(distances, bary)]
        for first, second in [(0, 1), (1, 2), (2, 0)]:
            edge = corners[:, second] - corners[:, first]
            fraction = np.clip(((point - corners[:, first]) * edge).sum(1) / np.maximum((edge * edge).sum(1), 1e-20), 0, 1)
            edge_bary = np.zeros_like(bary)
            edge_bary[:, first], edge_bary[:, second] = 1 - fraction, fraction
            distance = ((corners[:, first] + fraction[:, None] * edge - point) ** 2).sum(1)
            candidates.append((distance, edge_bary))
        choice, face = min(((k, int(np.argmin(item[0]))) for k, item in enumerate(candidates)), key=lambda pair: candidates[pair[0]][0][pair[1]])
        bary = candidates[choice][1][face]
        weights.append((dense[triangles[face]] * bary[:, None]).sum(0))
        correspondence.append({'triangle': face, 'barycentric': bary.tolist(), 'distanceM': float(np.sqrt(candidates[choice][0][face]))})
    return np.array(weights), correspondence


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='generated')
    args = parser.parse_args()
    output = (BASE / args.out).resolve()
    assert output.is_relative_to(BASE) and output != BASE and not output.exists()
    spec = json.loads((BASE / 'spec.json').read_text(encoding='utf-8'))
    exporter = load_exporter()
    assert sha(ROOT / spec['parentTop']) == spec['parentTopSha256']
    assert exporter.SPEC['roundtripSha256'] == spec['bodySha256']
    primitive = next(i for i, p in enumerate(exporter.src['meshes'][exporter.body_mesh]['primitives']) if '_Tops_' in exporter.src['materials'][p['material']]['name'])
    source, source_triangles = exporter.arrays(primitive)
    p, f, regions = build_pattern(spec)
    normal = np.zeros_like(p)
    crosses = np.cross(p[f[:, 1]] - p[f[:, 0]], p[f[:, 2]] - p[f[:, 0]])
    for column in range(3):
        np.add.at(normal, f[:, column], crosses)
    normal /= np.linalg.norm(normal, axis=1)[:, None]
    weights, correspondence = transfer_weights(p, source, source_triangles, len(exporter.skin['joints']))
    joints = np.argsort(-weights, axis=1, kind='stable')[:, :4]
    packed_weights = np.take_along_axis(weights, joints, axis=1)
    discarded = 1 - packed_weights.sum(1)
    packed_weights /= packed_weights.sum(1)[:, None]
    edges = collections.defaultdict(list)
    for tri in f:
        for a, b in zip(tri, np.roll(tri, -1)):
            edges[tuple(sorted((int(a), int(b))))].append((int(a), int(b)))
    assert not any(len(uses) > 2 for uses in edges.values()), 'nonmanifold surface'
    assert all(len(uses) == 1 or uses[0] == uses[1][::-1] for uses in edges.values()), 'inconsistent seam orientation'
    boundary = [uses[0] for uses in edges.values() if len(uses) == 1]
    count = len(p)
    positions = np.vstack([p, p - normal * spec['thicknessM']])
    rims = [[a, b + count, b] for a, b in boundary] + [[a, a + count, b + count] for a, b in boundary]
    triangles = np.vstack([f, f[:, ::-1] + count, np.array(rims, dtype=np.uint32)])
    normals = np.zeros_like(positions)
    cross = np.cross(positions[triangles[:, 1]] - positions[triangles[:, 0]], positions[triangles[:, 2]] - positions[triangles[:, 0]])
    for column in range(3):
        np.add.at(normals, triangles[:, column], cross)
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    uv = np.stack([p[:, 0], p[:, 1]], axis=1)
    attrs = {'POSITION': positions.astype('<f4'), 'NORMAL': normals.astype('<f4'), 'TEXCOORD_0': np.vstack([uv, uv]).astype('<f4'),
             'JOINTS_0': np.vstack([joints, joints]).astype('<u2'), 'WEIGHTS_0': np.vstack([packed_weights, packed_weights]).astype('<f4')}
    output.mkdir(parents=True)
    exporter.OUT = output
    material = {'name': 'M2_Panels_Navy', 'doubleSided': False, 'pbrMetallicRoughness': {'baseColorFactor': spec['color'], 'metallicFactor': 0, 'roughnessFactor': 0.9}, 'extensions': {'KHR_materials_unlit': {}}}
    entry = exporter.export(spec['id'], '男性独立裁片开襟无袖外搭（技术样件）', 'outerwear', [(attrs, triangles, material)], spec['method'])
    entry.update(styleId=spec['styleId'], fitId=spec['fitId'], version=2, layerWith=spec['layerWith'], allowedBottoms=spec['allowedBottoms'],
                 limits=['Exact original male only. No automatic body morph adaptation.', 'Static and animated acceptance reported separately.', 'Skinning only. No cloth dynamics or coverage masks.'])
    report = {'specSha256': sha(BASE / 'spec.json'), 'generatorSha256': sha(Path(__file__)), 'assetSha256': entry['sha256'],
              'bodySha256': spec['bodySha256'], 'topSha256': spec['parentTopSha256'], 'surfaceVertices': count, 'surfaceTriangles': len(f),
              'vertices': len(positions), 'triangles': len(triangles), 'boundaryEdges': len(boundary), 'boneCount': len(entry['bindings']),
              'boneNames': [bone['sourceBone'] for bone in entry['bindings']], 'maxDiscardedWeight': float(discarded.max()),
              'multiBoneSurfaceVertices': int(np.count_nonzero((packed_weights > 0.001).sum(1) > 1)), 'runtimeAccepted': False}
    files = {'equipment-entry.json': entry, 'equipment.json': {'schema': 'zbgs-equipment-v1', 'items': [entry]}, 'report.json': report,
             'construction.json': {'positions': p.tolist(), 'faces': f.tolist(), 'faceRegions': regions, 'boundaryEdges': boundary, 'continuousNormals': normal.tolist(), 'weightCorrespondence': correspondence}}
    for filename, value in files.items():
        (output / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
