import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import sole_variant as sole
from sole_variant_review import compare


FEMALE = sole.ROOT / 'assets-source/sole-variant-female-v1/recipe.json'


class SoleVariantTests(unittest.TestCase):
    def test_publish_retry_and_conflict_preserve_existing_files(self):
        with TemporaryDirectory(dir=sole.checked(sole.SOURCE)) as folder, patch.object(sole,'PUBLIC_ASSETS',Path(folder)):
            public = Path(folder) / sole.SOURCE.name
            pins = sole.publish()
            self.assertEqual(pins, sole.publish())
            self.assertEqual(pins, sole.publish(check_only=True))
            files = {p.name:p.read_bytes() for p in public.iterdir()}
            self.assertEqual(set(files),{'fit.json','equipment.json','cc0-texture-release-platform-shoes-v1.glb'})
            files['fit.json'] += b' '
            (public/'fit.json').write_bytes(files['fit.json'])
            with self.assertRaisesRegex(ValueError,'Existing sole variant differs'):
                sole.publish()
            self.assertEqual(files,{p.name:p.read_bytes() for p in public.iterdir()})

    def test_original_release_rebuilds_byte_for_byte(self):
        self.assertEqual(sole.run(sole.GENERATED,check_only=True), {
            'cc0-texture-release-platform-shoes-v1.glb':'8b23ba4f3add78322c1b3246b3ac80387d8eb2f2dd8e300b6443a33b0ed619c7',
            'equipment.json':'f1edfc429dcaab20f82c6401eb1419127bda9c167394384c5c8ad8aef6768b70',
            'fit.json':'30cc456e449b31864df4150556a7930f4cc6057aaa07adbb4e8b1e5e81a16ac9'})

    def test_female_source_independent_readback_and_fresh_rebuild(self):
        review = json.loads((FEMALE.parent/'readback.json').read_bytes())
        recipe = json.loads(FEMALE.read_bytes())
        self.assertEqual(sole.digest(FEMALE.read_bytes()),review['recipeSha256'])
        with TemporaryDirectory(dir=sole.checked(FEMALE.parent)) as folder:
            output = Path(folder)/'fresh'
            self.assertEqual(sole.run(output,recipe_path=FEMALE),review['generated'])
            sole.verify(output,{p.name:p.read_bytes() for p in (FEMALE.parent/'generated').iterdir()})
            item, = json.loads((output/'equipment.json').read_bytes())['items']
            fit = json.loads((output/'fit.json').read_bytes())
            reader = sole.Validator()
            source = reader.item(reader.json(recipe['equipmentCatalog']),recipe['sourceId'])
            original = sole.GLB(reader.pin(reader.url(source['url']),recipe['sourceSha256'],source['bytes']))
            result = sole.GLB((output/(recipe['id']+'.glb')).read_bytes())
            self.assertEqual(compare(original,result,recipe['soleOffsetM']),review['readback'])
            self.assertEqual(item['sourceLicense'],source['sourceLicense'])
            self.assertEqual(fit['bodySha256'],item['compatibleAvatarSha256'])
            self.assertFalse(fit['runtimeAccepted'])

    def test_female_recipe_refuses_swapped_body_source_publisher_and_male_face_indices(self):
        female = json.loads(FEMALE.read_bytes())
        male = json.loads(sole.RECIPE.read_bytes())
        with TemporaryDirectory(dir=sole.checked(FEMALE.parent)) as folder:
            recipe = Path(folder)/'recipe.json'
            output = Path(folder)/'new'
            for key,message in [('bodyType','Wrong registered target'),('body','Wrong registered target'),
                                ('sourceSha256','Different registered source'),('publisherModel','Publisher source changed'),
                                ('outsoleFaceRangesInclusive','Authored outsole UV islands differ')]:
                with self.subTest(key=key):
                    recipe.write_text(json.dumps({**female,key:male[key]}),encoding='utf-8')
                    with self.assertRaisesRegex(ValueError,message):
                        sole.run(output,recipe_path=recipe)
                    self.assertFalse(output.exists())

    def test_female_incomplete_package_and_interrupted_stage_preserve_destination(self):
        with TemporaryDirectory(dir=sole.checked(FEMALE.parent)) as folder, patch.object(sole,'PUBLIC_ASSETS',Path(folder)):
            output = Path(folder)/FEMALE.parent.name
            with patch.object(sole,'publish_new_directory',side_effect=OSError('interrupted')):
                with self.assertRaisesRegex(OSError,'interrupted'):
                    sole.publish(recipe_path=FEMALE)
            self.assertEqual(list(Path(folder).iterdir()),[])
            self.assertEqual(sole.publish(recipe_path=FEMALE),sole.publish(check_only=True,recipe_path=FEMALE))
            fit = output/'fit.json'
            fit.unlink()
            before = {p.name:p.read_bytes() for p in output.iterdir()}
            with self.assertRaisesRegex(ValueError,'Incomplete sole variant directory'):
                sole.publish(recipe_path=FEMALE)
            self.assertEqual(before,{p.name:p.read_bytes() for p in output.iterdir()})

    def test_external_root_backtrack_and_junction_reject_before_build(self):
        with TemporaryDirectory(dir=sole.SOURCE) as tmp:
            parent = Path(tmp)
            checkout = parent/'production'
            checkout.mkdir()
            other = parent/'input-checkout'
            other.mkdir()
            linked = checkout/'linked'
            if os.name == 'nt':
                subprocess.run(['cmd','/d','/c','mklink','/J',str(linked),str(other)],check=True,capture_output=True)
            else:
                linked.symlink_to(other,target_is_directory=True)
            try:
                with patch('production_paths.main_checkout',return_value=checkout), patch.object(sole,'build') as build:
                    for output in (Path(sole.ROOT.anchor),checkout/'..'/'input-checkout'/'x',linked/'x'):
                        with self.subTest(output=output), self.assertRaises(ValueError):
                            sole.run(output)
                    with patch.object(sole,'PUBLIC_ASSETS',linked/'public'), self.assertRaises(ValueError):
                        sole.publish()
                    build.assert_not_called()
            finally:
                if os.name == 'nt':
                    linked.rmdir()
                else:
                    linked.unlink()
            self.assertEqual(list(other.iterdir()),[])


if __name__ == '__main__':
    unittest.main()
