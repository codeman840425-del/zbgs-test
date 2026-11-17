"""Actual exported-source readback and one original-coarse 55+10 strict pass."""
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time
sys.dont_write_bytecode=True
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
BASE=ROOT/'assets-source/m2-source-proportioned-face-v1'
PINS={}
START=time.monotonic()


def read(path):
    path=Path(path)
    if not path.is_absolute():path=ROOT/path
    data=path.read_bytes();PINS[path.relative_to(ROOT).as_posix()]=hashlib.sha256(data).hexdigest()
    return data


def doc(path):return json.loads(read(path))


def pinned(ref):
    data=read(ref['path']);assert hashlib.sha256(data).hexdigest()==ref['sha256'],ref['path'];return data


def encode(value):return (json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode()


def save(path,value):path.write_bytes(encode(value))


def clean(value):
    if isinstance(value,np.ndarray):return value.tolist()
    if isinstance(value,np.generic):return value.item()
    if isinstance(value,dict):return {k:clean(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [clean(v) for v in value]
    return value


def module(path,name):
    loader=importlib.util.spec_from_file_location(name,ROOT/path);result=importlib.util.module_from_spec(loader);loader.loader.exec_module(result);return result


def pointer(value,text):
    for item in text.strip('/').split('/'):
        item=item.replace('~1','/').replace('~0','~');value=value[int(item)] if isinstance(value,list) else value[item]
    return value


def witness(points,original,A,B,pair):
    i,j=pair;av,bv=A[i],B[j]
    return {'pair':[i,j],'sourceVertexIdsA':av.tolist(),'sourceVertexIdsB':bv.tolist(),
        'sourcePointsA':original[av].tolist(),'sourcePointsB':original[bv].tolist(),
        'candidatePointsA':points[av].tolist(),'candidatePointsB':points[bv].tolist(),
        'candidateMinusSourceA_M':(points[av]-original[av]).tolist(),
        'candidateMinusSourceB_M':(points[bv]-original[bv]).tolist(),
        'meaning':'Strict pair and vertex displacement evidence. Not a visible penetration-depth measurement.'}


def main():
    marker=OUT/'STARTED.json'
    if marker.exists():raise RuntimeError('Preserve first authorized 55+10 run')
    save(marker,{'schema':'source-proportioned-independent-run-start-v1','candidateSHA256':'5120bd32b3491864d216f5a93810829f8f128f974a79824b3c911f62fa0810e5','maxSeconds':600,'maxRssBytes':3*1024**3,'threads':2})
    spec=doc(BASE/'spec.json')
    assert PINS[(BASE/'spec.json').relative_to(ROOT).as_posix()]=='daa6dcd1d7eb7f0652bdbd50b1f27562bec1e977c0491f1bb0719d33f2ad33c5'
    closure=doc(BASE/'closure.json');candidate_ref=next(c for c in closure['cases'] if c['id']==spec['candidateId'])['resource']
    assert candidate_ref['sha256']=='5120bd32b3491864d216f5a93810829f8f128f974a79824b3c911f62fa0810e5'
    pinned(candidate_ref);pinned(spec['source'])
    package=doc(BASE/'package-files.json')
    for row in package['files']:pinned(row)
    for row in spec['inputs']:pinned(row)
    reader=module('scripts/m2-male-face-v1/glb.py','new_preview_source_reader')
    source=reader.GLB(ROOT/spec['source']['path']);candidate=reader.GLB(ROOT/candidate_ref['path'])
    for key in ['nodes','skins','materials','textures','samplers','images','extensions','scenes','scene']:
        assert source.doc.get(key)==candidate.doc.get(key),key
    assert source.images()==candidate.images() and candidate.bin[:len(source.bin)]==source.bin
    records=doc(BASE/'prepared/endpoint-records.json')['records']
    assert len(records)==56 and sum(r['count'] for r in records)==120935
    with np.load(BASE/'generated'/spec['candidateId']/'mapped-endpoints.npz',allow_pickle=False) as z:raw={k:z[k] for k in z.files}
    read(BASE/'generated'/spec['candidateId']/'mapped-endpoints.npz')
    assert all(np.isfinite(v).all() for v in raw.values())
    assert np.array_equal(raw['sourceEndpointsM'][:,1:],raw['mappedEndpointsM'][:,1:])
    groups={}
    consumers=[]
    for mi,(old,new) in enumerate(zip(source.doc['meshes'],candidate.doc['meshes'],strict=True)):
        assert {k:v for k,v in old.items() if k!='primitives'}=={k:v for k,v in new.items() if k!='primitives'}
        for pi,(p,q) in enumerate(zip(old['primitives'],new['primitives'],strict=True)):
            assert np.array_equal(source.acc(p['indices']),candidate.acc(q['indices']))
            assert p['material']==q['material'] and p.get('mode',4)==q.get('mode',4)
            for key in ['TEXCOORD_0','JOINTS_0','WEIGHTS_0']:
                assert np.array_equal(source.acc(p['attributes'][key]),candidate.acc(q['attributes'][key]))
            assert len(p.get('targets',[]))==len(q.get('targets',[]))
            groups.setdefault(p['attributes']['POSITION'],[]).append((p,q))
            consumers.append({'mesh':mi,'primitive':pi,'material':source.doc['materials'][p['material']]['name'],'indexCount':len(source.acc(p['indices'])),'targets':len(p.get('targets',[]))})
    assert len(consumers)==15 and {k:len(v) for k,v in groups.items()}=={7:6,21:9}
    max_position=0.;max_normal=0.;delta_yz_error=0.;render_yz_error=0.
    endpoint_count=0
    for r in records:
        a,n,endpoint=r['offset'],r['count'],r['endpoint'];take=slice(a,a+n)
        p,q=groups[r['positionAccessor']][0]
        original=source.acc(p['attributes']['POSITION']).astype(float)
        base=candidate.acc(q['attributes']['POSITION']);actual=base.copy()
        N=source.acc(p['attributes']['NORMAL']).astype(float)
        if endpoint>=0:
            original+=source.acc(p['targets'][endpoint]['POSITION']).astype(float)
            actual+=candidate.acc(q['targets'][endpoint]['POSITION'])
        assert np.array_equal(original,raw['sourceEndpointsM'][take])
        assert np.array_equal(actual.astype(float),raw['float32BakeRoundTripM'][take])
        max_position=max(max_position,float(np.linalg.norm(actual-raw['mappedEndpointsM'][take],axis=1).max()))
        original_render=source.acc(p['attributes']['POSITION']).copy()
        if endpoint>=0:original_render+=source.acc(p['targets'][endpoint]['POSITION'])
        render_yz_error=max(render_yz_error,float(abs(actual[:,1:]-original_render[:,1:]).max()))
        J=raw['sourceJacobians'][take];expectedN=N.copy();selected=np.max(abs(J-np.eye(3)),axis=(1,2))>1e-6
        transformed=np.linalg.solve(J[selected].transpose(0,2,1),N[selected,:,None])[:,:,0]
        transformed*=np.linalg.norm(N[selected],axis=1)[:,None]/np.maximum(np.linalg.norm(transformed,axis=1),1e-12)[:,None]
        expectedN[selected]=transformed
        if endpoint==-1:
            normbase=expectedN.copy();posbase=raw['mappedEndpointsM'][take].copy()
        for old_p,new_p in groups[r['positionAccessor']]:
            expectedP=raw['mappedEndpointsM'][take].astype(np.float32) if endpoint<0 else (raw['mappedEndpointsM'][take]-posbase).astype(np.float32)
            actualP=candidate.acc(new_p['attributes']['POSITION'] if endpoint<0 else new_p['targets'][endpoint]['POSITION'])
            assert np.array_equal(expectedP,actualP)
            expected=expectedN.astype(np.float32) if endpoint<0 else (expectedN-normbase).astype(np.float32)
            actualN=candidate.acc(new_p['attributes']['NORMAL'] if endpoint<0 else new_p['targets'][endpoint]['NORMAL'])
            max_normal=max(max_normal,float(abs(actualN-expected).max()))
            assert np.array_equal(actualN,expected)
            if endpoint>=0:
                delta_yz_error=max(delta_yz_error,float(abs(actualP[:,1:]-source.acc(old_p['targets'][endpoint]['POSITION'])[:,1:]).max()))
            endpoint_count+=1
    assert render_yz_error==0 and max_normal==0
    contact_spec=doc('assets-source/m2-head-attachment-readback-v1/spec.json')
    old_post=module('scripts/m2-head-attachment-readback-v1/readback.py','original_post_helpers')
    contract=json.loads(pinned(contact_spec['inputs']['sourceContract']))
    assert contract['sourceBody']==spec['source']
    namespace={'np':np};identities=[]
    for key,name in [('segment','segment_hits'),('head','contacts')]:
        ref=contact_spec['inputs'][key];tree=ast.parse(pinned(ref))
        node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
        exec(compile(ast.Module([node],[]),ref['path']+':frozen-only', 'exec'),namespace)
        identities.append({'name':name,'resource':ref,'astSha256':hashlib.sha256(ast.dump(node).encode()).hexdigest()})
    contacts=namespace['contacts']
    mixtures=module('evidence/m2-axial-head-export-audit-v1/check_combinations.py','new_candidate_old_mixtures')
    read('evidence/m2-axial-head-export-audit-v1/check_combinations.py')
    s,c=mixtures.face_data(source),mixtures.face_data(candidate)
    assert s['mapping']==c['mapping'] and len(s['dP'])==len(c['dP'])==54
    assert all(np.array_equal(s['triangles'][role],c['triangles'][role]) for role in s['triangles'])
    mouth=s['triangles']['FaceMouth_00_FACE'];skin=s['triangles']['Face_00_SKIN']
    mouthids=np.unique(mouth);skinids=np.unique(skin)
    proxy0=float(s['P'][mouthids,1].min()-s['P'][skinids,1].min())
    proxy1=float(c['P'][mouthids,1].min()-c['P'][skinids,1].min());assert proxy0==proxy1
    attributes={'schema':'source-proportioned-export-independent-attributes-v1','source':spec['source'],'candidate':candidate_ref,
        'spec':{'path':(BASE/'spec.json').relative_to(ROOT).as_posix(),'sha256':PINS[(BASE/'spec.json').relative_to(ROOT).as_posix()]},
        'consumers':consumers,'sharedGroups':2,'sourceEndpointOccurrences':120935,'consumerEndpointChecks':endpoint_count,
        'sourceIndicesSkinUVIBMSkeletonMaterialsImagesExpressionsPreserved':True,
        'rawAllSourceEndpointYZExact':True,'exportFloat32RenderedAllEndpointYZExact':True,
        'maximumExportMorphDeltaYZBufferDifference':delta_yz_error,'allActualAuthorNormalComponentsMatchPinnedTransfer':True,
        'maximumExportPositionBakeErrorM':max_position,'maximumNormalComponentVersusExpectedError':max_normal,
        'mouthBottomToChinYProxyM':{'source':proxy0,'candidate':proxy1,'ratio':proxy1/proxy0},
        'proxyIsNotGeneralFaceProportionOrVisualAcceptance':True,'functionIdentities':identities}
    save(OUT/'attributes.json',attributes)
    (OUT/'single55').mkdir();(OUT/'mixed10').mkdir()
    progress={'schema':'source-proportioned-independent-contact-run-v1','status':'running','candidate':candidate_ref,'states55':[],'states10':[],'startedAfterAttributeReadback':True}
    cached={};baseline={}
    for frame in contract['contactBaseline']['frames']:
        ref=frame['reference']
        if ref['path'] not in cached:cached[ref['path']]=json.loads(pinned(ref))
        pairs=pointer(cached[ref['path']],ref['jsonPointer'])
        assert len(pairs)==frame['sourceStrictPairCount'] and hashlib.sha256(encode(pairs)).hexdigest()==frame['sourceStrictPairsSHA256CanonicalJSON']
        baseline[frame['target']]=set(map(tuple,pairs))
    assert sorted(baseline)==list(range(-1,54))
    for target in range(-1,54):
        assert time.monotonic()-START<600
        S=source.acc(source.doc['meshes'][1]['primitives'][0]['attributes']['POSITION']).copy()
        C=candidate.acc(candidate.doc['meshes'][1]['primitives'][0]['attributes']['POSITION']).copy()
        if target>=0:
            S+=source.acc(source.doc['meshes'][1]['primitives'][0]['targets'][target]['POSITION'])
            C+=candidate.acc(candidate.doc['meshes'][1]['primitives'][0]['targets'][target]['POSITION'])
        S,C=S.astype(float),C.astype(float);old=baseline[target];actual=contacts(C,mouth,skin)
        added=actual-old
        name='neutral' if target<0 else source.doc['meshes'][1]['extras']['targetNames'][target]
        row={'target':target,'name':name,'sourceStrictPairs':sorted(old),'candidateStrictPairs':sorted(actual),
            'addedStrictPairs':sorted(added),'removedStrictPairs':sorted(old-actual),
            'addedWitnesses':[witness(C,S,mouth,skin,pair) for pair in sorted(added)],
            'sourceCoordinatesSHA256':hashlib.sha256(S.tobytes()).hexdigest(),'candidateCoordinatesSHA256':hashlib.sha256(C.tobytes()).hexdigest(),
            'precision':'Float32 actual source/exported base plus Float32 delta, then Float64 strict predicate.'}
        save(OUT/'single55'/f'{target+1:02d}.json',row)
        progress['states55'].append({'target':target,'name':name,'source':len(old),'candidate':len(actual),'added':len(added),'removed':len(old-actual)})
        save(OUT/'progress.json',progress)
        if added:print(json.dumps({'singleTarget':target,'added':len(added)}),flush=True)
    scenarios=[('neutral',0.,0.,None,0.),('happy-open',.65,0.,None,0.),('neutral-closed',0.,1.,None,0.),('happy-half-blink',.65,.5,None,0.),('happy-full-blink',.65,1.,None,0.)]
    scenarios += [('happy-blink-'+v,.65,1.,v,.66) for v in ['aa','ih','ou','ee','oh']]
    pairs=[('mouth-skin','FaceMouth_00_FACE','Face_00_SKIN'),('white-skin','EyeWhite_00_EYE','Face_00_SKIN'),('white-eyeline','EyeWhite_00_EYE','FaceEyeline_00_FACE'),('white-eyelash','EyeWhite_00_EYE','FaceEyelash_00_FACE')]
    oldmixsummary=doc('evidence/m2-axial-head-export-audit-v1/combination-results.json')
    for index,(name,h,b,vowel,weight) in enumerate(scenarios):
        S,_=mixtures.compose(s,h,b,vowel,weight);C,_=mixtures.compose(c,h,b,vowel,weight)
        oldrow=doc('evidence/m2-axial-head-export-audit-v1/combination-'+f'{index:02d}'+'.json')
        assert oldrow['id']==name
        assert PINS['evidence/m2-axial-head-export-audit-v1/combination-'+f'{index:02d}'+'.json']==oldmixsummary['rows'][index]['sha256']
        rows=[]
        for label,roleA,roleB in pairs:
            assert time.monotonic()-START<600
            A,B=s['triangles'][roleA],s['triangles'][roleB]
            old=set(map(tuple,next(v for v in oldrow['contacts'] if v['pair']==label)['sourceStrictPairs']))
            actual=contacts(C,A,B);added=actual-old
            rows.append({'pair':label,'roleA':roleA,'roleB':roleB,'sourceStrictPairs':sorted(old),'candidateStrictPairs':sorted(actual),
                'addedStrictPairs':sorted(added),'removedStrictPairs':sorted(old-actual),
                'addedWitnesses':[witness(C,S,A,B,pair) for pair in sorted(added)]})
        row={'id':name,'weights':{'happy':h,'blink':b,'vowel':vowel,'vowelWeight':weight,'negativeCorrectedEyeJoy':-h*b},
            'sourceAndCandidateUseSameCorrectionRoles':sorted(mixtures.CORRECTED),'contacts':rows,
            'sourceCoordinateSHA256':hashlib.sha256(S.tobytes()).hexdigest(),'candidateCoordinateSHA256':hashlib.sha256(C.tobytes()).hexdigest(),
            'precision':'Original ordered Float64 weighted sum of actual Float32 buffers. Not identical-GPU-arithmetic proof.'}
        save(OUT/'mixed10'/f'{index:02d}.json',row)
        progress['states10'].append({'id':name,'added':sum(len(r['addedStrictPairs']) for r in rows),'pairs':[{'pair':r['pair'],'source':len(r['sourceStrictPairs']),'candidate':len(r['candidateStrictPairs']),'added':len(r['addedStrictPairs'])} for r in rows]})
        save(OUT/'progress.json',progress);print(json.dumps(progress['states10'][-1]),flush=True)
    new55=sum(r['added'] for r in progress['states55']);new10=sum(r['added'] for r in progress['states10'])
    result={'schema':'source-proportioned-face-independent-audit-v1','status':'strict-new-pairs-preserved' if new55+new10 else 'original-strict-checks-no-new-pairs',
        'candidate':candidate_ref,'source':spec['source'],'specSHA256':attributes['spec']['sha256'],
        'single55':{'statesExpected':55,'statesCompleted':len(progress['states55']),'newStrictPairCount':new55},
        'mixed10':{'statesExpected':10,'statesCompleted':len(progress['states10']),'newStrictPairCount':new10},
        'states55':progress['states55'],'states10':progress['states10'],'seconds':time.monotonic()-START,
        'scope':'Actual new exported Face, same original coarse indices and frozen strict predicates. No refined inclusive contract, no whole-body/garment contacts.',
        'visualSeverityInferredFromCounts':False,'runtimeOrExpressionManagerExecuted':False,'productionAdmission':False,'pins':PINS}
    read(__file__);result['pins']=PINS
    save(OUT/'result.json',result);print(json.dumps({'status':result['status'],'new55':new55,'new10':new10,'seconds':result['seconds']}),flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        save(OUT/'failure.json',{'schema':'independent-face-audit-failure-v1','error':str(error),'type':type(error).__name__,'seconds':time.monotonic()-START,'pins':PINS})
        raise
