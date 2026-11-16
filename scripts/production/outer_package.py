"""Read the retained layered garment source and its exact runtime export."""
import json
from pathlib import PurePosixPath


def validate_outer(v, ident, require, GLB):
    base = 'assets-source/m2-outer-panels-v2/'
    package = json.loads(v.pin(ident['manifest'], ident['manifestSha256']))
    rows = package['files']
    require(rows and len({r['path'] for r in rows}) == len(rows), 'Outer inventory empty/duplicate')
    for row in rows:
        # Unlike the older source packages, these paths are relative to the package.
        require(not PurePosixPath(row['path']).is_absolute() and '..' not in PurePosixPath(row['path']).parts,
                'Unsafe outer package path')
        v.pin(base+row['path'], row['sha256'], row['bytes'])
    spec = v.json(base+'spec.json')
    require(spec['schema'] == 'm2-outer-panels-source-v2' and
            spec['id'] == 'm2-male-open-vest-panels-v2', 'Outer source version/ID mismatch')
    body = GLB(v.pin('prototype/public/assets/foundation/base-male-roundtrip.vrm', spec['bodySha256']))
    v.pin(spec['parentTop'], spec['parentTopSha256'])
    report = v.json(base+'generated/report.json')
    v.pin(base+'spec.json', report['specSha256'])
    v.pin('scripts/m2-outer-panels-v2/build.py', report['generatorSha256'])
    require(report['bodySha256'] == spec['bodySha256'] and report['topSha256'] == spec['parentTopSha256'],
            'Outer generator parent mismatch')
    author_path = base+'generated/author-equipment.json'
    author = v.json(author_path)
    entry = v.item(author, spec['id'])
    fit = v.json(base+'generated/fit.json')
    require(fit['schema'] == 'm2-layered-garment-fit-v1' and fit['version'] == 2 and
            fit['id'] == entry['fitId'] == spec['fitId'] and
            fit['styleId'] == entry['styleId'] == spec['styleId'], 'Outer fit ID/version mismatch')
    require(fit['targetBodySha256'] == entry['compatibleAvatarSha256'] == spec['bodySha256'] and
            fit['innerTopSha256'] == spec['parentTopSha256'], 'Outer fit body/inner top mismatch')
    require(fit['layerWith'] == entry['layerWith'] == spec['layerWith'] == ['m1b-uniform-top'] and
            fit['allowedBottoms'] == entry['allowedBottoms'] == spec['allowedBottoms'] ==
            ['m1b-uniform-pants', 'm1b-uniform-shorts-v1'] and fit['coverage'] == [] and
            fit['physics'] == 'skinning-only', 'Outer layer/bottom/physics restriction mismatch')
    v.pin(base+'spec.json', fit['sourceSpecSha256'])
    require(fit['assetSha256'] == entry['sha256'] and entry['url'] == 'author-export.glb' and
            entry['sha256'] != report['assetSha256'], 'Outer actual source export identity mismatch')
    binding = v.equipment(entry, spec['bodySha256'], body, author_path)
    correspondence = v.json(base+'generated/source-correspondence.json')
    require(correspondence['repeatedExports']['author-export.glb'] == entry['sha256'],
            'Outer correspondence export mismatch')
    for folder in ['generated/', 'rebuild/']:
        editable = v.json(base+folder+'editable-report.json')
        require(editable['reopenedActualEditable'] is True and
                editable['authorExportSha256'] == editable['repeatExportSha256'] == entry['sha256'] and
                editable['sourcePatternSha256'] == report['assetSha256'], 'Outer editable/rebuild export mismatch')
        v.pin(base+folder+'editable.blend', editable['editableSha256'])
        for name in ['author-export.glb', 'author-repeat-export.glb']:
            v.pin(base+folder+name, entry['sha256'], entry['bytes'])
        v.pin(base+folder+spec['id']+'.glb', report['assetSha256'])
    audit = v.json(base+'generated/source-audit.json')
    require(audit['assetSha256'] == entry['sha256'], 'Outer stored static audit identity mismatch')
    for label, path in [('pants', 'prototype/public/assets/m1b/m1b-uniform-pants.glb'),
                        ('shorts', 'prototype/public/assets/m1b/m1b-uniform-shorts-v1.glb')]:
        v.pin(path, audit['contacts'][label]['sha256'])
    runtime_path = 'prototype/public/assets/m1b/equipment.json'
    runtime = v.item(v.json(runtime_path), spec['id'])
    expected = dict(entry, url='/assets/m2-outer-panels-v2/author-export.glb')
    require(runtime == expected, 'Outer runtime/source entry mismatch')
    v.pin(v.url(runtime['url']), entry['sha256'], entry['bytes'])
    return {'id': spec['id'], 'inventoryFiles': len(rows), 'binding': binding,
            'authorExportSha256': entry['sha256'], 'patternSha256': report['assetSha256'],
            'runtimeExportMatchesSource': True,
            'storedStaticAuditPassed': audit['passedNoInitialIntersections'],
            'scope': 'Stored identity and binding only. Continuous action/visual fit requires matching evidence.'}
