"""Read saved one-shot arrays, label source seams; no upsample/G/contact candidate call."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import numpy as np
from scipy.sparse import load_npz
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/m2-face-subdivision-preflight-v1'
OUT=BASE/'generated'
loader=importlib.util.spec_from_file_location('subdivision_readback_glb',ROOT/'scripts/m2-male-face-v1/glb.py')
mod=importlib.util.module_from_spec(loader);loader.loader.exec_module(mod)
g=mod.GLB(ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm')
def save(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
seams=json.loads((OUT/'face-body-seams.json').read_bytes())
result=json.loads((OUT/'result.json').read_bytes())
z=np.load(OUT/'source-and-subdivision.npz',allow_pickle=False)
S=load_npz(OUT/'subdivision-matrix.npz').tocsr()
def uses(accessor,edge):
    rows=[]
    for mi,mesh in enumerate(g.doc['meshes']):
        for pi,p in enumerate(mesh['primitives']):
            if p['attributes']['POSITION']!=accessor:continue
            F=g.acc(p['indices']).reshape(-1,3)
            ids=np.flatnonzero(np.isin(F,edge).sum(1)==2)
            if len(ids):rows.append({'mesh':mi,'primitive':pi,'material':g.doc['materials'][p['material']]['name'],
                'triangles':ids.tolist(),'triangleVertices':F[ids].tolist()})
    return rows
details=[]
for row in seams['exactBoundaryEdgeMatches']:
    details.append({**row,'faceUses':uses(21,row['faceEdge']),
        'bodyUses':[{'edge':e,'uses':uses(7,e)} for e in row['bodyEdges']]})
save(OUT/'face-body-seam-materials.json',details)
P=z['sourcePosition'];F=z['sourceTriangles'];Q=z['subdividedPosition'];NF=z['subdividedTriangles']
def crosses(v,f):return np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
expected=np.repeat(crosses(P,F)/4,4,axis=0)
area_error=float(abs(crosses(Q,NF)-expected).max())
indexseams=json.loads((OUT/'index-coordinate-seams.json').read_bytes())
flat=[d for r in indexseams for d in r['duplicates']]
names=sorted({r['material'] for x in details if not x['allEndpointAndEdgeYOutsideSupportSameSide'] for r in x['faceUses']})
body_names=sorted({r['material'] for x in details if not x['allEndpointAndEdgeYOutsideSupportSameSide'] for b in x['bodyUses'] for r in b['uses']})
summary={'schema':'face-subdivision-preflight-closure-v1',
    'resultSHA256':hashlib.sha256((OUT/'result.json').read_bytes()).hexdigest(),
    'status':'hold-before-G-unresolved-cross-accessor-seam-and-contact-provenance',
    'sourceTopologyAndAttributeSubdivisionPassed':True,
    'faceBodyUnsafeSupportEdgeCount':len(result['faceBodyUnsafeSupportEdges']),
    'unsafeFaceMaterials':names,'unsafeBodyMaterials':body_names,
    'allMatchedSeamSourceMorphOffsetsZero':all(x['maximumSourceMorphOffsetM']==0 for x in details),
    'sameSourceTriangleAreaAndOrientationMaxAbsCrossErrorM2':area_error,
    'indexSeamDifferentMorphCount':sum(x['maximumMorphDifferenceM']>0 for x in flat),
    'indexSeamDifferentUVCount':sum(x['UVMaxDifference']>0 for x in flat),
    'indexSeamDifferentAuthoredNormalCount':sum(x['authorNMaxDifference']>0 for x in flat),
    'indexSeamDifferentWeightsCount':sum(x['jointWeightMaxDifference']>0 for x in flat),
    'actualFutureGSeamGapMeasured':False,'candidateContactTestsRun':False,
    'nextDecision':'Root decides seam closure and parent-aware contact contract before G; no automatic further subdivision.'}
assert area_error<1e-15
save(OUT/'closure.json',summary)
print(json.dumps(summary,ensure_ascii=False))
