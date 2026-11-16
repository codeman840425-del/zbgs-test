"""Read-only exact failure-pair geometry and float representation diagnosis."""
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from head import GLB, Head, bpy, contacts, io, np, segment_hits
from preflight import BASE, ROOT


def details(A, B):
    hits = []
    for first, second, label in [(A, B, 'mouth-to-skin'), (B, A, 'skin-to-mouth')]:
        n = np.cross(second[1] - second[0], second[2] - second[0])
        norm = np.linalg.norm(n)
        for i in range(3):
            a, b = first[i], first[(i + 1) % 3]
            d = b - a
            e1, e2 = second[1] - second[0], second[2] - second[0]
            h = np.cross(d, e2)
            determinant = np.dot(e1, h)
            offset = a - second[0]
            u = np.dot(offset, h) / determinant if determinant else None
            cross = np.cross(offset, e1)
            v = np.dot(d, cross) / determinant if determinant else None
            t = np.dot(e2, cross) / determinant if determinant else None
            hits.append({'direction': label, 'edge': i, 'strictHit': bool(segment_hits(a, b, second[None])[0]),
                'u': u, 'v': v, 't': t, 'intersectionM': (a + t * d).tolist() if t is not None else None,
                'signedEndpointPlaneDistancesM': [float(np.dot(a - second[0], n) / norm), float(np.dot(b - second[0], n) / norm)]})
    return {'mouthTriangleM': A.tolist(), 'skinTriangleM': B.tolist(), 'edgeTests': hits}


spec = json.loads((BASE / 'spec.json').read_bytes())
g = GLB((ROOT / spec['sources']['male']['body']['path']).read_bytes())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
head = Head(g, spec['setup'])
for accessor, _, points, _ in head.records:
    head.evaluate(accessor, points)
rest_path = BASE / 'generated/male-editable-head-rest.blend'
if not rest_path.exists():
    bpy.ops.wm.save_as_mainfile(filepath=str(rest_path), check_existing=False)
P = np.asarray(g.accessor(head.face_accessor), float)
target = g.doc['meshes'][1]['primitives'][0]['targets'][0]
D = np.asarray(g.accessor(target['POSITION']), float)
E = P + D
shift = np.array([.003, 0, 0])
head.set_cage(head.rest + shift)
Q = head.evaluate(head.face_accessor, E)
weights = head.weights(E.astype(np.float32))
exact = E + weights[:, None] * shift
mouth, skin = head.mouth_faces[47], head.skin_faces[1007]
out = {'schema': 'head-preflight-pair-diagnosis-v1', 'sourceTarget': 0, 'pair': [47, 1007],
    'sourceTargetName': g.doc['meshes'][1]['extras']['targetNames'][0],
    'expressionBinding': [r for r in g.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups'] if any(b['index'] == 0 for b in r['binds'])],
    'sourceIndices': {'mouth': mouth.tolist(), 'skin': skin.tolist()},
    'sourceWeights': {'mouth': weights[mouth].tolist(), 'skin': weights[skin].tolist()},
    'actualDisplacementsM': {'mouth': (Q[mouth] - E[mouth]).tolist(), 'skin': (Q[skin] - E[skin]).tolist()},
    'sourceFloat64Endpoint': details(E[mouth], E[skin]),
    'sourceFloat32Endpoint': details(E[mouth].astype(np.float32).astype(float), E[skin].astype(np.float32).astype(float)),
    'analyticWeightedTranslation': details(exact[mouth], exact[skin]),
    'actualModifierEndpoint': details(Q[mouth], Q[skin]),
    'actualFloat32Endpoint': details(Q[mouth].astype(np.float32).astype(float), Q[skin].astype(np.float32).astype(float)),
    'maximumModifierVersusAnalyticErrorM': float(np.linalg.norm(Q - exact, axis=1).max()),
    'sharedSourceTrianglePoints': [(int(a), int(b)) for a in mouth for b in skin if np.linalg.norm(E[a] - E[b]) < 1e-7]}
skin_primitive = next(p for m in g.doc['meshes'] for p in m['primitives'] if 'Body_00_SKIN' in g.doc['materials'][p['material']]['name'])
points = np.asarray(g.accessor(skin_primitive['attributes']['POSITION']))
skin_weights = head.weights(points.astype(np.float32))
used = np.unique(g.accessor(skin_primitive['indices']))
outside = used[(abs(points[used, 0] - head.H[0]) > .15) & (skin_weights[used] > 0)]
skin_joints = g.doc['skins'][0]['joints']
out['outsideHeadBodyInfluence'] = [{'vertex': int(i), 'positionM': points[i].tolist(), 'headWeight': float(skin_weights[i]),
    'bones': [(g.doc['nodes'][skin_joints[j]]['name'], w) for j, w in zip(g.accessor(skin_primitive['attributes']['JOINTS_0'])[i], g.accessor(skin_primitive['attributes']['WEIGHTS_0'])[i]) if w > 0]} for i in outside]
hits = [r['intersectionM'] for r in out['actualModifierEndpoint']['edgeTests'] if r['strictHit']]
out['actualIntersectionLineLengthM'] = float(np.linalg.norm(np.asarray(hits[0]) - hits[1])) if len(hits) == 2 else None
out['sourceStrictPairs'] = sorted(contacts(E, head.mouth_faces, head.skin_faces))
out['probeStrictPairs'] = sorted(contacts(Q, head.mouth_faces, head.skin_faces))
out['float32ULPMAtIntersection'] = np.spacing(np.abs(np.asarray(hits[0], dtype=np.float32))).tolist()
out['classification'] = 'float-boundary-uncertain; strict pair retained, no resolved millimetre penetration claim'
(BASE / 'generated/pair-diagnosis.json').write_bytes(io.encoded(out))
print(json.dumps({k: [r for r in v['edgeTests'] if r['strictHit']] for k, v in out.items() if isinstance(v, dict) and 'edgeTests' in v}), flush=True)
