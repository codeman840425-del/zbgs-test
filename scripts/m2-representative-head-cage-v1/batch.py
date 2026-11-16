"""One original-eight batch after exact body and local-head prerequisites."""
import argparse
import ast
import copy
import json
from pathlib import Path
import sys
import time
from types import SimpleNamespace

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from body import ROOT, body_displacement, extremity_indices, legacy
from head import GLB, Head, bpy, contacts, io, np, require
from preflight import BASE, numerical_jacobian, receipt
from export import bake, normals


def donor_function():
    path = ROOT / 'scripts/m2-representative-batch-v2/deform.py'
    tree = ast.parse(path.read_bytes())
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Source')
    node = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'bind')
    env = {'np': np, 'require': require, 'numeric': lambda P: io.sha(np.asarray(P).tobytes()), 'sha': io.sha}
    exec(compile(ast.Module([node], []), str(path), 'exec'), env)
    return env['bind']


def transfer(binding, donor_delta, donor_faces, P):
    delta = donor_delta[donor_faces[binding['faces']]]
    displacement = np.einsum('ni,nij->nj', binding['bary'], delta)
    delta_edges = np.stack([delta[:, 1] - delta[:, 0], delta[:, 2] - delta[:, 0]], axis=2)
    return P + displacement, np.eye(3) + delta_edges @ binding['derivative']


def surface_widths(P, F, levels):
    triangles = P[F]
    result = []
    for y in levels:
        points = []
        for corner in range(3):
            a, b = triangles[:, corner], triangles[:, (corner + 1) % 3]
            dy = b[:, 1] - a[:, 1]
            t = (y - a[:, 1]) / np.where(abs(dy) > 1e-12, dy, np.inf)
            q = a + t[:, None] * (b - a)
            points.extend(q[(t >= 0) & (t <= 1) & (abs(dy) > 1e-12) & (q[:, 2] < -.025)])
        result.append(float(np.ptp(np.asarray(points)[:, 0]) / 2) if points else None)
    return result


