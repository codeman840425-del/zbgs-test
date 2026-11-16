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


def build_pattern(spec, source, source_triangles, shoulder_outer_x):
    source_points = source['POSITION'][source_triangles].astype(float)
    ray_samples = []

    def section(axis, first, second, maximum, label):
        other = [i for i in range(3) if i != axis]
        a = source_points[:, 0][:, other]
        b = source_points[:, 1][:, other] - a
        c = source_points[:, 2][:, other] - a
        q = np.array([first, second]) - a
        determinant = b[:, 0] * c[:, 1] - b[:, 1] * c[:, 0]
        valid = np.abs(determinant) > 1e-14
        v = np.divide(q[:, 0] * c[:, 1] - q[:, 1] * c[:, 0], determinant, out=np.zeros(len(q)), where=valid)
        w = np.divide(b[:, 0] * q[:, 1] - b[:, 1] * q[:, 0], determinant, out=np.zeros(len(q)), where=valid)
        valid &= (v >= -1e-7) & (w >= -1e-7) & (v + w <= 1 + 1e-7)
        candidates = np.flatnonzero(valid)
        assert len(candidates), ('section misses original garment', axis, first, second, label)
        barycentric = np.stack([1 - v - w, v, w], axis=1)
        points = (source_points * barycentric[:, :, None]).sum(1)
        face = int(candidates[np.argmax(points[candidates, axis]) if maximum else np.argmin(points[candidates, axis])])
        point = points[face]
        ray_samples.append({'region': label, 'axis': axis, 'fixed': [first, second], 'sourceTriangle': face,
                            'barycentric': barycentric[face].tolist(), 'referencePoint': point.tolist()})
        return point

    positions, faces, regions = [], [], []
    lookup = {}

    def vertex(point):
        key = tuple(np.round(point, 8))
        if key not in lookup:
            lookup[key] = len(positions)
            positions.append(point.tolist())
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
        widths = []
        for row, y in enumerate(spec['rowY']):
            side_point = section(0, y, -0.02, side > 0, 'torsoWidthReference')
            lower_width = abs(side_point[0]) * 0.88
            underarm_y = spec['rowY'][spec['sideLastRow']]
            fraction = np.clip((y - underarm_y) / (spec['rowY'][-1] - underarm_y), 0, 1)
            base_width = widths[spec['sideLastRow']] if row > spec['sideLastRow'] else lower_width
            width = base_width * (1 - fraction) + shoulder_outer_x * fraction
            widths.append(min(width, shoulder_outer_x + 0.025 * (1 - fraction)))
        for front in [True, False]:
            points = []
            for row, y in enumerate(spec['rowY']):
                width = widths[row]
                opening = spec['frontOpeningM'][row]
                inner = opening if front else 0
                split = spec['shoulderInnerX'] / shoulder_outer_x
                fractions = np.linspace(0, 1, columns + 1) if front else np.r_[np.linspace(0, split, 4)[:-1], np.linspace(split, 1, columns + 1)]
                row_points = []
                for fraction in fractions:
                    x = side * (inner + fraction * (width - inner))
                    py = y
                    if row == spec['sideLastRow']:
                        py += 0.025 * fraction ** 4
                    point = section(2, x, py, not front, 'frontPanel' if front else 'backPanel')
                    if row == len(spec['rowY']) - 1 and abs(x) >= spec['shoulderInnerX'] - 1e-8:
                        point = section(1, x, point[2], True, 'shoulderEndpoint')
                    row_points.append(point)
                points.append(row_points)
            panels[side, front] = grid(points, ('left' if side < 0 else 'right') + ('Front' if front else 'Back'), [0, 0, -1 if front else 1])

        side_points = []
        for row in range(spec['sideLastRow'] + 1):
            a = np.array(positions[panels[side, True][row][-1]])
            b = np.array(positions[panels[side, False][row][-1]])
            row_points = []
            for fraction in np.linspace(0, 1, spec['sideSegments'] + 1):
                point = a * (1 - fraction) + b * fraction
                hem_y = spec['rowY'][0]
                upper_edge_y = spec['rowY'][spec['sideLastRow']] + 0.025
                height_fraction = (point[1] - hem_y) / (upper_edge_y - hem_y)
                point[1] -= spec['underarmDepthM'] * np.sin(np.pi * fraction) * height_fraction
                if fraction not in [0, 1]:
                    point = section(0, point[1], point[2], side > 0, 'sideSeam')
                row_points.append(point)
            side_points.append(row_points)
        grid(side_points, 'sideSeam', [side, 0, 0])

        front_top = [np.array(positions[i]) for i in panels[side, True][-1]]
        back_top = [np.array(positions[i]) for i in panels[side, False][-1][-columns - 1:]]
        shoulder_points = []
        for fraction in np.linspace(0, 1, spec['shoulderSegments'] + 1):
            row_points = []
            for front, back in zip(front_top, back_top):
                assert abs(front[0] - back[0]) < 1e-7
                point = front * (1 - fraction) + back * fraction
                if fraction not in [0, 1]:
                    point = section(1, point[0], point[2], True, 'shoulderSupport')
                row_points.append(point)
            shoulder_points.append(row_points)
        grid(shoulder_points, 'shoulderStrap', [0, 1, 0])
    return np.array(positions, dtype=float), np.array(faces, dtype=np.uint32), regions, ray_samples



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


