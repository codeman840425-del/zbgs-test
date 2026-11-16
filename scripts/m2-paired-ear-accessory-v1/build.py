"""CPU-only deterministic paired stud source and independently measured base fits."""
import copy
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / 'assets-source/m2-paired-ear-accessory-v1'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB, local, require


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.write_bytes((json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))


def rotation(quaternion):
    x, y, z, w = quaternion
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])


def world_matrix(doc, index):
    node = doc['nodes'][index]
    if 'matrix' in node:
        own = np.array(node['matrix']).reshape(4, 4).T
    else:
        own = np.eye(4)
        own[:3, :3] = rotation(node.get('rotation', [0, 0, 0, 1])) @ np.diag(node.get('scale', [1, 1, 1]))
        own[:3, 3] = node.get('translation', [0, 0, 0])
    parents = [i for i, parent in enumerate(doc['nodes']) if index in parent.get('children', [])]
    require(len(parents) <= 1, 'Ambiguous source node parent')
    return world_matrix(doc, parents[0]) @ own if parents else own


def quaternion_from_basis(matrix):
    # The orthonormal positive-determinant basis is converted without mirroring.
    m = matrix
    candidates = [1+m[0, 0]-m[1, 1]-m[2, 2], 1-m[0, 0]+m[1, 1]-m[2, 2],
                  1-m[0, 0]-m[1, 1]+m[2, 2], 1+np.trace(m)]
    k = int(np.argmax(candidates))
    q = np.zeros(4)
    q[k] = math.sqrt(max(0, candidates[k])) / 2
    denominator = 4*q[k]
    if k == 3:
        q[:3] = [m[2, 1]-m[1, 2], m[0, 2]-m[2, 0], m[1, 0]-m[0, 1]]
        q[:3] /= denominator
    else:
        i, j = (k+1) % 3, (k+2) % 3
        q[i] = (m[i, k]+m[k, i]) / denominator
        q[j] = (m[j, k]+m[k, j]) / denominator
        q[3] = (m[j, i]-m[i, j]) / denominator
    q /= np.linalg.norm(q)
    return q if q[3] >= 0 else -q


def stud_geometry(parameters):
    radius, depth, center = parameters['radiusM'], parameters['depthRadiusM'], parameters['centerOutwardM']
    radial, latitude = parameters['radialSegments'], parameters['latitudeSegments']
    require(0 < radius <= .01 and 0 < depth < center <= .01, 'Stud parameter range invalid')
    require(type(radial) is int and type(latitude) is int and radial >= 8 and latitude >= 4, 'Stud tessellation invalid')
    vertices = [[0, 0, center+depth]]
    normals = [[0, 0, 1]]
    for row in range(1, latitude):
        polar = math.pi*row/latitude
        for column in range(radial):
            angle = math.tau*column/radial
            p = np.array([radius*math.sin(polar)*math.cos(angle), radius*math.sin(polar)*math.sin(angle), depth*math.cos(polar)])
            n = p / np.array([radius*radius, radius*radius, depth*depth])
            n /= np.linalg.norm(n)
            vertices.append([float(p[0]), float(p[1]), float(p[2]+center)])
            normals.append(n.tolist())
    south = len(vertices)
    vertices.append([0, 0, center-depth]); normals.append([0, 0, -1])
    triangles = []
    for column in range(radial):
        next_column = (column+1) % radial
        triangles.append([0, 1+column, 1+next_column])
        for row in range(latitude-2):
            a, b = 1+row*radial+column, 1+row*radial+next_column
            c, d = a+radial, b+radial
            triangles.extend([[a, c, b], [b, c, d]])
        triangles.append([south, 1+(latitude-2)*radial+next_column, 1+(latitude-2)*radial+column])
    return np.array(vertices, dtype='<f4'), np.array(normals, dtype='<f4'), np.array(triangles, dtype='<u4')


