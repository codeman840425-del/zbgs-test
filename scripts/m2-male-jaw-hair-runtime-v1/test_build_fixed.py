import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('build-fixed.py').resolve()
PROJECT = SCRIPT.parents[2]


class BuildFixedPathsTest(unittest.TestCase):
    def setUp(self):
        workspace = tempfile.TemporaryDirectory(dir=PROJECT / 'experiments')
        self.addCleanup(workspace.cleanup)
        self.scratch = Path(workspace.name).resolve()
        self.root = self.scratch / 'main checkout'
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        subprocess.run(
            ['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
             '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'fixture'],
            cwd=self.root, check=True,
        )
        self.script = self.copy_script(self.root)
        self.work = self.root / 'experiments' / 'candidate'
        self.out = self.root / 'evidence' / 'report'

    def copy_script(self, checkout):
        script = checkout / 'scripts' / SCRIPT.parent.name / SCRIPT.name
        script.parent.mkdir(parents=True)
        shutil.copyfile(SCRIPT, script)
        return script

    def run_cli(self, *, work=None, out=None, script=None, repo=None):
        return subprocess.run(
            [sys.executable, '-B', str(script or self.script), '--repo', str(repo or self.root),
             '--commit', 'HEAD', '--worktree', str(work or self.work), '--out', str(out or self.out)],
            cwd=self.root, text=True, capture_output=True,
        )

    def assert_rejected(self, result, message):
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn(message, result.stderr)
        self.assertFalse(self.out.parent.exists())
        self.assertFalse(self.work.exists())

    def test_rejects_drive_root_without_writing(self):
        drive_root = Path(PROJECT.anchor)
        self.assert_rejected(self.run_cli(work=drive_root), 'within the main repository experiments directory')
        self.assert_rejected(self.run_cli(out=drive_root), 'Report output must be within the main repository')

    def test_rejects_paths_resolving_outside_the_checkout(self):
        outside = self.scratch / 'outside'
        outside.mkdir()
        redirect = self.work.parent / 'redirect'
        redirect.parent.mkdir()
        if os.name == 'nt':
            subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/j', str(redirect), str(outside)],
                           check=True, capture_output=True)
        else:
            redirect.symlink_to(outside, target_is_directory=True)

        for path in (self.root / '..' / 'escaped', redirect / 'escaped'):
            with self.subTest(path=path):
                self.assert_rejected(self.run_cli(work=path), 'within the main repository experiments directory')
                self.assert_rejected(self.run_cli(out=path), 'Report output must be within the main repository')
                self.assertFalse(path.exists())
        self.assertEqual(list(outside.iterdir()), [])

    def test_accepts_main_checkout_paths_from_linked_checkout(self):
        linked = self.scratch / 'linked checkout'
        subprocess.run(['git', 'worktree', 'add', '--detach', '--no-checkout', str(linked)],
                       cwd=self.root, check=True, capture_output=True)
        result = self.run_cli(script=self.copy_script(linked), repo=linked)
        # The fixture intentionally lacks .gitattributes, so it stops before npm.
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertTrue(self.work.is_dir())
        report = json.loads((self.out / 'report.json').read_text(encoding='utf-8'))
        self.assertEqual([(step['name'], step['exitCode']) for step in report['steps']],
                         [('worktree', 0), ('attributes', 128)])


if __name__ == '__main__':
    unittest.main()
