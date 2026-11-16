"""CPU independent crew-sock shells from exact Body surfaces and raw skin data."""
import copy
from collections import defaultdict
import hashlib
from itertools import product
import json
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT/'assets-source/m2-socks-layer-v1'
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB, local, require


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, data):
    path.write_bytes((json.dumps(data, ensure_ascii=False, indent=2)+'\n').encode('utf-8'))


def source(body):
    path = local(ROOT, body['path'])
    require(sha(path) == body['sha256'], 'Body SHA mismatch: '+body['path'])
    g = GLB(path.read_bytes()); d = g.doc
    matches = [(mi, pi, p) for mi, m in enumerate(d['meshes']) for pi, p in enumerate(m['primitives'])
               if '_Body_00_SKIN' in d['materials'][p['material']]['name']]
    require(len(matches) == 1, 'Body primitive ambiguous')
    mi, pi, p = matches[0]
    node = next(n for n in d['nodes'] if n.get('mesh') == mi)
    require(not any(k in node for k in ['matrix', 'translation', 'rotation', 'scale']), 'Body mesh transform must be identity')
    skin = d['skins'][node['skin']]
    attrs = {name: np.array(g.accessor(index)) for name, index in p['attributes'].items()}
    attrs['JOINTS_0'] = attrs['JOINTS_0'].astype(int)
    triangles = np.array(g.accessor(p['indices']), dtype=int).reshape(-1, 3)
    return g, attrs, triangles, skin, mi, pi


def bone_positions(doc):
    parents = {child: i for i, node in enumerate(doc['nodes']) for child in node.get('children', [])}
    result = {}
    for human in doc['extensions']['VRM']['humanoid']['humanBones']:
        node = human['node']; position = np.array(doc['nodes'][node].get('translation', [0, 0, 0]), dtype=float)
        while node in parents:
            node = parents[node]
            require(not any(key in doc['nodes'][node] for key in ['rotation', 'scale', 'matrix']), 'Expected translation-only source leg bind hierarchy')
            position += doc['nodes'][node].get('translation', [0, 0, 0])
        result[human['bone']] = position
    return result


def topology(points, faces):
    edges = defaultdict(list); neighbors = defaultdict(set)
    for face in faces:
        for a, b in zip(face, np.roll(face, -1)):
            a, b = int(a), int(b)
            edges[tuple(sorted((a, b)))].append((a, b)); neighbors[a].add(b); neighbors[b].add(a)
    require(all(len(uses) <= 2 for uses in edges.values()), 'Nonmanifold sock surface')
    require(all(len(uses) == 1 or uses[0] == uses[1][::-1] for uses in edges.values()), 'Inconsistent sock winding')
    remaining = set(range(len(points))); components = 0
    while remaining:
        components += 1; stack = [remaining.pop()]
        while stack:
            for other in neighbors[stack.pop()] & remaining:
                remaining.remove(other); stack.append(other)
    return edges, components


def normals(points, faces):
    result = np.zeros_like(points)
    cross = np.cross(points[faces[:, 1]]-points[faces[:, 0]], points[faces[:, 2]]-points[faces[:, 0]])
    require(np.min(np.linalg.norm(cross, axis=1)) > 1e-12, 'Degenerate sock face')
    for column in range(3):
        np.add.at(result, faces[:, column], cross)
    result /= np.linalg.norm(result, axis=1)[:, None]
    return result


