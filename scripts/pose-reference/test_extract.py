import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import extract
from production_paths import main_checkout, project_output


ROOT = main_checkout(extract.__file__)
SCRIPT = Path(extract.__file__)


class ExtractOutputTests(unittest.TestCase):
    def setUp(self):
        parent = project_output(ROOT / 'output', SCRIPT)
        self.scratch = tempfile.TemporaryDirectory(prefix='pose-path-test-', dir=parent)
        self.addCleanup(self.scratch.cleanup)
        self.work = Path(self.scratch.name)

    def cli(self, inputs, destination):
        temp = str(self.work)
        return subprocess.run(
            [sys.executable, '-B', str(SCRIPT), *map(str,inputs), '--out', str(destination)],
            cwd=ROOT.anchor, capture_output=True, text=True,
            env={**os.environ, 'TMP':temp, 'TEMP':temp, 'TMPDIR':temp, 'PYTHONDONTWRITEBYTECODE':'1'},
        )

    def test_drive_root_absolute_and_parent_traversal_reject_before_writing(self):
        name = 'pose-not-created-' + uuid4().hex
        outside = Path(ROOT.anchor) / name
        self.assertFalse(outside.exists())
        traversal = self.work.joinpath(*(['..'] * len(self.work.relative_to(ROOT.anchor).parts)), name)
        for dest in [outside, traversal]:
            rejected = self.cli(['sample.png'], dest)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn('inside the production tool main checkout', rejected.stderr)
            self.assertFalse(outside.exists())
        self.assertEqual(list(self.work.iterdir()), [])

    @unittest.skipUnless(os.name == 'nt', 'Windows directory junction')
    def test_junction_to_drive_root_never_creates_outside_file(self):
        junction = self.work/'drive'
        subprocess.run(['cmd','/d','/c','mklink','/J',str(junction),ROOT.anchor],
                       check=True, capture_output=True)
        try:
            self.assertTrue(junction.is_junction())
            name = 'pose-not-created-' + uuid4().hex
            outside = Path(ROOT.anchor) / name
            self.assertFalse(outside.exists())
            rejected = self.cli(['sample.png'], junction/name)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn('inside the production tool main checkout', rejected.stderr)
            self.assertFalse(outside.exists())
        finally:
            if junction.is_junction():
                junction.rmdir()

    def test_duplicate_stems_and_existing_run_receipt_preserved(self):
        for inputs in [['source1/photo.png','source2/PHOTO.jpg'],['a/run.png']]:
            rejected = self.cli(inputs, self.work/'new')
            self.assertIn('Duplicate extraction output', rejected.stderr)
            self.assertFalse((self.work/'new').exists())
        prior = self.work/'run.json'
        prior.write_bytes(b'prior receipt')
        rejected = self.cli(['photo.jpg'], self.work)
        self.assertIn('already exists', rejected.stderr)
        self.assertEqual(prior.read_bytes(), b'prior receipt')

    def test_late_frame_conflict_and_partial_install_can_retry_without_overwrite(self):
        out = self.work/'existing'
        out.mkdir()
        prior = out/'frame-00450.jpg'
        prior.write_bytes(b'old')
        def generate(args, stage):
            for name in ['sequence.json','run.json','frame-00450.jpg']:
                (stage/name).write_bytes(b'new')
        args = [str(SCRIPT),'video.mp4','--video','--out',str(out)]
        with patch.object(sys,'argv',args), patch.object(extract,'extract',generate):
            with self.assertRaises(FileExistsError):
                extract.main()
            self.assertEqual(list(out.iterdir()),[prior])
            self.assertEqual(prior.read_bytes(),b'old')
            prior.rename(out/'unrelated.jpg')
            real_link = os.link
            def raced(source,target):
                if target.name=='run.json':
                    target.write_bytes(b'concurrently created')
                real_link(source,target)
            with patch.object(os,'link',raced), self.assertRaises(FileExistsError):
                extract.main()
            self.assertEqual({p.name for p in out.iterdir()},{'unrelated.jpg','run.json'})
            self.assertEqual((out/'run.json').read_bytes(),b'concurrently created')
            (out/'run.json').rename(out/'other-receipt.json')
            extract.main()
            self.assertEqual((out/'sequence.json').read_bytes(),b'new')
            self.assertEqual((out/'unrelated.jpg').read_bytes(),b'old')
        self.assertEqual(list(out.parent.iterdir()),[out])


if __name__=='__main__':
    unittest.main()
