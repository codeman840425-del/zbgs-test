"""One exact-fit cap with a real rear aperture, using CPU source geometry."""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-hat-hair-v1'
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB, local, require


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def checked_resource(ref, path_key='path', hash_key='sha256'):
    data = local(ROOT, ref[path_key]).read_bytes()
    require(sha(data) == ref[hash_key], 'Input SHA mismatch: '+ref[path_key])
    return data


def validate(spec):
    require(spec['schema'] == 'baseball-cap-source-v1' and spec['version'] == 1, 'Unsupported cap source schema/version')
    require(spec['styleId'] == 'female-ponytail-baseball-cap-v1' and spec['license'] == 'CC0-1.0', 'Unknown cap source identity/license')
    expected = json.loads((BASE/'spec.json').read_bytes())
    require(spec['body'] == expected['body'] and spec['hair'] == expected['hair'], 'Only the exact reviewed body/hair dependency pair is supported')
    require(spec['body']['sha256'] == '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95' and spec['hair']['sha256'] == '1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385', 'Unsupported body or replacement hair')
    for key, value in spec['geometry'].items():
        require(type(value) in [int, float] and np.isfinite(value), 'Invalid numeric geometry parameter: '+key)
    require(set(spec['geometry']) == set(expected['geometry']), 'Unknown/missing geometry parameter')
    require(all(value == expected['geometry'][key] for key, value in spec['geometry'].items() if key != 'brimLengthM'), 'Other shape edits require a new measured source revision')
    require(spec['geometry']['brimLengthM'] in [.055, .065], 'Only the base and single declared brim edit are supported')
    require(spec['material'] == expected['material'] and spec['parameterEdit'] == expected['parameterEdit'], 'Unknown material or source-edit declaration')
    body = GLB(checked_resource(spec['body']))
    hair = GLB(checked_resource(spec['hair']))
    manifest = json.loads(checked_resource(spec['hair'], 'manifestPath', 'manifestSha256'))
    fit = json.loads(checked_resource(spec['hair'], 'fitPath', 'fitSha256'))
    require(manifest['id'] == spec['hair']['styleId'] and manifest['version'] == 2 and manifest['sha256'] == spec['hair']['sha256'], 'Hair manifest dependency mismatch')
    require(fit['version'] == 2 and fit['assetSha256'] == spec['hair']['sha256'] and fit['targetBodySha256'] == spec['body']['sha256'], 'Hair fit dependency mismatch')
    head = next(row['node'] for row in body.doc['extensions']['VRM']['humanoid']['humanBones'] if row['bone'] == 'head')
    skin = body.doc['skins'][0]
    inverse = np.array(body.accessor(skin['inverseBindMatrices']))[skin['joints'].index(head)].reshape(4, 4).T
    require(np.array_equal(inverse[:3, :3], np.eye(3)), 'Reviewed translation-only raw head rest bind required')
    return body, hair, inverse, head


def edge_uses(faces):
    edges = {}
    for face in faces:
        for a, b in zip(face, np.roll(face, -1)):
            a, b = int(a), int(b)
            edges.setdefault(tuple(sorted([a, b])), []).append((a, b))
    return edges


def normals(points, faces):
    cross = np.cross(points[faces[:, 1]]-points[faces[:, 0]], points[faces[:, 2]]-points[faces[:, 0]])
    require(np.min(np.linalg.norm(cross, axis=1)) > 1e-12, 'Degenerate cap triangle')
    result = np.zeros_like(points)
    for column in range(3):
        np.add.at(result, faces[:, column], cross)
    require(np.all(np.linalg.norm(result, axis=1) > 1e-12), 'Unreferenced or cancelling cap normal')
    return result/np.linalg.norm(result, axis=1)[:, None]


def thicken(points, faces, inward):
    points, faces = np.array(points), np.array(faces, int)
    count = len(points)
    walls = []
    boundary = [uses[0] for uses in edge_uses(faces).values() if len(uses) == 1]
    for a, b in boundary:
        walls.extend([[b, a, a+count], [b, a+count, b+count]])
    solid = np.vstack([points, points+inward])
    triangles = np.vstack([faces, faces[:, ::-1]+count, walls])
    require(all(len(v) == 2 and v[0] == v[1][::-1] for v in edge_uses(triangles).values()), 'Cap component must be closed with consistent winding')
    return solid, triangles, normals(solid, triangles)


