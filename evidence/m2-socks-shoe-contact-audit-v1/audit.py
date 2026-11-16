import hashlib
import io
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image

root = Path('F:/gamemake')
sys.path.insert(0, str(root/'scripts/production'))
from flow import GLB

out = root/'evidence/m2-socks-shoe-contact-audit-v1'
out.mkdir(exist_ok=True)
sha = lambda b: hashlib.sha256(b).hexdigest()
spec = json.loads((root/'assets-source/m2-socks-layer-v1/spec.json').read_text(encoding='utf-8'))
spec_sha = sha((root/'assets-source/m2-socks-layer-v1/spec.json').read_bytes())
rows = []


def primitives(glb, material_test=lambda material: True):
    rows = []
    for mesh in glb.doc['meshes']:
        for p in mesh['primitives']:
            material = glb.doc['materials'][p['material']]
            if not material_test(material):
                continue
            rows.append((np.array(glb.accessor(p['attributes']['POSITION'])),
                         np.array(glb.accessor(p['indices']), dtype=int).reshape(-1, 3),
                         np.array(glb.accessor(p['attributes']['TEXCOORD_0'])) if 'TEXCOORD_0' in p['attributes'] else None,
                         material))
    return rows


def rasterize(parts, z, y):
    depth = np.full((len(y), len(z)), np.inf)
    color = np.zeros((len(y), len(z), 4), dtype=np.uint8)
    triangle_ids = np.full(depth.shape, -1, dtype=int)
    triangle_number = 0
    for positions, faces, uvs, material, texture in parts:
        for face in faces:
            number = triangle_number
            triangle_number += 1
            p = positions[face]
            if p[:, 0].max() >= 0:
                continue
            zl, zh = np.searchsorted(z, [p[:, 2].min(), p[:, 2].max()])
            yl, yh = np.searchsorted(y, [p[:, 1].min(), p[:, 1].max()])
            if zl >= zh or yl >= yh:
                continue
            zz, yy = np.meshgrid(z[zl:zh], y[yl:yh])
            a, b, c = p[:, [2, 1]]
            denominator = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(denominator) < 1e-14:
                continue
            u = ((b[1]-c[1])*(zz-c[0])+(c[0]-b[0])*(yy-c[1]))/denominator
            v = ((c[1]-a[1])*(zz-c[0])+(a[0]-c[0])*(yy-c[1]))/denominator
            w = 1-u-v
            x = u*p[0, 0]+v*p[1, 0]+w*p[2, 0]
            section = depth[yl:yh, zl:zh]
            mask = (u >= 0) & (v >= 0) & (w >= 0) & (x < section)
            if not mask.any():
                continue
            if texture is not None:
                uv = u[..., None]*uvs[face[0]]+v[..., None]*uvs[face[1]]+w[..., None]*uvs[face[2]]
                px = np.minimum(texture.shape[1]-1, np.floor(np.clip(uv[..., 0], 0, 1)*texture.shape[1]).astype(int))
                py = np.minimum(texture.shape[0]-1, np.floor(np.clip(uv[..., 1], 0, 1)*texture.shape[0]).astype(int))
                rgba = texture[py, px]
            else:
                rgba = np.broadcast_to(np.rint(np.array(material.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1]))*255).astype(np.uint8), (*u.shape, 4))
            section[mask] = x[mask]
            color[yl:yh, zl:zh][mask] = rgba[mask]
            triangle_ids[yl:yh, zl:zh][mask] = number
    return depth, color, triangle_ids


