"""Rebuild the two CC0 uniform looks on the exact 1K body-skin derivative."""

import argparse
import io
import json
import os
from pathlib import Path

from PIL import Image

from flow import GLB, ROOT, Validator, require
from garment_source_mapping import json_bytes
from native_accessory_batch import load_script
from native_import import digest
from native_release_textures import verify_unchanged, view_payload
from native_uniform_normal import entries
from production_paths import project_output
from stripped_outfit_equipment import BODY_TYPE as PARENT_ID, BodyReadback, PROOF, TARGET


PARENT_SHA = 'cf1118a2a8d8fca8ccc094e51d051f660ec12ffdbdda4c8ecaad407b55cef9d4'
TARGET_SHA = '2e66ee6c88524bca3f61b834672e89d3146f9f41859811d2159a01c0edf10617'
OLD_PNG = '42d85fafad031d5ae2d138510b3c6e84ffcbb9c72a6ae7546379467346b42a41'
NEW_PNG = 'e46a4ad3bc6fdc4ea4bd9008958ebaf2b0e307f143307f7cbd3ea25a67cf1713'
PROFILE_ID = 'source-male-cc0-texture-release-v1'
ASSET_URL = '/assets/cc0-body-release-v1'
STAGE = ROOT / 'output/m2-cc0-body-release-fit-r01'
REPORT = ROOT / 'evidence/m2-cc0-body-release-fit-v1/report.json'
BODY = ROOT / 'output/m2-cc0-body-release-r01/body.vrm'
FAR_PROOF = 'evidence/m2-garment-basecolor-release-v1/runtime-fits.json'
ROLE_IDS = {role: 'cc0-texture-release-' + garment + '-v1' for role, garment in
            [('top', 'uniform-top'), ('pants', 'uniform-pants'), ('shoes', 'flat-shoes'), ('topFar', 'uniform-top-1k')]}


def view_bytes(body, view):
    return view_payload(body.glb.binary, body.doc['bufferViews'][view])


def texture_slots(doc):
    """Resolve actual glTF and VRM0 consumers of image 15, including aliases."""
    textures = {i for i, row in enumerate(doc['textures']) if row['source'] == 15}
    require(textures == {15}, 'Unexpected texture alias for the selected image')
    material = doc['materials'][9]['name']
    legacy = doc['extensions']['VRM']
    require(material == legacy['materialProperties'][9]['name'] == 'M00_001_01_Body_00_SKIN'
            and legacy['meta']['texture'] not in textures, 'Wrong selected body material or thumbnail')
    consumers = []
    for path, value in entries(doc['materials']):
        if path[-1] == 'index' and value in textures:
            consumers.append('/'.join(map(str, ('materials', *path))))
    for index, row in enumerate(legacy['materialProperties']):
        for slot, texture in row['textureProperties'].items():
            if texture in textures:
                consumers.append(f'VRM/materialProperties/{index}/textureProperties/{slot}')
    expected = {'materials/9/pbrMetallicRoughness/baseColorTexture/index',
                'VRM/materialProperties/9/textureProperties/_MainTex',
                'VRM/materialProperties/9/textureProperties/_ShadeTexture'}
    require(set(consumers) == expected, 'Unexpected selected texture consumer')
    view_uses = [path for path, value in entries(doc) if path[-1] == 'bufferView' and value == 15]
    require(view_uses == [('images', 15, 'bufferView')], 'Body skin image view has another user')
    return sorted(consumers)


