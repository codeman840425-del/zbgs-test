"""Validate full source/index/attribute coverage and audited coefficients, without G."""
import json
import sys

from source import BASE, ROOT, fixed_masks, load, np, ref, save, sha, source_records

spec = json.loads((BASE / 'spec.json').read_bytes())
out = BASE / 'prepared'
if out.exists():
    raise ValueError('Keep first complete-source preparation')
out.mkdir()
g, inventory = load(spec)
audit = json.loads((ROOT / spec['coefficientAudit']['path']).read_bytes())
if audit['status'] != 'independent-coefficient-audit-complete-not-geometry-admission':
    raise ValueError('Explicit completed independent coefficient audit required')
for case in audit['cases']:
    if case['unprovenLeaves'] or case['failedLeaves'] or not case['numericSeamGuardsPass'] or not case['identityPlatformCoefficientsExact']:
        raise ValueError('Coefficient audit blocks source evaluation')
for case in spec['cases']:
    coefficient = case['coefficients']
    if audit['pins'][coefficient['path']] != coefficient['sha256']:
        raise ValueError('Audited coefficient identity differs')
records, points, groups, unused = source_records(g, inventory)
masks = fixed_masks(g, spec)
save(out / 'endpoint-records.json', {'schema': 'axial-source-endpoint-records-v1', 'source': spec['source'],
    'records': records, 'totalSourceEndpointOccurrences': len(points),
    'uniqueReferencedBaseVertices': sum(len(g['sourceIndices']) for g in groups),
    'old113713PartitionUsed': False})
save(out / 'source-groups.json', {'schema': 'axial-complete-source-groups-v1', 'groups': groups, 'unreferenced': unused})
save(out / 'fixed-source-masks.json', masks)
np.savez_compressed(out / 'source-endpoints.npz', sourceEndpointsM=points)
if 'igl' in sys.modules:
    raise ValueError('Complete-source preparation must not import SLIM')
save(out / 'report.json', {'schema': 'axial-complete-source-preparation-v1', 'status': 'prepared-source-only-no-G',
    'methodSpecSha256': sha(BASE / 'spec.json'), 'source': spec['source'], 'sourceInventory': spec['sourceInventory'],
    'groups': len(groups), 'records': len(records), 'uniqueReferencedBaseVertices': 9911,
    'sourceEndpointOccurrences': len(points), 'groupSourceCounts': [
        {'positionAccessor': g['positionAccessor'], 'referenced': len(g['sourceIndices']), 'actualTargets': len(g['targets'])} for g in groups],
    'unusedPositionIndices': sum(len(g['sourceIndices']) for g in unused), 'keptUnusedAtOriginal': True,
    'sourceRecords': ref(out / 'endpoint-records.json'), 'sourceGroups': ref(out / 'source-groups.json'),
    'fixedSourceMasks': ref(out / 'fixed-source-masks.json'), 'sourceArrays': ref(out / 'source-endpoints.npz'),
    'sourceGeometryTransformed': False, 'sourcePropertiesVerifiedAgainstInventory': True,
    'allSourceRestMeshConsumersIdentity': True, 'characterExported': False})
print(json.dumps({'status': 'prepared-source-only-no-G', 'groups': 2, 'records': len(records), 'occurrences': len(points)}))
