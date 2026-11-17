"""Verify saved neck decomposition arrays without evaluating body or head maps."""
import hashlib
import json
from pathlib import Path
import sys
sys.dont_write_bytecode = True
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB
OUT = Path(__file__).resolve().parent
path = ROOT / 'assets-source/m2-axial-body-compose-v1/prepared-corrected/report.json'
raw = path.read_bytes()
assert hashlib.sha256(raw).hexdigest() == '2921ac41482222bc31628425271233bc6f51569a429d88c689a0518bad0f75a2'
d = json.loads(raw)
audit = json.loads((OUT / 'readback.json').read_bytes())
source = (ROOT / audit['source']['path']).read_bytes()
assert hashlib.sha256(source).hexdigest() == audit['source']['sha256']
g = GLB(source)
row, = d['neckOriginalBodyHeadDecomposition']
assert row['sourceIndices'] == audit['neck']['originalSourceIndices']
P = np.asarray(row['sourcePointsM'])
assert np.array_equal(P, np.asarray(g.accessor(row['positionAccessor']))[row['sourceIndices']])
B = np.asarray(row['bodyDisplacementM'])
H = np.asarray(row['headOperationDisplacementM'])
final = np.asarray(row['finalDisplacementFromOriginalM'])
assert np.array_equal(B, final) and np.array_equal(H, np.zeros_like(H))
norms = np.linalg.norm(B, axis=1)
result = {'schema': 'saved-neck-decomposition-independent-readback-v1',
    'sourceReceipt': {'path': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(raw).hexdigest()},
    'all68OriginalSourcePointsAndIndicesExact': True,
    'maximumSavedBodyDisplacementM': float(norms.max()),
    'maximumSavedFinalDisplacementM': float(np.linalg.norm(final, axis=1).max()),
    'maximumSavedHeadContributionM': float(np.linalg.norm(H, axis=1).max()),
    'worstSourceIndex': row['sourceIndices'][int(norms.argmax())],
    'actualNonzeroSavedBodyPointCount': int(np.count_nonzero(norms)),
    'fullSourceCompositionEvaluated': d['fullSourceCompositionEvaluated'],
    'BGEvaluatedByThisAudit': False,
    'sourceSpecAtPreparation': d['spec']}
output = OUT / 'saved-preparation-readback.json'
if output.exists(): raise RuntimeError('Preserve existing readback')
output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
