import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

from record_budget import LIP_IMAGE_PREFIX, ROOT, SKIN_IMAGE_PREFIX, image_cost, measure, model_roles, skin_cache


class RecordBudgetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else ROOT
        root = ROOT / 'evidence/m2-production-fixed-v2/results'
        paths = [root / 'native-male-edited.json', root / 'native-female-created.json',
                 ROOT / 'prototype/public/assets/record-consumer-v1/male-material.json']
        cls.records = [json.loads(path.read_bytes()) for path in paths]
        cls.temp = tempfile.TemporaryDirectory(prefix='gamemake-record-budget-')
        cls.addClassCleanup(cls.temp.cleanup)

    def run_measure(self, records):
        path = pathlib.Path(self.temp.name) / 'input.json'
        path.write_text(json.dumps(records), encoding='utf-8')
        return measure(path, self.source, 'm2-technical-v1')

    def test_exact_records_cover_models_material_and_standalone_textures(self):
        report = self.run_measure(self.records)
        self.assertEqual(report['status'], 'over-budget')
        self.assertEqual(report['ordinaryPCPerformance'], 'unmeasured')
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

    def test_ear_geometry_instances_follow_selected_side_count(self):
        reasons = ['Selected ears model']
        self.assertEqual(model_roles(reasons, 'pair'), [('accessory', 'ears', 2)])
        self.assertEqual(model_roles(reasons, 'right'), [('accessory', 'ears', 1)])

    def test_native_skin_keeps_four_linear_images_per_actor(self):
        public = ROOT / 'prototype/public'
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
                image = image_cost(ROOT, public, row, 'PNG')
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
                image_cost(ROOT, public, {**row, 'reasons':[SKIN_IMAGE_PREFIX + 'unknown']}, 'PNG')
            with tempfile.TemporaryDirectory() as workspace:
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
