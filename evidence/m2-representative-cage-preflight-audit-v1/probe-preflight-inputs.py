"""Independently recompute saved preflight source index/endpoint receipts without Blender."""
import hashlib,json,sys
from pathlib import Path
sys.dont_write_bytecode=True
import numpy as np
ROOT=Path('F:/gamemake-representative-cage-trial')
OUT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/production'))
from flow import GLB
def sha(data): return hashlib.sha256(data).hexdigest()
spec=json.loads((OUT/'snapshot-initial/spec.json').read_bytes())
preflight=json.loads((OUT/'snapshot-initial/preflight.json').read_bytes())
source_spec=ROOT/spec['sourceSpec']['path']
assert sha(source_spec.read_bytes())==spec['sourceSpec']['sha256']
assert json.loads(source_spec.read_bytes())['variants']==spec['requests']
rows=[]
for sex,source in spec['sources'].items():
    reference=source['body'];raw=(ROOT/reference['path']).read_bytes()
    assert sha(raw)==reference['sha256']
    g=GLB(raw)
    saved=next(r for r in preflight['sources'] if r['sex']==sex)
    gates={r['id']:r for r in saved['gates']}
    groups={}
    for mesh in g.doc['meshes']:
        for p in mesh['primitives']:
            groups.setdefault(p['attributes']['POSITION'],[]).append(p)
    endpoints=[];group_rows=[]
    for accessor,ps in groups.items():
        P=np.asarray(g.accessor(accessor),np.float32)
        F=np.concatenate([g.accessor(p['indices']) for p in ps]).reshape(-1,3)
        record=gates['source-index-'+str(accessor)]
        assert sha(P.tobytes())==record['positionSha256']
        assert sha(F.astype('<u4').tobytes())==record['indexSha256']
        assert record['vertices']==len(P) and record['triangles']==len(F)
        endpoints.append(P)
        endpoints.extend(P+np.asarray(g.accessor(t['POSITION']),np.float32) for t in ps[0].get('targets',[]))
        group_rows.append({'accessor':accessor,'positionAndIndexSHAExact':True,'endpoints':len(ps[0].get('targets',[]))})
    points=np.concatenate(endpoints)
    gate=gates['closed-cage-all-endpoints']
    low=np.asarray(gate['low']);high=np.asarray(gate['high'])
    margin=float(np.minimum(points-low,high-points).min())
    assert len(points)==gate['pointSamples'] and len(endpoints)==gate['endpointArraysIncludingBase']
    assert abs(margin-gate['minimumBoundaryMarginM'])<1e-7
    assert margin>0
    expression=gates['real-expression-through-dynamic-bind']
    expression_group=next(ps for ps in groups.values() if ps[0].get('targets'))
    D=np.asarray(g.accessor(expression_group[0]['targets'][expression['targetIndex']]['POSITION']),np.float32)
    assert sha(D.tobytes())==expression['sourceDeltaSha256']
    rows.append({'sex':sex,'source':reference,'groups':group_rows,'allSourceEndpointArrays':len(endpoints),'pointSamples':len(points),'rectangularCageMinimumBoundaryMarginM':margin,'expressionProbeSourceDeltaSHAExact':True,'modifierResultScope':'Saved Blender results inspected, not independently re-evaluated. One actual endpoint affine translation only in preflight.'})
result={'requestedEightParameterRecordsExact':True,'sourceSpecSHAExact':True,'sources':rows,'blenderRan':False}
(OUT/'preflight-input-probe.json').write_bytes((json.dumps(result,indent=2)+'\n').encode())
print(json.dumps({'sourceCount':len(rows),'eightRequestsExact':True,'allSourceIndexAndMorphReceiptsExact':True}))
