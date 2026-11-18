"""CPU-only candidate from the 7586 Body and its original VRM1 leg weights."""
import hashlib
import io
import json
from functools import lru_cache
from pathlib import Path
import sys
from types import SimpleNamespace

import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/m2-socks-layer-v1'))
import build as crew
import qa
from flow import GLB, require

SOURCE = 'assets-source/native-vroid-male-unmasked-base-v1/generated/manifest.json'
SPEC = 'assets-source/m2-socks-layer-v1/spec.json'
EQUIPMENT = 'prototype/public/assets/native-male-factory-v1/native-vroid-male-equipment-v1/generated/equipment.json'
PINS = {
    SOURCE: '7f11fdee6e0d76ae563e67005f5613e2e8b6840291ff86f5bf3af2c3f32c226c',
    SPEC: 'bcf434347413b95afff04bc4d941c297db185bf5646c774f7294a70c5d52efdf',
    EQUIPMENT: 'e412188206670c9bf84b7f2019aab8a60778a2d0f6ac29df9d92091fd18d80a8',
    'scripts/m2-socks-layer-v1/build.py': '8e8c881f220f0ae7a756dc66ebeeeb784677e91060d748030078bb086f44dedf',
    'scripts/m2-socks-layer-v1/qa.py': '709eaf6fc8e32ce2379a51b5ae61d395f61687dc191298cfbf6737c22d64cdf9',
}


def drawn_surface(g, primitive):
    ids = np.asarray(g.accessor(primitive['indices']), dtype=int).ravel()
    hashes = {key: hashlib.sha256(np.asarray(g.accessor(primitive['attributes'][key]), dtype='<f4')[ids].tobytes()).hexdigest()
              for key in ['POSITION', 'TEXCOORD_0']}
    material = g.doc['materials'][primitive['material']]
    texture = material['pbrMetallicRoughness']['baseColorTexture']
    image = g.doc['images'][g.doc['textures'][texture['index']]['source']]
    view = g.doc['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    return {**hashes, 'image': hashlib.sha256(g.binary[start:start+view['byteLength']]).hexdigest(),
            'uvTransform': texture.get('extensions', {}).get('KHR_texture_transform', {}), 'alphaMode': material.get('alphaMode'),
            'alphaCutoff': material.get('alphaCutoff'), 'doubleSided': material.get('doubleSided', False)}


def world_transforms(doc):
    parents = {child: i for i, node in enumerate(doc['nodes']) for child in node.get('children', [])}

    @lru_cache(None)
    def world(i):
        node = doc['nodes'][i]
        if 'matrix' in node:
            local = np.asarray(node['matrix']).reshape(4, 4).T
        else:
            local = np.eye(4)
            local[:3, 3] = node.get('translation', [0, 0, 0])
            local[:3, :3] = Rotation.from_quat(node.get('rotation', [0, 0, 0, 1])).as_matrix() @ np.diag(node.get('scale', [1, 1, 1]))
        return world(parents[i]) @ local if i in parents else local

    return world


def paint_samples(g, material, attrs, faces, cuff):
    base = material['pbrMetallicRoughness']['baseColorTexture']['index']
    tex = g.doc['textures'][base]
    view = g.doc['bufferViews'][g.doc['images'][tex['source']]['bufferView']]
    start = view.get('byteOffset', 0)
    image = g.binary[start:start + view['byteLength']]
    rgba = np.asarray(Image.open(io.BytesIO(image)).convert('RGBA'))
    report = {}
    for side, sign in [('left', 1), ('right', -1)]:
        foot = faces[(attrs['POSITION'][faces, 1].max(1) <= cuff) & (sign * attrs['POSITION'][faces, 0].mean(1) > 0)]
        uv = attrs['TEXCOORD_0'][foot].mean(1)
        xy = np.floor(uv * [rgba.shape[1], rgba.shape[0]]).astype(int)
        pixels = rgba[xy[:, 1] % rgba.shape[0], xy[:, 0] % rgba.shape[1]]
        require(len(pixels) and np.min(pixels[:, 3]) == 255, 'Cropped foot has transparent/unavailable Body texels')
        report[side] = {'triangleCentroids': len(pixels), 'alphaRange': [int(pixels[:, 3].min()), int(pixels[:, 3].max())],
                        'medianRGB': np.median(pixels[:, :3], axis=0).tolist()}
    return {'encodedTextureSha256': hashlib.sha256(image).hexdigest(), 'material': material['name'],
            'alphaMode': material.get('alphaMode', 'OPAQUE'), 'perSide': report}


