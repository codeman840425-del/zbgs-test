"""One local official MeshDeform, continuous spatial influence and response fit."""
import ast
import importlib.util
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
from mathutils.kdtree import KDTree

from body import ROOT, body_displacement, legacy

path = ROOT / 'scripts/m2-representative-cage-trial-v1/preflight.py'
module = importlib.util.spec_from_file_location('frozen_modifier_io', path)
io = importlib.util.module_from_spec(module)
module.loader.exec_module(io)
GLB, bpy, require = io.GLB, io.bpy, io.require


def function(path, name, namespace):
    tree = ast.parse(path.read_bytes())
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    exec(compile(ast.Module([node], []), str(path), 'exec'), namespace)
    return namespace[name]


segment_hits = function(ROOT / 'scripts/m2-hairstyle-v1/check-head-space.py', 'segment_hits', {'np': np})


def contacts(P, mouth, skin):
    other = P[skin]
    low, high = other.min(1), other.max(1)
    result = set()
    for i, triangle in enumerate(P[mouth]):
        candidates = np.flatnonzero(np.all(high >= triangle.min(0), axis=1) & np.all(low <= triangle.max(0), axis=1))
        triangles = other[candidates]
        hit = np.zeros(len(candidates), bool)
        for edge in range(3):
            hit |= segment_hits(triangle[edge], triangle[(edge + 1) % 3], triangles)
            for j, face in enumerate(triangles):
                if segment_hits(face[edge], face[(edge + 1) % 3], triangle[None])[0]:
                    hit[j] = True
        result.update((i, int(candidates[j])) for j in np.flatnonzero(hit))
    return result


