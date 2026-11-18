"""Build the source-outfit VRM0 body by pruning only dependencies exclusive to four mapped primitives."""

import argparse
import copy
import json
import os
from pathlib import Path
import stat
import subprocess
from tempfile import TemporaryDirectory

from asset_budget import budget_config, check, ref
from flow import ROOT, require
from native_accessory_batch import load_script
from native_import import confined, digest, embedded_glb
from native_mesh_budget import encode

EVIDENCE = ROOT / 'evidence/m2-source-outfit-release-v1/body'
RECIPE = EVIDENCE / 'recipe.json'
REPORT = EVIDENCE / 'report.json'
TARGET = ROOT / 'prototype/public/assets/source-outfit-release-v1/body.vrm'
TABLES = ('materials', 'textures', 'images', 'samplers', 'accessors', 'bufferViews')
FIELDS = {
    'accessors': {'byteOffset', 'bufferView', 'min', 'max', 'componentType', 'type', 'count', 'normalized'},
    'bufferViews': {'buffer', 'byteOffset', 'byteLength', 'target', 'byteStride'},
    'textures': {'source', 'sampler'},
    'images': {'mimeType', 'bufferView', 'name'},
    'meshes': {'name', 'primitives'},
    'skins': {'joints', 'skeleton', 'inverseBindMatrices'},
    'nodes': {'skin', 'mesh', 'children', 'name', 'translation', 'rotation', 'scale', 'matrix'},
    'materials': {
        'name',
        'pbrMetallicRoughness',
        'normalTexture',
        'emissiveTexture',
        'emissiveFactor',
        'doubleSided',
        'alphaMode',
        'alphaCutoff',
        'extensions',
    },
    'samplers': {'minFilter', 'magFilter', 'wrapS', 'wrapT'},
    'scenes': {'nodes'},
}


def physical(path):
    """Validate lexical and physical paths, including an existing or dangling reparse-point leaf."""
    require(path.is_absolute() and path.is_relative_to(ROOT) and '..' not in path.parts, 'Outside checkout')
    require(path.resolve() == path, f'Redirected path: {path}')
    for part in [path, *path.parents]:
        try:
            info = part.lstat()
        except FileNotFoundError:
            continue
        require(
            not stat.S_ISLNK(info.st_mode)
            and not getattr(info, 'st_file_attributes', 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT,
            f'Redirected path component: {part}',
        )
    return path


def check_checkout():
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith('GIT_')}

    def git(*args):
        return subprocess.check_output(['git', *args], cwd=ROOT, env=env)

    main_record = git('worktree', 'list', '--porcelain', '-z').split(b'\0', 1)[0]
    require(main_record.startswith(b'worktree '), 'Missing main checkout')
    main = Path(os.fsdecode(main_record.removeprefix(b'worktree '))).resolve(strict=True)
    top = Path(os.fsdecode(git('rev-parse', '--show-toplevel').strip())).resolve(strict=True)
    require(
        ROOT == top and (ROOT == main or ROOT.is_relative_to(main / 'experiments')),
        'Release checkout is outside the main project',
    )


def input_path(name):
    confined(ROOT, name)
    return physical(ROOT / name)


def pinned(pin):
    raw = input_path(pin['path']).read_bytes()
    require(digest(raw) == pin['sha256'], 'Changed input: ' + pin['path'])
    return raw


