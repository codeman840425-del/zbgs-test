"""Exact source rig/rest preparation. No real garment adaptation or bake."""
import copy
import json

from build import BASE, adapter, bindings, io, module, require

spec=json.loads((BASE/'spec.json').read_bytes())
for reference in spec['inputs']: adapter.pinned(reference)
reader=module(spec['sourceReader'],'kit_prepare_glb')
original,target=[reader.GLB(adapter.pinned(spec[k])) for k in ['sourceBody','targetBody']]
manifest=json.loads(adapter.pinned(spec['equipmentSourceManifest']).read_bytes())
rows=[]
for requested in spec['equipment']:
    entry=next(e for e in manifest['items'] if e['id']==requested['sourceId'])
    g=reader.GLB(adapter.pinned(requested['source']))
    checked=bindings(g,entry,original,target)
    bad=copy.deepcopy(entry);bad['bindings'][0]['inverseBindMatrix'][12]+=.001
    try: bindings(g,bad,original,target)
    except ValueError: rejected=True
    else: rejected=False
    require(rejected,'Bad binding inverse matrix must be rejected')
    rows.append({'sourceId':entry['id'],'source':requested['source'],'bindingCheck':checked,'badBindingRejected':rejected})
io.save(BASE/'prepared.json',{'schema':'axial-head-equipment-preparation-v1','status':'prepared-no-actual-adaptation',
    'spec':io.ref(BASE/'spec.json'),'items':rows,'realBakeInvocations':0,'runtimeAccepted':False})
print(json.dumps({'status':'prepared-no-actual-adaptation','items':len(rows)}))
