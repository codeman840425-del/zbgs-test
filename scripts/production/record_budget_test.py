from contextlib import redirect_stdout
from copy import deepcopy
import io
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from asset_budget import AssetCost
from record_budget import (LIP_IMAGE_PREFIX, ROOT, SKIN_IMAGE_PREFIX, UnsupportedBudget, collected_records,
                           image_cost, legacy_texture_groups, main, measure, model_roles,
                           fitted_head_family, runtime_source_sha, skin_cache, validate_fitted_head_recipe,
                           validate_fitted_warm_skin_record)


SOCK_RECORDS = ROOT / 'evidence/m2-native-short-socks-room-v1/records.json'
SOCK_CATALOG = 'assets/native-crew-template-v1/equipment.json'
SIGNED_LOOKS = ROOT / 'evidence/m2-uniform-agent-handoff-v1/records.json'
UNIFORM_LITE_RECORDS = ROOT / 'evidence/m2-uniform-lite-operator-v1/records.json'
UNIFORM_HEAD_EVIDENCE = ROOT / 'evidence/m2-uniform-lite-head-intake-v1'
UNIFORM_WARM_EVIDENCE = ROOT / 'evidence/m2-uniform-skin-v1'
FIXED_LEGACY = ROOT / 'experiments/worktrees/garment-80fb16b7'
FIXED_UNIFORM_HEAD = ROOT / 'experiments/worktrees/head-ba9a95f6'


class ReviewedLegacyAppearanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (FIXED_LEGACY / 'prototype/src/character-appearance.js').is_file():
            raise unittest.SkipTest('Exact 5859 source worktree is unavailable')
        cls.source = FIXED_LEGACY
        cls.public = cls.source / 'prototype/public'

    def measure(self, input_file=SIGNED_LOOKS):
        return measure(input_file, self.source, 'm2-technical-v1')

    def test_signed_case_has_aligned_distinct_texture_and_pixel_bounds(self):
        report = self.measure()
        female, male = report['records']
        self.assertFalse(report['runtimeAdmission'])
        self.assertEqual(report['accountingMode'], 'reviewed-legacy-appearance-cache-v1')
        self.assertNotIn('reviewedLegacyAppearanceCache', male)
        cache = female['reviewedLegacyAppearanceCache']
        self.assertEqual(cache['runtimeReconciliation'], 'not-linked')
        self.assertEqual(cache['recordSha256'], female['recordSha256'])
        self.assertEqual(cache['skinTone']['additionalTextureObjects'], 0)
        for role, width, height, mib in [('hair',1024,1024,8), ('brow',1024,256,2),
                                         ('iris',1024,512,4), ('lips',1024,1024,8)]:
            group = cache['groups'][role]
            with self.subTest(role=role):
                self.assertEqual((group['width'], group['height'], group['distinctDerivedTextures']), (width,height,2))
                self.assertFalse(group['generateMipmaps'])
                self.assertEqual(group['logicalTextureRgba8Bytes'], mib * 1024**2)
                self.assertEqual(group['derivedCanvasRgba8Bytes'], mib * 1024**2)
                persisted = mib * 1024**2 if role in ('iris','lips') else 0
                self.assertEqual(group['retainedImageDataBytes'], persisted)
                self.assertEqual(group['retainedOriginalPixelArrayBytes'], persisted)
        self.assertEqual(cache['totals']['retainedPixelPayloadUpperBoundBytes'], 46 * 1024**2)
        self.assertEqual(cache['totals']['transientImageDataAllocationBytes'], 10 * 1024**2)
        self.assertEqual({row['usage'] for row in female['standaloneImages']}, {'legacy-facial-palette-reference'})
        self.assertEqual(sum(row['addedTextureObjectUpperBound'] for row in female['standaloneImages']), 0)
        counts = female['selectedCost']['totals']
        self.assertEqual(counts['textureObjects'] - counts['textures'], 8)
        self.assertEqual(counts['rgba8MipBytes'] - sum(row['cost']['metrics']['rgba8MipBytes'] for row in female['models'] if row['selected']),
                         22 * 1024**2)

    def test_exact_family_can_resign_and_actor_totals_do_not_deduplicate_cache(self):
        # Create new valid envelopes through the repository path. No integrity
        # or appearance admission fixture is patched in the ensuing estimator.
        script = """
import {readFileSync} from 'node:fs';
import {createCharacterRecord} from './prototype/src/character-record.js';
import {deriveCharacterResourceIdentities} from './prototype/src/character-runtime-record.js';
const [record] = JSON.parse(readFileSync(process.argv[1]));
async function make(id, edit = () => {}) {
  const appearanceRecipe = structuredClone(record.appearanceRecipe);
  edit(appearanceRecipe);
  const {liveAccessories, equipmentMaterials, provenance} = record;
  const resourceIdentities = deriveCharacterResourceIdentities(appearanceRecipe,liveAccessories,equipmentMaterials);
  return createCharacterRecord({identity:{...record.identity,id}, appearanceRecipe,liveAccessories,
    equipmentMaterials,provenance,resourceIdentities,now:record.createdAt},{validateResources:()=>({status:'pending'})});
}
const alias = await make('cache-alias-female');
const otherColor = await make('cache-brown-female', recipe => { recipe.appearance.hairColor='brown'; });
const unknown = await make('cache-unreviewed-female', recipe => {
  recipe.appearance.hairStyle='original'; recipe.hairAssetSha256=null; recipe.hairFit=null;
});
console.log(JSON.stringify({sameFamily:[record,alias,otherColor],unknown}));
"""
        result = subprocess.run(['node', '--input-type=module', '-e', script, str(SIGNED_LOOKS)], cwd=self.source,
                                capture_output=True, encoding='utf-8', check=True)
        records = json.loads(result.stdout)
        with tempfile.TemporaryDirectory(dir=ROOT/'experiments', prefix='appearance-cache-records-') as temp:
            path = pathlib.Path(temp) / 'input.json'
            path.write_text(json.dumps(records['sameFamily']), encoding='utf-8')
            report = self.measure(path)
            rows = report['records']
            self.assertEqual(len({row['recordSha256'] for row in rows}), 3)
            self.assertEqual(len({row['closureSourceBytes'] for row in rows}), 1)
            self.assertEqual(report['closureUnionSourceBytes'], rows[0]['closureSourceBytes'])
            self.assertEqual(report['sumAcrossSelectedActors']['textureObjects'], 3 * rows[0]['selectedCost']['totals']['textureObjects'])
            self.assertEqual([row['reviewedLegacyAppearanceCache']['totals']['distinctDerivedTextures'] for row in rows], [8,8,8])
            path.write_text(json.dumps(records['unknown']), encoding='utf-8')
            with self.assertRaisesRegex(UnsupportedBudget, 'hair resource family is outside') as unknown:
                self.measure(path)
            self.assertEqual(unknown.exception.code, 'unsupported-hair-color-budget')

    def test_unknown_path_and_loader_cannot_create_partial_estimates(self):
        actual = collected_records(self.source, SIGNED_LOOKS)
        for label, test in [('Selected hairstyle model','cache resource path'), ('Facial palette mask: iris','legacy palette input')]:
            with self.subTest(label=label):
                fixture = deepcopy(actual)
                row = next(row for row in fixture['records'][0]['files'] if label in row['reasons'])
                row['path'] = 'assets/missing-test-identity.png'
                with patch('record_budget.collected_records', return_value=fixture):
                    with self.assertRaisesRegex(UnsupportedBudget, test):
                        self.measure()
        with patch.dict('record_budget.REVIEWED_LEGACY_CACHE_SOURCE', {'src/facial-palette.js': '0'*64}):
            with self.assertRaisesRegex(UnsupportedBudget, 'cache implementation.*facial-palette'):
                self.measure()

    def test_unreviewed_material_dimensions_format_and_sampler_refuse(self):
        look = json.loads(SIGNED_LOOKS.read_bytes())[0]['appearanceRecipe']['appearance']
        body = AssetCost(self.public/'assets/foundation/base-female-roundtrip.vrm')
        for case, data, key, value, reason in (
            ('name', body.doc['materials'][5], 'name', 'Unknown_HAIR', 'source hair or brow'),
            ('format', body.doc['images'][9], 'mimeType', 'image/jpeg', 'source encoding'),
            ('mips', body.doc['samplers'][0], 'minFilter', 9987, 'sampler or mip policy'),
            ('dimensions', body.doc['images'][9], 'bufferView', body.doc['images'][16]['bufferView'], 'format or dimensions'),
        ):
            with self.subTest(case=case), patch.dict(data, {key:value}):
                with self.assertRaisesRegex(UnsupportedBudget, reason):
                    legacy_texture_groups(body, look)


class RecordBudgetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else ROOT
        root = ROOT / 'evidence/m2-production-fixed-v2/results'
        paths = [root / 'native-male-edited.json', root / 'native-female-created.json',
                 ROOT / 'prototype/public/assets/record-consumer-v1/male-material.json']
        cls.records = [json.loads(path.read_bytes()) for path in paths]
        cls.temp = tempfile.TemporaryDirectory(prefix='gamemake-record-budget-', dir=ROOT / 'experiments')
        cls.addClassCleanup(cls.temp.cleanup)

    def run_measure(self, records):
        path = pathlib.Path(self.temp.name) / 'input.json'
        path.write_text(json.dumps(records), encoding='utf-8')
        return measure(path, self.source, 'm2-technical-v1')

    def run_cli(self, path):
        stdout = io.StringIO()
        argv = ['record_budget.py', 'measure', str(path), '--source-root', str(self.source),
                '--budget-version', 'm2-technical-v1']
        with patch.object(sys, 'argv', argv), redirect_stdout(stdout):
            code = main()
        return code, json.loads(stdout.getvalue())

    def uniform_head_recipe(self):
        registry = self.source / 'prototype/src/fitted-head-appearances.json'
        if not registry.is_file():
            self.skipTest('Selected source predates the uniform head registration')
        original = json.loads(UNIFORM_LITE_RECORDS.read_bytes())[0]
        recipe = deepcopy(original['appearanceRecipe'])
        head, = [row for row in json.loads(registry.read_bytes()) if row['bodySha256'] == recipe['base']['sha256']]
        fit = head['hair']['fit']
        recipe.update(hairAssetSha256=head['hair']['assetSha256'], paletteVersion=head['palette']['version'],
                      hairFit={'kind':'explicit-fit-v1', 'id':fit['id'], 'version':fit['version'], 'sha256':fit['sha256']})
        recipe['appearance'].update(hairStyle=head['hair']['id'], hairColor='blonde', eyeColor='brown', lipColor='coral')
        return original, recipe

    def sign_uniform_head(self, original, recipe, identifier):
        script = """
import {readFileSync} from 'node:fs';
import {createCharacterRecord} from './prototype/src/character-record.js';
import {deriveCharacterResourceIdentities} from './prototype/src/character-runtime-record.js';
const {original, appearanceRecipe, identifier} = JSON.parse(readFileSync(0, 'utf8'));
const {liveAccessories,equipmentMaterials,provenance} = original;
const resourceIdentities = deriveCharacterResourceIdentities(appearanceRecipe,liveAccessories,equipmentMaterials);
const result = await createCharacterRecord({identity:{...original.identity,id:identifier},
  appearanceRecipe,liveAccessories,equipmentMaterials,provenance,resourceIdentities,now:original.createdAt},
  {validateResources:()=>({status:'pending'})});
console.log(JSON.stringify(result));
"""
        result = subprocess.run(['node', '--input-type=module', '-e', script], cwd=self.source, check=True,
                                capture_output=True, encoding='utf-8', input=json.dumps({
                                    'original':original, 'appearanceRecipe':recipe, 'identifier':identifier}))
        return json.loads(result.stdout)

    def test_uniform_head_signed_actor_cost_and_original_only_record(self):
        original, recipe = self.uniform_head_recipe()
        signed = self.sign_uniform_head(original, recipe, 'budget-uniform-head-candidate')
        report = self.run_measure([original, signed])
        original_cost, colored = report['records']
        self.assertNotIn('reviewedLegacyAppearanceCache', original_cost)
        self.assertEqual(original_cost['selectedCost']['totals']['rgba8MipBytes'], 103809708)
        cache = colored['reviewedLegacyAppearanceCache']
        self.assertEqual(cache['recordSha256'], signed['integrity']['recordSha256'])
        self.assertEqual(cache['explicitHairFit'], recipe['hairFit'])
        self.assertEqual(cache['skinTone']['selection'], 'original')
        self.assertEqual(cache['totals']['logicalTextureRgba8Bytes'], 22 * 1024**2)
        self.assertEqual(cache['totals']['distinctDerivedTextures'], 8)
        self.assertEqual(cache['totals']['retainedPixelPayloadUpperBoundBytes'], 46 * 1024**2)
        self.assertEqual(sum(row['encodedBytes'] for row in colored['standaloneImages']), 74954)
        self.assertTrue(all(row['addedTextureObjectUpperBound'] == 0 for row in colored['standaloneImages']))
        self.assertEqual(len(cache['paletteReferencePaths']), 3)
        self.assertEqual(colored['selectedCost']['totals']['textureObjects'], colored['selectedCost']['totals']['textures'] + 8)
        self.assertFalse(report['runtimeAdmission'])

    def test_uniform_head_refuses_unreviewed_fit_rules_skin_and_color(self):
        _, recipe = self.uniform_head_recipe()
        family = fitted_head_family(recipe)
        validate_fitted_head_recipe(recipe, family)
        for section, field, value in [
            ('base','sha256','0'*64), ('hairFit','sha256','0'*64), (None,'paletteVersion','appearance-color-v3'),
            (None,'rulesVersion','workbench-appearance-rules-v9'), ('appearance','skinTone','warm'),
            ('appearance','eyebrowColor','blonde'), ('appearance','lipColor','rose'), ('appearance','eyeColor','blue'),
            ('appearance','hairColor','brown'), ('appearance','lipColor','original'), (None,'surface',{'layers':['unreviewed']}),
        ]:
            with self.subTest(section=section, field=field):
                bad = deepcopy(recipe)
                (bad[section] if section else bad)[field] = value
                with self.assertRaisesRegex(UnsupportedBudget, 'Unreviewed fitted head'):
                    validate_fitted_head_recipe(bad, family)

    def test_archived_fitted_head_budget_does_not_change(self):
        if not (FIXED_UNIFORM_HEAD / 'prototype/node_modules/three').is_dir():
            self.skipTest('Exact f7ea runtime with locked dependencies is unavailable')
        actual = measure(UNIFORM_HEAD_EVIDENCE/'signed-pair.json', FIXED_UNIFORM_HEAD, 'm2-technical-v1')
        archived = json.loads((UNIFORM_HEAD_EVIDENCE/'budget-signed-pair.json').read_bytes())
        self.assertEqual(actual, archived)

    def test_warm_skin_rejects_other_combinations_and_coverage(self):
        signed, _ = json.loads((UNIFORM_HEAD_EVIDENCE/'signed-pair.json').read_bytes())
        record, _ = json.loads((UNIFORM_HEAD_EVIDENCE/'budget-signed-pair.json').read_bytes())['records']
        recipe = signed['appearanceRecipe']
        family = fitted_head_family(recipe)
        warm = family['warmSkin']
        recipe['appearance']['skinTone'] = 'warm'
        recipe['paletteVersion'] = warm['paletteVersion']
        signed['integrity']['recipeSha256'] = warm['recipeSha256']
        self.assertEqual(validate_fitted_head_recipe(recipe, family), warm)
        validate_fitted_warm_skin_record(record, signed, warm)
        for section, field, value in [
            (None, 'paletteVersion', family['palette']['version']), (None, 'skinToneManifestSha256', '0'*64),
            ('appearance', 'skinTone', 'deep'), ('appearance', 'hairStyle', 'original'),
            ('appearance', 'eyeColor', 'original'), ('appearance', 'lipColor', 'original'),
        ]:
            with self.subTest(section=section, field=field):
                bad = deepcopy(recipe)
                (bad[section] if section else bad)[field] = value
                with self.assertRaisesRegex(UnsupportedBudget, 'Unreviewed fitted head'):
                    validate_fitted_head_recipe(bad, family)
        bad = deepcopy(record)
        bad['equipmentIds'][0] = 'other-top'
        with self.assertRaisesRegex(UnsupportedBudget, 'Unreviewed fitted warm skin record or outfit'):
            validate_fitted_warm_skin_record(bad, signed, warm)
        bad = deepcopy(record)
        next(row for row in bad['files'] if row['path'] == warm['coverage'][0]['path'])['sha256'] = '0'*64
        with self.assertRaisesRegex(UnsupportedBudget, 'Unreviewed fitted warm skin coverage or texture resources'):
            validate_fitted_warm_skin_record(bad, signed, warm)

    def test_uniform_warm_and_original_have_equal_selected_costs(self):
        source_registry = self.source / 'prototype/src/fitted-head-appearances.json'
        if not source_registry.is_file() or '"skinTone"' not in source_registry.read_text(encoding='utf-8'):
            self.skipTest('Selected source predates the fitted warm skin registration')
        original, _ = json.loads((UNIFORM_HEAD_EVIDENCE/'signed-pair.json').read_bytes())
        recipe = deepcopy(original['appearanceRecipe'])
        warm = fitted_head_family(recipe)['warmSkin']
        recipe['appearance']['skinTone'] = 'warm'
        recipe['paletteVersion'] = warm['paletteVersion']
        signed = self.sign_uniform_head(original, recipe, 'budget-uniform-warm-skin')
        self.assertEqual(signed['integrity']['recipeSha256'], warm['recipeSha256'])
        report = self.run_measure([original, signed])
        control, colored = report['records']
        self.assertEqual(control['selectedCost'], colored['selectedCost'])
        self.assertEqual(control['startupAndSelectedCost'], colored['startupAndSelectedCost'])
        self.assertEqual(control['standaloneImages'], colored['standaloneImages'])
        self.assertEqual(control['files'], colored['files'])
        cache = colored['reviewedLegacyAppearanceCache']
        self.assertEqual(cache['skinTone']['additionalTextureObjects'], 0)
        self.assertEqual(cache['skinTone']['additionalTextureRgba8Bytes'], 0)
        self.assertEqual(cache['skinTone']['multiplierSrgb'], warm['multiplierSrgb'])
        self.assertEqual(cache['totals'], control['reviewedLegacyAppearanceCache']['totals'])
        self.assertFalse(report['runtimeAdmission'])

    def test_browser_signed_pair_passes_each_record_but_exceeds_concurrent_reference(self):
        value = subprocess.run(['node', str(UNIFORM_WARM_EVIDENCE/'budget-concurrent-proof.mjs')], cwd=ROOT,
                               capture_output=True, encoding='utf-8', check=True)
        actual = json.loads(value.stdout)
        self.assertEqual(actual, json.loads((UNIFORM_WARM_EVIDENCE/'budget-concurrent-proof.json').read_bytes()))
        individual = actual['perRecordStaticBudget']
        combined = actual['concurrentSelectedActorReference']
        self.assertEqual(individual['status'], 'within-static-limits')
        self.assertEqual(combined['actorCount'], 2)
        for row in individual['records']:
            self.assertEqual(row['status'], 'within-static-limits')
            self.assertEqual(row['selected']['rgba8MipBytes'], 138063528)
            self.assertEqual(row['startupAndSelected']['rgba8MipBytes'], 138063528)
        self.assertEqual(combined['status'], 'over-temporary-reference')
        self.assertEqual(combined['sumAcrossSelectedActors']['rgba8MipBytes'], 276127056)
        self.assertEqual(combined['sumAcrossSelectedActors']['textureObjects'], 76)
        self.assertEqual(combined['closureUnionSourceBytes'], 27896903)
        self.assertEqual(combined['excesses'], [
            {'metric':'rgba8MipBytes', 'actual':276127056, 'limit':268435456, 'excess':7691600},
        ])
        self.assertFalse(actual['runtimeAdmission'])
        self.assertEqual(actual['ordinaryPCPerformance'], 'unmeasured')

    def test_exact_records_cover_models_material_and_standalone_textures(self):
        report = self.run_measure(self.records)
        self.assertEqual(report['status'], 'over-budget')
        self.assertEqual(report['ordinaryPCPerformance'], 'unmeasured')
        self.assertNotIn('accountingMode', report)
        self.assertIn('bone data textures', report['textureEstimateScope']['unmodeledRendererAllocations'])
        self.assertIn('morph data array textures', report['textureEstimateScope']['unmodeledRendererAllocations'])
        male, female, old = report['records']
        self.assertEqual([item['recordSha256'] for item in report['records']],
                         [record['integrity']['recordSha256'] for record in self.records])
        self.assertEqual({model['class'] for model in male['models']}, {'body','garment','hair','accessory'})
        native_hair = next(model for model in male['models'] if model['class'] == 'hair')
        self.assertEqual(native_hair['hairPhysics'], {'source':'embedded-model', 'springJoints':71, 'colliders':22,
                                                     'expectedRuntimeManagerJointCount':59})
        self.assertEqual({image['usage'] for image in male['standaloneImages']},
                         {'native-palette-color','native-palette-reference','native-body-coverage'})
        reference = next(image for image in male['standaloneImages'] if image['usage'] == 'native-palette-reference')
        self.assertGreater(reference['decodedRgba8Bytes'], 0)
        self.assertEqual(reference['addedTextureObjectUpperBound'], 0)
        self.assertIn('studio-microphone-v1', [model['id'] for model in female['models']])
        self.assertEqual(old['materialRecipes'][0]['additionalTextureObjects'], 0)
        self.assertIn('m1b-uniform-pants', [model['id'] for model in old['models'] if not model['selected']])
        self.assertGreater(old['startupAndSelectedCost']['totals']['fileBytes'], old['selectedCost']['totals']['fileBytes'])
        self.assertEqual(old['selectedCost']['totals']['rgba8MipBytes'], 168821416)
        self.assertLess(report['closureUnionSourceBytes'], sum(row['closureSourceBytes'] for row in report['records']))
        for key in report['sumAcrossSelectedActors']:
            self.assertEqual(report['sumAcrossSelectedActors'][key],
                             sum(row['selectedCost']['totals'][key] for row in report['records']))

    def test_standalone_record_object(self):
        result = self.run_measure(self.records[0])
        self.assertEqual(len(result['records']), 1)

    def test_oversized_batch_and_duplicate_identity_fail(self):
        for records in [[], [self.records[0]] * 5]:
            with self.assertRaisesRegex(ValueError, 'one to four'):
                self.run_measure(records)
        with self.assertRaisesRegex(ValueError, 'duplicate-identity'):
            self.run_measure([self.records[0], self.records[0]])

    def test_changed_record_fails_without_estimate(self):
        record = json.loads(json.dumps(self.records[0]))
        record['identity']['name'] += ' invalid'
        with self.assertRaisesRegex(ValueError, 'record-hash-mismatch'):
            self.run_measure(record)
        code, result = self.run_cli(pathlib.Path(self.temp.name) / 'input.json')
        self.assertEqual((code, result['status']), (2, 'invalid'))
        self.assertIn('record-hash-mismatch', result['error'])
        self.assertNotIn('records', result)

    def test_supplement_keeps_body_cover_and_counts_only_the_selected_sock_glb(self):
        if not (self.source / 'prototype/public' / SOCK_CATALOG).is_file():
            self.skipTest('Selected historical runtime predates the sock supplement')
        report = measure(SOCK_RECORDS, self.source, 'm2-technical-v1')
        legacy, crew = report['records']
        self.assertEqual(report['status'], 'over-budget')
        self.assertEqual(report['ordinaryPCPerformance'], 'unmeasured')
        self.assertEqual([row['status'] for row in report['records']], ['over-budget', 'over-budget'])
        cover, = crew['standaloneImages']
        self.assertEqual(legacy['standaloneImages'], [cover])
        self.assertEqual((cover['usage'], cover['addedTextureObjectUpperBound'], cover['addedRgba8EstimateBytes']),
                         ('native-body-coverage', 4, 64 * 1024**2))
        for row in report['records']:
            catalog, = [file for file in row['files'] if file['path'] == SOCK_CATALOG]
            self.assertEqual((catalog['bytes'], catalog['reasons']), (6006, ['Additive body equipment catalog']))
        legacy_models = {model['id']: model for model in legacy['models']}
        crew_models = {model['id']: model for model in crew['models']}
        sock, = [model for key, model in crew_models.items() if key not in legacy_models]
        self.assertEqual(sock['id'], 'native-7586-template-plain-crew-socks-v1')
        self.assertEqual((sock['class'], sock['selected'], sock['placements'], sock['assetExcesses']),
                         ('garment', True, 1, []))
        self.assertFalse(any(file['path'] == sock['path'] for file in legacy['files']))
        selected_sock, = [file for file in crew['files'] if file['path'] == sock['path']]
        self.assertEqual(selected_sock['reasons'], ['Selected outfit: ' + sock['id']])
        metrics = sock['cost']['metrics']
        self.assertEqual((metrics['fileBytes'], metrics['nodeTriangles'], metrics['textures'], metrics['rgba8MipBytes']),
                         (85872, 2256, 0, 0))
        removed = legacy_models.keys() - crew_models.keys()
        self.assertEqual(removed, {'studio-glasses-v1', 'studio-microphone-v1'})
        self.assertEqual(legacy_models['body']['assetExcesses'], crew_models['body']['assetExcesses'])
        for section in ('selectedCost', 'startupAndSelectedCost'):
            old, new = legacy[section]['totals'], crew[section]['totals']
            self.assertEqual(new['fileBytes'] - old['fileBytes'], -74984)
            self.assertEqual(new['placedNodeTriangles'] - old['placedNodeTriangles'], -4596)
            self.assertEqual(new['textureObjects'], old['textureObjects'])
            self.assertEqual(new['rgba8MipBytes'], old['rgba8MipBytes'])

    def test_unreviewed_coverage_or_loader_reports_unsupported_without_estimate(self):
        if not (self.source / 'prototype/public' / SOCK_CATALOG).is_file():
            self.skipTest('Selected historical runtime predates the sock supplement')
        for changed in ('body-texture-coverage.js', 'equipment.js'):
            def replaced_hash(source, filename):
                if filename == changed:
                    return '0' * 64
                return runtime_source_sha(source, filename)

            with self.subTest(changed=changed), patch('record_budget.runtime_source_sha', side_effect=replaced_hash):
                code, result = self.run_cli(SOCK_RECORDS)
                self.assertEqual((code, result['status'], result['code']),
                                 (2, 'unsupported', 'unsupported-runtime-implementation'))
                self.assertIn('prototype/src/' + changed, result['error'])
                self.assertNotIn('records', result)

    def test_ear_geometry_instances_follow_selected_side_count(self):
        reasons = ['Selected ears model']
        self.assertEqual(model_roles(reasons, 'pair'), [('accessory', 'ears', 2)])
        self.assertEqual(model_roles(reasons, 'right'), [('accessory', 'ears', 1)])

    def test_native_skin_keeps_four_linear_images_per_actor(self):
        public = self.source / 'prototype/public'
        package = public / 'assets/native-skin-tone-package-v1'
        entries = json.loads((package / 'registry.json').read_bytes())['entries']
        self.assertEqual({row['bodyType'] for row in entries},
                         {'native-contour-roundness-a-v1', 'native-contour-cheek-b-v1'})
        for entry in entries:
            manifest = json.loads((package / entry['bodyType'] / 'manifest.json').read_bytes())
            images = []
            for field, descriptor in [('face', manifest['face']['authored']),
                                      ('eyeline', manifest['eyeline']['authored']),
                                      ('body', manifest['body']['authored']),
                                      ('covered body', manifest['body']['coveredAuthored'])]:
                path = descriptor['url'].lstrip('/')
                row = {'path':path, 'sha256':descriptor['sha256'], 'bytes':(public/path).stat().st_size,
                       'reasons':[SKIN_IMAGE_PREFIX + field]}
                image = image_cost(self.source, public, row, 'PNG')
                binding, = image['nativeSkinBindings']
                self.assertEqual(binding['field'], field)
                self.assertEqual(image['addedRgba8EstimateBytes'], 4 * image['width'] * image['height'] * 4)
                images.append(image)
            cache = skin_cache(images)
            self.assertEqual((cache['textureObjectLowerBound'], cache['textureObjectUpperBound']), (4, 16))
            self.assertEqual(cache['decodedImageBitmaps'], 4)
            self.assertEqual(cache['rgba8LowerBoundBytes'], 37 * 1024**2)
            self.assertEqual(cache['rgba8UpperBoundBytes'], 148 * 1024**2)
            self.assertEqual(cache['imageBitmapRgba8Bytes'], 37 * 1024**2)
            self.assertEqual(sum(image['encodedBytes'] for image in images), 1990649)
            with self.assertRaisesRegex(ValueError, 'four distinct fields'):
                skin_cache([*images[:-1], images[0]])
            with self.assertRaisesRegex(ValueError, 'Unsupported native skin tone image roles'):
                image_cost(self.source, public, {**row, 'reasons':[SKIN_IMAGE_PREFIX + 'unknown']}, 'PNG')
            with tempfile.TemporaryDirectory(dir=ROOT/'experiments', prefix='cache-budget-runtime-source-') as workspace:
                modified_root = pathlib.Path(workspace)
                implementation = modified_root / 'prototype/src/character-appearance.js'
                implementation.parent.mkdir(parents=True)
                implementation.write_bytes(b'unreviewed runtime')
                with self.assertRaisesRegex(ValueError, 'Unsupported native skin tone resource implementation'):
                    image_cost(modified_root, public, row, 'PNG')

    def test_historical_warm_records_preserve_per_actor_cold_estimates(self):
        if not (self.source/'prototype/src/native-skin-tone.js').is_file():
            self.skipTest('Selected historical runtime predates native skin')
        records = ROOT/'evidence/m2-native-skin-game-handoff-v1/records.json'
        report = measure(records, self.source, 'm2-technical-v1')
        for row in report['records']:
            self.assertIn('nativeSkinToneCache', row)
            cache = row['nativeSkinToneCache']
            self.assertEqual(cache['decodedImageBitmaps'], 4)
            self.assertEqual(cache['imageBitmapRgba8Bytes'], 37 * 1024**2)
            self.assertEqual(cache['rgba8UpperBoundBytes'], 148 * 1024**2)
            self.assertEqual(cache['textureObjectUpperBound'], 16)
            self.assertEqual({image['usage'] for image in row['standaloneImages'] if image.get('nativeSkinBindings')},
                             {'native-skin-face','native-skin-eyeline','native-skin-body-base','native-skin-body-covered'})

    def test_native_lip_records_estimate_cold_and_retained_cache_separately(self):
        if not (self.source/'prototype/src/native-lip-color-contract.js').is_file():
            self.skipTest('Selected historical runtime predates native lip')
        evidence = ROOT/'evidence'
        lip_records = evidence/'m2-native-lip-game-handoff-v1/records.json'
        warm_plain = evidence/'m2-native-skin-game-handoff-v1/records.json'
        roundness_green = evidence/'m2-native-batch-iris-room-v2/native-contour-roundness-a-v1/green.json'
        edited = measure(lip_records, self.source, 'm2-technical-v1')['records']
        warm = measure(warm_plain, self.source, 'm2-technical-v1')['records']
        original, = measure(roundness_green, self.source, 'm2-technical-v1')['records']
        self.assertEqual([row['nativeAppearanceTextureCache']['coldState'] for row in edited],
                         ['original-lip','warm-lip'])
        self.assertEqual(edited[0]['selectedCost']['totals']['rgba8MipBytes'] -
                         original['selectedCost']['totals']['rgba8MipBytes'], 16 * 1024**2)
        self.assertEqual(edited[0]['selectedCost']['totals']['textureObjects'] -
                         original['selectedCost']['totals']['textureObjects'], 4)
        self.assertEqual(edited[1]['selectedCost']['totals']['rgba8MipBytes'],
                         warm[1]['selectedCost']['totals']['rgba8MipBytes'])
        self.assertEqual(edited[1]['selectedCost']['totals']['textureObjects'],
                         warm[1]['selectedCost']['totals']['textureObjects'])
        states = {'original-plain':(0,0), 'original-lip':(1,4), 'warm-plain':(4,37), 'warm-lip':(4,37)}
        for row in [original, *edited, *warm]:
            cache = row['nativeAppearanceTextureCache']
            self.assertEqual(cache['coldLoad'], cache['coldLoadByState'][cache['coldState']])
            for name, (count, rgba8_mib) in states.items():
                cold = cache['coldLoadByState'][name]
                self.assertEqual(cold['decodedImageBitmaps'], count)
                self.assertEqual(cold['textureObjectUpperBound'], count*4)
                self.assertEqual(cold['rgba8UpperBoundBytes'], rgba8_mib * 4 * 1024**2)
                self.assertEqual(cold['imageBitmapRgba8Bytes'], rgba8_mib * 1024**2)
            retained = cache['retainedAfterVisitingAllFourStates']
            self.assertEqual(retained['decodedImageBitmaps'], 6)
            self.assertEqual(retained['textureObjectUpperBound'], 24)
            self.assertEqual(retained['imageBitmapRgba8Bytes'], 45 * 1024**2)
            self.assertEqual(retained['rgba8UpperBoundBytes'], 180 * 1024**2)
        original_files = edited[0]['standaloneImages']
        warm_files = edited[1]['standaloneImages']
        self.assertEqual([image['usage'] for image in original_files
                          if image.get('nativeSkinBindings') or image.get('nativeLipBinding')], ['native-lip-face'])
        self.assertEqual({image['usage'] for image in warm_files if image.get('nativeSkinBindings') or image.get('nativeLipBinding')},
                         {'native-lip-face','native-skin-eyeline','native-skin-body-base','native-skin-body-covered'})
        lip_image = next(image for image in original_files if image.get('nativeLipBinding'))
        bad_role = {'path':lip_image['path'], 'sha256':lip_image['sha256'], 'bytes':lip_image['encodedBytes'],
                    'reasons':[LIP_IMAGE_PREFIX + 'unreviewed']}
        with self.assertRaisesRegex(ValueError, 'Unsupported native lip color image roles'):
            image_cost(self.source, self.source/'prototype/public', bad_role, 'PNG')

    def test_reviewed_hair_color_and_sidecar_regression_records(self):
        review = subprocess.run(['node', 'evidence/m2-record-budget-review-v1/review.mjs'], cwd=ROOT, check=True,
                                capture_output=True, encoding='utf-8')
        cases = {row['id']:row for row in map(json.loads, review.stdout.splitlines())}
        original = cases['shorts-original']
        self.assertEqual((original['textures'], original['rgba8']), (28, 168821416))
        blonde = cases['shorts-blonde']
        self.assertEqual((blonde['exit'], blonde['status']), (2, 'unsupported'))
        self.assertIn('Canvas/Texture', blonde['error'])
        self.assertNotIn('textures', blonde)
        ponytail = cases['ponytail']
        self.assertEqual((ponytail['hairMetrics'], ponytail['hairColliders']), (6, 3))


if __name__ == '__main__':
    unittest.main(argv=sys.argv[:1], verbosity=2)
