"""Read the continuous one-piece source, actual edited export and runtime fit."""
import hashlib
import json
import math
from pathlib import PurePosixPath


def validate_onepiece(v, ident, require, GLB):
    base = 'assets-source/m2-onepiece-v1/'
    package = json.loads(v.pin(ident['manifest'], ident['manifestSha256']))
    rows = package['files']
    require(len(rows) == 62 and len({row['path'] for row in rows}) == len(rows), 'Onepiece inventory empty/duplicate/incomplete')
    for row in rows:
        path = PurePosixPath(row['path'])
        require(not path.is_absolute() and '..' not in path.parts, 'Unsafe onepiece package path')
        v.pin(base+row['path'], row['sha256'], row['bytes'])
    spec = v.json(base+'spec.json')
    require(spec['schema'] == 'm2-onepiece-source-v1' and spec['id'] == 'm2-male-training-onepiece-v1', 'Onepiece source version/ID mismatch')
    body = GLB(v.pin(spec['bodyPath'], spec['bodySha256']))
    report = v.json(base+'generated/report.json')
    v.pin(base+'spec.json', report['sourceSpecSha256'])
    v.pin('scripts/m2-onepiece-v1/build.py', report['generatorSha256'])
    require(report['bodySha256'] == spec['bodySha256'] and report['originalBodyUnchanged'] is True and
            report['connectedComponents'] == report['closedShellComponents'] == 1 and report['openingLoopCount'] == 5,
            'Onepiece source body/continuity receipt mismatch')
    provenance = v.json(base+'provenance.json')
    original = v.json('assets-source/foundation-male/source.json')
    require(provenance['roundtripSha256'] == spec['bodySha256'] and all(provenance.get(key) == value for key, value in original.items()),
            'Onepiece source provenance mismatch')
    author_path = base+'generated/author-equipment.json'
    entry = v.item(v.json(author_path), spec['id'])
    fit = v.json(base+'generated/fit.json')
    require(entry['slot'] == fit['slot'] == 'onePiece' and fit['schema'] == 'm2-onepiece-fit-v1' and fit['version'] == entry['version'] == 1 and
            fit['id'] == entry['fitId'] == spec['fitId'] and fit['styleId'] == entry['styleId'] == spec['styleId'], 'Onepiece fit ID/version/slot mismatch')
    require(fit['targetBodySha256'] == entry['compatibleAvatarSha256'] == spec['bodySha256'], 'Onepiece fit body mismatch')
    require(fit['occupies'] == ['top', 'bottom'] and fit['bodyCoverageMasks'] == [] and fit['physics'] == 'skinning-only', 'Onepiece occupancy/coverage/physics mismatch')
    for key in ['outerSurfaceOffsetMetres', 'clothThicknessMetres', 'neckOpeningYMetres', 'sleeveOpeningAbsXMetres']:
        require(fit[key] == spec[key], 'Onepiece source dimension mismatch: '+key)
    require(math.isclose(fit['nominalInnerSurfaceOffsetMetres'], spec['outerSurfaceOffsetMetres']-spec['clothThicknessMetres'], abs_tol=1e-12) and
            fit['hemYMetres'] == report['hemYMetres'] and fit['units'] == 'original glTF mesh-local metres, Y-up', 'Onepiece offset/units mismatch')
    v.pin(base+'spec.json', fit['sourceSpecSha256'])
    require(fit['assetSha256'] == entry['sha256'] and entry['url'] == 'author-export.glb' and entry['sha256'] != report['assetSha256'], 'Onepiece actual source export mismatch')
    binding = v.equipment(entry, spec['bodySha256'], body, author_path)
    initial = v.json(base+'initial/author-report.json')
    v.pin(base+'initial/source-spec.json', initial['sourceSpecSha256'])
    initial_spec = v.json(base+'initial-spec.json')
    require(v.json(base+'initial/source-spec.json') == initial_spec and initial_spec['outerSurfaceOffsetMetres'] != spec['outerSurfaceOffsetMetres'] and
            initial['editedFromEarlierSource'] is None and initial['authorExportSha256'] == initial['repeatExportSha256'] != entry['sha256'], 'Onepiece initial/edit source mismatch')
    v.pin(base+'initial/editable.blend', initial['editableSha256'])
    for name in ['author-export.glb', 'author-repeat-export.glb']:
        v.pin(base+'initial/'+name, initial['authorExportSha256'])
    v.pin(base+'initial/'+spec['id']+'.glb', initial['patternSha256'])
    for folder in ['generated/', 'repeat/']:
        author = v.json(base+folder+'author-report.json')
        require(author['editedFromEarlierSource'] == 'initial' and author['maximumActualSourceEditMetres'] > .001 and author['reopenedForEachExport'] is True and
                author['authorExportSha256'] == author['repeatExportSha256'] == entry['sha256'] and author['patternSha256'] == report['assetSha256'], 'Onepiece edited/repeat export mismatch')
        v.pin(base+folder+'source-spec.json', author['sourceSpecSha256'])
        require(v.json(base+folder+'source-spec.json') == spec, 'Onepiece edited parameter mismatch')
        v.pin(base+folder+'editable.blend', author['editableSha256'])
        for name in ['author-export.glb', 'author-repeat-export.glb']:
            v.pin(base+folder+name, entry['sha256'], entry['bytes'])
        v.pin(base+folder+spec['id']+'.glb', report['assetSha256'])
    verification = v.json(base+'generated/verification.json')
    require(verification['actualAuthorClosedConnectedShell'] is True and verification['bodyUnchanged'] is True and
            verification['repeatedExports']['author-export.glb'] == verification['repeatedExports']['author-repeat-export.glb'] == entry['sha256'], 'Onepiece stored verification mismatch')
    audit = v.json(base+'generated/static-audit.json')
    require(audit['assetSha256'] == entry['sha256'] and audit['bodySha256'] == spec['bodySha256'] and audit['bodyHiddenOrModified'] is False and
            fit['staticContacts'] == {key: audit[key] for key in ['bodyTriangleIntersections', 'selfNonAdjacentIntersections', 'maximumSampledNearestNormalPenetrationMetres']},
            'Onepiece stored static audit mismatch')
    runtime_path = 'prototype/public/assets/m1b/equipment.json'
    runtime = v.item(v.json(runtime_path), spec['id'])
    fit_bytes = v.pin(base+'generated/fit.json', runtime['fitResource']['sha256'])
    expected_fit = {'url': '/assets/m2-onepiece-v1/fit.json', 'sha256': hashlib.sha256(fit_bytes).hexdigest()}
    require(runtime == dict(entry, url='/assets/m2-onepiece-v1/author-export.glb', fitResource=expected_fit), 'Onepiece runtime/source entry mismatch')
    v.pin(v.url(runtime['url']), entry['sha256'], entry['bytes'])
    require(v.pin(v.url(expected_fit['url']), expected_fit['sha256']) == fit_bytes, 'Onepiece runtime fit bytes differ')
    shape = v.json(base+'generated/shape-fit.json')
    require(shape['schema'] == 'm2-shape-fit-v1' and shape['dependency'] == 'body-surface' and
            shape['garmentId'] == entry['id'] and shape['garmentSha256'] == entry['sha256'] and shape['baseAvatarSha256'] == spec['bodySha256'],
            'Onepiece shape dependency identity mismatch')
    require(shape['runtimeDigestSource'] == 'scripts/m2-onepiece-v1/runtime-shape-digest.mjs' and
            shape['runtimeDigest']['loader'] == 'GLTFLoader.parseAsync + SkinnedMesh.normalizeSkinWeights',
            'Onepiece runtime shape digest source mismatch')
    shape_bytes = v.pin(base+'generated/shape-fit.json', next(row['sha256'] for row in rows if row['path']=='generated/shape-fit.json'))
    v.pin(v.url('/assets/m2-onepiece-v1/shape-fit.json'), hashlib.sha256(shape_bytes).hexdigest(), len(shape_bytes))
    return {'id': spec['id'], 'inventoryFiles': len(rows), 'binding': binding, 'authorExportSha256': entry['sha256'],
            'patternSha256': report['assetSha256'], 'initialExportSha256': initial['authorExportSha256'], 'fourEditedExportsMatch': True,
            'runtimeExportAndFitMatchSource': True, 'storedStaticContacts': fit['staticContacts'],
            'scope': 'Stored source/export/fit identity only. Contact defects remain recorded. No runtime or visual acceptance inferred.'}
