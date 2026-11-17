"""Reuse the frozen recursive process-tree runner with this package identity."""
import ast
from pathlib import Path

from adapter import ROOT

path = ROOT / 'scripts/m2-head-attachment-slim-v1/run.py'
tree = ast.parse(path.read_bytes())
changed = 0
for node in ast.walk(tree):
    if isinstance(node, ast.Constant) and node.value == 'semantic-head-attachment-run-v1':
        node.value = 'surface-band-head-slim-run-v1'
        changed += 1
if changed != 1:
    raise ValueError('Frozen process-tree runner identity differs')
# __file__ intentionally belongs to this entry, so it launches this solve.py.
exec(compile(tree, str(path) + ':surface-band-runner', 'exec'),
    {'__file__': str(Path(__file__).resolve()), '__name__': '__main__'})
