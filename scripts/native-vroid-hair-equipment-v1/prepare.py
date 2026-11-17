"""Exact native hair dependency/fit description; no solver or editor calls."""
from pathlib import Path
import hashlib,importlib.util,json,sys
sys.dont_write_bytecode=True
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/native-vroid-hair-equipment-v1'
SOURCE='assets-source/native-vroid-hairset-study-v1/generated/male-hairset001.vrm'
TARGET='assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm'
SOURCE_SHA='dab423674f42d3e6e79eb1b8aa1375e5b664e11bf130d093c14f78c5d3967238'
TARGET_SHA='7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81'
STYLE='native-male-hairset001-v1'
sha=lambda b:hashlib.sha256(b).hexdigest()
encode=lambda v:(json.dumps(v,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode()

def describe():
    assert sha((ROOT/SOURCE).read_bytes())==SOURCE_SHA
    assert sha((ROOT/TARGET).read_bytes())==TARGET_SHA
    helper=ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/readback.py'
    sp=importlib.util.spec_from_file_location('native_hair_source_reader',helper)
    rb=importlib.util.module_from_spec(sp);sp.loader.exec_module(rb)
    source,target=[rb.a.reader.GLB(ROOT/p) for p in [SOURCE,TARGET]]
    d,t=source.doc,target.doc
    _,world,names=rb.skeleton(source);_,target_world,target_names=rb.skeleton(target)
    assert len(set(names))==len(names) and len(set(target_names))==len(target_names)
    target_lookup={n:i for i,n in enumerate(target_names)}
    parent={c:i for i,n in enumerate(d['nodes']) for c in n.get('children',[])}
    target_parent={c:i for i,n in enumerate(t['nodes']) for c in n.get('children',[])}
    humanoid={v['node']:k for k,v in d['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()}
    ext=d['extensions']['VRMC_springBone']
    springs=[i for i,s in enumerate(ext['springs']) if any(names[j['node']].startswith('J_Sec_Hair') for j in s['joints'])]
    assert len(springs)==12
    groups=sorted({i for s in springs for i in ext['springs'][s].get('colliderGroups',[])})
    colliders=sorted({i for g in groups for i in ext['colliderGroups'][g]['colliders']})
    assert len(groups)==10 and len(colliders)==22
    hair_joints={j['node'] for s in springs for j in ext['springs'][s]['joints'] if not names[j['node']].endswith('_end')}
    assert len(hair_joints)==59
    consumers=[];skin_nodes=set(hair_joints);needed=set(hair_joints)
    for ni,node in enumerate(d['nodes']):
        if 'mesh' not in node:continue
        for pi,p in enumerate(d['meshes'][node['mesh']]['primitives']):
            material=d['materials'][p['material']]['name']
            if '_HAIR' not in material:continue
            ids=np.unique(source.acc(p['indices'])).astype(int)
            indices=source.acc(p['attributes']['JOINTS_0'])[ids].astype(int)
            weights=source.acc(p['attributes']['WEIGHTS_0'])[ids]
            skin=d['skins'][node['skin']]
            used={skin['joints'][i] for i in indices[weights>0]}
            skin_nodes.update(used);needed.update(used);needed.add(ni)
            consumers.append(dict(sourceNode=ni,sourceMesh=node['mesh'],sourcePrimitive=pi,sourceSkin=node['skin'],
                materialName=material,sourceMaterial=p['material'],sourceVertexIds=ids.tolist(),
                meshName='NativeHairCap' if 'HairBack' in material else 'NativeHairStrands',
                sourcePrimitiveData=p,referencedVertices=len(ids),triangles=source.acc(p['indices']).size//3))
    assert len(consumers)==2 and len(skin_nodes)==64
    for s in springs:
        needed.update(j['node'] for j in ext['springs'][s]['joints'])
        if 'center' in ext['springs'][s]:needed.add(ext['springs'][s]['center'])
    needed.update(ext['colliders'][i]['node'] for i in colliders)
    for node in list(needed):
        while node in parent:node=parent[node];needed.add(node)
    ordered=sorted(needed);node_map={n:i for i,n in enumerate(ordered)}
    mesh_nodes={c['sourceNode'] for c in consumers}
    external=[]
    for node in ordered:
        if names[node].startswith('J_Sec_Hair') or node in mesh_nodes:continue
        name=names[node];other=target_lookup[name]
        n=d['nodes'][node];q=t['nodes'][other]
        local=lambda n:{'position':n.get('translation',[0,0,0]),'quaternion':n.get('rotation',[0,0,0,1]),'scale':n.get('scale',[1,1,1])}
        assert 'matrix' not in n and 'matrix' not in q and local(n)==local(q),name
        assert np.array_equal(world[node],target_world[other]),name
        source_parent=names[parent[node]] if node in parent else None
        other_parent=target_names[target_parent[other]] if other in target_parent else None
        assert source_parent==other_parent,name
        external.append(dict(node=node_map[node],name=name,sourceNode=node,targetRawNode=name,targetNode=other,
            humanoidSemantic=humanoid.get(node),parentName=source_parent,targetParentName=other_parent,
            restLocal=local(n),sourceRestMatrix=np.array(world[node]).T.reshape(-1).tolist()))
    fit=dict(schema='character-hair-fit-v3',id='native-male-hairset001-7586-fit-v1',version=1,styleId=STYLE,
        physics='vrm-spring-native',assetSha256=None,sourceBodySha256=SOURCE_SHA,sourceVrmSha256=SOURCE_SHA,targetBodySha256=TARGET_SHA,
        sourceMaterials=[c['materialName'] for c in consumers],
        attachment=dict(parent='vrm.scene',space='avatar-rest-local',position=[0,0,0],quaternion=[0,0,0,1],scale=[1,1,1]),
        hideOriginal=dict(hideWholeBody=False,materialNames=['N00_000_00_HairBack_00_HAIR (Instance)']),
        externalFrames=external,restMatrixSpace='original source avatar-scene-local metres, column-major16',
        nativeSpring=dict(extension='VRMC_springBone',specVersion=ext['specVersion'],springCount=12,
            expectedJointCount=59,colliderCount=22,colliderGroupCount=10,centerProxy='Root',
            syncOrder='target vrm.update -> proxy world-to-parent-local sync -> official manager.update once',
            initialization='mount under vrm.scene -> sync owned externalFrames -> official manager.setInitState'),
        expectedMeshCount=2,expectedSkinJointCounts=[64,64],runtimeAccepted=False)
    metadata=dict(schema='native-hair-equipment-dependency-v1',source=dict(path=SOURCE,sha256=SOURCE_SHA),target=dict(path=TARGET,sha256=TARGET_SHA),
        sourceToOutputNodes={str(n):node_map[n] for n in ordered},orderedSourceNodes=ordered,
        selectedSpringIndices=springs,selectedColliderGroupIndices=groups,selectedColliderIndices=colliders,
        selectedSkinNodes=sorted(skin_nodes),consumers=consumers,outputNodeCount=len(ordered),
        helperPins=[dict(path=Path(p).relative_to(ROOT).as_posix(),sha256=sha(Path(p).read_bytes())) for p in [helper,rb.a.__file__,rb.a.reader.__file__]])
    return source,target,metadata,fit

if __name__=='__main__':
    source,target,metadata,fit=describe();BASE.mkdir(parents=True,exist_ok=True)
    for name,value in [('dependency.json',metadata),('fit-draft.json',fit)]:
        with (BASE/name).open('xb') as f:f.write(encode(value))
    print(json.dumps({'outputNodes':metadata['outputNodeCount'],'externalFrames':len(fit['externalFrames']),'skinJoints':fit['expectedSkinJointCounts']}))
