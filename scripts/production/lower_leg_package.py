"""Read exact +20 mm source exports and publication without running producers."""
import hashlib
import json

BASE = 'assets-source/m2-lower-leg-proportion-v1/'
GENERATED = BASE+'generated/'
SCRIPTS = 'scripts/m2-lower-leg-proportion-v1/'
OUTPUT = 'prototype/public/assets/m2-lower-leg-proportion-v1/'
PREFIX = '/assets/m2-lower-leg-proportion-v1/'


def validate_lower_leg(v, ident, require, GLB):
    inventory = json.loads(v.pin(ident['manifest'], ident['manifestSha256']))
    rows = inventory['files']
    names = [r['path'] for r in rows]
    require(len(rows) == len(set(names)) == 24, 'Lower-leg inventory incomplete or duplicate')
    for row in rows:
        v.pin(row['path'], row['sha256'], row['bytes'])
    v.pin(SCRIPTS+'publish.py', ident['publisherSha256'])
    spec = v.json(BASE+'spec.json')
    require(spec['schema'] == 'zbgs-lower-leg-proportion-source-v1' and
            spec['id'] == 'male-lower-leg-plus20-v1' and spec['lowerLegLengthIncreaseM'] == .02,
            'Lower-leg supports exact male +20 mm only')
    for key in ['sourceBody', 'editableCheckpoint', 'forearmProfile']:
        ref = spec[key]
        v.pin(ref['path'], ref['sha256'])
    report = v.json(GENERATED+'build-report.json')
    v.pin(BASE+'spec.json', report['specSha256'])
    v.pin(SCRIPTS+'build.py', report['generatorSha256'])
    require(report['id'] == spec['id'] and report['sourceBody'] == spec['sourceBody'], 'Lower-leg source identity')
    fit = v.json(GENERATED+'fit.json')
    avatar_sha = report['avatarSha256']
    require(avatar_sha != spec['sourceBody']['sha256'] and
            fit['schema'] == 'zbgs-lower-leg-proportion-fit-v1' and
            fit['id'] == spec['id']+'-source-fit' and fit['version'] == 1 and fit['deltaM'] == .02 and
            fit['avatarSha256'] == avatar_sha and fit['sourceBodySha256'] == spec['sourceBody']['sha256'] and
            fit['originalBodyPreserved'] is True, 'Lower-leg derived fit identity')
    body = GLB(v.pin(GENERATED+'avatar.vrm', avatar_sha, report['avatarBytes']))
    manifest = v.json(GENERATED+'equipment.json')
    items = manifest['items']
    require(len(items) == 3 and {e['slot'] for e in items} == {'shoes', 'bottom', 'top'}, 'Lower-leg equipment set')
    original = v.json(spec['equipmentManifest'])
    require(len(report['equipment']) == len(fit['equipment']) == 3, 'Lower-leg equipment evidence count')
    equipment = []
    for item, receipt, fit_item in zip(items, report['equipment'], fit['equipment']):
        original_id = {'shoes': 'm1b-uniform-shoes', 'bottom': 'm1b-uniform-shorts-v1', 'top': 'm1b-uniform-top'}[item['slot']]
        original_style = {'shoes': 'm1b-uniform-shoes', 'bottom': 'm1b-tailored-shorts-v1', 'top': 'm1b-uniform-top'}[item['slot']]
        require(item['id'] == spec['id']+'-'+item['slot'] and item['fitId'] == item['id']+'-fit-v1' and
                item['styleId'] == original_style and
                fit_item == {k: item[k] for k in ['id', 'styleId', 'fitId', 'sha256']} and
                receipt['newId'] == item['id'] and receipt['newSha256'] == item['sha256'] and
                'materialRecipes' not in item, 'Lower-leg equipment fit identity')
        require(sum(r['id'] == original_id for r in spec['equipment']) == 1, 'Lower-leg original equipment set')
        ref = next(r for r in spec['equipment'] if r['id'] == original_id)
        source_item = v.item(original, ref['id'])
        source_path = v.url(source_item['url']) if source_item['url'].startswith('/') else 'prototype/public/assets/m1b/'+source_item['url']
        v.pin(source_path, ref['sha256'])
        require(receipt['source'] == {'path': source_path, 'sha256': ref['sha256']} and
                receipt['geometryAndGLBUnchanged'] == (item['slot'] != 'shoes') and
                (item['sha256'] == ref['sha256']) == (item['slot'] != 'shoes'), 'Lower-leg original/new equipment identity')
        equipment.append(v.equipment(item, avatar_sha, body, GENERATED+'equipment.json'))
    qa = v.json(GENERATED+'qa-report.json')
    upper = v.json(GENERATED+'upper-body-fit.json')
    upper_qa = v.json(GENERATED+'upper-body-qa.json')
    loader = v.json(GENERATED+'vrm-loader-qa.json')
    for evidence in [report, fit, qa, upper, upper_qa, loader]:
        require(evidence['runtimeAccepted'] is False, 'Lower-leg source cannot grant runtime acceptance')
    require(qa['passed'] is True and qa['repeatExportExact'] is True and
            qa['avatarSha256'] == avatar_sha and qa['sourceBodySha256'] == spec['sourceBody']['sha256'] and
            all(qa[k] is True for k in ['texturesAndFaceMorphsUnchanged', 'hipsKneesHeadUpperArmsUnchanged',
                                       'topologyUVWeightsUnchanged', 'actualVRMNormalizedMappingCPUReportPresent']),
            'Lower-leg stored source QA')
    require({r['side'] for r in qa['measuredRawLegs']} == {'left', 'right'} and
            all(abs(r['newLengthM']-r['oldLengthM']-.02) < 1e-12 for r in qa['measuredRawLegs']), 'Lower-leg measured +20 mm')
    require(loader['passed'] is True and loader['CPUOnly'] is True and
            loader['original']['sha256'] == spec['sourceBody']['sha256'] and loader['candidate']['sha256'] == avatar_sha,
            'Lower-leg actual VRM loader identity')
    top = next(e for e in items if e['slot'] == 'top')
    require(upper['sourceBodySha256'] == spec['sourceBody']['sha256'] and upper['avatarSha256'] == avatar_sha and
            upper['originalForearmProfile'] == spec['forearmProfile'] and upper['topSha256'] == top['sha256'] and
            upper['headAndArmRawRestExact'] is True and upper['selectedGeometryWeightsAndBindsExact'] is True and
            upper_qa['passed'] is True and upper_qa['sourceAndTopByteIdentity'] is True and
            upper_qa['measuredProfilesExactlyPreserved'] is True and upper_qa['avatarSha256'] == avatar_sha and
            upper_qa['topSha256'] == top['sha256'], 'Lower-leg upper-body source equivalence')
    profile_ref = fit['forearmCollision']
    profile = json.loads(v.pin(GENERATED+profile_ref['file'], profile_ref['sha256']))
    parent = v.json(spec['forearmProfile']['path'])
    require(upper_qa['forearmProfileSha256'] == profile_ref['sha256'] and
            profile_ref['bodySHA256'] == profile['bodySHA256'] == avatar_sha and
            profile['body'] == spec['id'] and profile['source'] == GENERATED+'avatar.vrm', 'Lower-leg profile derived identity')
    require({k: value for k, value in profile.items() if k not in ['body', 'source', 'bodySHA256', 'adaptationEvidence']} ==
            {k: value for k, value in parent.items() if k not in ['body', 'source', 'bodySHA256']}, 'Lower-leg measured profile equivalence')
    adaptation = profile['adaptationEvidence']
    require(adaptation['parentBodySHA256'] == spec['sourceBody']['sha256'] and
            adaptation['parentProfileSHA256'] == spec['forearmProfile']['sha256'] and
            adaptation['evidenceSource'] == GENERATED+'upper-body-fit.json', 'Lower-leg profile evidence identity')
    v.pin(adaptation['evidenceSource'], adaptation['evidenceSha256'])
    published = (v.root/OUTPUT).exists()
    if published:
        for name in ['avatar.vrm', 'fit.json', 'forearm-profile.json']+[e['url'] for e in items]:
            data = (v.root/(GENERATED+name)).read_bytes()
            v.pin(OUTPUT+name, hashlib.sha256(data).hexdigest(), len(data))
        expected = json.loads(json.dumps(manifest))
        for item in expected['items']:
            item['url'] = PREFIX+item['url']
        encoded = (json.dumps(expected, ensure_ascii=False, indent=2)+'\n').encode('utf-8')
        v.pin(OUTPUT+'equipment.json', hashlib.sha256(encoded).hexdigest(), len(encoded))
    return {'id': spec['id'], 'inventoryFiles': len(rows), 'sourceBodySha256': spec['sourceBody']['sha256'],
            'avatarSha256': avatar_sha, 'deltaM': .02, 'equipment': equipment,
            'forearmProfileSha256': profile_ref['sha256'], 'upperBodySourceEquivalenceStored': True,
            'publishedBytesMatchSource': published, 'runtimeAccepted': False,
            'scope': 'Exact stored exports, binds and CPU evidence only. Movement, contacts and visual review pending.'}
