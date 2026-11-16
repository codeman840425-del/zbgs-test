"""Read the frozen female ponytail source and its exact three-file release."""
import hashlib
import json
import math
import ast

BASE = 'assets-source/m2-long-hair-v1/'
GENERATED = BASE+'generated/'
SCRIPTS = 'scripts/m2-long-hair-v1/'
OUTPUT = 'prototype/public/assets/m2-long-hair-v1/'
PREFIX = '/assets/m2-long-hair-v1/'
REVISION = BASE+'revisions/rootjoin-v2/'
REVISION_OUTPUT = 'prototype/public/assets/m2-long-hair-rootjoin-v2/'
REVISION_PREFIX = '/assets/m2-long-hair-rootjoin-v2/'


def inventory_paths():
    names = [BASE+n for n in ['.gitattributes', 'README.md', 'spec.json', 'provenance.json', 'source-correction.json', 'initial-clearance-failure.json']]
    names += [SCRIPTS+n for n in ['.gitattributes', 'requirements.txt', 'build.py', 'qa.py', 'qa-runtime.mjs', 'publish.py']]
    names += [GENERATED+n for n in ['build-report.json', 'female-ponytail.glb', 'fit.json', 'manifest.json', 'qa-report.json', 'runtime-cpu-qa.json']]
    names += [GENERATED+'parameter-variant/'+n for n in ['female-ponytail.glb', 'fit.json', 'manifest.json', 'spec.json']]
    names += [BASE+'failed-source-v1/'+n for n in ['build-report.json', 'female-ponytail.glb', 'fit.json', 'parameter-variant/female-ponytail.glb']]
    return set(names)


