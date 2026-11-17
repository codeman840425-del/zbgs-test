"""Exact collision-input reuse for a new body/head numerical identity."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace

sys.dont_write_bytecode=True
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/m2-axial-body-readback-v1'


def require(condition,message):
    if not condition: raise ValueError(message)


def module(path,name):
    loader=importlib.util.spec_from_file_location(name,ROOT/path)
    result=importlib.util.module_from_spec(loader);loader.loader.exec_module(result)
    return result


io=module('scripts/m2-axial-head-evaluation-v1/source.py','body_contact_io')
legacy=module('scripts/m2-head-attachment-readback-v1/readback.py','body_contact_pure_helpers')
sys.path.insert(0,str(ROOT/'evidence/m2-axial-head-export-audit-v1'))
mixtures=module('evidence/m2-axial-head-export-audit-v1/check_combinations.py','original_ten_mixtures')


def pinned(ref):
    path=ROOT/ref['path'];require(io.sha(path)==ref['sha256'],'Input SHA differs: '+ref['path']);return path


def digest_array(values):
    return hashlib.sha256(np.ascontiguousarray(values).tobytes()).hexdigest()


def numeric_gate(report,spec):
    require(report['schema']=='axial-body-composition-result-v1' and report['methodId']=='m2-axial-body-compose-v1'
        and report['status']=='axial-body-numerical-candidate-only','Not a complete-body numerical candidate')
    require(report['id']==spec['candidateId'] and report['sourceRequestId']==spec['sourceRequestId'] and
        report['methodSpec']==spec['compositionSpec'] and report['source']==spec['source'],'Wrong body/head identity')
    require(report['finite'] and report['failures']==[],'Incomplete numerical gates')
    require(report['rawArrays']==spec['compositeRaw'] and report['sourceRecords']==spec['sourceRecords'],'Wrong complete arrays/partition')
    require(report['actualFJacobian']['finite'] and report['actualFJacobian']['minimumDeterminant']>.12,'Actual JF gate fails')
    for name in ['maximumFixedEyeDisplacementM','maximumHeadContributionAtNeckM','maximumHeadContributionAtFrameM']:
        require(np.isfinite(report[name]) and report[name]<=2e-6,'Fixed-reference gate fails: '+name)
    require(report['fixedEyeBodyHeadDecomposition']['maximumBodyDisplacementM']==0,'Eye body contribution nonzero')
    bake=report['float32MorphBakeReadback'];section=report['original101HorizontalSectionsFloat32']
    require(bake['finite'] and bake['maximumErrorM']<=2e-6,'Float32 position gate fails')
    require(section['passed'] and section['sectionCount']==101 and section['missingSections']==0 and section['maximumErrorM']<=.002,'Original101 gate fails')


def load(require_audit=True):
    spec=json.loads((BASE/'spec.json').read_bytes())
    for ref in spec['inputs']: pinned(ref)
    numeric=json.loads(pinned(spec['numericReport']).read_bytes());numeric_gate(numeric,spec)
    if require_audit:
        audit=json.loads(pinned(spec['compositionAudit']).read_bytes())
        require(audit['schema']=='axial-body-composition-independent-audit-v1' and
            audit['status']=='no-new-numerical-blocker' and audit['originalThirteenParametersExact'],'Numerical independent audit blocks readback')
        for ref in [spec['compositionSpec'],spec['compositeRaw']]:
            require(audit['pins'][ref['path']]==ref['sha256'],'Audit does not bind composition input')
    evaluation=json.loads(pinned(spec['sourceEvaluationSpec']).read_bytes())
    source,inventory=io.load(evaluation)
    records,P,groups,unused=io.source_records(source,inventory)
    require(json.loads(pinned(spec['sourceRecords']).read_bytes())['records']==records,'Incomplete full-union source partition')
    with np.load(pinned(spec['compositeRaw']),allow_pickle=False) as data:
        raw={k:data[k] for k in data.files}
    require(np.array_equal(raw['sourceEndpointsM'],P) and raw['mappedEndpointsM'].shape==raw['float32BakeRoundTripM'].shape==P.shape==(120935,3),'Full original endpoint arrays differ')
    require(raw['sourceJacobians'].shape==(120935,3,3) and all(np.isfinite(v).all() for v in raw.values()),'Missing/nonfinite full arrays')
    require(np.linalg.det(raw['sourceJacobians']).min()>.12,'Saved actual JF fails')
    contract=json.loads(pinned(spec['sourceContactContract']).read_bytes())
    require(contract['sourceBody']==spec['source'],'Original contact source differs')
    return spec,source,records,raw,contract


def candidate_face(source,records,raw):
    data=mixtures.face_data(source)
    face=[r for r in records if r['positionAccessor']==21]
    require([r['endpoint'] for r in face]==list(range(-1,54)),'Missing original Face base/54 endpoints')
    base=face[0];a,n=base['offset'],base['count']
    require(n==2056,'Wrong Face union')
    P=raw['mappedEndpointsM'][a:a+n];N=raw['mappedAuthorNormals'][a:a+n]
    data['P']=P.astype(np.float32).astype(float);data['N']=N.astype(np.float32).astype(float)
    data['dP']=[];data['dN']=[]
    for r in face[1:]:
        start=r['offset'];data['dP'].append((raw['mappedEndpointsM'][start:start+n]-P).astype(np.float32).astype(float))
        data['dN'].append((raw['mappedAuthorNormals'][start:start+n]-N).astype(np.float32).astype(float))
    for r in face:
        actual=data['P'].astype(np.float32)
        if r['endpoint']>=0: actual=actual+data['dP'][r['endpoint']].astype(np.float32)
        require(np.array_equal(actual.astype(float),raw['float32BakeRoundTripM'][r['offset']:r['offset']+n]),'Actual morph Float32 encoding differs')
    return data


def equal_inputs(current,previous):
    require(current['mapping']==previous['mapping'] and set(current['triangles'])==set(previous['triangles']),'Expression roles changed')
    rows=[]
    for role in current['triangles']:
        require(np.array_equal(current['triangles'][role],previous['triangles'][role]) and
            np.array_equal(current['ids'][role],previous['ids'][role]),'Role topology/index numbering differs')
    require(np.array_equal(current['corrected'],previous['corrected']),'Negative eyeJoy compensation indices differ')
    for name in ['P','N']:
        a,b=[d[name].astype('<f4') for d in [current,previous]]
        rows.append({'field':name,'equal':a.tobytes()==b.tobytes(),'currentSHA256':digest_array(a),'previousSHA256':digest_array(b)})
    for name in ['dP','dN']:
        require(len(current[name])==len(previous[name])==54,'Morph count differs')
        for i,(a,b) in enumerate(zip(current[name],previous[name],strict=True)):
            a,b=a.astype('<f4'),b.astype('<f4')
            rows.append({'field':name,'target':i,'equal':a.tobytes()==b.tobytes(),'currentSHA256':digest_array(a),'previousSHA256':digest_array(b)})
    return all(r['equal'] for r in rows if r['field'] in ['P','dP']),rows


def pair_coordinates(P,A,B,pairs):
    ids=np.asarray(pairs,int).reshape(-1,2)
    return np.stack([P[A[ids[:,0]]],P[B[ids[:,1]]]],axis=1) if len(ids) else np.empty((0,2,3,3))


def scenarios():
    return [('neutral',0.,0.,None,0.),('happy-open',.65,0.,None,0.),('neutral-closed',0.,1.,None,0.),
        ('happy-half-blink',.65,.5,None,0.),('happy-full-blink',.65,1.,None,0.)]+[
        ('happy-blink-'+v,.65,1.,v,.66) for v in ['aa','ih','ou','ee','oh']]


def outcome(single_added,mixed_added):
    if single_added or mixed_added: return 'failed-not-admissible'
    return 'face-contact-readback-passed-body-contact-pending'
