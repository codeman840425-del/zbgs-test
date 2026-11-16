"""Independent read-only fixed-ref vest geometry/metadata audit. Never runs build."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

import numpy as np

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).parent
PIN = 'fe5ea67cbae9cd517bf57ca7047f411cf8403d56'
CACHE = {}


def read(path):
    if path not in CACHE:
        CACHE[path] = subprocess.run(['git', '-C', str(ROOT), 'show', PIN + ':' + path], capture_output=True, check=True).stdout
    return CACHE[path]


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


env = {'__file__': str(ROOT / 'scripts/production/flow.py'), '__name__': 'independent_glb_reader'}
exec(compile(read('scripts/production/flow.py'), 'pinned-independent-reader', 'exec'), env)
GLB = env['GLB']


def model(ref):
    raw = read(ref['path'])
    assert len(raw) == ref['bytes'] and sha(raw) == ref['sha256'], ref['path']
    return GLB(raw)


def primitive(g, token):
    return next(p for m in g.doc['meshes'] for p in m['primitives'] if token in g.doc['materials'][p['material']]['name'])


def arrays(g, p):
    return np.asarray(g.accessor(p['attributes']['POSITION']), float), np.asarray(g.accessor(p['indices']), int).reshape(-1, 3), np.asarray(g.accessor(p['attributes']['NORMAL']), float)


def matrix(a):
    return np.asarray(a).reshape(4, 4, order='F')


def deform(P, live):
    # Independently assemble each weighted homogeneous palette once per vertex.
    J, W = np.asarray(live['joints'], int), np.asarray(live['weights'], float)
    palettes = np.asarray([matrix(b['matrixWorld']) @ matrix(b['inverseBind']) for b in live['bones']])
    selected = palettes[J]
    blended = np.einsum('ni,nijk->njk', W, selected)
    local = np.c_[P, np.ones(len(P))] @ matrix(live['bindMatrix']).T
    result = np.einsum('nij,nj->ni', blended, local)
    result[:, 3] = 1
    return (result @ (matrix(live['matrixWorld']) @ matrix(live['bindMatrixInverse'])).T)[:, :3]


def project(P, camera):
    if camera is None:
        return P.copy(), np.ones(len(P))
    view = matrix(camera['matrixWorldInverse'])
    assert np.allclose(view[:3, :3].T @ view[:3, :3], np.eye(3), atol=1e-12)
    assert np.allclose(np.linalg.inv(view)[:3, 3], camera['position'], atol=1e-12)
    clip = np.c_[P, np.ones(len(P))] @ (matrix(camera['projectionMatrix']) @ view).T
    assert np.all(clip[:, 3] > 0)
    return clip[:, :3] / clip[:, 3, None], clip[:, 3]


def intersection(A, B):
    # Build the convex intersection from contained corners and nine edge pairs.
    def coefficients(T):
        return np.linalg.inv(np.vstack([T.T, np.ones(3)]))
    invA, invB = coefficients(A), coefficients(B)
    points = [p for p in A if np.min(invB @ np.r_[p, 1]) >= -1e-11]
    points += [p for p in B if np.min(invA @ np.r_[p, 1]) >= -1e-11]
    for a, b in zip(A, np.roll(A, -1, axis=0)):
        for c, d in zip(B, np.roll(B, -1, axis=0)):
            M = np.column_stack([b - a, c - d])
            if abs(np.linalg.det(M)) < 1e-18:
                continue
            u, v = np.linalg.solve(M, c - a)
            if -1e-11 <= u <= 1 + 1e-11 and -1e-11 <= v <= 1 + 1e-11:
                points.append(a + u * (b - a))
    unique = []
    for p in points:
        if all(np.linalg.norm(p - q) > 1e-10 for q in unique):
            unique.append(p)
    if len(unique) < 3:
        return None
    poly = np.asarray(unique)
    center = poly.mean(0)
    poly = poly[np.argsort(np.arctan2(poly[:, 1] - center[1], poly[:, 0] - center[0]))]
    return poly, invA, invB


def gaps(P, F, Q, G, affected, camera):
    A, aw = project(P, camera)
    B, bw = project(Q, camera)
    tris = B[G]
    low, high = tris[:, :, :2].min(1), tris[:, :, :2].max(1)
    minimum, lower_bound, pairs, critical = np.inf, np.inf, 0, None
    for face in affected:
        a = A[F[face]]
        if abs(np.linalg.det(np.vstack([a[:, :2].T, np.ones(3)]))) < 1e-15:
            continue
        possible = np.flatnonzero(np.all(high >= a[:, :2].min(0), axis=1) & np.all(low <= a[:, :2].max(0), axis=1))
        for other in possible:
            b = B[G[other]]
            if abs(np.linalg.det(np.vstack([b[:, :2].T, np.ones(3)]))) < 1e-15:
                continue
            overlap = intersection(a[:, :2], b[:, :2])
            if overlap is None:
                continue
            poly, invA, invB = overlap
            ba = np.c_[poly, np.ones(len(poly))] @ invA.T
            bb = np.c_[poly, np.ones(len(poly))] @ invB.T
            if camera is None:
                lower = float(np.min(bb @ b[:, 2] - ba @ a[:, 2]))
            else:
                projection = matrix(camera['projectionMatrix'])
                assert abs(projection[3, 2] + 1) < 1e-12 and projection[3, 3] == 0
                za, zb = ba @ a[:, 2], bb @ b[:, 2]
                ndc_gap = float(np.min(zb - za))
                assert ndc_gap > 0, 'Depth ordering fails on actual overlap'
                # Perspective z_cam=-P23/(z_ndc+P22). The numerator
                # difference is affine. Separate denominator maxima bound the
                # complete overlap, and world ray length is >= camera-z gap.
                lower = abs(projection[2, 3]) * ndc_gap / (max(abs(za + projection[2, 2])) * max(abs(zb + projection[2, 2])))
            lower_bound = min(lower_bound, lower)
            samples = np.vstack([poly, (poly + np.roll(poly, -1, axis=0)) / 2, poly.mean(0)])
            for point in samples:
                u, v = invA @ np.r_[point, 1], invB @ np.r_[point, 1]
                ua, vb = u / aw[F[face]], v / bw[G[other]]
                ua, vb = ua / ua.sum(), vb / vb.sum()
                top, bottom = ua @ P[F[face]], vb @ Q[G[other]]
                if camera is None:
                    value = bottom[2] - top[2]
                else:
                    direction = top - np.asarray(camera['position'])
                    value = np.dot(bottom - top, direction) / np.linalg.norm(direction)
                if value < minimum:
                    minimum = float(value)
                    critical = {'topTriangle': int(face), 'pantsTriangle': int(other), 'topM': top.tolist(), 'pantsM': bottom.tolist()}
            pairs += 1
    assert np.isfinite(minimum)
    return {'minimumSampledRayGapM': minimum, 'allOverlapConservativeLowerBoundM': float(lower_bound),
            'trianglePairs': pairs, 'pantsCandidates': len(G), 'critical': critical}


def actual_normals(old, new, F, N):
    face_cross = np.cross(new[F[:, 1]] - new[F[:, 0]], new[F[:, 2]] - new[F[:, 0]])
    unit = face_cross / np.linalg.norm(face_cross, axis=1)[:, None]
    accum = np.zeros_like(new)
    for corner in range(3):
        x = new[F[:, (corner + 1) % 3]] - new[F[:, corner]]
        y = new[F[:, (corner + 2) % 3]] - new[F[:, corner]]
        angle = np.arctan2(np.linalg.norm(np.cross(x, y), axis=1), np.einsum('ij,ij->i', x, y))
        np.add.at(accum, F[:, corner], unit * angle[:, None])
    touched = set(np.unique(F[np.any(np.linalg.norm(new - old, axis=1)[F] > 0, axis=1)]))
    groups = {}
    for i, (p, n) in enumerate(zip(old, N)):
        groups.setdefault((tuple(p), tuple(n)), []).append(i)
    expected = N.copy()
    for ids in groups.values():
        if touched.intersection(ids):
            n = accum[ids].sum(0)
            expected[ids] = n / np.linalg.norm(n)
    return expected


def local_shape(P, Q, F, affected):
    a = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    b = np.cross(Q[F[:, 1]] - Q[F[:, 0]], Q[F[:, 2]] - Q[F[:, 0]])
    la, lb = np.linalg.norm(a, axis=1), np.linalg.norm(b, axis=1)
    ua, ub = a / la[:, None], b / lb[:, None]
    adjacency = {}
    for i, face in enumerate(F):
        for x, y in zip(face, np.roll(face, -1)):
            adjacency.setdefault(tuple(sorted([int(x), int(y)])), []).append(i)
    active = set(affected.tolist())
    ratios, dihedral = [], []
    for (x, y), faces in adjacency.items():
        if not np.array_equal(P[[x, y]], Q[[x, y]]):
            ratios.append(float(np.linalg.norm(Q[x] - Q[y]) / np.linalg.norm(P[x] - P[y])))
        if len(faces) == 2 and active.intersection(faces):
            i, j = faces
            dihedral.append(float(abs(np.arctan2(np.linalg.norm(np.cross(ub[i], ub[j])), ub[i] @ ub[j]) -
                                      np.arctan2(np.linalg.norm(np.cross(ua[i], ua[j])), ua[i] @ ua[j])) * 180 / np.pi))
    return {'minimumAreaRatio': float((lb[affected] / la[affected]).min()),
            'minimumOrientationDot': float(np.einsum('ij,ij->i', ua[affected], ub[affected]).min()),
            'minimumEdgeRatio': min(ratios), 'maximumEdgeRatio': max(ratios),
            'maximumDihedralChangeDegrees': max(dihedral),
            'sourceCoreMinimumOutwardNegativeZDot': float((ua[[894, 901, 903, 904]] @ np.array([0, 0, -1])).min())}


def main():
    started = time.monotonic()
    base = 'assets-source/m2-vest-layer-fit-v1/'
    spec = json.loads(read(base + 'spec.json'))
    manifest = json.loads(read(base + 'generated/manifest.json'))
    producer_source = read('scripts/m2-vest-layer-fit-v1/build.py').decode()
    assert 'if item["slot"] == "bottom"' in producer_source
    template = model(spec['templateTop'])
    TP, TF, TN = arrays(template, primitive(template, spec['templateMaterial']))
    seeds = set(np.unique(TF[spec['selection']['coreTriangles']]).tolist())
    assert seeds == set(spec['selection']['seedVertices'])
    keys = [tuple(p) for p in TP]
    seed_keys = {keys[i] for i in seeds}
    ring_keys = {keys[i] for face in TF if seed_keys.intersection(keys[i] for i in face) for i in face}
    weights = np.asarray([1 if k in seed_keys else .5 if k in ring_keys else 0 for k in keys])
    affected = np.flatnonzero(np.any(weights[TF] > 0, axis=1))
    assert sum(weights == 1) == 6 and sum(weights == .5) == 12 and len(affected) == 52
    reference = json.loads(read(spec['referencePose']['path']))
    receipt = json.loads(read(spec['poseReceipt']['path']))
    cases, failures = [], []
    for case, record in zip(spec['cases'], manifest['cases']):
        model(case['body'])
        for ref in record['files'].values():
            raw = read(ref['path'])
            assert sha(raw) == ref['sha256'] and len(raw) == ref['bytes']
        old = model(case['top'])
        new = model(record['files']['top.glb'])
        bottom = model(case['bottom'])
        P, F, N = arrays(old, primitive(old, spec['templateMaterial']))
        Q, G, M = arrays(new, primitive(new, spec['templateMaterial']))
        BP, BF, _ = arrays(bottom, primitive(bottom, 'TrainingPants'))
        fit = json.loads(read(record['files']['fit.json']['path']))
        entry = json.loads(read(record['files']['equipment-entry.json']['path']))
        assert fit['body'] == case['body'] and entry['compatibleAvatarSha256'] == case['body']['sha256']
        assert fit['top']['id'] == entry['id'] == record['newTopId']
        assert fit['top']['sha256'] == entry['sha256'] == record['files']['top.glb']['sha256']
        assert fit['id'] == entry['fitId'] and not fit['runtimeAccepted']
        equipment = json.loads(read(case['equipmentManifest']['path']))
        selected = next(e for e in equipment['items'] if e['id'] == fit['bottom']['id'])
        matching = [e for e in equipment['items'] if e['sha256'] == case['bottom']['sha256']]
        bottom_matches = selected['sha256'] == fit['bottom']['sha256']
        if not bottom_matches:
            failures.append({'case': case['id'], 'kind': 'bottom-id-sha-mismatch', 'fitBottom': fit['bottom'],
                             'manifestBottomId': record['bottomId'], 'declaredIdActualSha': selected['sha256'],
                             'declaredIdActualUrl': selected['url'], 'actualMatchingIds': [e['id'] for e in matching],
                             'cause': 'Producer selects the first slot=bottom entry, then combines its ID with the explicitly pinned pants file.'})
        expected = (P + weights[:, None] * manifest['commonAmplitudeM'] * np.array([0, 0, -1])).astype('<f4')
        assert np.array_equal(Q.astype('<f4'), expected)
        assert old.doc['nodes'] == new.doc['nodes'] and old.doc['skins'] == new.doc['skins']
        assert old.doc['materials'] == new.doc['materials'] and old.doc['textures'] == new.doc['textures']
        assert old.doc['images'] == new.doc['images'] and new.binary.startswith(old.binary)
        for ma, mb in zip(old.doc['meshes'], new.doc['meshes']):
            for pa, pb in zip(ma['primitives'], mb['primitives']):
                assert np.array_equal(old.accessor(pa['indices']), new.accessor(pb['indices']))
                for attribute in pa['attributes']:
                    if pa is not primitive(old, spec['templateMaterial']) or attribute not in ['POSITION', 'NORMAL']:
                        assert np.array_equal(old.accessor(pa['attributes'][attribute]), new.accessor(pb['attributes'][attribute]))
        expected_n = actual_normals(P, Q, F, N)
        normal_error = float(abs(expected_n.astype('<f4') - M.astype('<f4')).max())
        assert normal_error < 2e-7
        changed = np.flatnonzero(np.linalg.norm(Q - P, axis=1) > 0)
        changed_n = np.flatnonzero(np.linalg.norm(M - N, axis=1) > 0)
        assert len(changed) == 18 and len(changed_n) == 36
        geometry = local_shape(P, Q, F, affected)
        assert geometry['minimumAreaRatio'] >= .5 and geometry['minimumOrientationDot'] > 0
        assert geometry['minimumEdgeRatio'] >= .85 and geometry['maximumEdgeRatio'] <= 1.15
        assert geometry['maximumDihedralChangeDegrees'] <= 20
        pose = json.loads(read(case['posed']['path']))
        capture = next(c for c in receipt['cases'] if c['id'] == case['id'])
        assert not capture['errors'] and capture['identity']['runtimeBuild']['shortId'] == receipt['build']
        assert capture['identity']['primary']['actualSha256'] == pose['bodySha256'] == case['body']['sha256']
        assert read(case['posed']['path']) == read(case['upstreamPosePath'])
        top_live = next(m for m in pose['meshes'] if m['role'] == 'top' and m['materials'][0]['name'] == spec['templateMaterial'])
        pants_live = next(m for m in pose['meshes'] if m['role'] == 'pants')
        ref_top = next(m for m in reference['meshes'] if m['role'] == 'top' and m['materials'][0]['name'] == spec['templateMaterial'])
        ref_pants = next(m for m in reference['meshes'] if m['role'] == 'pants')
        source_top = primitive(old, spec['templateMaterial'])
        source_pants = primitive(bottom, 'TrainingPants')
        skin_checks = []
        loader_weight_delta = []
        for points, live, asset, p in [(P, top_live, old, source_top), (BP, pants_live, bottom, source_pants),
                                      (P, ref_top, old, source_top), (BP, ref_pants, bottom, source_pants)]:
            # Virtual states intentionally use original rest positions for the
            # palette source. Their positions differ on a derived body, so only
            # actual captured state positions are exact source checks.
            if live is top_live or live is pants_live:
                assert np.array_equal(points.astype('<f4'), np.asarray(live['positions'], dtype='<f4'))
            assert np.array_equal(np.asarray(asset.accessor(p['attributes']['JOINTS_0'])), live['joints'])
            raw_weights = np.asarray(asset.accessor(p['attributes']['WEIGHTS_0']), float)
            loader_weights = (raw_weights / np.abs(raw_weights).sum(1)[:, None]).astype('<f4')
            assert np.array_equal(loader_weights, np.asarray(live['weights'], dtype='<f4'))
            loader_weight_delta.append(float(abs(raw_weights - loader_weights).max()))
            skin_record = asset.doc['skins'][0]
            assert [asset.doc['nodes'][i]['name'] for i in skin_record['joints']] == [b['name'] for b in live['bones']]
            assert np.array_equal(asset.accessor(skin_record['inverseBindMatrices']), [b['inverseBind'] for b in live['bones']])
            assert np.array_equal(np.asarray(asset.accessor(p['indices'])).ravel(), np.asarray(live['indices']).ravel())
            if live is top_live or live is pants_live:
                skin_checks.append(float(np.linalg.norm(deform(points, live) - np.asarray(live['worldPositions']), axis=1).max()))
        assert max(skin_checks) < 1e-6
        states = []
        before_bind = gaps(P, F, BP, BF, affected, None)
        for name, live_top, live_bottom, camera in [('source-bind', None, None, None),
                ('recorded-paused', top_live, pants_live, pose['camera']),
                ('virtual-original-palette', ref_top, ref_pants, reference['camera'])]:
            T = deform(Q, live_top) if live_top else Q
            B = deform(BP, live_bottom) if live_bottom else BP
            measured = gaps(T, F, B, BF, affected, camera)
            assert measured['allOverlapConservativeLowerBoundM'] >= .0005
            if live_top:
                before = deform(P, live_top)
                toward_camera = np.asarray(camera['position']) - before[list(seeds)]
                shift = T[list(seeds)] - before[list(seeds)]
                measured['minimumShiftTowardCameraCosine'] = float(np.min(np.einsum('ij,ij->i', toward_camera, shift) / (np.linalg.norm(toward_camera, axis=1) * np.linalg.norm(shift, axis=1))))
            states.append({'name': name, **measured})
        cases.append({'id': case['id'], 'sourceTopSha': case['top']['sha256'], 'newTopSha': record['files']['top.glb']['sha256'],
            'positionChanges': changed.tolist(), 'normalChanges': changed_n.tolist(), 'splitNormalMaximumFloat32Error': normal_error,
            'localGeometry': geometry, 'maximumNormalLengthError': float(abs(np.linalg.norm(M, axis=1) - 1).max()),
            'sourceCapturedSkinMaximumErrorsM': skin_checks, 'states': states, 'bottomIdentityValid': bottom_matches,
            'beforeBindGapM': before_bind['minimumSampledRayGapM'],
            'maximumLoaderWeightNormalizationDelta': max(loader_weight_delta),
            'oldFitOrRecipeInherited': any(k in entry for k in ['fitResource', 'materialRecipes', 'sourceResource']),
            'bindingsPreserved': entry['bindings'] == next(e for e in equipment['items'] if e['id'] == record['sourceTopId'])['bindings'],
            'runtimeAccepted': False})
    needed = spec['rule']['clearanceTargetM'] + spec['rule']['exportReserveM'] - min(c['beforeBindGapM'] for c in cases)
    assert 0 <= manifest['commonAmplitudeM'] - needed <= spec['rule']['solveToleranceM']
    report = {'schema': 'independent-vest-source-audit-v1', 'reviewedCommit': PIN, 'status': 'metadata-blocker-geometry-static-verified' if failures else 'static-source-verified',
        'commonAmplitudeM': manifest['commonAmplitudeM'], 'coreVertices': sorted(seeds), 'weightedVertices': np.flatnonzero(weights).tolist(),
        'minimumRequiredFromBindConstraintM': needed, 'amplitudeExcessOverBindConstraintM': manifest['commonAmplitudeM'] - needed,
        'affectedFaces': affected.tolist(), 'cases': cases, 'findings': failures, 'sourcePoseBuild': receipt['build'],
        'method': 'Independent parser and exact-index displacement/normals. Independent convex 2D overlap over all pants triangles. Bind-space linear extrema at overlap vertices. Perspective conservative ray-gap bound from affine NDC depth and denominator extrema.',
        'limits': ['9 static source/captured/virtual states only. No motion, Body coverage or visual acceptance.', 'Camera clearance is ray-directed, not global Euclidean nearest separation.', 'Float64 numerical polygon arithmetic, not interval/exact predicate certification.'],
        'inputs': [{'path': p, 'sha256': sha(raw), 'bytes': len(raw)} for p, raw in sorted(CACHE.items())],
        'sourceAuthor': False, 'producerQaExecuted': False, 'producerBuildExecuted': False,
        'loaderWeightNote': 'Pinned GLB weights are unchanged in the output. Captured runtime weights exactly equal Float32 of source Float64 Manhattan normalization, matching installed GLTFLoader mesh.normalizeSkinWeights().',
        'numpyVersion': np.__version__, 'seconds': time.monotonic() - started, 'runtimeAccepted': False}
    (OUT / 'report.json').write_bytes((json.dumps(report, indent=2) + '\n').encode())
    print(json.dumps({'status': report['status'], 'seconds': report['seconds'], 'minimumBoundM': min(s['allOverlapConservativeLowerBoundM'] for c in cases for s in c['states']), 'findings': failures}))


if __name__ == '__main__':
    main()
