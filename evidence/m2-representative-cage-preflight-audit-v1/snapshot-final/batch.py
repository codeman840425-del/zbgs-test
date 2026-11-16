"""One shared semantic cage trial. No source displacement field is evaluated."""
import argparse
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from preflight import BASE, ROOT, GLB, bpy, np, bind, encoded, evaluate, group_records, input_receipt, mesh_object, require, sha
from export import bake, normals
sys.path.insert(0, str(ROOT / 'scripts/m2-representative-batch-v1'))
import deform as source_helpers


def semantic_cage(g, records, padding):
    context = source_helpers.source_context(g)
    j = context['joints']
    points = []
    for _, primitives, P, _ in records:
        points.append(P)
        points.extend(P + np.asarray(g.accessor(t['POSITION'])) for t in primitives[0].get('targets', []))
    points = np.concatenate(points)
    head = j['head'][1]
    heights = sorted(set([float(points[:, 1].min() - padding), float(points[:, 1].max() + padding),
        j['leftFoot'][1], j['leftLowerLeg'][1], j['leftUpperLeg'][1] - .12,
        j['hips'][1] - .035, (j['hips'][1] + j['chest'][1]) / 2, j['chest'][1],
        j['neck'][1] - .06, j['neck'][1], head - .065, head - .045, head - .025,
        head - .005, head + .015, context['eyeMin'][1] - .006, head + .055, head + .10]))
    boundaries = np.asarray(heights)
    positions = []
    # Each endpoint sample is contained at both ends of its enclosing interval.
    for i, y in enumerate(boundaries):
        selected = points[(points[:, 1] >= boundaries[max(0, i - 1)]) & (points[:, 1] <= boundaries[min(i + 1, len(boundaries) - 1)])]
        if not len(selected):
            selected = points[np.argsort(abs(points[:, 1] - y))[:20]]
        low, high = selected.min(0) - padding, selected.max(0) + padding
        positions.extend([[low[0], y, low[2]], [high[0], y, low[2]],
                          [high[0], y, high[2]], [low[0], y, high[2]]])
    P = np.asarray(positions, dtype=np.float32)
    faces = [[0, 1, 2, 3]]
    for ring in range(len(boundaries) - 1):
        for side in range(4):
            a, b = ring * 4 + side, ring * 4 + (side + 1) % 4
            faces.append([a, a + 4, b + 4, b])
    end = len(P) - 4
    faces.append([end + 3, end + 2, end + 1, end])
    lower_x = np.interp(points[:, 1], boundaries, P[::4, 0])
    upper_x = np.interp(points[:, 1], boundaries, P[1::4, 0])
    lower_z = np.interp(points[:, 1], boundaries, P[::4, 2])
    upper_z = np.interp(points[:, 1], boundaries, P[2::4, 2])
    margin = np.minimum.reduce([points[:, 0] - lower_x, upper_x - points[:, 0], points[:, 2] - lower_z, upper_z - points[:, 2]])
    require(margin.min() > 0, 'Semantic cage does not contain all source endpoints')
    return P, np.asarray(faces), context, float(margin.min())


def requested_cage(P, p, context):
    # Parameters move only sparse rest-cage control rings. Blender computes all
    # interior coordinates. The former v1/v2 body/face field is never called.
    j = context['joints']
    x, y, z = P.T
    head, hips, chest = j['head'], j['hips'], j['chest']
    smooth = source_helpers.smooth
    Q = P.copy()
    torso = smooth((y - (hips[1] - .20)) / .15) * (1 - smooth((y - chest[1]) / .12))
    width = np.interp(y, [hips[1] - .035, (hips[1] + chest[1]) / 2, chest[1]], [p['hipWidth'], p['waistWidth'], p['chestWidth']])
    depth = np.interp(y, [hips[1] - .035, (hips[1] + chest[1]) / 2, chest[1]], [p['hipDepth'], p['waistDepth'], p['chestDepth']])
    arm = np.maximum(0, 1 - abs(y - j['leftUpperArm'][1]) / .13)
    thigh = np.maximum(0, 1 - abs(y - (j['leftUpperLeg'][1] + j['leftLowerLeg'][1]) / 2) / .20)
    Q[:, 0] += (x - hips[0]) * (width * torso + arm * (p['shoulderMass'] + p['upperArmRadius']) + thigh * p['thighRadius'])
    Q[:, 2] += (z - hips[2]) * (depth * torso + arm * p['upperArmRadius'] + thigh * p['thighRadius'])
    local_y = y - head[1]
    support = smooth((local_y + .09) / .04) * (1 - smooth((local_y - .015) / .035))
    jaw = 1 - smooth((local_y + .005) / .045)
    cheek = np.maximum(0, 1 - ((local_y - .005) / .045) ** 2) ** 2
    Q[:, 0] += (x - head[0]) * support * (p['jawWidth'] * jaw + p['cheekWidth'] * cheek)
    chin = support * (1 - smooth((local_y + .025) / .035))
    Q[:, 1] -= p['chinLengthM'] * chin
    Q[:, 2] -= p['chinProjectionM'] * chin
    return Q