def fit_local_envelope(points, faces, normals, source, source_triangles, gap):
    """Measure source folds covered by each new panel facet and retain that support."""
    corners = source['POSITION'][source_triangles].astype(float)
    samples = np.vstack([source['POSITION'], corners.mean(1), (corners[:, 0] + corners[:, 1]) / 2,
                         (corners[:, 1] + corners[:, 2]) / 2, (corners[:, 2] + corners[:, 0]) / 2])
    offsets = np.full(len(points), gap)
    supports = []
    for face in faces:
        a, b, c = points[face]
        ab, ac = b - a, c - a
        cross = np.cross(ab, ac)
        normal = cross / np.linalg.norm(cross)
        delta = samples - a
        aa, bb, cc = ab @ ab, ab @ ac, ac @ ac
        d, e = delta @ ab, delta @ ac
        determinant = aa * cc - bb * bb
        v, w = (cc * d - bb * e) / determinant, (aa * e - bb * d) / determinant
        inside = (v >= -1e-7) & (w >= -1e-7) & (v + w <= 1 + 1e-7)
        height = max(0, float(np.max(delta[inside] @ normal))) if np.any(inside) else 0
        alignment = normals[face] @ normal
        assert np.min(alignment) > 0.05, 'Panel requires geometric correction before support fitting'
        required = (height + gap) / alignment
        offsets[face] = np.maximum(offsets[face], required)
        supports.append(height)
    return offsets, supports


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
    shoulder_indices = [i for i, node in enumerate(exporter.src['nodes']) if node.get('name') in ['J_Bip_L_UpperArm', 'J_Bip_R_UpperArm']]
    upper_arm_x = [abs(exporter.ibm[exporter.skin['joints'].index(i)][12]) for i in shoulder_indices]
    shoulder_outer_x = float(min(upper_arm_x)) - spec['shoulderInsetFromUpperArmM']
    p, f, regions, section_samples = build_pattern(spec, source, source_triangles, shoulder_outer_x)
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
    local_offsets, support_heights = fit_local_envelope(p, f, normal, source, source_triangles, spec['surfaceGapM'])
    outer = p + normal * local_offsets[:, None]
    positions = np.vstack([outer, outer - normal * spec['thicknessM']])
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
              'multiBoneSurfaceVertices': int(np.count_nonzero((packed_weights > 0.001).sum(1) > 1)),
              'localSupportOffsetRangeM': [float(local_offsets.min()), float(local_offsets.max())], 'runtimeAccepted': False}
    files = {'equipment-entry.json': entry, 'equipment.json': {'schema': 'zbgs-equipment-v1', 'items': [entry]}, 'report.json': report,
             'construction.json': {'positions': p.tolist(), 'faces': f.tolist(), 'faceRegions': regions, 'boundaryEdges': boundary, 'continuousNormals': normal.tolist(),
                                   'weightCorrespondence': correspondence, 'sectionSamples': section_samples, 'shoulderOuterXFromOriginalUpperArmBind': shoulder_outer_x,
                                   'measuredFaceSupportHeightsM': support_heights, 'localSupportOffsetsM': local_offsets.tolist()}}
    for filename, value in files.items():
        (output / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
