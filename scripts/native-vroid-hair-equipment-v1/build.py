"""Compact exact native HAIR consumers plus official spring dependency closure."""
from pathlib import Path
import argparse,copy,json,struct,sys
sys.dont_write_bytecode=True
import numpy as np
from prepare import ROOT,BASE,SOURCE,TARGET,SOURCE_SHA,TARGET_SHA,STYLE,sha,encode,describe

def plan(source_override=None):
    if source_override is not None:
        assert sha(source_override.read_bytes())==SOURCE_SHA,'Wrong native hair source identity'
    g,target,dependency,fit=describe();d=g.doc
    trace=json.loads((BASE/'dependency.json').read_bytes())
    assert trace==dependency,'Prepared dependency differs'
    ordered=dependency['orderedSourceNodes'];node_map={n:i for i,n in enumerate(ordered)}
    skin_nodes=set(dependency['selectedSkinNodes'])
    blob=bytearray();views=[];accessors=[];textures=[];images=[];materials=[]
    texture_map={};image_map={};accessor_bytes={}
    def view(raw,target_type=None):
        blob.extend(b'\0'*(-len(blob)%4));v=dict(buffer=0,byteOffset=len(blob),byteLength=len(raw))
        if target_type is not None:v['target']=target_type
        views.append(v);blob.extend(raw);return len(views)-1
    def accessor(array,original,target_type=None):
        array=np.ascontiguousarray(array)
        a=copy.deepcopy(original);assert not a.get('sparse')
        for key in ['bufferView','byteOffset','min','max']:a.pop(key,None)
        a['count']=len(array);a['bufferView']=view(array.tobytes(),target_type)
        if 'min' in original:a['min']=array.reshape(len(array),-1).min(0).tolist()
        if 'max' in original:a['max']=array.reshape(len(array),-1).max(0).tolist()
        index=len(accessors);accessors.append(a);accessor_bytes[index]=array.tobytes();return index
    def signature(index):
        a=accessors[index]
        return dict(accessor=index,componentType=a['componentType'],type=a['type'],count=a['count'],
            normalized=a.get('normalized',False),sha256=sha(accessor_bytes[index]))
    def image(old):
        if old not in image_map:
            im=copy.deepcopy(d['images'][old]);assert 'uri' not in im
            v=d['bufferViews'][im['bufferView']]
            im['bufferView']=view(g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])
            image_map[old]=len(images);images.append(im)
        return image_map[old]
    def texture(old):
        if old not in texture_map:
            t=copy.deepcopy(d['textures'][old]);assert not t.get('extensions')
            t['source']=image(t['source']);texture_map[old]=len(textures);textures.append(t)
        return texture_map[old]
    def material_refs(value):
        if isinstance(value,dict):
            for key,child in value.items():
                if 'texture' in key.lower() and isinstance(child,dict) and 'index' in child:child['index']=texture(child['index'])
                else:material_refs(child)
        elif isinstance(value,list):
            for child in value:material_refs(child)
    meshes=[];skins=[];mesh_fits=[];skin_fits=[];export_trace=[]
    for output_mesh,c in enumerate(dependency['consumers']):
        p=c['sourcePrimitiveData'];ids=np.array(c['sourceVertexIds'],dtype=int);skin=d['skins'][c['sourceSkin']]
        selected=[i for i,n in enumerate(skin['joints']) if n in skin_nodes]
        assert len(selected)==64
        original_to_new={i:j for j,i in enumerate(selected)}
        head_old=skin['joints'].index(next(i for i,n in enumerate(d['nodes']) if n['name']=='J_Bip_C_Head'))
        old_joints=g.acc(p['attributes']['JOINTS_0'])[ids]
        weights=g.acc(p['attributes']['WEIGHTS_0'])[ids]
        remapped=old_joints.copy();zero_changes=0
        for row in range(len(ids)):
            for lane in range(4):
                old=int(old_joints[row,lane])
                if old not in original_to_new:
                    assert weights[row,lane]==0,'Positive hair weight references excluded bone'
                    remapped[row,lane]=original_to_new[head_old];zero_changes+=1
                else:remapped[row,lane]=original_to_new[old]
        attributes={}
        for semantic,old in p['attributes'].items():
            values=remapped if semantic=='JOINTS_0' else g.acc(old)[ids]
            attributes[semantic]=accessor(values,d['accessors'][old],34962)
        old_index=g.acc(p['indices']);mapping={int(old):new for new,old in enumerate(ids)}
        indices=np.array([mapping[int(i)] for i in old_index.reshape(-1)],dtype=old_index.dtype).reshape(old_index.shape)
        index=accessor(indices,d['accessors'][p['indices']],34963)
        matrices=g.acc(skin['inverseBindMatrices'])[selected]
        ibm=accessor(matrices,d['accessors'][skin['inverseBindMatrices']])
        own_skin=copy.deepcopy(skin);own_skin['joints']=[node_map[skin['joints'][i]] for i in selected];own_skin['inverseBindMatrices']=ibm
        if 'skeleton' in own_skin:own_skin['skeleton']=node_map[own_skin['skeleton']]
        skins.append(own_skin)
        mat=copy.deepcopy(d['materials'][c['sourceMaterial']]);material_refs(mat);materials.append(mat)
        out_p={k:copy.deepcopy(v) for k,v in p.items() if k not in ['attributes','indices','material']}
        assert not out_p.get('targets')
        out_p.update(attributes=attributes,indices=index,material=output_mesh)
        meshes.append(dict(name=c['meshName'],primitives=[out_p]))
        mesh_fits.append(dict(name=c['meshName'],node=node_map[c['sourceNode']],mesh=output_mesh,primitive=0,skin=output_mesh,
            material=output_mesh,materialName=c['materialName'],attributes={k:signature(v) for k,v in attributes.items()},
            indices=signature(index),sourcePrimitive=dict(node=c['sourceNode'],mesh=c['sourceMesh'],primitive=c['sourcePrimitive'])))
        skin_fits.append(dict(index=output_mesh,joints=own_skin['joints'],jointNames=[d['nodes'][skin['joints'][i]]['name'] for i in selected],inverseBindMatrices=signature(ibm)))
        export_trace.append(dict(sourceNode=c['sourceNode'],outputMesh=output_mesh,sourceVertexIds=ids.tolist(),
            sourceToOutputSkinJoints={str(old):new for old,new in original_to_new.items()},zeroWeightOutOfSubsetLanesRepointedToHead=zero_changes,
            weightsAndAuthorAttributesRetainedExact=True,sourceTopologyIndexedViaSourceVertexIds=True))
    nodes=[]
    for original in ordered:
        n=copy.deepcopy(d['nodes'][original]);n.pop('mesh',None);n.pop('skin',None)
        if 'children' in n:n['children']=[node_map[i] for i in n['children'] if i in node_map]
        nodes.append(n)
    for i,c in enumerate(dependency['consumers']):nodes[node_map[c['sourceNode']]].update(name=c['meshName'],mesh=i,skin=i)
    ext=d['extensions']['VRMC_springBone'];native=copy.deepcopy(ext)
    group_map={old:new for new,old in enumerate(dependency['selectedColliderGroupIndices'])}
    collider_map={old:new for new,old in enumerate(dependency['selectedColliderIndices'])}
    native['colliders']=[copy.deepcopy(ext['colliders'][i]) for i in dependency['selectedColliderIndices']]
    for c in native['colliders']:c['node']=node_map[c['node']]
    native['colliderGroups']=[copy.deepcopy(ext['colliderGroups'][i]) for i in dependency['selectedColliderGroupIndices']]
    for c in native['colliderGroups']:c['colliders']=[collider_map[i] for i in c['colliders']]
    native['springs']=[copy.deepcopy(ext['springs'][i]) for i in dependency['selectedSpringIndices']]
    for s in native['springs']:
        for j in s['joints']:j['node']=node_map[j['node']]
        if 'center' in s:s['center']=node_map[s['center']]
        s['colliderGroups']=[group_map[i] for i in s.get('colliderGroups',[])]
    own=dict(asset={'version':'2.0','generator':'native-vroid-hair-equipment-v1 exact native HAIR extraction'},scene=0,
        scenes=[{'name':'NativeHairSet001','nodes':[node_map[n] for n in d['scenes'][d.get('scene',0)]['nodes'] if n in node_map]}],
        nodes=nodes,meshes=meshes,skins=skins,materials=materials,textures=textures,images=images,samplers=copy.deepcopy(d.get('samplers',[])),
        accessors=accessors,bufferViews=views,buffers=[{'byteLength':len(blob)}],extensions={'VRMC_springBone':native},
        extras=dict(sourceVrmSha256=SOURCE_SHA,targetAvatarSha256=TARGET_SHA,sourceMeta=d['extensions']['VRMC_vrm']['meta'],scope='Only two actual HAIR consumers; no VRM humanoid, face or second body scene'))
    used=set()
    def scan(value):
        if isinstance(value,dict):
            used.update(value.get('extensions',{}))
            for child in value.values():scan(child)
        elif isinstance(value,list):
            for child in value:scan(child)
    scan(own);own['extensionsUsed']=sorted(used)
    own['extensionsRequired']=[e for e in d.get('extensionsRequired',[]) if e in used]
    js=json.dumps(own,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*(-len(js)%4);blob.extend(b'\0'*(-len(blob)%4))
    raw=struct.pack('<4sII',b'glTF',2,28+len(js)+len(blob))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(blob),b'BIN\0')+blob
    fit['assetSha256']=sha(raw);fit['meshes']=mesh_fits;fit['skins']=skin_fits
    fit['materials']=[dict(index=i,gltfName=m['name'],expectedSurfaceName=m['name'],expectedOutlineName=m['name']+' (Outline)') for i,m in enumerate(materials)]
    fit['nativeSpring']['extensionSha256']=sha(json.dumps(native,sort_keys=True,separators=(',',':')).encode())
    fit['nativeSpring']['jointNames']=[d['nodes'][i]['name'] for i in dependency['selectedSkinNodes'] if d['nodes'][i]['name'].startswith('J_Sec_Hair')]
    fit_raw=encode(fit)
    manifest=dict(schema='character-hairstyle-v2',id=STYLE,version=1,mount='avatar-rest-local',physics='vrm-spring-native',skinned=True,
        url='/assets/native-hairset001-v1/hair.glb',sha256=sha(raw),bytes=len(raw),sourceBodySha256=SOURCE_SHA,sourceVrmSha256=SOURCE_SHA,
        sourceMaterials=fit['sourceMaterials'],compatibleBodies=[TARGET_SHA],fit=dict(id=fit['id'],version=1,url='/assets/native-hairset001-v1/fit.json',sha256=sha(fit_raw)),
        sourceLicense=dict(status='author-internal-technical-candidate',sourceVRMMeta=d['extensions']['VRMC_vrm']['meta']),runtimeAccepted=False)
    trace=dict(schema='native-hair-equipment-extraction-v1',source=dict(path=SOURCE,sha256=SOURCE_SHA),target=dict(path=TARGET,sha256=TARGET_SHA),
        meshes=export_trace,nodeMap=dependency['sourceToOutputNodes'],sourceImageToOutput=image_map,sourceTextureToOutput=texture_map,
        sourceMaterialIndices=[c['sourceMaterial'] for c in dependency['consumers']],nativeSpringIndices=dependency['selectedSpringIndices'],
        retainedSkinnedHairBones=59,externalFrames=15,nonHairMeshes=0,compactAllReferencedVertices=True,
        note='Only zero-weight lanes outside selected skin are repointed to Head; original weights/positive bone identities/IBM and author geometry retained')
    return {'hair.glb':raw,'fit.json':fit_raw,'manifest.json':encode(manifest),'extraction.json':encode(trace)}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,default=BASE/'generated');p.add_argument('--source',type=Path);a=p.parse_args()
    files=plan(a.source);assert files==plan(a.source),'Repeated extraction differs'
    assert not a.out.exists(),'Fresh output required';a.out.mkdir(parents=True)
    for name,data in files.items():
        with (a.out/name).open('xb') as f:f.write(data)
    print(json.dumps({n:dict(sha256=sha(b),bytes=len(b)) for n,b in files.items()}))
