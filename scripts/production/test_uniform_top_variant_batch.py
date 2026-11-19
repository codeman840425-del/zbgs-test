import copy
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from variant_batch import run
from variant_matrix import _resolve_reference, validate_matrix_files
from production_paths import project_output


ROOT = Path(__file__).resolve().parents[2]
INPUTS = ROOT / 'assets-source/variant-matrix-v1'
MATRIX = INPUTS / 'uniform-top-texture-matrix.json'
REQUEST = INPUTS / 'uniform-top-texture-request.json'


def read(path):
    return json.loads(path.read_bytes())


def create_and_read_back(runtime_root, request, signed_records=None):
    """Execute a real emitted batch through the D02 parser and common CPU loader."""
    result = subprocess.run(['node', '--input-type=module', '-e', r"""
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire, registerHooks} from 'node:module';

const {batchCreates, parseRequest} = createRequire(import.meta.url)('./scripts/character-production-cli.cjs');
const hook = registerHooks({load(url, context, next) {
  return next(url, url.endsWith('.json') ? {...context, importAttributes: {type: 'json'}} : context);
}});
try {
  const {THREE} = await import('./scripts/headless-avatar-node.mjs');
  const {performCharacterProduction} = await import('./prototype/src/character-production.js');
  const {canonicalJson} = await import('./prototype/src/character-record.js');
  const {prepareRecordedCharacter} = await import('./prototype/src/character-record-consumer.js');
  const jobs = await batchCreates(parseRequest(readFileSync(process.argv[1])));
  const prior = process.argv[2] ? JSON.parse(readFileSync(process.argv[2])) : null;
  const scene = new THREE.Scene();
  const env = {scene, renderer: {compileAsync() { throw Error('Unexpected GPU path'); }}};
  const evidence = [];
  const resourcePin = ({id, slot, sha256}) => ({id, slot, sha256});
  const byId = (a,b) => a.id.localeCompare(b.id);
  for (const job of jobs) {
    const selection = job.edits[0].selection;
    assert.equal(selection.role, 'pants-top-far');
    const {query} = await performCharacterProduction({schema:job.schema, operation:'query', bodyType:job.bodyType}, env);
    const {resources:original} = query.appearance.equipment.sets.find(look => look.index === 0);
    assert.deepEqual(selection.equipment.filter(row => row.slot !== 'top').sort(byId),
      [resourcePin(original.pants), resourcePin(original.shoes)].sort(byId));
    const forged = structuredClone(job);
    forged.edits[0].selection.equipment.find(row => row.slot === 'top').sha256 = original.top.sha256;
    await assert.rejects(performCharacterProduction(forged, env), /exact equipment set/);

    const {record} = await performCharacterProduction(job, env);
    const recipe = record.appearanceRecipe;
    assert.equal(recipe.base.bodyType, job.bodyType);
    assert.equal(recipe.base.sha256, selection.bodySha256);
    assert.deepEqual(record.identity, job.identity);
    assert.deepEqual(Object.values(recipe.equipment.resources).map(resourcePin).sort(byId), selection.equipment.sort(byId));
    const saved = prior ? prior.find(r => r.identity.id === job.identity.id) : record;
    assert.deepEqual(saved.identity, record.identity);
    assert.equal(canonicalJson(saved.appearanceRecipe), canonicalJson(recipe));
    assert.equal(saved.integrity.recipeSha256, record.integrity.recipeSha256);
    const avatar = await prepareRecordedCharacter(saved, env);
    try {
      assert.equal(avatar.recordSha256, saved.integrity.recordSha256);
      assert.equal(avatar.controller.outfit, recipe.equipment.index);
      const {equipment} = avatar.avatar.getOutfitInfo();
      assert.equal(equipment.items.top.loaded, false);
      assert.equal(equipment.items.topFar.visible, true);
      const activeCoverage = equipment.bodyCoverage?.activeItems ?? [];
      avatar.attach();
      avatar.update(1 / 60, {action:'idle'});
      assert.equal(canonicalJson((await avatar.capture()).appearanceRecipe.equipment), canonicalJson(recipe.equipment));
      evidence.push({bodyType:job.bodyType, recordSha256:avatar.recordSha256, ...recipe.base,
        identity:record.identity, outfitIndex:recipe.equipment.index, role:recipe.equipment.role,
        equipment:selection.equipment, activeCoverage, bodyAsset:query.body.url,
        rejectedOriginalTopSha:true});
    } finally { avatar.dispose(); }
    assert.equal(scene.children.length, 0);
  }
  console.log(JSON.stringify(evidence));
} finally { hook.deregister(); }
""", str(request), *([str(signed_records)] if signed_records else [])], cwd=runtime_root, text=True, encoding='utf-8', capture_output=True, check=False)
    if result.returncode:
        raise AssertionError(result.stderr or result.stdout)
    return json.loads(result.stdout)


