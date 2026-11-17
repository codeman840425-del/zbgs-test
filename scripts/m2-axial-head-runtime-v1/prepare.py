"""Generate an isolated room-registration publication tree, never src/public."""
import argparse
import copy
import difflib
import hashlib
import json
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-axial-head-runtime-v1'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB, local, require


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def pinned(ref):
    path = local(ROOT, ref['path'])
    require(path.is_file(), 'Missing source: ' + ref['path'])
    data = path.read_bytes()
    require(sha(data) == ref['sha256'], 'Source SHA mismatch: ' + ref['path'])
    return data


def images(g):
    result = []
    for image in g.doc.get('images', []):
        require('bufferView' in image, 'External image is unsupported')
        view = g.doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        result.append(sha(g.binary[start:start + view['byteLength']]))
    return result


def documents():
    spec = json.loads((BASE / 'spec.json').read_bytes())
    data = {k: pinned(ref) for k, ref in spec['inputs'].items()}
    target_sha = spec['inputs']['targetBody']['sha256']
    require(target_sha == '83f4907f3943940b90a8876ed79496b20476f0d38ecf31414fb8b94f3bacb8f9', 'Only the sealed lean source is supported')
    source, target = GLB(data['sourceBody']), GLB(data['targetBody'])
    require(source.doc['nodes'] == target.doc['nodes'] and source.doc['skins'] == target.doc['skins'], 'Skeleton/rest binds changed')
    require(source.doc['materials'] == target.doc['materials'] and images(source) == images(target), 'Palette material/image identity changed')
    uv_rows = []
    for mi, (a, b) in enumerate(zip(source.doc['meshes'], target.doc['meshes'], strict=True)):
        for pi, (p, q) in enumerate(zip(a['primitives'], b['primitives'], strict=True)):
            require(np.array_equal(source.accessor(p['indices']), target.accessor(q['indices'])), 'Source topology changed')
            require(np.array_equal(source.accessor(p['attributes']['TEXCOORD_0']), target.accessor(q['attributes']['TEXCOORD_0'])), 'Palette UV changed')
            uv_rows.append({'mesh': mi, 'primitive': pi, 'UVExact': True})
    audit = json.loads(data['exportAudit'])
    audited = next(c for c in audit['cases'] if c['resource']['sha256'] == target_sha)
    require(audited['id'] == 'male-long-lean-v2', 'Export audit request identity differs')
    require(audited['resource']['sha256'] == target_sha and audited['UVSkinIBMSkeletonMaterialsImagesExpressionJSONPreserved'] and
        audited['positionMatchesSealedFloat32EndpointsExactly'] and audited['normalDeltaMatchesSealedJInverseTransposePolicyExactly'], 'Actual VRM audit differs')
    combinations = json.loads(data['combinationAudit'])
    require(len(combinations['rows']) == 10 and not combinations['gpuRendered'], 'Need the exact new-source ten-combination audit')
    known = [{'id': r['id'], 'contacts': r['contacts'], 'result': r['result'], 'sha256': r['sha256']}
        for r in combinations['rows'] if any(c['added'] for c in r['contacts'])]
    require(len(known) == 1 and known[0]['id'] == 'happy-blink-oh', 'New combination defect scope changed')

    # Verify the actual source hip/leg skin, not an assumption from the label.
    p, q = source.doc['meshes'][0]['primitives'][0], target.doc['meshes'][0]['primitives'][0]
    require('Body_00_SKIN' in source.doc['materials'][p['material']]['name'], 'Wrong original body primitive')
    joints = np.asarray(source.accessor(p['attributes']['JOINTS_0']), int)
    weights = np.asarray(source.accessor(p['attributes']['WEIGHTS_0']))
    skin = source.doc['skins'][0]
    lower_joints = {i for i, node in enumerate(skin['joints']) if re.search(r'(Hips|UpperLeg|LowerLeg|Foot|ToeBase)$', source.doc['nodes'][node]['name'])}
    mask = ((np.isin(joints, sorted(lower_joints))) & (weights > 0)).any(1)
    ids = np.intersect1d(np.flatnonzero(mask), np.unique(source.accessor(p['indices'])))
    require(len(ids) > 100, 'Missing actual hip/leg surface')
    require(np.array_equal(np.asarray(source.accessor(p['attributes']['POSITION']))[ids], np.asarray(target.accessor(q['attributes']['POSITION']))[ids]), 'Seat-related body geometry changed')
    for key in ['JOINTS_0', 'WEIGHTS_0']:
        require(np.array_equal(source.accessor(p['attributes'][key]), target.accessor(q['attributes'][key])), 'Body skin weights changed')

    kit = json.loads(data['equipmentManifest'])
    fit = json.loads(data['equipmentFit'])
    require(kit['schema'] == 'zbgs-equipment-v1' and len(kit['items']) == 4 and fit['targetBody']['sha256'] == target_sha, 'Wrong four-item kit/fit')
    require(json.loads(data['forearm'])['bodySHA256'] == target_sha, 'Forearm is not the new source SHA')
    files = {}
    runtime_dir = 'public/assets/m2-axial-head-runtime-v1/'
    equipment_dir = 'public/assets/m2-axial-head-equipment-v1/'
    files[runtime_dir + 'avatar.vrm'] = data['targetBody']
    files[equipment_dir + 'equipment.json'] = data['equipmentManifest']
    files[equipment_dir + 'fit.json'] = data['equipmentFit']
    gear_evidence = []
    shoe_minimum = None
    for item in kit['items']:
        require(item['compatibleAvatarSha256'] == target_sha and item['id'].startswith(spec['id'] + '-'), 'Foreign equipment identity')
        path = local(ROOT, str(Path(spec['inputs']['equipmentManifest']['path']).parent / item['url']))
        raw = pinned({'path': path.relative_to(ROOT).as_posix(), 'sha256': item['sha256']})
        require(len(raw) == item['bytes'], 'Equipment byte length mismatch')
        record = next(r for r in fit['items'] if r['equipmentId'] == item['id'])
        require(record['assetSha256'] == item['sha256'] and record['id'] == item['fitId'], 'Equipment fit ID/SHA differs')
        require(record['bindings']['allRestPositionsExact'] and record['bindings']['allSourceTargetAndManifestInverseBindsExact'], 'Equipment bind identity differs')
        original = pinned(record['source'])
        if item['id'].endswith(('-pants', '-shorts', '-shoes')):
            require(original == raw and record['identityResourceReused'], 'Lower garment/shoe is not actual identity')
        else:
            require(original != raw and not record['identityResourceReused'], 'Top adaptation was not produced')
        files[equipment_dir + item['url']] = raw
        gear_evidence.append({'id': item['id'], 'fitId': item['fitId'], 'sha256': item['sha256'], 'identity': record['identityResourceReused']})
        if item['slot'] == 'shoes':
            g = GLB(raw)
            shoe_minimum = min(float(np.asarray(g.accessor(p['attributes']['POSITION']))[:, 1].min()) for m in g.doc['meshes'] for p in m['primitives'])
    forearm_folder = ROOT / Path(spec['inputs']['forearm']['path']).parent
    for path in sorted(forearm_folder.rglob('*')):
        if path.is_file():
            files[equipment_dir + 'forearm/' + path.relative_to(forearm_folder).as_posix()] = path.read_bytes()

    palette = json.loads(data['palette'])
    variant = copy.deepcopy(next(v for v in palette['variants'] if v['avatarSha256'] == spec['inputs']['sourceBody']['sha256']))
    for descriptor in variant['parts'].values():
        for url_key, hash_key in [('maskUrl', 'maskSha256'), ('neutralMapUrl', 'neutralMapSha256')]:
            if url_key in descriptor:
                pinned({'path': 'prototype/public' + descriptor[url_key], 'sha256': descriptor[hash_key]})
    variant.update(avatarSha256=target_sha, bodyType=spec['id'])
    new_palette = {**palette, 'variants': [variant]}
    raw_palette = encode(new_palette)
    files[runtime_dir + 'palette-manifest.json'] = raw_palette
    palette_contract = {'url': spec['publicPrefix'] + 'palette-manifest.json', 'sha256': sha(raw_palette),
        'version': 'appearance-color-v3-axial-head-v1:' + sha(raw_palette), 'bodySha256s': [target_sha]}
    profile = {'schema': 'foundation-profile-draft-v1', 'id': spec['id'], 'bodyType': spec['id'], 'referenceBody': 'male',
        'url': spec['publicPrefix'] + 'avatar.vrm', 'sha256': target_sha,
        'manifestUrl': spec['equipmentPublicPrefix'] + 'equipment.json',
        'forearmCollision': {'url': spec['equipmentPublicPrefix'] + 'forearm/profile.json', 'sha256': spec['inputs']['forearm']['sha256']},
        'label': spec['label'], 'workbenchGroup': 'male', 'batchId': 'm2-axial-head-runtime-v1',
        'source': 'Original male62b with head-only axial source parameters; original requested waist/limb parameters were not applied.',
        'ids': {role: spec['id'] + '-' + role for role in ['top', 'pants', 'shorts', 'shoes']},
        'pantsLabel': '原长裤·头部候选', 'shortsLabel': '原短裤·头部候选',
        'sourceFloorY': spec['sourceFloorY'], 'seatLayerThickness': .0036, 'outfitSeatLayerThickness': {'2': .0036},
        'fitStatus': 'Exact hip/leg skin, skeleton and original lower garments retained. Original3.6mm seat value has source basis; actual posed contact pending.',
        'runtimeAccepted': False}
    limits = ['仅头部候选；非完整male-long-lean-v2，原六成功/两失败身份保留。',
        '混合口型边界待视觉：happy.65/blink1/oh.66有一对新增口内接触。',
        '仅原发和普通配色；替换发型/外套/帽/麦克风/局部五官/无发base未登记。',
        '上衣已实际适配；裤/短裤/鞋是实际identity。坐姿、动作、发根及闭眼覆盖待实际游戏检查。']
    index = {'schema': 'axial-head-runtime-index-v1', 'targetBodySha256': target_sha, 'completeBatch': False,
        'presets': [{'id': spec['id'], 'sex': 'male', 'label': spec['label'], 'profile': profile,
            'appearance': {'hairStyle': 'original', 'hairColor': 'black', 'skinTone': 'original', 'eyeColor': 'original', 'lipColor': 'original'}}],
        'noHair': [], 'palette': palette_contract, 'limits': limits,
        'equipmentFit': {'url': spec['equipmentPublicPrefix'] + 'fit.json', 'sha256': spec['inputs']['equipmentFit']['sha256']},
        'reviewUrl': 'http://127.0.0.1:4174/evidence/m2-axial-head-room-v1/', 'runtimeAccepted': False}
    files[runtime_dir + 'runtime-index.json'] = encode(index)
    blink = {'schema': 'axial-head-eye-blink-candidate-v1', 'profiles': [{'sha256': target_sha, 'prefix': 'M00_000_00_', 'targets': 54}],
        'sourceAdmission': 'Exact new source54 target topology/bindings and ten combination audit; old lane byte equality is not used.',
        'combinationAudit': spec['inputs']['combinationAudit'], 'knownCombinationDefects': known,
        'scope': 'Diagnostic candidate; manager/rendered blink and closed-eye coverage pending. Original nonzero source contacts retained.', 'runtimeAccepted': False}
    files[runtime_dir + 'eye-blink-profiles.json'] = encode(blink)

    original = data['representativeModule'].decode()
    revised = original.replace("import revised from '../public/assets/m2-representative-batch-v2/runtime-index.json' with {type:'json'};",
        "import revised from '../public/assets/m2-representative-batch-v2/runtime-index.json' with {type:'json'};\nimport axial from '../public/assets/m2-axial-head-runtime-v1/runtime-index.json' with {type:'json'};")
    marker = 'export const REPRESENTATIVE_PRESETS=[\n'
    require(original.count(marker) == 1, 'Representative registration seam changed')
    guard = "if(axial.schema!=='axial-head-runtime-index-v1'||axial.presets.length!==1||axial.presets[0].id!=='male-long-lean-axial-head-v1'||axial.presets[0].profile.sha256!==axial.targetBodySha256||axial.completeBatch!==false)throw Error('头部候选清单身份不一致');\n"
    revised = revised.replace(marker, guard + marker + "  ...axial.presets.map(p=>({...p,previewLabel:p.label+' · 待验'})),\n")
    revised = revised.replace('REPRESENTATIVE_PALETTES=[batch.palette,revised.palette]', 'REPRESENTATIVE_PALETTES=[batch.palette,revised.palette,axial.palette]')
    original_blink = data['blinkModule'].decode()
    revised_blink = "import axialBlink from '../public/assets/m2-axial-head-runtime-v1/eye-blink-profiles.json' with {type:'json'};\n" + original_blink
    revised_blink = revised_blink.replace('[...batchBlink.profiles,...revisedBlink.profiles]', '[...batchBlink.profiles,...revisedBlink.profiles,...axialBlink.profiles]')
    patches = {}
    for name, before, after in [('representative-batch.js', original, revised), ('eye-blink-compatibility.js', original_blink, revised_blink)]:
        require(before != after, 'Registration seam did not change')
        patches['patched-src/' + name] = after.encode()
    patch = ''.join(''.join(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
        fromfile='a/prototype/src/' + name, tofile='b/prototype/src/' + name)) for name, before, after in [
            ('representative-batch.js', original, revised), ('eye-blink-compatibility.js', original_blink, revised_blink)])
    patches['integration.patch'] = patch.encode()
    evidence = {'schema': 'axial-head-runtime-source-evidence-v1', 'targetBodySha256': target_sha,
        'all15UVsExact': uv_rows, 'imagesAndMaterialsExact': True, 'skeletonAndSkinsExact': True,
        'seatBasis': {'selectedHipLegSkinVertices': len(ids), 'positionsAndWeightsExact': True, 'sourceShoeMinimumYM': shoe_minimum,
            'configuredSourceFloorYSameAsOriginal': spec['sourceFloorY'], 'originalSeatValueM': .0036, 'poseAccepted': False},
        'equipment': gear_evidence, 'knownExpressionCombinations': known, 'noHairAdmission': False,
        'paletteAdmission': 'Exact original image/material/UV identity, separate new SHA manifest.', 'runtimeAccepted': False}
    patches['evidence.json'] = encode(evidence)
    return spec, files, patches


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=BASE / 'generated-v2')
    args = parser.parse_args()
    output = args.out.resolve()
    require(output.is_relative_to(BASE.resolve()) and output != BASE.resolve(), 'Output must stay inside owned source package')
    spec, files, extra = documents()
    all_files = {**files, **extra}
    plan = {'schema': 'axial-head-runtime-publication-plan-v1', 'targetBodySha256': spec['inputs']['targetBody']['sha256'],
        'resources': [{'staged': name, 'destination': 'prototype/' + name, 'sha256': sha(raw), 'bytes': len(raw)} for name, raw in sorted(files.items())],
        'runtimePatch': 'integration.patch',
        'runtimeTargets': [{'path': spec['inputs'][key]['originalPath'],
            'expectedBaseSha256': spec['inputs'][key]['sha256'],
            'proposedSha256': sha(extra['patched-src/' + Path(spec['inputs'][key]['originalPath']).name]),
            'sourceSnapshot': spec['inputs'][key]}
            for key in ['representativeModule', 'blinkModule']],
        'status': 'staged-for-root-review-no-public-write', 'runtimeAccepted': False}
    all_files['publish-plan.json'] = encode(plan)
    if output.exists():
        require(all((output / name).is_file() and (output / name).read_bytes() == raw for name, raw in all_files.items()), 'Existing staged version differs; preserve it')
        state = 'identical-existing-stage'
    else:
        output.mkdir(parents=True)
        for name, raw in all_files.items():
            path = output / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
        state = 'staged'
    print(json.dumps({'status': state, 'publicResources': len(files), 'runtimeFilesProposed': 2, 'publicWritten': False}))


if __name__ == '__main__':
    main()