def validate_profile(doc):
    require(
        set(doc)
        <= set(FIELDS) | {'asset', 'buffers', 'scene', 'extensionsUsed', 'extensionsRequired', 'extensions'},
        'Unsupported source tables or top-level data',
    )
    require(
        doc['asset']['version'] == '2.0'
        and set(doc['extensions']) == {'VRM'}
        and set(doc['extensionsUsed']) == {'VRM', 'KHR_materials_unlit'}
        and set(doc.get('extensionsRequired', [])) <= {'VRM', 'KHR_materials_unlit'},
        'Expected source VRM0 extensions',
    )
    require(
        len(doc['buffers']) == 1 and set(doc['buffers'][0]) == {'byteLength'}, 'Expected one embedded buffer'
    )
    for table, allowed in FIELDS.items():
        for i, item in enumerate(doc[table]):
            require(set(item) <= allowed, f'Unsupported {table}[{i}] fields: {set(item) - allowed}')
    vrm = doc['extensions']['VRM']
    require(
        vrm['specVersion'] == '0.0'
        and set(vrm)
        <= {
            'exporterVersion',
            'specVersion',
            'meta',
            'humanoid',
            'firstPerson',
            'blendShapeMaster',
            'secondaryAnimation',
            'materialProperties',
        },
        'Unreviewed VRM0 feature',
    )
    require(
        set(vrm['meta'])
        <= {
            'version',
            'author',
            'contactInformation',
            'reference',
            'title',
            'texture',
            'allowedUserName',
            'violentUssageName',
            'sexualUssageName',
            'commercialUssageName',
            'otherPermissionUrl',
            'licenseName',
            'otherLicenseUrl',
        },
        'Unreviewed VRM0 metadata reference',
    )
    require(
        set(vrm['firstPerson'])
        <= {
            'firstPersonBone',
            'firstPersonBoneOffset',
            'meshAnnotations',
            'lookAtTypeName',
            'lookAtHorizontalInner',
            'lookAtHorizontalOuter',
            'lookAtVerticalDown',
            'lookAtVerticalUp',
        }
        and set(vrm['blendShapeMaster']) == {'blendShapeGroups'},
        'Unreviewed first-person or blendshape data',
    )
    # The fixed publisher export contains no simulated springs. Do not infer support for other rigs.
    require(
        vrm['secondaryAnimation'] == {'boneGroups': [], 'colliderGroups': []},
        'Unreviewed dynamic configuration',
    )
    require(len(vrm['materialProperties']) == len(doc['materials']), 'VRM0 material table order differs')
    for material, legacy in zip(doc['materials'], vrm['materialProperties'], strict=True):
        require(
            material['name'] == legacy['name']
            and material.get('extensions', {}) in ({}, {'KHR_materials_unlit': {}}),
            'Unexpected VRM0 material pairing or extension',
        )
        require(
            set(legacy)
            <= {
                'name',
                'renderQueue',
                'shader',
                'floatProperties',
                'vectorProperties',
                'textureProperties',
                'keywordMap',
                'tagMap',
            },
            'Unreviewed VRM0 materialProperties field',
        )
        pbr = material.get('pbrMetallicRoughness', {})
        require(
            set(pbr)
            <= {
                'baseColorTexture',
                'baseColorFactor',
                'metallicFactor',
                'roughnessFactor',
                'metallicRoughnessTexture',
            },
            'Unknown PBR dependency',
        )
        for value in list(material.values()) + list(pbr.values()):
            if isinstance(value, dict) and 'index' in value:
                require(
                    set(value) <= {'index', 'texCoord', 'scale', 'strength'},
                    'Unknown texture reference extension',
                )
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            require(
                set(p) <= {'attributes', 'indices', 'material', 'targets', 'mode', 'extras'}
                and p.get('mode', 4) == 4
                and set(p.get('extras', {})) <= {'targetNames'},
                'Unsupported primitive layout',
            )
    for annotation in vrm['firstPerson'].get('meshAnnotations', []):
        require(set(annotation) <= {'mesh', 'firstPersonFlag'}, 'Unknown first-person mesh annotation')
        ref(doc['meshes'], annotation['mesh'], 'firstPerson.mesh')
    for group in vrm['blendShapeMaster']['blendShapeGroups']:
        require(
            set(group) <= {'name', 'presetName', 'isBinary', 'binds', 'materialValues'},
            'Unreviewed blendshape group',
        )
        for bind in group.get('binds', []):
            require(set(bind) <= {'mesh', 'index', 'weight'}, 'Unknown morph binding reference')
            mesh = ref(doc['meshes'], bind['mesh'], 'blendshape.mesh')
            require(
                type(bind['index']) is int
                and bind['index'] >= 0
                and all(bind['index'] < len(p.get('targets', [])) for p in mesh['primitives']),
                'Invalid source morph target',
            )
        for binding in group.get('materialValues', []):
            require(
                set(binding) <= {'materialName', 'propertyName', 'targetValue'}
                and sum(m['name'] == binding.get('materialName') for m in doc['materials']) == 1,
                'Unresolved expression material',
            )


