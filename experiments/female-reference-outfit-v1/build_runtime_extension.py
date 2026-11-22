from pathlib import Path
import copy, hashlib, json, math

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'prototype/public/assets/female-reference-outfit-v1'
OUT.mkdir(parents=True, exist_ok=True)

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def srgb_to_linear(value):
    value /= 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

body_sha = sha(ROOT / 'prototype/public/assets/foundation/base-female-roundtrip.vrm')
base = read_json(ROOT / 'prototype/public/assets/m1/equipment.json')
basecolor = read_json(ROOT / 'prototype/public/assets/garment-basecolor-release-v1/female/equipment.json')
vest = read_json(ROOT / 'prototype/public/assets/m2-vest-layer-fit-v1/female/equipment.json')
sources = {
    'referenceInner': (next(x for x in basecolor['items'] if x['id'] == 'm1-female-uniform-top-1k-v1'), 'female-reference-cream-inner-top-v1', '#F2E2D1'),
    'referenceOuter': (next(x for x in vest['items'] if x['id'] == 'm2-vest-layer-fit-v1-female-top'), 'female-reference-lavender-outer-v1', '#C5B0D8'),
    'referencePants': (next(x for x in base['items'] if x['id'] == 'm1-training-pants'), 'female-reference-taupe-straight-pants-v1', '#8A7A70'),
    'referenceShoes': (next(x for x in base['items'] if x['id'] == 'm1-uniform-shoes'), 'female-reference-beige-low-heel-shoes-v1', '#E7D5BF'),
}

def source_path(entry):
    url = entry['url']
    if url.startswith('/assets/'):
        return ROOT / 'prototype/public' / url.lstrip('/')
    return ROOT / 'prototype/public/assets/m1' / url

def glb_material_names(path):
    data = path.read_bytes()
    cursor = 12
    while cursor < len(data):
        length = int.from_bytes(data[cursor:cursor + 4], 'little')
        kind = int.from_bytes(data[cursor + 4:cursor + 8], 'little')
        chunk = data[cursor + 8:cursor + 8 + length]
        cursor += 8 + length
        if kind == 0x4E4F534A:
            return [item.get('name') for item in json.loads(chunk.decode('utf-8')).get('materials', [])]
    raise RuntimeError(f'GLB JSON chunk missing: {path}')

def recipe(entry, recipe_id, color, slot):
    path = source_path(entry)
    rgb = [srgb_to_linear(int(color[i:i + 2], 16)) for i in (1, 3, 5)]
    implementation = {
        'id': 'garment-color-v1' if slot == 'referencePants' else 'cloth-normal-v4-review1',
        'sha256': '5de06e910432f1bb9284aa321d40949da2eb3e94629ea95202912b9adfb9999c' if slot == 'referencePants' else '4539ac3f83bc5fb1fa9aa91dbfb7323a8f2e7084a5f762d9713d0ae36bcfb565',
        'threeRevision': '187',
    }
    recipe_value = {
        'schema': 'zbgs-garment-material-recipe-v1',
        'id': recipe_id,
        'version': 1,
        'status': 'candidate-reference-outfit-v1',
        'fit': {
            'equipmentId': entry['id'],
            'garmentSha256': sha(path),
            'avatarSha256': body_sha,
            'fitId': entry['fitId'],
            'styleId': entry['styleId'],
        },
        'implementation': implementation,
        'materialNames': glb_material_names(path),
        'settings': {'linearColor': rgb, 'fabricStart': [0.0, 0.98]},
        'preserves': ['source GLB geometry, UV, weights, bindings and alpha', 'original material restore on outfit exit'],
        'limits': [
            'Reference color is a runtime material candidate, not a source texture repaint.',
            'This recipe is pinned to the exact female base body and source garment fit.',
            'Outer shape remains the existing vest-layer technical candidate.',
        ],
    }
    out = OUT / 'recipes' / f'{recipe_id}.json'
    write_json(out, recipe_value)
    return {'id': recipe_id, 'url': f'/assets/female-reference-outfit-v1/recipes/{out.name}', 'sha256': sha(out), 'bytes': out.stat().st_size}

items = []
for role, (source, style_id, color) in sources.items():
    item = copy.deepcopy(source)
    item['id'] = style_id
    item['styleId'] = style_id
    item['fitId'] = style_id + '-fit-v1'
    item['url'] = '/assets/' + source_path(source).relative_to(ROOT / 'prototype/public/assets').as_posix()
    item['compatibleAvatarSha256'] = body_sha
    item['sourceSpec'] = f'assets-source/female-reference-outfit-v1/{role}/recipe.json'
    # The existing vest descriptor names the original item. This extension owns
    # its own body-coverage descriptor, so the alias has no stale layer pair.
    item.pop('layerFitResource', None)
    if role == 'referenceOuter':
        item['slot'] = 'outerwear'
        item['layerWith'] = ['female-reference-cream-inner-top-v1']
        item['allowedBottoms'] = ['female-reference-taupe-straight-pants-v1']
    item['materialRecipes'] = [recipe(item, style_id + '-cloth-v1', color, role)]
    items.append(item)

manifest = {
    'schema': 'zbgs-equipment-v1',
    'id': 'female-reference-outfit-v1',
    'status': 'candidate-runtime-preview',
    'compatibleAvatarSha256': body_sha,
    'items': items,
    'limits': [
        'Preview-only candidate. The outer shape is a vest-layer source, not a verified cardigan.',
        'Pants remain the existing knee-length training-pants fit.',
        'Shoes remain the existing flat-shoe fit. Low-heel geometry is not authored.',
        'Normal-speed motion, sitting and ordinary-PC budget remain pending admission.',
    ],
}
write_json(OUT / 'equipment.json', manifest)

coverage = read_json(ROOT / 'prototype/public/assets/m2-vest-body-coverage-v1/female/coverage-fit.json')
coverage['id'] = 'female-reference-lavender-outer-v1-body-coverage-v1'
coverage['topId'] = 'female-reference-lavender-outer-v1'
coverage['topSha256'] = items[1]['sha256']
coverage['status'] = 'candidate-reference-outfit-v1; runtime and exposed-boundary validation pending'
write_json(OUT / 'outer-body-coverage.json', coverage)

receipt = {
    'schema': 'female-reference-outfit-runtime-extension-v1',
    'bodySha256': body_sha,
    'manifest': {'url': '/assets/female-reference-outfit-v1/equipment.json', 'sha256': sha(OUT / 'equipment.json')},
    'coverage': {'url': '/assets/female-reference-outfit-v1/outer-body-coverage.json', 'sha256': sha(OUT / 'outer-body-coverage.json')},
    'items': [{'role': role, 'id': item['id'], 'sha256': item['sha256'], 'materialRecipe': item['materialRecipes'][0]} for role, item in zip(sources, items)],
    'status': 'candidate-runtime-preview',
}
write_json(OUT / 'build-receipt.json', receipt)
print(json.dumps(receipt, ensure_ascii=False, indent=2))
