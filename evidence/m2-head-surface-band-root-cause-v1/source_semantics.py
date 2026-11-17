"""Fill witness-node source materials from original endpoint records; no solve."""
import sys
sys.dont_write_bytecode=True
import json,hashlib
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).with_name('source-semantics.json')
if OUT.exists():raise SystemExit('Refusing to overwrite evidence')
result_path=Path(__file__).with_name('result.json')
r=json.loads(result_path.read_bytes())
dp=ROOT/'assets-source/m2-head-volume-domain-v1/generated/domain.npz'
rp=ROOT/'assets-source/m2-head-volume-domain-v1/generated/endpoint-records.json'
D=np.load(dp,allow_pickle=False);V=D['nodesM'];E=D['sourceEndpointsM']
records=json.loads(rp.read_bytes());lookup={tuple(p):i for i,p in enumerate(V)}
selected={v['node'] for c in r['cases'] for t in c['tetWitnesses'] for v in t['vertices']}
rows={n:{} for n in sorted(selected)}
for record in records:
    for vi,p in zip(record['sourceIndices'],E[record['offset']:record['offset']+record['count']]):
        node=lookup.get(tuple(p))
        if node not in selected:continue
        key=(record['mesh'],record['primitive'],record['material'],record['positionAccessor'],record['role'])
        value=rows[node].setdefault(key,{'mesh':key[0],'primitive':key[1],'material':key[2],'positionAccessor':key[3],'sourceRole':key[4],'sourceIndices':set(),'endpoints':set(),'occurrences':0})
        value['sourceIndices'].add(vi);value['endpoints'].add(record['endpoint']);value['occurrences']+=1
output=[]
for n,m in rows.items():
    material_rows=[]
    for v in m.values():
        v['sourceIndices']=sorted(v['sourceIndices']);v['endpoints']=sorted(v['endpoints']);material_rows.append(v)
    output.append({'node':n,'sourceMaterialRecords':material_rows,'outerFrame':bool(n in D['frameNodes'])})
payload={'schema':'saved-tet-witness-source-materials-v1','nodes':output,'meaning':'result.json sourceSemantics is accessory-classification-table membership only; empty there does not mean a source node lacks a material. This file adds all original endpoint record materials, including Face_SKIN.',
 'pins':{p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),result_path,dp,rp]},'solverCalled':False}
OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'nodes':len(output),'worstTetNodes':[x for x in output if x['node'] in [1013,739,453,793,5000,5535,5255,5561]]}))
