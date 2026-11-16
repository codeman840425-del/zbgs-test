"""Deterministic closed swept curls over the retained complete original male scalp cap."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import struct
import sys
import time

sys.dont_write_bytecode = True
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-medium-curly-hair-v1'
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB, local, require


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()


def apply(points, matrix):
    return (np.column_stack([points, np.ones(len(points))]) @ matrix.T)[:, :3]


def source(path, material):
    data = path.read_bytes()
    g = GLB(data)
    d = g.doc
    head = next(h['node'] for h in d['extensions']['VRM']['humanoid']['humanBones'] if h['bone'] == 'head')
    skin = d['skins'][0]
    ibm = np.array(g.accessor(skin['inverseBindMatrices']))[skin['joints'].index(head)].reshape(4, 4).T
    primitives = [p for m in d['meshes'] for p in m['primitives'] if d['materials'][p['material']]['name'] == material]
    require(len(primitives) == 1, 'Unique original male hair primitive required')
    p = primitives[0]
    original_indices = np.array(g.accessor(p['indices']), int).reshape(-1, 3)
    ids = np.unique(original_indices)
    positions = np.array(g.accessor(p['attributes']['POSITION']))[ids]
    uv = np.array(g.accessor(p['attributes']['TEXCOORD_0']))[ids]
    joints, weights = [np.array(g.accessor(p['attributes'][key]))[ids] for key in ['JOINTS_0', 'WEIGHTS_0']]
    require(all(skin['joints'][int(j)] == head for j, w in zip(joints.flat, weights.flat) if w > 1e-7), 'Cap must be head-only weighted')
    cap = apply(positions, ibm)
    faces = np.searchsorted(ids, original_indices)
    return g, p, cap, uv, faces, ibm, head


def normals(points, faces):
    result = np.zeros_like(points)
    cross = np.cross(points[faces[:, 1]]-points[faces[:, 0]], points[faces[:, 2]]-points[faces[:, 0]])
    require(np.all(np.linalg.norm(cross, axis=1) > 1e-12), 'Degenerate generated triangle')
    for i in range(3):
        np.add.at(result, faces[:, i], cross)
    result /= np.maximum(np.linalg.norm(result, axis=1)[:, None], 1e-12)
    return result


def curls(spec, preset, cap, source_uv, head_skin):
    points, uv, faces, curves = [], [], [], []
    axial, radial = spec['axialDivisions'], spec['radialDivisions']
    for layer, count in [('side', spec['sideClumps']), ('crown', spec['crownClumps'])]:
        for index in range(count):
            theta = np.deg2rad(-spec['sideArcDegrees']+2*spec['sideArcDegrees']*index/(count-1)) if layer == 'side' else 2*np.pi*index/count
            outward = np.array([np.sin(theta), .22, np.cos(theta)])
            outward /= np.linalg.norm(outward)
            desired = np.array([.075*np.sin(theta), .143 if layer == 'side' else .199, .08*np.cos(theta)])
            if layer == 'crown':
                desired[[0, 2]] *= .5
            root_index = int(np.argmin(np.linalg.norm(cap-desired, axis=1)))
            root = cap[root_index]+outward*spec['rootOffsetM']
            tangential = np.array([np.cos(theta), 0, -np.sin(theta)])
            radial_axis = np.array([np.sin(theta), 0, np.cos(theta)])
            front = layer == 'crown' and np.cos(theta) < -.35
            length = preset['lengthM'] if layer == 'side' else (.075 if front else .115)
            end = np.array([preset['outerWidthM']*np.sin(theta), root[1]-length, .139*np.cos(theta)])
            if front:
                end[2] = -.115
            centers = []
            for row in range(axial+1):
                t = row/axial
                blend = t*t*(3-2*t)
                center = root*(1-blend)+end*blend
                center[1] += .019*np.sin(np.pi*t) if layer == 'crown' else 0
                envelope = min(1, t/.18)*(.85+.15*(1-t))
                phase = 2*np.pi*preset['turns']*t+index*.71
                center += preset['curlRadiusM']*envelope*(np.sin(phase)*tangential+np.cos(phase)*radial_axis)
                direction = center[[0, 2]]
                distance = np.linalg.norm(direction)
                if distance > 1e-8:
                    direction = direction/distance
                    source_radial = head_skin[:, [0, 2]]
                    radial_length = np.linalg.norm(source_radial, axis=1)
                    facing = np.divide(source_radial@direction, radial_length, out=np.zeros(len(source_radial)), where=radial_length>1e-8)
                    nearby = (np.abs(head_skin[:, 1]-center[1]) < .022)&(facing > np.cos(np.deg2rad(22)))
                    if np.any(nearby):
                        required = np.max(source_radial[nearby]@direction)+spec['tubeRadiusM']+spec['sourceClearanceM']
                        center[[0, 2]] = direction*max(distance, required)
                centers.append(center)
            centers = np.array(centers)
            curves.append({'layer': layer, 'sourceRootVertexInCap': root_index, 'centerline': centers.tolist()})
            start = len(points)
            for row, center in enumerate(centers):
                tangent = centers[min(axial, row+1)]-centers[max(0, row-1)]
                tangent /= np.linalg.norm(tangent)
                axis_u = np.cross(tangent, [0, 1, 0])
                if np.linalg.norm(axis_u) < 1e-6:
                    axis_u = np.cross(tangent, [1, 0, 0])
                axis_u /= np.linalg.norm(axis_u)
                axis_v = np.cross(tangent, axis_u)
                radius = spec['tubeRadiusM']*(.35+.65*(1-row/axial)**.35)
                for col in range(radial):
                    angle = 2*np.pi*col/radial
                    points.append(center+radius*(np.cos(angle)*axis_u+np.sin(angle)*axis_v))
                    uv.append(source_uv[root_index]+[.002*np.cos(angle), .002*np.sin(angle)])
                    if row < axial:
                        a = start+row*radial+col
                        b = start+row*radial+(col+1) % radial
                        faces.extend([[a, b, a+radial], [b, b+radial, a+radial]])
            for row, reverse in [(0, True), (axial, False)]:
                tip = len(points)
                points.append(centers[row]); uv.append(source_uv[root_index])
                for col in range(radial):
                    a, b = start+row*radial+col, start+row*radial+(col+1) % radial
                    faces.append([tip, b, a] if reverse else [tip, a, b])
    return np.array(points), np.array(uv), np.array(faces, int), curves


def export(g, primitive, points, uv, faces, identifier):
    blob = bytearray(); views, accessors = [], []
    def append(data):
        blob.extend(b'\0'*(-len(blob) % 4))
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)})
        blob.extend(data)
        return len(views)-1
    def array(value, kind, integer=False):
        a = np.asarray(value, dtype='<u4' if integer else '<f4')
        item = {'bufferView': append(a.tobytes()), 'componentType': 5125 if integer else 5126, 'count': len(a), 'type': kind}
        if kind == 'VEC3':
            item.update(min=a.min(0).tolist(), max=a.max(0).tolist())
        accessors.append(item)
        return len(accessors)-1
    attrs = {'POSITION': array(points, 'VEC3'), 'NORMAL': array(normals(points, faces), 'VEC3'), 'TEXCOORD_0': array(uv, 'VEC2')}
    indices = array(faces.reshape(-1, 1), 'SCALAR', True)
    material = copy.deepcopy(g.doc['materials'][primitive['material']])
    images, textures, samplers = [], [], []
    for key, owner in [('baseColorTexture', material['pbrMetallicRoughness']), ('normalTexture', material), ('emissiveTexture', material)]:
        if key not in owner:
            continue
        tx = g.doc['textures'][owner[key]['index']]
        image = copy.deepcopy(g.doc['images'][tx['source']])
        view = g.doc['bufferViews'][image['bufferView']]
        image['bufferView'] = append(g.binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']])
        image.pop('uri', None)
        texture = {'source': len(images)}
        if 'sampler' in tx:
            texture['sampler'] = len(samplers); samplers.append(g.doc['samplers'][tx['sampler']])
        owner[key]['index'] = len(textures)
        textures.append(texture); images.append(image)
    doc = {'asset': {'version': '2.0', 'generator': 'M2 medium curly sweep v1'}, 'scene': 0,
           'scenes': [{'nodes': [0]}], 'nodes': [{'name': identifier, 'mesh': 0}],
           'meshes': [{'name': identifier, 'primitives': [{'attributes': attrs, 'indices': indices, 'material': 0}]}],
           'materials': [material], 'images': images, 'textures': textures, 'samplers': samplers,
           'buffers': [{'byteLength': len(blob)}], 'bufferViews': views, 'accessors': accessors,
           'extensionsUsed': ['KHR_materials_unlit'], 'extras': {'space': 'raw-head-bind-local', 'source': 'original-male-cap-plus-authored-closed-curls'}}
    j = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode(); j += b' '*(-len(j) % 4)
    blob.extend(b'\0'*(-len(blob) % 4))
    return struct.pack('<4sII', b'glTF', 2, 28+len(j)+len(blob))+struct.pack('<I4s', len(j), b'JSON')+j+struct.pack('<I4s', len(blob), b'BIN\0')+blob


def build(spec):
    source_path = local(ROOT, spec['source']['path'])
    require(sha(source_path.read_bytes()) == spec['source']['sha256'], 'Original male SHA mismatch')
    g, primitive, cap, uv, cap_faces, ibm, head = source(source_path, spec['sourceMaterial'])
    skin_points = []
    for mesh in g.doc['meshes']:
        for primitive_skin in mesh['primitives']:
            if 'SKIN' in g.doc['materials'][primitive_skin['material']]['name']:
                p = apply(np.array(g.accessor(primitive_skin['attributes']['POSITION'])), ibm)
                indices = np.array(g.accessor(primitive_skin['attributes']['JOINTS_0']), int)
                weights = np.array(g.accessor(primitive_skin['attributes']['WEIGHTS_0']))
                head_slot = g.doc['skins'][0]['joints'].index(head)
                influence = np.sum(np.where(indices == head_slot, weights, 0), axis=1)
                skin_points.extend(p[influence > .98])
    head_skin = np.array(skin_points)
    files, summaries = {}, []
    for preset in spec['presets']:
        added, added_uv, added_faces, curves = curls(spec, preset, cap, uv, head_skin)
        points = np.vstack([cap, added]); tex = np.vstack([uv, added_uv]); faces = np.vstack([cap_faces, added_faces+len(cap)])
        identifier = preset['id']; asset = export(g, primitive, points, tex, faces, identifier)
        fit = {'schema': 'character-hair-fit-v1', 'id': identifier+'-fit', 'version': 1, 'styleId': identifier,
               'sourceBodySha256': spec['source']['sha256'], 'targetBodySha256': spec['source']['sha256'],
               'assetSha256': sha(asset), 'sourceMaterial': spec['sourceMaterial'], 'rawBone': g.doc['nodes'][head]['name'], 'physics': 'rigid',
               'attachment': {'bone': 'head', 'space': 'raw-head-bind-local', 'position': [0, 0, 0], 'quaternion': [0, 0, 0, 1], 'scale': [1, 1, 1]},
               'hideOriginal': {'materialNames': [spec['sourceMaterial']], 'hideWholeBody': False}, 'runtimeAccepted': False}
        url = '/assets/m2-medium-curly-hair-v1/'+identifier
        manifest = {'schema': 'character-hairstyle-v1', 'id': identifier, 'version': 1, 'label': preset['label'], 'mount': 'head',
                    'headLocal': True, 'sourceMaterial': spec['sourceMaterial'], 'url': url+'/hair.glb', 'sha256': sha(asset), 'bytes': len(asset),
                    'compatibleBodies': [spec['source']['sha256']], 'physics': 'rigid', 'status': 'source-candidate-not-product-accepted',
                    'fit': {'id': fit['id'], 'version': 1, 'url': url+'/fit.json', 'sha256': sha(encoded(fit))}}
        files.update({identifier+'/hair.glb': asset, identifier+'/fit.json': encoded(fit), identifier+'/manifest.json': encoded(manifest), identifier+'/curves.json': encoded(curves)})
        summaries.append({'id': identifier, 'assetSha256': sha(asset), 'fitSha256': sha(encoded(fit)), 'manifestSha256': sha(encoded(manifest)),
                          'vertices': len(points), 'triangles': len(faces), 'retainedCapVertices': len(cap), 'addedClumps': len(curves),
                          'boundsHeadLocalM': [points.min(0).tolist(), points.max(0).tolist()], 'capPositionsExact': True, 'capUVExact': True,
                          'rawHeadInverseBind': ibm.T.reshape(-1).tolist(), 'runtimeAccepted': False})
    return files, summaries


def main():
    started = time.perf_counter()
    parser = argparse.ArgumentParser(); parser.add_argument('--out'); args = parser.parse_args()
    spec = json.loads((BASE/'spec.json').read_text(encoding='utf-8-sig'))
    files, summaries = build(spec)
    repeat, _ = build(spec)
    require(files == repeat, 'Nondeterministic source generation')
    out = local(ROOT, args.out) if args.out else BASE/'corrected'
    require(out.is_relative_to(BASE) and out != BASE, 'Output must be a new subdirectory inside source package')
    for name, data in files.items():
        require(not (out/name).exists() or (out/name).read_bytes() == data, 'Conflicting output: '+name)
    for name, data in files.items():
        target = out/name; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_bytes(data)
    report = {'schema': 'medium-curly-source-build-v1', 'source': spec['source'], 'presets': summaries, 'deterministicBytes': True,
              'wallClockSeconds': time.perf_counter()-started, 'generationAttempt': 2, 'diagnosedCorrections': 1,
              'manualMeshEdits': 0, 'runtimeAccepted': False, 'limits': spec['limits']}
    (out/'build-report.json').write_bytes(encoded(report))
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()

