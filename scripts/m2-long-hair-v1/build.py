"""Original head-local shell plus a newly authored multi-bone ponytail."""
import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-long-hair-v1'
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB, local, require


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()


def apply(points, matrix):
    return (np.column_stack([points, np.ones(len(points))]) @ matrix.T)[:, :3]


def source(spec):
    data = local(ROOT, spec['source']['path']).read_bytes()
    require(sha(data) == spec['source']['sha256'] == '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95', 'Exact original female SHA required')
    g = GLB(data); d = g.doc
    primitive = next(p for p in d['meshes'][0]['primitives'] if d['materials'][p['material']]['name'] == spec['sourceMaterial'])
    head = next(h['node'] for h in d['extensions']['VRM']['humanoid']['humanBones'] if h['bone'] == 'head')
    skin = d['skins'][0]; inverse = np.array(g.accessor(skin['inverseBindMatrices']))[skin['joints'].index(head)].reshape(4, 4).T
    require(np.array_equal(inverse[:3, :3], np.eye(3)), 'Reviewed translation-only head bind required')
    ids = np.unique(np.array(g.accessor(primitive['indices']), int))
    J, W = [np.array(g.accessor(primitive['attributes'][key]))[ids] for key in ['JOINTS_0', 'WEIGHTS_0']]
    require(all(skin['joints'][int(j)] == head for j, w in zip(J.flat, W.flat) if w > 1e-7), 'Original cap must be head-only weighted')
    attrs = {key: np.array(g.accessor(index))[ids] for key, index in primitive['attributes'].items()}
    attrs['POSITION'] = apply(attrs['POSITION'], inverse)
    attrs['JOINTS_0'] = np.zeros((len(ids), 4), int); attrs['WEIGHTS_0'] = np.tile([1, 0, 0, 0], (len(ids), 1))
    faces = np.searchsorted(ids, np.array(g.accessor(primitive['indices']), int)).reshape(-1, 3)
    all_points = np.array(g.accessor(primitive['attributes']['POSITION']))
    landmark = apply(all_points[[spec['rootSourceVertex']]], inverse)[0]
    require(spec['rootSourceVertex'] in ids and landmark[2] > .1 and abs(landmark[0]) < .001, 'Root landmark must be actual center-back hair')
    normal = np.array(g.accessor(primitive['attributes']['NORMAL']))[spec['rootSourceVertex']]
    require(spec['rootOutwardM'] == .0193 and normal[2] > .8, 'Reviewed root extrusion/normal required')
    root = landmark+normal*spec['rootOutwardM']
    return g, primitive, attrs, faces, inverse, root


def normals(points, faces):
    result = np.zeros_like(points)
    cross = np.cross(points[faces[:, 1]]-points[faces[:, 0]], points[faces[:, 2]]-points[faces[:, 0]])
    require(np.min(np.linalg.norm(cross, axis=1)) > 1e-12, 'New geometry has degenerate triangles')
    for i in range(3): np.add.at(result, faces[:, i], cross)
    result /= np.linalg.norm(result, axis=1)[:, None]
    return result