def prove_body(old, new, parent_proof):
    src_png, dst_png = view_bytes(old, 15), view_bytes(new, 15)
    require((digest(src_png), digest(dst_png)) == (OLD_PNG, NEW_PNG), 'Unapproved base-color PNG')
    for raw, size in [(src_png, 2048), (dst_png, 1024)]:
        with Image.open(io.BytesIO(raw)) as image:
            require(image.format == 'PNG' and image.size == (size, size)
                    and image.convert('RGBA').getchannel('A').getextrema() == (255, 255),
                    'Body base-color dimensions or opacity differ')
    unchanged = verify_unchanged(old.doc, old.glb.binary, new.doc, new.glb.binary, {15: dst_png})
    consumers = texture_slots(new.doc)
    require(old.skins == new.skins and digest(json_bytes(old.skins)) == parent_proof['skinSignaturesSha256'],
            'Skin or inverse bind differs from parent')
    primitives = []
    for row in parent_proof['retainedPrimitives']:
        mesh, prim = row['mesh'], row['targetPrimitive']
        previous = old.primitive(old.doc['meshes'][mesh]['primitives'][prim])
        current = new.primitive(new.doc['meshes'][mesh]['primitives'][prim])
        require(digest(json_bytes(previous)) == row['signatureSha256'], 'Parent primitive differs from its receipt')
        old_mat, new_mat = previous.pop('material'), current.pop('material')
        require(previous == current, 'Geometry, weight, UV or morph stream differs')
        material = row['materialName']
        require(old_mat[0]['name'] == new_mat[0]['name'] == material and
                (old_mat != new_mat) == (material == 'M00_001_01_Body_00_SKIN'), 'Wrong affected surface')
        primitives.append({'mesh': mesh, 'primitive': prim, 'material': material,
                           'attributes': sorted(current['attributes']), 'morphTargets': len(current.get('targets', [])),
                           'geometrySignatureSha256': digest(json_bytes(current))})
    require(len(primitives) == sum(len(m['primitives']) for m in new.doc['meshes']), 'Incomplete retained surfaces')
    return {'storage': unchanged, 'changedImage': {'index': 15, 'oldPngSha256': OLD_PNG, 'newPngSha256': NEW_PNG,
            'dimensions': [[2048, 2048], [1024, 1024]], 'alphaRange': [255, 255], 'consumers': consumers},
            'skinSignaturesSha256': parent_proof['skinSignaturesSha256'], 'nodes': len(new.doc['nodes']),
            'vrmBlendShapeGroups': len(new.vrm['blendShapeMaster']['blendShapeGroups']), 'primitives': primitives}


def read_parent(reader):
    profile = reader.json('prototype/src/source-outfit-profiles.json')[PARENT_ID]
    require(digest(json_bytes(profile)) == '1fe7b0008598143b838bee44126ee9c7770bbfd68ae43cd078ecf357a2d32d8f',
            'Original profile or source floor changed')
    near = json.loads(reader.pin(PROOF, 'dec0c07620ea9c63cb7882eae332f0c146821cac48f1b5cf1a7af2fdf5cdf0a2'))
    far = json.loads(reader.pin(FAR_PROOF, '7905707e44a6912be3aaee3ce9e4cb55b719f8f439d0998504f15f6ec7ff64c6'))
    far = far['items'][profile['ids']['topFar']]
    original = {'url': profile['manifestUrl'], 'sha256': profile['manifestSha256']}
    [alternate] = profile['additionalEquipmentManifests']
    require(near['equipmentManifestSha256'] == original['sha256'] and far['manifestSha256'] == alternate['sha256']
            and near['targetBodySha256'] == far['bodySha256'] == profile['sha256'] == PARENT_SHA,
            'Source garment receipts disagree with the profile')
    items = {}
    for desc in [original, alternate]:
        catalog = json.loads(reader.pin(reader.url(desc['url']), desc['sha256']))
        for row in catalog['items']:
            require(row['id'] not in items, 'Duplicate source garment')
            items[row['id']] = row
    require(set(items) == set(profile['ids'].values()), 'Unreviewed parent equipment')
    proofs = {row['id']: row for row in near['items']}
    proofs[far['far']['id']] = dict(far['far'], assetSha256=far['glbSha256'])
    return profile, near['bodyProof'], items, proofs


def equipment_fit(reader, garment, role, before, after, witness, source_floor):
    slot = {'top': 'top', 'topFar': 'top', 'pants': 'bottom', 'shoes': 'shoes'}[role]
    require(garment['slot'] == slot, 'Wrong source garment slot: ' + role)
    receipt = reader.equipment(garment, PARENT_SHA, before.glb, '')
    require(all(witness[key] == value for key, value in receipt.items()) and
            witness['assetSha256'] == garment['sha256'], 'Prior fit or garment SHA changed')
    identifier = ROLE_IDS[role]
    release = dict(garment, id=identifier, fitId=identifier + '-fit', compatibleAvatarSha256=TARGET_SHA)
    # Keep style IDs, original source provenance, GLB bytes and coordinate system.
    release['limits'] = [line for line in garment['limits'] if not line.startswith('Fit verified only for')]
    release['limits'].insert(0, 'CPU fit checked for this exact 1K skin body and original raw skeleton.')
    bound = reader.equipment(release, TARGET_SHA, after.glb, '')
    path = reader.url(release['url'])
    model = GLB(reader.pin(path, release['sha256'], release['bytes']))
    stream_proof = []
    for mesh in model.doc['meshes']:
        for prim in mesh['primitives']:
            attrs = prim['attributes']
            require('TEXCOORD_0' in attrs, 'Missing source garment UV')
            streams = dict(indices=prim['indices'], **attrs)
            stream_proof.append({key: digest(json_bytes(model.accessor(index))) for key, index in streams.items()})
    asset = {**bound, 'fitId': release['fitId'], 'parentId': garment['id'],
             'glbSha256': release['sha256'], 'bytes': release['bytes'], 'primitiveStreams': stream_proof}
    if role == 'shoes':
        sole_y = min(y for mesh in model.doc['meshes'] for p in mesh['primitives']
                     for _, y, _ in model.accessor(p['attributes']['POSITION']))
        require(abs(sole_y - source_floor) < 1e-7, 'Original sole and body floor differ')
        asset.update(rawSoleMinY=sole_y, sourceFloorY=source_floor)
    return release, asset