def geometry(p):
    radial, rows = p['radialSegments'], p['polarRows']
    points = [[0, p['rimYM']+p['crownHeightM'], p['centerZM']]]
    inward = [[0, -p['thicknessM'], 0]]
    def vertex(row, column):
        return 0 if row == 0 else 1+(row-1)*radial+column % radial
    for row in range(1, rows+2):
        phi = min(row, rows)*np.pi/(2*rows)
        y = p['rimYM']+p['crownHeightM']*np.cos(phi)-(p['bandHeightM'] if row > rows else 0)
        for column in range(radial):
            theta = column*2*np.pi/radial
            position = np.array([p['radiusXM']*np.sin(phi)*np.sin(theta), y, p['centerZM']+p['radiusZM']*np.sin(phi)*np.cos(theta)])
            normal = np.array([position[0]/p['radiusXM']**2, 0 if row > rows else (position[1]-p['rimYM'])/p['crownHeightM']**2, (position[2]-p['centerZM'])/p['radiusZM']**2])
            points.append(position.tolist()); inward.append(-p['thicknessM']*normal/np.linalg.norm(normal))
    faces = []
    for column in range(radial):
        faces.append([0, vertex(1, column), vertex(1, column+1)])
    for row in range(1, rows+1):
        for column in range(radial):
            rear = min(column+.5, radial-column-.5) < p['openingHalfSegments']
            if p['openingTopRow'] <= row < rows and rear:
                continue
            a, b, c, d = vertex(row, column), vertex(row, column+1), vertex(row+1, column), vertex(row+1, column+1)
            faces.extend([[a, c, b], [b, c, d]])
    used = np.unique(faces); remap = {int(v): i for i, v in enumerate(used)}
    shell_faces = np.array([[remap[v] for v in face] for face in faces])
    shell = thicken(np.array(points)[used], shell_faces, np.array(inward)[used])
    # A thin curved visor sews to the front lower cap rim. Its root is coincident
    # with the authored shell seam. Both components retain independent solids.
    visor, visor_faces = [], []
    columns = 2*p['brimHalfSegments']+1
    for row in range(p['brimRadialRows']+1):
        fraction = row/p['brimRadialRows']
        for column in range(columns):
            delta = (column-p['brimHalfSegments'])*2*np.pi/radial
            theta = np.pi+delta
            reach = .008+(p['brimLengthM']-.008)*np.cos(delta/(p['brimHalfSegments']*2*np.pi/radial)*np.pi/2)**.5
            visor.append([p['radiusXM']*np.sin(theta)*(1+.12*fraction), p['rimYM']-p['brimDropM']*fraction, p['centerZM']+p['radiusZM']*np.cos(theta)-reach*fraction])
            if row and column:
                a = (row-1)*columns+column-1; b = a+1; c = row*columns+column-1; d = c+1
                visor_faces.extend([[a, c, b], [b, c, d]])
    brim = thicken(visor, visor_faces, np.tile([0, -p['thicknessM'], 0], (len(visor), 1)))
    return [('CapShellRearOpeningBand', shell), ('CurvedFrontBrim', brim)]


def export_glb(spec, meshes):
    blob, views, accessors, mesh_docs = bytearray(), [], [], []
    def accessor(values, kind, component):
        values = np.asarray(values, dtype='<u4' if component == 5125 else '<f4')
        blob.extend(b'\0'*(-len(blob) % 4)); views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': values.nbytes}); blob.extend(values.tobytes())
        row = {'bufferView': len(views)-1, 'componentType': component, 'count': values.size if kind == 'SCALAR' else len(values), 'type': kind}
        if kind == 'VEC3': row.update(min=values.min(0).tolist(), max=values.max(0).tolist())
        accessors.append(row); return len(accessors)-1
    for name, (points, faces, normal) in meshes:
        mesh_docs.append({'name': name, 'primitives': [{'attributes': {'POSITION': accessor(points, 'VEC3', 5126), 'NORMAL': accessor(normal, 'VEC3', 5126)}, 'indices': accessor(faces, 'SCALAR', 5125), 'material': 0}]})
    material = spec['material']
    doc = {'asset': {'version': '2.0', 'generator': 'm2-hat-hair-v1 CPU editable source'}, 'scene': 0,
           'scenes': [{'nodes': list(range(len(meshes)))}], 'nodes': [{'name': name, 'mesh': i} for i, (name, _) in enumerate(meshes)],
           'meshes': mesh_docs, 'materials': [{'name': material['name'], 'pbrMetallicRoughness': {'baseColorFactor': material['linearColor'], 'metallicFactor': material['metallicFactor'], 'roughnessFactor': material['roughnessFactor']}}],
           'buffers': [{'byteLength': len(blob)}], 'bufferViews': views, 'accessors': accessors}
    text = json.dumps(doc, separators=(',', ':')).encode(); text += b' '*(-len(text) % 4)
    return struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(blob))+struct.pack('<I4s', len(text), b'JSON')+text+struct.pack('<I4s', len(blob), b'BIN\0')+blob


