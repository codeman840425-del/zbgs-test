"""Produce the exact female VRM0 1K skin and 512px metadata preview for offline evaluation."""

import argparse
import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

from asset_budget import budget_config
from cc0_body_basecolor_release import model_cost, png_facts, validate_image_storage, verify_alignment
from flow import ROOT, require
from garment_basecolor_release import OPERATION as COLOR_OPERATION, half_png
from garment_source_mapping import json_bytes
from native_accessory_batch import load_script
from native_import import confined, digest, embedded_glb
from native_mesh_budget import encode
from native_release_textures import splice, verify_unchanged, view_payload
from native_uniform_normal import entries
from production_paths import project_output
from stripped_outfit_body import pointers
from stripped_outfit_equipment import BodyReadback


SPEC = Path(__file__).with_name('vrm0-female-texture-release-v1.json')
OUTPUT = ROOT / 'output/m2-female-body-release-candidate'
SOURCE_SHA = '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'


def named_targets(doc):
    face = doc['meshes'][1]
    names = face.get('extras', {}).get('targetNames', [])
    require(len(names) == 56 and all(type(n) is str and n for n in names) and len(set(names)) == len(names),
            'Expected 56 distinct ordered face morph names')
    allowed = {('meshes', 1, 'extras')}
    for i, part in enumerate(face['primitives']):
        require(part.get('extras') == {'targetNames': names} and len(part['targets']) == len(names),
                'Primitive morph name/order or target count differs')
        allowed.add(('meshes', 1, 'primitives', i, 'extras'))
    actual = {path for path, value in entries(doc) if path[-1] == 'extras'}
    require(actual == allowed and face['extras'] == {'targetNames': names}, 'Unreviewed extras reference')
    groups = doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']
    for group in groups:
        for bind in group['binds']:
            require(bind['mesh'] == 1 and type(bind['index']) is int and 0 <= bind['index'] < len(names),
                    'Unknown face morph binding')
    return {'mesh': 1, 'targetNamesSha256': digest(json_bytes(names)), 'names': len(names),
            'primitives': len(face['primitives']), 'expressionGroups': len(groups)}


def spring_references(doc):
    anim = doc['extensions']['VRM']['secondaryAnimation']
    springs, colliders = anim['boneGroups'], anim['colliderGroups']
    require(len(springs) == len(colliders) == 2, 'Unexpected spring or collider groups')
    def valid_index(value, rows):
        return type(value) is int and 0 <= value < len(rows)
    for row in springs:
        require(all(valid_index(n, doc['nodes']) for n in [row['center'], *row['bones']])
                and all(valid_index(c, colliders) for c in row['colliderGroups']), 'Invalid spring node or collider reference')
    require(all(valid_index(row['node'], doc['nodes']) for row in colliders), 'Invalid collider node')
    return {'springGroups': len(springs), 'colliderGroups': len(colliders), 'sha256': digest(json_bytes(anim))}


