"""Validate production references, not asset or capability completion."""
import collections
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
spec = json.loads((root / 'assets-source/company-environment-specs-v1/branches.json').read_text(encoding='utf-8'))
catalog = json.loads((root / 'prototype/src/company/library-catalog.json').read_text(encoding='utf-8'))
branches = [b for g in spec['groups'] for b in g['branches']]
keys = {(r['id'], r['version']) for r in catalog['resources']}
errors = []
for identity, count in collections.Counter(b['id'] for b in branches).items():
    if count != 1:
        errors.append(f'Duplicate branch {identity}')
for b in branches:
    if len(b['minimumCompatibleAppearances']) < 4:
        errors.append(f'Missing appearance slots: {b["id"]}')
    for field in ['mount', 'parent']:
        if '-or-' in b['fixedFunctionAndInstall'][field]:
            errors.append(f'Ambiguous install: {b["id"]}.{field}')
    for ref in b['reusableResources']:
        if (ref['id'], ref['version']) not in keys or not ref.get('reuseKind'):
            errors.append(f'Invalid resource reference: {b["id"]}: {ref}')
assert len(spec['groups']) == 12
print(json.dumps({'groups': 12, 'productionBranches': len(branches), 'errors': errors,
                  'claim': 'Specification/reference integrity only; four slots are not four produced assets'}, indent=2))
raise SystemExit(bool(errors))