def diagnostics(spec, meshes, body, hair, inverse, head):
    module = importlib.util.spec_from_file_location('hat_source_diagnostics', ROOT/'scripts/m2-socks-layer-v1/qa.py')
    helper = importlib.util.module_from_spec(module); module.loader.exec_module(helper)
    def local_points(g, primitive, matrix=None):
        points = np.array(g.accessor(primitive['attributes']['POSITION']))
        if matrix is not None:
            points = (np.column_stack([points, np.ones(len(points))]) @ matrix.T)[:, :3]
        return points, np.array(g.accessor(primitive['indices']), int).reshape(-1, 3)
    source_sets = []
    for mesh in body.doc['meshes']:
        for primitive in mesh['primitives']:
            name = body.doc['materials'][primitive['material']]['name']
            if 'SKIN' in name or 'FaceEye' in name or 'FaceBrow' in name or 'Iris' in name:
                Q, G = local_points(body, primitive, inverse)
                source_sets.append((name, Q, G))
    hp = hair.doc['meshes'][0]['primitives'][0]; Q, G = local_points(hair, hp)
    source_sets.append(('ExactRootjoinV2Hair', Q, G))
    results = []
    for name, (P, F, _) in meshes:
        for source_name, Q, G in source_sets:
            pairs = helper.intersections(P, F, Q, G)
            # All source triangles are tested. Distance uses every hat vertex.
            distance = helper.nearest_distance(P, Q[G])
            results.append({'hatMesh': name, 'sourceMaterial': source_name, 'noncoplanarTrianglePairs': len(pairs), 'firstPairs': pairs[:8], 'minimumHatVertexDistanceM': float(distance.min())})
    p = spec['geometry']; opening_y = p['rimYM']+p['crownHeightM']*np.cos(p['openingTopRow']*np.pi/(2*p['polarRows']))
    return {'passed': not any(row['noncoplanarTrianglePairs'] for row in results), 'sourceTriangleChecks': results,
            'rawHeadNode': head, 'headInverseBindColumnMajor': inverse.T.reshape(-1).tolist(), 'forwardAxis': [0, 0, -1],
            'openingTopYM': float(opening_y), 'openingBottomYM': p['rimYM'], 'openingHalfAngleRad': p['openingHalfSegments']*2*np.pi/p['radialSegments'],
            'hatVertices': sum(len(mesh[1][0]) for mesh in meshes), 'hatTriangles': sum(len(mesh[1][1]) for mesh in meshes),
            'hairTrianglesPreserved': len(G), 'coverageMask': None, 'completeHairPreserved': True, 'sourceBodyUnchanged': True,
            'limits': ['Static noncoplanar triangle checks and unsigned vertex distances. No official spring dynamics, furniture or runtime/visual acceptance. The two authored cap/brim solids share their front attachment seam.'], 'runtimeAccepted': False}


def make_plan(spec):
    body, hair, inverse, head = validate(spec)
    meshes = geometry(spec['geometry']); asset = export_glb(spec, meshes)
    checks = diagnostics(spec, meshes, body, hair, inverse, head)
    fit = {'schema': 'character-hat-fit-v1', 'id': spec['styleId']+'-fit', 'version': 1, 'assetSha256': sha(asset),
           'targetBodySha256': spec['body']['sha256'], 'hairDependency': spec['hair'],
           'attachment': {'humanoidBone': 'head', 'space': 'raw-head-bind-local', 'position': [0, 0, 0], 'quaternion': [0, 0, 0, 1], 'scale': [1, 1, 1]},
           'physics': 'rigid', 'coverage': {'mode': 'none', 'preserveCompleteHair': True, 'preserveCompleteHeadSkin': True}, 'runtimeAccepted': False}
    manifest = {'schema': 'character-hat-v1', 'id': spec['styleId'], 'version': 1, 'url': '/assets/m2-hat-hair-v1/baseball-cap.glb', 'sha256': sha(asset), 'bytes': len(asset),
                'mount': 'head', 'headLocal': True, 'physics': 'rigid', 'fit': {'id': fit['id'], 'version': 1, 'url': '/assets/m2-hat-hair-v1/fit.json', 'sha256': sha(encoded(fit))}, 'runtimeAccepted': False}
    return {'baseball-cap.glb': asset, 'fit.json': encoded(fit), 'manifest.json': encoded(manifest), 'qa-report.json': encoded(checks),
            'build-report.json': encoded({'spec': spec, 'generatorSha256': sha(Path(__file__).read_bytes()), 'units': 'metres', 'geometryLicense': 'CC0-1.0', 'runtimeAccepted': False})}, checks


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--spec', default='assets-source/m2-hat-hair-v1/spec.json'); parser.add_argument('--out', default='assets-source/m2-hat-hair-v1/generated')
    args = parser.parse_args(); spec = json.loads(local(ROOT, args.spec).read_bytes()); out = local(ROOT, args.out)
    require(out == BASE/'generated' or out.is_relative_to(BASE/'exports'), 'Output must remain inside this cap source package')
    plan, checks = make_plan(spec)
    if not checks['passed']:
        failed = BASE/'failure-1'
        require(not failed.exists(), 'Previous cap source failure already retained')
        failed.mkdir()
        for name, data in plan.items(): (failed/name).write_bytes(data)
        raise ValueError('Cap crosses exact source anatomy/hair; retained first failure for measured correction')
    require(plan == make_plan(spec)[0], 'Repeat cap generation differs')
    for name, data in plan.items(): require(not (out/name).exists() or (out/name).read_bytes() == data, 'Existing output differs; choose a fresh --out: '+name)
    for name, data in plan.items():
        target = out/name; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists(): target.write_bytes(data)
    print(json.dumps({'exported': True, 'assetSha256': sha(plan['baseball-cap.glb']), 'vertices': checks['hatVertices'], 'triangles': checks['hatTriangles']}))


if __name__ == '__main__': main()
