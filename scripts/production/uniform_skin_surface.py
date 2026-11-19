"""Emit a reproducible CPU fit for the historic warm tint on the 1K uniform female."""
import argparse
from collections import defaultdict
import io
import json
import re

import numpy as np
from PIL import Image

from female_uniform_texture_fit import (ASSET_URL, BODY_MATERIAL, PARENT, PARENT_SHA, PROFILE_ID,
                                       RELEASE_IDS, TARGET_SHA, VIEWS, body_bytes, prove_body)
from flow import ROOT, Validator, require
from garment_basecolor_release import OPERATION, half_png
from garment_source_mapping import json_bytes
from native_import import digest
from stripped_outfit_equipment import BodyReadback
from uniform_head_compat import HISTORIC, LOOK


FACE = 'F00_000_00_Face_00_SKIN'
WARM = '#ddc5b4'
TARGET_PALETTE = ('prototype/public/assets/female-uniform-head-v1/palette-manifest.json',
                  'f322a155136d960216d32a7ba1a60e847eb01f43a87bb6b28d3dd0a6e4e676bd')
MASKS = {
    'top': ('coverage-top.json', 'f0e3b845fae36754ed60f0488efd08c4eeb98c0f3901e11447602b453fa7a529'),
    'topFar': ('coverage-top-1k.json', 'dde4d2f89c988bb57140db140fcc7f62e9a391b5311d16233586ddc280c394b2'),
}
MANIFEST_SHA = 'e7252fcc6bf73a6f1bde1790edbd832f1c0e58b676703b254410ed9312f1b6d8'
REPORT = ROOT / 'evidence/m2-uniform-skin-v1/source-fit.json'


def srgb_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def material_surface(body, name):
    skinned = [(mi, pi, p) for mi, mesh in enumerate(body.doc['meshes'])
               for pi, p in enumerate(mesh['primitives'])
               if body.doc['materials'][p['material']]['name'] == name]
    require(len(skinned) == 1, 'Ambiguous skin material ' + name)
    mi, pi, part = skinned[0]
    material = body.doc['materials'][part['material']]
    legacy = body.vrm['materialProperties'][part['material']]
    vec, tex = legacy['vectorProperties'], legacy['textureProperties']
    pbr = material['pbrMetallicRoughness']
    main = tex['_MainTex']
    require(legacy['name'] == name and legacy['shader'] == 'VRM/MToon'
            and pbr['baseColorTexture'] == {'index': main} and tex['_ShadeTexture'] == main
            and vec['_MainTex'] == vec['_ShadeTexture'] == [0, 0, 1, 1], 'Skin UV or shade map changed')
    body_part = name == BODY_MATERIAL
    require(material['alphaMode'] == ('MASK' if body_part else 'OPAQUE')
            and not legacy['keywordMap'].get('_ALPHABLEND_ON')
            and bool(legacy['keywordMap'].get('_ALPHATEST_ON')) == body_part
            and (not body_part or material['alphaCutoff'] == legacy['floatProperties']['_Cutoff'] == .5)
            and vec['_Color'] == pbr['baseColorFactor'] == [1, 1, 1, 1], 'Skin alpha or base factor changed')
    texture = body.texture(main)
    require(texture['sampler'] == {'magFilter': 9729, 'minFilter': 9729, 'wrapS': 10497, 'wrapT': 10497},
            'Expected LINEAR and REPEAT')
    source = body.doc['images'][body.doc['textures'][main]['source']]
    png = body_bytes(body, source['bufferView'])
    with Image.open(io.BytesIO(png)) as im:
        mode = im.mode
        require(im.format == 'PNG' and mode in ('RGB', 'RGBA')
                and im.convert('RGBA').getchannel('A').getextrema() == (255, 255),
                'Skin base/shade pixels are not fully opaque')
        pixels = np.array(im)
    # VRMMaterialsV0CompatPlugin gammaEOTF applies exponent 2.2 to authored MToon RGB.
    # THREE.Color(hex) uses the sRGB transfer with the constants in Three ColorManagement.
    c = np.array(list(bytes.fromhex(WARM[1:]))) / 255
    tint = (c * 0.9478672986 + 0.0521327014) ** 2.4  # All three warm channels exceed the toe.
    factors = {}
    for slot, vector in [('color', '_Color'), ('shadeColorFactor', '_ShadeColor')]:
        base = np.asarray(vec[vector][:3]) ** 2.2
        factors[slot] = {'authoredVrm0': vec[vector], 'originalLinear': base.tolist(),
                         'warmLinear': (base * tint).tolist()}
    fact = {'material': name, 'primitive': [mi, pi], 'texture': main, 'baseAndShadePng': digest(png),
            'size': list(pixels.shape[:2][::-1]), 'pngMode': mode, 'alphaRange': [255, 255], 'alphaMode': material['alphaMode'],
            'alphaCutoff': material.get('alphaCutoff'), 'factors': factors,
            'uvSha256': body.stream(part['attributes']['TEXCOORD_0'])['payloadSha256'],
            'indexSha256': body.stream(part['indices'])['payloadSha256']}
    return fact, part, png, pixels


