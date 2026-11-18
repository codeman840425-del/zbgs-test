"""Exercise the same importer on real leg triangles and the rejected native ankle edges."""
import hashlib
import itertools
import json
from collections import defaultdict
from pathlib import Path
import sys
import unittest

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/production'))
sys.path.insert(0, str(ROOT / 'scripts/m2-socks-layer-v1'))
import build as crew
from uv_seam import stitch_uv_patch


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def attribute_set(attrs):
    return {k: a for k, a in attrs.items() if k != 'TEXCOORD_0'}


def verify_control(body):
    g, attrs, tris, skin, mi, pi = crew.source(body)
    vrm = g.doc['extensions']
    if 'VRMC_vrm' in vrm:
        human = {key: v['node'] for key, v in vrm['VRMC_vrm']['humanoid']['humanBones'].items()}
    else:
        human = {row['bone']: row['node'] for row in vrm['VRM']['humanoid']['humanBones']}
    joints = {skin['joints'].index(human['left' + role]) for role in ['LowerLeg', 'Foot', 'Toes']}
    good = np.all((attrs['WEIGHTS_0'] == 0) | np.isin(attrs['JOINTS_0'], list(joints)), axis=1)
    edges = defaultdict(list)
    for i in np.flatnonzero(good[tris].all(1)):
        tri = tris[i]
        for a, b in zip(tri, np.roll(tri, -1)):
            edges[tuple(sorted((a, b)))].append((i, a, b))
    left, right = next(pair for pair in edges.values() if len(pair) == 2 and pair[0][1:] == pair[1][1:][::-1])
    face_ids = [int(left[0]), int(right[0])]
    source_ids = tris[face_ids]
    verts, idx = np.unique(source_ids, return_inverse=True)
    original_faces = idx.reshape(2, 3)
    original_attrs = {k: a[verts] for k, a in attribute_set(attrs).items()}
    # Controlled chart split. The true pre-split face/corner indices come
    # from the original pinned Body, independently of the exported positions.
    draw = np.arange(6).reshape(2, 3)
    exported = {k: a[source_ids.ravel()].copy() for k, a in attribute_set(attrs).items()}
    uv = attrs['TEXCOORD_0'][source_ids.ravel()].copy()
    uv[3:] += .25
    restored = stitch_uv_patch(original_faces, original_attrs, draw, exported, uv, joints)
    assert np.array_equal(verts[restored['sourceFaces']], source_ids)
    assert np.array_equal(restored['cornerUV'], uv[draw])
    # Identical exported buffers with a source containing an intentional split.
    # Recovering a shared edge here would silently change original topology.
    try:
        stitch_uv_patch(draw, exported, draw, exported, uv, joints)
    except ValueError as exc:
        assert str(exc) == 'no proven split UV edge'
        false_edge = str(exc)
    else:
        raise AssertionError('Falsely welded a distinct source component')
    return {'source': body, 'mesh': mi, 'primitive': pi, 'sourceTriangles': face_ids, 'originalCornerIds': source_ids.tolist(),
            'deformerRawJoints': sorted(joints), 'actualNonUVAttributesPreserved': sorted(exported),
            'controlledSplitVertices': 6, 'restoredVertices': len(verts), 'recoveredReverseEdges': restored['pairedBoundaryEdges'],
            'cornerUVPreserved': True, 'sameExportDifferentSourceRejection': false_edge}


