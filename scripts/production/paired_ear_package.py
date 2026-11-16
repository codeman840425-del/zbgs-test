"""Read the retained paired-ear source producer without running generation."""
import hashlib
import json
import math


def validate_paired_ear(v, ident, require, GLB):
    base = 'assets-source/m2-paired-ear-accessory-v1/'
    generated = base + 'generated/'
    inventory = json.loads(v.pin(ident['manifest'], ident['manifestSha256']))
    require(inventory['schema'] == 'zbgs-paired-ear-accessory-files-v1', 'Paired ear inventory schema')
    rows = inventory['files']
    require(rows and len({row['path'] for row in rows}) == len(rows), 'Paired ear empty/duplicate inventory')
    for row in rows:
        v.pin(row['path'], row['sha256'], row['bytes'])
    spec = v.json(base + 'spec.json')
    require(spec['schema'] == 'zbgs-paired-ear-accessory-source-v1', 'Paired ear spec schema')
    manifest = v.json(generated + 'manifest.json')
    require(manifest['schema'] == 'zbgs-paired-rigid-accessory-style-v1' and manifest['version'] == 1 and
            manifest['styleId'] == spec['styleId'] and manifest['pairId'] == spec['pairId'] and
            manifest['runtimeAccepted'] is False, 'Paired ear style/source-only identity')
    provenance = v.json(base + 'provenance.json')
    require(provenance['styleId'] == spec['styleId'] and provenance['license'] == manifest['license'] == 'CC0-1.0',
            'Paired ear source license identity')
    asset_ref = manifest['asset']
    require(asset_ref['file'] == 'stud.glb', 'Paired ear asset filename')
    asset = v.pin(generated + 'stud.glb', asset_ref['sha256'], asset_ref['bytes'])
    glb = GLB(asset)
    require(not glb.doc.get('skins') and not glb.doc.get('animations') and not glb.doc.get('textures'),
            'Paired ear must remain rigid untextured geometry')
    require(v.pin(generated + 'stud-repeat.glb', asset_ref['sha256']) == asset, 'Paired ear repeat export identity')
    report = v.json(generated + 'build-report.json')
    v.pin(base + 'spec.json', report['sourceSpecSha256'])
    v.pin('scripts/m2-paired-ear-accessory-v1/build.py', report['generatorSha256'])
    variant_bytes = v.pin(generated + 'stud-parameter-variant.glb', report['parameterVariantSha256'])
    variant = GLB(variant_bytes)
    def radius(g):
        primitive = g.doc['meshes'][0]['primitives'][0]
        return max(abs(p[0]) for p in g.accessor(primitive['attributes']['POSITION']))
    require(asset != variant_bytes and report['baseAssetSha256'] == asset_ref['sha256'] and
            report['repeatExportMatches'] is True and report['parameterVariantDiffers'] is True and
            report['parameterEdit'] == spec['parameterVariant'] and
            abs(radius(glb) - spec['geometry']['radiusM']) < 1e-8 and
            abs(radius(variant) - spec['parameterVariant']['value']) < 1e-8,
            'Paired ear actual parameter/repeat witness')
    sides = ['left', 'right']
    require([i['side'] for i in manifest['instances']] == sides and
            [i['socket'] for i in manifest['instances']] == ['ear.left', 'ear.right'] and
            len({i['id'] for i in manifest['instances']}) == 2, 'Paired ear independent semantic sides')
    require([ref['bodyType'] for ref in manifest['fits']] == ['female', 'male'], 'Paired ear exact original fits')
    for ref in manifest['fits']:
        body = ref['bodyType']; source = spec['inputs'][body]
        v.pin(source['path'], source['sha256'])
        require(ref['file'] == body + '-fit.json', 'Paired ear fit filename')
        fit = json.loads(v.pin(generated + ref['file'], ref['sha256']))
        require(fit['schema'] == 'zbgs-paired-rigid-accessory-fit-v1' and fit['version'] == 1 and
                fit['fitId'] == ref['fitId'] and fit['baseAvatarSha256'] == ref['baseAvatarSha256'] == source['sha256'] and
                fit['assetSha256'] == asset_ref['sha256'] and fit['sourceAvatar'] == source['path'] and
                fit['styleId'] == spec['styleId'] and fit['pairId'] == spec['pairId'] and
                fit['sourceBodyBytesUnchanged'] is True and fit['runtimeAccepted'] is False,
                'Paired ear fit identity')
        require([m['side'] for m in fit['mounts']] == sides, 'Paired ear fit side identity')
        pair = GLB(v.pin(generated + body + '-pair-head-local.glb',
                        next(r['sha256'] for r in rows if r['path'] == generated + body + '-pair-head-local.glb')))
        require(len(pair.doc['nodes']) == 2, 'Paired ear pair fixture node count')
        for mount, instance, node in zip(fit['mounts'], manifest['instances'], pair.doc['nodes']):
            require(mount['instanceId'] == instance['id'] and mount['socket'] == instance['socket'] and
                    mount['bone'] == 'head' and mount['space'] == 'raw-head-bind-local' and mount['scale'] == [1, 1, 1] and
                    node['translation'] == mount['position'] and node['rotation'] == mount['quaternion'] and
                    node['scale'] == mount['scale'], 'Paired ear mount/fixture identity')
            require(len(mount['position']) == 3 and len(mount['quaternion']) == 4 and
                    all(math.isfinite(n) for n in mount['position'] + mount['quaternion']) and
                    abs(sum(n*n for n in mount['quaternion']) - 1) < 1e-6 and
                    mount['trace']['faceId'] == source['earLandmarkFace'][mount['side']] and
                    min(mount['trace']['headWeightPerCorner']) > .9999,
                    'Paired ear mount/ear trace witness')
    qa = v.json(generated + 'qa-report.json')
    require(qa['passed'] is True and qa['runtimeAccepted'] is False and qa['GPUUsed'] is False and
            qa['BlenderUsed'] is False and len(qa['observations']) == 4 and
            all(row['minimumSignedSourceNormalDistanceM'] >= -.0001 for row in qa['observations']),
            'Paired ear stored CPU QA witness')
    public = v.root / 'prototype/public/assets/m2-paired-ear-accessory-v1'
    published = public.exists()
    if published:
        for name in ['manifest.json', 'stud.glb', 'female-fit.json', 'male-fit.json']:
            data = (v.root / (generated + name)).read_bytes()
            v.pin('prototype/public/assets/m2-paired-ear-accessory-v1/' + name, hashlib.sha256(data).hexdigest(), len(data))
    return {'styleId': spec['styleId'], 'pairId': spec['pairId'], 'inventoryFiles': len(rows),
            'sourceLicense': manifest['license'], 'fitBodies': ['female', 'male'],
            'assetSha256': asset_ref['sha256'], 'parameterVariantChangesActualRadius': True,
            'publishedBytesMatchSource': published, 'runtimeAccepted': False,
            'scope': 'Stored CPU source, fits, parameter/repeat exports and optional published bytes only. Runtime/action/visual acceptance remains pending.'}
