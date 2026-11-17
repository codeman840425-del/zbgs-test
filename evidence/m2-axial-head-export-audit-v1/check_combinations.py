"""Ten offline exported-array mixtures; no manager, new asset, or 55-target rerun."""
import sys
sys.dont_write_bytecode=True
import ast,json,time,hashlib
from pathlib import Path
import numpy as np
from audit_export import ROOT,BASE,digest,load_glb_type
OUT=Path(__file__).with_name('combination-results.json')
SEGMENT=ROOT/'scripts/m2-hairstyle-v1/check-head-space.py'
CONTACT=ROOT/'scripts/m2-representative-head-cage-v1/head.py'
CORRECTED={'Face_00_SKIN','EyeWhite_00_EYE','FaceEyeline_00_FACE','FaceEyelash_00_FACE'}
PROTECTED={'FaceMouth_00_FACE','FaceBrow_00_FACE','EyeIris_00_EYE','EyeHighlight_00_EYE','EyeExtra_01_EYE'}
def original_contacts():
    ns={'np':np};ids=[]
    for path,name in [(SEGMENT,'segment_hits'),(CONTACT,'contacts')]:
        fn=next(n for n in ast.parse(path.read_bytes()).body if isinstance(n,ast.FunctionDef) and n.name==name)
        exec(compile(ast.Module([fn],[]),str(path)+':read-only-original-function','exec'),ns)
        ids.append({'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path),'function':name,'astSha256':hashlib.sha256(ast.dump(fn).encode()).hexdigest()})
    return ns['contacts'],ids
def face_data(g):
    mesh=g.doc['meshes'][1];pr=mesh['primitives'][0];names=mesh['extras']['targetNames'];assert len(names)==54
    groups=g.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups'];mapping={}
    for old,new,suffix in [('joy','happy','ALL_Joy'),('blink','blink','EYE_Close'),('a','aa','MTH_A'),('i','ih','MTH_I'),('u','ou','MTH_U'),('e','ee','MTH_E'),('o','oh','MTH_O')]:
        group=next(x for x in groups if x['presetName']==old);assert not group['isBinary'] and len(group['binds'])==1
        bind=group['binds'][0];assert bind['mesh']==1 and bind['weight']==100 and names[bind['index']].endswith('_Fcl_'+suffix)
        mapping[new]=bind['index']
    eye=[i for i,n in enumerate(names) if n.endswith('_Fcl_EYE_Joy')];assert len(eye)==1;mapping['eyeJoy']=eye[0]
    triangles={};ids={}
    for p in mesh['primitives']:
        assert p['attributes']['POSITION']==pr['attributes']['POSITION'] and p.get('targets')==pr.get('targets')
        material=g.doc['materials'][p['material']]['name'];assert material.startswith('M00_000_00_')
        role=material.removeprefix('M00_000_00_');assert role in CORRECTED|PROTECTED
        triangles[role]=g.acc(p['indices']).astype(int).reshape(-1,3);ids[role]=np.unique(triangles[role])
    corrected=np.unique(np.concatenate([ids[r] for r in CORRECTED]));protected=np.unique(np.concatenate([ids[r] for r in PROTECTED]))
    assert not np.intersect1d(corrected,protected).size
    N=g.acc(pr['attributes']['NORMAL']).astype(float)
    return {'P':g.acc(pr['attributes']['POSITION']).astype(float),'N':N,'dP':[g.acc(t['POSITION']).astype(float) for t in pr['targets']],
        'dN':[g.acc(t['NORMAL']).astype(float) if 'NORMAL' in t else np.zeros_like(N) for t in pr['targets']],
        'triangles':triangles,'ids':ids,'corrected':corrected,'mapping':mapping}
def compose(data,h,b,vowel,v):
    P=data['P'].copy();N=data['N'].copy();mapping=data['mapping']
    for name,weight in [('happy',h),('blink',b),(vowel,v)]:
        if name is not None and weight:
            P+=weight*data['dP'][mapping[name]];N+=weight*data['dN'][mapping[name]]
    selected=data['corrected'];i=mapping['eyeJoy']
    P[selected]-=h*b*data['dP'][i][selected];N[selected]-=h*b*data['dN'][i][selected]
    assert np.isfinite(P).all() and np.isfinite(N).all()
    return P,N
def run():
    if OUT.exists():raise SystemExit('Refusing overwrite')
    GLB=load_glb_type();source_path=ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm'
    lean_path=BASE/'generated/male-long-lean-axial-head-v1.vrm'
    assert digest(lean_path)=='83f4907f3943940b90a8876ed79496b20476f0d38ecf31414fb8b94f3bacb8f9'
    source,lean=face_data(GLB(source_path)),face_data(GLB(lean_path));assert source['mapping']==lean['mapping']
    for role in source['triangles']:assert np.array_equal(source['triangles'][role],lean['triangles'][role])
    contacts,contact_sources=original_contacts()
    scenarios=[('neutral',0.,0.,None,0.),('happy-open',.65,0.,None,0.),('neutral-closed',0.,1.,None,0.),
        ('happy-half-blink',.65,.5,None,0.),('happy-full-blink',.65,1.,None,0.)]
    scenarios += [('happy-blink-'+v,.65,1.,v,.66) for v in ['aa','ih','ou','ee','oh']]
    pairs=[('mouth-skin','FaceMouth_00_FACE','Face_00_SKIN'),('white-skin','EyeWhite_00_EYE','Face_00_SKIN'),
        ('white-eyeline','EyeWhite_00_EYE','FaceEyeline_00_FACE'),('white-eyelash','EyeWhite_00_EYE','FaceEyelash_00_FACE')]
    rows=[];started=time.monotonic()
    for number,(name,h,b,vowel,v) in enumerate(scenarios):
        destination=OUT.with_name(f'combination-{number:02d}.json')
        if destination.exists():raise SystemExit('Preserve completed combination '+name)
        P0,N0=compose(source,h,b,vowel,v);P1,N1=compose(lean,h,b,vowel,v)
        pair_results=[]
        for label,arole,brole in pairs:
            assert time.monotonic()-started<600,'Bounded readback time budget exhausted'
            A=source['triangles'][arole];B=source['triangles'][brole]
            old=contacts(P0,A,B);new=contacts(P1,A,B);added=sorted(new-old);removed=sorted(old-new)
            witnesses=[]
            for ai,bi in added[:12]:
                av,bv=A[ai],B[bi]
                witnesses.append({'trianglePair':[ai,bi],'sourceVertexIdsA':av.tolist(),'sourceVertexIdsB':bv.tolist(),
                    'originalPointsA':P0[av].tolist(),'originalPointsB':P0[bv].tolist(),'leanPointsA':P1[av].tolist(),'leanPointsB':P1[bv].tolist()})
            pair_results.append({'pair':label,'roleA':arole,'roleB':brole,'sourceStrictPairs':sorted(old),'leanStrictPairs':sorted(new),
                'addedStrictPairs':added,'removedStrictPairs':removed,'addedWitnesses':witnesses,
                'meaning':'Same strict noncoplanar edge-triangle routine, same original source mixture; eye contacts are diagnostic, not an invented occlusion threshold.'})
        geometry=[]
        for role,T in source['triangles'].items():
            a=np.cross(P0[T[:,1]]-P0[T[:,0]],P0[T[:,2]]-P0[T[:,0]])
            z=np.cross(P1[T[:,1]]-P1[T[:,0]],P1[T[:,2]]-P1[T[:,0]])
            area0,area1=np.linalg.norm(a,axis=1),np.linalg.norm(z,axis=1);valid=area0>0
            reversed_ids=np.flatnonzero(valid&(area1>0)&(np.einsum('ij,ij->i',a,z)<=0))
            geometry.append({'role':role,'sourceDegenerateTriangles':np.flatnonzero(area0==0).tolist(),
                'leanDegenerateTriangles':np.flatnonzero(area1==0).tolist(),'newDegenerateTriangles':np.flatnonzero(valid&(area1==0)).tolist(),
                'nonpositiveSourceNormalDotTriangles':reversed_ids.tolist(),'minimumAreaRatio':float((area1[valid]/area0[valid]).min()),
                'minimumOriginalMixedAuthoredNormalLength':float(np.linalg.norm(N0[source['ids'][role]],axis=1).min()),
                'minimumLeanMixedAuthoredNormalLength':float(np.linalg.norm(N1[source['ids'][role]],axis=1).min()),
                'maximumSourceVersusLeanPositionDifferenceM':float(np.linalg.norm(P1[source['ids'][role]]-P0[source['ids'][role]],axis=1).max())})
        row={'id':name,'weights':{'happy':h,'blink':b,'vowel':vowel,'vowelWeight':v,'correctedEyeJoyWeight':-h*b},
            'contacts':pair_results,'geometry':geometry,'realManagerExecuted':False,'gpuRendered':False,
            'precision':'Float64 ordered weighted sums of actual exported Float32 arrays; no claim of identical GPU arithmetic.',
            'coverageOrVisibilityMeasured':False}
        destination.write_text(json.dumps(row,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
        rows.append({'id':name,'result':destination.name,'sha256':digest(destination),
            'contacts':[{'pair':r['pair'],'source':len(r['sourceStrictPairs']),'lean':len(r['leanStrictPairs']),'added':len(r['addedStrictPairs']),'removed':len(r['removedStrictPairs'])} for r in pair_results],
            'newDegenerate':sum(len(r['newDegenerateTriangles']) for r in geometry),'directionChanges':sum(len(r['nonpositiveSourceNormalDotTriangles']) for r in geometry)})
        print(json.dumps(rows[-1]),flush=True)
    result={'schema':'axial-exported-ten-combinations-readback-v1','rows':rows,'seconds':time.monotonic()-started,
        'mapping':source['mapping'],'contactFunctions':contact_sources,'sourceAndLeanUseSamePerMaterialCorrection':True,
        'original55SingleTargetsRerun':False,'realManagerExecuted':False,'gpuRendered':False,'newAssetGenerated':False,
        'pins':{p.relative_to(ROOT).as_posix():digest(p) for p in [Path(__file__),source_path,lean_path,OUT.with_name('export-result.json')]}}
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
if __name__=='__main__':run()
