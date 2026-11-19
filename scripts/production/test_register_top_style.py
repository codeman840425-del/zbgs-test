import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import register_top_style as top


ID = 'shared-male-studio-top-v1'
RECIPE = 'assets-source/' + ID + '/recipe.json'
PROJECT = top.ROOT
CLI = PROJECT / 'scripts/production/register_equipment_style.py'


def receiving_checkout(target):
    primary = 'prototype/public' + top.BASE_MANIFEST
    source = json.loads((PROJECT / primary).read_bytes())
    members = {i['id']: i for i in source['items']}
    files = [primary, RECIPE, 'prototype/public'+top.BASE_BODY]
    files.extend((Path(primary).parent / members[ident]['url']).as_posix() for ident in top.BASE_IDS.values())
    for name in files:
        out = target / name
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(PROJECT / name, out)
    sha = top.digest((target / primary).read_bytes())
    member = top.BASE_MANIFEST + '#' + top.BASE_IDS['top']
    original = {'styleId': 'fixture-base-top', 'label': 'base', 'variants': [{
        'bodyType': 'male', 'bodySha256': top.BASE_SHA, 'variantVersion': 'v1', 'status': 'candidate',
        'resourceManifest': member, 'resourceManifestSha256': sha, 'fitManifest': member+'.bindings',
        'fitManifestSha256': sha, 'coverageManifest': member+'.preserveOriginalBody', 'coverageManifestSha256': sha,
    }]}
    catalog = target / top.MATRIX_NAME
    catalog.parent.mkdir(parents=True)
    catalog.write_bytes(top.encoded({'schema': 'zbgs-style-variant-matrix-v1', 'styles': [original]}))
    return catalog


class TopImportTests(unittest.TestCase):
    def test_public_import_replay_exact_body_retry_and_conflicting_file(self):
        with TemporaryDirectory(dir=PROJECT/'experiments') as directory:
            target = Path(directory)
            catalog = receiving_checkout(target)
            original = catalog.read_bytes()
            args = [sys.executable, '-B', str(CLI), '--top', RECIPE, '--target-root', str(target)]
            cwd = PROJECT.anchor
            pre = subprocess.run(args, cwd=cwd, capture_output=True)
            self.assertNotEqual(pre.returncode, 0)
            self.assertIn(b'Top is not registered', pre.stderr)
            self.assertEqual(catalog.read_bytes(), original)
            # The package is immutable and published first. A process failure
            # replacing the catalog leaves an unregistered, retryable top.
            with patch.object(top.os, 'replace', side_effect=PermissionError('interrupted')):
                with self.assertRaisesRegex(PermissionError, 'interrupted'):
                    top.import_top(RECIPE, install=True, target_root=target)
            garment = target/'prototype/public/assets'/ID/'top.glb'
            self.assertEqual(garment.read_bytes(), (PROJECT/RECIPE).with_name(ID+'.glb').read_bytes())
            self.assertEqual(catalog.read_bytes(), original)
            self.assertFalse(list(garment.parent.parent.glob('.top-install-*')))
            actual = json.loads(subprocess.check_output([*args, '--install'], cwd=cwd))
            self.assertEqual(actual['outfit']['index'], 8)
            self.assertEqual(actual['skin']['weightedVertices'], 1399)
            self.assertEqual(actual['skin']['bones'], 10)
            first = catalog.read_bytes()
            self.assertEqual(json.loads(first)['styles'][0], json.loads(original)['styles'][0])
            self.assertEqual(json.loads(first)['styles'][1]['variants'][0]['status'], 'candidate')
            self.assertEqual(json.loads(subprocess.check_output(args, cwd=cwd)), actual)
            self.assertEqual(json.loads(subprocess.check_output([*args, '--install'], cwd=cwd)), actual)
            self.assertEqual(catalog.read_bytes(), first)
            garment.write_bytes(b'different')
            with self.assertRaisesRegex(ValueError, 'SHA mismatch|Existing package differs'):
                top.import_top(RECIPE, install=True, target_root=target)
            self.assertEqual(catalog.read_bytes(), first)
            self.assertEqual(garment.read_bytes(), b'different')

    def test_wrong_target_catalog_never_creates_package(self):
        with TemporaryDirectory(dir=PROJECT/'experiments') as directory:
            target = Path(directory)
            catalog = receiving_checkout(target)
            original = catalog.read_bytes()
            source = target/('prototype/public'+top.BASE_MANIFEST)
            source.write_bytes(source.read_bytes()+b' ')
            with self.assertRaisesRegex(ValueError, 'base manifest changed'):
                top.import_top(RECIPE, install=True, target_root=target)
            self.assertFalse((target/'prototype/public/assets'/ID).exists())
            self.assertEqual(catalog.read_bytes(), original)

    def test_drive_root_parent_and_junction_rejected_before_input(self):
        with TemporaryDirectory(dir=PROJECT/'experiments') as directory:
            parent = Path(directory)
            actual = parent/'actual'
            actual.mkdir()
            link = parent/'junction'
            if os.name == 'nt':
                subprocess.run(['cmd.exe','/d','/c','mklink','/j',str(link),str(actual)], check=True, capture_output=True)
            else:
                link.symlink_to(actual, target_is_directory=True)
            try:
                with patch.object(top, 'authored_top') as read:
                    for target in [Path(PROJECT.anchor), parent/'..'/'elsewhere', link]:
                        with self.subTest(target=target), self.assertRaises(ValueError):
                            top.import_top(RECIPE, install=True, target_root=target)
                    read.assert_not_called()
                self.assertEqual(list(actual.iterdir()), [])
            finally:
                if os.name == 'nt':
                    link.rmdir()
                else:
                    link.unlink()


if __name__ == '__main__':
    unittest.main()
