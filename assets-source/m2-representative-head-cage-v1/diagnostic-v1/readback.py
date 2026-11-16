"""Read-only quarantine/resource/cage and reference-orientation postmortem."""
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
BASE = Path(__file__).parent
SOURCE = BASE.parent
OUTPUT = BASE / 'exports/once'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def oriented_faces(P, Q, faces):
    a = np.cross(P[faces[:, 1]] - P[faces[:, 0]], P[faces[:, 2]] - P[faces[:, 0]])
    b = np.cross(Q[faces[:, 1]] - Q[faces[:, 0]], Q[faces[:, 2]] - Q[faces[:, 0]])
    la, lb = np.linalg.norm(a, axis=1), np.linalg.norm(b, axis=1)
    valid = (la > 1e-12) & (lb > 1e-12)
    cosine = np.ones(len(faces))
    cosine[valid] = np.einsum('ij,ij->i', a[valid], b[valid]) / (la[valid] * lb[valid])
    flipped = np.flatnonzero(valid & (cosine < 0))
    return {'reversedReferenceNormalCount': len(flipped), 'reversedTriangleIds': flipped.tolist(),
            'newDegenerateTriangleIds': np.flatnonzero((la > 1e-12) & (lb <= 1e-12)).tolist(),
            'minimumReferenceNormalDot': float(cosine.min()),
            'worstTriangles': [{'triangle': int(i), 'cosine': float(cosine[i]),
                'sourceCentroidM': P[faces[i]].mean(0).tolist(), 'targetCentroidM': Q[faces[i]].mean(0).tolist()}
                for i in sorted(flipped, key=lambda i: cosine[i])[:12]]}


