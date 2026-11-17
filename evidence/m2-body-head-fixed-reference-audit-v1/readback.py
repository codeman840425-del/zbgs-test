"""Read original indices, source coordinates and saved receipts. No B/G/F evaluation."""
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB


def read(name):
    return json.loads((ROOT / name).read_bytes())


original = read('assets-source/m2-representative-batch-v2/spec.json')
composition = read('assets-source/m2-axial-body-compose-v1/spec.json')
assert composition['originalEightRequestsMetadata'] == original['variants']
face_fields = ['jawWidth', 'cheekWidth', 'chinLengthM', 'chinProjectionM']
body_fields = [field for field in original['parameterFields'] if field not in face_fields]
assert len(body_fields) == 9 and len(original['variants']) == 8
source_ref = original['sources']['male']['body']
raw = (ROOT / source_ref['path']).read_bytes()
assert hashlib.sha256(raw).hexdigest() == source_ref['sha256']
g = GLB(raw)
skin = g.doc['skins'][0]
matrices = np.asarray(g.accessor(skin['inverseBindMatrices'])).reshape(-1, 4, 4)
human = {row['bone']: row['node'] for row in g.doc['extensions']['VRM']['humanoid']['humanBones']}
joints = {key: -matrices[skin['joints'].index(node), 3, :3].astype(float)
          for key, node in human.items() if node in skin['joints']}
# Algebraic support cutoffs from the retained exact body function, not evaluated displacements.
limb_upper = float(joints['neck'][1] - .01)
torso_upper = float(joints['chest'][1] + .20)
body_upper = max(limb_upper, torso_upper)
curve = read('assets-source/m2-axial-shape-function-v1/generated/male-long-lean-v2/curves.json')
head_lower = float(curve['headOriginM'][1] + curve['supportL'])
masks = read('assets-source/m2-axial-head-evaluation-v1/prepared/fixed-source-masks.json')
neck = masks['neck'][0]
assert len(masks['neck']) == 1 and neck['endpoint'] == -1 and len(neck['sourceIndices']) == 68
neck_points = np.asarray(g.accessor(neck['positionAccessor']))[neck['sourceIndices']]
body_primitive = next(p for m in g.doc['meshes'] for p in m['primitives']
                      if 'Body_00_SKIN' in g.doc['materials'][p['material']]['name'])
assert body_primitive['attributes']['POSITION'] == neck['positionAccessor']
assert set(neck['sourceIndices']) <= set(map(int, np.asarray(g.accessor(body_primitive['indices'])).ravel()))
primitive_rows = []
for mi, mesh in enumerate(g.doc['meshes']):
    for pi, primitive in enumerate(mesh['primitives']):
        name = g.doc['materials'][primitive['material']]['name']
        if not any(token in name for token in ['Face_00_SKIN', 'FaceMouth', 'EyeWhite', 'EyeIris', 'EyeHighlight']):
            continue
        ids = np.unique(g.accessor(primitive['indices']))
        P = np.asarray(g.accessor(primitive['attributes']['POSITION']))
        ends = [P] + [P + np.asarray(g.accessor(t['POSITION'])) for t in primitive.get('targets', [])]
        primitive_rows.append({'mesh': mi, 'primitive': pi, 'material': name,
            'sourceReferencedVertices': len(ids), 'endpointArrays': len(ends),
            'minimumSourceEndpointYM': min(float(E[ids, 1].min()) for E in ends),
            'allSourceEndpointsAboveBodySupport': all(float(E[ids, 1].min()) >= body_upper for E in ends)})
preflight = read('assets-source/m2-representative-head-cage-v1/generated/preflight.json')
body_receipts = [{'sex': sex['sex'], 'overallHistoricalStatus': sex['status'], 'bodyGate': gate}
                 for sex in preflight['sexes'] for gate in sex['gates'] if gate['id'] == 'exact-v2-body-factor-and-distal']
paths = [
    'docs/research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt',
    'docs/AVATAR-CONTRACT.md', 'assets-source/m2-representative-batch-v2/spec.json',
    'scripts/m2-representative-batch-v1/deform.py', 'scripts/m2-representative-batch-v2/deform.py',
    'scripts/m2-representative-head-cage-v1/body.py', 'scripts/m2-representative-head-cage-v1/preflight.py',
    'assets-source/m2-representative-head-cage-v1/generated/preflight.json',
    'scripts/m2-head-volume-domain-v1/run.py', 'assets-source/m2-head-volume-domain-v1/spec.json',
    'assets-source/m2-head-volume-domain-v1/generated/endpoint-records.json',
    'assets-source/m2-head-attachment-slim-v1/spec.json',
    'assets-source/m2-axial-head-evaluation-v1/spec.json', 'scripts/m2-axial-head-evaluation-v1/source.py',
    'scripts/m2-axial-head-evaluation-v1/evaluate.py',
    'assets-source/m2-axial-head-evaluation-v1/prepared/fixed-source-masks.json',
    'assets-source/m2-axial-shape-function-v1/generated/male-long-lean-v2/curves.json',
    'scripts/m2-axial-body-compose-v1/common.py', 'scripts/m2-axial-body-compose-v1/prepare.py',
    'scripts/m2-axial-body-compose-v1/evaluate.py', 'assets-source/m2-axial-body-compose-v1/spec.json',
    source_ref['path'], str(Path(__file__).relative_to(ROOT)).replace('\\', '/'),
]
result = {'schema': 'body-head-fixed-reference-readback-v1', 'status': 'contract-audit-only',
    'bodyFields': body_fields, 'headFields': face_fields, 'originalEightRequestsExact': True,
    'source': source_ref, 'sourceJointsM': {key: joints[key].tolist() for key in ['head', 'neck', 'chest']},
    'bodyLimbUpperSupportYM': limb_upper, 'bodyTorsoUpperSupportYM': torso_upper,
    'bodyCombinedUpperSupportYM': body_upper, 'headLowerActiveSupportYM': head_lower,
    'sourceSupportGapM': head_lower - body_upper,
    'neck': {'positionAccessor': neck['positionAccessor'], 'endpoint': -1, 'count': len(neck_points),
        'originalSourceIndices': neck['sourceIndices'], 'allActuallyReferencedByBodySkin': True,
        'minimumYM': float(neck_points[:, 1].min()), 'maximumYM': float(neck_points[:, 1].max()),
        'sourceIndicesBelowBodyUpperSupport': [int(i) for i, point in zip(neck['sourceIndices'], neck_points) if point[1] < body_upper],
        'supportCountIsNotDisplacementMeasurement': True},
    'facialPrimitiveEndpointSupportReadback': primitive_rows, 'savedBodyFactorPreflight': body_receipts,
    'BGEvaluated': False, 'compositionEvaluated': False, 'candidateExported': False,
    'pins': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in paths}}
dest = OUT / 'readback.json'
if dest.exists():
    raise RuntimeError('Preserve existing audit readback')
dest.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: result[key] for key in ['bodyCombinedUpperSupportYM', 'headLowerActiveSupportYM', 'sourceSupportGapM']}))
print(json.dumps(result['neck']))
print(json.dumps(primitive_rows))
