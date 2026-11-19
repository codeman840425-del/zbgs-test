"""Exercise the real Git layout within a temporary directory inside the project."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


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

    def unlink_directory(self, link):
        if os.name == 'nt':
            link.rmdir()
        else:
            link.unlink()

    def load_tool(self):
        spec = importlib.util.spec_from_file_location('character_worktree_fixture', self.tool)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

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
        initial = self.git('worktree', 'list', '--porcelain', '-z')
        for link in (self.home.parent, self.home):
            with self.subTest(link=link):
                link.parent.mkdir(exist_ok=True)
                outside.mkdir()
                self.link_directory(link, outside)
                for dangling in (False, True):
                    if dangling:
                        outside.rmdir()
                    result = self.cli('create', 'preview')
                    self.assertEqual(result.returncode, 1)
                    self.assertIn('Worktree parent is redirected', result.stderr)
                    audit = self.cli('audit')
                    self.assertEqual(audit.returncode, 1)
                    issues = json.loads(audit.stdout)['worktreePathIssues']
                    self.assertTrue(any(str(link) in issue for issue in issues), issues)
                    self.assertEqual(self.git('worktree', 'list', '--porcelain', '-z'), initial)
                    if dangling:
                        self.assertFalse(outside.exists())
                    else:
                        self.assertEqual(list(outside.iterdir()), [])
                self.unlink_directory(link)
        self.cli('create', 'preview', check=True)
        self.assertTrue((self.home / 'preview/.git').is_file())
        self.assertEqual(json.loads(self.cli('audit', check=True).stdout)['worktreePathIssues'], [])

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
        audit = self.cli('audit')
        self.assertEqual(audit.returncode, 1)
        issues = json.loads(audit.stdout)['worktreePathIssues']
        for name in ('existing-leaf', 'dangling-leaf'):
            self.assertTrue(any(str(self.home / name) in issue for issue in issues), issues)

    def test_rechecks_parent_changed_during_revision_resolution(self):
        outside = self.parent / 'changed-parent'
        outside.mkdir()
        module = self.load_tool()
        real_lookup = subprocess.check_output
        initial = self.git('worktree', 'list', '--porcelain', '-z')

        def lookup(args, *positional, **options):
            value = real_lookup(args, *positional, **options)
            if args[1:3] == ['rev-parse', '--verify']:
                self.link_directory(self.home.parent, outside)
            return value

        with patch.object(module.subprocess, 'check_output', side_effect=lookup):
            with self.assertRaisesRegex(ValueError, 'Worktree parent is redirected'):
                module.create('preview', 'HEAD')
        self.assertEqual(list(outside.iterdir()), [])
        self.assertEqual(self.git('worktree', 'list', '--porcelain', '-z'), initial)
        self.unlink_directory(self.home.parent)
        self.cli('create', 'preview', check=True)

    def test_rechecks_created_destination_before_sparse_writes(self):
        outside = self.parent / 'replaced-checkout-target'
        outside.mkdir()
        destination = self.home / 'preview'
        preserved = self.home / 'preserved-preview'
        self.assertTrue(destination.resolve().is_relative_to(self.root))
        self.assertTrue(preserved.resolve().is_relative_to(self.root))
        module = self.load_tool()
        real_run = subprocess.run
        commands = []

        def run_git(args, *positional, **options):
            if args[0] == 'git':
                commands.append(args[1])
            value = real_run(args, *positional, **options)
            if args[:3] == ['git', 'worktree', 'add']:
                destination.rename(preserved)
                self.link_directory(destination, outside)
            return value

        with patch.object(module, 'runtime_inputs', return_value=(['prototype'], b'* text\n', False)), \
             patch.object(module.subprocess, 'run', side_effect=run_git):
            with self.assertRaisesRegex(ValueError, 'Created worktree is redirected'):
                module.create('preview', 'HEAD', runtime_only=True)
        self.assertEqual(commands, ['rev-parse', 'worktree'])
        self.assertEqual(list(outside.iterdir()), [])
        self.assertTrue((preserved / '.git').is_file())
        audit = self.cli('audit')
        self.assertEqual(audit.returncode, 1)
        self.assertTrue(any(str(destination) in issue for issue in json.loads(audit.stdout)['worktreePathIssues']))

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
