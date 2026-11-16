"""Inspect frozen first-batch actual geometry and skin bindings; no Blender invocation."""
from pathlib import Path
import hashlib,json,sys
sys.dont_write_bytecode=True
import numpy as np
ROOT=Path('F:/gamemake-representative-cage-trial')
OUT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/production'))
from flow import GLB
def sha(data): return hashlib.sha256(data).hexdigest()
spec=json.loads((OUT/'snapshot-initial/spec.json').read_bytes())
rows=[]
for request in spec['requests']:
    sex=request['sex'];source=spec['sources'][sex]
    g=GLB((ROOT/source['body']['path']).read_bytes())
    folder=ROOT/'assets-source/m2-representative-cage-trial-v1/generated'/(request['basePresetId']+'-cage-trial-v1')
    raw=(folder/'avatar.vrm').read_bytes();target=GLB(raw)
    by_node={h['node']:h['bone'] for h in g.doc['extensions']['VRM']['humanoid']['humanBones']}
    joints=g.doc['skins'][0]['joints']
    names=[by_node.get(n,g.doc['nodes'][n].get('name',str(n))) for n in joints]
    hand_ids=[i for i,n in enumerate(names) if any(t in n.lower() for t in ['hand','thumb','index','middle','ring','little'])]
    foot_ids=[i for i,n in enumerate(names) if any(t in n.lower() for t in ['foot','toes'])]
    skin_unchanged=g.doc['skins']==target.doc['skins'] and g.doc['nodes']==target.doc['nodes']
    assert skin_unchanged
    for skin in g.doc['skins']:
        assert np.array_equal(g.accessor(skin['inverseBindMatrices']),target.accessor(skin['inverseBindMatrices']))
    maxima={'all':{'distanceM':-1},'handDominant':{'distanceM':-1},'footDominant':{'distanceM':-1}}
    seen=set()
    for mi,(m,tm) in enumerate(zip(g.doc['meshes'],target.doc['meshes'])):
        for pi,(p,tp) in enumerate(zip(m['primitives'],tm['primitives'])):
            a=p['attributes'];ta=tp['attributes']
            assert p['indices']==tp['indices']
            for attr in ['JOINTS_0','WEIGHTS_0','TEXCOORD_0']:
                assert np.array_equal(g.accessor(a[attr]),target.accessor(ta[attr]))
            accessor=a['POSITION']
            if accessor in seen:continue
            seen.add(accessor)
            P=np.asarray(g.accessor(accessor));Q=np.asarray(target.accessor(ta['POSITION']))
            J=np.asarray(g.accessor(a['JOINTS_0']),int);W=np.asarray(g.accessor(a['WEIGHTS_0']))
            distances=np.linalg.norm(Q-P,axis=1)
            for category,mask in [('all',np.ones(len(P),bool)),('handDominant',(np.isin(J,hand_ids)*W).sum(1)>.5),('footDominant',(np.isin(J,foot_ids)*W).sum(1)>.5)]:
                ids=np.flatnonzero(mask)
                if not len(ids):continue
                index=int(ids[np.argmax(distances[ids])]);distance=float(distances[index])
                if distance>maxima[category]['distanceM']:
                    maxima[category]={'distanceM':distance,'sourcePositionAccessor':accessor,'vertex':index,'sourcePositionM':P[index].tolist(),'targetPositionM':Q[index].tolist(),'weights':[{'joint':names[int(j)],'weight':float(w)} for j,w in zip(J[index],W[index]) if w>0]}
    report=json.loads((folder/'report.json').read_bytes())
    assert report['avatar']['sha256']==sha(raw)
    rows.append({'id':report['id'],'avatarSha256':sha(raw),'avatarPath':str(folder/'avatar.vrm'),'sourceBody':source['body'],'status':report['status'],'runtimeAccepted':report['runtimeAccepted'],'nodeSkinIBMAndWeightsUVExact':True,'minimumMeasuredModifierJacobianDeterminant':report['minimumMeasuredModifierJacobianDeterminant'],'garmentJacobianGate':report['garmentJacobianGate'],'maxDisplacements':maxima})
result={'scope':'Frozen generated first batch raw rest geometry, actual skin weights identify hand/foot regions (>0.5 total category influence). Bones/IBMs unchanged independently verified. Does not reconstruct pose or skin rest frame. No Blender/GPU run.','cases':rows}
(OUT/'actual-batch-displacement-probe.json').write_bytes((json.dumps(result,indent=2)+'\n').encode())
print(json.dumps([{'id':r['id'],'allM':r['maxDisplacements']['all']['distanceM'],'handM':r['maxDisplacements']['handDominant']['distanceM'],'footM':r['maxDisplacements']['footDominant']['distanceM'],'dominant':r['maxDisplacements']['all']['weights']} for r in rows]))