def build(input_root, candidate):
    require(digest(candidate) == TARGET_SHA, 'Expected exact reviewed texture body SHA')
    reader = Validator(input_root)
    parent, source_proof, garments, witnesses = read_parent(reader)
    old, new = BodyReadback(reader.pin(TARGET, PARENT_SHA)), BodyReadback(candidate)
    body_proof = prove_body(old, new, source_proof)
    items, fits = [], {}
    for role in ROLE_IDS:
        source_id = parent['ids'][role]
        item, fits[role] = equipment_fit(reader, garments[source_id], role, old, new, witnesses[source_id],
                                         parent['sourceFloorY'])
        items.append(item)
    require(fits['top']['primitiveStreams'] == fits['topFar']['primitiveStreams'],
            '1K top geometry, binding or UV differs from original top')
    catalog = json_bytes({'schema': 'zbgs-equipment-v1', 'items': items})
    profile = dict(parent, id=PROFILE_ID, label='CC0 男制服 · 身体肤色 1K',
                   workbenchLabel='身体肤色 1K · 两套制服候选',
                   source='Base_Male / stripped VRM0 with 1K opaque body base color',
                   url=ASSET_URL + '/body.vrm', sha256=TARGET_SHA,
                   manifestUrl=ASSET_URL + '/equipment.json', manifestSha256=digest(catalog),
                   ids=ROLE_IDS, fitStatus='两件上衣、长裤与平底鞋已对该身体核对原始蒙皮和几何。普通机性能待测。')
    del profile['additionalEquipmentManifests']
    report = {'schema': 'cc0-texture-body-outfit-fit-v1', 'bodyType': PROFILE_ID,
              'sourceBodySha256': PARENT_SHA, 'targetBodySha256': TARGET_SHA, 'bodyProof': body_proof,
              'fits': fits, 'outfits': [['top', 'shoes', 'pants'], ['topFar', 'shoes', 'pants']],
              'manifestSha256': digest(catalog), 'inputs': reader.observed,
              'scope': 'Exact CPU surface, geometry, raw rest and outfit fit. Motion, live contact and device performance require game evidence.'}
    return {'body.vrm': candidate, 'equipment.json': catalog, 'profile.json': json_bytes({PROFILE_ID: profile})}, json_bytes(report)


def checked_path(path):
    actual = project_output(path, __file__)
    require(actual == Path(os.path.abspath(path)), 'Redirected fit output: ' + str(path))
    return actual


def run(input_root, candidate, stage, check):
    names = ('body.vrm', 'equipment.json', 'profile.json')
    targets = [checked_path(stage / name) for name in names]
    report = checked_path(REPORT)
    files, proof = build(input_root.resolve(), candidate.read_bytes())
    writer = load_script('texture_fit_stage', 'scripts/native-vroid-equipment-extract.py')
    outputs = [(path, files[path.name]) for path in targets] + [(report, proof)]
    for path, raw in outputs:
        if check or path.exists():
            writer.write_outputs({path.name: raw}, path.parent, check=True)
    if not check:
        writer.write_outputs(files, checked_path(stage))
        writer.write_outputs({report.name: proof}, checked_path(report.parent))
    return {name: digest(raw) for name, raw in files.items()}


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--input-root', type=Path, default=ROOT)
    cli.add_argument('--candidate', type=Path, default=BODY)
    cli.add_argument('--output', type=Path, default=STAGE)
    cli.add_argument('--check', action='store_true')
    args = cli.parse_args()
    print(json.dumps(run(args.input_root, args.candidate, args.output, args.check)))