def validate_rootjoin(v, ident, original_identity, require, GLB):
    require(ident['id'] == 'rootjoin-v2' and ident['manifest'] == REVISION+'package-files.json', 'Long-hair curated revision identity')
    rows = json.loads(v.pin(ident['manifest'], ident['manifestSha256']))['files']
    expected = {REVISION+n for n in ['README.md', 'spec.json', 'build-report.json', 'correction-evidence.json',
                'female-ponytail.glb', 'fit.json', 'manifest.json', 'qa-report.json', 'qa-output.json', 'runtime-cpu-qa.json',
                'attempt-1/failure.json', 'attempt-1/female-ponytail.glb', 'attempt-2/failure.json', 'attempt-2/female-ponytail.glb']}
    expected.update(SCRIPTS+n for n in ['rootjoin-v2.py', 'qa-rootjoin-v2.mjs'])
    require(len(rows) == 16 and {r['path'] for r in rows} == expected, 'Long-hair revision frozen inventory incomplete or extra export')
    for row in rows:
        v.pin(row['path'], row['sha256'], row['bytes'])
    publisher = v.pin(SCRIPTS+'publish-rootjoin-v2.py', ident['publisherSha256'])
    guard = [node.value.value for node in ast.parse(publisher).body if isinstance(node, ast.Assign) and
             any(isinstance(target, ast.Name) and target.id == 'MANIFEST_SHA' for target in node.targets)]
    require(guard == [ident['releaseManifestSha256']], 'Long-hair revision publisher exact manifest guard')
    spec = v.json(REVISION+'spec.json')
    require(spec['schema'] == 'character-hair-rootjoin-source-v2' and spec['version'] == 2 and
            spec['styleId'] == 'female-ponytail-v1' and spec['license'] == 'CC0-1.0' and
            spec['sourceInventorySha256'] == original_identity['manifestSha256'], 'Long-hair revision source identity')
    for name, key in [('female-ponytail.glb', 'sourceAssetSha256'), ('fit.json', 'sourceFitSha256'), ('manifest.json', 'sourceManifestSha256')]:
        v.pin(GENERATED+name, spec[key])
    report = v.json(REVISION+'build-report.json')
    v.pin(SCRIPTS+'rootjoin-v2.py', report['generatorSha256'])
    require(report['spec'] == spec and report['trace']['sourceAssetSha256'] == spec['sourceAssetSha256'] and
            report['trace']['connectedSurfaceComponents'] == 1 and report['trace']['skeletonAndInverseBindsUnchanged'] is True,
            'Long-hair revision stored construction identity')
    manifest = v.json(REVISION+'manifest.json')
    v.pin(REVISION+'manifest.json', ident['releaseManifestSha256'])
    fit = v.json(REVISION+'fit.json')
    old_fit = v.json(GENERATED+'fit.json')
    old_manifest = v.json(GENERATED+'manifest.json')
    require(manifest['id'] == fit['styleId'] == spec['styleId'] and manifest['version'] == 2 and
            manifest['fit']['id'] == fit['id'] == 'female-ponytail-v1-rootjoin-fit-v2' and
            manifest['fit']['version'] == fit['version'] == 2 and
            manifest['url'] == REVISION_PREFIX+'female-ponytail.glb' and manifest['fit']['url'] == REVISION_PREFIX+'fit.json',
            'Long-hair revision curated fit/version/URLs')
    require(fit['schema'] == 'character-hair-fit-v2' and
            {k: value for k, value in fit.items() if k not in ['id', 'version', 'assetSha256']} ==
            {k: value for k, value in old_fit.items() if k not in ['id', 'version', 'assetSha256']} and
            all(manifest[k] == old_manifest[k] for k in ['schema', 'physics', 'skinned', 'headLocal', 'mount', 'sourceMaterial', 'compatibleBodies', 'boneNames']),
            'Long-hair revision original body/attachment/physics contract')
    v.pin(REVISION+'fit.json', manifest['fit']['sha256'])
    asset = v.pin(REVISION+'female-ponytail.glb', manifest['sha256'], manifest['bytes'])
    require(fit['assetSha256'] == manifest['sha256'] and manifest['sha256'] != spec['sourceAssetSha256'], 'Long-hair revision asset identity')
    failed_shas = []
    for attempt in ['attempt-1', 'attempt-2']:
        row = next(r for r in rows if r['path'] == REVISION+attempt+'/female-ponytail.glb')
        failed_shas.append(row['sha256'])
    require(manifest['sha256'] not in failed_shas, 'Long-hair failed attempt cannot become curated revision')
    glb = GLB(asset)
    old_glb = GLB(v.pin(GENERATED+'female-ponytail.glb', spec['sourceAssetSha256']))
    require(glb.bind_by_name() == old_glb.bind_by_name() and len(glb.doc['meshes']) == len(glb.doc['skins']) == 1 and
            not glb.doc.get('animations'), 'Long-hair revision actual skeleton identity')
    primitive = glb.doc['meshes'][0]['primitives'][0]
    attrs = primitive['attributes']
    positions, weights, joints = [glb.accessor(attrs[k]) for k in ['POSITION', 'WEIGHTS_0', 'JOINTS_0']]
    require(len(positions) == len(weights) == len(joints) == report['trace']['vertices'] == 609 and
            len(glb.accessor(primitive['indices'])) == report['trace']['triangles']*3 == 1162*3, 'Long-hair revision actual geometry counts')
    require(all(all(math.isfinite(x) for x in point+weight) and min(weight) >= 0 and abs(sum(weight)-1) < 1e-6 and
                all(0 <= joint < 8 for joint in joint_ids) for point, weight, joint_ids in zip(positions, weights, joints)),
            'Long-hair revision actual skin weights')
    qa, cpu, output_qa = [v.json(REVISION+n) for n in ['qa-report.json', 'runtime-cpu-qa.json', 'qa-output.json']]
    for evidence in [manifest, fit, report, qa, cpu, output_qa]:
        require(evidence['runtimeAccepted'] is False, 'Long-hair revision cannot grant runtime/visual acceptance')
    require(qa['passed'] is True and qa['connectedComponents'] == 1 and qa['physicsAndProxiesUnchanged'] is True and
            qa['originalBodyAndV1FilesUnchanged'] is True and qa['checks']['newConnectorSelfPairs'] == 0 and
            all(c['connectorNoncoplanarTrianglePairs'] == 0 for c in qa['checks']['sourceBodyHeadAndCollar']),
            'Long-hair revision source QA failed')
    require(cpu['passed'] is True and cpu['CPUOnly'] is True and cpu['assetSha256'] == manifest['sha256'] and
            cpu['fitPhysicsExactlyV1'] is True and cpu['sourceHeadAndFrozenV1Unchanged'] is True and
            cpu['repeatExportBytesAndTimesIdentical'] is True and cpu['distalV1PoseErrorM'] == 0 and
            cpu['restPositionErrorM'] < 1e-6 and cpu['capDisplacementM'] < 1e-6 and
            cpu['sharedConnectorVertices'] == 22, 'Long-hair revision CPU QA failed')
    require(output_qa['passed'] is True and output_qa['conflictWritesZero'] is True and
            output_qa['defaultRevisionOutputsUnchanged'] is True, 'Long-hair revision output QA failed')
    published = (v.root/REVISION_OUTPUT).exists()
    if published:
        require({p.relative_to(v.root/REVISION_OUTPUT).as_posix() for p in (v.root/REVISION_OUTPUT).rglob('*') if p.is_file()} ==
                {'female-ponytail.glb', 'fit.json', 'manifest.json'}, 'Long-hair revision public file set')
        for name in ['female-ponytail.glb', 'fit.json', 'manifest.json']:
            data = (v.root/(REVISION+name)).read_bytes()
            v.pin(REVISION_OUTPUT+name, hashlib.sha256(data).hexdigest(), len(data))
    return {'revision': ident['id'], 'version': 2, 'inventoryFiles': 16, 'assetSha256': manifest['sha256'],
            'fitSha256': manifest['fit']['sha256'], 'manifestSha256': ident['releaseManifestSha256'],
            'failedAttemptAssetsAdmitted': False, 'publishedBytesMatchSource': published,
            'runtimeAccepted': False, 'visualAcceptance': 'not-established',
            'scope': 'Curated revision identity, actual binds/weights and stored static/CPU evidence only.'}


