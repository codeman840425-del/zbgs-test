"""Pin existing topology inputs for later G consumption; no array evaluation."""
import difflib,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-boundary-refinement-api-recovery-v1'
def ref(path):return {'path':path,'sha256':hashlib.sha256((ROOT/path).read_bytes()).hexdigest()}
body='assets-source/m2-boundary-refinement-api-recovery-v1/generated/'
face='assets-source/m2-source-subdivision-seam-v1/generated/'
contract={'schema':'boundary-recovery-pre-G-source-inputs-v1','scope':'source topology/linear source attribute interpolation only; not G output or approved VRM',
 'originalVRM':ref('prototype/public/assets/foundation/base-male-roundtrip.vrm'),
 'sourceCoordinateSpace':'original GLB rest metres, mesh nodes67/68 identity; original head origin/curve coordinates unchanged',
 'groups':[{'originalPositionAccessor':7,'consumers':6,'vertices':7896,'targets':0,
   'arrays':ref(body+'body-arrays.npz'),'positionKey':'newPosition','normalKey':'newNORMAL','uvKey':'newUV',
   'jointKey':'newJointIDs','weightKey':'newWeights','trianglesKey':'newTriangles',
   'parentKey':'parentTriangle','parentBaryKey':'parentBary','materialKey':'materialIndices',
   'provenance':ref(body+'body-provenance.json'),
   'sparseMapping':ref(body+'S-body-csr.npz'),
   'sparseFormat':'CSR archive {data,indices,indptr,shape}; use scipy.sparse.csr_matrix((data,indices,indptr),shape=tuple(shape)); not scipy.load_npz format'},
  {'originalPositionAccessor':21,'consumers':9,'vertices':7251,'targets':54,
   'arrays':ref(face+'group-21.npz'),'positionKey':'newPosition','deltaKey':'newDelta',
   'normalKey':'new_NORMAL','uvKey':'new_TEXCOORD_0','denseWeightKey':'newDenseWeights',
   'skinNodeKey':'skinJointNodes','trianglesKey':'newTriangles','parentKey':'parentTriangle','parentBaryKey':'parentBary',
   'provenance':ref(face+'provenance-21.json'),'sparseMapping':ref(face+'S-21.npz'),
   'sparseFormat':'scipy sparse.save_npz; use scipy.sparse.load_npz',
   'endpointRule':'base=newPosition; endpoint_j=newPosition+newDelta[j] in original target order; no Face subdivision rerun'}],
 'baseVertices':15147,'distinctEndpointOccurrences':406701,
 'endpointCountRule':'7896 Body base + 7251 Face*(1+54); do not invent Body morph endpoints',
 'originalAccessorIDsAreProvenanceOnly':True,
 'consumerPartition':'Each new triangle keeps parentTriangle; look up original parent consumer/material in provenance parentTriangles, not old primitive index buffers.',
 'preservedIdentity':'Original raw skeleton/IBM/VRM expression JSON/materials/textures retained as source contract; this package contains no exported replacement VRM.',
 'futureEvaluationRequirements':['Explicit new spec/source identity; do not borrow old9911/120935 endpoint coverage.',
 'Read saved original G coefficients only if separately authorized; evaluate G(P+D)-G(P) and authored N via endpoint J as original contract.',
 'Derive fixed-eye masks from actual refined material consumers, including new edge points; retain original neck/frame contract and read back full endpoints.',
 'Actual101 Face_SKIN sections use refined triangle consumer partition; all original thresholds unchanged.',
 'Body-only boundary refinement does not repair other Body coarse-G triangles.',
 'Parent/artificial internal-edge contact classification remains unresolved. Topology pass is not expression/contact admission.'],
 'GCalled':False,'candidateContactsExecuted':False,'exported':False}
path=BASE/'pre-G-source-inputs.json'
if path.exists():raise RuntimeError('Refuse overwrite')
path.write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
old=(ROOT/'scripts/m2-boundary-refinement-preflight-v1/blender_worker.py').read_text(encoding='utf-8')
new=(ROOT/'scripts/m2-boundary-refinement-api-recovery-v1/blender_worker.py').read_text(encoding='utf-8')
(BASE/'source-readback-only.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='sealed-first-failure/blender_worker.py',tofile='recovery/blender_worker.py')),encoding='utf-8')
print(json.dumps(ref(path.relative_to(ROOT).as_posix())))
