"""Exercise the real Git layout within a temporary directory inside the project."""
import json
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
            stray = Path(parent) / 'unrelated looking name'
            subprocess.run(['git', 'worktree', 'add', '--detach', str(stray)], cwd=root, check=True)
            result = subprocess.run([sys.executable, str(tool), 'audit'], cwd=root, capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)['unexpectedWorktrees'], [str(stray.resolve())])


if __name__ == '__main__':
    unittest.main()
