import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import sole_variant as sole


class SoleVariantTests(unittest.TestCase):
    def test_publish_retry_and_conflict_preserve_existing_files(self):
        with TemporaryDirectory(dir=sole.SOURCE) as folder, patch.object(sole,'PUBLIC',Path(folder)/'public-copy'):
            pins = sole.publish()
            self.assertEqual(pins, sole.publish())
            self.assertEqual(pins, sole.publish(check_only=True))
            files = {p.name:p.read_bytes() for p in sole.PUBLIC.iterdir()}
            self.assertEqual(set(files),{'fit.json','equipment.json','cc0-texture-release-platform-shoes-v1.glb'})
            files['fit.json'] += b' '
            (sole.PUBLIC/'fit.json').write_bytes(files['fit.json'])
            with self.assertRaisesRegex(ValueError,'Existing sole variant differs'):
                sole.publish()
            self.assertEqual(files,{p.name:p.read_bytes() for p in sole.PUBLIC.iterdir()})

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
                    with patch.object(sole,'PUBLIC',linked/'public'), self.assertRaises(ValueError):
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