def run_source(sex, source, requests, spec, out, diagnostic_only=False, contact_observer=None):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    g = GLB((ROOT / source['body']['path']).read_bytes())
    head = Head(g, spec['setup'])
    extremities = extremity_indices(g)
    Pface = np.asarray(g.accessor(head.face_accessor), float)
    face_targets = next(ps[0].get('targets', []) for a, ps, _, _ in head.records if a == head.face_accessor)
    source_contact = [contacts(Pface, head.mouth_faces, head.skin_faces)]
    source_contact += [contacts(Pface + np.asarray(g.accessor(t['POSITION'])), head.mouth_faces, head.skin_faces) for t in face_targets]
    skin = next(p for _, ps, _, _ in head.records for p in ps if 'Body_00_SKIN' in g.doc['materials'][p['material']]['name'])
    skin_P = np.asarray(g.accessor(skin['attributes']['POSITION']), float)
    skin_F = np.asarray(g.accessor(skin['indices']), int).reshape(-1, 3)
    donor = SimpleNamespace(P=skin_P, F=skin_F, anchors={})
    bind_donor = donor_function()
    gear = [(e, GLB((ROOT / e['path']).read_bytes())) for e in source['equipment']]
    manifests = json.loads((ROOT / source['equipmentManifest']).read_bytes())
    source_widths = (head.landmark_source[1::2, 0] - head.landmark_source[::2, 0]) / 2
    rows = []
    def contact_result(request, target, P, Q, pairs, baseline):
        result = {'target': target, 'sourcePairs': len(baseline), 'targetPairs': len(pairs), 'addedStrictPairs': sorted(pairs - baseline)}
        if contact_observer is not None:
            result['sourceStrictPairs'] = sorted(baseline)
            result['targetStrictPairs'] = sorted(pairs)
            result['pairPrecisionObservations'] = contact_observer(request, target, P, Q, head.mouth_faces, head.skin_faces, baseline, pairs)
        return result
    for request in requests:
        started = time.monotonic()
        identifier = request['basePresetId'] + ('-head-cage-diagnostic-v1' if diagnostic_only else '-head-cage-v1')
        folder = out / identifier
        folder.mkdir()
        fit = head.fit(request['parameters'])
        parameters = request['parameters']
        donor_delta = head.evaluate(skin['attributes']['POSITION'], skin_P, parameters) - skin_P
        results, traces, mouth_checks = {}, [], []
        minimum = float('inf')
        distal, eye_error, hair_error = 0., 0., 0.
        for accessor, ps, P, F in head.records:
            P = P.astype(float)
            Q = head.evaluate(accessor, P, parameters)
            J = numerical_jacobian(head, accessor, P, parameters)
            cloth = np.unique(np.concatenate([g.accessor(p['indices']) for p in ps if '_CLOTH' in g.doc['materials'][p['material']]['name']])) if any('_CLOTH' in g.doc['materials'][p['material']]['name'] for p in ps) else np.array([], int)
            if len(cloth):
                Q[cloth], J[cloth] = transfer(bind_donor(donor, P[cloth]), donor_delta, skin_F, P[cloth])
            minimum = min(minimum, float(np.linalg.det(J).min()))
            N = np.asarray(g.accessor(ps[0]['attributes']['NORMAL']), float)
            QN = legacy.normal_map(N, J)
            ends, end_normals = [], []
            if accessor == head.face_accessor:
                pairs = contacts(Q, head.mouth_faces, head.skin_faces)
                mouth_checks.append(contact_result(request, -1, P, Q, pairs, source_contact[0]))
            distal = max(distal, float(np.linalg.norm(Q[extremities[accessor]] - P[extremities[accessor]], axis=1).max(initial=0)))
            for p in ps:
                name = g.doc['materials'][p['material']]['name']
                ids = np.unique(g.accessor(p['indices']))
                error = float(np.linalg.norm(Q[ids] - P[ids], axis=1).max())
                if '_EYE' in name or 'Eyeline' in name or 'Eyelash' in name:
                    eye_error = max(eye_error, error)
                if 'HAIR' in name:
                    hair_error = max(hair_error, error)
            for i, target in enumerate(ps[0].get('targets', [])):
                D = np.asarray(g.accessor(target['POSITION']), float)
                E = head.evaluate(accessor, P + D, parameters)
                Je = numerical_jacobian(head, accessor, P + D, parameters)
                minimum = min(minimum, float(np.linalg.det(Je).min()))
                EN = legacy.normal_map(N + (np.asarray(g.accessor(target['NORMAL'])) if 'NORMAL' in target else 0), Je)
                ends.append(E)
                end_normals.append(EN)
                if accessor == head.face_accessor:
                    pairs = contacts(E, head.mouth_faces, head.skin_faces)
                    mouth_checks.append(contact_result(request, i, P + D, E, pairs, source_contact[i + 1]))
            results[accessor] = {'positions': Q, 'normals': QN, 'endpoints': ends, 'endpointNormals': end_normals}
            traces.append({'accessor': accessor, 'maximumDisplacementM': float(np.linalg.norm(Q - P, axis=1).max()),
                           'endpoints': len(ends), 'maximumEndpointBakeFloat32ErrorM': float(max([np.linalg.norm(Q.astype(np.float32) + (E - Q).astype(np.float32) - E, axis=1).max() for E in ends], default=0))})
        files = {'avatar.vrm': bake(g, results)}
        digest = io.sha(files['avatar.vrm'])
        entries = []
        for equipment, garment in gear:
            mapped = {}
            for accessor, ps, P, F in io.group_records(garment):
                P = P.astype(float)
                Q, J = transfer(bind_donor(donor, P), donor_delta, skin_F, P)
                minimum = min(minimum, float(np.linalg.det(J).min()))
                N = np.asarray(garment.accessor(ps[0]['attributes']['NORMAL']), float)
                mapped[accessor] = {'positions': Q, 'normals': legacy.normal_map(N, J), 'endpoints': [], 'endpointNormals': []}
            name = equipment['slot'] + '.glb'
            files[name] = bake(garment, mapped)
            entry = copy.deepcopy(next(e for e in manifests['items'] if e['id'] == equipment['id']))
            for key in ['materialRecipes', 'fitResource', 'sourceSpec']:
                entry.pop(key, None)
            entry.update(id=identifier + '-' + equipment['slot'], compatibleAvatarSha256=digest, url=name,
                         sha256=io.sha(files[name]), bytes=len(files[name]), sourceResource=equipment)
            entries.append(entry)
        actual_face = results[head.face_accessor]['positions'] - head.H
        target_points = np.asarray(fit['requestedPointsM']) - head.H
        target_widths = (target_points[1::2, 0] - target_points[::2, 0]) / 2
        target_y = target_points[::2, 1]
        widths = surface_widths(actual_face, head.skin_faces, target_y)
        errors = [abs(a - b) for a, b in zip(widths, target_widths) if a is not None]
        fit['crossSections'] = {'sourceYMetres': head.section_y.tolist(), 'requestedYMetres': target_y.tolist(),
            'sourceHalfWidthsM': source_widths.tolist(), 'requestedHalfWidthsM': target_widths.tolist(),
            'actualHorizontalHalfWidthsM': widths, 'maximumHalfWidthErrorM': max(errors, default=None),
            'missingHorizontalSections': sum(v is None for v in widths),
            'sourceChinMinimumY': float((Pface - head.H)[np.unique(head.skin_faces), 1].min()),
            'actualChinMinimumY': float(actual_face[np.unique(head.skin_faces), 1].min()),
            'requestedChinLengthM': parameters['chinLengthM']}
        failures = []
        if minimum <= spec['setup']['minimumDeterminant']:
            failures.append('Actual body/head/morph/donor Jacobian <= original 0.12 gate')
        if any(r['addedStrictPairs'] for r in mouth_checks):
            failures.append('New strict FaceMouth/Face_SKIN contacts in neutral or original expression endpoint')
        if distal > 2e-6 or eye_error > 2e-6 or hair_error > 2e-6:
            failures.append('Source distal/eye/hair interface moved')
        if fit['crossSections']['missingHorizontalSections'] or max(errors, default=float('inf')) > .002:
            failures.append('Original requested surface half-width intent misses common 2mm trial target')
        report = {'schema': 'representative-head-result-v1', 'id': identifier, 'basePresetId': request['basePresetId'],
            'sex': sex, 'parameters': parameters, 'sourceBody': source['body'], 'avatarSha256': digest,
            'status': 'failed' if failures else 'source-candidate', 'failures': failures, 'fit': fit, 'trace': traces,
            'minimumCombinedJacobianDeterminant': minimum, 'maximumDistalDisplacementM': distal,
            'maximumEyeDisplacementM': eye_error, 'maximumHairDisplacementM': hair_error,
            'mouthSkinExpressionChecks': mouth_checks, 'runtimeAccepted': False,
            'knownLimits': ['Original v2 vest overlap unresolved. No layered clearance or pose acceptance.', 'Separate expression endpoints only. No continuous combined-expression guarantee.'],
            'seconds': time.monotonic() - started, 'resourceBytes': sum(map(len, files.values()))}
        if diagnostic_only:
            from diagnostic import quarantine
            name, references = quarantine(report, entries)
            files[name] = io.encoded(references)
        else:
            files['equipment.json'] = io.encoded({'schema': 'zbgs-equipment-v1', 'items': entries})
        files['report.json'] = io.encoded(report)
        for name, data in files.items():
            (folder / name).write_bytes(data)
        rows.append({'id': identifier, 'status': report['status'], 'failures': failures,
                     'avatarSha256': digest, 'report': (folder / 'report.json').relative_to(ROOT).as_posix()})
        print(json.dumps({'id': identifier, 'status': report['status'], 'minimumDet': minimum, 'faceErrorM': max(errors, default=None), 'seconds': report['seconds']}), flush=True)
    return rows


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    spec = json.loads((BASE / 'spec.json').read_bytes())
    prerequisite = json.loads((args.out / 'preflight.json').read_bytes())
    require(prerequisite['status'] == 'preflight-passed' and prerequisite['receipt'] == receipt(spec), 'Exact passed preflight required')
    rows = []
    for sex, source in spec['sources'].items():
        rows.extend(run_source(sex, source, [r for r in spec['requests'] if r['sex'] == sex], spec, args.out))
    (args.out / 'batch.json').write_bytes(io.encoded({'schema': 'representative-head-batch-v1', 'variants': rows,
        'receipt': prerequisite['receipt'], 'originalRequestsRetained': True, 'shapeBatches': 1,
        'singleCaseEdits': 0, 'commonIntegrationCorrections': 0, 'runtimeAccepted': False}))