def join_ankle_seam(points, weights, faces, cuff, limit):
    edges, components = topology(points, faces)
    if components == 1:
        return points, weights, faces, {'joined': False, 'maximumDisplacementM': 0.}
    boundary = [uses[0] for uses in edges.values() if len(uses) == 1]
    neighbors = defaultdict(set)
    for a, b in boundary:
        if abs(points[a, 1]-cuff) > 1e-7:
            neighbors[a].add(b); neighbors[b].add(a)
    remaining = set(neighbors); loops = []
    while remaining:
        stack = [remaining.pop()]; loop = []
        while stack:
            a = stack.pop(); loop.append(a)
            for b in neighbors[a] & remaining:
                remaining.remove(b); stack.append(b)
        loops.append(sorted(loop))
    require(components == 2 and len(loops) == 2 and len(loops[0]) == len(loops[1]), 'Unsupported original ankle seam topology')
    a, b = map(np.array, loops)
    distances = np.linalg.norm(points[a, None, :]-points[b][None, :, :], axis=2)
    matches = distances.argmin(1)
    require(len(set(matches)) == len(b) and distances.min(1).max() <= limit, 'Ankle seam match exceeds fixed displacement bound')
    paired = b[matches]
    weight_delta = float(np.max(np.abs(weights[a]-weights[paired])))
    require(weight_delta < 1e-5, 'Original ankle seam skin weights conflict')
    mapping = np.arange(len(points)); mapping[paired] = a
    used = np.unique(mapping); packed = {int(old): i for i, old in enumerate(used)}
    remapped = np.array([[packed[int(mapping[index])] for index in face] for face in faces])
    return points[used], weights[used], remapped, {'joined': True, 'originalComponents': components,
            'pairedRingVertices': len(a), 'maximumDisplacementM': float(distances.min(1).max()), 'maximumWeightDelta': weight_delta}


def make_parts(g, attrs, triangles, skin, spec):
    bones = bone_positions(g.doc)
    cuff = max(bones['leftFoot'][1], bones['rightFoot'][1])+spec['crewAboveAnkleM']
    require(cuff < min(bones['leftLowerLeg'][1], bones['rightLowerLeg'][1])-.1, 'Crew sock must stay below knees')
    require(0 < spec['thicknessM'] < spec['outerOffsetM'] <= .002, 'Sock thin-layer bounds invalid')
    count = len(attrs['POSITION']); dense = np.zeros((count, len(skin['joints'])))
    for column in range(4):
        np.add.at(dense, (np.arange(count), attrs['JOINTS_0'][:, column]), attrs['WEIGHTS_0'][:, column])
    values = np.column_stack([attrs['POSITION'], dense])
    center = (bones['leftFoot'][0]+bones['rightFoot'][0])/2
    parts, traces = [], []
    for side, direction in [('left', -1), ('right', 1)]:
        vertices, faces, lookup = [], [], defaultdict(list); seam_delta = 0.; seam_position_delta = 0.
        def vertex(value):
            nonlocal seam_delta, seam_position_delta
            tolerance = spec['seamWeldToleranceM']
            key = np.floor(value[:3]/tolerance).astype(int)
            for offset in product([-1, 0, 1], repeat=3):
                for index in lookup[tuple(key+offset)]:
                    delta = float(np.linalg.norm(vertices[index][:3]-value[:3]))
                    if delta <= tolerance:
                        seam_delta = max(seam_delta, float(np.max(np.abs(vertices[index][3:]-value[3:]))))
                        seam_position_delta = max(seam_position_delta, delta)
                        return index
            index = len(vertices); lookup[tuple(key)].append(index); vertices.append(value)
            return index
        original_faces = []
        for face_id, triangle in enumerate(triangles):
            polygon = [values[int(index)].copy() for index in triangle]
            if (np.mean([v[0] for v in polygon])-center)*direction <= 0:
                continue
            clipped = []
            for a, b in zip(polygon, polygon[1:]+polygon[:1]):
                da, db = cuff-a[1], cuff-b[1]
                if da >= 0: clipped.append(a)
                if (da < 0) != (db < 0): clipped.append(a+(b-a)*(da/(da-db)))
            if len(clipped) < 3: continue
            ids = [vertex(value) for value in clipped]
            faces.extend([ids[0], ids[i], ids[i+1]] for i in range(1, len(ids)-1)); original_faces.append(face_id)
        points = np.array(vertices)[:, :3]; weights = np.array(vertices)[:, 3:]; faces = np.array(faces, dtype=int)
        require(len(points) > 20 and seam_delta < 1e-5, 'Sock extraction or seam weights invalid')
        points, weights, faces, ankle_join = join_ankle_seam(points, weights, faces, cuff, spec['ankleSeamJoinMaxM'])
        edges, components = topology(points, faces)
        boundary = [uses[0] for uses in edges.values() if len(uses) == 1]
        boundary_counts = defaultdict(int)
        for a, b in boundary: boundary_counts[a] += 1; boundary_counts[b] += 1
        require(components == 1 and all(value == 2 for value in boundary_counts.values()) and boundary,
                'Sock needs one foot-to-cuff connected surface: '+str({'side': side, 'components': components,
                'boundaryEdges': len(boundary), 'badBoundaryDegrees': {i: value for i, value in boundary_counts.items() if value != 2},
                'points': {i: points[i].tolist() for i, value in boundary_counts.items() if value != 2}}))
        require(np.max(np.abs(points[list(boundary_counts), 1]-cuff)) < 1e-7,
                'Unexpected source foot opening: '+str(points[[index for index in boundary_counts if abs(points[index, 1]-cuff) > 1e-7]].tolist()))
        normal = normals(points, faces)
        outer = points+normal*spec['outerOffsetM']; inner = points+normal*(spec['outerOffsetM']-spec['thicknessM'])
        n = len(points); shell = np.vstack([outer, inner])
        rim = [[a, b+n, b] for a, b in boundary]+[[a, a+n, b+n] for a, b in boundary]
        shell_faces = np.vstack([faces, faces[:, ::-1]+n, np.array(rim)])
        shell_edges, closed_components = topology(shell, shell_faces)
        require(closed_components == 1 and all(len(uses) == 2 for uses in shell_edges.values()), 'Sock thickness shell is not closed')
        joints = np.argsort(-weights, axis=1, kind='stable')[:, :4]
        packed = np.take_along_axis(weights, joints, axis=1); discarded = 1-packed.sum(1)
        require(discarded.max() < 1e-5, 'Sock clipping loses source skin weights')
        packed /= packed.sum(1)[:, None]
        part = {'POSITION': shell.astype('<f4'), 'NORMAL': normals(shell, shell_faces).astype('<f4'),
                'JOINTS_0': np.vstack([joints, joints]).astype('<u2'), 'WEIGHTS_0': np.vstack([packed, packed]).astype('<f4')}
        parts.append((part, shell_faces.astype('<u4')))
        traces.append({'side': side, 'sourceFaceCount': len(original_faces), 'sourceFacesSha256': hashlib.sha256(np.array(original_faces, dtype='<u4').tobytes()).hexdigest(),
                       'surfaceVertices': n, 'surfaceTriangles': len(faces), 'cuffBoundaryEdges': len(boundary),
                       'vertices': len(shell), 'triangles': len(shell_faces), 'closedComponents': closed_components,
                       'boundsM': [shell.min(0).tolist(), shell.max(0).tolist()], 'maximumDiscardedWeight': float(discarded.max()),
                       'coincidentWeightDelta': seam_delta, 'maximumSeamWeldPositionDeltaM': seam_position_delta, 'ankleSeamJoin': ankle_join})
    return parts, {'cuffYMetres': float(cuff), 'anklesYMetres': [float(bones[key][1]) for key in ['leftFoot', 'rightFoot']],
                   'kneesYMetres': [float(bones[key][1]) for key in ['leftLowerLeg', 'rightLowerLeg']], 'sides': traces}


