"""One exact source-rest four-item kit under the sealed head-only axial G."""
import ast
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time

sys.dont_write_bytecode = True
import numpy as np
from scipy.interpolate import PPoly

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-axial-head-equipment-v1'


def module(path, name):
    loader = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(result)
    return result


adapter = module('scripts/m2-axial-head-export-v1/adapter.py', 'kit_container_adapter')
io, require = adapter.io, adapter.require


def function(path, name, env):
    node = next(n for n in ast.parse((ROOT/path).read_bytes()).body if isinstance(n, ast.FunctionDef) and n.name == name)
    exec(compile(ast.Module([node], []), path + ':' + name, 'exec'), env)
    return env[name]


def rest(g):
    parents = {child: i for i, node in enumerate(g.doc['nodes']) for child in node.get('children', [])}
    require(all(not any(k in n for k in ['matrix', 'rotation', 'scale']) for n in g.doc['nodes']), 'Only actual translation-only original rig is supported')
    cache = {}
    def world(i):
        if i not in cache:
            cache[i] = np.asarray(g.doc['nodes'][i].get('translation', [0,0,0]), float) + (world(parents[i]) if i in parents else 0)
        return cache[i]
    return {n['name']: world(i) for i,n in enumerate(g.doc['nodes'])}


def bindings(g, entry, original, target):
    require(original.doc['nodes'] == target.doc['nodes'] and original.doc['skins'] == target.doc['skins'], 'New body skeleton/skin differs')
    source_rest, gear_rest = rest(original), rest(g)
    target_nodes = {n['name']: i for i,n in enumerate(target.doc['nodes'])}
    body_skin = original.doc['skins'][0]
    body_names = [original.doc['nodes'][i]['name'] for i in body_skin['joints']]
    body_ibm = original.acc(body_skin['inverseBindMatrices'])
    human = {target.doc['nodes'][h['node']]['name']: h['bone'] for h in target.doc['extensions']['VRM']['humanoid']['humanBones']}
    require(len(g.doc['skins']) == 1, 'Expected one existing equipment skin')
    skin = g.doc['skins'][0]
    names = [g.doc['nodes'][i]['name'] for i in skin['joints']]
    ibm = g.acc(skin['inverseBindMatrices'])
    require(len(entry['bindings']) == len(names), 'Manifest binding count differs')
    for i,(name, binding) in enumerate(zip(names, entry['bindings'], strict=True)):
        require(name in target_nodes and name in body_names, 'Unknown equipment raw bone')
        require(binding['sourceBone'] == binding['targetRawBone'] == name and binding['humanoidSemantic'] == human.get(name), 'Raw/semantic binding differs')
        require(np.array_equal(ibm[i], body_ibm[body_names.index(name)]) and np.array_equal(ibm[i], binding['inverseBindMatrix']), 'Equipment inverse bind differs')
        require(np.array_equal(gear_rest[name], source_rest[name]), 'Equipment rest coordinates differ from original body')
        require(np.array_equal(target.acc(body_skin['inverseBindMatrices'])[body_names.index(name)], ibm[i]), 'New body inverse bind differs')
    mesh_nodes = [(i,n) for i,n in enumerate(g.doc['nodes']) if 'mesh' in n]
    require(len(mesh_nodes) == 1 and mesh_nodes[0][0] in g.doc['scenes'][g.doc.get('scene',0)]['nodes'] and
        not any(k in mesh_nodes[0][1] for k in ['matrix','translation','rotation','scale']), 'Equipment mesh must have original identity rest transform')
    return {'jointCount': len(names), 'rawBones': names, 'allRestPositionsExact': True,
        'allSourceTargetAndManifestInverseBindsExact': True, 'meshRestMatrix': np.eye(4).T.ravel(), 'units': 'original source rest metres'}