def surface_skin(glb, triangle_number, yz):
    remaining = triangle_number
    for mesh_index, mesh in enumerate(glb.doc['meshes']):
        node = next(n for n in glb.doc['nodes'] if n.get('mesh') == mesh_index)
        skin = glb.doc['skins'][node['skin']]
        for primitive in mesh['primitives']:
            faces = np.array(glb.accessor(primitive['indices']), dtype=int).reshape(-1, 3)
            if remaining >= len(faces):
                remaining -= len(faces)
                continue
            face = faces[remaining]
            attrs = primitive['attributes']
            positions = np.array(glb.accessor(attrs['POSITION']))[face]
            projected = positions[:, [1, 2]]
            matrix = np.vstack([projected.T, np.ones(3)])
            barycentric = np.linalg.solve(matrix, [*yz, 1])
            joints = np.array(glb.accessor(attrs['JOINTS_0']), dtype=int)[face]
            weights = np.array(glb.accessor(attrs['WEIGHTS_0']))[face]
            dense = {}
            corner_weights = []
            for corner, (js, ws) in enumerate(zip(joints, weights)):
                row = {}
                for j, w in zip(js, ws):
                    if w > 1e-8:
                        bone_name = glb.doc['nodes'][skin['joints'][int(j)]]['name']
                        row[bone_name] = row.get(bone_name, 0)+float(w)
                        dense[bone_name] = dense.get(bone_name, 0)+float(w*barycentric[corner])
                corner_weights.append(row)
            return {'triangleNumber': triangle_number, 'localVertexIds': face.tolist(), 'barycentric': barycentric.tolist(),
                    'interpolatedWeightsByRawName': dense, 'cornerWeightsByRawName': corner_weights}
    raise ValueError('Triangle out of range')


def bone_bind_position(doc, name):
    parents = {child: i for i, node in enumerate(doc['nodes']) for child in node.get('children', [])}
    index = next(i for i, node in enumerate(doc['nodes']) if node.get('name') == name)
    position = np.zeros(3)
    while True:
        node = doc['nodes'][index]
        if any(key in node for key in ['rotation', 'scale', 'matrix']):
            raise ValueError('Diagnostic expects the actual translation-only original bind')
        position += node.get('translation', [0, 0, 0])
        if index not in parents:
            return position
        index = parents[index]


