"""Read saved original native spring references; no editor or runtime changes."""
import json
from pathlib import Path
import readback as rb
from prepare import ROOT,OUT,write
source=ROOT/'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm'
g=rb.a.reader.GLB(source);d=g.doc
r=json.loads((OUT/'actual-readback/result.json').read_text(encoding='utf-8'))
removedSkin=set(r['skeleton']['removed']);names=[n.get('name','') for n in d['nodes']]
after=rb.a.reader.GLB(Path(r['result']['path']))
afterNames=[n.get('name','') for n in after.doc['nodes']]
assert len(names)==len(set(names)) and len(afterNames)==len(set(afterNames)),'Raw node names ambiguous'
removed=set(names)-set(afterNames)
parent={c:i for i,n in enumerate(d['nodes']) for c in n.get('children',[])}
extension=d.get('extensions',{}).get('VRMC_springBone',{})
rows=[]
for i,s in enumerate(extension.get('springs',[])):
    jointNames=[names[j['node']] for j in s['joints']]
    if removed.intersection(jointNames):rows.append(dict(index=i,names=jointNames,sourceSpring=s,sharedNonRemovedJoints=[n for n in jointNames if n not in removed],colliderGroups=[dict(index=k,definition=extension['colliderGroups'][k],colliders=[dict(index=c,nodeName=names[extension['colliders'][c]['node']],definition=extension['colliders'][c]) for c in extension['colliderGroups'][k]['colliders']]) for k in s.get('colliderGroups',[])]))
roots=[dict(node=i,name=n,parentNode=parent.get(i),parentName=names[parent[i]] if i in parent else None,sourceNode=d['nodes'][i]) for i,n in enumerate(names) if n in removed and (i not in parent or names[parent[i]] not in removed)]
record=dict(schema='native-tops-auxiliary-spring-source-readback-v2',sourceSha256=rb.sha(source),removedRawNodeNames=sorted(removed),removedSkinJointNames=sorted(removedSkin),removedNonSkinNodes=sorted(removed-removedSkin),sourceNodeCount=len(names),resultNodeCount=len(afterNames),auxiliaryRoots=roots,springExtensionSpecVersion=extension.get('specVersion'),originalSpringCount=len(extension.get('springs',[])),springsTouchingRemoved=rows,
    removedBonesNotInSpringJoints=sorted(removed-set(n for row in rows for n in row['names'])),
    collidersAttachedToRemoved=[dict(index=i,nodeName=names[c['node']],definition=c) for i,c in enumerate(extension.get('colliders',[])) if names[c['node']] in removed],
    scope='Reference inventory only. No auxiliary attachment/manager construction or runtime validation. Supersedes the v1 skin-joint-only inventory: outside its removed set did not prove a spring terminal survived in the result.')
write(OUT/'auxiliary-spring-readback-v2.json',record)
print(json.dumps({'roots':[(r['name'],r['parentName']) for r in roots],'springsTouchingRemoved':len(rows),'sharedNonRemovedJoints':[r['sharedNonRemovedJoints'] for r in rows],'collidersOnRemoved':len(record['collidersAttachedToRemoved'])},ensure_ascii=False))