def pony(spec, root):
    require(spec['lengthM'] in [.39, .43] and spec['segments'] == 6 and spec['axialDivisions'] == 24 and spec['radialDivisions'] == 16, 'Only reviewed base and single length edit supported')
    require(spec['backSweepM'] == .13 and spec['radiusM'] == .026, 'Shape/radius changes require new fit review')
    def center(t): return root+np.array([0, -spec['lengthM']*t, spec['backSweepM']*(1-np.exp(-5*t))])
    def radius(t): return spec['radiusM']*(.25+.75*(1-t)**.7)
    centers = np.array([center(i/spec['segments']) for i in range(spec['segments']+1)])
    points, uv, joints, weights, faces = [], [], [], [], []
    u0, v0, u1, v1 = spec['texturePatchUV']; radial = spec['radialDivisions']
    for ring in range(spec['axialDivisions']+1):
        t = ring/spec['axialDivisions']; tangent = np.array([0, -spec['lengthM'], 5*spec['backSweepM']*np.exp(-5*t)])
        tangent /= np.linalg.norm(tangent); axis_u = np.array([1., 0, 0]); axis_v = np.cross(tangent, axis_u)
        segment = min(int(t*spec['segments']), spec['segments']-1); fraction = t*spec['segments']-segment
        for column in range(radial):
            angle = column*2*np.pi/radial; direction = np.cos(angle)*axis_u+np.sin(angle)*axis_v
            points.append(center(t)+direction*radius(t)*(1+.08*np.cos(5*angle+t)))
            uv.append([u0+(u1-u0)*column/radial, v0+(v1-v0)*t])
            joints.append([0, 0, 0, 0] if ring == 0 else [segment+1, segment+2, 0, 0])
            weights.append([1, 0, 0, 0] if ring == 0 else [1-fraction, fraction, 0, 0])
            if ring < spec['axialDivisions']:
                a = ring*radial+column; b = ring*radial+(column+1) % radial; c = a+radial; e = b+radial
                faces.extend([[a, b, c], [b, e, c]])
    for ring, reverse in [(0, True), (spec['axialDivisions'], False)]:
        index = len(points); t = ring/spec['axialDivisions']; points.append(center(t)); uv.append([(u0+u1)/2, v0+(v1-v0)*t])
        joints.append([0 if reverse else spec['segments']+1, 0, 0, 0]); weights.append([1, 0, 0, 0])
        for j in range(radial):
            a, b = ring*radial+j, ring*radial+(j+1) % radial
            faces.append([index, b, a] if reverse else [index, a, b])
    # A fixed geometric tie band at the actual rear-hair landmark.
    tie_start = len(points); tangent = centers[1]-centers[0]; tangent /= np.linalg.norm(tangent)
    axis_v = np.cross(tangent, [1, 0, 0])
    for i in range(radial):
        angle = i*2*np.pi/radial; direction = np.array([1., 0, 0])*np.cos(angle)+axis_v*np.sin(angle)
        for j in range(4):
            phi = j*np.pi/2; points.append(root+tangent*.003+direction*(spec['radiusM']+.003*np.cos(phi))+tangent*.003*np.sin(phi))
            uv.append([.5, .56]); joints.append([0, 0, 0, 0]); weights.append([1, 0, 0, 0])
            a = tie_start+i*4+j; b = tie_start+((i+1) % radial)*4+j; c = tie_start+i*4+(j+1) % 4; e = tie_start+((i+1) % radial)*4+(j+1) % 4
            faces.extend([[a, c, b], [c, e, b]])
    P, F = np.array(points), np.array(faces, int)
    return {'POSITION': P, 'NORMAL': normals(P, F), 'TEXCOORD_0': np.array(uv), 'JOINTS_0': np.array(joints), 'WEIGHTS_0': np.array(weights)}, F, centers, tie_start


def write_glb(g, primitive, cap, cap_faces, added, added_faces, centers):
    attrs = {key: np.vstack([cap[key], added[key]]) for key in cap}; faces = np.vstack([cap_faces, added_faces+len(cap['POSITION'])])
    blob = bytearray(); views, accessors = [], []
    def append(data):
        blob.extend(b'\0'*(-len(blob) % 4)); views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}); blob.extend(data); return len(views)-1
    def accessor(values, kind, component=5126):
        values = np.asarray(values, dtype='<u2' if component == 5123 else '<u4' if component == 5125 else '<f4')
        row = {'bufferView': append(values.tobytes()), 'componentType': component, 'count': len(values), 'type': kind}
        if kind == 'VEC3': row.update(min=values.min(0).tolist(), max=values.max(0).tolist())
        accessors.append(row); return len(accessors)-1
    attributes = {key: accessor(values, 'VEC4' if key in ['JOINTS_0', 'WEIGHTS_0'] else 'VEC2' if key == 'TEXCOORD_0' else 'VEC3', 5123 if key == 'JOINTS_0' else 5126) for key, values in attrs.items()}
    indices = accessor(faces.reshape(-1, 1), 'SCALAR', 5125)
    inverse = np.tile(np.eye(4), (len(centers)+1, 1, 1)); inverse[1:, :3, 3] = -centers
    inverse_accessor = accessor(inverse.transpose(0, 2, 1).reshape(-1, 16), 'MAT4')
    nodes = [{'name': 'LongHairAsset', 'children': [1, 2]}, {'name': 'LongHairMesh', 'mesh': 0, 'skin': 0}, {'name': 'HairAnchor', 'children': [3]}]
    names = ['Pony'+str(i) for i in range(len(centers))]
    for i, point in enumerate(centers):
        node = {'name': names[i], 'translation': (point if i == 0 else point-centers[i-1]).tolist()}
        if i < len(centers)-1: node['children'] = [i+4]
        nodes.append(node)
    material = copy.deepcopy(g.doc['materials'][primitive['material']]); textures, images, samplers, copied = [], [], [], {}
    for owner, key in [(material['pbrMetallicRoughness'], 'baseColorTexture'), (material, 'normalTexture'), (material, 'emissiveTexture')]:
        if key not in owner: continue
        old = owner[key]['index']
        if old not in copied:
            texture = g.doc['textures'][old]; image = copy.deepcopy(g.doc['images'][texture['source']]); view = g.doc['bufferViews'][image['bufferView']]
            image['bufferView'] = append(g.binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]); image.pop('uri', None)
            out = {'source': len(images)}
            if 'sampler' in texture: out['sampler'] = len(samplers); samplers.append(copy.deepcopy(g.doc['samplers'][texture['sampler']]))
            copied[old] = len(textures); textures.append(out); images.append(image)
        owner[key]['index'] = copied[old]
    doc = {'asset': {'version': '2.0', 'generator': 'm2-long-hair-v1 CPU parametric source'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': nodes, 'skins': [{'joints': list(range(2, len(nodes))), 'inverseBindMatrices': inverse_accessor, 'skeleton': 2}],
        'meshes': [{'name': 'LongHairMesh', 'primitives': [{'attributes': attributes, 'indices': indices, 'material': 0}]}],
        'materials': [material], 'images': images, 'textures': textures, 'samplers': samplers, 'buffers': [{'byteLength': len(blob)}],
        'bufferViews': views, 'accessors': accessors, 'extensionsUsed': ['KHR_materials_unlit'],
        'extras': {'coordinateSpace': 'raw-head-bind-local', 'auxiliaryJointNames': ['HairAnchor']+names}}
    text = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode(); text += b' '*(-len(text) % 4); blob.extend(b'\0'*(-len(blob) % 4))
    data = struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(blob))+struct.pack('<I4s', len(text), b'JSON')+text+struct.pack('<I4s', len(blob), b'BIN\0')+blob
    return data, attrs, faces, names