def validate_long_hair(v, ident, require, GLB):
    rows = json.loads(v.pin(ident['manifest'], ident['manifestSha256']))['files']
    require(len(rows) == 26 and {r['path'] for r in rows} == inventory_paths(), 'Long-hair frozen inventory incomplete, duplicate or extra export')
    for row in rows: v.pin(row['path'], row['sha256'], row['bytes'])
    spec = v.json(BASE+'spec.json'); report = v.json(GENERATED+'build-report.json')
    require(spec['schema'] == 'character-long-hair-source-v1' and spec['id'] == 'female-ponytail-v1' and spec['lengthM'] == .39 and
            spec['parameterVariant'] == {'parameter': 'lengthM', 'value': .43} and report['spec'] == spec, 'Long-hair exact source parameters')
    source = GLB(v.pin(spec['source']['path'], spec['source']['sha256']))
    require(spec['source']['sha256'] == '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95', 'Long-hair exact original female required')
    v.pin(SCRIPTS+'build.py', report['generatorSha256'])
    require(list(source.bind_by_name()['J_Bip_C_Head']) == report['base']['headInverseBindColumnMajor'], 'Long-hair actual raw head bind identity')
    require(v.json(BASE+'provenance.json')['license'] == 'CC0-1.0', 'Long-hair source license')
    qa, cpu = [v.json(GENERATED+n) for n in ['qa-report.json', 'runtime-cpu-qa.json']]
    dependency = qa['geometryDiagnosticDependency']; require(dependency['path'] == 'scripts/m2-socks-layer-v1/qa.py', 'Long-hair geometry helper identity')
    v.pin(dependency['path'], dependency['sha256'])
    require(qa['passed'] is True and qa['exactRepeatExport'] is True and all(qa[k] is True for k in ['sourceCapPositionsUVAndTopologyPreserved', 'newTubeAndTieClosed', 'sourceMaterialAndTexturesPreserved']) and
            qa['sourcePatchAlphaMinimum'] == 255, 'Long-hair stored source QA')
    require(cpu['passed'] is True and cpu['threeRevision'] == '187' and cpu['officialSpringPackageVersion'] == '3.5.5' and cpu['isolatedManager'] is True and
            cpu['oneStepFinite'] is True and cpu['officialJoints'] == 6 and cpu['officialColliders'] == 3 and cpu['capVertexDisplacementM'] == 0 and
            cpu['actualTailVertexDisplacementM'] > .02 and cpu['resetErrorM'] < 1e-6, 'Long-hair official API/weighted deformation CPU proof')
    for data in [report, qa, cpu]: require(data['runtimeAccepted'] is False and data['GPUUsed'] is False, 'Long-hair source cannot grant dynamic acceptance')
    require(len(qa['measurements']) == 2 and all(m['weightedJoints'] == 8 and m['mixedWeightVertices'] > 100 and
            all(c['newHairCrossingTrianglePairs'] == 0 for c in m['newHairClearance']) and
            all(c['minimumRestTailSphereMarginM'] >= 0 for c in m['restSpringTailProxyMargins']) for m in qa['measurements']), 'Long-hair stored rest clearance proof')
    manifest = v.json(GENERATED+'manifest.json'); fit = v.json(GENERATED+'fit.json')
    require(manifest['schema'] == 'character-hairstyle-v1' and manifest['version'] == 1 and manifest['id'] == fit['styleId'] == spec['id'] and
            manifest['physics'] == fit['physics'] == 'vrm-spring' and manifest['skinned'] is True and manifest['headLocal'] is True and manifest['mount'] == 'head' and
            manifest['compatibleBodies'] == [spec['source']['sha256']] and manifest['sourceMaterial'] == fit['sourceMaterial'] == spec['sourceMaterial'], 'Long-hair manifest/fit identity')
    require(manifest['url'] == PREFIX+'female-ponytail.glb' and manifest['fit']['url'] == PREFIX+'fit.json' and
            manifest['fit']['id'] == fit['id'] and manifest['fit']['version'] == fit['version'] == 1, 'Long-hair curated runtime URLs/fit')
    asset = v.pin(GENERATED+'female-ponytail.glb', manifest['sha256'], manifest['bytes'])
    v.pin(GENERATED+'fit.json', manifest['fit']['sha256'])
    require(fit['schema'] == 'character-hair-fit-v2' and fit['targetBodySha256'] == fit['sourceBodySha256'] == spec['source']['sha256'] and
            fit['assetSha256'] == manifest['sha256'] == report['baseAssetSha256'] == cpu['assetSha256'] and
            fit['attachment'] == {'bone': 'head', 'space': 'raw-head-bind-local', 'position': [0, 0, 0], 'quaternion': [0, 0, 0, 1], 'scale': [1, 1, 1]} and
            fit['rawBone'] == 'J_Bip_C_Head' and fit['hideOriginal'] == {'materialNames': [spec['sourceMaterial']], 'hideWholeBody': False}, 'Long-hair attachment/body/asset fit')
    require(fit['runtimeAccepted'] is False and manifest['runtimeAccepted'] is False and fit['dynamics']['schema'] == 'hair-spring-v1', 'Long-hair explicit spring source fit')
    glb = GLB(asset); d = glb.doc; names = ['HairAnchor']+['Pony'+str(i) for i in range(7)]
    require(not d.get('animations') and len(d['skins']) == len(d['meshes']) == len(d['materials']) == 1 and d['materials'][0]['name'] == spec['sourceMaterial'], 'Long-hair actual skinned asset structure')
    skin = d['skins'][0]
    require([d['nodes'][j]['name'] for j in skin['joints']] == names == manifest['boneNames'] and len(set(n['name'] for n in d['nodes'])) == len(d['nodes']), 'Long-hair actual auxiliary bone identities')
    p = d['meshes'][0]['primitives'][0]; attrs = p['attributes']
    require(not p.get('targets') and len(glb.accessor(attrs['POSITION'])) == report['base']['vertices'] == 691 and len(glb.accessor(p['indices'])) == 1322*3, 'Long-hair actual geometry counts')
    mixed = 0
    for point, joints, weights in zip(glb.accessor(attrs['POSITION']), glb.accessor(attrs['JOINTS_0']), glb.accessor(attrs['WEIGHTS_0'])):
        require(all(math.isfinite(x) for x in point+weights) and all(0 <= j < 8 for j in joints) and min(weights) >= 0 and abs(sum(weights)-1) < 1e-6, 'Long-hair actual finite skin weights')
        mixed += sum(w > .001 for w in weights) > 1
    require(mixed == 288 and [(j['bone'], j['child']) for j in fit['dynamics']['joints']] == [('Pony'+str(i), 'Pony'+str(i+1)) for i in range(6)], 'Long-hair actual mixed skin/spring chain')
    require(all(all(j[k] == value for k, value in spec['spring'].items()) and 0 < j['hitRadius'] < .03 for j in fit['dynamics']['joints']), 'Long-hair declared spring settings')
    require(len(fit['dynamics']['colliders']) == 3 and [(c['bone'], c['shape']) for c in fit['dynamics']['colliders']] == [('head', 'sphere'), ('head', 'capsule'), ('chest', 'capsule')], 'Long-hair exact semantic proxies')
    variant = v.pin(GENERATED+'parameter-variant/female-ponytail.glb', report['variantAssetSha256'])
    require(variant != asset and abs(qa['measurements'][1]['leafCenterY']-qa['measurements'][0]['leafCenterY']+.04) < 1e-9, 'Long-hair actual changed-length source proof')
    correction = v.json(BASE+'source-correction.json'); failure = v.json(BASE+'initial-clearance-failure.json')
    require(correction['geometryCorrections'] == 1 and any(c['newHairCrossingTrianglePairs'] > 0 for m in failure['measurements'] for c in m['newHairClearance']), 'Long-hair retained initial failure identity')
    published = (v.root/OUTPUT).exists()
    if published:
        require({p.relative_to(v.root/OUTPUT).as_posix() for p in (v.root/OUTPUT).rglob('*') if p.is_file()} == {'female-ponytail.glb', 'fit.json', 'manifest.json'}, 'Long-hair exact public file set')
        for name in ['female-ponytail.glb', 'fit.json', 'manifest.json']:
            data = (v.root/(GENERATED+name)).read_bytes(); v.pin(OUTPUT+name, hashlib.sha256(data).hexdigest(), len(data))
    require(len(ident['revisions']) == 1, 'Long-hair exact curated revision list')
    revisions = [validate_rootjoin(v, revision, ident, require, GLB) for revision in ident['revisions']]
    return {'id': spec['id'], 'inventoryFiles': len(rows), 'publishedFiles': 3, 'assetSha256': manifest['sha256'], 'revisions': revisions,
            'auxiliaryJoints': 8, 'springJoints': 6, 'retainedFailedExportsAdmitted': False, 'publishedBytesMatchSource': published,
            'runtimeAccepted': False, 'scope': 'Source-author frozen identity/readback and stored CPU evidence. No independent game dynamics or visual acceptance.'}