for body_type, body_spec in spec['bodies'].items():
    shoe_manifest = json.loads((root/body_spec['manifest']).read_text(encoding='utf-8'))
    shoe_entry = next(r for r in shoe_manifest['items'] if r['id'] == body_spec['shoesId'])
    shoe_path = root/'prototype/public'/shoe_entry['url'].lstrip('/') if shoe_entry['url'].startswith('/') else (root/body_spec['manifest']).parent/shoe_entry['url']
    sock_path = root/f'assets-source/m2-socks-layer-v1/generated/{body_type}-plain-crew-socks-v1.glb'
    body_path = root/body_spec['path']
    shoes, socks, source_body = [GLB(p.read_bytes()) for p in [shoe_path, sock_path, body_path]]
    source_shoe_parts, textures = [], []
    for positions, faces, uv, material in primitives(shoes):
        image_index = shoes.doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
        image = shoes.doc['images'][image_index]
        view = shoes.doc['bufferViews'][image['bufferView']]
        encoded = shoes.binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
        texture = np.array(Image.open(io.BytesIO(encoded)).convert('RGBA'))
        (out/f'{body_type}-original-shoe-texture.png').write_bytes(encoded)
        source_shoe_parts.append((positions, faces, uv, material, texture))
        textures.append({'sha256': sha(encoded), 'width': texture.shape[1], 'height': texture.shape[0],
                         'alphaMin': int(texture[..., 3].min()), 'alphaMax': int(texture[..., 3].max()),
                         'alphaMode': material.get('alphaMode', 'OPAQUE'), 'doubleSided': material.get('doubleSided', False)})
    sock_parts = [(*r, None) for r in primitives(socks)]
    body_parts = []
    for positions, faces, uv, material in primitives(source_body, lambda material: '_Body_00_SKIN' in material['name']):
        body_parts.append((positions, faces, uv, material, None))
    # 0.25mm source-space ray spacing. Left outer side, raw -X toward +X.
    z = np.arange(-.205, .125+.0001, .00025)
    y = np.arange(.0, .15+.0001, .00025)
    shoe_depth, shoe_color, shoe_triangles = rasterize(source_shoe_parts, z, y)
    sock_depth, sock_color, sock_triangles = rasterize(sock_parts, z, y)
    body_depth, _, _ = rasterize(body_parts, z, y)
    overlap = np.isfinite(shoe_depth) & np.isfinite(sock_depth)
    excess = np.zeros(overlap.shape)
    excess[overlap] = shoe_depth[overlap]-sock_depth[overlap]
    protrudes = overlap & (excess > .00001)
    zz, yy = np.meshgrid(z, y)
    heel = overlap & (zz > .02) & (yy < .095)
    heel_protrudes = protrudes & heel
    source_body_excess = np.zeros(overlap.shape)
    both_body = np.isfinite(body_depth) & np.isfinite(shoe_depth)
    source_body_excess[both_body] = shoe_depth[both_body]-body_depth[both_body]
    additive_exposure = protrudes & both_body & (source_body_excess <= 0)
    heel_additive = additive_exposure & heel
    visible = shoe_color.copy()
    visible[protrudes] = sock_color[protrudes]
    visible[~np.isfinite(shoe_depth)] = [232, 232, 232, 255]
    shoe_image = shoe_color.copy()
    shoe_image[~np.isfinite(shoe_depth)] = [232, 232, 232, 255]
    # Software source-space diagnostic projections, no shading or posed claim.
    Image.fromarray(shoe_image[::-1]).save(out/f'{body_type}-source-rest-shoe-only.png')
    Image.fromarray(visible[::-1]).save(out/f'{body_type}-source-rest-shoe-plus-sock.png')
    mask = np.zeros_like(visible); mask[:] = [232, 232, 232, 255]; mask[np.isfinite(shoe_depth)] = [40, 40, 40, 255]; mask[protrudes] = [255, 40, 40, 255]
    Image.fromarray(mask[::-1]).save(out/f'{body_type}-source-rest-sock-protrusion-mask.png')
    additive_mask = np.zeros_like(visible); additive_mask[:] = [232, 232, 232, 255]; additive_mask[np.isfinite(shoe_depth)] = [40, 40, 40, 255]; additive_mask[additive_exposure] = [255, 40, 40, 255]
    Image.fromarray(additive_mask[::-1]).save(out/f'{body_type}-source-rest-new-exposure-mask.png')
    peak = np.unravel_index(np.argmax(np.where(heel, excess, -np.inf)), excess.shape)
    locations = np.argwhere(heel_protrudes)
    additive_peak = np.unravel_index(np.argmax(np.where(heel_additive, excess, -np.inf)), excess.shape)
    additive_locations = np.argwhere(heel_additive)
    heel_values = shoe_color[heel_protrudes]
    skin_yz = [float(y[additive_peak[0]]), float(z[additive_peak[1]])]
    shoe_skin = surface_skin(shoes, int(shoe_triangles[additive_peak]), skin_yz)
    sock_skin = surface_skin(socks, int(sock_triangles[additive_peak]), skin_yz)
    names = set(shoe_skin['interpolatedWeightsByRawName']) | set(sock_skin['interpolatedWeightsByRawName'])
    skin_difference = sum(abs(shoe_skin['interpolatedWeightsByRawName'].get(name, 0)-sock_skin['interpolatedWeightsByRawName'].get(name, 0)) for name in names)
    foot_pivot = bone_bind_position(source_body.doc, 'J_Bip_L_Foot')
    shoe_point = np.array([shoe_depth[additive_peak], *skin_yz])
    sock_point = np.array([sock_depth[additive_peak], *skin_yz])
    pose_diagnostics = []
    for axis, angle in [('X', .35), ('Z', .18)]:
        c, s = np.cos(angle), np.sin(angle)
        rotation = np.array([[1, 0, 0], [0, c, -s], [0, s, c]]) if axis == 'X' else np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        points = []
        for point, skin_row in [(shoe_point, shoe_skin), (sock_point, sock_skin)]:
            weights = skin_row['interpolatedWeightsByRawName']
            if set(weights) != {'J_Bip_L_Foot', 'J_Bip_L_LowerLeg'}:
                raise ValueError('Unexpected influences at measured heel patch')
            points.append(point+weights['J_Bip_L_Foot']*(rotation@(point-foot_pivot)+foot_pivot-point))
        original_delta = sock_point-shoe_point
        posed_delta = points[1]-points[0]
        pose_diagnostics.append({'footRawLocalRotationAxis': axis, 'angleRadians': angle,
                                 'restSockMinusShoeM': original_delta.tolist(), 'posedSockMinusShoeM': posed_delta.tolist(),
                                 'relativeVectorChangeM': float(np.linalg.norm(posed_delta-original_delta)),
                                 'limit': 'Transport of the fixed rest sample pair, not a newly searched posed contact or screenshot pose.'})
    rows.append({'bodyType': body_type, 'sourceSha256': {str(p.relative_to(root)): sha(p.read_bytes()) for p in [shoe_path, sock_path, body_path]},
                 'shoeTextures': textures, 'raySpacingM': .00025, 'rayAxis': 'left outer side raw -X towards +X',
                 'overlapSampleCount': int(overlap.sum()), 'sockInFrontOfShoeSampleCount': int(protrudes.sum()),
                 'heelRegion': {'zGreaterThanM': .02, 'yLessThanM': .095, 'overlapSamples': int(heel.sum()),
                                'sockInFrontSamples': int(heel_protrudes.sum()),
                                'projectedAreaEstimateMm2': float(heel_protrudes.sum()*.25*.25),
                                'sampleBoundsYZIndices': [locations.min(0).tolist(), locations.max(0).tolist()] if len(locations) else None,
                                'peakSignedXExcessM': float(excess[peak]),
                                'peakLocationM': {'shoeX': float(shoe_depth[peak]), 'sockX': float(sock_depth[peak]), 'y': float(y[peak[0]]), 'z': float(z[peak[1]])},
                                'peakSourceBodySignedXExcessM': float(source_body_excess[peak]),
                                'peakShoeTriangle': int(shoe_triangles[peak]), 'peakSockTriangle': int(sock_triangles[peak]),
                                'originalShoeTextureRGBA8AtPeak': shoe_color[peak].tolist(),
                                'originalShoeTextureRGB8MedianInExposedRegion': np.median(heel_values[:, :3], axis=0).tolist() if len(heel_values) else None},
                 'additiveHeelExposureWhereIntactBodyRemainsBehindShoe': {'sampleCount': int(heel_additive.sum()),
                     'projectedAreaEstimateMm2': float(heel_additive.sum()*.25*.25),
                     'boundsYM': [float(y[additive_locations[:, 0]].min()), float(y[additive_locations[:, 0]].max())] if len(additive_locations) else None,
                     'boundsZM': [float(z[additive_locations[:, 1]].min()), float(z[additive_locations[:, 1]].max())] if len(additive_locations) else None,
                     'peakSignedXExcessM': float(excess[additive_peak]),
                     'peakLocationM': {'shoeX': float(shoe_depth[additive_peak]), 'sockX': float(sock_depth[additive_peak]), 'bodyX': float(body_depth[additive_peak]), 'y': float(y[additive_peak[0]]), 'z': float(z[additive_peak[1]])},
                     'peakShoeTriangle': int(shoe_triangles[additive_peak]), 'peakSockTriangle': int(sock_triangles[additive_peak]),
                     'originalShoeTextureRGBA8AtPeak': shoe_color[additive_peak].tolist(),
                     'shoeSurfaceSkin': shoe_skin, 'sockSurfaceSkin': sock_skin, 'interpolatedWeightL1Difference': skin_difference,
                     'prescribedPoseTransportDiagnostics': pose_diagnostics}})

report = {'schema': 'independent-sock-shoe-source-contact-v1', 'specSha256': spec_sha, 'method': 'Orthographic CPU triangle barycentric depth and UV sampling in original raw glTF rest coordinates. Compare first visible left-side X surface for shoe, sock and intact Body independently.',
          'rows': rows, 'limits': ['No pose copied from screenshots. Rest source projection is not a pixel-identical reconstruction of the animated browser view.', 'Total sock-in-front overlap includes the natural open collar and far inner shoe side and is not a penetration severity measurement. Additive exposure separately requires the intact Body to remain behind the shoe.', 'The 0.25mm grid samples depth ordering, not continuous penetration volume/depth or full-triangle contact.', 'Actual screenshot color depends on lighting, MToon and antialiasing. Software projection uses source texture RGB without shading.', 'Both outward and inward sock shell surfaces are rendered for source comparison. Backface/material effects and original shoe silhouettes may differ.']}
(out/'source-result.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report, indent=2))
