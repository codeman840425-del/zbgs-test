"""Measure body height above each garment face over its projected overlap."""
import numpy as np


def clip_to_face(poly, corners, axis):
    for i in range(3):
        origin = corners[i]
        inward = np.cross(axis, corners[(i+1) % 3] - origin)
        side = (poly - origin) @ inward
        result = []
        for j, a in enumerate(poly):
            k = (j+1) % len(poly)
            if side[j] >= 0:
                result.append(a)
            if (side[j] < 0) != (side[k] < 0):
                result.append(a + (poly[k] - a) * (side[j] / (side[j] - side[k])))
        if not result:
            return np.empty((0,3))
        poly = np.array(result)
    return poly


def required_ease(part, body, triangles, spec):
    q = body[triangles[part['bodyFaceIds']]]
    q_min, q_max = q.min(1), q.max(1)
    q_normal = np.cross(q[:,1]-q[:,0], q[:,2]-q[:,0])
    out = np.zeros(len(part['contact']))
    face_heights = []
    for face in part['sheet']:
        p = part['contact'][face]
        raw = np.cross(p[1]-p[0], p[2]-p[0])
        direction = raw / np.linalg.norm(raw)
        # Search one local face width on each side of its plane. The
        # greatest *outward* height only considers front-facing Body facets.
        reach = max(np.linalg.norm(p[(i+1)%3]-p[i]) for i in range(3))
        select = np.all(q_max >= p.min(0)-reach, axis=1) & np.all(q_min <= p.max(0)+reach, axis=1) & (q_normal @ direction > 0)
        highest = 0.
        for tri in q[select]:
            poly = clip_to_face(tri, p, direction)
            if len(poly):
                heights = (poly-p[0]) @ direction
                if heights.min() <= reach:
                    highest = max(highest, float(heights.max()))
        alignment = np.min(part['normals'][face] @ direction)
        if alignment <= 0:
            raise ValueError('Folded garment contact face, no outward clearance correction')
        # Keep the original 0.3 mm inner clearance; the measured missing
        # target volume and projection of vertex normals determine the ease.
        wanted = (highest + spec['outerOffsetM'] - spec['thicknessM']) / alignment
        extra = max(0., wanted - (spec['outerOffsetM']-spec['thicknessM']))
        out[face] = np.maximum(out[face], extra)
        face_heights.append(highest)
    return out, {'maxBodyHeightAboveTemplateFaceM': max(face_heights), 'maxAddedEaseM': float(out.max()),
                 'medianAddedEaseM': float(np.median(out)), 'perPatternVertexAddedEaseM': out.tolist()}