def boundary(model, part):
    """Weld coincident positions within one primitive, retaining each boundary edge's own UVs."""
    attrs = part['attributes']
    pos = np.array(model.glb.accessor(attrs['POSITION']))
    uv = np.array(model.glb.accessor(attrs['TEXCOORD_0']))
    tris = np.array(model.glb.accessor(part['indices'])).reshape(-1, 3)
    edges = defaultdict(list)
    for face, tri in enumerate(tris):
        for i, j in zip(tri, (tri[1], tri[2], tri[0])):
            first, last = tuple(pos[i]), tuple(pos[j])
            if first != last:
                edges[tuple(sorted((first, last)))].append((face, (uv[i] + uv[j]) / 2))
    return {k: v[0] for k, v in edges.items() if len(v) == 1}


def matched_edges(body, face):
    """Mutual nearest boundary points; both endpoints must form a real edge on each primitive."""
    bp, fp = (sorted({p for edge in part for p in edge}) for part in (body, face))
    dist = np.linalg.norm(np.asarray(fp)[:, None, :] - np.asarray(bp), axis=2)
    nf, nb = dist.argmin(0), dist.argmin(1)
    match = {fp[i]: bp[j] for i, j in enumerate(nb) if nf[j] == i}
    pairs = []
    for edge, (ff, fuv) in sorted(face.items()):
        if all(p in match for p in edge):
            other = tuple(sorted(match[p] for p in edge))
            if other in body:
                bf, buv = body[other]
                pairs.append((edge, bf, ff, buv, fuv))
    points = sorted({p for row in pairs for p in row[0]})
    require(len(points) == 38 and len(pairs) == 36, 'Historic shared face/body edges changed')
    return pairs, {'matchedVertices': len(points), 'matchedEdges': len(pairs),
                   'restBoundsM': [np.min(points, axis=0).tolist(), np.max(points, axis=0).tolist()],
                   'maxRestVertexSeparationM': max(float(np.linalg.norm(np.subtract(p, match[p]))) for p in points)}


def footprint(image, uv):
    h, w = image.shape[:2]
    xy = uv * [w, h] - .5
    x, y = np.floor(xy).astype(int)
    fx, fy = xy - [x, y]
    return [(image[(y + dy) % h, (x + dx) % w], wx * wy)
            for dy, wy in enumerate((1 - fy, fy)) for dx, wx in enumerate((1 - fx, fx))]


def linear_sample(image, uv):
    return sum(srgb_linear(pixel[:3] / 255) * weight for pixel, weight in footprint(image, uv))


