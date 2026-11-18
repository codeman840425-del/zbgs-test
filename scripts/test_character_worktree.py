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
    def test_rejects_arbitrary_external_checkout_name(self):
        scripts = Path(__file__).resolve().parent
        with tempfile.TemporaryDirectory(dir=scripts.parent / 'experiments') as parent:
            root = Path(parent) / 'gamemake'
            root.mkdir()
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            tool = root / 'scripts' / 'character-worktree.py'
            tool.parent.mkdir()
            shutil.copyfile(scripts / tool.name, tool)
            subprocess.run(['git', 'add', 'scripts'], cwd=root, check=True)
            subprocess.run(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                            '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], cwd=root, check=True)
            subprocess.run([sys.executable, str(tool), 'create', 'preview'], cwd=root, check=True)
            subprocess.run([sys.executable, str(tool), 'audit'], cwd=root, check=True)
            # A task invoked by another repository's Git hook must still write to this project.
            other = Path(parent) / 'foreign-project'
            subprocess.run(['git', 'init', '-q', str(other)], check=True)
            foreign_env = dict(os.environ, GIT_DIR=str(other / '.git'), GIT_WORK_TREE=str(other))
            audit = subprocess.check_output([sys.executable, str(tool), 'audit'], cwd=other, env=foreign_env)
            self.assertEqual(Path(json.loads(audit)['project']), root.resolve())
            subprocess.run([sys.executable, str(tool), 'create', 'from-hook'], cwd=other, env=foreign_env, check=True)
            self.assertTrue((root / 'experiments/worktrees/from-hook/.git').is_file())
            self.assertFalse((other / 'experiments').exists())
            stray = Path(parent) / 'unrelated looking name'
            subprocess.run(['git', 'worktree', 'add', '--detach', str(stray)], cwd=root, check=True)
            result = subprocess.run([sys.executable, str(tool), 'audit'], cwd=root, capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)['unexpectedWorktrees'], [str(stray.resolve())])
            archive = Path(parent) / 'gamemake_preview.zip'
            archive.touch()
            result = subprocess.run([sys.executable, str(tool), 'audit'], cwd=root, capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)['unexpectedSiblings'], [archive.name])


if __name__ == '__main__':
    unittest.main()
