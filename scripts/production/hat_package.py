"""Read the frozen cap source and exact body/ponytail dependencies, CPU only."""
import hashlib
import json
import math

BASE = 'assets-source/m2-hat-hair-v1/'
GENERATED = BASE+'generated/'
SCRIPTS = 'scripts/m2-hat-hair-v1/'
OUTPUT = 'prototype/public/assets/m2-hat-hair-v1/'
PREFIX = '/assets/m2-hat-hair-v1/'
INVENTORY_SHA256 = 'e3a51e2129d504096acad859c7519e8ee9898c37980ab7f09162be1eeb0199d7'
READY = {
    'baseball-cap.glb': ('21e1a23238b046106d2822f5821384502c6ec39c755cd78e6f17b1f1c4241bb7', 109240),
    'fit.json': ('86ea630c9a06f7cdddfb10eb5998eb6b5934010f56750d292a1c97e8d298d769', 1308),
    'manifest.json': ('c62f1ecbc4b16f5e36a2b691f494e887d4367cbf662ade436d8659924fd182cc', 545),
}


def validate_hat_source(v, require, GLB):
    inventory = json.loads(v.pin(BASE+'package-files.json', INVENTORY_SHA256))
    rows = inventory['files']
    require(len(rows) == len({r['path'] for r in rows}) == 27 and inventory['runtimeAccepted'] is False,
            'Hat frozen 27-file inventory identity')
    for row in rows:
        v.pin(row['path'], row['sha256'], row['bytes'])
    payload = {name: v.pin(GENERATED+name, digest, size) for name, (digest, size) in READY.items()}
    spec = v.json(BASE+'spec.json')
    require(spec['schema'] == 'baseball-cap-source-v1' and spec['version'] == 1 and
            spec['styleId'] == 'female-ponytail-baseball-cap-v1' and spec['license'] == 'CC0-1.0' and
            spec['geometry']['brimLengthM'] == .055 and spec['parameterEdit'] == {'brimLengthM': .065}, 'Hat fixed source parameters')
    body_sha = '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
    require(spec['body']['sha256'] == body_sha, 'Hat original female body identity')
    body = GLB(v.pin(spec['body']['path'], body_sha))
    dependency = spec['hair']
    require(dependency['styleId'] == 'female-ponytail-v1' and dependency['manifestVersion'] == dependency['fitVersion'] == 2 and
            dependency['sha256'] == '1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385' and
            dependency['manifestSha256'] == '28337f44c1d297f2657b8ca32466e0c3b9e0cfceb17c39bda019fc19bfb48b9d' and
            dependency['fitSha256'] == '5e6d7499852ffc6198e6c7190a50cf5b55abd51f535c038044201b1cd9ada04f', 'Hat exact rootjoin-v2 dependency')
    v.pin(dependency['path'], dependency['sha256'])
    hair_manifest = json.loads(v.pin(dependency['manifestPath'], dependency['manifestSha256']))
    hair_fit = json.loads(v.pin(dependency['fitPath'], dependency['fitSha256']))
    require(hair_manifest['id'] == dependency['styleId'] and hair_manifest['version'] == 2 and
            hair_manifest['fit']['version'] == hair_fit['version'] == 2 and hair_fit['targetBodySha256'] == body_sha and
            hair_manifest['sha256'] == hair_fit['assetSha256'] == dependency['sha256'], 'Hat dependency manifest/fit identity')
    # Source paths are provenance. Runtime dependencies use their declared URLs.
    v.pin(v.url(hair_manifest['url']), dependency['sha256'])
    v.pin(v.url(hair_manifest['fit']['url']), dependency['fitSha256'])
    v.pin('prototype/public/assets/m2-long-hair-rootjoin-v2/manifest.json', dependency['manifestSha256'])
    manifest = v.json(GENERATED+'manifest.json')
    fit = v.json(GENERATED+'fit.json')
    require(manifest['schema'] == 'character-hat-v1' and manifest['id'] == spec['styleId'] and manifest['version'] == 1 and
            manifest['sha256'] == fit['assetSha256'] == READY['baseball-cap.glb'][0] and
            manifest['fit'] == {'id': spec['styleId']+'-fit', 'version': 1, 'url': PREFIX+'fit.json', 'sha256': READY['fit.json'][0]} and
            manifest['url'] == PREFIX+'baseball-cap.glb' and manifest['bytes'] == READY['baseball-cap.glb'][1] and
            manifest['mount'] == 'head' and manifest['headLocal'] is True and manifest['physics'] == 'rigid', 'Hat ready manifest identity')
    require(fit['schema'] == 'character-hat-fit-v1' and fit['id'] == manifest['fit']['id'] and fit['version'] == 1 and
            fit['targetBodySha256'] == body_sha and fit['hairDependency'] == dependency and fit['physics'] == 'rigid' and
            fit['attachment'] == {'humanoidBone': 'head', 'space': 'raw-head-bind-local', 'position': [0, 0, 0],
                                  'quaternion': [0, 0, 0, 1], 'scale': [1, 1, 1]} and
            fit['coverage'] == {'mode': 'none', 'preserveCompleteHair': True, 'preserveCompleteHeadSkin': True}, 'Hat body/hair fit and coverage identity')
    report = v.json(GENERATED+'build-report.json')
    v.pin(SCRIPTS+'build.py', report['generatorSha256'])
    for helper in report['helpers']:
        v.pin(helper['path'], helper['sha256'])
    require(report['spec'] == spec and report['geometryLicense'] == 'CC0-1.0', 'Hat stored producer identity')
    qa, cpu, source_qa = [v.json(BASE+n) for n in ['generated/qa-report.json', 'runtime-cpu-qa.json', 'qa-source.json']]
    for evidence in [manifest, fit, report, qa, cpu, source_qa]:
        require(evidence['runtimeAccepted'] is False, 'Hat source cannot grant runtime acceptance')
    require(qa['passed'] is True and qa['completeHairPreserved'] is True and qa['sourceBodyUnchanged'] is True and
            qa['coverageMask'] is None and qa['eyeForwardRayHatHits'] == 0 and qa['retainedCapTriangles'] == 388 and
            all(row['noncoplanarTrianglePairs'] == 0 for row in qa['sourceTriangleChecks']) and
            all(row['nonAdjacentSelfPairs'] == 0 for row in qa['componentSelfChecks']) and
            all(row['unoccludedCapCentroids'] > 0 for row in qa['capExposureRays']), 'Hat stored static QA failed')
    require(list(body.bind_by_name()['J_Bip_C_Head']) == qa['headInverseBindColumnMajor'], 'Hat actual original head inverse bind')
    require(cpu['passed'] is True and cpu['actualGLTFLoader'] is True and cpu['CPUOnly'] is True and
            cpu['assetSha256'] == READY['baseball-cap.glb'][0] and cpu['headLocalWorldErrorM'] < 1e-6 and
            all(cpu[key] is True for key in ['sameHeadParentTransform', 'completeOriginalBodyGeometryUnchanged', 'removedWithoutOriginalChildLoss']),
            'Hat stored loader CPU QA failed')
    require(source_qa['passed'] is True and source_qa['firstMirrorExportMatchesFiveFiles'] is True and
            source_qa['repeatPreservesBytesAndMtimes'] is True and source_qa['sourceDependenciesRechecked'] is True and
            all(row['zeroWrites'] is True and row['exit'] != 0 for row in source_qa['refusals']), 'Hat stored source QA failed')
    glb = GLB(payload['baseball-cap.glb'])
    require(not glb.doc.get('skins') and not glb.doc.get('animations') and not glb.doc.get('images') and not glb.doc.get('textures') and
            len(glb.doc['meshes']) == 2 and len(glb.doc['materials']) == 1, 'Hat actual rigid untextured geometry')
    vertices, triangles = 0, 0
    for node in glb.doc['nodes']:
        require(node.get('translation', [0, 0, 0]) == [0, 0, 0] and node.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1] and
                node.get('scale', [1, 1, 1]) == [1, 1, 1] and 'matrix' not in node, 'Hat actual head-local transform')
    for mesh in glb.doc['meshes']:
        for primitive in mesh['primitives']:
            require(not primitive.get('targets'), 'Hat unregistered morph')
            points = glb.accessor(primitive['attributes']['POSITION'])
            require(all(all(math.isfinite(x) for x in point) for point in points), 'Hat actual finite vertices')
            vertices += len(points)
            triangles += len(glb.accessor(primitive['indices']))//3
    require(vertices == qa['hatVertices'] == cpu['hatVertices'] == 2238 and triangles == qa['hatTriangles'] == cpu['hatTriangles'] == 4472,
            'Hat actual geometry counts')
    failure = v.json(BASE+'failure-1/manifest.json')
    require(failure['sha256'] != manifest['sha256'] and v.json(BASE+'failure-1/qa-report.json')['passed'] is False,
            'Hat first failed export remains distinct')
    edit = source_qa['brimEdit']
    require(edit['baseAssetSha256'] == manifest['sha256'] and edit['editAssetSha256'] != manifest['sha256'] and
            abs(edit['actualForwardExtentDeltaM']-.01) < 1e-7 and edit['shellPositionsIdentical'] is True, 'Hat retained single brim edit')
    return payload, {'id': manifest['id'], 'inventoryFiles': 27, 'assetSha256': manifest['sha256'],
                     'fitSha256': manifest['fit']['sha256'], 'manifestSha256': READY['manifest.json'][0],
                     'targetBodySha256': body_sha, 'hairDependency': dependency,
                     'retainedFailureAndBrimEditAdmitted': False, 'runtimeAccepted': False,
                     'scope': 'Frozen source/ready-byte identity and stored source-author CPU evidence. No browser, dynamics or visual approval.'}


def validate_hat(v, ident, require, GLB):
    require(ident['manifest'] == BASE+'package-files.json' and ident['manifestSha256'] == INVENTORY_SHA256, 'Hat frozen source version')
    v.pin('scripts/publish-hat-hair-v1.py', ident['publisherSha256'])
    payload, summary = validate_hat_source(v, require, GLB)
    published = (v.root/OUTPUT).exists()
    if published:
        require({p.relative_to(v.root/OUTPUT).as_posix() for p in (v.root/OUTPUT).rglob('*') if p.is_file()} == set(payload), 'Hat public file set')
        for name, data in payload.items():
            v.pin(OUTPUT+name, hashlib.sha256(data).hexdigest(), len(data))
    summary['publishedBytesMatchSource'] = published
    return summary