def coverage(rule, parent, entry, body, part, boundary_faces):
    triangles = np.array(body.glb.accessor(part['indices'])).reshape(-1, 3)
    fields = ('bodyMesh', 'bodyMeshIndex', 'bodyPrimitive', 'bodyMaterial', 'bodyFaceCount',
              'bodyIndexComponentType', 'bodyIndexAccessorSha256', 'selectedFaceIds', 'selectedTriangles',
              'selectedVertices')
    require(all(parent[k] == rule[k] for k in fields) and parent['avatarSha256'] == PARENT_SHA
            and rule['avatarSha256'] == entry['compatibleAvatarSha256'] == TARGET_SHA
            and rule['topId'] == entry['id'] and rule['topSha256'] == parent['topSha256'] == entry['sha256'],
            'Coverage source, body or top differs')
    faces = rule['selectedFaceIds']
    require(rule['bodyMaterial'] == BODY_MATERIAL and rule['bodyFaceCount'] == len(triangles)
            and rule['bodyIndexAccessorSha256'] == body.stream(part['indices'])['payloadSha256']
            and len(set(faces)) == len(faces) == 252 and all(0 <= f < len(triangles) for f in faces)
            and triangles[faces].tolist() == rule['selectedTriangles']
            and sorted(set(triangles[faces].ravel())) == sorted(rule['selectedVertices'])
            and set(faces).isdisjoint(boundary_faces), 'Invalid torso coverage or hidden head boundary')
    return {'topId': entry['id'], 'topSha256': entry['sha256'], 'hiddenBodyTriangles': len(faces),
            'drawnBodyTriangles': len(triangles) - len(faces), 'hiddenBoundaryFaces': 0,
            'selectedFaceIdsSha256': digest(json_bytes(faces))}


def seam(pairs, old_body, new_body, face, mask, material):
    lowest = min((point for edge, *_ in pairs for point in edge), key=lambda p: p[1])
    rows = []
    for edge, bf, ff, buv, fuv in pairs:
        require(all(pixel == 0 for pixel, _ in footprint(mask, fuv)), 'Outer lip mask reaches sampled seam')
        rows.append((lowest in edge, linear_sample(old_body, buv), linear_sample(new_body, buv),
                     linear_sample(face, fuv)))
    result = {}
    for label, selected in [('sharedBoundary', rows), ('edgesAtLowestFaceBodyJoin', [r for r in rows if r[0]])]:
        old, new, face_color = (np.stack([r[i] for r in selected]) for i in (1, 2, 3))
        summary = {}
        for slot, factors in material['factors'].items():
            for tone in ('originalLinear', 'warmLinear'):
                factor = factors[tone]
                values = {}
                for metric, diff in [('oldFaceVsBody', face_color - old), ('targetFaceVsBody', face_color - new),
                                     ('targetVsOldBody', new - old)]:
                    absolute = np.abs(diff * factor)
                    values[metric] = {'meanAbsRGB': absolute.mean(0).tolist(),
                                      'maxAbsChannel': float(absolute.max())}
                summary[slot + '/' + tone] = values
        result[label] = {'edgeMidpoints': len(selected), 'linearRGB': summary}
    return result