class UniformTopVariantBatchTests(unittest.TestCase):
    def test_lite_bodies_reproduce_the_previously_signed_outfit_selections(self):
        matrix = INPUTS / 'uniform-lite-top-matrix.json'
        request = INPUTS / 'uniform-lite-top-request.json'
        reference = ROOT / 'evidence/m2-female-uniform-texture-game-v1'
        variants = read(matrix)['styles'][0]['variants']
        self.assertEqual([r['status'] for r in variants], ['candidate', 'candidate'])
        scratch = project_output(ROOT / 'output/m2-lite-matrix-test', __file__)
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as tmp:
            temp = Path(tmp)
            plan = run(matrix, request, temp / 'plan', ROOT, diagnostic=True)
            self.assertEqual((plan['acceptedCount'], plan['candidateCount'], plan['rejectedCount']), (0, 2, 0))
            batch = temp / 'plan' / plan['creationBatches'][0]['path']
            produced = read(batch)
            previous = read(reference / 'far-batch-input.json')
            # The D02 outfit contract selects exact members as a set. Both
            # payloads must otherwise be identical, including identity and role.
            for payload in (produced, previous):
                for job in payload['requests']:
                    job['edits'][0]['selection']['equipment'].sort(key=lambda e: e['id'])
            self.assertEqual(produced, previous)
            signed = reference / 'far-records.json'
            observed = create_and_read_back(ROOT, batch, signed)
            records = read(signed)
            self.assertEqual([a['activeCoverage'] for a in observed], [['source-female-uniform-texture-v1-top-1k'], []])
            for actor, record in zip(observed, records, strict=True):
                self.assertEqual(actor['identity'], record['identity'])
                self.assertEqual(actor['recordSha256'], record['integrity']['recordSha256'])
                self.assertEqual(actor['sha256'], record['appearanceRecipe']['base']['sha256'])
                equipment = record['appearanceRecipe']['equipment']
                self.assertEqual((actor['outfitIndex'], actor['role']), (equipment['index'], equipment['role']))
                previous_items = [{k: entry[k] for k in ('id', 'slot', 'sha256')} for entry in equipment['resources'].values()]
                self.assertEqual(actor['equipment'], sorted(previous_items, key=lambda e: e['id']))

            bad = read(request)
            bad['sharedLook']['outfitRole'] = 'pants'
            wrong_role = temp / 'near.request.json'
            wrong_role.write_text(json.dumps(bad), encoding='utf-8')
            declined = run(matrix, wrong_role, temp / 'near', ROOT, diagnostic=True)
            self.assertEqual((declined['rejectedCount'], declined['creationBatches']), (2, []))

    def test_lite_matrix_rejects_crossed_body_and_original_top_mask(self):
        data = read(INPUTS / 'uniform-lite-top-matrix.json')
        wrong_body = copy.deepcopy(data)
        female, male = wrong_body['styles'][0]['variants']
        female['bodyAsset'] = male['bodyAsset']
        self.assertTrue(any('SHA mismatch' in reason for reason in validate_matrix_files(wrong_body, ROOT)))
        female = data['styles'][0]['variants'][0]
        wrong = '/assets/female-uniform-texture-release-v1/coverage-top.json'
        female.update(coverageManifest=wrong, coverageManifestSha256=hashlib.sha256(_resolve_reference(ROOT, wrong).read_bytes()).hexdigest())
        self.assertTrue(any('topId differs' in reason for reason in validate_matrix_files(data, ROOT)))

    def test_real_matrix_requires_exact_body_and_coverage(self):
        matrix = read(MATRIX)
        self.assertEqual(validate_matrix_files(matrix, ROOT), [])
        female, male = matrix['styles'][0]['variants']
        crossed = copy.deepcopy(matrix)
        crossed['styles'][0]['variants'][0]['bodyAsset'] = male['bodyAsset']
        self.assertTrue(any('SHA mismatch' in reason for reason in validate_matrix_files(crossed, ROOT)))
        old_coverage = '/assets/body-coverage-risk-v1/female-top.json'
        female.update(coverageManifest=old_coverage,
                      coverageManifestSha256=hashlib.sha256(_resolve_reference(ROOT, old_coverage).read_bytes()).hexdigest())
        self.assertTrue(any('topId differs' in reason for reason in validate_matrix_files(matrix, ROOT)))

    def test_shared_plan_is_reproducible_and_consumed_by_real_production(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'experiments', prefix='uniform-top-plan-test-') as temp:
            folder = Path(temp)
            first, repeat = folder / 'first', folder / 'repeat'
            result = run(MATRIX, REQUEST, first, ROOT, diagnostic=True)
            self.assertEqual((result['acceptedCount'], result['candidateCount'], result['rejectedCount']), (0, 2, 0))
            run(MATRIX, REQUEST, repeat, ROOT, diagnostic=True)
            self.assertEqual({p.relative_to(first): p.read_bytes() for p in first.rglob('*.json')},
                             {p.relative_to(repeat): p.read_bytes() for p in repeat.rglob('*.json')})
            actors = create_and_read_back(ROOT, first / result['creationBatches'][0]['path'])
            self.assertEqual([actor['bodyType'] for actor in actors], ['female', 'source-male-ab9a-release-v1'])
            self.assertEqual([actor['outfitIndex'] for actor in actors], [5, 1])
            self.assertEqual([actor['activeCoverage'] for actor in actors], [['m1-female-uniform-top-1k-v1'], []])

    def test_role_with_the_original_top_cannot_replace_the_texture_variant(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'experiments', prefix='uniform-top-wrong-role-') as temp:
            folder = Path(temp)
            data = read(REQUEST)
            data['sharedLook']['outfitRole'] = 'pants'
            request = folder / 'wrong-role.request.json'
            request.write_text(json.dumps(data), encoding='utf-8')
            result = run(MATRIX, request, folder / 'plan', ROOT, diagnostic=True)
            self.assertEqual((result['candidateCount'], result['rejectedCount']), (0, 2))
            self.assertEqual(result['creationBatches'], [])
            self.assertTrue(all('exact matrix equipment' in item['reason'] for item in result['items']))


if __name__ == '__main__':
    unittest.main()
