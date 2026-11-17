"""Prepare complete existing lineage, without real candidate collision queries."""
import json

from common import BASE,ROOT,cgal,digest,importlib,np,pinned,reference,require,save,topology
from qa import run
from inputs import validate_numerical_inputs

spec=json.loads((BASE/'spec.json').read_bytes())
for row in spec['inputs']: pinned(row)
for package,version in spec['versions'].items():
    require(importlib.metadata.version(package)==version,'Installed package version differs')
smoke=json.loads(pinned(spec['officialApiSmoke']).read_bytes())
require(smoke['status']=='api-smoke-passed-not-character-admission' and len(smoke['cases'])==8,'Official API smoke incomplete')
for binary in smoke['native']:
    path=ROOT/'experiments/tools/slim-core-2.6.3/.venv/Lib/site-packages/igl/copyleft/cgal'/binary['name']
    require(path.is_file() and digest(path)==binary['sha256'],'Official installed CGAL native SHA differs')
t=topology(spec)
out=BASE/'prepared';require(not out.exists(),'Preserve first contact preparation')
out.mkdir()
np.savez_compressed(out/'role-child-ids.npz',**{name:r['childIds'] for name,r in t['roles'].items()},correctedVertexIds=t['correctedVertexIds'])
mapping={'schema':'refined-face-inclusive-contact-mapping-v1','sourceFace':spec['sourceFace'],'sourceProvenance':spec['sourceProvenance'],
    'refinedVertices':7251,'originalVertices':2056,'sourceTargets':54,'childTriangles':12672,'originalParentTriangles':3168,
    'sourceChildParentBaryIdentityExact':True,'coordinateWelded':False,'roles':[
        {'role':name,'consumer':r['consumer'],'sourceParents':len(r['sourceParentIds']),'children':len(r['childIds']),
            'refinedVertices':len(r['vertexIds'])} for name,r in t['roles'].items()],
    'roleChildIds':reference(out/'role-child-ids.npz'),'negativeEyeJoyCorrectedRoles':spec['negativeEyeJoyCorrectedRoles'],
    'oppositeCompensationLaneSharedIndices':0,'sourceAndCandidateCompensationMustMatch':True}
save(out/'mapping.json',mapping)
numeric=validate_numerical_inputs(spec,t)
save(out/'numeric-input-readback.json',numeric)
qa=run(spec);save(BASE/'qa-report.json',qa)
save(out/'report.json',{'schema':'refined-inclusive-contact-preparation-v1','status':'prepared-stopped-before-real-contact-queries',
    'spec':reference(BASE/'spec.json'),'mapping':reference(out/'mapping.json'),'officialApiSmoke':spec['officialApiSmoke'],
    'qa':reference(BASE/'qa-report.json'),'numericCandidateInputs':spec['numericCandidateInputs'],
    'numericInputReadback':reference(out/'numeric-input-readback.json'),
    'candidateQueries':0,'old55And10StrictEvidenceChanged':False,'admissible':False})
print(json.dumps({'status':'prepared-stopped-before-real-contact-queries','roles':len(t['roles']),'checks':len(qa['checks'])}))
