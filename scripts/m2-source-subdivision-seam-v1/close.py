"""Label already-saved overflow/pose witnesses; no geometry evaluation."""
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/m2-source-subdivision-seam-v1';OUT=BASE/'generated'
load=lambda p:json.loads(p.read_bytes())
result=load(OUT/'result.json');over=load(OUT/'overflow-7.json');prov=load(OUT/'provenance-7.json')
chosen=[next(x for x in over if len(x['influences'])==5),next(x for x in over if len(x['influences'])==6),
    next(x for x in over if x['vertex']==22708)]
examples=[]
for x in chosen:
    examples.append({**x,'parentConsumerIdentities':[prov['parentTriangles'][i] for i in x['sourceParentTriangles']]})
closure={'schema':'source-subdivision-seam-closure-v1',
    'status':'blocked-four-influence-format-and-incomplete-parent-classifier',
    'sourceSHA256':'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',
    'resultSHA256':hashlib.sha256((OUT/'result.json').read_bytes()).hexdigest(),
    'crossAccessor41ClosedForOriginalSource':True,'overflowVertices':482,
    'over4Examples':examples,'sourcePoseLBSMaximumDifferenceM':.002644386583177061,
    'parentSyntheticTestsPassedButArtificialInteriorEdgesUnresolved':True,
    'GAuthorizedByThisPackage':False,'subdivisionCalls':2,'noFurtherShapeOrSolverExecution':True}
path=OUT/'closure.json'
if path.exists():raise RuntimeError('Refuse existing closure')
path.write_text(json.dumps(closure,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'examples':examples,'closureSHA256':hashlib.sha256(path.read_bytes()).hexdigest()},ensure_ascii=False))
