"""Seal already-exported single hairset candidate and source differences."""
from pathlib import Path
from collections import Counter
import copy,hashlib,json
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def write(path,value):
    with path.open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def doc(path):
    b=path.read_bytes();return json.loads(b[20:20+int.from_bytes(b[12:16],'little')])

def semantic_springs(d):
    ext=d.get('extensions',{}).get('VRMC_springBone',{})
    def collider(i):
        c=copy.deepcopy(ext['colliders'][i]);c['node']=d['nodes'][c['node']]['name'];return c
    def group(i):
        g=copy.deepcopy(ext['colliderGroups'][i]);g['colliders']=[collider(c) for c in g['colliders']];return g
    result=[]
    for s in ext.get('springs',[]):
        s=copy.deepcopy(s)
        for j in s['joints']:j['node']=d['nodes'][j['node']]['name']
        if 'center' in s:s['center']=d['nodes'][s['center']]['name']
        if 'colliderGroups' in s:s['colliderGroups']=[group(g) for g in s['colliderGroups']]
        result.append(s)
    return result

def main():
    cycle=json.loads((BASE/'native-cycle.json').read_bytes());assert cycle['failure'] is None
    readback=json.loads((BASE/'cpu-readback/result.json').read_bytes());assert readback['failures']==[]
    cold=json.loads((BASE/'cold-reopen-readback.json').read_bytes());assert cold['groupsColdReopenExact'] and cold['hairGroupsColdReopenExact']
    records=[];partials=[]
    for p in sorted((BASE/'records').glob('*.json')):
        r=json.loads(p.read_bytes())
        if not r['ok']:
            assert p.name in ['11-materials-after.json','17-materials-reopened.json']
            assert r['failures']==['content[0][0].textures[0].layers: error','content[0][0].textures[1].layers: error']
            partials.append(p.relative_to(ROOT).as_posix())
        records.append(dict(path=p.relative_to(ROOT).as_posix(),ok=r['ok'],sha256=sha(p)))
    assert len(partials)==2
    for row in cycle['generated']:assert sha(ROOT/row['path'])==row['sha256']
    original=doc(ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm')
    candidate=doc(BASE/'generated/male-hairset001.vrm')
    springs0,springs1=semantic_springs(original),semantic_springs(candidate)
    canonical=lambda rows:Counter(json.dumps(r,sort_keys=True) for r in rows)
    original_counts,candidate_counts=canonical(springs0),canonical(springs1)
    removed=list((original_counts-candidate_counts).elements())
    added=list((candidate_counts-original_counts).elements())
    all0={n['name'] for n in original['nodes']};all1={n['name'] for n in candidate['nodes']}
    write(BASE/'cpu-readback/spring-architecture.json',dict(schema='native-hairset001-semantic-spring-readback-v1',
        originalSpringCount=len(springs0),candidateSpringCount=len(springs1),
        originalSpringDefinitionsRetainedAsSubset=not removed,
        removedOrChangedOriginalDefinitions=[json.loads(s) for s in removed],addedDefinitions=[json.loads(s) for s in added],
        addedAllNodeNames=sorted(all1-all0),removedAllNodeNames=sorted(all0-all1),
        scope='Exact native spring/collider semantic data comparison, not solver/dynamic validation'))
    vrm=next(x for x in cycle['generated'] if x['path'].endswith('.vrm'))
    editable=next(x for x in cycle['generated'] if x['path'].endswith('/male-hairset001.vroid'))
    manifest=dict(schema='native-hairset-study-source-v1',id='native-male-hairset001-study-v1',version=1,
        status='native-source-produced-nonhair-CPU-equivalence-runtime-pending',avatar=vrm,editableSource=editable,
        originalEditable=cycle['source'],originalAvatar=readback['source'],preset=cold['selectedPreset'],
        nativeTool=dict(studio='2.16.0',bridge='0.15.0',commit='c7367a548626cbe69e26b533e48fc9ddaf85851e'),
        sourceMeta=readback['candidateMeta'],nodes=163,skinJointCounts=[138,138,138],
        brushGroups=len(cold['hairGroups']),strands=sum(g['strands'] for g in cold['hairGroups']),
        hairMeshes=[{k:r[k] for k in ['node','mesh','primitive','skin','materialName','referencedVertices','triangles']} for r in readback['hairPrimitives']],
        runtimeAccepted=False,visualAccepted=False,newStandaloneHairFitCreated=False,baseBodyMaskStillOriginal=True)
    write(BASE/'manifest.json',manifest)
    closure=dict(schema='native-hairset001-source-closure-v1',status='one-native-candidate-produced-CPU-readback-complete-game-pending',
        manifest=dict(path=(BASE/'manifest.json').relative_to(ROOT).as_posix(),sha256=sha(BASE/'manifest.json')),
        records=records,preservedPartialQueryFailures=partials,
        coldReopenHairAndGroupIdentityExact=True,nonHairPrimitiveCount=12,nonHairCPUFailures=[],
        originalExpressionsSemanticBindingsExact=True,originalHumanoidBoneNamesExact=True,
        originalSpringDefinitionsRetainedAsSubset=not removed,addedSpringDefinitions=len(added),
        originalEntryRestoredReadyClean=True,originalSourcesUnchanged=True,windowReleased=True,
        parameterEdits=0,presetApplications=1,presetScansOrRetries=0,desktopInputs=0,
        runtimePublicCAPOrFixedServiceEdited=False,gitCommitCreated=False,
        limits=['No aesthetic/visual review','No native hair dynamics/seat/hat contact validation','New exact equipment and complete skin fit not produced'])
    write(BASE/'closure.json',closure)
    files=[dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size) for p in sorted(BASE.rglob('*')) if p.is_file() and p.name!='package-files.json']
    write(BASE/'package-files.json',dict(schema='native-hairset-study-files-v1',files=files))
    print(json.dumps({'files':len(files),'manifestSha256':sha(BASE/'manifest.json'),'closureSha256':sha(BASE/'closure.json'),
        'packageFilesSha256':sha(BASE/'package-files.json'),'oldSpringsRetained':not removed,'addedSprings':len(added)}))

if __name__=='__main__':main()