def export(g, skin, parts, identifier, color):
    # Same source joint remap / ancestor preservation / exact IBM contract as the
    # established m1b exporter, without importing its fixed public-output writer.
    d = g.doc; parents = {c: i for i, node in enumerate(d['nodes']) for c in node.get('children', [])}
    used = sorted({int(j) for attrs, faces in parts for j, w in zip(attrs['JOINTS_0'].flat, attrs['WEIGHTS_0'].flat) if w > 1e-8})
    remap = {joint: index for index, joint in enumerate(used)}
    needed = {skin['joints'][joint] for joint in used}
    for node in list(needed):
        while node in parents: node = parents[node]; needed.add(node)
    node_map = {old: i+1 for i, old in enumerate(sorted(needed))}
    nodes = [{'name': identifier, 'mesh': 0, 'skin': 0}]
    for old in sorted(needed):
        node = {key: value for key, value in d['nodes'][old].items() if key in ['name', 'translation', 'rotation', 'scale', 'matrix']}
        children = [node_map[child] for child in d['nodes'][old].get('children', []) if child in needed]
        if children: node['children'] = children
        nodes.append(node)
    blob = bytearray(); views, accessors, primitives = [], [], []
    def accessor(array, component, kind):
        dtype = {5123: '<u2', 5125: '<u4', 5126: '<f4'}[component]
        array = np.asarray(array, dtype=dtype); blob.extend(b'\0'*(-len(blob) % 4))
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': array.nbytes}); blob.extend(array.tobytes())
        row = {'bufferView': len(views)-1, 'componentType': component, 'type': kind, 'count': len(array)}
        if kind == 'VEC3': row.update(min=array.min(0).tolist(), max=array.max(0).tolist())
        accessors.append(row); return len(accessors)-1
    for attrs, faces in parts:
        joints = np.array([[remap[int(j)] if w > 1e-8 else 0 for j, w in zip(js, ws)] for js, ws in zip(attrs['JOINTS_0'], attrs['WEIGHTS_0'])])
        attributes = {key: accessor(joints if key == 'JOINTS_0' else value, 5123 if key == 'JOINTS_0' else 5126,
                                   'VEC4' if key in ['JOINTS_0', 'WEIGHTS_0'] else 'VEC3') for key, value in attrs.items()}
        primitives.append({'attributes': attributes, 'indices': accessor(faces.reshape(-1, 1), 5125, 'SCALAR'), 'material': 0})
    inverse = np.array(g.accessor(skin['inverseBindMatrices']))
    inverse_accessor = accessor(inverse[used], 5126, 'MAT4')
    doc = {'asset': {'version': '2.0', 'generator': 'm2-socks-layer-v1 CPU source'}, 'scene': 0,
           'scenes': [{'nodes': [0]+[node_map[node] for node in sorted(needed) if parents.get(node) not in needed]}],
           'nodes': nodes, 'skins': [{'joints': [node_map[skin['joints'][joint]] for joint in used], 'inverseBindMatrices': inverse_accessor}],
           'meshes': [{'name': identifier, 'primitives': primitives}], 'materials': [{'name': 'PlainCrewSockCotton',
             'pbrMetallicRoughness': {'baseColorFactor': color, 'metallicFactor': 0, 'roughnessFactor': .95}, 'extensions': {'KHR_materials_unlit': {}}}],
           'buffers': [{'byteLength': len(blob)}], 'bufferViews': views, 'accessors': accessors, 'extensionsUsed': ['KHR_materials_unlit']}
    text = json.dumps(doc, sort_keys=True, separators=(',', ':')).encode(); text += b' '*(-len(text) % 4); blob.extend(b'\0'*(-len(blob) % 4))
    data = struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(blob))+struct.pack('<I4s', len(text), b'JSON')+text+struct.pack('<I4s', len(blob), b'BIN\0')+blob
    human = {row['node']: row['bone'] for row in d['extensions']['VRM']['humanoid']['humanBones']}
    bindings = [{'sourceBone': d['nodes'][skin['joints'][joint]]['name'], 'targetRawBone': d['nodes'][skin['joints'][joint]]['name'],
                 'humanoidSemantic': human.get(skin['joints'][joint]), 'inverseBindMatrix': inverse[joint].tolist()} for joint in used]
    return data, bindings