def audit(reader=None):
    reader = reader or Validator()
    h = json.loads(reader.pin(*HISTORIC))
    records = h['inputs']['signedRecords']
    old_record, = [r for r in json.loads(reader.pin(records['path'], records['sha256']))
                   if r['identity']['gender'] == 'female']
    look = old_record['appearanceRecipe']
    require(look['base'] == {'bodyType': 'female', 'sha256': PARENT_SHA} and look['appearance'] == LOOK,
            'Historical signed warm look differs')
    old = BodyReadback(reader.pin(PARENT, PARENT_SHA))
    new = BodyReadback(reader.pin(reader.url(ASSET_URL + '/body.vrm'), TARGET_SHA))
    proof = prove_body(old, new)
    names = {m['name'] for m in new.doc['materials'] if re.search(r'_(Body|Face)_\d+_SKIN', m['name'])}
    require(names == {FACE, BODY_MATERIAL}, 'Unexpected tint recipients')
    surfaces = {}
    for label, model in [('old', old), ('target', new)]:
        surfaces[label] = {name: material_surface(model, name) for name in (FACE, BODY_MATERIAL)}
    face, facepart, _, facepix = surfaces['target'][FACE]
    body, bodypart, newpng, newpix = surfaces['target'][BODY_MATERIAL]
    oldbody, _, oldpng, oldpix = surfaces['old'][BODY_MATERIAL]
    require(surfaces['old'][FACE][0] == face
            and {k: v for k, v in body.items() if k not in ('baseAndShadePng', 'size', 'pngMode')} ==
                {k: v for k, v in oldbody.items() if k not in ('baseAndShadePng', 'size', 'pngMode')}
            and face['factors'] == body['factors'] and half_png(oldpng) == newpng,
            'Face, skin factors, or exact linear-light box reduction differs')
    target_palette = json.loads(reader.pin(*TARGET_PALETTE))
    old_palette = json.loads(reader.pin(reader.url('/assets/appearance-color-v3/runtime-manifest.json'),
                                        look['paletteVersion'].split(':')[1]))
    lips, = [r['parts']['lips'] for r in target_palette['variants'] if r['avatarSha256'] == TARGET_SHA]
    source_lip, = [r['parts']['lips'] for r in old_palette['variants'] if r['avatarSha256'] == PARENT_SHA]
    require(lips == source_lip and lips['materialName'] == FACE and lips['uvSha256'] == face['uvSha256']
            and lips['sourceMapSha256'] == face['baseAndShadePng'] and lips['preserveAlpha']
            and lips['imageYEqualsUVv'] and lips['maskChannel'] == 'r', 'Face mask fit differs')
    with Image.open(io.BytesIO(reader.pin(reader.url(lips['maskUrl']), lips['maskSha256']))) as im:
        require(list(im.size) == lips['mapSize'] == face['size'], 'Face mask dimensions differ')
        mask = np.array(im.convert('RGB'))[:, :, 0]
    pairs, join = matched_edges(boundary(new, bodypart), boundary(new, facepart))
    catalog = json.loads(reader.pin(reader.url(ASSET_URL + '/equipment.json'), MANIFEST_SHA))
    rules = {}
    for role, (filename, sha) in MASKS.items():
        entry = reader.item(catalog, RELEASE_IDS[role])
        reader.pin(reader.url(entry['url']), entry['sha256'], entry['bytes'])
        rule = json.loads(reader.pin(reader.url(ASSET_URL + '/' + filename), sha))
        pin = rule['parentCoverage']
        parent = json.loads(reader.pin(pin['path'], pin['sha256']))
        rules[role] = coverage(rule, parent, entry, new, bodypart, {row[1] for row in pairs})
    return {'schema': 'uniform-warm-skin-surface-fit-v1', 'target': {'bodyType': PROFILE_ID, 'sha256': TARGET_SHA},
            'sourceRuntime': h['runtime'], 'sourceRecordSha256': old_record['integrity']['recordSha256'],
            'sourceAvatarSha256': PARENT_SHA, 'operation': {'skinTone': 'warm', 'sRGB': WARM,
                'apply': 'Multiply existing color and shadeColorFactor RGB on each named skin material.',
                'skinTextureAllocations': 0, 'bodyReduction': OPERATION},
            'targetMaterials': [body, face], 'originalBodyTexture': {'size': oldbody['size'], 'sha256': VIEWS[0][0],
                'pngMode': oldbody['pngMode'], 'alphaRange': oldbody['alphaRange']},
            'identicalGeometryAccessors': proof['accessors'], 'uniformIndexCoverage': rules,
            'boundary': {**join, 'method': 'Mutual nearest rest-boundary endpoints that form edges in both skins. '
                'One equally weighted midpoint per edge using its own triangle UVs, level-0 repeating bilinear '
                'samples of decoded linear RGB. The two lowest-join edges touch the lowest shared vertex. '
                'All four texels per face footprint have zero outer-lip mask weight.',
                'samples': seam(pairs, oldpix, newpix, facepix, mask, face)},
            'limits': 'Material factors and sampled albedo in bind pose. No lighting, pose, outline, camera, '
                      'mipmap, animated contact or visual acceptance measurement.', 'inputs': reader.observed}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Compare the checked-in CPU report.')
    args = parser.parse_args()
    report = audit()
    if args.check:
        require(json.loads(REPORT.read_bytes()) == report, 'CPU fit report differs')
        print('Verified', REPORT.name)
    else:
        print(json.dumps(report, ensure_ascii=True, indent=2, allow_nan=False))
