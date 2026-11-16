"""Exact initial reviewed_subset function, with only its required imports and ID keys."""
from collections import Counter
import json
LABELS = {'female-round-full': '', 'female-long-slender': '', 'female-square-athletic': '', 'female-soft-wide': '', 'male-wide-muscular': '', 'male-long-lean': '', 'male-round-stocky': '', 'male-angular-athletic': ''}

def reviewed_subset(manifest, audit):
    """Admit only fully audited source outputs; an incomplete batch stays incomplete."""
    expected = {key + '-v2' for key in LABELS}
    entries = manifest.get('variants', [])
    variants = audit.get('variants', [])
    if len(entries) != 8 or {v.get('id') for v in entries} != expected:
        raise ValueError('Partial preview still requires all eight declared source outcomes')
    if len(variants) != 8 or {v.get('id') for v in variants} != expected:
        raise ValueError('Audit must include each declared preset exactly once')
    audit_rows = {v['id']: v for v in variants}
    selected = [v for v in entries if v.get('status') == 'source-passed']
    failed = [v for v in entries if v.get('status') == 'failed']
    if len(selected) != 6 or {v['id'] for v in failed} != {'female-long-slender-v2', 'male-long-lean-v2'}:
        raise ValueError('This reviewed partial package must contain six outputs and the two recorded lean failures')
    for entry in selected:
        row = audit_rows[entry['id']]
        if row.get('passed') is not True or not row.get('checks') or any(c.get('passed') is not True for c in row['checks']):
            raise ValueError('Selected source has incomplete or failed independent checks: ' + entry['id'])
    # Remove the exact per-preset records from the complete check ledger. Global
    # failures may ONLY describe missing outputs from explicitly FAILED sources.
    key = lambda c: json.dumps(c, sort_keys=True, separators=(',', ':'))
    remaining = Counter(key(c) for c in audit.get('checks', []))
    for row in variants:
        if not row.get('checks'):
            raise ValueError('Empty per-preset audit')
        for check in row['checks']:
            token = key(check)
            if remaining[token] <= 0:
                raise ValueError('Per-preset checks do not belong to the complete audit')
            remaining[token] -= 1
    global_checks = [json.loads(token) for token, count in remaining.items() for _ in range(count)]
    allowed_missing = {'four-distinct-position-contents-' + v['sex'] for v in failed}
    if not global_checks or any(c.get('passed') is not True and c.get('name') not in allowed_missing for c in global_checks):
        raise ValueError('Shared audit failed beyond explicitly missing source outputs')
    for entry in failed:
        if audit_rows[entry['id']].get('passed') is not False or any(field in entry for field in ['avatar', 'equipmentManifest', 'profile']):
            raise ValueError('Failed source must not claim an admitted resource')
    return selected, [{'id': v['id'], 'reason': v.get('error'), 'status': 'not-published-source-failed'} for v in failed]