def main():
    spec = json.loads((SOURCE / 'spec.json').read_bytes())
    plan = json.loads((BASE / 'plan.json').read_bytes())
    preflight = json.loads((SOURCE / 'generated/preflight.json').read_bytes())
    rest = {r['sex']: np.asarray(next(g for g in r['gates'] if g['id'] == 'identity-and-all-endpoint-coverage')['restCagePositionsM'])
            for r in preflight['sexes']}
    rows = []
    for report_path in sorted(OUTPUT.glob('*/report.json')):
        report = json.loads(report_path.read_bytes())
        folder = report_path.parent
        source = GLB((ROOT / spec['sources'][report['sex']]['body']['path']).read_bytes())
        target = GLB((folder / 'avatar.vrm').read_bytes())
        assert sha(folder / 'avatar.vrm') == report['avatarSha256']
        assert target.binary.startswith(source.binary)
        assert source.doc['nodes'] == target.doc['nodes'] and source.doc['skins'] == target.doc['skins']
        assert source.doc['materials'] == target.doc['materials'] and source.doc['textures'] == target.doc['textures'] and source.doc['images'] == target.doc['images']
        assert source.doc.get('extensions') == target.doc.get('extensions')
        head_node = next(b['node'] for b in source.doc['extensions']['VRM']['humanoid']['humanBones'] if b['bone'] == 'head')
        head_skin = next(s for s in source.doc['skins'] if head_node in s['joints'])
        head_rest = -np.asarray(source.accessor(head_skin['inverseBindMatrices']))[head_skin['joints'].index(head_node), 12:15]
        geometry = []
        fixed_interfaces = 0.
        for ma, mb in zip(source.doc['meshes'], target.doc['meshes']):
            for a, b in zip(ma['primitives'], mb['primitives']):
                assert np.array_equal(source.accessor(a['indices']), target.accessor(b['indices']))
                for key in set(a['attributes']) - {'POSITION', 'NORMAL'}:
                    assert np.array_equal(source.accessor(a['attributes'][key]), target.accessor(b['attributes'][key]))
                assert len(a.get('targets', [])) == len(b.get('targets', []))
                material = source.doc['materials'][a['material']]['name']
                F = np.asarray(source.accessor(a['indices']), int).reshape(-1, 3)
                P = np.asarray(source.accessor(a['attributes']['POSITION']), dtype=np.float32)
                Q = np.asarray(target.accessor(b['attributes']['POSITION']), dtype=np.float32)
                frames = [(-1, P, Q)] + [(i, P + np.asarray(source.accessor(x['POSITION']), dtype=np.float32), Q + np.asarray(target.accessor(y['POSITION']), dtype=np.float32))
                    for i, (x, y) in enumerate(zip(a.get('targets', []), b.get('targets', [])))]
                if any(t in material for t in ['HAIR', '_EYE', 'Eyeline', 'Eyelash']):
                    ids = np.unique(F)
                    fixed_interfaces = max(fixed_interfaces, max(float(abs(A[ids] - B[ids]).max()) for _, A, B in frames))
                if any(t in material for t in ['Body_00_SKIN', 'Face_00_SKIN', 'FaceMouth']):
                    for frame, A, B in frames:
                        result = oriented_faces(A.astype(float), B.astype(float), F)
                        for worst in result['worstTriangles']:
                            worst['sourceHeadLocalCentroidM'] = (np.asarray(worst['sourceCentroidM']) - head_rest).tolist()
                            worst['targetHeadLocalCentroidM'] = (np.asarray(worst['targetCentroidM']) - head_rest).tolist()
                        if frame == -1 or result['reversedReferenceNormalCount'] or result['newDegenerateTriangleIds']:
                            geometry.append({'material': material, 'sourceTarget': frame, **result})
        C, R = np.asarray(report['fit']['actualCagePositionsM']).reshape(-1, 4, 3), rest[report['sex']].reshape(-1, 4, 3)
        dy = np.diff(C[:, :, 1], axis=0)
        width = C[:, 1, 0] - C[:, 0, 0]
        reference = json.loads((folder / 'diagnostic-equipment.json').read_bytes())
        assert reference['schema'] == 'diagnostic-equipment-reference-v1' and not reference['productionAdmitted']
        gear_checks = []
        for item in reference['items']:
            old = next(e for e in spec['sources'][report['sex']]['equipment'] if e['slot'] == item['slot'])
            old_g = GLB((ROOT / old['path']).read_bytes())
            new_g = GLB((folder / item['url']).read_bytes())
            assert sha(folder / item['url']) == item['sha256']
            assert old_g.doc['nodes'] == new_g.doc['nodes'] and old_g.doc['skins'] == new_g.doc['skins'] and new_g.binary.startswith(old_g.binary)
            gear_checks.append({'slot': item['slot'], 'sha256': item['sha256'], 'bytes': (folder / item['url']).stat().st_size})
        rows.append({'id': report['id'], 'status': report['status'], 'minimumRecordedJacobianDeterminant': report['minimumCombinedJacobianDeterminant'],
            'maximumHorizontalHalfWidthErrorM': report['fit']['crossSections']['maximumHalfWidthErrorM'],
            'newStrictPairsAcrossIndividualEndpoints': sum(len(f['addedStrictPairs']) for f in report['mouthSkinExpressionChecks']),
            'contactFrames': len(report['mouthSkinExpressionChecks']), 'actualFloat32FixedEyeHairMaximumDisplacementM': fixed_interfaces,
            'cage': {'minimumAdjacentRingDeltaYM': float(dy.min()), 'nonmonotoneRingCornerIds': np.argwhere(dy <= 0).tolist(),
                'reversedFrontWidthRingIds': np.flatnonzero(width <= 0).tolist(), 'minimumFrontWidthM': float(width.min()),
                'maximumControlDisplacementM': float(np.linalg.norm((C - R).reshape(-1, 3), axis=1).max())},
            'actualReferenceOrientation': geometry, 'resourceIdentity': {'avatarSha256': report['avatarSha256'], 'gear': gear_checks}})
    result = {'schema': 'head-diagnostic-readback-v1', 'cases': rows, 'allUnadmitted': all(r['status'] == 'diagnostic-failed' for r in rows),
        'producerMatchesPreparedPlan': all(sha(ROOT / row['path']) == row['sha256'] for row in plan['producer']),
        'originalPreflightSha256': sha(SOURCE / 'generated/preflight.json'),
        'rootCauseFacts': ['All eight front cage Y control chains reverse order. Six front width chains cross sides.',
            'Head.fit uses unconstrained ridge least squares. Stored control displacements reach metre scale for centimetre-scale requests.'],
        'hypotheses': ['Weak/near-dependent constrained-region response may drive large coefficients; response singular values were not saved.',
            'Spatial weight gradient d*grad(w) may further invert the blended field; no derivative-term decomposition was run.'],
        'limits': ['The recorded minimum ambient Jacobian location was not saved. Reversed triangle reference normals are actual output facts and are not the exact location/value of that minimum.',
            'Surface reference-normal reversal can include large local rotation, so its count is not an ambient negative-determinant count.',
            'Contact classification in the batch concerns prebake common-map values. This readback checks resource identities and actual Float32 interfaces/orientations, not all contact pairs again.'],
        'productionAdmitted': False, 'runtimeAccepted': False}
    (BASE / 'execution-summary.json').write_bytes((json.dumps(result, indent=2) + '\n').encode())
    print(json.dumps({'cases': len(rows), 'allUnadmitted': result['allUnadmitted'], 'nonmonotoneCages': sum(bool(r['cage']['nonmonotoneRingCornerIds']) for r in rows),
                      'crossedWidths': sum(bool(r['cage']['reversedFrontWidthRingIds']) for r in rows), 'producerUnchanged': result['producerMatchesPreparedPlan']}))


if __name__ == '__main__':
    main()
