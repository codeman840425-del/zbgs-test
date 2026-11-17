"""Locate the already-observed mixed-oh new pair; no shape or parameter search."""
import json,hashlib
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).with_name('oh-new-pair-witness.json')
if OUT.exists():raise SystemExit('Refusing overwrite')
source_path=OUT.with_name('combination-09.json')
row=json.loads(source_path.read_bytes());pair=row['contacts'][0]['addedWitnesses'][0]
origin=np.asarray(json.loads((ROOT/'assets-source/m2-head-cage-skin-domain-v1/generated/male.json').read_bytes())['rawHeadRestOriginM'])
results=[]
for label,akey,bkey in [('original','originalPointsA','originalPointsB'),('lean','leanPointsA','leanPointsB')]:
    A=np.asarray(pair[akey]);B=np.asarray(pair[bkey]);edges=[]
    for direction,T,S,vertex_ids in [('mouth-edge-to-skin',A,B,pair['sourceVertexIdsA']),('skin-edge-to-mouth',B,A,pair['sourceVertexIdsB'])]:
        e1,e2=S[1]-S[0],S[2]-S[0]
        for i in range(3):
            a,b=T[i],T[(i+1)%3];M=np.column_stack([b-a,-e1,-e2]);det=float(np.linalg.det(M))
            if abs(det)<=1e-12:
                edges.append({'direction':direction,'edge':i,'strictDeterminantEligible':False});continue
            t,u,v=np.linalg.solve(M,S[0]-a)
            hit=bool(u>1e-7 and v>1e-7 and u+v<1-1e-7 and t>1e-7 and t<1-1e-7)
            point=a+t*(b-a)
            edges.append({'direction':direction,'edge':i,'sourceVertexIds':[vertex_ids[i],vertex_ids[(i+1)%3]],
                'strictDeterminantEligible':True,'t':float(t),'u':float(u),'v':float(v),'insideStrictMargins':hit,
                'intersectionM':point.tolist(),'intersectionHeadLocalM':(point-origin).tolist()})
    results.append({'source':label,'edgePlaneReadback':edges,'strictHitCount':sum(r.get('insideStrictMargins',False) for r in edges)})
payload={'schema':'mixed-oh-added-strict-pair-location-v1','combination':row['weights'],'sourcePair':pair['trianglePair'],
    'mouthSourceVertexIds':pair['sourceVertexIdsA'],'skinSourceVertexIds':pair['sourceVertexIdsB'],
    'results':results,'meaning':'Independent linear-system location of the already detected strict edge-triangle witnesses, using original 1e-12 determinant and 1e-7 barycentric/segment margins; no new threshold or new mixture.',
    'pins':{p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),source_path]}}
OUT.write_text(json.dumps(payload,indent=2)+'\n',encoding='utf-8')
print(json.dumps(results,indent=2))