def export_glb(spec):
    vertices, normals, triangles = stud_geometry(spec['geometry'])
    binary = vertices.tobytes()+normals.tobytes()+triangles.tobytes()
    doc = {'asset': {'version': '2.0', 'generator': 'm2-paired-ear-accessory-v1 CPU parametric source'},
           'scene': 0, 'scenes': [{'nodes': [0]}],
           'nodes': [{'name': spec['styleId'], 'mesh': 0}],
           'meshes': [{'name': 'CompactStud', 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2, 'material': 0}]}],
           'materials': [{'name': 'CompactGold', 'pbrMetallicRoughness': {'baseColorFactor': spec['geometry']['linearColor'],
                           'metallicFactor': spec['geometry']['metallicFactor'], 'roughnessFactor': spec['geometry']['roughnessFactor']}}],
           'buffers': [{'byteLength': len(binary)}],
           'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': vertices.nbytes},
                           {'buffer': 0, 'byteOffset': vertices.nbytes, 'byteLength': normals.nbytes},
                           {'buffer': 0, 'byteOffset': vertices.nbytes+normals.nbytes, 'byteLength': triangles.nbytes}],
           'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': len(vertices), 'type': 'VEC3', 'min': vertices.min(0).tolist(), 'max': vertices.max(0).tolist()},
                         {'bufferView': 1, 'componentType': 5126, 'count': len(normals), 'type': 'VEC3'},
                         {'bufferView': 2, 'componentType': 5125, 'count': triangles.size, 'type': 'SCALAR'}]}
    text = json.dumps(doc, sort_keys=True, separators=(',', ':')).encode('utf-8')
    text += b' '*(-len(text) % 4)
    return struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(binary))+struct.pack('<I4s', len(text), b'JSON')+text+struct.pack('<I4s', len(binary), b'BIN\0')+binary


def export_pair(base, fit):
    source = GLB(base)
    doc = source.doc
    doc['nodes'] = [{'name': mount['instanceId'], 'mesh': 0, 'translation': mount['position'],
                     'rotation': mount['quaternion'], 'scale': mount['scale'],
                     'extras': {'semanticSocket': mount['socket'], 'side': mount['side'], 'space': mount['space']}}
                    for mount in fit['mounts']]
    doc['scenes'] = [{'nodes': [0, 1]}]
    text = json.dumps(doc, sort_keys=True, separators=(',', ':')).encode('utf-8')
    text += b' '*(-len(text) % 4)
    binary = source.binary
    return struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(binary))+struct.pack('<I4s', len(text), b'JSON')+text+struct.pack('<I4s', len(binary), b'BIN\0')+binary


