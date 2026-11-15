"""Read-only original-source support/normal-neighborhood check; no candidate export."""
from pathlib import Path
import json,hashlib,sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=ROOT/'assets-source/face-nose-parameters-v1/measurements.json'
data=json.loads(source.read_text(encoding='utf-8'));out=[]
for sex,b in data['bodies'].items():
 path=ROOT/b['source']['sourceVRM'];assert sha(path)==b['source']['sourceVRMSha256']
 g=GLB(path);face=g.doc['meshes'][b['faceMeshIndex']]
 mouth=json.loads((ROOT/f'assets-source/face-parameters-v1/{sex}-mouth-width.recipe.json').read_text(encoding='utf-8'))
 brow=json.loads((ROOT/f'assets-source/face-brow-parameters-v1/{sex}-brow.recipe.json').read_text(encoding='utf-8'))
 supports={'mouth':{i for i,w in enumerate(mouth['weights'])if w>0},'nose':set(b['supportVertices']),'brow':set(brow['browVertices'])}
 tri=[tuple(map(int,t))for p in face['primitives']for t in g.acc(p['indices']).reshape(-1,3)]
 affected={k:{i for t in tri if any(v in ids for v in t)for i in t}for k,ids in supports.items()}
 assert not(supports['nose']&supports['mouth'] or supports['nose']&supports['brow'])
 out.append({'sex':sex,'baseSha256':sha(path),'movedVertices':{k:len(v)for k,v in supports.items()},'normalAffectedVertices':{k:len(v)for k,v in affected.items()},'mouthNoseNormalNeighborhoodIntersection':sorted(affected['mouth']&affected['nose']),'allThreeNormalNeighborhoodIntersection':sorted(affected['mouth']&affected['nose']&affected['brow']),'activeMouthAndNoseNormalUnion':len(affected['mouth']|affected['nose']),'sourceOnly':True})
report={'scope':'Original source support only; no derived nose endpoint, GPU or runtime validation','measurementSha256':sha(source),'results':out}
(Path(__file__).parent/'plan-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
