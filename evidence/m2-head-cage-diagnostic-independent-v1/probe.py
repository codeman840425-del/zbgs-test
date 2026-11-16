"""Read the once-only outputs. No Blender imports, evaluations or exports."""
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import types

sys.dont_write_bytecode = True
import numpy as np
from scipy.spatial import cKDTree

TREE = Path('F:/gamemake-representative-head-cage')
OUT = Path(__file__).resolve().parent
BASE = TREE / 'assets-source/m2-representative-head-cage-v1'
EXPORTS = BASE / 'diagnostic-v1/exports/once'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    body = load_module('audit_body', TREE / 'scripts/m2-representative-head-cage-v1/body.py')
    sys.path.insert(0, str(TREE / 'scripts/production'))
    from flow import GLB

    source_spec = json.loads((BASE / 'spec.json').read_bytes())
    preflight = json.loads((BASE / 'generated/preflight.json').read_bytes())
    rest = {r['sex']: np.asarray(next(g for g in r['gates'] if g['id'] ==
        'identity-and-all-endpoint-coverage')['restCagePositionsM']) for r in preflight['sexes']}
    # Extract only the producer's pure triangle/landmark operations. Importing
    # head.py would require bpy, which this CPU readback deliberately avoids.
    tree = ast.parse((TREE / 'scripts/m2-representative-head-cage-v1/head.py').read_bytes())
    head = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Head')
    namespace = {'np': np, 'require': lambda value, text: value or (_ for _ in ()).throw(AssertionError(text))}
    for name in ['section_landmarks', 'sample']:
        node = next(n for n in head.body if isinstance(n, ast.FunctionDef) and n.name == name)
        exec(compile(ast.Module([node], []), 'pinned-head-landmarks', 'exec'), namespace)

    records, by_sex, pins = [], {}, set()
    for path in sorted(EXPORTS.glob('*/report.json')):
        r = json.loads(path.read_bytes())
        sex, fit = r['sex'], r['fit']
        original_path = TREE / source_spec['sources'][sex]['body']['path']
        assert digest(original_path) == source_spec['sources'][sex]['body']['sha256']
        source, target = GLB(original_path.read_bytes()), GLB((path.parent / 'avatar.vrm').read_bytes())
        assert digest(path.parent / 'avatar.vrm') == r['avatarSha256']
        assert source.doc['nodes'] == target.doc['nodes'] and source.doc['skins'] == target.doc['skins']
        primitive = next(p for m in source.doc['meshes'] for p in m['primitives']
            if 'Face_00_SKIN' in source.doc['materials'][p['material']]['name'])
        target_primitive = next(p for m in target.doc['meshes'] for p in m['primitives']
            if 'Face_00_SKIN' in target.doc['materials'][p['material']]['name'])
        P = np.asarray(source.accessor(primitive['attributes']['POSITION']), float)
        Q = np.asarray(target.accessor(target_primitive['attributes']['POSITION']), float)
        context = body.legacy.source_context(source)
        H = context['joints']['head']
        F = np.asarray(source.accessor(primitive['indices']), int).reshape(-1, 3)
        face_lo = float(P[np.unique(F), 1].min() - H[1])
        helper = types.SimpleNamespace(skin_faces=F,
            section_y=np.linspace(face_lo + .00001, context['eyeMin'][1] - H[1] - .006, 101))
        helper.landmarks = namespace['section_landmarks'](helper, P - H)
        source_points = namespace['sample'](helper, P)
        actual_points = namespace['sample'](helper, Q)
        assert np.max(abs(source_points - fit['sourcePointsM'])) < 1e-12
        bake_error = float(np.max(abs(actual_points - fit['achievedPointsM'])))
        assert bake_error < 2e-7
        request = next(q for q in source_spec['requests'] if q['basePresetId'] == r['basePresetId'])
        params = request['parameters']
        local_y = source_points[:, 1] - H[1]
        jaw = 1 - body.legacy.smooth((local_y + .005) / .045)
        cheek = np.maximum(0, 1 - ((local_y - .005) / .045) ** 2) ** 2
        requested_points = source_points.copy()
        requested_points[:, 0] += (source_points[:, 0] - H[0]) * (params['jawWidth'] * jaw + params['cheekWidth'] * cheek)
        chin = 1 - body.legacy.smooth((local_y - face_lo) / (context['mouthMin'][1] - H[1] - face_lo))
        requested_points[:, 1] -= params['chinLengthM'] * chin
        requested_points[:, 2] -= params['chinProjectionM'] * chin
        assert np.max(abs(requested_points - fit['requestedPointsM'])) < 1e-12
        groups = {}
        for mesh in source.doc['meshes']:
            for p in mesh['primitives']:
                groups.setdefault(p['attributes']['POSITION'], []).append(p)
        eye_parts, hair_parts = [], []
        for accessor, primitives in groups.items():
            points = np.asarray(source.accessor(accessor), dtype=np.float32)
            endpoints = [points] + [points + np.asarray(source.accessor(t['POSITION']), dtype=np.float32)
                for t in primitives[0].get('targets', [])]
            for p in primitives:
                name = source.doc['materials'][p['material']]['name']
                chosen = eye_parts if any(tag in name for tag in ['_EYE', 'Eyeline', 'Eyelash']) else hair_parts if 'HAIR' in name else None
                if chosen is not None:
                    indices = np.unique(source.accessor(p['indices']))
                    chosen.extend(E[indices] for E in endpoints)
        eyes = np.unique(np.concatenate(eye_parts), axis=0)
        hair = np.unique(np.concatenate(hair_parts), axis=0)
        anchors = np.unique(np.concatenate([eyes, hair]), axis=0)
        distance = cKDTree(anchors).query(P.astype(np.float32))[0]
        neck_start = context['joints']['neck'][1] - H[1] - .005
        neck_end = face_lo - .01
        upper_start = float(eyes[:, 1].min() - H[1] + .012)
        rear_end = float(hair[hair[:, 1] - H[1] < .025, 2].min() - H[2] - .001)
        y, z = (P.astype(np.float32) - H)[:, 1:3].T
        smooth = body.legacy.smooth
        W = smooth((y - neck_start) / (neck_end - neck_start))
        W *= 1 - smooth((y - upper_start) / .03)
        W *= 1 - smooth((z - (rear_end - .03)) / .03)
        W *= smooth(distance / source_spec['setup']['anchorDistanceFalloffM'])
        edge_weight = np.asarray([(1 - t) * W[a] + t * W[b] for _, a, b, t in helper.landmarks])
        locked = edge_weight == 0
        nonzero_request = np.linalg.norm(np.asarray(fit['requestedPointsM']) - source_points, axis=1) > 1e-12
        conflicts = np.flatnonzero(locked & nonzero_request)
        protection = {'method': 'Source Float32 endpoints and the producer spatial factors with CPU Float64 nearest distances. Exact-zero anchors remain exact. No Blender response evaluation.',
            'zeroWeightLandmarkCount': int(locked.sum()), 'nonzeroTargetAtZeroWeightCount': len(conflicts),
            'conflictingLandmarkIds': conflicts.tolist(),
            'maximumRequestedDisplacementAtLockedLandmarksM': float(np.linalg.norm((np.asarray(fit['requestedPointsM']) - source_points)[locked], axis=1).max(initial=0)),
            'landmarkInterpolatedWeightMinMax': [float(edge_weight.min()), float(edge_weight.max())],
            'exactAnchorSkinVertexCount': int(np.count_nonzero(distance == 0))}
        # Body support is independent of the fit and is zero at these head inputs.
        body_at_landmarks = float(np.max(abs(body.body_displacement(source_points, request['parameters'], context))))
        assert body_at_landmarks == 0
        C = np.asarray(fit['actualCagePositionsM']).reshape(-1, 4, 3)
        R = rest[sex].reshape(-1, 4, 3)
        coeff = np.asarray(fit['coefficientsM'])
        rebuilt = R.copy()
        for axis in range(3):
            for ring, value in enumerate(coeff[axis], 1):
                rebuilt[ring, 0, axis] += (-value if axis == 0 else value)
                rebuilt[ring, 1, axis] += value
        assert np.max(abs(rebuilt - C)) < 2e-7
        delta_y = np.diff(C[:, 0, 1])
        width = C[:, 1, 0] - C[:, 0, 0]
        requested = np.asarray(fit['requestedPointsM']) - source_points
        records.append({'id': r['id'], 'sex': sex, 'status': r['status'],
            'minimumRecordedCombinedJacobianDeterminant': r['minimumCombinedJacobianDeterminant'],
            'maximumRecordedHalfWidthErrorM': fit['crossSections']['maximumHalfWidthErrorM'],
            'maximumRequestedLandmarkDisplacementM': float(np.linalg.norm(requested, axis=1).max()),
            'maximumCageVertexDisplacementM': float(np.linalg.norm(C - R, axis=2).max()),
            'maximumAbsoluteCoefficientPerAxisM': np.max(abs(coeff), axis=1).tolist(),
            'minimumFrontAdjacentDeltaYM': float(delta_y.min()),
            'reversedFrontYIntervals': np.flatnonzero(delta_y <= 0).tolist(),
            'minimumFrontWidthM': float(width.min()),
            'reversedFrontWidthRings': np.flatnonzero(width <= 0).tolist(),
            'sourceLandmarksExact': True, 'actualFloat32LandmarkBakeErrorM': bake_error,
            'requestedLandmarksMatchOriginalUnitsAndFormula': True,
            'bodyContributionAtFitLandmarksM': body_at_landmarks,
            'protectionCompatibility': protection,
            'avatarSHA256': r['avatarSha256'], 'reportSHA256': digest(path)})
        by_sex.setdefault(sex, []).append(fit)
        pins.update([path, path.parent / 'avatar.vrm', original_path])

    subspaces = []
    for sex, fits in by_sex.items():
        for axis in range(3):
            C = np.asarray([f['coefficientsM'][axis] for f in fits]).T
            U, singular, _ = np.linalg.svd(C, full_matrices=False)
            rank = int(np.count_nonzero(singular > singular[0] * 1e-7))
            basis = U[:, :rank]
            controls = basis.T @ C
            B = np.asarray([np.asarray(f['achievedPointsM'])[:, axis] -
                np.asarray(f['sourcePointsM'])[:, axis] for f in fits]).T
            T = np.asarray([np.asarray(f['requestedPointsM'])[:, axis] -
                np.asarray(f['sourcePointsM'])[:, axis] for f in fits]).T
            response = B @ np.linalg.pinv(controls)
            sigma = np.linalg.svd(response, compute_uv=False)
            subspaces.append({'sex': sex, 'axis': 'xyz'[axis], 'usedControlSubspaceRank': rank,
                'coefficientMatrixSingularValuesM': singular.tolist(),
                'empiricalResponseOnUsedSubspaceSingularValues': sigma.tolist(),
                'empiricalSubspaceConditionNumber': float(sigma[0] / sigma[-1]),
                'maximumSuperpositionResidualM': float(np.max(abs(response @ controls - B))),
                'scope': 'Empirical readback on the span of the four stored controls. Full original 202x9 response matrix and its condition number are unidentified.',
                'targetMaximumAbsoluteAxisDisplacementM': float(abs(T).max())})
    pins.update((TREE / 'scripts/m2-representative-head-cage-v1').glob('*.py'))
    pins.add(TREE / 'scripts/m2-representative-batch-v2/deform.py')
    pins.update([BASE / 'spec.json', BASE / 'generated/preflight.json',
        BASE / 'diagnostic-v1/plan.json', EXPORTS / 'execution.json', EXPORTS / 'diagnostic-batch.json'])
    result = {'schema': 'head-cage-independent-numerical-readback-v1',
        'sourceCommitAtRead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=TREE, text=True).strip(),
        'cases': records, 'usedSubspaceReadback': subspaces,
        'pins': [{'path': p.relative_to(TREE).as_posix(), 'sha256': digest(p)} for p in sorted(pins)],
        'blenderStarted': False, 'productionAdmitted': False, 'runtimeAccepted': False}
    (OUT / 'readback.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'cases': len(records), 'YReversed': sum(bool(r['reversedFrontYIntervals']) for r in records),
        'XReversed': sum(bool(r['reversedFrontWidthRings']) for r in records), 'pins': len(pins)}))


if __name__ == '__main__':
    main()