def configure_modifier(obj, cage, config, protected):
    group = obj.vertex_groups.new(name='retained-source-feature-influence')
    active = np.flatnonzero(~protected).tolist()
    if active:
        group.add(active, 1, 'REPLACE')
    modifier = obj.modifiers.new('official-dynamic-mesh-deform', 'MESH_DEFORM')
    modifier.object = cage
    modifier.precision = config['meshDeformPrecision']
    modifier.use_dynamic_bind = True
    modifier.vertex_group = group.name
    bind(obj, modifier)
    require(modifier.is_bound, 'Actual semantic MeshDeform did not bind')
    return modifier


def solve_source(sex, source, requests, config, output):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    g = GLB((ROOT / source['body']['path']).read_bytes())
    records = group_records(g)
    rest_cage, faces, context, margin = semantic_cage(g, records, config['cagePaddingM'])
    cage = mesh_object(sex + '-shared-semantic-cage', rest_cage, faces)
    objects = {}
    for accessor, primitives, P, F in records:
        obj = mesh_object('avatar-' + str(accessor), P, F)
        protected = source_helpers.protect(g, primitives, context, P)
        configure_modifier(obj, cage, config, protected)
        obj.shape_key_add(name='Basis')
        probe = obj.shape_key_add(name='source-endpoint-and-derivative-input')
        objects[accessor] = (obj, probe, protected)
        require(np.max(abs(evaluate(obj) - P)) <= config['identityToleranceM'], 'Semantic cage identity error')
    skin = next(p for _, ps, _, _ in records for p in ps if 'Body_00_SKIN' in g.doc['materials'][p['material']]['name'])
    skin_accessor = skin['attributes']['POSITION']
    skin_P = np.asarray(g.accessor(skin_accessor), dtype=np.float32)
    skin_F = np.asarray(g.accessor(skin['indices'])).reshape(-1, 3)
    used = np.unique(skin_F)
    unique, first, inverse = np.unique(skin_P[used], axis=0, return_index=True, return_inverse=True)
    mapping = np.full(len(skin_P), -1, dtype=int)
    mapping[used] = inverse
    donor = mesh_object('immutable-body-surface-donor', unique, mapping[skin_F])
    clothing = []
    for item in source['equipment']:
        garment = GLB((ROOT / item['path']).read_bytes())
        grouped = []
        for accessor, primitives, P, F in group_records(garment):
            obj = mesh_object(item['id'] + '-' + str(accessor), P, F)
            modifier = obj.modifiers.new('official-surface-deform', 'SURFACE_DEFORM')
            modifier.target = donor
            bind(obj, modifier)
            require(modifier.is_bound, 'Actual semantic donor SurfaceDeform did not bind')
            grouped.append((accessor, P, F, obj))
        clothing.append((item, garment, grouped))
    bpy.ops.wm.save_as_mainfile(filepath=str(output / (sex + '-editable-rest.blend')), check_existing=False)
    rows = []
    for request in requests:
        started = time.monotonic()
        identifier = request['basePresetId'] + '-cage-trial-v1'
        folder = output / identifier
        folder.mkdir()
        target_cage = requested_cage(rest_cage, request['parameters'], context)
        cage.data.vertices.foreach_set('co', target_cage.ravel())
        cage.data.update()
        results = {}
        trace = []
        minimum_det = float('inf')
        for accessor, primitives, P, F in records:
            obj, key, protected = objects[accessor]
            def mapped(delta):
                key.data.foreach_set('co', (P + delta).astype(np.float32).ravel())
                key.value = 1
                obj.data.update()
                return evaluate(obj)
            def jacobian(delta):
                columns = []
                # Blender coordinates are float32. 0.1mm probes avoid the
                # catastrophic cancellation of 10um probes at metre offsets.
                for axis in range(3):
                    epsilon = np.eye(3, dtype=np.float32)[axis] * .0001
                    columns.append((mapped(delta + epsilon) - mapped(delta - epsilon)) / .0002)
                return np.stack(columns, axis=2)
            Q = mapped(np.zeros_like(P))
            J = jacobian(np.zeros_like(P))
            minimum_det = min(minimum_det, float(np.linalg.det(J).min()))
            N = np.asarray(g.accessor(primitives[0]['attributes']['NORMAL']), dtype=np.float32)
            QN = normals(Q, F, N)
            QN[protected] = N[protected]
            ends, end_normals = [], []
            for target in primitives[0].get('targets', []):
                D = np.asarray(g.accessor(target['POSITION']), dtype=np.float32)
                E = mapped(D)
                minimum_det = min(minimum_det, float(np.linalg.det(jacobian(D)).min()))
                EN = normals(E, F, N)
                EN[protected] = (N + np.asarray(g.accessor(target['NORMAL'])))[protected] if 'NORMAL' in target else N[protected]
                ends.append(E)
                end_normals.append(EN)
            key.value = 0
            results[accessor] = {'positions': Q, 'normals': QN, 'endpoints': ends, 'endpointNormals': end_normals}
            trace.append({'accessor': accessor, 'vertices': len(P), 'endpoints': len(ends),
                          'maximumDisplacementM': float(np.linalg.norm(Q - P, axis=1).max()),
                          'protectedMaximumDisplacementM': float(np.linalg.norm(Q[protected] - P[protected], axis=1).max(initial=0))})
        donor.data.vertices.foreach_set('co', results[skin_accessor]['positions'][used[first]].ravel())
        donor.data.update()
        files = {'avatar.vrm': bake(g, results)}
        gear = []
        for item, garment, groups in clothing:
            transformed = {}
            for accessor, P, F, obj in groups:
                Q = evaluate(obj)
                p = next(p for _, ps, _, _ in group_records(garment) for p in ps if p['attributes']['POSITION'] == accessor)
                N = np.asarray(garment.accessor(p['attributes']['NORMAL']), dtype=np.float32)
                transformed[accessor] = {'positions': Q, 'normals': normals(Q, F, N), 'endpoints': [], 'endpointNormals': []}
            filename = item['slot'] + '.glb'
            files[filename] = bake(garment, transformed)
            gear.append({'slot': item['slot'], 'source': item, 'file': filename, 'sha256': sha(files[filename])})
        for name, data in files.items():
            (folder / name).write_bytes(data)
        report = {'schema': 'representative-cage-trial-result-v1', 'id': identifier, 'basePresetId': request['basePresetId'],
            'sex': sex, 'requestedParameters': request['parameters'], 'sourceBody': source['body'],
            'avatar': {'file': 'avatar.vrm', 'sha256': sha(files['avatar.vrm'])}, 'equipment': gear, 'trace': trace,
            'cageRestPositionsM': rest_cage.tolist(), 'cageRequestedPositionsM': target_cage.tolist(),
            'sourceEndpointCoverageMarginM': margin, 'minimumMeasuredModifierJacobianDeterminant': minimum_det,
            'originalMinimumJacobianGatePassed': minimum_det > .12,
            'jacobianScope': 'Actual dynamic modifier finite differences at base/all source endpoints with fixed source vertex influence. Not global injectivity or a garment SurfaceDeform spatial derivative proof.',
            'garmentJacobianGate': 'unmeasured-not-passed', 'status': 'trial-unaccepted-pending-metrics',
            'sourceBuiltInClothes': 'MeshDeform only. Independent three-piece outfit uses actual SurfaceDeform. No built-in layered fit approval.',
            'elapsedSeconds': time.monotonic() - started, 'outputBytes': sum(map(len, files.values())), 'runtimeAccepted': False}
        (folder / 'report.json').write_bytes(encoded(report))
        rows.append(report)
        print(json.dumps({'id': identifier, 'seconds': report['elapsedSeconds'], 'minimumDet': minimum_det}), flush=True)
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    spec = json.loads((BASE / 'spec.json').read_bytes())
    prerequisite = json.loads((args.out / 'preflight.json').read_bytes())
    require(prerequisite['status'] == 'preflight-passed', 'Actual preflight required')
    require(prerequisite.get('receipt') == input_receipt(spec), 'Preflight source/tool/producer identity changed')
    rows = []
    for sex, source in spec['sources'].items():
        rows.extend(solve_source(sex, source, [r for r in spec['requests'] if r['sex'] == sex], spec['preflight'], args.out))
    (args.out / 'batch.json').write_bytes(encoded({'schema': 'representative-cage-trial-batch-v1', 'variants': rows,
        'receipt': prerequisite['receipt'], 'batchRuns': 1, 'singleCaseEdits': 0,
        'commonImplementationCorrections': 1, 'correctionScope': 'Preflight receipt binding and explicit shared-accessor checks. No geometry/parameter change.', 'runtimeAccepted': False}))


if __name__ == '__main__':
    main()