def pointers(doc, table):
    """Mutable references to a table from the remaining supported consumers, excluding sentinel -1."""
    if table in ('materials', 'accessors'):
        for mesh in doc['meshes']:
            for p in mesh['primitives']:
                if table == 'materials':
                    yield p, 'material'
                else:
                    yield p, 'indices'
                    for attrs in [p['attributes'], *p.get('targets', [])]:
                        for key in attrs:
                            yield attrs, key
        if table == 'accessors':
            for skin in doc['skins']:
                yield skin, 'inverseBindMatrices'
    elif table == 'textures':
        for material in doc['materials']:
            for owner in (material, material.get('pbrMetallicRoughness', {})):
                for key, value in owner.items():
                    if key.endswith('Texture'):
                        yield value, 'index'
        vrm = doc['extensions']['VRM']
        if vrm['meta'].get('texture', -1) != -1:
            yield vrm['meta'], 'texture'
        for prop in vrm['materialProperties']:
            for key, value in prop['textureProperties'].items():
                if value != -1:
                    yield prop['textureProperties'], key
    elif table in ('images', 'samplers'):
        key = 'source' if table == 'images' else 'sampler'
        for tex in doc['textures']:
            if key in tex:
                yield tex, key
    elif table == 'bufferViews':
        for row in [*doc['images'], *doc['accessors']]:
            yield row, 'bufferView'
    else:
        raise ValueError('Unknown reference table ' + table)


def view_data(doc, binary, i):
    v = ref(doc['bufferViews'], i, 'bufferView')
    start, size = v.get('byteOffset', 0), v['byteLength']
    require(
        v['buffer'] == 0 and 0 <= start and 0 < size and start + size <= len(binary), 'Invalid view range'
    )
    return binary[start : start + size]


def strip(raw, selectors):
    source, binary = embedded_glb(raw)
    validate_profile(source)
    require(0 <= len(binary) - source['buffers'][0]['byteLength'] <= 3, 'Unexpected embedded buffer length')
    doc = copy.deepcopy(source)
    removed = set()
    for s in selectors:
        owner = ref(doc['nodes'], s['node'], 'clothing owner')
        ref(doc['skins'], s['skin'], 'clothing skin')
        ref(doc['materials'], s['material'], 'clothing material')
        require(owner['mesh'] == s['mesh'] and owner['skin'] == s['skin'], 'Clothing owner differs')
        require(
            sum(n.get('mesh') == s['mesh'] for n in doc['nodes']) == 1, 'Clothing mesh has other instances'
        )
        p = ref(ref(doc['meshes'], s['mesh'], 'mesh')['primitives'], s['primitive'], 'garment primitive')
        require(
            p['material'] == s['material']
            and not p.get('targets')
            and (s['mesh'], s['primitive']) not in removed,
            'Duplicate, morphed or incorrect garment primitive',
        )
        removed.add((s['mesh'], s['primitive']))
    for mi, mesh in enumerate(doc['meshes']):
        mesh['primitives'] = [p for pi, p in enumerate(mesh['primitives']) if (mi, pi) not in removed]
        require(bool(mesh['primitives']), 'Removing a whole mesh needs separate scene/VRM review')

    maps = {}
    for table in TABLES:
        original = source[table]
        source_uses = list(pointers(source, table))
        for owner, key in source_uses:
            ref(original, owner[key], table)
        before = {d[k] for d, k in source_uses}
        uses = list(pointers(doc, table))
        after = {d[k] for d, k in uses}
        unused = before - after  # Keep pre-existing orphans unless this selection owns them.
        keep = [i for i in range(len(original)) if i not in unused]
        maps[table] = {old: new for new, old in enumerate(keep)}
        doc[table] = [doc[table][i] for i in keep]
        if table == 'materials':
            vrm = doc['extensions']['VRM']
            old_props = vrm['materialProperties']
            removed_names = {old_props[i]['name'] for i in unused}
            require(
                not any(
                    v.get('materialName') in removed_names
                    for g in vrm['blendShapeMaster']['blendShapeGroups']
                    for v in g.get('materialValues', [])
                ),
                'Expression binds a removed garment material',
            )
            vrm['materialProperties'] = [old_props[i] for i in keep]
        for owner, key in uses:
            owner[key] = maps[table][owner[key]]
    blob = bytearray()
    intervals = sorted(
        (v.get('byteOffset', 0), v.get('byteOffset', 0) + v['byteLength']) for v in source['bufferViews']
    )
    require(
        all(a[1] <= b[0] for a, b in zip(intervals, intervals[1:])),
        'Aliased buffer views need separate pruning',
    )
    for old, new in maps['bufferViews'].items():
        blob.extend(bytes(-len(blob) % 4))
        doc['bufferViews'][new]['byteOffset'] = len(blob)
        blob.extend(view_data(source, binary, old))
    doc['buffers'][0]['byteLength'] = len(blob)
    blob.extend(bytes(-len(blob) % 4))
    return encode(doc, blob), maps, removed


