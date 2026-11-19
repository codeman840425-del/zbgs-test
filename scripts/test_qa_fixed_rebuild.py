"""Exercise output path validation through the fixed rebuild CLI without building."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parents[1]
SCRIPT = PROJECT / 'scripts' / 'qa-fixed-rebuild.py'


class OutputBoundaryTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(dir=PROJECT / 'experiments')
        self.addCleanup(temporary.cleanup)
        self.scratch = Path(temporary.name).resolve()
        self.root = self.scratch / 'main checkout'
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        (self.root / 'experiments').mkdir()
        self.script = self.copy_script(self.root)
        self.work = self.root / 'experiments' / 'candidate'
        self.output = self.root / 'evidence' / 'rebuild'

    def copy_script(self, checkout):
        script = checkout / 'scripts' / SCRIPT.name
        script.parent.mkdir()
        shutil.copyfile(SCRIPT, script)
        return script

    def run_cli(self, repo=None, work=None, output=None, baseline=None, script=None, env=None):
        return subprocess.run(
            [sys.executable, str(script or self.script), '--repo', str(repo or self.root),
             '--commit', 'HEAD', '--baseline', str(baseline or self.root / 'missing-baseline'),
             '--worktree', str(work or self.work), '--output', str(output or self.output)],
            cwd=self.root, env=env, capture_output=True, text=True,
        )

    def assert_rejected(self, result, message):
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn(message, result.stderr)

    def test_rejects_external_evidence_before_creating_it(self):
        outside = PROJECT.parent / ('qa-fixed-rebuild-' + self.scratch.name)
        self.assertFalse(outside.exists())
        # If containment regresses, the older baseline guard still prevents a write at the drive root.
        result = self.run_cli(output=outside / 'evidence', baseline=self.work / 'baseline')
        self.assert_rejected(result, 'Evidence output must be within the main repository')
        self.assertFalse(outside.exists())
        self.assertFalse(self.work.exists())

    def test_rejects_paths_resolving_through_parent_traversal_or_junction(self):
        target = self.scratch / 'outside'
        target.mkdir()
        redirect = self.root / 'experiments' / 'redirect'
        if os.name == 'nt':
            subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/j', str(redirect), str(target)],
                           check=True, capture_output=True)
        else:
            redirect.symlink_to(target, target_is_directory=True)
        for path in (self.work.parent / '..' / 'candidate', redirect / 'candidate'):
            with self.subTest(work=path):
                self.assert_rejected(self.run_cli(work=path), 'within the main repository experiments directory')
                self.assertFalse(path.exists())
                self.assertFalse(self.output.parent.exists())
        for path in (self.root / '..' / 'escaped-evidence', redirect / 'evidence'):
            with self.subTest(output=path):
                self.assert_rejected(self.run_cli(output=path), 'Evidence output must be within the main repository')
                self.assertFalse(path.exists())
                self.assertFalse(self.work.exists())

    def test_repo_argument_cannot_move_the_boundary(self):
        foreign = self.scratch / 'foreign'
        subprocess.run(['git', 'init', '-q', str(foreign)], check=True)
        result = self.run_cli(repo=foreign, work=foreign / 'experiments' / 'candidate', output=foreign / 'evidence')
        self.assert_rejected(result, '--repo must use the same Git repository as this script')
        self.assertFalse((foreign / 'experiments').exists())
        self.assertFalse((foreign / 'evidence').exists())

    def test_redirected_package_cache_rejects_before_any_evidence_write(self):
        cache = self.root / 'output/fixed-build-cache/npm'
        cache.mkdir(parents=True)
        foreign = self.scratch / 'unrelated-cache'
        foreign.mkdir()
        link = cache / '_cacache'
        if os.name == 'nt':
            subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/j', str(link), str(foreign)],
                           check=True, capture_output=True)
        else:
            link.symlink_to(foreign, target_is_directory=True)
        self.assert_rejected(self.run_cli(), 'cache must stay in the main repository')
        self.assertFalse(self.output.exists())
        self.assertEqual(list(foreign.iterdir()), [])

    def test_script_in_linked_checkout_accepts_paths_in_main_checkout(self):
        subprocess.run(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                        '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'fixture'],
                       cwd=self.root, check=True)
        linked = self.scratch / 'linked checkout'
        subprocess.run(['git', 'worktree', 'add', '--detach', '--no-checkout', str(linked)],
                       cwd=self.root, check=True, capture_output=True)
        result = self.run_cli(repo=linked, script=self.copy_script(linked))
        self.assertEqual(result.returncode, 1, result.stderr)
        report = json.loads((self.output / 'report.json').read_text(encoding='utf-8'))
        self.assertEqual(report['status'], 'failed')
        self.assertIn('FileNotFoundError', report['error'])
        self.assertEqual([step['name'] for step in report['steps']], ['resolve-commit'])
        self.assertFalse(self.work.exists())

    def test_npm_and_build_use_only_repository_cache_and_temporary_paths(self):
        project = self.root / 'prototype'
        (project / 'scripts').mkdir(parents=True)
        (self.root / '.gitattributes').write_text('* text=auto eol=lf\n')
        (self.root / '.gitignore').write_text('dist/\nnode_modules/\n')
        package = {'name': 'fixed-build-fixture', 'version': '1.0.0', 'private': True,
                   'scripts': {'build': 'node scripts/build-id.mjs'}}
        lock = {'name': package['name'], 'version': package['version'], 'lockfileVersion': 3,
                'packages': {'': {'name': package['name'], 'version': package['version']}}}
        (project / 'package.json').write_text(json.dumps(package))
        (project / 'package-lock.json').write_text(json.dumps(lock))
        (project / 'scripts/build-id.mjs').write_text(
            "import fs from 'node:fs'; import os from 'node:os';\n"
            "fs.mkdirSync('dist');fs.writeFileSync('dist/build-info.json','{\"inputs\":[]}');\n"
            "console.log(JSON.stringify({temp:os.tmpdir(),cache:process.env.npm_config_cache,"
            "logs:process.env.npm_config_logs_dir}));\n"
        )
        subprocess.run(['git', 'add', '--', '.gitattributes', '.gitignore', 'prototype'], cwd=self.root, check=True)
        subprocess.run(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                        '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], cwd=self.root, check=True)
        baseline = self.root / 'baseline'
        baseline.mkdir()
        (baseline / 'build-info.json').write_bytes(b'{"inputs":[]}')
        external = self.scratch / 'caller-cache'
        env = dict(os.environ, npm_config_offline='true', npm_config_cache=str(external),
                   npm_config_logs_dir=str(external / 'logs'), TEMP=str(external), TMP=str(external),
                   TMPDIR=str(external))
        result = self.run_cli(baseline=baseline, env=env)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        paths = json.loads((self.output / 'npm-build.stdout.log').read_text().strip().splitlines()[-1])
        self.assertEqual(Path(paths['cache']), self.root / 'output/fixed-build-cache/npm')
        self.assertEqual(Path(paths['logs']), Path(paths['cache']) / '_logs')
        self.assertEqual(Path(paths['temp']).parent, self.output)
        self.assertFalse(Path(paths['temp']).exists())
        self.assertFalse(external.exists())


if __name__ == '__main__':
    unittest.main()