def proxies(g, inverse):
    points = []
    for p in g.doc['meshes'][0]['primitives'][:2]:
        ids = np.unique(np.array(g.accessor(p['indices']), int)); points.extend(apply(np.array(g.accessor(p['attributes']['POSITION']))[ids], inverse))
    face = next(p for p in g.doc['meshes'][1]['primitives'] if g.doc['materials'][p['material']]['name'].endswith('_Face_00_SKIN'))
    ids = np.unique(np.array(g.accessor(face['indices']), int)); face_points = apply(np.array(g.accessor(face['attributes']['POSITION']))[ids], inverse)
    skin = g.doc['skins'][0]; humanoid = {h['bone']: h['node'] for h in g.doc['extensions']['VRM']['humanoid']['humanBones']}; ibms = np.array(g.accessor(skin['inverseBindMatrices']))
    body = g.doc['meshes'][0]['primitives'][0]; joints, weights = [np.array(g.accessor(body['attributes'][k])) for k in ['JOINTS_0', 'WEIGHTS_0']]
    body_ids = np.unique(np.array(g.accessor(body['indices']), int))
    head_joint = skin['joints'].index(humanoid['head']); head_ids = body_ids[np.where(joints[body_ids] == head_joint, weights[body_ids], 0).sum(1) > .5]
    head_points = apply(np.array(g.accessor(body['attributes']['POSITION']))[head_ids], inverse)
    points = np.array(points); definitions = [('head', 'sphere', np.vstack([face_points, head_points])),
        ('head', 'capsule', points[(points[:, 1] >= -.10) & (points[:, 1] <= .025) & (abs(points[:, 0]) < .12)]),
        ('chest', 'capsule', points[(points[:, 1] >= -.30) & (points[:, 1] <= -.10) & (abs(points[:, 0]) < .28)])]
    colliders, trace = [], []
    for semantic, shape, P in definitions:
        require(len(P) > 20, 'Proxy source selection is empty')
        mid = (P.min(0)+P.max(0))/2
        a, b = mid.copy(), mid.copy()
        if shape == 'capsule':
            axis = 1 if semantic == 'head' else 0
            a[axis], b[axis] = P[:, axis].min(), P[:, axis].max()
        edge = b-a; t = np.clip((P-a) @ edge/max(np.dot(edge, edge), 1e-20), 0, 1)
        radius = float(np.linalg.norm(P-(a+t[:, None]*edge), axis=1).max()+.002)
        raw_inverse = ibms[skin['joints'].index(humanoid[semantic])].reshape(4, 4).T
        convert = raw_inverse @ np.linalg.inv(inverse); offset, tail = apply(np.array([a, b]), convert)
        item = {'bone': semantic, 'shape': shape, 'offset': offset.tolist(), 'radius': radius}
        if shape == 'capsule': item['tail'] = tail.tolist()
        colliders.append(item); trace.append({'bone': semantic, 'shape': shape, 'selectedVertices': len(P),
            'selectedPositionSha256': sha(P.astype('<f4').tobytes()), 'headLocalOffset': a.tolist(), 'headLocalTail': b.tolist(),
            'radius': radius, 'selectedVertexEnclosureMarginM': .002})
    return colliders, trace


