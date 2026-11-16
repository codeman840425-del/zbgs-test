"""CPU source identity, actual skin, source paint, and static contact diagnostics."""
import io
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build
from flow import GLB, Validator, require


def arrays(g):
    positions, faces = [], []
    for mesh in g.doc['meshes']:
        for p in mesh['primitives']:
            points = np.array(g.accessor(p['attributes']['POSITION']))
            indices = np.array(g.accessor(p['indices']), dtype=int).reshape(-1, 3)
            faces.extend(indices+len(positions)); positions.extend(points)
    return np.array(positions), np.array(faces, dtype=int)


def nearest_distance(points, triangles):
    best = np.full(len(points), np.inf)
    for a, b, c in triangles:
        ab, ac = b-a, c-a; normal = np.cross(ab, ac); square = np.dot(normal, normal)
        if square < 1e-20: continue
        projection = points-(((points-a) @ normal)/square)[:, None]*normal
        aa, bb, cc = np.dot(ab, ab), np.dot(ab, ac), np.dot(ac, ac)
        ap, cp = (projection-a) @ ab, (projection-a) @ ac
        denominator = aa*cc-bb*bb
        u, v = (cc*ap-bb*cp)/denominator, (aa*cp-bb*ap)/denominator
        inside = (u >= 0) & (v >= 0) & (u+v <= 1)
        candidate = np.full(len(points), np.inf)
        for start, end in [(a, b), (b, c), (c, a)]:
            edge = end-start; t = np.clip((points-start) @ edge/np.dot(edge, edge), 0, 1)
            candidate = np.minimum(candidate, ((points-(start+t[:, None]*edge))**2).sum(1))
        candidate[inside] = ((points[inside]-projection[inside])**2).sum(1)
        best = np.minimum(best, candidate)
    return np.sqrt(best)


def segment_hits(start, end, triangles):
    direction = end-start; e1 = triangles[:, 1]-triangles[:, 0]; e2 = triangles[:, 2]-triangles[:, 0]
    cross = np.cross(direction, e2); det = np.sum(e1*cross, axis=1)
    inverse = 1/np.where(abs(det) > 1e-14, det, 1)
    offset = start-triangles[:, 0]; u = np.sum(offset*cross, axis=1)*inverse
    q = np.cross(offset, e1); v = np.sum(direction*q, axis=1)*inverse; t = np.sum(e2*q, axis=1)*inverse
    return (abs(det) > 1e-14) & (u >= -1e-8) & (v >= -1e-8) & (u+v <= 1+1e-8) & (t >= 0) & (t <= 1)


def intersections(points, faces, other_points, other_faces, self_check=False):
    triangles, others = points[faces], other_points[other_faces]
    low, high = others.min(1), others.max(1); pairs = []
    for i, triangle in enumerate(triangles):
        candidates = np.flatnonzero(np.all(high >= triangle.min(0), axis=1) & np.all(low <= triangle.max(0), axis=1))
        if self_check:
            candidates = candidates[candidates > i]
            candidates = np.array([j for j in candidates if not set(faces[i]) & set(other_faces[j])], dtype=int)
        if not len(candidates): continue
        group = others[candidates]; hit = np.zeros(len(group), dtype=bool)
        for k in range(3):
            hit |= segment_hits(triangle[k], triangle[(k+1) % 3], group)
            hit |= segment_hits(group[:, k], group[:, (k+1) % 3], np.broadcast_to(triangle, group.shape))
        pairs.extend([i, int(j)] for j in candidates[hit])
    return pairs


