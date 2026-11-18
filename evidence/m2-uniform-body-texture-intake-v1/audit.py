"""Inspect only the two SHA-pinned published VRM0 bodies. PNG trials use memory and never build a model."""

import argparse
from collections import defaultdict
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import zlib

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/production'))
from asset_budget import AssetCost, budget_config, check, ref
from flow import require
from native_import import digest
from native_texture_cost import pixels, primitive_refs, texture_slots
from stripped_outfit_body import physical

COMMIT = '80fb16b7c6df3a7c85724c757969c6e3e6fb2b2c'
FIXED = ROOT / 'experiments/worktrees/garment-80fb16b7-repeat'
CASES = {
    'female': (
        'foundation/base-female-roundtrip.vrm',
        '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',
    ),
    'male': (
        'source-outfit-release-v1/body.vrm',
        'cf1118a2a8d8fca8ccc094e51d051f660ec12ffdbdda4c8ecaad407b55cef9d4',
    ),
}


def png_probe(raw):
    p = 8
    require(raw.startswith(b'\x89PNG\r\n\x1a\n'), 'Expected PNG')
    chunks = []
    while p < len(raw):
        length, kind = struct.unpack_from('>I4s', raw, p)
        chunks.append(kind)
        p += 12 + length
    require(
        p == len(raw)
        and chunks[0] == b'IHDR'
        and chunks[-1] == b'IEND'
        and set(chunks) == {b'IHDR', b'IDAT', b'IEND'},
        'Unreviewed PNG chunks',
    )
    rgba, facts = pixels(raw)
    a = np.asarray(rgba)
    with Image.open(io.BytesIO(raw)) as src:
        require(
            src.mode in ('RGB', 'RGBA') and raw[24] == 8 and not src.info, 'Unreviewed PNG interpretation'
        )
        out = io.BytesIO()
        src.save(out, format='PNG', compress_level=9)
        encoded = out.getvalue()
        with Image.open(io.BytesIO(encoded)) as restored:
            require(
                restored.mode == src.mode
                and restored.size == src.size
                and restored.tobytes() == src.tobytes(),
                'Changed decoded image',
            )
    return {
        **facts,
        'constantX': bool(np.all(a[:, 1:] == a[:, :-1])),
        'constantY': bool(np.all(a[1:] == a[:-1])),
        'losslessReencodedBytes': len(encoded),
        'losslessReencodedSha256': digest(encoded),
    }