def build_body(body_type, body, spec, output):
    g, attrs, triangles, skin, mi, pi = source(body)
    parts, trace = make_parts(g, attrs, triangles, skin, spec)
    identifier = body_type+'-plain-crew-socks-v1'
    data, bindings = export(g, skin, parts, identifier, spec['color'])
    asset_path = output/(identifier+'.glb'); asset_path.write_bytes(data)
    manifest_path = local(ROOT, body['manifest']); manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    dependencies = []
    for item_id in [body['shoesId']]+body['bottomIds']:
        item = next(item for item in manifest['items'] if item['id'] == item_id)
        require(item['sha256'] == body['pairingSha256'][item_id], 'Pairing manifest identity changed: '+item_id)
        path = local(ROOT, 'prototype/public'+item['url']) if item['url'].startswith('/') else manifest_path.parent/item['url']
        require(sha(path) == item['sha256'], 'Pairing asset SHA mismatch: '+item_id)
        dependencies.append({'id': item_id, 'path': path.relative_to(ROOT).as_posix(), 'sha256': item['sha256']})
    entry = {'id': identifier, 'name': 'Plain crew socks', 'styleId': spec['styleId'], 'fitId': body_type+'-original-plain-crew-socks-fit-v1', 'version': 1,
             'slot': 'socks', 'url': asset_path.name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
             'compatibleAvatarSha256': body['sha256'], 'preserveOriginalBody': True, 'requiresRawSkeleton': True, 'bindings': bindings,
             'pairedWith': {'shoes': [{'id': row['id'], 'sha256': row['sha256']} for row in dependencies[:1]],
                            'lower': [{'id': row['id'], 'sha256': row['sha256']} for row in dependencies[1:]]},
             'restMatrix': np.eye(4).T.reshape(-1).tolist(),
             'dimensionsM': (np.vstack([part[0]['POSITION'] for part in parts]).max(0)-np.vstack([part[0]['POSITION'] for part in parts]).min(0)).tolist(),
             'sourceLicense': {'license': 'CC0-1.0', 'record': body['provenance']},
             'method': 'Exact Body foot/calf crop, bounded ankle seam join, barycentric cut weights and independently closed thin sock shells'}
    fit = {'schema': 'zbgs-socks-layer-fit-v1', 'id': entry['fitId'], 'version': 1, 'styleId': spec['styleId'],
           'garmentId': identifier, 'garmentSha256': entry['sha256'], 'baseAvatarSha256': body['sha256'], 'slot': 'socks',
           'outerOffsetM': spec['outerOffsetM'], 'thicknessM': spec['thicknessM'], 'innerOffsetM': spec['outerOffsetM']-spec['thicknessM'],
           'cuffYMetres': trace['cuffYMetres'], 'sourceBodyPath': body['path'], 'sourceMesh': mi, 'sourcePrimitive': pi,
           'coordinateSpace': 'original glTF mesh-local metres Y-up; exact raw bones and inverse binds',
           'pairingCandidates': dependencies, 'bodyCoverageMasks': [], 'physics': 'skinning-only', 'runtimeAccepted': False}
    write(output/(body_type+'-entry.json'), entry); write(output/(body_type+'-fit.json'), fit)
    return {'bodyType': body_type, 'sourceBodySha256': body['sha256'], 'assetSha256': entry['sha256'], 'assetBytes': len(data),
            'sourceMesh': mi, 'sourcePrimitive': pi, 'trace': trace, 'boneNames': [binding['sourceBone'] for binding in bindings],
            'sourcePositionSha256': hashlib.sha256(attrs['POSITION'].astype('<f4').tobytes()).hexdigest(),
            'sourceIndexSha256': hashlib.sha256(triangles.astype('<u4').tobytes()).hexdigest(), 'pairingCandidates': dependencies}