def produce(spec, prefix=''):
    g, primitive, cap, cap_faces, inverse, root = source(spec); added, added_faces, centers, tie_start = pony(spec, root)
    data, attrs, faces, names = write_glb(g, primitive, cap, cap_faces, added, added_faces, centers)
    colliders, proxy_trace = proxies(g, inverse)
    fit = {'schema': 'character-hair-fit-v2', 'id': spec['id']+'-original-female-fit-v1', 'version': 1, 'styleId': spec['id'],
        'sourceBodySha256': spec['source']['sha256'], 'targetBodySha256': spec['source']['sha256'], 'assetSha256': sha(data), 'sourceMaterial': spec['sourceMaterial'],
        'rawBone': 'J_Bip_C_Head', 'physics': 'vrm-spring', 'attachment': {'bone': 'head', 'space': 'raw-head-bind-local', 'position': [0, 0, 0], 'quaternion': [0, 0, 0, 1], 'scale': [1, 1, 1]},
        'hideOriginal': {'materialNames': [spec['sourceMaterial']], 'hideWholeBody': False},
        'dynamics': {'schema': 'hair-spring-v1', 'joints': [dict(bone=names[i], child=names[i+1], hitRadius=float(spec['radiusM']*(.25+.75*(1-(i+1)/6)**.7)), **spec['spring']) for i in range(6)], 'colliders': colliders}, 'runtimeAccepted': False}
    manifest = {'schema': 'character-hairstyle-v1', 'id': spec['id'], 'version': 1, 'label': 'Tied long ponytail technical source', 'mount': 'head', 'headLocal': True,
        'sourceMaterial': spec['sourceMaterial'], 'compatibleBodies': [spec['source']['sha256']], 'physics': 'vrm-spring', 'skinned': True, 'boneNames': ['HairAnchor']+names,
        'url': '/assets/m2-long-hair-v1/'+prefix+'female-ponytail.glb', 'sha256': sha(data), 'bytes': len(data),
        'fit': {'id': fit['id'], 'version': 1, 'url': '/assets/m2-long-hair-v1/'+prefix+'fit.json', 'sha256': sha(encoded(fit))}, 'runtimeAccepted': False}
    trace = {'source': spec['source'], 'headInverseBindColumnMajor': inverse.T.reshape(-1).tolist(), 'rootSourceVertex': spec['rootSourceVertex'], 'rootHeadLocalM': root.tolist(),
        'retainedCapVertices': len(cap['POSITION']), 'retainedCapTriangles': len(cap_faces), 'addedVertices': len(added['POSITION']), 'addedTriangles': len(added_faces),
        'tailVerticesBeforeTie': tie_start, 'vertices': len(attrs['POSITION']), 'triangles': len(faces), 'skinJointNames': ['HairAnchor']+names,
        'controlPointsHeadLocalM': centers.tolist(), 'headLocalBoundsM': [attrs['POSITION'].min(0).tolist(), attrs['POSITION'].max(0).tolist()],
        'sourceHeadBindMatrixColumnMajor': np.linalg.inv(inverse).T.reshape(-1).tolist(), 'proxySelections': proxy_trace}
    return {prefix+'female-ponytail.glb': data, prefix+'fit.json': encoded(fit), prefix+'manifest.json': encoded(manifest)}, trace


def make_plan(spec):
    require(spec['schema'] == 'character-long-hair-source-v1' and spec['sourceMaterial'] == 'F00_000_HairBack_00_HAIR', 'Source schema/material mismatch')
    plan, trace = produce(spec); variant = copy.deepcopy(spec); variant[spec['parameterVariant']['parameter']] = spec['parameterVariant']['value']
    extra, variant_trace = produce(variant, 'parameter-variant/'); plan.update(extra); plan['parameter-variant/spec.json'] = encoded(variant)
    plan['build-report.json'] = encoded({'spec': spec, 'generatorSha256': sha(Path(__file__).read_bytes()), 'base': trace, 'variant': variant_trace,
        'baseAssetSha256': sha(plan['female-ponytail.glb']), 'variantAssetSha256': sha(plan['parameter-variant/female-ponytail.glb']), 'GPUUsed': False, 'runtimeAccepted': False})
    return plan


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', default='assets-source/m2-long-hair-v1/generated'); args = ap.parse_args()
    out = local(ROOT, args.out); require(out == BASE/'generated' or out.is_relative_to(BASE/'exports'), 'Output must stay in this package generated or exports')
    plan = make_plan(json.loads((BASE/'spec.json').read_text(encoding='utf-8')))
    for name, data in plan.items(): require(not (out/name).exists() or (out/name).read_bytes() == data, 'Existing output differs; choose a new --out: '+name)
    for name, data in plan.items():
        path = out/name; path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists(): path.write_bytes(data)
    print(json.dumps({'exported': True, 'assetSha256': sha(plan['female-ponytail.glb']), 'variantSha256': sha(plan['parameter-variant/female-ponytail.glb'])}))


if __name__ == '__main__': main()