def adapt(g, curve, operator):
    consumers = {}
    for mi,mesh in enumerate(g.doc['meshes']):
        for pi,p in enumerate(mesh['primitives']):
            consumers.setdefault(p['attributes']['POSITION'], []).append((mi,pi,p))
    results, stats = {}, []
    for accessor, refs in consumers.items():
        ps = [r[2] for r in refs]
        require(all(not p.get('targets') and p.get('mode',4) == 4 and 'TANGENT' not in p['attributes'] for p in ps), 'Only actual source triangle garments without targets/tangents supported')
        require(len({p['attributes']['NORMAL'] for p in ps}) == 1, 'Shared garment normal sources differ')
        P = g.acc(accessor).astype(float)
        Q,J,inside = operator(P, curve)
        require(np.isfinite(Q).all() and np.isfinite(J).all() and np.linalg.det(J).min() > .12, 'Garment G/J gate fails')
        ids = np.unique(np.concatenate([g.acc(p['indices']).ravel() for p in ps])).astype(int)
        require(np.array_equal(ids,np.arange(len(P))), 'Unexpected unreferenced source garment points')
        N = g.acc(ps[0]['attributes']['NORMAL']).astype(float)
        mapped_N = adapter.function('scripts/m2-representative-batch-v1/deform.py', 'normal_map')(N,J)
        results[accessor] = {'positions':Q, 'normals':mapped_N, 'endpoints':[], 'endpointNormals':[]}
        cross_rows = []
        for mi,pi,p in refs:
            F = g.acc(p['indices']).astype(int).reshape(-1,3)
            def cross(A): return np.cross(A[F[:,1]]-A[F[:,0]],A[F[:,2]]-A[F[:,0]])
            before,after = cross(P),cross(Q.astype(np.float32).astype(float))
            source_area,actual_area = np.linalg.norm(before,axis=1),np.linalg.norm(after,axis=1)
            newzero = (source_area>0)&(actual_area==0)
            flipped = (source_area>0)&(actual_area>0)&(np.einsum('ij,ij->i',before,after)<=0)
            require(not newzero.any() and not flipped.any(), 'Garment new degenerate/nonpositive normal-dot triangles')
            cross_rows.append({'mesh':mi,'primitive':pi,'material':g.doc['materials'][p['material']]['name'],
                'vertices':len(np.unique(F)),'triangles':len(F),'newDegenerate':int(newzero.sum()),'nonpositiveOriginalNormalDot':int(flipped.sum())})
        stats.append({'positionAccessor':accessor,'vertices':len(P),'sourceBoundsM':[P.min(0),P.max(0)],
            'mappedBoundsM':[Q.min(0),Q.max(0)],'insideSupportVertices':int(inside.sum()),
            'changedPositionVertices':int(np.any(Q!=P,axis=1).sum()),'maximumDisplacementM':float(np.linalg.norm(Q-P,axis=1).max()),
            'actualGMinimumDeterminant':float(np.linalg.det(J).min()),'allPositionsExactIdentity':bool(np.array_equal(P,Q)),
            'allJacobiansExactIdentity':bool(np.array_equal(J,np.broadcast_to(np.eye(3),J.shape))), 'primitives':cross_rows})
    identity = all(r['allPositionsExactIdentity'] and r['allJacobiansExactIdentity'] for r in stats)
    adapter.validate_results(g,results)
    return results,stats,identity


