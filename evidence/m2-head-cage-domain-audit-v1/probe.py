"""Source-domain provenance audit. Never imports bpy or evaluates a modifier."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
import numpy as np
from scipy.spatial import cKDTree

TREE = Path('F:/gamemake-representative-head-cage')
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(TREE / 'scripts/production'))
from flow import GLB


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bbox(points):
    return {'minimumM': points.min(0).tolist(), 'maximumM': points.max(0).tolist()} if len(points) else None


def main():
    path = TREE / 'scripts/m2-representative-head-cage-v1/body.py'
    spec = importlib.util.spec_from_file_location('domain_source_body', path)
    body = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(body)
    specification = json.loads((TREE / 'assets-source/m2-representative-head-cage-v1/spec.json').read_bytes())
    rows, pins = [], {path, TREE / 'scripts/m2-representative-head-cage-v1/head.py',
        TREE / 'scripts/m2-representative-cage-trial-v1/preflight.py',
        TREE / 'assets-source/m2-representative-head-cage-v1/spec.json'}
    for sex in ['female', 'male']:
        probe_path = TREE / 'assets-source/m2-head-cage-response-probe-v1/generated' / (sex + '.json')
        response = json.loads(probe_path.read_bytes())
        source_path = TREE / response['source']['path']
        assert sha(source_path) == response['source']['sha256']
        pins.update([probe_path, source_path])
        g = GLB(source_path.read_bytes())
        context = body.legacy.source_context(g)
        H = context['joints']['head']
        groups = {}
        for mesh_id, mesh in enumerate(g.doc['meshes']):
            nodes = [n for n in g.doc['nodes'] if n.get('mesh') == mesh_id]
            for primitive_id, p in enumerate(mesh['primitives']):
                groups.setdefault(p['attributes']['POSITION'], []).append({'mesh': mesh_id,
                    'primitive': primitive_id, 'definition': p, 'nodes': nodes,
                    'material': g.doc['materials'][p['material']]['name']})
        eyes, hair, records = [], [], []
        for accessor, primitives in groups.items():
            P = np.asarray(g.accessor(accessor), dtype=np.float32)
            targets = primitives[0]['definition'].get('targets', [])
            assert all(p['definition'].get('targets', []) == targets for p in primitives)
            endpoints = [P] + [P + np.asarray(g.accessor(t['POSITION'])) for t in targets]
            records.append((accessor, primitives, endpoints))
            for p in primitives:
                chosen = eyes if any(s in p['material'] for s in ['_EYE', 'Eyeline', 'Eyelash']) else hair if 'HAIR' in p['material'] else None
                if chosen is not None:
                    ids = np.unique(g.accessor(p['definition']['indices']))
                    chosen.extend(E[ids] for E in endpoints)
        eyes = np.unique(np.concatenate(eyes).astype(np.float32), axis=0)
        hair = np.unique(np.concatenate(hair).astype(np.float32), axis=0)
        anchors = cKDTree(np.unique(np.concatenate([eyes, hair]), axis=0))
        P = np.asarray(response['sourcePointsM'])
        F = np.asarray(response['sourceFaceTriangles'])
        face_lo = float(P[np.unique(F), 1].min() - H[1])
        neck_start = context['joints']['neck'][1] - H[1] - .005
        neck_end = face_lo - .01
        upper_start = float(eyes[:, 1].min() - H[1] + .012)
        rear_end = float(hair[hair[:, 1] - H[1] < .025, 2].min() - H[2] - .001)
        smooth = body.legacy.smooth

        def weights(E):
            _, y, z = (E - H).T
            factors = np.column_stack([smooth((y - neck_start) / (neck_end - neck_start)),
                1 - smooth((y - upper_start) / .03),
                1 - smooth((z - (rear_end - .03)) / .03),
                smooth(anchors.query(E.astype(np.float32))[0] / specification['setup']['anchorDistanceFalloffM'])])
            return factors.prod(1), factors

        all_points, referenced_points, extrema_candidates, group_rows = [], [], [], []
        for accessor, primitives, endpoints in records:
            referenced = np.unique(np.concatenate([g.accessor(p['definition']['indices']) for p in primitives]))
            material_rows = []
            union_affected = np.zeros(len(endpoints[0]), bool)
            endpoint_counts = []
            for target, E in enumerate(endpoints, -1):
                W, factors = weights(E)
                affected = W > 0
                union_affected |= affected
                ids = np.flatnonzero(affected)
                ref_ids = np.intersect1d(ids, referenced)
                all_points.append(E[ids])
                referenced_points.append(E[ref_ids])
                endpoint_counts.append({'target': target, 'affected': len(ids), 'referencedAffected': len(ref_ids),
                    'unreferencedAffected': len(ids) - len(ref_ids)})
                if len(ids):
                    for vertex in set([int(ids[np.argmin(E[ids, 0])]), int(ids[np.argmax(E[ids, 0])])]):
                        memberships = [p for p in primitives if np.any(np.asarray(g.accessor(p['definition']['indices'])) == vertex)]
                        p = (memberships or primitives)[0]
                        attr = p['definition']['attributes']
                        joint_rows = []
                        if 'JOINTS_0' in attr:
                            node = p['nodes'][0]
                            skin = g.doc['skins'][node['skin']]
                            joints, values = g.accessor(attr['JOINTS_0'])[vertex], g.accessor(attr['WEIGHTS_0'])[vertex]
                            joint_rows = [{'node': g.doc['nodes'][skin['joints'][int(j)]]['name'], 'weight': float(w)}
                                for j, w in zip(joints, values) if w > 0]
                        extrema_candidates.append({'accessor': accessor, 'vertex': vertex, 'target': target,
                            'positionM': E[vertex].tolist(), 'headLocalM': (E[vertex] - H).tolist(),
                            'weight': float(W[vertex]), 'weightFactorsNeckUpperRearAnchor': factors[vertex].tolist(),
                            'referenced': bool(memberships), 'materials': sorted(set(p['material'] for p in memberships)),
                            'primitiveIds': [[p['mesh'], p['primitive']] for p in memberships],
                            'meshNodeNames': sorted(set(n['name'] for p in memberships for n in p['nodes'])),
                            'jointWeights': joint_rows})
            for p in primitives:
                ids = np.unique(g.accessor(p['definition']['indices']))
                sets = [E[ids[weights(E)[0][ids] > 0]] for E in endpoints]
                base_ids = ids[weights(endpoints[0])[0][ids] > 0]
                material_rows.append({'mesh': p['mesh'], 'primitive': p['primitive'], 'material': p['material'],
                    'referencedVertices': len(ids), 'baseAffectedVertices': len(base_ids),
                    'allEndpointAffectedOccurrences': sum(len(S) for S in sets),
                    'allEndpointAffectedBounds': bbox(np.concatenate(sets)),
                    'baseAffectedBounds': bbox(endpoints[0][base_ids]),
                    'neckTransitionBaseVertexIds': [int(v) for v in base_ids if
                        H[1] + neck_start < endpoints[0][v, 1] < H[1] + neck_end]})
            group_rows.append({'accessor': accessor, 'vertexCount': len(endpoints[0]), 'referencedVertexCount': len(referenced),
                'allEndpointAffectedUniqueVertices': int(union_affected.sum()),
                'unreferencedAffectedUniqueVertices': int(np.count_nonzero(union_affected & ~np.isin(np.arange(len(union_affected)), referenced))),
                'endpoints': endpoint_counts, 'materials': material_rows})
        affected = np.concatenate(all_points)
        ref_affected = np.concatenate(referenced_points)
        bounds = bbox(affected)
        extreme_rows = [e for e in extrema_candidates if e['positionM'][0] in [bounds['minimumM'][0], bounds['maximumM'][0]]]
        assert all(e['referenced'] and len(e['materials']) for e in extreme_rows)
        assert all(g['unreferencedAffectedUniqueVertices'] == 0 for g in group_rows)
        # Identical extrema across morph endpoints are retained by target IDs.
        left = np.min(np.asarray(response['restCagePositionsM']), axis=0)
        right = np.max(np.asarray(response['restCagePositionsM']), axis=0)
        padded = np.array([bounds['minimumM'][0] - .02, bounds['maximumM'][0] + .02], dtype=np.float32)
        assert np.array_equal(padded, [left[0], right[0]])
        source_weights = weights(np.asarray(response['sourcePointsM'], dtype=np.float32))[0]
        differences = [abs(source_weights[row[key]] - row['sourceVertexWeights'][i])
            for row in response['landmarks'] for i, key in enumerate(['a', 'b'])]
        rows.append({'sex': sex, 'sourceSHA256': response['source']['sha256'],
            'affectedBounds': bounds, 'referencedAffectedBounds': bbox(ref_affected),
            'restCageWidthM': float(right[0] - left[0]), 'exactPaddedXBoundsMatch': True,
            'maximumLandmarkVertexWeightDifferenceVersusActualBlenderRecord': float(max(differences)),
            'faceLandmarkXSpanM': float(np.ptp(np.asarray(response['sourceLandmarksM'])[:, 0])),
            'thresholds': {'headOriginM': H.tolist(), 'neckStartWorldYM': float(H[1] + neck_start),
                'neckEndWorldYM': float(H[1] + neck_end), 'upperStartWorldYM': float(H[1] + upper_start),
                'rearEndWorldZM': float(H[2] + rear_end)},
            'xBoundaryProvenance': extreme_rows, 'groups': group_rows})
    result = {'schema': 'head-cage-domain-provenance-audit-v1',
        'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=TREE, text=True).strip(),
        'method': 'All original POSITION groups and all original morph endpoints; exact primitive membership; unchanged spatial weight factors with SciPy nearest-anchor distance. Blender KDTree float arithmetic may differ, checked against202 actual recorded landmark endpoint weights.',
        'cases': rows, 'pins': [{'path': p.relative_to(TREE).as_posix(), 'sha256': sha(p)} for p in sorted(pins)],
        'blenderStarted': False, 'sourceChanged': False}
    (OUT / 'readback.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    for row in rows:
        print(row['sex'], row['restCageWidthM'], row['maximumLandmarkVertexWeightDifferenceVersusActualBlenderRecord'])
        for e in row['xBoundaryProvenance'][:4]:
            print({k: e[k] for k in ['accessor', 'vertex', 'target', 'positionM', 'weight', 'referenced', 'materials', 'jointWeights']})


if __name__ == '__main__':
    main()