def inspect(path, sha, config):
    cost = AssetCost(path)
    require(digest(cost.raw) == sha, 'Wrong published body')
    doc = cost.doc
    vrm = doc['extensions']['VRM']
    require(
        set(doc['extensions']) == {'VRM'}
        and vrm['specVersion'] == '0.0'
        and set(doc['extensionsUsed']) == {'VRM', 'KHR_materials_unlit'},
        'Expected inspected VRM0 layout',
    )
    meter = check(path, 'body', config)
    uses = defaultdict(lambda: defaultdict(list))
    placements = primitive_refs(doc)
    materials = {}
    for i, (m, v) in enumerate(zip(doc['materials'], vrm['materialProperties'], strict=True)):
        require(m['name'] == v['name'], 'Unmatched VRM0 material')
        materials[i] = {
            'name': m['name'],
            'alphaMode': m.get('alphaMode', 'OPAQUE'),
            'alphaCutoff': m.get('alphaCutoff'),
            'scenePrimitives': [[r['node'], r['mesh'], r['primitive']] for r in placements[i]],
        }
        for slot, info in texture_slots(m):
            require(
                info.get('texCoord', 0) == 0 and not info.get('extensions'),
                'Unreviewed glTF texture transform',
            )
            uses[info['index']]['.'.join(slot)].append(i)
        for slot, t in v['textureProperties'].items():
            require(
                slot
                in {
                    '_MainTex',
                    '_ShadeTexture',
                    '_BumpMap',
                    '_EmissionMap',
                    '_SphereAdd',
                    '_OutlineWidthTexture',
                },
                'Unreviewed VRM0 texture channel',
            )
            if t != -1:
                uses[t]['VRM.' + slot].append(i)
    for ti in uses:
        ref(doc['textures'], ti, 'texture reference')
    texture_defs = defaultdict(list)
    thumb = vrm['meta']['texture']
    ref(doc['textures'], thumb, 'VRM0 thumbnail')
    for ti, tex in enumerate(doc['textures']):
        ref(doc['images'], tex['source'], 'texture source')
        sampler = ref(doc['samplers'], tex['sampler'], 'texture sampler')
        require(
            sampler == {'magFilter': 9729, 'minFilter': 9729, 'wrapS': 10497, 'wrapT': 10497},
            'Unexpected sampler',
        )
        texture_defs[tex['source']].append(
            {'index': ti, 'sampler': tex['sampler'], 'VRM0Thumbnail': ti == thumb, 'channels': dict(uses[ti])}
        )
    images = []
    for row in meter['images']:
        i = row['index']
        image = doc['images'][i]
        view = image['bufferView']
        data = cost.view_bytes(view)
        require(row['sha256'] == digest(data), 'Budget image mismatch')
        images.append(
            {
                'index': i,
                'name': image.get('name'),
                'view': view,
                'offset': doc['bufferViews'][view].get('byteOffset', 0),
                'size': [row['width'], row['height']],
                'encodedBytes': len(data),
                'sha256': digest(data),
                'rgba8MipBytes': row['rgba8MipBytes'],
                'textures': texture_defs[i],
                **png_probe(data),
            }
        )
    groups = vrm['blendShapeMaster']['blendShapeGroups']
    pairs = [
        {
            'name': g['name'],
            'preset': g['presetName'],
            'binds': g.get('binds', []),
            'materialValues': g.get('materialValues', []),
        }
        for g in groups
    ]
    bound = sum(im['rgba8MipBytes'] * len(im['textures']) for im in images)
    require(bound == meter['metrics']['rgba8MipBytes'], 'Texture definition accounting mismatch')
    constants = sum(
        (im['rgba8MipBytes'] - 4) * len(im['textures']) for im in images if im['constantRgba'] is not None
    )
    return {
        'sha256': sha,
        'bytes': len(cost.raw),
        'samplerParameters': doc['samplers'][0],
        'uniqueSamplerParameterSets': len({json.dumps(s, sort_keys=True) for s in doc['samplers']}),
        'materials': materials,
        'expressions': pairs,
        'images': images,
        'bodyRgba8MipBytes': bound,
        'violations': meter['violations'],
        'allConstantTo1x1SavingBytes': constants,
        'pngEncodedPayloadSavingBytes': sum(
            max(0, im['encodedBytes'] - im['losslessReencodedBytes']) for im in images
        ),
    }


def run():
    require(
        subprocess.check_output(['git', '-C', str(FIXED), 'rev-parse', 'HEAD'], text=True).strip() == COMMIT,
        'Wrong fixed checkout',
    )
    budget_rel = 'scripts/production/asset-budgets-v1.json'
    cfg = physical(ROOT / budget_rel)
    require(
        cfg.read_bytes()
        == subprocess.check_output(['git', '-C', str(FIXED), 'show', COMMIT + ':' + budget_rel]),
        'Budget definitions differ from fixed commit',
    )
    config = budget_config(cfg, 'm2-technical-v1')
    repeat = physical(FIXED / 'prototype/public/assets')
    bodies = {}
    duplicates = defaultdict(list)
    pixel_duplicates = defaultdict(list)
    for key, (rel, sha) in CASES.items():
        body = inspect(physical(repeat / rel), sha, config)
        body['url'] = '/assets/' + rel
        bodies[key] = body
        for row in body['images']:
            duplicates[row['sha256']].append([key, row['index']])
            pixel_duplicates[row['rgba8PixelSha256']].append([key, row['index']])
    return {
        'schema': 'uniform-vrm0-body-texture-intake-v1',
        'sourceCommit': COMMIT,
        'budgetVersion': config['version'],
        'limitRgba8MipBytes': config['classes']['body']['rgba8MipBytes'],
        'pillow': Image.__version__,
        'zlib': zlib.ZLIB_RUNTIME_VERSION,
        'bodies': bodies,
        'duplicateEncodedPng': {k: v for k, v in duplicates.items() if len(v) > 1},
        'duplicateRgba8AtEqualSize': {k: v for k, v in pixel_duplicates.items() if len(v) > 1},
    }


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--check', action='store_true')
    args = cli.parse_args()
    result = (
        json.dumps(run(), ensure_ascii=False, separators=(',', ':'), sort_keys=True, allow_nan=False) + '\n'
    )
    if args.check:
        require(
            result.encode() == physical(Path(__file__).with_name('report.json')).read_bytes(),
            'Saved audit differs',
        )
        print('Matched both image/material inventories and lossless PNG probes.')
    else:
        sys.stdout.buffer.write(result.encode())
