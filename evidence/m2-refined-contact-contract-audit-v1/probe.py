"""One actual-array target0 identity counterexample. No CGAL detection or G."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
SCRIPTS=ROOT/'scripts/m2-refined-contact-readback-v1'
sys.path.insert(0,str(SCRIPTS))
import common
import inputs
import numpy as np

spec=json.loads((ROOT/'assets-source/m2-refined-contact-readback-v1/spec.json').read_bytes())
t=common.topology(spec)
original_ref=spec['numericCandidateInputs']['cases'][0]['faceGroup']
candidate=inputs.group_arrays(original_ref)
source=inputs.group_arrays(spec['numericCandidateInputs']['sourceGroup'])
mutated={key:candidate[key].copy() for key in ['basePositionM','positionDeltasM','basePositionFloat32','positionDeltasFloat32']}
mutated['positionDeltasM'][0,0,0]+=.001
mutated['positionDeltasFloat32']=mutated['positionDeltasM'].astype(np.float32)
compose,mapping=inputs.original_mixture_functions(spec)
assert 0 not in [mapping[key] for key in ['happy','blink','oh','eyeJoy']]
for baked in [False,True]:
    before=inputs.mixed_state(candidate,compose,mapping,t['correctedVertexIds'],.65,1.,'oh',.66,baked)
    after=inputs.mixed_state(mutated,compose,mapping,t['correctedVertexIds'],.65,1.,'oh',.66,baked)
    assert np.array_equal(before,after)
path=OUT/'target0-mutated-face-group.npz'
if path.exists():
    with np.load(path,allow_pickle=False) as existing:
        assert set(existing.files)==set(mutated) and all(np.array_equal(existing[k],v) for k,v in mutated.items())
else:np.savez_compressed(path,**mutated)
changed=copy.deepcopy(spec)
changed['numericCandidateInputs']['cases'][0]['faceGroup']={'path':path.relative_to(ROOT).as_posix(),
    'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
old_spec=importlib.util.spec_from_file_location('old_inputs',OUT/'inputs-first-reviewed.py')
old=importlib.util.module_from_spec(old_spec);old_spec.loader.exec_module(old)
def rejected(call):
    try:call()
    except (ValueError,KeyError) as error:return str(error)
    raise AssertionError('Mutated target unexpectedly accepted')
snapshot_error=rejected(lambda:old.validate_numerical_inputs(changed,t))
package_error=rejected(lambda:inputs.validate_numerical_inputs(changed,t))
records=json.loads(common.pinned(spec['numericCandidateInputs']['records']).read_bytes())['records']
with np.load(common.pinned(spec['numericCandidateInputs']['cases'][0]['raw']),allow_pickle=False) as raw:
    raw_error=rejected(lambda:inputs.validate_face_raw(mutated,source,records,raw))
readback=inputs.validate_numerical_inputs(spec,t)
assert len(readback['cases'])==3 and all(c['all55FaceStatesBoundToPassedNumericRaw'] for c in readback['cases'])
snapshot=OUT/'inputs-first-reviewed.py'
result={'schema':'refined-contact-one-counterexample-retest-v1','status':'current-raw-and-package-bindings-reject',
    'oldSnapshotSha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),
    'currentInputsSha256':hashlib.sha256((SCRIPTS/'inputs.py').read_bytes()).hexdigest(),
    'sourceSpecSha256':hashlib.sha256((ROOT/'assets-source/m2-refined-contact-readback-v1/spec.json').read_bytes()).hexdigest(),
    'fixture':changed['numericCandidateInputs']['cases'][0]['faceGroup'],
    'mutatedActualCase':spec['numericCandidateInputs']['cases'][0]['sourceRequestId'],
    'mutatedTargetIndex':0,'mutatedVertexIndex':0,'deltaXM':.001,
    'knownOhFloat64AndBakedUnchanged':True,
    'firstSavedSnapshotAlreadyHadPackageGuard':True,'savedSnapshotRejects':snapshot_error,
    'currentPackageBindingRejects':package_error,'currentFullRawBindingRejects':raw_error,
    'unalteredThreeCasesInputReadbackPassed':True,'nativeDetectionCalls':0,'GCalled':False,
    'oldOfficialEightSmokesRepeated':False}
(OUT/'probe-result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
