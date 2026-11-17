"""Native HairSet001/source comparison. No editor, renderer or shape generation."""
from pathlib import Path
import copy,hashlib,importlib.util,json,sys
sys.dont_write_bytecode=True
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sp=importlib.util.spec_from_file_location('sealed_native_readback',ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/readback.py')
rb=importlib.util.module_from_spec(sp);sp.loader.exec_module(rb)

def image_bytes(g,index):
    image=g.doc['images'][index];assert 'uri' not in image
    view=g.doc['bufferViews'][image['bufferView']]
    return g.bin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]

def canonical_material(g,index):
    value=copy.deepcopy(g.doc['materials'][index])
    def visit(v):
        if isinstance(v,dict):
            for key,child in v.items():
                if 'texture' in key.lower() and isinstance(child,dict) and 'index' in child:
                    t=g.doc['textures'][child['index']]
                    child['index']=dict(imageSHA256=hashlib.sha256(image_bytes(g,t['source'])).hexdigest(),
                        sampler=g.doc.get('samplers',[])[t['sampler']] if 'sampler' in t else {})
                else:visit(child)
        elif isinstance(v,list):
            for child in v:visit(child)
    visit(value)
    return value

def expressions(g):
    value=copy.deepcopy(g.doc['extensions']['VRMC_vrm']['expressions'])
    for group in value.values():
        for expression in group.values():
            for bind in expression.get('morphTargetBinds',[]):
                bind['node']=g.doc['nodes'][bind['node']]['name']
            for kind in ['materialColorBinds','textureTransformBinds']:
                for bind in expression.get(kind,[]):bind['material']=g.doc['materials'][bind['material']]['name']
    return value