def source_fit(body_type, source, spec, asset_sha):
    source_path = local(ROOT, source['path'])
    raw = source_path.read_bytes()
    require(digest(raw) == source['sha256'], 'Source avatar SHA mismatch: '+source['path'])
    g = GLB(raw); doc = g.doc
    primitive = doc['meshes'][source['meshIndex']]['primitives'][source['primitiveIndex']]
    require(doc['materials'][primitive['material']]['name'] == source['materialName'], 'Source ear material mismatch')
    mesh_nodes = [i for i, node in enumerate(doc['nodes']) if node.get('mesh') == source['meshIndex']]
    require(len(mesh_nodes) == 1, 'Source face node ambiguous')
    mesh_world = world_matrix(doc, mesh_nodes[0])
    head = next(row['node'] for row in doc['extensions']['VRM']['humanoid']['humanBones'] if row['bone'] == 'head')
    head_world = world_matrix(doc, head)
    require(np.max(np.abs(head_world[:3, :3].T @ head_world[:3, :3]-np.eye(3))) < 1e-6 and np.linalg.det(head_world[:3, :3]) > 0,
            'Head bind must have a rigid positive transform')
    positions = np.array(g.accessor(primitive['attributes']['POSITION']))
    normals = np.array(g.accessor(primitive['attributes']['NORMAL']))
    indices = np.array(g.accessor(primitive['indices']), dtype=int).reshape(-1, 3)
    joints = np.array(g.accessor(primitive['attributes']['JOINTS_0']), dtype=int)
    weights = np.array(g.accessor(primitive['attributes']['WEIGHTS_0']))
    skin = doc['skins'][doc['nodes'][mesh_nodes[0]]['skin']]
    head_joint = skin['joints'].index(head)
    mounts = []
    adjacency = {}
    for triangle in indices:
        for vertex in triangle:
            adjacency.setdefault(int(vertex), set()).update(map(int, triangle))
    for side, face in source['earLandmarkFace'].items():
        ids = indices[face]
        corners = positions[ids]
        surface_local = corners.mean(0)
        surface = (mesh_world @ np.append(surface_local, 1))[:3]
        normal = np.linalg.inv(mesh_world[:3, :3]).T @ normals[ids].mean(0)
        normal /= np.linalg.norm(normal)
        up = head_world[:3, 1]
        up = up-normal*np.dot(up, normal); up /= np.linalg.norm(up)
        x_axis = np.cross(up, normal)
        basis = np.stack([x_axis, up, normal], axis=1)
        local_basis = head_world[:3, :3].T @ basis
        local_position = (np.linalg.inv(head_world) @ np.append(surface, 1))[:3]
        quaternion = quaternion_from_basis(local_basis)
        require(np.max(np.abs(rotation(quaternion)-local_basis)) < 1e-7, 'Fit quaternion conversion mismatch')
        head_weights = np.where(joints[ids] == head_joint, weights[ids], 0).sum(1)
        require(np.min(head_weights) > .9999, 'Ear landmark is not rigidly head-weighted')
        eye_node = next(row['node'] for row in doc['extensions']['VRM']['humanoid']['humanBones'] if row['bone'] == side+'Eye')
        eye_local = (np.linalg.inv(head_world) @ world_matrix(doc, eye_node))[:3, 3]
        require(local_position[0]*eye_local[0] > 0, 'Ear side differs from actual semantic eye side')
        component, pending = set(), [int(ids[0])]
        while pending:
            vertex = pending.pop()
            if vertex in component:
                continue
            component.add(vertex)
            pending.extend(adjacency[vertex]-component)
        component_points = positions[sorted(component)]
        require(20 <= len(component) <= 120, 'Ear landmark must belong to a small detached original ear surface component')
        mounts.append({'instanceId': 'compact-gold-stud-'+side+'-v1', 'side': side, 'socket': 'ear.'+side,
                       'bone': 'head', 'rawBoneName': doc['nodes'][head]['name'], 'space': 'raw-head-bind-local',
                       'position': local_position.tolist(), 'quaternion': quaternion.tolist(), 'scale': [1, 1, 1],
                       'trace': {'meshIndex': source['meshIndex'], 'primitiveIndex': source['primitiveIndex'], 'materialName': source['materialName'],
                                 'faceId': face, 'triangleVertexIds': ids.tolist(), 'triangleMeshLocalM': corners.tolist(),
                                 'surfaceWorldM': surface.tolist(), 'outwardNormalWorld': normal.tolist(),
                                 'headWeightPerCorner': head_weights.tolist(), 'semanticEyeHeadLocalM': eye_local.tolist(),
                                 'earComponentVertexCount': len(component), 'earComponentMeshLocalBoundsM': [component_points.min(0).tolist(), component_points.max(0).tolist()],
                                 'basisDeterminant': float(np.linalg.det(local_basis)), 'sourcePositionAccessorSha256': digest(positions.astype('<f4').tobytes()),
                                 'sourceIndexAccessorSha256': digest(indices.astype('<u4').tobytes())}})
    return {'schema': 'zbgs-paired-rigid-accessory-fit-v1', 'fitId': 'compact-gold-stud-'+body_type+'-original-fit-v1', 'version': 1,
            'styleId': spec['styleId'], 'pairId': spec['pairId'], 'baseAvatarSha256': source['sha256'],
            'assetSha256': asset_sha, 'sourceAvatar': source['path'], 'headNodeIndex': head,
            'headWorldRestMatrixColumnMajor': head_world.T.reshape(-1).tolist(), 'faceWorldRestMatrixColumnMajor': mesh_world.T.reshape(-1).tolist(),
            'mounts': mounts, 'sourceBodyBytesUnchanged': digest(source_path.read_bytes()) == source['sha256'],
            'runtimeAccepted': False, 'limits': ['Rest-pose raw-head fit only; no expression, movement, glasses or hair occlusion acceptance',
                                               'Original ear surfaces remain intact; no body/face vertices are hidden or modified']}


