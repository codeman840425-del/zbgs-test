import hashlib, json, pathlib, struct
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'assets-source/native-live-accessory-fit-v3'
V1 = ROOT / 'assets-source/native-live-accessory-fit-v1'
OUT = ROOT / 'evidence/native-live-accessory-v3-independent-v1'
OUT.mkdir(parents=True, exist_ok=True)

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def glb(path):
    raw = path.read_bytes()
    n = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+n])
    binary = raw[28+n:]
    def acc(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        dtype = np.dtype({5121:'u1', 5123:'<u2', 5125:'<u4', 5126:'<f4'}[a['componentType']])
        width = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4, 'MAT4':16}[a['type']]
        stride = view.get('byteStride', width * dtype.itemsize)
        return np.ndarray((a['count'], width), dtype=dtype, buffer=binary,
                          offset=view.get('byteOffset', 0) + a.get('byteOffset', 0),
                          strides=(stride, dtype.itemsize)).copy()
    return doc, acc

v1 = json.loads((V1 / 'male-grip.json').read_text())
v3 = json.loads((SRC / 'male-grip.json').read_text())
female = json.loads((V1 / 'female-grip.json').read_text())
nonthumb = [n for n in v1['normalizedFingerRotations'] if 'Thumb' not in n]
qerr = max(abs(a-b) for n in nonthumb for a,b in zip(v1['normalizedFingerRotations'][n], v3['normalizedFingerRotations'][n]))

v1p = {(x['bone'], x['kind']): x for x in v1['parameters'] if 'Thumb' not in x['bone']}
v3p = {(x['bone'], x['kind']): x for x in v3['parameters'] if 'Thumb' not in x['bone']}
locked = []
for key, old in v1p.items():
    new = v3p.get(key)
    locked.append({'bone': key[0], 'kind': key[1], 'angleV1': old['angleRadians'],
                   'angleV3': new['angleRadians'], 'difference': abs(old['angleRadians'] - new['angleRadians']),
                   'boundsV3': new['bounds']})

thumb3 = [x for x in v3['parameters'] if 'Thumb' in x['bone']]
used = set(); matches = []
for control in thumb3:
    candidates = [(i, row) for i, row in enumerate(female['parameters'])
                  if 'Thumb' in row['bone'] and row['bone'] == control['bone']
                  and row['kind'] == control['kind'] and i not in used]
    if not candidates:
        raise RuntimeError(f"missing female warm source {control['bone']}/{control['kind']}")
    i, row = min(candidates, key=lambda ir: 1 - float(np.dot(control['axisLocal'], ir[1]['axisLocal'])))
    used.add(i)
    matches.append({'bone': control['bone'], 'kind': control['kind'],
                    'axisDot': float(np.dot(control['axisLocal'], row['axisLocal'])),
                    'femaleAngleRadians': row['angleRadians'],
                    'maleInitialAngleRadians': control['angleRadians']})

doc, acc = glb(ROOT / 'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm')
human = {k:v['node'] for k,v in doc['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()}
thumb_nodes = {node for name, node in human.items() if name.startswith('rightThumb')}
skin = doc['skins'][0]
primitive = doc['meshes'][1]['primitives'][0]
joint_ids = acc(primitive['attributes']['JOINTS_0']).astype(int)
weights = acc(primitive['attributes']['WEIGHTS_0']).astype(float)
weights /= weights.sum(1, keepdims=True)
joint_nodes = np.array(skin['joints'])
r1 = json.loads((V1 / 'male-skin-reference.json').read_text())
r3 = json.loads((SRC / 'male-skin-reference.json').read_text())
unmixed, mixed = [], []
for row, (index, family) in enumerate(zip(r1['vertexIds'], r1['vertexFamilies'])):
    nodes = {int(x) for x, weight in zip(joint_nodes[joint_ids[index]], weights[index]) if weight > 1e-8}
    if family != 'Thumb':
        (mixed if nodes & thumb_nodes else unmixed).append(row)
p1, p3 = np.array(r1['rawHandLocalPoints']), np.array(r3['rawHandLocalPoints'])
point_error = max(float(np.linalg.norm(p1[i] - p3[i])) for i in unmixed)
readback = json.loads((SRC / 'vrm-readback.json').read_text())
out = {
    'schema': 'native-live-accessory-v3-independent-audit-v1',
    'status': 'independent-cpu-readback-complete-not-runtime-admitted',
    'source': {'avatarSha256': sha(ROOT / 'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm'),
               'fitScriptSha256': sha(ROOT / 'scripts/native-live-accessory-fit-v3/fit.py'),
               'verifyScriptSha256': sha(ROOT / 'scripts/native-live-accessory-fit-v3/verify-vrm.mjs')},
    'nonThumb': {'normalizedQuaternionMaxAbsError': float(qerr), 'parameterRows': locked,
                 'maxParameterDifference': max(row['difference'] for row in locked)},
    'thumbWarmStart': {'v3ControlCount': len(thumb3), 'femaleMatches': matches,
                       'minimumAxisDot': min(row['axisDot'] for row in matches)},
    'skinWeights': {'unmixedNonThumbVertexCount': len(unmixed), 'mixedNonThumbVertexCount': len(mixed),
                    'unmixedPointMaxErrorM': point_error,
                    'authorAssertion': json.loads((SRC / 'preservation-assertions.json').read_text())},
    'threeReadback': {'source': readback, 'passed': readback['passed']},
    'limits': ['No renderer, microphone mesh, browser, or runtime controller validation.',
               'Female values are verified as real per-axis warm-start inputs consumed by the male fit script, not a second female production output.',
               'Mixed non-thumb vertices retain nonzero thumb weights and are reported separately.']
}
(OUT / 'report.json').write_text(json.dumps(out, indent=2) + '\n')
print(json.dumps({'reportSha256': sha(OUT / 'report.json'), 'unmixed': len(unmixed), 'mixed': len(mixed),
                  'qerr': qerr, 'pointErr': point_error,
                  'minWarmAxisDot': min(row['axisDot'] for row in matches), 'readbackPassed': readback['passed']}, indent=2))
