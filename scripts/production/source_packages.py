"""Frozen M2 package identity readback, never exporter execution."""
import json


def validate_package(v, ident, require, GLB):
    kind = ident['package']
    if kind == 'lower-leg':
        from lower_leg_package import validate_lower_leg
        return validate_lower_leg(v, ident, require, GLB)
    if kind == 'socks':
        from socks_package import validate_socks
        return validate_socks(v, ident, require, GLB)
    if kind == 'outer-panels':
        from outer_package import validate_outer
        return validate_outer(v, ident, require, GLB)
    if kind == 'onepiece':
        from onepiece_package import validate_onepiece
        return validate_onepiece(v, ident, require, GLB)
    if kind == 'paired-ear':
        from paired_ear_package import validate_paired_ear
        return validate_paired_ear(v, ident, require, GLB)
    if kind == 'garment-coverage':
        from garment_coverage_package import validate_garment_coverage
        return validate_garment_coverage(v, ident, require, GLB)
    require(kind in ['male-face', 'jaw-mouth', 'jaw-hair-fit'], 'Unknown source package')
    path = ident['manifest']
    package = json.loads(v.pin(path, ident['manifestSha256']))
    keys = {'male-face': ['files'], 'jaw-mouth': ['files', 'dependencies'],
            'jaw-hair-fit': ['retainedFiles', 'inputFiles']}[kind]
    rows = [row for key in keys for row in package[key]]
    require(rows, 'Empty package inventory: '+path)
    for row in rows:
        v.pin(row['path'], row['sha256'], row['bytes'])

    if kind == 'male-face':
        base = 'assets-source/m2-male-face-v1/'
        spec = v.json(base+'spec.json')
        require(spec['schema'] == 'zbgs-local-male-face-specimen-v1' and
                spec['id'] == package['id'] == 'm2-male-jaw-v1', 'Male face spec/version: '+base+'spec.json')
        for key in ['sourceBlend', 'sourceVRM']:
            v.pin(spec[key], spec[key+'Sha256'])
        avatar = package['avatarSha256']
        for folder in ['generated/', 'rebuild/']:
            report = v.json(base+folder+'build-report.json')
            require(report['avatarSha256'] == report['repeatExportSha256'] == avatar,
                    'Male face export identity: '+base+folder+'build-report.json')
            require(report['sourceVRMSha256'] == spec['sourceVRMSha256'] and
                    report['sourceBlendSha256'] == spec['sourceBlendSha256'], 'Male face parent mismatch')
            v.pin(base+folder+'avatar.vrm', avatar, report['avatarBytes'])
            v.pin(base+folder+'repeat-export.vrm', avatar)
            v.pin(base+folder+'editable.blend', report['editableBlendSha256'])
        profile = v.json(base+'generated/profile-entry.json')
        require(profile['sha256'] == avatar and profile['referenceBody'] == 'male', 'Male face profile mismatch')
        v.pin(base+'generated/forearm-profile.json', profile['forearmCollision']['sha256'])
        return {'id': package['id'], 'parentSha256': spec['sourceVRMSha256'], 'avatarSha256': avatar,
                'inventoryFiles': len(rows), 'storedExportsMatch': True}

    if kind == 'jaw-mouth':
        base = 'assets-source/m2-male-jaw-mouth-v1/'
        require(package['schema'] == 'jaw-mouth-source-package-v1', 'Mouth package version: '+path)
        spec = v.json(base+'spec.json'); source = spec['bodies']['male-jaw']
        require(spec['schema'] == 'male-jaw-mouth-fixed-source-v1' and spec['supportedSamples'] == [0, .04],
                'Mouth source sample/version: '+base+'spec.json')
        for key in ['sourceBlend', 'sourceVRM']:
            v.pin(source[key], source[key+'Sha256'])
        catalog = v.json(base+'recipe-manifest.json')
        require(catalog['schema'] == 'character-face-geometry-recipes-v1' and len(catalog['recipes']) == 1,
                'Mouth recipe catalog version: '+base+'recipe-manifest.json')
        entry = catalog['recipes'][0]
        recipe = json.loads(v.pin(base+entry['file'], entry['sha256']))
        require(recipe['schema'] == 'character-face-geometry-recipe-v1' and
                recipe['id'] == entry['id'] == spec['id'], 'Mouth recipe ID/version: '+base+entry['file'])
        require(recipe['baseAvatarSha256'] == entry['baseAvatarSha256'] == source['sourceVRMSha256'], 'Mouth parent mismatch')
        require(recipe['supportedValues'] == entry['supportedValues'] == [0, .04] and recipe['range'] == [0, .04],
                'Mouth is fixed 0/+4 only: '+base+entry['file'])
        folder = base+'generated/male-jaw-mouth-width-104-v1/'
        v.pin(folder+'addon-export.vrm', recipe['rawEndpointSha256'])
        final = GLB(v.pin(folder+'avatar.vrm', recipe['finalEndpointSha256']))
        report = v.json(folder+'normal-export-report.json')
        require(report['parentSha256'] == recipe['baseAvatarSha256'] and
                report['finalTargetAttributes'] == ['POSITION', 'NORMAL'], 'Mouth final normal export mismatch')
        require(all('NORMAL' in target for primitive in final.doc['meshes'][recipe['meshIndex']]['primitives']
                    for target in primitive.get('targets', [])), 'Mouth final NORMAL missing')
        return {'id': recipe['id'], 'parentSha256': recipe['baseAvatarSha256'], 'supportedValues': [0, .04],
                'finalEndpointSha256': recipe['finalEndpointSha256'], 'inventoryFiles': len(rows),
                'normalScope': 'Stored final POSITION/NORMAL export identity; no recomputation or visual acceptance'}

    base = 'assets-source/m2-male-jaw-hair-fit-v1/'
    manifest = v.json(base+'manifest.json'); fit_entry = manifest['fit']
    fit = json.loads(v.pin(base+'fit.json', fit_entry['sha256']))
    require(manifest['schema'] == 'character-hairstyle-v1' and fit['schema'] == 'character-hair-fit-v1',
            'Hair manifest/fit version: '+base+'fit.json')
    require(fit['id'] == fit_entry['id'] == 'male-sidepart-jaw-fit-v1' and fit['version'] == fit_entry['version'] == 1,
            'Hair fit ID/version: '+base+'fit.json')
    require(fit['styleId'] == manifest['id'] == 'male-sidepart-v1' and
            manifest['compatibleBodies'] == [fit['targetBodySha256']], 'Hair style/target mismatch')
    v.pin('assets-source/m2-male-face-v1/generated/avatar.vrm', fit['targetBodySha256'])
    v.pin('prototype/public/assets/foundation/base-male-roundtrip.vrm', fit['sourceBodySha256'])
    require(fit['assetSha256'] == manifest['sha256'], 'Hair asset/fit mismatch')
    glb = GLB(v.pin(base+'male-sidepart.glb', manifest['sha256']))
    require(not glb.doc.get('skins') and not glb.doc.get('animations'), 'Hair must remain rigid')
    require(manifest['headLocal'] is True and manifest['mount'] == 'head' and fit['physics'] == 'rigid' and
            fit['attachment'] == {'bone': 'head', 'space': 'raw-head-bind-local', 'position': [0,0,0],
                                  'quaternion': [0,0,0,1], 'scale': [1,1,1]}, 'Hair attachment changed')
    require(fit['sourceMaterial'] == manifest['sourceMaterial'] == 'M00_000_HairBack_00_HAIR' and
            fit['hideOriginal']['hideWholeBody'] is False, 'Hair hide/material changed')
    for name, sha in [('manifest.json', next(r['sha256'] for r in rows if r['path'] == base+'manifest.json')),
                      ('fit.json', fit_entry['sha256']), ('male-sidepart.glb', manifest['sha256'])]:
        v.pin('prototype/public/assets/m2-male-jaw-hair-fit-v1/'+name, sha)
    require(v.url(fit_entry['url']) == 'prototype/public/assets/m2-male-jaw-hair-fit-v1/fit.json' and
            v.url(manifest['url']) == 'prototype/public/assets/m2-male-jaw-hair-fit-v1/male-sidepart.glb', 'Hair resource URL mismatch')
    return {'id': fit['id'], 'styleId': fit['styleId'], 'fitVersion': 1,
            'targetBodySha256': fit['targetBodySha256'], 'assetSha256': fit['assetSha256'],
            'inventoryFiles': len(rows), 'editableExportIsNotProductionGLB': True}
