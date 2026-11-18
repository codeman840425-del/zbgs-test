"""Exercise the real Git layout within a temporary directory inside the project."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class LayoutTest(unittest.TestCase):
    def setUp(self):
        scripts = Path(__file__).resolve().parent
        fixture = tempfile.TemporaryDirectory(dir=scripts.parent / 'experiments')
        self.addCleanup(fixture.cleanup)
        self.parent = Path(fixture.name).resolve()
        self.root = self.parent / 'gamemake'
        self.home = self.root / 'experiments' / 'worktrees'
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        self.tool = self.root / 'scripts' / 'character-worktree.py'
        self.tool.parent.mkdir()
        shutil.copyfile(scripts / self.tool.name, self.tool)
        subprocess.run(['git', 'add', 'scripts'], cwd=self.root, check=True)
        subprocess.run(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                        '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], cwd=self.root, check=True)

    def cli(self, *args, cwd=None, env=None, check=False):
        return subprocess.run([sys.executable, '-B', str(self.tool), *args], cwd=cwd or self.root,
                              env=env, check=check, capture_output=True, text=True, encoding='utf-8')

    def git(self, *args, cwd=None):
        return subprocess.check_output(['git', *args], cwd=cwd or self.root, stderr=subprocess.PIPE)

    def link_directory(self, link, target):
        if os.name == 'nt':
            subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/j', str(link), str(target)],
                           check=True, capture_output=True)
        else:
            link.symlink_to(target, target_is_directory=True)

    def test_rejects_arbitrary_external_checkout_name(self):
        self.cli('create', 'preview', check=True)
        self.cli('audit', check=True)
        # A task invoked by another repository's Git hook must still write to this project.
        other = self.parent / 'foreign-project'
        subprocess.run(['git', 'init', '-q', str(other)], check=True)
        foreign_env = dict(os.environ, GIT_DIR=str(other / '.git'), GIT_WORK_TREE=str(other))
        audit = self.cli('audit', cwd=other, env=foreign_env, check=True)
        self.assertEqual(Path(json.loads(audit.stdout)['project']), self.root)
        self.cli('create', 'from-hook', cwd=other, env=foreign_env, check=True)
        self.assertTrue((self.home / 'from-hook/.git').is_file())
        self.assertFalse((other / 'experiments').exists())
        stray = self.parent / 'unrelated looking name'
        subprocess.run(['git', 'worktree', 'add', '--detach', str(stray)], cwd=self.root, check=True)
        result = self.cli('audit')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)['unexpectedWorktrees'], [str(stray.resolve())])
        archive = self.parent / 'gamemake_preview.zip'
        archive.touch()
        result = self.cli('audit')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)['unexpectedSiblings'], [archive.name])

    def test_reserved_names_are_rejected_before_git_and_valid_names_still_create(self):
        for name in ('nul', 'con', 'aux', 'prn', 'com1', 'com9', 'lpt1', 'lpt9'):
            with self.subTest(name=name):
                # Even if name validation regresses, the invalid revision prevents any worktree write.
                result = self.cli('create', name, 'missing-test-revision')
                self.assertEqual(result.returncode, 1)
                self.assertIn('Worktree name is reserved by Windows', result.stderr)
                self.assertFalse(self.home.exists())
        self.cli('create', 'con-preview_2', 'HEAD', check=True)
        self.assertTrue((self.home / 'con-preview_2/.git').is_file())

    def test_rejects_a_redirected_parent(self):
        outside = self.parent / 'redirect-target'
        outside.mkdir()
        self.link_directory(self.home.parent, outside)
        result = self.cli('create', 'preview')
        self.assertEqual(result.returncode, 1)
        self.assertIn('Worktree parent is redirected', result.stderr)
        self.assertEqual(list(outside.iterdir()), [])
        outside.rmdir()
        result = self.cli('create', 'preview')
        self.assertEqual(result.returncode, 1)
        self.assertIn('Worktree parent is redirected', result.stderr)
        self.assertFalse(outside.exists())

    def test_rejects_existing_and_dangling_leaf_links(self):
        self.home.mkdir(parents=True)
        outside = self.parent / 'leaf-target'
        outside.mkdir()
        self.link_directory(self.home / 'existing-leaf', outside)
        dangling_target = self.parent / 'dangling-target'
        dangling_target.mkdir()
        dangling = self.home / 'dangling-leaf'
        self.link_directory(dangling, dangling_target)
        dangling_target.rmdir()
        self.assertFalse(dangling.exists())
        dangling.lstat()
        for name in ('existing-leaf', 'dangling-leaf'):
            with self.subTest(name=name):
                result = self.cli('create', name)
                self.assertEqual(result.returncode, 1)
                self.assertIn('Worktree destination already exists', result.stderr)
        self.assertEqual(list(outside.iterdir()), [])
        self.assertFalse(dangling_target.exists())

    def test_runtime_only_checks_out_the_pinned_build_inputs(self):
        self.git('config', 'core.autocrlf', 'true')
        matrix = 'assets-source/variant-matrix-v1/representative-matrix.json'
        baseline = {
            '.gitattributes': b'* text=auto eol=lf\nprototype/public/pinned.json -text\n',
            'prototype/src/runtime.js': b'export const source = "fixed";\n',
            'prototype/public/pinned.json': b'{"exact":"CRLF"}\r\n',
            'evidence/history/item.json': b'{}\n',
        }
        for name, data in baseline.items():
            file = self.root / name
            file.parent.mkdir(exist_ok=True, parents=True)
            file.write_bytes(data)
        self.git('add', '.')
        self.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false',
                 'commit', '-qm', 'runtime-without-matrix')
        old = self.git('rev-parse', 'HEAD').decode().strip()
        matrix_file = self.root / matrix
        matrix_file.parent.mkdir(parents=True)
        matrix_file.write_bytes(b'{"matrix":1}\n')
        self.git('add', matrix)
        self.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false',
                 'commit', '-qm', 'runtime-with-matrix')
        selected = self.git('rev-parse', 'HEAD').decode().strip()
        # The checkout must read attributes and source from the selected commit, not current files.
        (self.root / '.gitattributes').write_bytes(b'* text eol=crlf\n')
        (self.root / 'prototype/src/runtime.js').write_bytes(b'export const source = "dirty";\n')

        for name, commit in (('historical', old), ('candidate', selected)):
            self.cli('create', name, commit, '--runtime-only', check=True)
            checkout = self.home / name
            self.assertEqual(self.git('rev-parse', 'HEAD', cwd=checkout).decode().strip(), commit)
            self.assertEqual(self.git('status', '--porcelain', '--untracked-files=all', cwd=checkout), b'')
            for file in ('.gitattributes', 'prototype/src/runtime.js', 'prototype/public/pinned.json'):
                self.assertEqual((checkout / file).read_bytes(), baseline[file])
            self.assertFalse((checkout / 'scripts').exists())
            self.assertFalse((checkout / 'evidence').exists())
            if commit == selected:
                self.assertEqual((checkout / matrix).read_bytes(), matrix_file.read_bytes())
            else:
                self.assertFalse((checkout / 'assets-source').exists())

        self.cli('create', 'full', selected, check=True)
        self.assertTrue((self.home / 'full/evidence/history/item.json').is_file())
        self.assertTrue((self.home / 'full/scripts/character-worktree.py').is_file())
        self.assertEqual((self.root / '.gitattributes').read_bytes(), b'* text eol=crlf\n')

    def test_runtime_only_rejects_bad_parameters_before_add(self):
        result = self.cli('create', '../escaped', 'HEAD', '--runtime-only')
        self.assertIn('Use one lowercase directory name', result.stderr)
        self.assertFalse(self.home.exists())

        result = self.cli('create', 'bad-revision', '--runtime-only', '--', '--help')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Needed a single revision', result.stderr)
        self.assertFalse(self.home.exists())

        result = self.cli('create', 'missing-prototype', '--runtime-only')
        self.assertIn('requires a prototype directory', result.stderr)
        self.assertFalse(self.home.exists())

        outside = self.parent / 'runtime-redirect'
        outside.mkdir()
        self.link_directory(self.home.parent, outside)
        result = self.cli('create', 'redirected', 'HEAD', '--runtime-only')
        self.assertIn('Worktree parent is redirected', result.stderr)
        self.assertEqual(list(outside.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