def verify(before, after, maps, removed):
    """Lift each retained reference back to its source index and compare complete declarations and view payloads."""
    source, old_binary = embedded_glb(before)
    target, new_binary = embedded_glb(after)
    validate_profile(target)
    thumb = target['extensions']['VRM']['meta']['texture']
    # Verify actual bytes first, before lifting numerical references in the decoded target.
    for old, new in maps['bufferViews'].items():
        require(
            view_data(source, old_binary, old) == view_data(target, new_binary, new),
            'Retained view payload changed',
        )
    for table in TABLES:
        inverse = {new: old for old, new in maps[table].items()}
        for owner, key in pointers(target, table):
            ref(target[table], owner[key], table)
            owner[key] = inverse[owner[key]]
    expected = copy.deepcopy(source)
    for mi, mesh in enumerate(expected['meshes']):
        mesh['primitives'] = [p for pi, p in enumerate(mesh['primitives']) if (mi, pi) not in removed]
    props = expected['extensions']['VRM']['materialProperties']
    expected['extensions']['VRM']['materialProperties'] = [props[i] for i in maps['materials']]
    for table in TABLES:
        expected[table] = [expected[table][i] for i in maps[table]]
    for a, b in zip(expected['bufferViews'], target['bufferViews'], strict=True):
        a['byteOffset'] = b['byteOffset']
    expected['buffers'] = target['buffers']
    require(
        expected == target, 'Retained primitive, accessor, skin, image, material or VRM0 declaration changed'
    )
    return {
        'comparedBufferViews': len(maps['bufferViews']),
        'comparedAccessors': len(maps['accessors']),
        'unchangedNodeCount': len(target['nodes']),
        'unchangedSkinCount': len(target['skins']),
        'keptEmbeddedImages': len(target['images']),
        'thumbnailTextureSource': source['extensions']['VRM']['meta']['texture'],
        'thumbnailTextureTarget': thumb,
        'blendshapeGroups': len(target['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']),
    }