def reconcile_original_seams(attrs, tris, skin, cuff, tolerance):
    # Keep the lowest original Body vertex's real weights at an existing seam.
    # Both sides must use exactly the same raw joints. No geometry is moved.
    used = np.unique(tris[attrs['POSITION'][tris, 1].min(1) < cuff])
    groups = {}
    for a, b in sorted(cKDTree(attrs['POSITION'][used]).query_pairs(tolerance)):
        members = groups.get(a, {a}) | groups.get(b, {b})
        for member in members:
            groups[member] = members
    fixed = {**attrs, 'JOINTS_0': attrs['JOINTS_0'].copy(), 'WEIGHTS_0': attrs['WEIGHTS_0'].copy()}
    evidence = []
    for group in sorted(set(tuple(sorted(group)) for group in groups.values())):
        ids = used[list(group)]
        w = np.zeros((len(ids), len(skin['joints'])))
        for j in range(4):
            np.add.at(w, (np.arange(len(ids)), attrs['JOINTS_0'][ids, j]), attrs['WEIGHTS_0'][ids, j])
        delta = np.max(np.abs(w - w[0]), axis=1)
        if delta.max() == 0:
            continue
        require(np.all((w > 0) == (w[0] > 0)) and delta.max() < 3e-5, 'Native seam exceeds measured source discrepancy')
        require(np.max(np.linalg.norm(attrs['POSITION'][ids] - attrs['POSITION'][ids[0]], axis=1)) <= tolerance, 'Chained seam exceeds source tolerance')
        fixed['JOINTS_0'][ids] = attrs['JOINTS_0'][ids[0]]
        fixed['WEIGHTS_0'][ids] = attrs['WEIGHTS_0'][ids[0]]
        evidence.append({'sourceVertexIds': ids.tolist(), 'retainedOriginalVertex': int(ids[0]),
                         'maxWeightChange': float(delta.max()), 'maxL1WeightChange': float(np.abs(w - w[0]).sum(1).max())})
    return fixed, evidence


