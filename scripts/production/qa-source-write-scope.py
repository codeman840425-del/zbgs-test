"""Bounded declaration regressions for retained hair, outer and onepiece writers.

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
onepiece = next(w for w in config['workflows'] if w['id'] == 'male-onepiece-source')
onepiece_base = 'assets-source/m2-onepiece-v1/'
onepiece_scripts = args.source_root/'scripts/m2-onepiece-v1'
assert "m.OUT = output" in (onepiece_scripts/'build.py').read_text(encoding='utf-8')
assert "OUT.mkdir(exist_ok=True,parents=True)" in (args.source_root/'scripts/m1b-assets/build.py').read_text(encoding='utf-8')
assert "parser.add_argument('--edit-from')" in (onepiece_scripts/'author.py').read_text(encoding='utf-8')
assert "output / 'static-audit.json'" in (onepiece_scripts/'audit.py').read_text(encoding='utf-8')
assert "write(BASE / 'manifest.json'" in (onepiece_scripts/'finalize.py').read_text(encoding='utf-8')
assert "temporary=MANIFEST.with_suffix('.install.tmp')" in (args.source_root/'scripts/install-onepiece-runtime.py').read_text(encoding='utf-8')
onepiece_required = {
    'scripts/m2-onepiece-v1/build.py': [onepiece_base+'workflow-rebuild/', 'prototype/public/assets/m1b/'],
    'scripts/m2-onepiece-v1/author.py': [onepiece_base+'workflow-rebuild/'],
    'scripts/m2-onepiece-v1/audit.py': [onepiece_base+'workflow-rebuild/static-audit.json'],
    'scripts/m2-onepiece-v1/finalize.py': [onepiece_base+path for path in
        ['generated/author-equipment.json', 'generated/fit.json', 'generated/verification.json', 'manifest.json']],
    'scripts/install-onepiece-runtime.py': ['prototype/public/assets/m2-onepiece-v1/author-export.glb',
        'prototype/public/assets/m2-onepiece-v1/fit.json', 'prototype/public/assets/m1b/equipment.json',
        'prototype/public/assets/m1b/equipment.install.tmp'],
}
for script, paths in onepiece_required.items():
    c = next(c for commands in onepiece['stages'].values() for c in commands if script in c['argv'])
    assert set(paths) == set(c['writes']), script+' write scope'
    for path in paths:
        bad = copy.deepcopy(c); bad['writes'].remove(path)
        assert not set(paths).issubset(bad['writes'])
        rejected.append('Missing onepiece writer declaration: '+path)
print(json.dumps({'passed': True, 'requiredTransitiveWrites': required,
                  'outerWriterScopes': outer_required,
                  'onepieceWriterScopes': onepiece_required,
                  'negativeCases': rejected, 'exportersInvoked': False,
                  'scope': 'Retained hair check and fixed outer/onepiece writers only, not general static write analysis'}, indent=2))