def main():
    spec_path = PACKAGE / 'spec.json'
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    output = PACKAGE / 'generated'; output.mkdir(exist_ok=True)
    base = export_glb(spec)
    (output / 'stud.glb').write_bytes(base)
    (output / 'stud-repeat.glb').write_bytes(export_glb(json.loads(spec_path.read_text(encoding='utf-8'))))
    variant = copy.deepcopy(spec)
    variant['geometry'][spec['parameterVariant']['parameter']] = spec['parameterVariant']['value']
    write_json(output / 'variant-spec.json', variant)
    variant_bytes = export_glb(json.loads((output / 'variant-spec.json').read_text(encoding='utf-8')))
    (output / 'stud-parameter-variant.glb').write_bytes(variant_bytes)
    require(base != variant_bytes and base == (output / 'stud-repeat.glb').read_bytes(), 'Source edit/repeat export check failed')
    fits = []
    for body_type, source in spec['inputs'].items():
        fit = source_fit(body_type, source, spec, digest(base))
        write_json(output / (body_type+'-fit.json'), fit)
        (output / (body_type+'-pair-head-local.glb')).write_bytes(export_pair(base, fit))
        fits.append({'bodyType': body_type, 'fitId': fit['fitId'], 'file': body_type+'-fit.json',
                     'sha256': digest((output / (body_type+'-fit.json')).read_bytes()), 'baseAvatarSha256': source['sha256']})
    manifest = {'schema': 'zbgs-paired-rigid-accessory-style-v1', 'styleId': spec['styleId'], 'pairId': spec['pairId'], 'version': 1,
                'asset': {'file': 'stud.glb', 'sha256': digest(base), 'bytes': len(base), 'units': 'metres', 'localOutwardAxis': '+Z', 'localUpAxis': '+Y'},
                'instances': [{'id': 'compact-gold-stud-'+side+'-v1', 'side': side, 'socket': 'ear.'+side, 'styleId': spec['styleId'], 'pairId': spec['pairId']}
                              for side in ['left', 'right']], 'fits': fits, 'physics': 'rigid-head-attachment',
                'provenance': '../provenance.json', 'license': 'CC0-1.0', 'runtimeAccepted': False}
    write_json(output / 'manifest.json', manifest)
    write_json(output / 'build-report.json', {'schema': 'zbgs-paired-ear-accessory-build-v1', 'sourceSpecSha256': digest(spec_path.read_bytes()),
               'generatorSha256': digest(Path(__file__).read_bytes()), 'baseAssetSha256': digest(base), 'repeatExportMatches': True,
               'pythonVersion': sys.version.split()[0], 'numpyVersion': np.__version__,
               'parameterEdit': spec['parameterVariant'], 'parameterVariantSha256': digest(variant_bytes), 'parameterVariantDiffers': True,
               'GPUUsed': False, 'BlenderUsed': False, 'runtimeAccepted': False})
    print(json.dumps({'assetSha256': digest(base), 'bytes': len(base), 'fits': fits, 'runtimeAccepted': False}))


if __name__ == '__main__':
    main()