def native_rejections(body, previous):
    g, attrs, tris, skin, mi, pi = crew.source(body)
    edge = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    graph = coo_matrix((np.ones(len(edge)), edge.T), shape=(len(attrs['POSITION']),) * 2)
    _, components = connected_components(graph, directed=False)
    results = []
    for side, diagnostic in previous['sourceGeometryReadback']['ankleOpenEdgesAfterPositionWeld'].items():
        matches = [r['originalVertices'] for r in diagnostic['nearCoincidentUnmergedPairs']]
        for a, b in itertools.combinations(matches, 2):
            candidates = [np.flatnonzero((tris == a[j]).any(1) & (tris == b[j]).any(1)) for j in range(2)]
            if any(len(face) != 1 for face in candidates):
                continue
            ids = [int(face[0]) for face in candidates]
            f = tris[ids]
            pair = np.array([a, b])
            p, q = pair.T
            assert np.all(components[p] != components[q])
            position_delta = np.linalg.norm(attrs['POSITION'][p] - attrs['POSITION'][q], axis=1)
            normal_delta = np.linalg.norm(attrs['NORMAL'][p] - attrs['NORMAL'][q], axis=1)
            weight_delta = np.max(np.abs(attrs['WEIGHTS_0'][p] - attrs['WEIGHTS_0'][q]), axis=1)
            assert np.array_equal(attrs['JOINTS_0'][p], attrs['JOINTS_0'][q])
            joints = set(attrs['JOINTS_0'][f][attrs['WEIGHTS_0'][f] > 0])
            # The actual raw exporter topology has distinct edges.
            try:
                stitch_uv_patch(f, attribute_set(attrs), f, attribute_set(attrs), attrs['TEXCOORD_0'], joints)
            except ValueError as err:
                assert str(err) == 'no proven split UV edge'
                rejection = str(err)
            else:
                raise AssertionError('Original open boundaries must survive')
            # Even guessing the requested duplicate correspondence disagrees
            # with the native per-corner normal/position/weight data.
            forged = f.copy()
            for old, new in pair:
                forged[f == new] = old
            try:
                stitch_uv_patch(forged, attribute_set(attrs), f, attribute_set(attrs), attrs['TEXCOORD_0'], joints)
            except ValueError as err:
                assert str(err).startswith('source attribute differs')
                guess_rejected = str(err)
            else:
                raise AssertionError('Unverified correspondence was accepted')
            results.append({'side': side, 'originalTriangles': ids, 'suggestedEndpointPairs': pair.tolist(),
                            'rawComponentIds': [int(components[p[0]]), int(components[q[0]])],
                            'positionDeltaM': position_delta.tolist(), 'normalVectorDelta': normal_delta.tolist(),
                            'maximumRawWeightDeltaAtEndpoints': weight_delta.tolist(),
                            'actualSourceRejection': rejection, 'guessedCornerMapRejection': guess_rejected})
    assert len(results) == 4
    return results


def main():
    native_manifest = ROOT / 'assets-source/native-vroid-male-unmasked-base-v1/generated/manifest.json'
    spec_path = ROOT / 'assets-source/m2-socks-layer-v1/spec.json'
    previous_path = ROOT / 'assets-source/native-male-crew-socks-fit-v1/generated/result.json'
    native = json.loads(native_manifest.read_bytes())['avatar']
    spec = json.loads(spec_path.read_bytes())
    previous = json.loads(previous_path.read_bytes())
    assert native['sha256'] == previous['targetBodySha256']
    cases = unittest.defaultTestLoader.discover(str(ROOT / 'scripts/production'), pattern='test_uv_seam.py')
    tested = unittest.TextTestRunner().run(cases)
    assert tested.wasSuccessful()
    inputs = [native_manifest, spec_path, previous_path, ROOT / 'scripts/production/uv_seam.py',
              ROOT / 'scripts/production/test_uv_seam.py', Path(__file__).resolve()]
    out = {'schema': 'uv-seam-import-study-v1', 'inputs': {p.relative_to(ROOT).as_posix(): digest(p) for p in inputs},
           'unitTests': tested.testsRun, 'controlledUVSplitOfActualCharacterTriangles': [
               verify_control(b) for b in [native, spec['bodies']['female'], spec['bodies']['male']]],
           'preexistingNativeAnkleEdges': native_rejections(native, previous),
           'decision': 'existing native ankle rejected; importer proven only when original face-corner IDs, topology and non-UV attributes agree',
           'generatedNativeSock': False, 'sourceLicense': json.loads((previous_path.parent / 'preflight.json').read_bytes())['sourceLicense']}
    crew.write(HERE / 'receipt.json', out)


if __name__ == '__main__':
    main()