def inspect_document(doc, spec):
    vrm = doc['extensions']['VRM']
    require(vrm['specVersion'] == '0.0' and set(doc['extensionsUsed']) == {'VRM', 'KHR_materials_unlit'}
            and all(set(value) <= {'VRM', 'KHR_materials_unlit'} for p, value in entries(doc)
                    if p[-1] == 'extensions'), 'Unreviewed extension')
    morphs, springs = named_targets(doc), spring_references(doc)
    body, thumbnail = spec['bodyColor'], spec['thumbnail']
    meta = vrm['meta']
    for pin in (body, thumbnail):
        ti, ii, vi = pin['texture'], pin['image'], pin['view']
        require([i for i, row in enumerate(doc['textures']) if row['source'] == ii] == [ti],
                'Expected exactly one texture for this image')
        require(doc['images'][ii]['mimeType'] == 'image/png' and doc['images'][ii]['bufferView'] == vi
                and [p for p, v in entries(doc) if p[-1] == 'bufferView' and v == vi] == [('images', ii, 'bufferView')],
                'Image storage is shared or is not an embedded PNG')
    def uses(texture):
        return {(id(obj), key) for obj, key in pointers(doc, 'textures') if obj[key] == texture}
    require(meta['texture'] == thumbnail['texture'] and uses(thumbnail['texture']) == {(id(meta), 'texture')},
            'Thumbnail has a material or other consumer')
    mi, ti = body['material'], body['texture']
    mat, legacy = doc['materials'][mi], vrm['materialProperties'][mi]
    base = mat['pbrMetallicRoughness']['baseColorTexture']
    shade = legacy['textureProperties']
    require(mat['name'] == legacy['name'] == body['materialName'] and base['index'] == ti
            and base.get('texCoord', 0) == 0 and set(base) <= {'index', 'texCoord'}, 'Wrong body material or UV')
    require(uses(ti) == {(id(base), 'index'), (id(shade), '_MainTex'), (id(shade), '_ShadeTexture')},
            'Body color has a consumer outside the three reviewed slots')
    refs = [(ni, node['mesh'], i, p) for ni, node in enumerate(doc['nodes']) if 'mesh' in node
            for i, p in enumerate(doc['meshes'][node['mesh']]['primitives']) if p['material'] == mi]
    require([(ni, mesh, i) for ni, mesh, i, _ in refs] == [(83, 0, 0)] and 'TEXCOORD_0' in refs[0][3]['attributes'],
            'Expected exact skinned body primitive and UV0')
    require(mat['alphaMode'] == 'MASK' and mat['alphaCutoff'] == legacy['floatProperties']['_Cutoff'] == .5
            and legacy['keywordMap']['_ALPHATEST_ON'] and mat['pbrMetallicRoughness']['baseColorFactor'][3] ==
            legacy['vectorProperties']['_Color'][3] == 1, 'Changed body alpha semantics')
    # This exporter has sparse optional VRM0 and glTF fields. Freeze the complete
    # examined document so future unknown references cannot escape the slot walk.
    canonical = json.dumps(doc, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    require(digest(canonical) == spec['sourceDocumentSha256'], 'Unreviewed source document or reference')
    return {'morphs': morphs, 'secondaryAnimation': springs, 'bodyPrimitive': [83, 0, 0],
            'bodyConsumers': ['pbrMetallicRoughness.baseColorTexture', 'VRM._MainTex', 'VRM._ShadeTexture'],
            'bodyUvSet': 0, 'bodyAlphaMode': 'MASK', 'thumbnailConsumers': ['VRM.meta.texture']}


def preview_png(raw):
    with Image.open(io.BytesIO(raw)) as image:
        require(image.format == 'PNG' and image.mode == 'RGBA' and image.size == (2048, 2048)
                and not image.is_animated and not image.info, 'Expected the original plain RGBA preview')
        small = image.resize((512, 512), Image.Resampling.LANCZOS)
    result = io.BytesIO()
    small.save(result, format='PNG', compress_level=9)
    with Image.open(io.BytesIO(result.getvalue())) as reread:
        require(reread.mode == small.mode and reread.size == small.size and reread.tobytes() == small.tobytes(),
                'Thumbnail resized pixels did not round trip')
    return result.getvalue()


def derive(raw, spec):
    require(spec['schema'] == 'vrm0-female-opaque-skin-and-preview-v1'
            and digest(raw) == spec['sourceSha256'] == SOURCE_SHA, 'Wrong pinned female source')
    doc, binary = embedded_glb(raw)
    proof = inspect_document(doc, spec)
    initial, payload = doc, binary
    replacements, images = {}, {}
    for key, operation, convert in [('bodyColor', COLOR_OPERATION, half_png),
                                    ('thumbnail', 'rgba-pillow-lanczos-png-level9', preview_png)]:
        pin = spec[key]
        require(pin['operation'] == operation, 'Unknown image operation')
        view = pin['view']
        validate_image_storage(initial, payload, view)
        src = view_payload(payload, initial['bufferViews'][view])
        require(digest(src) == pin['originalPngSha256'], 'Wrong source PNG: ' + key)
        replacements[view] = dst = convert(src)
        require(digest(dst) == pin['derivedPngSha256'], 'Wrong derived PNG: ' + key)
        next_doc, next_bin = splice(initial, payload, {view: dst})
        aligned = verify_alignment(initial, next_doc, view)
        before, after = png_facts(src), png_facts(dst)
        require(before['size'] == pin['from'] and after['size'] == pin['to'], 'Wrong image dimensions')
        images[key] = {'before': before, 'after': after, 'alignment': aligned}
        initial, payload = next_doc, next_bin
    candidate = encode(initial, payload)
    target, new_binary = embedded_glb(candidate)
    require(digest(candidate) == spec['targetSha256'], 'Wrong derived body SHA')
    proof['storage'] = verify_unchanged(doc, binary, target, new_binary, replacements)
    old, new = BodyReadback(raw), BodyReadback(candidate)
    signatures = []
    for i in range(len(doc['accessors'])):
        original = old.stream(i)
        require(original == new.stream(i), f'Accessor {i} changed after reload')
        signatures.append(original)
    proof.update(accessors=len(signatures), accessorSignaturesSha256=digest(json_bytes(signatures)),
                 unchangedImageCount=len(doc['images']) - len(replacements), images=images)
    return candidate, proof


def checked(path):
    target = project_output(path, __file__)
    require(target == Path(os.path.abspath(path)), 'Redirected production output')
    return target


def build(root, output, check):
    out = checked(output)
    for name in ['body.vrm', 'report.json']:
        checked(out / name)
    spec = json.loads(SPEC.read_bytes())
    source = confined(root, spec['source'])
    candidate, proof = derive(source.read_bytes(), spec)
    config = budget_config(ROOT / 'scripts/production/asset-budgets-v1.json', 'm2-technical-v1')
    before = model_cost(source, 'body', config)
    if not check:
        out.mkdir(parents=True, exist_ok=True)
    if check:
        require((out / 'body.vrm').read_bytes() == candidate, 'Published candidate differs')
        after = model_cost(out / 'body.vrm', 'body', config)
    else:
        with TemporaryDirectory(dir=out, prefix='.budget-') as temp:
            trial = checked(Path(temp) / 'body.vrm')
            trial.write_bytes(candidate)
            after = model_cost(trial, 'body', config)
    require(before['sha256'] == SOURCE_SHA and after['sha256'] == spec['targetSha256']
            and all(before['metrics'][k] == after['metrics'][k]
                    for k in before['metrics'].keys() - {'fileBytes', 'rgba8MipBytes'}), 'Unrelated asset metric changed')
    report = {'schema': spec['schema'], 'source': spec['source'], 'sourceSha256': SOURCE_SHA,
              'targetSha256': spec['targetSha256'], 'budgetVersion': config['version'], 'budget': {'before': before, 'after': after},
              'productionReadback': proof, 'sourceReferences': spec['sourceReferences'], 'scope': 'Offline exact body and metadata preview only.',
              'fitRegistered': False, 'runtimeChecked': False, 'ordinaryPCPerformance': 'unmeasured'}
    report_bytes = (json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()
    writer = load_script('female_body_texture_publish', 'scripts/native-vroid-equipment-extract.py')
    writer.write_outputs({'body.vrm': candidate, 'report.json': report_bytes}, out, check=check)
    return report


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--input-root', type=Path, default=ROOT)
    cli.add_argument('--output', type=Path, default=OUTPUT)
    cli.add_argument('--check', action='store_true')
    args = cli.parse_args()
    report = build(args.input_root.resolve(), args.output, args.check)
    print(json.dumps({'bodySha256': report['targetSha256'], 'budget': report['budget']['after']['status']}))