def main():
    spec = json.loads((PACKAGE/'spec.json').read_text(encoding='utf-8')); output = PACKAGE/'generated'; output.mkdir(exist_ok=True)
    reports = [build_body(body_type, body, spec, output) for body_type, body in spec['bodies'].items()]
    variant = copy.deepcopy(spec); variant[spec['parameterVariant']['parameter']] = spec['parameterVariant']['value']
    variant_dir = output/'parameter-variant'; variant_dir.mkdir(exist_ok=True); write(variant_dir/'spec.json', variant)
    variants = [build_body(body_type, body, variant, variant_dir) for body_type, body in variant['bodies'].items()]
    write(output/'build-report.json', {'schema': 'zbgs-socks-layer-build-v1', 'specSha256': sha(PACKAGE/'spec.json'),
          'generatorSha256': sha(Path(__file__)), 'numpyVersion': np.__version__, 'bodies': reports,
          'parameterEdit': spec['parameterVariant'], 'variants': [{'bodyType': row['bodyType'], 'assetSha256': row['assetSha256'],
           'cuffYMetres': row['trace']['cuffYMetres']} for row in variants], 'runtimeAccepted': False})
    print(json.dumps([{'bodyType': row['bodyType'], 'assetSha256': row['assetSha256'], 'bytes': row['assetBytes'], 'trace': row['trace']} for row in reports]))


if __name__ == '__main__':
    main()