def source_paint(g, attrs, faces):
    primitive = g.doc['meshes'][0]['primitives'][0]
    material = g.doc['materials'][primitive['material']]
    texture = g.doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
    image = g.doc['images'][texture['source']]; view = g.doc['bufferViews'][image['bufferView']]
    encoded = g.binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
    rgb = np.array(Image.open(io.BytesIO(encoded)).convert('RGB')); used = np.unique(faces); bands = []
    for lo, hi in [(0, .1), (.1, .22), (.25, .45), (.55, .65)]:
        ids = used[(attrs['POSITION'][used, 1] >= lo) & (attrs['POSITION'][used, 1] < hi)]
        uv = attrs['TEXCOORD_0'][ids]
        xy = np.clip(np.floor(uv*[rgb.shape[1], rgb.shape[0]]).astype(int), 0, [rgb.shape[1]-1, rgb.shape[0]-1])
        pixels = rgb[xy[:, 1], xy[:, 0]]
        bands.append({'yRangeM': [lo, hi], 'sourceVerticesSampled': len(ids), 'medianRGB8': np.median(pixels, axis=0).tolist()})
    return {'materialName': material['name'], 'encodedTextureSha256': build.hashlib.sha256(encoded).hexdigest(),
            'sampleUVRule': 'glTF TEXCOORD_0 directly maps image top-left coordinates; no texture or UV modification', 'bands': bands,
            'newSockTextureCount': 0, 'sourceBodyTextureUnchanged': True,
            'distinction': 'The new geometry ends at its crew cuff. Existing Body-painted sock color above the new cuff remains on the unchanged Body.'}