class Head:
    def __init__(self, g, setup):
        self.g, self.setup = g, setup
        self.context = legacy.source_context(g)
        self.H = self.context['joints']['head']
        self.records = io.group_records(g)
        self.face = next(p for _, ps, _, _ in self.records for p in ps if 'Face_00_SKIN' in g.doc['materials'][p['material']]['name'])
        self.mouth = next(p for _, ps, _, _ in self.records for p in ps if 'FaceMouth' in g.doc['materials'][p['material']]['name'])
        self.face_accessor = self.face['attributes']['POSITION']
        self.skin_faces = np.asarray(g.accessor(self.face['indices']), int).reshape(-1, 3)
        self.mouth_faces = np.asarray(g.accessor(self.mouth['indices']), int).reshape(-1, 3)
        P = np.asarray(g.accessor(self.face_accessor), float)
        self.face_lo = float(P[np.unique(self.skin_faces), 1].min() - self.H[1])
        eyes, hair = [], []
        all_endpoints = []
        for _, primitives, points, _ in self.records:
            ends = [points] + [points + np.asarray(g.accessor(t['POSITION'])) for t in primitives[0].get('targets', [])]
            all_endpoints.extend(ends)
            for p in primitives:
                name = g.doc['materials'][p['material']]['name']
                chosen = eyes if any(t in name for t in ['_EYE', 'Eyeline', 'Eyelash']) else hair if 'HAIR' in name else None
                if chosen is not None:
                    ids = np.unique(g.accessor(p['indices']))
                    chosen.extend(E[ids] for E in ends)
        self.eyes = np.unique(np.concatenate(eyes).astype(np.float32), axis=0)
        self.hair = np.unique(np.concatenate(hair).astype(np.float32), axis=0)
        anchors = np.unique(np.concatenate([self.eyes, self.hair]), axis=0)
        self.anchors = KDTree(len(anchors))
        for i, point in enumerate(anchors):
            self.anchors.insert(point, i)
        self.anchors.balance()
        self.neck_start = self.context['joints']['neck'][1] - self.H[1] - .005
        self.neck_end = self.face_lo - .01
        self.upper_start = float(self.eyes[:, 1].min() - self.H[1] + .012)
        self.upper_end = self.upper_start + .03
        lower_hair = self.hair[self.hair[:, 1] - self.H[1] < .025]
        require(len(lower_hair) > 0, 'Measured lower hair interface missing')
        self.rear_end = float(lower_hair[:, 2].min() - self.H[2] - .001)
        affected = np.concatenate([E[self.weights(E) > 0] for E in all_endpoints])
        low, high = affected.min(0) - setup['paddingM'], affected.max(0) + setup['paddingM']
        levels = sorted(set([float(low[1]), float(high[1]), self.H[1] + self.neck_start,
            self.H[1] + self.neck_end, self.H[1] + self.face_lo, self.H[1] - .025,
            self.H[1] - .005, self.H[1] + .005, self.H[1] + .02,
            self.H[1] + self.upper_start, self.H[1] + self.upper_end]))
        # Include every level in the enclosing closed cage's vertical bounds.
        low[1], high[1] = levels[0], levels[-1]
        positions = []
        for y in levels:
            positions.extend([[low[0], y, low[2]], [high[0], y, low[2]], [high[0], y, high[2]], [low[0], y, high[2]]])
        self.rest = np.asarray(positions, dtype=np.float32)
        faces = [[0, 1, 2, 3]]
        for ring in range(len(levels) - 1):
            for side in range(4):
                a, b = ring * 4 + side, ring * 4 + (side + 1) % 4
                faces.append([a, a + 4, b + 4, b])
        end = len(self.rest) - 4
        faces.append([end + 3, end + 2, end + 1, end])
        self.cage = io.mesh_object('local-head-cage', self.rest, np.asarray(faces))
        self.controls = list(range(1, len(levels) - 1))
        self.objects = {}
        for accessor, ps, points, triangles in self.records:
            obj = io.mesh_object('source-' + str(accessor), points, triangles)
            vg = obj.vertex_groups.new(name='continuous-spatial-head-weight')
            vg.add(list(range(len(points))), 1, 'REPLACE')
            modifier = obj.modifiers.new('official-dynamic-local-head', 'MESH_DEFORM')
            modifier.object, modifier.vertex_group = self.cage, vg.name
            modifier.precision, modifier.use_dynamic_bind = setup['precision'], True
            io.bind(obj, modifier)
            require(modifier.is_bound, 'Local head MeshDeform bind failed')
            obj.shape_key_add(name='Basis')
            for i, target in enumerate(ps[0].get('targets', [])):
                original_key = obj.shape_key_add(name='original-source-target-' + str(i))
                original_key.data.foreach_set('co', (points + np.asarray(g.accessor(target['POSITION']))).astype(np.float32).ravel())
            key = obj.shape_key_add(name='actual-source-input')
            self.objects[accessor] = obj, vg, key
        self.bounds = low, high
        self.section_y = np.linspace(self.face_lo + .00001, self.context['eyeMin'][1] - self.H[1] - .006, 101)
        self.landmarks = self.section_landmarks(P - self.H)
        self.landmark_source = self.sample(P)
        self.response = None

    def weights(self, P):
        x, y, z = (np.asarray(P) - self.H).T
        smooth = legacy.smooth
        w = smooth((y - self.neck_start) / (self.neck_end - self.neck_start))
        w *= 1 - smooth((y - self.upper_start) / (self.upper_end - self.upper_start))
        w *= 1 - smooth((z - (self.rear_end - .03)) / .03)
        active = np.flatnonzero(w > 0)
        distance = np.array([self.anchors.find(P[i])[2] for i in active])
        w[active] *= smooth(distance / self.setup['anchorDistanceFalloffM'])
        return w

    def evaluate(self, accessor, P, parameters=None):
        obj, vg, key = self.objects[accessor]
        points = np.asarray(P, dtype=np.float32)
        weights = self.weights(points)
        vg.remove(list(range(len(points))))
        ones = np.flatnonzero(weights >= 1)
        if len(ones):
            vg.add(ones.tolist(), 1, 'REPLACE')
        for i in np.flatnonzero((weights > 0) & (weights < 1)):
            vg.add([int(i)], float(weights[i]), 'REPLACE')
        key.data.foreach_set('co', points.ravel())
        key.value = 1
        obj.data.update()
        displacement = io.evaluate(obj).astype(float) - points
        return np.asarray(P, float) + displacement + (body_displacement(P, parameters, self.context) if parameters else 0)

    def set_cage(self, positions):
        self.cage.data.vertices.foreach_set('co', np.asarray(positions, dtype=np.float32).ravel())
        self.cage.data.update()

    def section_landmarks(self, P):
        triangles = P[self.skin_faces]
        result = []
        for y in self.section_y:
            points = []
            for i, face in enumerate(triangles):
                for corner in range(3):
                    a, b = face[corner], face[(corner + 1) % 3]
                    if abs(b[1] - a[1]) < 1e-12:
                        continue
                    t = (y - a[1]) / (b[1] - a[1])
                    q = a + t * (b - a)
                    if 0 <= t <= 1 and q[2] < -.025:
                        points.append((q[0], int(self.skin_faces[i, corner]), int(self.skin_faces[i, (corner + 1) % 3]), float(t)))
            require(points, 'Source face section empty')
            result.extend([min(points), max(points)])
        return result

    def sample(self, P):
        return np.asarray([(1 - t) * P[a] + t * P[b] for _, a, b, t in self.landmarks])

    def fit(self, parameters):
        P = np.asarray(self.g.accessor(self.face_accessor), float)
        if self.response is None:
            matrices = []
            for axis in range(3):
                columns = []
                for ring in self.controls:
                    cage = self.rest.copy()
                    signs = [-1, 1] if axis == 0 else [1, 1]
                    for side in range(2):
                        cage[4 * ring + side, axis] += signs[side] * self.setup['cageResponseProbeM']
                    self.set_cage(cage)
                    columns.append((self.sample(self.evaluate(self.face_accessor, P))[:, axis] - self.landmark_source[:, axis]) / self.setup['cageResponseProbeM'])
                matrices.append(np.asarray(columns).T)
            self.response = matrices
        y = self.landmark_source[:, 1] - self.H[1]
        jaw = 1 - legacy.smooth((y + .005) / .045)
        cheek = np.maximum(0, 1 - ((y - .005) / .045) ** 2) ** 2
        target = self.landmark_source.copy()
        target[:, 0] += (target[:, 0] - self.H[0]) * (parameters['jawWidth'] * jaw + parameters['cheekWidth'] * cheek)
        chin = 1 - legacy.smooth((y - self.face_lo) / (self.context['mouthMin'][1] - self.H[1] - self.face_lo))
        target[:, 1] -= parameters['chinLengthM'] * chin
        target[:, 2] -= parameters['chinProjectionM'] * chin
        cage = self.rest.copy()
        coefficients = []
        for axis, A in enumerate(self.response):
            regularizer = np.eye(len(self.controls)) * self.setup['responseRegularization'] ** .5
            rhs = target[:, axis] - self.landmark_source[:, axis]
            c = np.linalg.lstsq(np.vstack([A, regularizer]), np.r_[rhs, np.zeros(len(self.controls))], rcond=None)[0]
            coefficients.append(c.tolist())
            for ring, value in zip(self.controls, c):
                for side, sign in enumerate([-1, 1] if axis == 0 else [1, 1]):
                    cage[4 * ring + side, axis] += sign * value
        self.set_cage(cage)
        achieved = self.sample(self.evaluate(self.face_accessor, P))
        return {'sourcePointsM': self.landmark_source.tolist(), 'requestedPointsM': target.tolist(),
                'achievedPointsM': achieved.tolist(), 'maximumTargetResidualM': float(np.linalg.norm(achieved - target, axis=1).max()),
                'coefficientsM': coefficients, 'actualCagePositionsM': cage.tolist(),
                'responseRegularization': self.setup['responseRegularization'], 'fitScope': 'One shared linear official modifier response fit, source-attached real triangle-edge landmarks. Separate horizontal-section readback still required.'}
