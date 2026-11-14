"""Blender native BVH, no cloth simulation. Run only in assigned CPU window.

blender --background --factory-startup --threads 2 --python-exit-code 1
  --python this.py -- experiments/.../initial.json
"""
import hashlib,json,pathlib,sys
import numpy as np
from mathutils.bvhtree import BVHTree
from mathutils import Vector

root=pathlib.Path(__file__).resolve().parents[2]
file=pathlib.Path(sys.argv[sys.argv.index('--')+1]).resolve()
assert file.is_relative_to(root/'experiments/skirt-offline-corrective')
out=file.parent/'contact-diagnosis.json';assert not out.exists(),'Refuse previous diagnosis overwrite'
c=json.loads(file.read_text(encoding='utf8'))
manifest=json.loads((file.parent/'manifest.json').read_text(encoding='utf8'))
assert hashlib.sha256(file.read_bytes()).hexdigest()==manifest['sha256']
t=json.loads((root/'experiments/skirt-offline-corrective/source-topology.json').read_text(encoding='utf8'))
mapping=np.asarray(t['renderToWeld']);tri=t['triangles'];count=len(t['position'])
rows=[]
for key in ['raw','displayed']:
    original=np.asarray(c[key]['positions']);p=np.zeros((count,3));np.add.at(p,mapping,original);p/=np.bincount(mapping)[:,None]
    seam=float(np.max(np.linalg.norm(original-p[mapping],axis=1)))
    assert seam<.001,f'{key}: cannot silently weld split seam {seam}'
    tree=BVHTree.FromPolygons(p.tolist(),tri,all_triangles=True)
    contacts=[]
    for body in c['colliders']:
        bt=BVHTree.FromPolygons(body['positions'],np.asarray(body['triangles']).reshape(-1,3).tolist(),all_triangles=True)
        pairs=tree.overlap(bt);nearest=[]
        for i,v in enumerate(p):
            q,n,face,dist=bt.find_nearest(Vector(v))
            if dist is not None and dist<.01:nearest.append({'vertex':i,'distance':dist,'normalSigned':float((Vector(v)-q).dot(n))})
        contacts.append({'name':body['name'],'uuid':body['uuid'],'trianglePairs':pairs,'within10mm':nearest})
    selfpairs=[(a,b)for a,b in tree.overlap(tree)if a<b and not(set(tri[a])&set(tri[b]))]
    rows.append({'surface':key,'seamMax':seam,'nonadjacentSelfIntersectionPairs':selfpairs,'colliders':contacts})
result={'schema':'m1.skirt-initial-contact.1','build':c['identity']['runtimeBuild']['shortId'],'captureSHA256':manifest['sha256'],
 'method':'Native BVH triangle intersection, original source seam weld mapping. Oriented nearest distance is not inside/outside proof for open clothes. No simulation or visual approval.',
 'surfaces':rows,'displayedIntersectionFree':not rows[1]['nonadjacentSelfIntersectionPairs'] and all(not r['trianglePairs'] for r in rows[1]['colliders'])}
out.write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps({'file':str(out),'displayedIntersectionFree':result['displayedIntersectionFree'],'surfaces':[{'surface':r['surface'],'selfPairs':len(r['nonadjacentSelfIntersectionPairs']),'colliders':[{'name':v['name'],'pairs':len(v['trianglePairs'])}for v in r['colliders']]}for r in rows]}))
