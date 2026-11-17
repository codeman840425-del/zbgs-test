"""Forward kinematics only; no IK solve, dynamics step, collision geometry or rendering."""
import hashlib
import json
import os
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = Path(__file__).resolve().parent
for key in ['OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS']:
    os.environ[key] = '2'
os.environ['MINK_DISABLE_NATIVE'] = '1'
sys.path.insert(0, str(ROOT / 'experiments/tools/mink-author-study/source/src'))
import mujoco
import mink
import numpy as np
from scipy.spatial.transform import Rotation as R

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def save(name, obj):
    with (PACKAGE / name).open('x', encoding='utf-8') as f:
        json.dump(obj, f, indent=2, allow_nan=False)

def values(a):
    return ' '.join(format(float(x), '.17g') for x in a)

def wxyz(q):
    return [q[3], *q[:3]]

def rot(q):
    return R.from_quat(q)

spec = json.loads((PACKAGE / 'spec.json').read_bytes())
for p, h in spec['pins'].items():
    assert sha(ROOT / p) == h, p
source = json.loads((PACKAGE / 'source-rig.json').read_bytes())
names = source['selectedSemantics']
rest = source['baseline']['normalized']
# Proper rotation: Three +Y up -> MuJoCo +Z up; +Z display forward -> -Y.
C = np.array([[1., 0., 0.], [0., 0., -1.], [0., 1., 0.]])
CR = R.from_matrix(C)
anchor = source['anchor']
ap = C @ anchor['worldPosition']
aq = CR * rot(anchor['worldQuaternion'])
xml = ET.Element('mujoco', model='original_male_normalized_arms_coordinate_only')
ET.SubElement(xml, 'compiler', angle='radian', fusestatic='false')
ET.SubElement(xml, 'option', gravity='0 0 -9.81')
world = ET.SubElement(xml, 'worldbody')
fixed = ET.SubElement(world, 'body', name='normalized_anchor', pos=values(ap), quat=values(wxyz(aq.as_quat())))
elements = {}
for s in names:
    b = rest[s]
    parent = elements[b['parentSemantic']] if b['parentSemantic'] else fixed
    elem = ET.SubElement(parent, 'body', name=s, pos=values(b['position']), quat=values(wxyz(b['quaternion'])))
    # Explicit synthetic inertial only satisfies MuJoCo compilation; never used for dynamics.
    ET.SubElement(elem, 'inertial', pos='0 0 0', mass='1', diaginertia='.001 .001 .001')
    ET.SubElement(elem, 'joint', name=s+'_rotation', type='ball', limited='false')
    ET.SubElement(elem, 'site', name=s+'_origin', pos='0 0 0', size='.001')
    elements[s] = elem
ET.indent(xml)
xml_bytes = ET.tostring(xml, encoding='utf-8', xml_declaration=True)
with (PACKAGE / 'male-arm-chain.xml').open('xb') as f:
    f.write(xml_bytes)
model = mujoco.MjModel.from_xml_string(xml_bytes.decode())
configuration = mink.Configuration(model)
assert model.ngeom == 0
joints = []
for s in names:
    j = model.joint(s+'_rotation')
    joints.append({'semantic': s, 'jointId': int(j.id), 'qposAddress': int(j.qposadr[0]), 'dofAddress': int(j.dofadr[0]), 'type': 'ball', 'qposWidth': 4, 'velocityWidth': 3, 'limited': bool(j.limited[0])})
cases = []
for case in source['cases']:
    q = model.qpos0.copy()
    for j in joints:
        s = j['semantic']
        relative = rot(rest[s]['quaternion']).inv() * rot(case['normalized'][s]['quaternion'])
        q[j['qposAddress']:j['qposAddress']+4] = wxyz(relative.as_quat())
    configuration.update(q)
    actual = {}
    recovered_world = {}
    rows = []
    for s in names:
        body_id = model.body(s).id
        p = configuration.data.xpos[body_id].copy()
        r = R.from_matrix(configuration.data.xmat[body_id].reshape(3, 3))
        # Independently read Mink frame API, not just MuJoCo arrays.
        frame = configuration.get_transform_frame_to_world(s, 'body').as_matrix()
        expected = case['normalized'][s]
        ep = C @ expected['worldPosition']
        er = CR * rot(expected['worldQuaternion'])
        rows.append({'semantic': s, 'positionErrorMm': float(np.linalg.norm(p-ep)*1000), 'rotationErrorRad': float((er.inv()*r).magnitude()), 'minkFrameMatrixError': float(np.max(np.abs(frame[:3,:3]-r.as_matrix()))), 'minkFramePositionErrorMm': float(np.linalg.norm(frame[:3,3]-p)*1000)})
        actual[s] = {'position': p.tolist(), 'quaternionWXYZ': wxyz(r.as_quat()), 'matrixRowMajor': frame.tolist()}
        recovered_world[s] = {'p': C.T @ p, 'r': CR.inv() * r}
    recovered = {}
    for s in names:
        parent = rest[s]['parentSemantic']
        pp = recovered_world[parent]['p'] if parent else np.array(anchor['worldPosition'])
        pr = recovered_world[parent]['r'] if parent else rot(anchor['worldQuaternion'])
        localp = pr.inv().apply(recovered_world[s]['p']-pp)
        localr = pr.inv() * recovered_world[s]['r']
        recovered[s] = {'position': localp.tolist(), 'quaternion': localr.as_quat().tolist(), 'positionErrorMm': float(np.linalg.norm(localp-case['normalized'][s]['position'])*1000)}
    cases.append({'id': case['input']['id'], 'qposWXYZ': q.tolist(), 'actualSolverFrames': actual, 'errors': rows, 'recoveredNormalizedLocal': recovered, 'maxPositionErrorMm': max(r['positionErrorMm'] for r in rows), 'maxRotationErrorRad': max(r['rotationErrorRad'] for r in rows), 'maxRecoveredLocalPositionErrorMm': max(r['positionErrorMm'] for r in recovered.values())})
passed = all(c['maxPositionErrorMm'] <= spec['positionToleranceMm'] and c['maxRotationErrorRad'] <= spec['rotationToleranceRad'] and c['maxRecoveredLocalPositionErrorMm'] <= spec['positionToleranceMm'] for c in cases)
result = {'schema': 'vrm-mink-coordinate-roundtrip-v1', 'status': 'passed' if passed else 'failed', 'avatarSha256': spec['avatarSha256'], 'sourceRigSha256': sha(PACKAGE/'source-rig.json'), 'xmlSha256': sha(PACKAGE/'male-arm-chain.xml'), 'minkModule': str(Path(mink.__file__).resolve()), 'mujocoVersion': mujoco.__version__, 'numpyVersion': np.__version__, 'CRowMajor': C.tolist(), 'inverseCRowMajor': C.T.tolist(), 'detC': float(np.linalg.det(C)), 'nq': model.nq, 'nv': model.nv, 'ngeom': model.ngeom, 'joints': joints, 'cases': cases, 'scope': 'FK and coordinate roundtrip only; fixed root, synthetic inertials, no human limits/IK/collision/dynamics/skin/garment claims'}
save('solver-roundtrip.json', result)
print(json.dumps({'stage': 'mujoco-mink-fk', 'status': result['status'], 'nq': model.nq, 'nv': model.nv, 'cases': [{k: c[k] for k in ['id','maxPositionErrorMm','maxRotationErrorRad','maxRecoveredLocalPositionErrorMm']} for c in cases]}))
if not passed:
    raise SystemExit(2)
