"""Exercise the actual 3 mm source entry, including old fits and guarded outputs."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import paired_ear_style as ear


def files(folder):
    return {p.relative_to(folder).as_posix(): p.read_bytes() for p in folder.rglob('*') if p.is_file()}


class StudPackageTest(unittest.TestCase):
    def setUp(self):
        folder = ear.project_output(ear.ROOT / 'output' / 'ear-style-test', ear.__file__)
        folder.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=folder)
        self.addCleanup(self.temp.cleanup)
        self.scratch = Path(self.temp.name)

    def run_tool(self, output):
        return subprocess.run([sys.executable, '-B', ear.__file__, '--out', str(output)],
                              cwd=self.scratch, capture_output=True, text=True)

    def test_real_export_replay_and_side_readback(self):
        target = self.scratch / 'build'
        old = ear.author.PACKAGE / 'generated'
        saved = files(ear.PUBLIC)
        self.assertEqual(len(saved), 4)
        for _ in range(2):
            run = self.run_tool(target)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(files(target), files(ear.PACKAGE / 'generated'))
            self.assertEqual(files(target / 'runtime'), saved)
        manifest = json.loads(saved['manifest.json'])
        fragment = json.loads((target / 'catalog-fragment.json').read_bytes())
        self.assertEqual(fragment['manifestSha256'], ear.author.digest(saved['manifest.json']))
        self.assertEqual([v['id'] for v in manifest['instances']],
                         ['round-gold-stud-3mm-left-v1', 'round-gold-stud-3mm-right-v1'])
        for entry in manifest['fits']:
            new_fit = json.loads(saved[entry['file']])
            old_fit = json.loads((old / entry['file']).read_bytes())
            self.assertNotEqual(old_fit['fitId'], new_fit['fitId'])
            self.assertEqual(ear.author.digest(saved[entry['file']]), entry['sha256'])
            self.assertEqual(new_fit['assetSha256'], ear.author.digest(saved['stud.glb']))
            self.assertEqual(new_fit['baseAvatarSha256'], ear.author.digest(
                (ear.ROOT / new_fit['sourceAvatar']).read_bytes()))
            for mount, original, instance in zip(new_fit['mounts'], old_fit['mounts'], manifest['instances'], strict=True):
                self.assertEqual(mount['instanceId'], instance['id'])
                self.assertEqual(mount['socket'], instance['socket'])
                self.assertEqual(mount, {**original, 'instanceId': instance['id']})
        report = json.loads((target / 'build-report.json').read_bytes())
        self.assertEqual(report['originalAssetSha256'], ear.author.digest((old / 'stud.glb').read_bytes()))
        self.assertEqual(report['shapeReadback']['vertexCount'], 114)
        self.assertEqual(report['shapeReadback']['triangleCount'], 224)
        self.assertAlmostEqual(report['shapeReadback']['boundsM'][1][0], .003, places=8)

    def test_mismatched_body_and_geometry(self):
        parent = ear.author.PACKAGE
        spec = json.loads((parent / 'spec.json').read_bytes())
        wrong = copy.deepcopy(spec['inputs']['female'])
        wrong['path'] = spec['inputs']['male']['path']
        with self.assertRaisesRegex(ValueError, 'Source avatar SHA mismatch'):
            ear.author.source_fit('female', wrong, spec, '0' * 64)
        wrong_glb = (parent / 'generated/stud.glb').read_bytes()
        with self.assertRaisesRegex(ValueError, 'Historical 3 mm mesh'):
            ear.check_shape((ear.PUBLIC / 'stud.glb').read_bytes(), wrong_glb, 'round-gold-stud-3mm-v1')

    def test_incomplete_output_preserved(self):
        partial = self.scratch / 'partial'
        partial.mkdir()
        (partial / 'stud.glb').write_bytes(b'interrupted')
        before = files(partial)
        with self.assertRaisesRegex(ValueError, 'incomplete or differs'):
            ear.deliver(partial, files(ear.PUBLIC))
        self.assertEqual(files(partial), before)
        retry = self.scratch / 'fresh'
        ear.deliver(retry, files(ear.PUBLIC))
        self.assertEqual(files(retry), files(ear.PUBLIC))

    def test_output_boundaries(self):
        outside = ear.ROOT.parent / (self.scratch.name + '-must-not-exist')
        self.assertFalse(outside.exists())
        relative = os.path.relpath(outside, self.scratch)
        for candidate in [outside, relative]:
            result = self.run_tool(candidate)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('inside the production tool main checkout', result.stderr)
            self.assertFalse(outside.exists())
        if os.name == 'nt':
            junction = self.scratch / 'junction'
            subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(junction), str(ear.ROOT.parent)],
                           check=True, capture_output=True)
            try:
                result = self.run_tool(junction / outside.name)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('inside the production tool main checkout', result.stderr)
                self.assertFalse(outside.exists())
            finally:
                junction.rmdir()


if __name__ == '__main__':
    unittest.main()