def make_plan(spec):
    for row in spec['inputs']: adapter.pinned(row)
    reader = module(spec['sourceReader'], 'exact_kit_glb')
    original, target = [reader.GLB(adapter.pinned(spec[k])) for k in ['sourceBody','targetBody']]
    source_manifest = json.loads(adapter.pinned(spec['equipmentSourceManifest']).read_bytes())
    curve = json.loads(adapter.pinned(spec['coefficients']).read_bytes())
    operator = function('scripts/m2-axial-head-evaluation-v1/evaluate.py','operator',{'np':np,'PPoly':PPoly})
    outputs, entries, fit_rows = {}, [], []
    for requested in spec['equipment']:
        start=time.monotonic()
        entry=next(e for e in source_manifest['items'] if e['id']==requested['sourceId'])
        require(entry['sha256']==requested['source']['sha256'] and entry['compatibleAvatarSha256']==spec['sourceBody']['sha256'], 'Original equipment manifest identity differs')
        source_path=adapter.pinned(requested['source']);g=reader.GLB(source_path)
        binding=bindings(g,entry,original,target)
        results,stats,identity=adapt(g,curve,operator)
        embedded=[]
        for mesh in g.doc['meshes']:
            for p in mesh['primitives']:
                name=g.doc['materials'][p['material']]['name']
                matching=[q for m in original.doc['meshes'] for q in m['primitives'] if original.doc['materials'][q['material']]['name']==name]
                if not matching:
                    embedded.append({'material':name,'matchingOriginalMaterial':False,'meaning':'Authored shorts inner-facing; no original embedded surface claimed.'})
                    continue
                require(len(matching)==1,'Ambiguous original embedded garment material')
                q=matching[0];sourceP=original.acc(q['attributes']['POSITION']);targetP=target.acc(target.doc['meshes'][0]['primitives'][original.doc['meshes'][0]['primitives'].index(q)]['attributes']['POSITION'])
                selected=np.unique(original.acc(q['indices'])).astype(int)
                lookup={tuple(sourceP[i]):i for i in selected}
                P=g.acc(p['attributes']['POSITION']);Q=results[p['attributes']['POSITION']]['positions'].astype(np.float32)
                matches=[(i,lookup[tuple(v)]) for i,v in enumerate(P) if tuple(v) in lookup]
                errors=[float(np.linalg.norm(Q[i]-targetP[j])) for i,j in matches]
                require(max(errors,default=0)==0,'Common-G embedded garment correspondence differs')
                embedded.append({'material':name,'matchingOriginalMaterial':True,'sourceVertices':len(P),'exactOriginalPositionMatches':len(matches),
                    'maximumMatchedTargetPositionDifferenceM':max(errors,default=None),
                    'unmatchedVertices':len(P)-len(matches),'meaning':'Exact position correspondence only; shorts edited hem points may be unmatched.'})
        if identity:
            raw=source_path.read_bytes()
        else:
            raw=adapter.bake_bytes(g,results,'m2-axial-head-equipment-v1 exact sealed axial G; target='+spec['targetBody']['sha256'])
        filename=requested['id']+'.glb';outputs[filename]=raw
        derived=copy.deepcopy(entry)
        for key in ['materialRecipes','fitResource','shapeFit','pairedWith']:
            derived.pop(key,None)
        derived.update(id=requested['id'],url=filename,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),
            compatibleAvatarSha256=spec['targetBody']['sha256'],fitId=requested['id']+'-fit-v1',
            method='Same saved axial G and actual DG author-normal transport; exact rig/bind/UV/images retained.',
            limits=['Exact head-only lean body only. Static rest/numerical and attribute evidence only; posed garment contact and visual acceptance pending.'])
        entries.append(derived)
        fit_rows.append({'id':derived['fitId'],'equipmentId':derived['id'],'sourceEntry':entry,'source':requested['source'],
            'targetBody':spec['targetBody'],'assetSha256':derived['sha256'],'identityResourceReused':identity,
            'bindings':binding,'groups':stats,'embeddedSourceCorrespondence':embedded,'seconds':time.monotonic()-start,'runtimeAccepted':False})
    return outputs,{'schema':'zbgs-equipment-v1','items':entries},fit_rows