def build(recipe):
    require(recipe['schema'] == 'm2-strip-exported-vrm0-garments-v1', 'Unknown body release recipe')
    source_raw = pinned(recipe['body'])
    outfit = json.loads(pinned(recipe['outfitRecipe']))
    pants = json.loads(pinned(outfit['pantsRecipe']))
    mapped = json.loads(pinned(pants['sourceMapping']))
    spec = json.loads(pinned(mapped['bodySpec']))
    publisher = json.loads(pinned(mapped['publisherReceipt']))
    pinned(mapped['sourceTerms'])
    require(
        outfit['schema'] == 'raw-vrm0-outfit-recipe-v1'
        and pants['schema'] == 'raw-vrm0-pants-recipe-v1'
        and mapped['schema'] == 'm2-garment-source-map-v1'
        and spec['schema'] == 'zbgs-m1b-source-v1',
        'Unreviewed outfit or body spec',
    )
    require(
        recipe['body'] == {'path': spec['source'], 'sha256': spec['sourceSha256']}
        and spec['sourceSha256'] == pants['bodySha256'] == publisher['vrmSHA256']
        and len(source_raw) == publisher['vrmBytes'],
        'Authoring body mismatch',
    )
    receipt = json.loads(pinned(recipe['equipmentReport']))
    manifest = json.loads(pinned(recipe['equipmentCatalog']))
    require(
        receipt['schema'] == 'raw-vrm0-outfit-cpu-readback-v1'
        and manifest['schema'] == 'zbgs-equipment-v1'
        and receipt['bodySha256'] == pants['bodySha256']
        and receipt['equipmentManifestSha256'] == recipe['equipmentCatalog']['sha256'],
        'Outfit readback differs',
    )
    sources = [
        (outfit['top'], outfit['top']['selectors']),
        (pants, [mapped['selections']['source']]),
        (outfit['shoes'], outfit['shoes']['selectors']),
    ]
    selectors = []
    for (item, entries), signed, exported, (slot, count) in zip(
        sources, receipt['items'], manifest['items'], [('top', 2), ('bottom', 1), ('shoes', 1)], strict=True
    ):
        parts = signed['selection'] if isinstance(signed['selection'], list) else [signed['selection']]
        require(
            item['id'] == exported['id'] == signed['id']
            and signed['source'] == recipe['body']
            and exported['slot'] == item['slot'] == slot
            and len(entries) == count
            and exported['compatibleAvatarSha256'] == receipt['bodySha256']
            and signed['equipment']['sha256'] == exported['sha256']
            and entries == [part['selector'] for part in parts],
            'Garment identity or selected primitives differ',
        )
        garment = (Path(recipe['equipmentCatalog']['path']).parent / exported['url']).as_posix()
        pinned({'path': garment, 'sha256': exported['sha256']})
        selectors.extend(entries)
    result, maps, removed = strip(source_raw, selectors)
    checked = verify(source_raw, result, maps, removed)
    doc, binary = embedded_glb(source_raw)
    removed_images = [
        {
            'index': i,
            'name': im['name'],
            'bytes': len(view_data(doc, binary, im['bufferView'])),
            'sha256': digest(view_data(doc, binary, im['bufferView'])),
        }
        for i, im in enumerate(doc['images'])
        if i not in maps['images']
    ]
    report = {
        'schema': 'm2-source-outfit-release-body-v1',
        'source': recipe['body'],
        'sourceBytes': len(source_raw),
        'target': TARGET.relative_to(ROOT).as_posix(),
        'targetSha256': digest(result),
        'targetBytes': len(result),
        'removedPrimitives': [list(p) for p in sorted(removed)],
        'removedImages': removed_images,
        'oldToNew': {k: [m.get(i) for i in range(len(doc[k]))] for k, m in maps.items()},
        'verified': checked,
        'runtimeAdmission': False,
    }
    return result, report


def measure(result, source):
    check_checkout()
    config = budget_config(input_path('scripts/production/asset-budgets-v1.json'), 'm2-technical-v1')
    source_path = input_path(source)

    def metrics(path):
        cost = check(path, 'body', config)
        return {key: cost[key] for key in ('sha256', 'status', 'metrics', 'violations')}

    with TemporaryDirectory(dir=physical(EVIDENCE)) as temp:
        path = physical(Path(temp) / 'candidate.vrm')
        path.write_bytes(result)
        return {'source': metrics(source_path), 'candidate': metrics(path)}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--check', action='store_true')
    args = cli.parse_args()
    check_checkout()
    for path in (EVIDENCE, RECIPE, REPORT, TARGET):
        physical(path)
    data, report = build(json.loads(RECIPE.read_bytes()))
    report['bodyBudget'] = measure(data, report['source']['path'])
    require(json.loads(REPORT.read_bytes()) == report, 'Body release evidence differs')
    writer = load_script('stripped_body_write', 'scripts/native-vroid-equipment-extract.py')
    writer.write_outputs({TARGET.name: data}, physical(TARGET).parent, check=args.check)
    print(json.dumps({k: report[k] for k in ('sourceBytes', 'targetSha256', 'targetBytes')}))


if __name__ == '__main__':
    main()