def main():
    for path, digest in PINS.items():
        require(crew.sha(ROOT / path) == digest, 'Input changed: ' + path)
    source = json.loads((ROOT / SOURCE).read_bytes())
    body = source['avatar']
    g, attrs, tris, skin, mi, pi = crew.source(body)
    spec = json.loads((ROOT / SPEC).read_bytes())
    vrm = g.doc['extensions']['VRMC_vrm']
    humans = {key: row['node'] for key, row in vrm['humanoid']['humanBones'].items()}
    world = world_transforms(g.doc)
    mesh_node = next(i for i, node in enumerate(g.doc['nodes']) if node.get('mesh') == mi)
    require(np.allclose(world(mesh_node), np.eye(4), atol=1e-7), 'Body is not in author coordinates')
    inverse = np.array(g.accessor(skin['inverseBindMatrices'])).reshape(-1, 4, 4).transpose(0, 2, 1)
    legs = {side + bone: humans[side + bone] for side in ['left', 'right'] for bone in ['LowerLeg', 'Foot', 'Toes']}
    errors = {name: float(abs(world(i) @ inverse[skin['joints'].index(i)] - np.eye(4)).max()) for name, i in legs.items()}
    require(max(errors.values()) < 1e-5, 'Raw world and inverse bind disagree')
    locations = {key: world(i)[:3, 3].tolist() for key, i in legs.items()}
    require(locations['leftFoot'][0] > 0 > locations['rightFoot'][0], 'Unexpected anatomical handedness')
    cuff = max(locations[side + 'Foot'][1] for side in ['left', 'right']) + spec['crewAboveAnkleM']
    foot_ids = np.unique(tris[attrs['POSITION'][tris, 1].min(1) < cuff])
    weights = {}
    for side, sign in [('left', 1), ('right', -1)]:
        ids = foot_ids[attrs['POSITION'][foot_ids, 0] * sign > 0]
        w = attrs['WEIGHTS_0'][ids]
        active = np.unique(attrs['JOINTS_0'][ids][w > 0])
        require(set(skin['joints'][j] for j in active) == {i for name, i in legs.items() if name.startswith(side)}, 'Unexpected active leg skin')
        weights[side] = {'referencedVerticesInclCuffCrossings': len(ids), 'maxWeightSumError': float(abs(1 - w.sum(1)).max()),
                         'rawWeightedJoints': [g.doc['nodes'][skin['joints'][j]]['name'] for j in active]}
    p = g.doc['meshes'][mi]['primitives'][pi]
    material = g.doc['materials'][p['material']]
    paint = paint_samples(g, material, attrs, tris, cuff)
    require(paint['encodedTextureSha256'] == source['nativePNG']['sha256'], 'Unexpected native Body texture')
    equipment = json.loads((ROOT / EQUIPMENT).read_bytes())
    pairing = {}
    for item in equipment['items']:
        if item['slot'] not in ['shoes', 'bottom']:
            continue
        path = (ROOT / EQUIPMENT).parent / item['url']
        require(item['compatibleAvatarSha256'] == body['sha256'] and crew.sha(path) == item['sha256'], 'Pairing source changed')
        garment = GLB(path.read_bytes())
        token = '_Shoes_' if item['slot'] == 'shoes' else '_Bottoms_'
        native_primitive, = [prim for prim in g.doc['meshes'][mi]['primitives'] if token in g.doc['materials'][prim['material']]['name']]
        native_surface = drawn_surface(g, native_primitive)
        require(native_surface == drawn_surface(garment, garment.doc['meshes'][0]['primitives'][0]), 'Garment raster inputs differ from target')
        points, faces = qa.arrays(garment)
        used = points[np.unique(faces)]
        pairing[item['slot']] = {'id': item['id'], 'sha256': item['sha256'], 'path': path.relative_to(ROOT).as_posix(),
                                 'triangles': len(faces), 'boundsM': [used.min(0).tolist(), used.max(0).tolist()],
                                 'verifiedDrawnSurface': native_surface}
    require(pairing['shoes']['boundsM'][1][1] < cuff, 'No crew band above shoes')
    preflight = {'inputs': PINS, 'body': body, 'originalEditableAndExportInputs': source['inputs'][:5],
                 'sourceLicense': {'status': 'internal-study-only', 'sourceVRMMeta': vrm['meta']},
                 'bodyPrimitive': {'mesh': mi, 'primitive': pi, 'triangles': len(tris), 'referencedVertices': len(np.unique(tris))},
                 'bindLocationsM': locations, 'maximumWorldTimesInverseBindErrors': errors, 'footSkin': weights,
                 'bodyPaint': paint, 'cuffYM': cuff, 'pairing': pairing,
                 'clothingExtentCheck': {'bottomBoundsClearCuff': pairing['bottom']['boundsM'][0][1] > cuff,
                                         'explanation': 'The full Bottoms primitive extends below the cuff. A bounding box cannot establish visible coverage for the native alpha-masked material.'}}
    out = HERE / 'generated'
    out.mkdir(exist_ok=True)
    crew.write(out / 'preflight.json', preflight)
    # The legacy cropper asks for world foot and knee points via VRM0. Expose
    # only those author-space measurements, independently computed above.
    marker_doc = {'nodes': [{'translation': xyz} for xyz in locations.values()],
                  'extensions': {'VRM': {'humanoid': {'humanBones': [{'bone': name, 'node': j} for j, name in enumerate(locations)]}}}}
    markers = SimpleNamespace(doc=marker_doc)
    try:
        crew.make_parts(markers, attrs, tris, skin, spec)
    except ValueError as err:
        require(str(err) == 'Sock extraction or seam weights invalid', 'Unexpected initial rejection: ' + str(err))
        first_rejection = str(err)
    else:
        raise ValueError('Expected rejection of original coincident weights')
    fixed, repairs = reconcile_original_seams(attrs, tris, skin, cuff, spec['seamWeldToleranceM'])
    crew.write(out / 'seam-readback.json', {'originalRejection': first_rejection, 'groups': repairs,
               'maxWeightChange': max(r['maxWeightChange'] for r in repairs), 'originalBodyUnmodified': True})
    try:
        crew.make_parts(markers, fixed, tris, skin, spec)
    except ValueError as err:
        require(str(err).startswith('Unexpected source foot opening:'), 'Unexpected repair result: ' + str(err))
        reason = str(err)
    else:
        raise ValueError('Historical rejection no longer reproduced')
    from diagnosis import diagnose
    diagnosis = diagnose(g, attrs, tris, mi, spec, cuff, pairing, out)
    fallback_path = ROOT / 'assets-source/m2-socks-layer-v1/generated/male-entry.json'
    fallback = json.loads(fallback_path.read_bytes())
    fallback_body = spec['bodies']['male']
    require(crew.sha(ROOT / fallback_body['path']) == fallback['compatibleAvatarSha256'] == fallback_body['sha256'],
            'Fallback Body identity mismatch')
    require(crew.sha(fallback_path.parent / fallback['url']) == fallback['sha256'], 'Fallback garment identity mismatch')
    crew.write(out / 'result.json', {'status': 'rejected-after-one-source-seam-repair', 'styleId': spec['styleId'],
               'targetBodySha256': body['sha256'], 'reason': reason, 'candidateGLBProduced': False,
               'sourceGeometryReadback': diagnosis, 'fallbackForDifferentBody': {
                   'entry': fallback_path.relative_to(ROOT).as_posix(), 'fitId': fallback['fitId'],
                   'bodyPath': fallback_body['path'], 'bodySha256': fallback['compatibleAvatarSha256'],
                   'garmentSha256': fallback['sha256'], 'compatibleWith7586': False}})
    print('Reproduced source rejection. See ' + str(out / 'result.json'))


if __name__ == '__main__':
    main()
