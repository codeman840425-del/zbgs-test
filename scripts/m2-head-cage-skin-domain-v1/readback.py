"""CPU readback only. Does not invoke Blender or change response files."""
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-head-cage-skin-domain-v1'
OUT = BASE / 'generated'
spec = json.loads((BASE / 'spec.json').read_bytes())
manifest = json.loads((OUT / 'manifest.json').read_bytes())
for row in manifest['inputs']:
    assert hashlib.sha256((ROOT / row['path']).read_bytes()).hexdigest() == row['sha256'], row['path']
loader = importlib.util.spec_from_file_location('source_glb', ROOT / 'scripts/m2-male-face-v1/glb.py')
module = importlib.util.module_from_spec(loader)
loader.loader.exec_module(module)
cases = []
for sex, source in spec['sources'].items():
    path = OUT / (sex + '.json')
    data = json.loads(path.read_bytes())
    old = json.loads((ROOT / 'assets-source/m2-head-cage-response-probe-v1/generated' / path.name).read_bytes())
    fields = ['sourcePointsM', 'sourceFaceTriangles', 'sourceLandmarksM', 'landmarks', 'requests',
        'controls', 'controlSigns', 'controlVertexIndices', 'nominalProbeM', 'responseBaseline']
    equal = {key: data[key] == old[key] for key in fields}
    assert all(equal.values()), equal
    tensor = np.asarray(data['responseTensor'])
    assert tensor.shape == (3, 202, 9, 3)
    assert np.array_equal(data['responseMatrices'], [tensor[a, :, :, a] for a in range(3)])
    assert np.array_equal(data['flattenedResponseAxisMajor'], tensor.transpose(3, 1, 0, 2).reshape(606, 27))
    gate = data['domainPrerequisite']
    assert gate['necessaryActiveOutsideCount'] == 0
    assert gate['maximumIdentityErrorM'] <= spec['setup']['identityToleranceM']
    g = module.GLB(ROOT / source['path'])
    domain = []
    for mi, mesh in enumerate(g.doc['meshes']):
        for pi, primitive in enumerate(mesh['primitives']):
            name = g.doc['materials'][primitive['material']]['name']
            if any(token in name for token in spec['boundsDomainMaterialTokens']):
                ids = np.unique(g.acc(primitive['indices'])).astype(int)
                domain.append({'mesh': mi, 'primitive': pi, 'materialName': name,
                    'positionAccessor': primitive['attributes']['POSITION'], 'indexAccessor': primitive['indices'],
                    'referencedIndices': ids.tolist(), 'targets': primitive.get('targets', [])})
    cases.append({'sex': sex, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'widthM': gate['widthM'], 'oldWidthM': float(np.ptp(np.asarray(old['restCagePositionsM'])[:, 0])),
        'fullEndpointCount': len(gate['endpoints']), 'maximumIdentityErrorM': gate['maximumIdentityErrorM'],
        'necessaryActiveOutsideCount': gate['necessaryActiveOutsideCount'],
        'retainedOtherActiveOutsideOccurrences': sum(row['allOtherActiveOutsideCount'] for row in gate['endpoints']),
        'oldExactFieldsUnchanged': equal, 'maximumCrossAxisResponse': data['maximumCrossAxisResponse'],
        'identityAfterMaximumErrorM': data['identityAfter']['maximumPointErrorM'],
        'tensorShape': list(tensor.shape), 'actualReferencedDomain': domain})
result = {'schema': 'head-skin-domain-comparison-v1', 'cases': cases,
    'readbackGlbHelperSha256': hashlib.sha256(Path(loader.origin).read_bytes()).hexdigest(),
    'productionAdmitted': False, 'runtimeAccepted': False}
(OUT / 'comparison.json').write_bytes((json.dumps(result, indent=2) + '\n').encode())
print(json.dumps({'status': 'cpu-readback-passed', 'sexes': len(cases)}))
