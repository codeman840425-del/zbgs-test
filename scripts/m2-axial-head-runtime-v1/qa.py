"""CPU registration/read-only refusal checks in an owned module fixture."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('runtime_prepare', HERE / 'prepare.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
BASE = p.BASE
ROOT = p.ROOT
checks = []


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)


def run(*args):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout


source_spec, resources, extras = p.documents()
stage = BASE / 'generated-v2'
plan = json.loads((stage / 'publish-plan.json').read_bytes())
check('all staged resources match generated exact bytes', all((stage / k).read_bytes() == v for k, v in resources.items()))
check('all13 public destinations use only two new prefixes', len(resources) == 13 and all(
    k.startswith(('public/assets/m2-axial-head-runtime-v1/', 'public/assets/m2-axial-head-equipment-v1/')) for k in resources))
check('metadata revision preserves all first-stage public resource bytes', all((BASE / 'generated' / k).read_bytes() == v for k, v in resources.items()))
check('metadata revision preserves first-stage integration patch', (BASE / 'generated/integration.patch').read_bytes() == extras['integration.patch'])
check('publication plan distinguishes runtime targets from source snapshots', all(
    row['path'].startswith('prototype/src/') and row['sourceSnapshot']['path'].startswith('assets-source/m2-axial-head-runtime-v1/source-base/')
    for row in plan['runtimeTargets']))
check('identical repeat does not replace stage', 'identical-existing-stage' in run(sys.executable, '-B', str(HERE / 'prepare.py')))
for name in ['representative-batch.js', 'eye-blink-compatibility.js']:
    run('node', '--check', str(stage / 'patched-src' / name))
checks.append('both proposed JS modules pass node syntax')

# Actual modules import the original JSON and new generated JSON from fixture paths.
fixture = BASE / 'qa-fixture'
for mode in ['before', 'after']:
    folder = fixture / mode
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'package.json').write_text('{"type":"module"}\n')
    for key in ['batchV1', 'batchV2', 'layerProfiles']:
        ref = source_spec['inputs'][key]
        dest = folder / Path(ref.get('originalPath', ref['path'])).relative_to('prototype')
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(p.pinned(ref))
    for key in ['representativeModule', 'foundationModule', 'paletteModule']:
        ref = source_spec['inputs'][key]
        dest = folder / Path(ref.get('originalPath', ref['path'])).relative_to('prototype')
        dest.parent.mkdir(parents=True, exist_ok=True)
        raw = p.pinned(ref)
        if mode == 'after' and key == 'representativeModule':
            raw = extras['patched-src/representative-batch.js']
        dest.write_bytes(raw)
    if mode == 'after':
        for path, raw in resources.items():
            if path.endswith(('runtime-index.json', 'palette-manifest.json')):
                dest = folder / path
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(raw)
js = r"""
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as before from './before/src/representative-batch.js';
import * as after from './after/src/representative-batch.js';
import * as oldProfiles from './before/src/foundation-profiles.js';
import * as profiles from './after/src/foundation-profiles.js';
import * as oldPalette from './before/src/facial-palette-contract.js';
import * as palette from './after/src/facial-palette-contract.js';
const id='male-long-lean-axial-head-v1';
assert.deepEqual(after.REPRESENTATIVE_PRESETS.filter(p=>p.id!==id),before.REPRESENTATIVE_PRESETS);
assert.deepEqual(after.REPRESENTATIVE_NO_HAIR,before.REPRESENTATIVE_NO_HAIR);
assert.deepEqual(after.REPRESENTATIVE_UNPUBLISHED,before.REPRESENTATIVE_UNPUBLISHED);
assert.deepEqual(after.REPRESENTATIVE_PALETTES.slice(0,2),before.REPRESENTATIVE_PALETTES);
for(const [key,profile] of Object.entries(oldProfiles.FOUNDATION_PROFILES)){
  assert.deepEqual(profiles.foundationProfile(key),oldProfiles.foundationProfile(key));
  assert.deepEqual(palette.facialPaletteContract(profile.sha256),oldPalette.facialPaletteContract(profile.sha256));
  assert.deepEqual(palette.compatiblePaletteVersions(profile.sha256),oldPalette.compatiblePaletteVersions(profile.sha256));
}
const candidate=profiles.foundationProfile(id);
assert.equal(candidate.sha256,'83f4907f3943940b90a8876ed79496b20476f0d38ecf31414fb8b94f3bacb8f9');
assert.equal(candidate.label,'瘦长脸·仅头部候选');
assert.deepEqual(candidate.outfits.map(p=>p.index),[0,2]);
assert.deepEqual(Object.keys(candidate.ids).sort(),['pants','shoes','shorts','top']);
assert.equal(candidate.additionalEquipmentManifests,undefined);
assert.equal(candidate.sourceFloorY,0);
assert.equal(candidate.seatLayerThickness,.0036);
candidate.ids.top='changed';
assert.notEqual(profiles.foundationProfile(id).ids.top,'changed');
assert(!after.REPRESENTATIVE_NO_HAIR.some(p=>JSON.stringify(p).includes(id)));
const contract=palette.facialPaletteContract(candidate.sha256);
const doc=JSON.parse(readFileSync(new URL('./after/public'+contract.url,import.meta.url)));
assert.equal(doc.variants.length,1);
assert.equal(doc.variants[0].avatarSha256,candidate.sha256);
assert.deepEqual(palette.compatiblePaletteVersions(candidate.sha256),[contract.version]);
console.log(JSON.stringify({oldPresetCount:before.REPRESENTATIVE_PRESETS.length,newPresetCount:after.REPRESENTATIVE_PRESETS.length,oldProfilesPreserved:Object.keys(oldProfiles.FOUNDATION_PROFILES).length,newOutfits:candidate.outfits.map(p=>p.index),newPaletteSha256:contract.sha256}));
"""
(fixture / 'check.mjs').write_text(js, encoding='utf-8')
module_result = json.loads(run('node', str(fixture / 'check.mjs')))
checks.append('actual foundation/profile/palette imports preserve every old profile and recipe palette version')
checks.append('new exact-body profile has only pants/shorts outfits, clone isolation and its own palette')

for name, mutate in [
    ('wrong-target-hash', lambda s: s['inputs']['targetBody'].update(sha256='0' * 64)),
    ('missing-target', lambda s: s['inputs']['targetBody'].update(path='assets-source/m2-axial-head-runtime-v1/missing.vrm')),
]:
    bad = copy.deepcopy(source_spec)
    mutate(bad)
    folder = BASE / 'qa-negative' / name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'spec.json').write_bytes(p.encode(bad))
    p.BASE = folder
    try:
        p.documents()
    except (ValueError, RuntimeError, AssertionError) as error:
        (folder / 'result.json').write_bytes(p.encode({'status': 'rejected', 'error': str(error), 'generatedOutputExists': (folder / 'generated').exists()}))
        check(name + ' refused before publication output', not (folder / 'generated').exists())
    else:
        raise AssertionError(name + ' accepted')
    finally:
        p.BASE = BASE

result = {'schema': 'axial-head-runtime-preparation-qa-v1', 'status': 'passed', 'checks': checks,
    'moduleReadback': module_result, 'planSha256': p.sha((stage / 'publish-plan.json').read_bytes()),
    'patchSha256': p.sha((stage / 'integration.patch').read_bytes()), 'browserExecuted': False,
    'limitations': ['No real manager/rendered expression or posed outfit acceptance is claimed.',
        'The happy.65/blink1/oh.66 new mouth contact remains a known diagnostic defect.']}
(BASE / 'qa-result-v2.json').write_bytes(p.encode(result))
print(json.dumps(result, ensure_ascii=False))