if __name__=='__main__':
    spec=json.loads((BASE/'spec.json').read_bytes());out=BASE/'generated'
    require(not out.exists(),'Preserve first four-item build')
    out.mkdir()
    report={'schema':'axial-head-equipment-build-v1','status':'building','runtimeAccepted':False}
    try:
        outputs,manifest,fits=make_plan(spec)
        repeated,repeat_manifest,repeat_fits=make_plan(spec)
        require(outputs==repeated and manifest==repeat_manifest,'Repeated source adaptation differs')
        reader=module(spec['sourceReader'],'actual_kit_readback')
        for requested,fit in zip(spec['equipment'],fits,strict=True):
            name=requested['id']+'.glb';path=out/name;path.write_bytes(outputs[name])
            source=reader.GLB(adapter.pinned(requested['source']));actual=reader.GLB(path)
            curve=json.loads(adapter.pinned(spec['coefficients']).read_bytes())
            operator=function('scripts/m2-axial-head-evaluation-v1/evaluate.py','operator',{'np':np,'PPoly':PPoly})
            expected,_,identity=adapt(source,curve,operator)
            fit['actualReadback']=adapter.readback(source,actual,expected,identity=identity)
        io.save(out/'equipment.json',manifest)
        io.save(out/'fit.json',{'schema':'axial-head-equipment-fit-v1','targetBody':spec['targetBody'],'coefficients':spec['coefficients'],
            'methodSpec':io.ref(BASE/'spec.json'),'items':fits,'repeatAllAssetBytesIdentical':True,'runtimeAccepted':False})
        command=[sys.executable,'-B',str(ROOT/'scripts/m1-variants/build-forearm-profile.py'),'--input',spec['targetBody']['path'],
            '--body-id',spec['targetId'],'--expect-sha',spec['targetBody']['sha256'],'--output',str((out/'forearm').relative_to(ROOT))]
        process=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120)
        (out/'forearm-generation.log').write_bytes(process.stdout)
        require(process.returncode==0,'Existing exact-body forearm generator failed; source/output preserved')
        arm=module('scripts/m1-assets/build-forearm-collision-profile.py','actual_kit_arm_measure')
        original_arm=arm.load('source',adapter.pinned(spec['sourceBody']))
        target_arm=arm.load(spec['targetId'],adapter.pinned(spec['targetBody']))
        arm_rows=[]
        for side in ['left','right']:
            before,after=arm.prepare(original_arm,side),arm.prepare(target_arm,side)
            ids=before[7]
            require(np.array_equal(ids,after[7]) and np.array_equal(before[6],after[6]),'Forearm selection changed')
            require(np.array_equal(original_arm['pos'][ids],target_arm['pos'][ids]) and
                np.array_equal(original_arm['j'][ids],target_arm['j'][ids]) and
                np.array_equal(original_arm['w'][ids],target_arm['w'][ids]) and
                np.array_equal(original_arm['ibm'],target_arm['ibm']),'Forearm source geometry/bind differs')
            arm_rows.append({'side':side,'sourceVertexIndices':ids,'sourceFaceIndices':before[6],
                'sourcePositionSHA256':hashlib.sha256(original_arm['pos'][ids].tobytes()).hexdigest(),
                'targetPositionSHA256':hashlib.sha256(target_arm['pos'][ids].tobytes()).hexdigest(),
                'selectedPositionsWeightsJointsAndIBMExact':True})
        io.save(out/'forearm-source-equivalence.json',{'schema':'axial-head-forearm-input-check-v1','sourceBody':spec['sourceBody'],
            'targetBody':spec['targetBody'],'rows':arm_rows,'profileActuallyRegenerated':True,'posedContactPassed':False})
        report.update(status='source-kit-readback-complete-not-runtime-acceptance',repeatAllAssetBytesIdentical=True,
            manifest=io.ref(out/'equipment.json'),fit=io.ref(out/'fit.json'),forearm=io.ref(out/'forearm/profile.json'),
            bodyCoverage=None,garmentCoverage=None,coverageReason='No original male body mask. Original outer+top mask excludes this four-item kit; not inherited.')
    except Exception as error:
        report.update(status='failed-not-admissible',error=f'{type(error).__name__}: {error}')
    io.save(out/'report.json',report)
    print(json.dumps(report))
    raise SystemExit(0 if report['status']=='source-kit-readback-complete-not-runtime-acceptance' else 2)