def main():
    package = build.PACKAGE; out = package/'generated'
    spec = json.loads((package/'spec.json').read_text(encoding='utf-8'))
    before = {p.relative_to(out).as_posix(): build.sha(p) for p in out.rglob('*') if p.is_file() and p.name not in ['qa-report.json', 'package-files.json']}
    build.main()
    require(before == {p.relative_to(out).as_posix(): build.sha(p) for p in out.rglob('*') if p.is_file() and p.name not in ['qa-report.json', 'package-files.json']}, 'Repeat export changed actual outputs')
    rows = []
    report = json.loads((out/'build-report.json').read_text(encoding='utf-8'))
    for body_type, body in spec['bodies'].items():
        g, attrs, body_faces, skin, mi, pi = build.source(body)
        entry = json.loads((out/(body_type+'-entry.json')).read_text(encoding='utf-8'))
        exported = GLB((out/entry['url']).read_bytes()); P, F = arrays(exported)
        require(len(exported.doc['meshes'][0]['primitives']) == 2 and all((P.max(0)-P.min(0)) > 0), 'Both independent sock sides must have positive dimensions')
        binding = Validator(build.ROOT).equipment(entry, body['sha256'], g, (out/(body_type+'-entry.json')).relative_to(build.ROOT).as_posix())
        require(binding['bones'] == 6, 'Sock must retain actual lower-leg, foot and toe joints')
        require(not exported.doc.get('textures') and entry['restMatrix'] == np.eye(4).reshape(-1).tolist(), 'Sock must use independent plain material and identity mesh rest transform')
        self_pairs = intersections(P, F, P, F, True)
        contacts = []
        fit = json.loads((out/(body_type+'-fit.json')).read_text(encoding='utf-8'))
        require(entry['pairedWith'] == {'shoes': [{'id': row['id'], 'sha256': row['sha256']} for row in fit['pairingCandidates'][:1]],
                                       'lower': [{'id': row['id'], 'sha256': row['sha256']} for row in fit['pairingCandidates'][1:]]}, 'Exact pairing declaration mismatch')
        variant = GLB((out/'parameter-variant'/entry['url']).read_bytes()); variant_points, _ = arrays(variant)
        variant_row = next(row for row in report['variants'] if row['bodyType'] == body_type)
        expected_delta = spec['parameterVariant']['value']-spec['crewAboveAnkleM']
        require(variant_row['assetSha256'] != entry['sha256'], 'Parameter edit did not change actual GLB bytes')
        require(abs(variant_row['cuffYMetres']-fit['cuffYMetres']-expected_delta) < 1e-12, 'Parameter edit cuff metadata mismatch')
        actual_delta = float(variant_points[:, 1].max()-P[:, 1].max())
        require(abs(actual_delta-expected_delta) < 1e-5, 'Parameter edit did not move actual exported cuff geometry')
        bone_positions = build.bone_positions(g.doc)
        skin_evidence = []
        for p in exported.doc['meshes'][0]['primitives']:
            joints = np.array(exported.accessor(p['attributes']['JOINTS_0']), dtype=int)
            weights = np.array(exported.accessor(p['attributes']['WEIGHTS_0']))
            for index, binding_row in enumerate(entry['bindings']):
                mask = (joints == index) & (weights > 0)
                if not mask.any(): continue
                skin_evidence.append({'bone': binding_row['sourceBone'], 'semantic': binding_row['humanoidSemantic'],
                                      'rawBindPositionM': bone_positions[binding_row['humanoidSemantic']].tolist(),
                                      'weightedVertices': int(mask.any(1).sum()), 'sumWeights': float(weights[mask].sum())})
        body_pos = attrs['POSITION']; low_body = body_faces[np.min(body_pos[body_faces, 1], axis=1) < fit['cuffYMetres']+.01]
        dependencies = [{'id': 'intact-body', 'path': body['path'], 'sha256': body['sha256']}]+fit['pairingCandidates']
        for dep in dependencies:
            target = GLB(build.local(build.ROOT, dep['path']).read_bytes())
            if dep['id'] == 'intact-body': Q, G = body_pos, low_body
            else: Q, G = arrays(target)
            pairs = intersections(P, F, Q, G)
            distance = nearest_distance(P[::2], Q[G])
            contacts.append({'id': dep['id'], 'sha256': dep['sha256'], 'nonCoplanarTrianglePairs': len(pairs),
                             'firstPairs': pairs[:12], 'minimumSampledVertexToSurfaceM': float(distance.min()),
                             'referenceBoundsM': [Q.min(0).tolist(), Q.max(0).tolist()]})
        require(build.sha(build.local(build.ROOT, body['path'])) == body['sha256'], 'Original Body changed')
        try:
            build.source(dict(body, sha256='0'*64))
        except ValueError as error:
            require('Body SHA mismatch: '+body['path'] == str(error), 'Wrong input rejection did not locate source')
        else:
            raise AssertionError('Wrong source SHA accepted')
        rows.append({'bodyType': body_type, 'assetSha256': entry['sha256'], 'vertices': len(P), 'triangles': len(F),
                     'actualBinding': binding, 'nonAdjacentSelfTrianglePairs': len(self_pairs), 'firstSelfPairs': self_pairs[:12],
                     'jointUsage': skin_evidence, 'parameterEditProof': {'actualCuffBoundsDeltaM': actual_delta, 'expectedDeltaM': expected_delta,
                        'variantSha256': variant_row['assetSha256']},
                     'contactDiagnostics': contacts, 'originalBodyPaint': source_paint(g, attrs, body_faces), 'runtimeAccepted': False})
    report = {'schema': 'zbgs-socks-layer-qa-v1', 'passedSourceIdentityAndSkin': True, 'repeatExportExact': True, 'rejectedWrongBodyShaWithPath': True, 'bodies': rows,
              'GPUUsed': False, 'BlenderUsed': False, 'runtimeAccepted': False,
              'limits': ['Rest-pose noncoplanar edge/triangle crossings and sampled distances only; not full penetration depth or continuous collision',
                         'Contact counts are recorded diagnostics, not a zero-count gate', 'Body-painted sock color remains; no body coverage/hiding or texture edits',
                         'Current shoe and pants pairing remains a candidate until game movement, removal, pause and restore checks']}
    build.write(out/'qa-report.json', report)
    files = [p for directory in [package, Path(__file__).resolve().parent] for p in directory.rglob('*')
             if p.is_file() and '__pycache__' not in p.parts and p.name != 'package-files.json']
    build.write(out/'package-files.json', {'files': [{'path': p.relative_to(build.ROOT).as_posix(), 'sha256': build.sha(p), 'bytes': p.stat().st_size} for p in sorted(files)]})
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