def main():
    output=BASE/'cpu-readback';assert not output.exists()
    source=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm'
    candidate=BASE/'generated/male-hairset001.vrm'
    assert sha(source)=='a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da'
    cycle=json.loads((BASE/'native-cycle.json').read_bytes())
    assert cycle['failure'] is None
    pinned=next(x for x in cycle['generated'] if x['path'].endswith('.vrm'))
    assert sha(candidate)==pinned['sha256']
    g0,g1=rb.a.reader.GLB(source),rb.a.reader.GLB(candidate)
    b0,w0,n0=rb.skeleton(g0);b1,w1,n1=rb.skeleton(g1)
    arrays={};rows=[];failures=[]
    for mi,m in enumerate(g0.doc['materials']):
        if '_HAIR' in m['name']:continue
        p0=rb.primitive(g0,w0,n0,m['name']);p1=rb.primitive(g1,w1,n1,m['name'])
        row=rb.compare(p0,p1,arrays,'material'+str(mi))
        keys=sorted(set(p0['keyed'])&set(p1['keyed']))
        old=np.array([p0['keyed'][k][1] for k in keys]);new=np.array([p1['keyed'][k][1] for k in keys])
        target0,target1=p0['p'].get('targets',[]),p1['p'].get('targets',[])
        morphs=[]
        for i,(a,b) in enumerate(zip(target0,target1)):
            exact={};errors={}
            for semantic in set(a)&set(b):
                x,y=g0.acc(a[semantic])[old],g1.acc(b[semantic])[new]
                exact[semantic]=bool(np.array_equal(x,y))
                errors[semantic]=float(np.max(np.abs(x.astype(float)-y.astype(float))))
            morphs.append(dict(target=i,semanticSetsExact=set(a)==set(b),referencedDeltaExact=exact,maximumComponentDifferences=errors))
        row['morphTargets']=dict(source=len(target0),candidate=len(target1),referencedTargets=morphs,
            allExact=len(target0)==len(target1) and all(r['semanticSetsExact'] and all(r['referencedDeltaExact'].values()) for r in morphs))
        target_material=p1['p']['material']
        row['materialTextureGraphExact']=canonical_material(g0,mi)==canonical_material(g1,target_material)
        row['sourceIndexBytesExact']=g0.acc(p0['p']['indices']).tobytes()==g1.acc(p1['p']['indices']).tobytes()
        if row['sourceOnlyTriangleKeys'] or row['resultOnlyTriangleKeys'] or row['ambiguousCorrespondence']:
            failures.append(m['name']+': geometry correspondence differs or ambiguous')
        if not all(row.get('commonReferencedAttributeExact',{}).values()) or not row.get('commonActiveJointLaneBoneNamesExact'):
            failures.append(m['name']+': author attributes or active skin differs')
        if not row['morphTargets']['allExact']:failures.append(m['name']+': source morph endpoint delta differs')
        if not row['materialTextureGraphExact']:failures.append(m['name']+': material/image graph differs')
        rows.append(row)
    common=sorted(set(b0)&set(b1));added=sorted(set(b1)-set(b0));removed=sorted(set(b0)-set(b1))
    ibm=lambda g,names:{names[node]:matrix for skin in g.doc['skins'] for node,matrix in zip(skin['joints'],g.acc(skin['inverseBindMatrices']))}
    ib0,ib1=ibm(g0,n0),ibm(g1,n1)
    differences=[dict(name=n,maxAbs=float(np.max(np.abs(ib0[n]-ib1[n])))) for n in sorted(set(ib0)&set(ib1)) if not np.array_equal(ib0[n],ib1[n])]
    local=lambda n:{k:n[k] for k in ['translation','rotation','scale','matrix'] if k in n}
    skeleton=dict(sourceNodes=len(n0),candidateNodes=len(n1),sourceSkins=[len(s['joints']) for s in g0.doc['skins']],
        candidateSkins=[len(s['joints']) for s in g1.doc['skins']],addedJointNames=added,removedJointNames=removed,
        changedCommonParentNames=[n for n in common if b0[n]['parentName']!=b1[n]['parentName']],
        changedCommonLocalRest=[n for n in common if local(b0[n]['sourceNode'])!=local(b1[n]['sourceNode'])],
        commonWorldMaximumComponentDifference=max(float(np.max(np.abs(np.array(b0[n]['worldMatrix'])-b1[n]['worldMatrix']))) for n in common),
        commonInverseBindDifferences=differences)
    hair=[]
    for ni,node in enumerate(g1.doc['nodes']):
        if 'mesh' not in node:continue
        for pi,p in enumerate(g1.doc['meshes'][node['mesh']]['primitives']):
            material=g1.doc['materials'][p['material']]
            if '_HAIR' not in material['name']:continue
            ids=np.unique(g1.acc(p['indices']));joints=g1.acc(p['attributes']['JOINTS_0'])[ids].astype(int)
            weights=g1.acc(p['attributes']['WEIGHTS_0'])[ids].astype(float);positions=g1.acc(p['attributes']['POSITION'])[ids]
            skin=g1.doc['skins'][node['skin']]
            used=sorted({n1[skin['joints'][j]] for j in joints[weights>0]})
            hair.append(dict(node=ni,mesh=node['mesh'],primitive=pi,skin=node['skin'],materialName=material['name'],
                referencedVertices=len(ids),triangles=g1.doc['accessors'][p['indices']]['count']//3,
                authoredBoundsM=dict(min=positions.min(0),max=positions.max(0)),usedBones=used,
                finite=bool(np.isfinite(positions).all() and np.isfinite(weights).all()),maximumWeightSumError=float(np.abs(weights.sum(1)-1).max()),
                material=canonical_material(g1,p['material'])))
    expr0,expr1=expressions(g0),expressions(g1)
    expression_equal=expr0==expr1
    if not expression_equal:failures.append('Expression semantic bindings differ')
    springs=[]
    for i,s in enumerate(g1.doc.get('extensions',{}).get('VRMC_springBone',{}).get('springs',[])):
        springs.append(dict(index=i,name=s.get('name'),jointNames=[n1[j['node']] for j in s['joints']],
            addedHairJointCount=sum(n1[j['node']] in added for j in s['joints']),definition=s))
    source_meta=g0.doc['extensions']['VRMC_vrm']['meta'];new_meta=g1.doc['extensions']['VRMC_vrm']['meta']
    license_keys=['licenseUrl','avatarPermission','commercialUsage','allowRedistribution','modification','creditNotation']
    assert all(source_meta[k]==new_meta[k] for k in license_keys),'Source license fields changed'
    output.mkdir()
    np.savez_compressed(output/'source-correspondence.npz',**arrays)
    result=dict(schema='native-hairset001-CPU-source-readback-v1',status='native-source-produced-nonhair-CPU-equivalence' if not failures else 'native-source-produced-differences-require-review',
        source=dict(path=source.relative_to(ROOT).as_posix(),sha256=sha(source)),candidate=pinned,
        nonHairPrimitives=rows,skeleton=skeleton,hairPrimitives=hair,springs=springs,
        sourceSpringCount=len(g0.doc.get('extensions',{}).get('VRMC_springBone',{}).get('springs',[])),candidateSpringCount=len(springs),
        expressionsSemanticBindingExact=expression_equal,sourceExpressions=expr0,candidateExpressions=expr1,
        sourceMeta=source_meta,candidateMeta=new_meta,licenseFieldsExact=license_keys,
        originalHumanoidRawNamesExact={k:n0[v['node']] for k,v in g0.doc['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()}=={k:n1[v['node']] for k,v in g1.doc['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()},
        arrays=dict(path=(output/'source-correspondence.npz').relative_to(ROOT).as_posix(),sha256=sha(output/'source-correspondence.npz')),
        helpers=[dict(path=Path(p).relative_to(ROOT).as_posix(),sha256=sha(Path(p))) for p in [__file__,rb.__file__,rb.a.__file__,rb.a.reader.__file__]],
        failures=failures,limits=['No runtime expression, spring dynamics, cloth or head collision, visual or game acceptance',
            'New VRM is masked original Body;7586 full Body PNG is not silently transferred here',
            'New138bone source cannot inherit old79bone garment fit or head-only/raw-head spring configuration',
            'Author preset styling was not viewed in this backend export task'])
    with (output/'result.json').open('xb') as f:f.write((json.dumps(rb.a.clean(result),ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())
    print(json.dumps(rb.a.clean(dict(status=result['status'],nonHairPrimitives=len(rows),skeleton=skeleton,
        hair=[{k:r[k] for k in ['materialName','referencedVertices','triangles','finite','maximumWeightSumError']} for r in hair],
        expressionsSemanticBindingExact=expression_equal,sourceSpringCount=result['sourceSpringCount'],candidateSpringCount=len(springs),failures=failures)),ensure_ascii=False))

if __name__=='__main__':main()
