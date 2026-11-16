"""Bounded declaration regression for the retained hair check's two subprocesses.

Reads scripts only. Does not import/execute the generator, checker or Blender.
--source-root allows this check in a scripts-only review checkout.
"""
import argparse
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument('--source-root', type=Path, default=ROOT)
args = ap.parse_args()
config = json.loads((ROOT/'scripts/production/workflows.json').read_text(encoding='utf-8-sig'))
workflow = next(w for w in config['workflows'] if w['id'] == 'male-jaw-hair-fit')
command = next(c for c in workflow['stages']['check']
               if 'scripts/m2-male-jaw-hair-fit-v1/check.py' in c['argv'])
checker = (args.source_root/'scripts/m2-male-jaw-hair-fit-v1/check.py').read_text(encoding='utf-8-sig')
generator = (args.source_root/'scripts/m2-male-jaw-hair-fit-v1/rebuild-original-geometry.py').read_text(encoding='utf-8-sig')
# Anchors deliberately fail if the retained scripts change: re-review declarations.
assert "m2-male-jaw-hair-fit-v1/rebuild-original-geometry.py" in checker
assert "build.py'),'--out',str(PACKAGE/'fresh')" in checker
assert "output=PACKAGE/'fresh/original-hair-rebuild'" in generator
assert "original-generator-rebuild.json').write_text" in generator
required = [
    'assets-source/m2-male-jaw-hair-fit-v1/fresh/',
    'evidence/m2-male-jaw-hair-fit-v1/original-generator-rebuild.json',
]


def check(c):
    for p in required:
        if p not in c['writes']:
            raise ValueError('Missing transitive write declaration: '+p)


check(command)
rejected = []
for p in required:
    bad = copy.deepcopy(command)
    bad['writes'].remove(p)
    try:
        check(bad)
    except ValueError as e:
        rejected.append(str(e))
    else:
        raise AssertionError('Omitted write was accepted')
print(json.dumps({'passed': True, 'requiredTransitiveWrites': required,
                  'negativeCases': rejected, 'exportersInvoked': False,
                  'scope': 'Only retained hair check declaration, not general static write analysis'}, indent=2))
