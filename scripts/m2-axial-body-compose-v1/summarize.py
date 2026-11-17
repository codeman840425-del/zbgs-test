"""Read saved composite/head arrays only; never evaluate B or G."""
import json

from common import BASE,ROOT,body,io,load,np
from types import SimpleNamespace

spec,source,records,P,_,_=load()
case=spec['cases'][1]
folder=BASE/'generated'/case['sourceRequestId']
with np.load(folder/'mapped-endpoints.npz',allow_pickle=False) as raw:
    F=raw['mappedEndpointsM']
with np.load(ROOT/case['headRaw']['path'],allow_pickle=False) as raw:
    G=raw['mappedEndpointsM']
D=F-G
extremities=body.extremity_indices(SimpleNamespace(doc=source.doc,accessor=source.acc))
rows=[]
for r in records:
    a,n=r['offset'],r['count']
    delta=D[a:a+n]
    for p in r['references']:
        ids=np.unique(source.acc(p['indexAccessor'])).astype(int)
        rows.append({'positionAccessor':r['positionAccessor'],'endpoint':r['endpoint'],
            'mesh':p['mesh'],'primitive':p['primitive'],'material':p['material'],
            'changedBodyVertices':int((np.linalg.norm(delta[ids],axis=1)>1e-10).sum()),'changedToleranceM':1e-10,
            'maximumBodyDisplacementM':float(np.linalg.norm(delta[ids],axis=1).max())})
distal=max(float(np.linalg.norm(D[r['offset']+extremities[r['positionAccessor']]],axis=1).max(initial=0)) for r in records)
io.save(folder/'body-contribution-readback.json',{'schema':'saved-composite-body-contribution-readback-v1',
    'meaning':'Recovered F-G from saved Float64 arrays; no new B/G evaluation. Clothing rows here are full-source direct body field, not fitted independent equipment.',
    'sourceRecords':spec['sourceRecords'],'compositeRaw':io.ref(folder/'mapped-endpoints.npz'),'headRaw':case['headRaw'],
    'maximumBodyDisplacementM':float(np.linalg.norm(D,axis=1).max()),
    'maximumSelectedDistalBodyDisplacementM':distal,'rows':rows,'runtimeAccepted':False})
print(json.dumps({'maximumBodyM':float(np.linalg.norm(D,axis=1).max()),'distalM':distal,'rows':len(rows)}))
