"""Bounded declaration regressions for retained hair and outer source writers.

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
outer = next(w for w in config['workflows'] if w['id'] == 'male-outer-panels-source')
outer_scripts = args.source_root/'scripts/m2-outer-panels-v2'
finalizer = (outer_scripts/'finalize.py').read_text(encoding='utf-8-sig')
installer = (outer_scripts/'install-runtime.py').read_text(encoding='utf-8-sig')
assert "write(BASE / 'manifest.json'" in finalizer
assert "catalog_path=root/'prototype/public/assets/m1b/equipment.json'" in installer
assert "output=destination/'author-export.glb'" in installer
outer_required = {
    'finalize.py': ['assets-source/m2-outer-panels-v2/'+p for p in
                    ['generated/author-equipment.json', 'generated/fit.json',
                     'generated/binding-check.json', 'generated/source-correspondence.json', 'manifest.json']],
    'install-runtime.py': ['prototype/public/assets/m2-outer-panels-v2/author-export.glb',
                          'prototype/public/assets/m1b/equipment.json'],
}
for script, paths in outer_required.items():
    c = next(c for commands in outer['stages'].values() for c in commands
             if 'scripts/m2-outer-panels-v2/'+script in c['argv'])
    assert set(paths) == set(c['writes']), script+' write scope'
    for path in paths:
        bad = copy.deepcopy(c)
        bad['writes'].remove(path)
        assert not set(paths).issubset(bad['writes'])
        rejected.append('Missing outer writer declaration: '+path)
print(json.dumps({'passed': True, 'requiredTransitiveWrites': required,
                  'outerWriterScopes': outer_required,
                  'negativeCases': rejected, 'exportersInvoked': False,
                  'scope': 'Retained hair check and fixed outer writers only, not general static write analysis'}, indent=2))
