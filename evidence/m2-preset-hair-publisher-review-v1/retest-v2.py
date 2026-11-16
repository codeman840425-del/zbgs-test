"""Run the exact publisher in private copies of real current source packages."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import os
import tempfile

ROOT=Path(__file__).resolve().parents[2]
EVIDENCE=Path(__file__).resolve().parent
SOURCE=Path(sys.argv[1] if len(sys.argv)>1 else 'F:/gamemake').resolve()
REVISION=sys.argv[2] if len(sys.argv)>2 else '1518ad14a9964cd83c51b5c14c7937aaa667eae4'
SNAPSHOT=(ROOT/'scripts/publish-preset-short-hair.py').read_bytes()
sha=lambda data:hashlib.sha256(data).hexdigest()
read=lambda p:json.loads(p.read_bytes())
def write(path,value):path.write_bytes((json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode())
SHORT='assets-source/m2-preset-short-hair-fits-v1/ready/manifest.json'
CONDITIONAL='assets-source/m2-preset-short-hair-fits-v1/conditional/manifest.json'
PONY='assets-source/m2-preset-ponytail-fits-v1/generated/report.json'
BODY='assets-source/m2-representative-batch-v1/generated/manifest.json'
INDEX='prototype/public/assets/m2-representative-batch-v1/runtime-index.json'
scratch=EVIDENCE/'scratch'
scratch.mkdir(exist_ok=True)
private=Path(tempfile.mkdtemp(prefix='retest-v2-',dir=scratch))
rows=[]

def copy_reference(case,relative):
    destination=case/relative
    if destination.exists():return
    destination.parent.mkdir(parents=True,exist_ok=True)
    source=SOURCE/relative
    if source.suffix in ['.vrm','.glb'] and source.stat().st_size>4*1024*1024:
        os.link(source,destination)
    else:
        shutil.copyfile(source,destination)


def public_state(case):
    return {p.relative_to(case).as_posix():sha(p.read_bytes()) for prefix in ['m2-preset-short-hair-fits-v1','m2-preset-ponytail-fits-v1'] for p in (case/'prototype/public/assets'/prefix).rglob('*') if p.is_file()}


def setup(name):
    case=private/name
    assert case.resolve().is_relative_to(EVIDENCE.resolve()) and not case.exists()
    (case/'scripts').mkdir(parents=True)
    (case/'scripts/publish-preset-short-hair.py').write_bytes(SNAPSHOT)
    for rel in [BODY,INDEX,SHORT,CONDITIONAL,PONY]:
        dest=case/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(SOURCE/rel,dest)
    for rel in [SHORT,CONDITIONAL]:
        for row in read(SOURCE/rel)['results']:
            if row['status'] not in ['source-fit-ready','source-contact-candidate']:continue
            for name in row['files']:
                src=(SOURCE/rel).parent/row['targetId']/name
                dest=(case/rel).parent/row['targetId']/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
    for row in read(SOURCE/PONY)['variants']:
        for name in ['fit.json','manifest.json']:
            dest=(case/PONY).parent/row['id']/name;dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile((SOURCE/PONY).parent/row['id']/name,dest)
    for rel in [SHORT,CONDITIONAL,PONY]:
        doc=read(case/rel)
        ids=[r['targetId'] for r in doc['results'] if r['status'] in ['source-fit-ready','source-contact-candidate']] if 'results'in doc else [r['id'] for r in doc['variants']]
        for identifier in ids:
            manifest=read((case/rel).parent/identifier/'manifest.json')
            asset='prototype/public/'+manifest['url'].lstrip('/')
            dest=case/asset;dest.parent.mkdir(parents=True,exist_ok=True)
            if not dest.exists():shutil.copyfile(SOURCE/asset,dest)
    for spec_path in ['assets-source/m2-preset-short-hair-fits-v1/spec.json','assets-source/m2-preset-ponytail-fits-v1/spec.json']:
        copy_reference(case,spec_path)
    short=read(SOURCE/'assets-source/m2-preset-short-hair-fits-v1/spec.json')
    for family in short['families'].values():
        for field in ['body','asset','manifest']:copy_reference(case,family[field])
    pony=read(SOURCE/'assets-source/m2-preset-ponytail-fits-v1/spec.json')
    for field in ['sourceBody','asset','sourceFit','sourceManifest','batchManifest']:copy_reference(case,pony[field]['path'])
    for helper in pony['helpers']:copy_reference(case,helper['path'])
    for row in read(SOURCE/BODY)['variants']:copy_reference(case,row['avatar']['path'])
    for row in read(SOURCE/INDEX)['presets']:copy_reference(case,'prototype/public'+row['profile']['url'])
    for prefix in ['m2-preset-short-hair-fits-v1','m2-preset-ponytail-fits-v1']:
        shutil.copytree(SOURCE/'prototype/public/assets'/prefix,case/'prototype/public/assets'/prefix)
    return case


def rehash(case,rel,identifier):
    doc=read(case/rel);folder=(case/rel).parent/identifier
    manifest=read(folder/'manifest.json')
    manifest['fit']['sha256']=sha((folder/'fit.json').read_bytes())
    write(folder/'manifest.json',manifest)
    if 'results'in doc:
        row=next(r for r in doc['results'] if r['targetId']==identifier)
        row['files']={name:sha((folder/name).read_bytes()) for name in row['files']}
    else:
        row=next(r for r in doc['variants'] if r['id']==identifier)
        row['fitSha256']=sha((folder/'fit.json').read_bytes());row['manifestSha256']=sha((folder/'manifest.json').read_bytes())
    write(case/rel,doc)


def run(name,kind='short',mutate=None,expected=True):
    case=setup(name)
    changes=mutate(case) if mutate else {}
    before_public=public_state(case)
    command=[sys.executable,str(case/'scripts/publish-preset-short-hair.py'),'--manifest',str(case/(SHORT if kind=='short' else PONY)),'--kind',kind]
    if kind=='short':command+=['--conditional-manifest',str(case/CONDITIONAL)]
    process=subprocess.run(command,cwd=case,capture_output=True,text=True)
    prefix='m2-preset-short-hair-fits-v1' if kind=='short' else 'm2-preset-ponytail-fits-v1'
    output=case/'prototype/public/assets'/prefix/'catalog.json'
    catalog=read(output) if output.exists() else None
    after_public=public_state(case)
    unchanged=before_public==after_public
    row={'name':name,'kind':kind,'expectedAccepted':expected,'actualAccepted':process.returncode==0,'passed':(process.returncode==0)==expected and unchanged,'publicOutputBytesUnchanged':unchanged,
         'exitCode':process.returncode,'stdout':process.stdout,'stderr':process.stderr,'changes':changes,'publishedEntries':len(catalog) if catalog else 0,
         'catalogStyleIds':sorted(set(r['id'] for r in catalog)) if catalog else []}
    rows.append(row)
    (EVIDENCE/'retest-v2-cases').mkdir(exist_ok=True)
    write(EVIDENCE/'retest-v2-cases'/(name+'.json'),row)


def corrupt_without_hash(case):
    folder=(case/SHORT).parent/'female-round-full';fit=read(folder/'fit.json');fit['sourceBodySha256']='0'*64;write(folder/'fit.json',fit)
    return {'field':'fit.sourceBodySha256','rehash':False}


def bad_source(case):
    identifier='female-round-full';folder=(case/SHORT).parent/identifier
    fit=read(folder/'fit.json');fit['sourceBodySha256']='0'*64;write(folder/'fit.json',fit);rehash(case,SHORT,identifier)
    return {'field':'fit.sourceBodySha256','actual':'0'*64,'allDeclaredFileHashesConsistent':True,'originalBodyManifestUnchanged':True}


def rejected_style(case):
    identifier='male-long-lean';folder=(case/SHORT).parent/identifier
    fit=read(folder/'fit.json');manifest=read(folder/'manifest.json')
    fit['styleId']='male-medium-curls-v1';fit['id']='male-medium-curls-v1-test-fit'
    manifest['id']=fit['styleId'];manifest['fit']['id']=fit['id']
    write(folder/'fit.json',fit);write(folder/'manifest.json',manifest);rehash(case,SHORT,identifier)
    return {'relabelledStyleId':fit['styleId'],'assetGeometry':'Existing exact male-sidepart GLB retained. This probes family/style binding, without re-exporting or publishing failed curl geometry.'}


def empty_measurements(case):
    identifier='male-wide-muscular';folder=(case/CONDITIONAL).parent/identifier
    contact=read(folder/'contact-report.json')
    for record in contact['records']:record['measurements']=[]
    write(folder/'contact-report.json',contact)
    fit=read(folder/'fit.json');fit['contactEvidence']['sha256']=sha((folder/'contact-report.json').read_bytes());write(folder/'fit.json',fit);rehash(case,CONDITIONAL,identifier)
    return {'contactPoseCount':len(set(r['pose'] for r in contact['records'])),'allMeasurementListsEmpty':True,'allDeclaredFileHashesConsistent':True}


def zero_footprints(case):
    identifier='male-wide-muscular';folder=(case/CONDITIONAL).parent/identifier
    contact=read(folder/'contact-report.json')
    for record in contact['records']:
        for measurement in record['measurements']:
            for footprint in measurement['positiveDepthTextureFootprints']:footprint['conservativeTexelFootprint']=0
    write(folder/'contact-report.json',contact)
    fit=read(folder/'fit.json');fit['contactEvidence']['sha256']=sha((folder/'contact-report.json').read_bytes());write(folder/'fit.json',fit);rehash(case,CONDITIONAL,identifier)
    return {'allTexelFootprintCounts':0,'alphaFieldsRetainZero':True,'allDeclaredFileHashesConsistent':True}


def bad_ponytail_frame(case):
    identifier='female-round-full';folder=(case/PONY).parent/identifier
    fit=read(folder/'fit.json');before=fit['dynamics']['simulationReference'];fit['dynamics']['simulationReference']='avatar-scene';write(folder/'fit.json',fit);rehash(case,PONY,identifier)
    return {'field':'fit.dynamics.simulationReference','before':before,'after':'avatar-scene','approvedSourceTemplateUnchanged':True,'allDeclaredFileHashesConsistent':True}


def wrong_target(case):
    identifier='female-round-full';folder=(case/SHORT).parent/identifier
    index=read(case/INDEX)
    next(r for r in index['presets'] if r['id']==identifier)['profile']['sha256']='1'*64
    write(case/INDEX,index)
    batch=read(case/SHORT);next(r for r in batch['results'] if r['targetId']==identifier)['targetBodySha256']='1'*64;write(case/SHORT,batch)
    fit=read(folder/'fit.json');fit['targetBodySha256']='1'*64;write(folder/'fit.json',fit)
    manifest=read(folder/'manifest.json');manifest['compatibleBodies']=['1'*64];write(folder/'manifest.json',manifest);rehash(case,SHORT,identifier)
    return {'coherentCandidateAndRuntimeSHA':'1'*64,'bodyManifestAndActualTargetBytesUnchanged':True}


def malformed_contact(case,variant):
    identifier='male-wide-muscular';folder=(case/CONDITIONAL).parent/identifier
    contact=read(folder/'contact-report.json')
    if variant=='poses':contact['records'][0]['pose']='unmeasured-pose'
    elif variant=='counts':contact['records'][0]['summary']['introducedPairs']+=1
    elif variant=='nan':contact['records'][0]['measurements'][0]['targetProjectedPlaneDepthM']=float('nan')
    write(folder/'contact-report.json',contact)
    fit=read(folder/'fit.json');fit['contactEvidence']['sha256']=sha((folder/'contact-report.json').read_bytes());write(folder/'fit.json',fit);rehash(case,CONDITIONAL,identifier)
    return {'malformedConditionalField':variant,'allDeclaredFileHashesConsistent':True}


run('actual-short-eight')
run('actual-ponytail-four','ponytail')
run('unhashed-fit-change',mutate=corrupt_without_hash,expected=False)
run('consistent-wrong-source-body',mutate=bad_source,expected=False)
run('relabel-rejected-style',mutate=rejected_style,expected=False)
run('conditional-empty-measurements',mutate=empty_measurements,expected=False)
run('conditional-zero-texel-footprints',mutate=zero_footprints,expected=False)
run('ponytail-reference-drift','ponytail',bad_ponytail_frame,False)
run('consistent-wrong-target',mutate=wrong_target,expected=False)
run('conditional-wrong-pose-set',mutate=lambda c:malformed_contact(c,'poses'),expected=False)
run('conditional-count-mismatch',mutate=lambda c:malformed_contact(c,'counts'),expected=False)
run('conditional-nan-depth',mutate=lambda c:malformed_contact(c,'nan'),expected=False)
actual_catalogs={name:read(SOURCE/'prototype/public/assets'/name/'catalog.json') for name in ['m2-preset-short-hair-fits-v1','m2-preset-ponytail-fits-v1']}
report={'baselineCommit':REVISION,'implementation':'isolated publisher fix' ,'publisherSha256':sha(SNAPSHOT),'cases':rows,'actualCurrentCatalogs':{k:{'entries':len(v),'styleIds':sorted(set(r['id'] for r in v))} for k,v in actual_catalogs.items()},
        'scope':'Exact publisher snapshot executed in private scratch roots with copied actual source JSON, conditional reports and canonical GLB bytes. Root public outputs never passed as output paths.',
        'limits':['Mutation cases recompute declarations deliberately to test semantic identity/evidence gates beyond raw-byte corruption. These are prepared-input negative fixtures, not observed live catalog corruption.','No browser/GPU or mesh changes. Large VRM inputs use read-only hardlinks to actual local sources. Mutation functions only rewrite private JSON copies. Current actual catalog contents are checked separately.']}
write(EVIDENCE/'retest-v2-report.json',report)
print(json.dumps({'cases':len(rows),'unexpectedAcceptance':[r['name'] for r in rows if not r['passed']],'publisherSha256':sha(SNAPSHOT)}))

if not all(r['passed'] for r in rows):sys.exit(1)
