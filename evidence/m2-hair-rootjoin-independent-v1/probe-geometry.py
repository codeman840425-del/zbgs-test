import sys
sys.dont_write_bytecode=True
import collections, contextlib, hashlib, importlib.util, io, json, os
from pathlib import Path
import struct, subprocess, traceback
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
BASE=ROOT/'assets-source/m2-long-hair-v1'
REV=BASE/'revisions/rootjoin-v2'
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
checks=[]
def check(name, passed, **details):
    checks.append(dict(name=name,passed=bool(passed),**details))
    if not passed: raise AssertionError(name)
class GLB:
    def __init__(self,p):
        self.raw=p.read_bytes(); magic,version,size=struct.unpack_from('<4sII',self.raw)
        assert magic==b'glTF' and version==2 and size==len(self.raw)
        n,kind=struct.unpack_from('<I4s',self.raw,12);assert kind==b'JSON'
        self.doc=json.loads(self.raw[20:20+n]);m,kind=struct.unpack_from('<I4s',self.raw,20+n);assert kind==b'BIN\0'
        self.binary=self.raw[28+n:28+n+m]
    def accessor(self,i):
        a=self.doc['accessors'][i];v=self.doc['bufferViews'][a['bufferView']]
        assert not a.get('sparse') and not a.get('normalized')
        dtype={5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]
        width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        size=np.dtype(dtype).itemsize;stride=v.get('byteStride',size*width)
        offset=v.get('byteOffset',0)+a.get('byteOffset',0)
        return np.ndarray((a['count'],width),dtype=dtype,buffer=self.binary,offset=offset,strides=(stride,size)).copy()
    def image(self,i):
        v=self.doc['bufferViews'][self.doc['images'][i]['bufferView']]
        return self.binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def inventory(p):
    rows=read(p)['files']
    for row in rows:
        b=(ROOT/row['path']).read_bytes()
        assert sha(b)==row['sha256'] and len(b)==row['bytes'],row['path']
    return len(rows)
def snapshot():
    files=[p for p in BASE.rglob('*') if p.is_file()]
    files += [ROOT/'scripts/m2-long-hair-v1/rootjoin-v2.py',ROOT/'scripts/m2-long-hair-v1/qa-rootjoin-v2.mjs']
    return {str(p.relative_to(ROOT)).replace('\\','/'):sha(p.read_bytes()) for p in files}
def edges(faces):
    e=collections.defaultdict(list)
    for f in faces:
        for a,b in zip(f,np.roll(f,-1)):e[tuple(sorted((int(a),int(b))))].append((int(a),int(b)))
    return e
def canonical(f):
    f=list(map(int,f));return min(tuple(f[i:]+f[:i]) for i in range(3))
initial=snapshot();failure=None
try:
    spec=read(REV/'spec.json');manifest=read(REV/'manifest.json');fit=read(REV/'fit.json');oldfit=read(BASE/'generated/fit.json')
    count1=inventory(BASE/'generated/package-files.json');count2=inventory(REV/'package-files.json')
    check('both inventories match actual bytes and frozen v1 inventory pin',sha((BASE/'generated/package-files.json').read_bytes())==spec['sourceInventorySha256'],v1FileCount=count1,v2FileCount=count2)
    check('new manifest fit and asset use exact new identities and v2 resource paths',manifest['sha256']==fit['assetSha256']==sha((REV/'female-ponytail.glb').read_bytes()) and manifest['bytes']==(REV/'female-ponytail.glb').stat().st_size and manifest['fit']['sha256']==sha((REV/'fit.json').read_bytes()) and manifest['fit']['version']==fit['version']==manifest['version']==2 and manifest['fit']['id']==fit['id'] and manifest['url']=='/assets/m2-long-hair-rootjoin-v2/female-ponytail.glb' and manifest['fit']['url']=='/assets/m2-long-hair-rootjoin-v2/fit.json')
    check('source package honestly retains runtimeAccepted false',all(read(REV/n).get('runtimeAccepted') is False for n in ['fit.json','manifest.json','build-report.json','qa-report.json','runtime-cpu-qa.json','correction-evidence.json']))
    expected={**oldfit,'id':fit['id'],'version':2,'assetSha256':fit['assetSha256']}
    check('fit changes only explicit identity version and asset hash',fit==expected)
    old,new=GLB(BASE/'generated/female-ponytail.glb'),GLB(REV/'female-ponytail.glb')
    po=old.doc['meshes'][0]['primitives'][0];pn=new.doc['meshes'][0]['primitives'][0]
    ao={k:old.accessor(i) for k,i in po['attributes'].items()};an={k:new.accessor(i) for k,i in pn['attributes'].items()}
    key=lambda a,i:tuple(a['POSITION'][i])+tuple(a['TEXCOORD_0'][i])
    lookup={key(ao,i):i for i in range(len(ao['POSITION']))};assert len(lookup)==len(ao['POSITION'])
    mapping=np.array([lookup[key(an,i)] for i in range(len(an['POSITION']))])
    check('every retained position and UV is copied exactly with unique source mapping',len(set(mapping))==len(mapping) and np.array_equal(an['POSITION'],ao['POSITION'][mapping]) and np.array_equal(an['TEXCOORD_0'],ao['TEXCOORD_0'][mapping]),verticesOld=len(ao['POSITION']),verticesNew=len(mapping),mappingSha256=sha(mapping.astype('<u4').tobytes()))
    F0=old.accessor(po['indices']).reshape(-1,3);F=new.accessor(pn['indices']).reshape(-1,3);mapped=mapping[F]
    oldset={canonical(f) for f in F0};newset={canonical(f) for f in mapped};removed=oldset-newset;added=newset-oldset
    adjacency=collections.defaultdict(set)
    for f in F:
        for a,b in zip(f,np.roll(f,-1)):adjacency[int(a)].add(int(b));adjacency[int(b)].add(int(a))
    seen=set();components=0
    for start in adjacency:
        if start in seen:continue
        components+=1;todo=[start];seen.add(start)
        while todo:
            for n in adjacency[todo.pop()]-seen:seen.add(n);todo.append(n)
    E=edges(F);E0=edges(F0)
    oldboundary={k for k,v in E0.items() if len(v)==1}
    newboundary={tuple(sorted((int(mapping[a]),int(mapping[b])))) for (a,b),v in E.items() if len(v)==1}
    bridge=np.array([f for f in mapped if canonical(f) in added]);cap=set(range(225));tail=set(range(241,257))
    bridgeVertices=set(map(int,bridge.flat));expectedCap={125,181,180,179,17,18}
    check('actual shared-index weld has one component same open boundary and consistent edge orientation',components==1 and oldboundary==newboundary and all(len(v)<=2 and (len(v)==1 or v[0]==v[1][::-1]) for v in E.values()),components=components,boundaryEdges=len(newboundary),trianglesOld=len(F0),trianglesNew=len(F),addedTriangles=len(added),removedTriangles=len(removed))
    check('connector exactly shares six cap and sixteen retained tail indices',len(added)==22 and bridgeVertices==expectedCap|tail and all(set(map(int,f))&cap and set(map(int,f))&tail for f in bridge),sharedCapIndices=sorted(bridgeVertices&cap),sharedTailIndices=sorted(bridgeVertices&tail))
    check('only measured fan first tube span tube base and separate torus faces removed',len(removed)==182 and all(canonical(F0[i]) in removed for i in [18,183,293,294,297,298]+list(range(394,426))+list(range(1162,1178))+list(range(1194,len(F0)))))
    changed=np.any(an['JOINTS_0']!=ao['JOINTS_0'][mapping],axis=1)|np.any(an['WEIGHTS_0']!=ao['WEIGHTS_0'][mapping],axis=1)
    check('weights change exactly three retained root rings with fixed cap and distal weights',set(map(int,mapping[changed]))==set(range(241,289)),changedVertices=int(changed.sum()))
    for ring in range(1,4):
        ids=np.flatnonzero((mapping>=225+ring*16)&(mapping<225+(ring+1)*16))
        assert np.all(an['JOINTS_0'][ids]==[0,1,0,0]) and np.all(an['WEIGHTS_0'][ids]==[1-ring/4,ring/4,0,0])
    check('all weights remain finite normalized and joint indices in range',np.isfinite(an['WEIGHTS_0']).all() and np.allclose(an['WEIGHTS_0'].sum(1),1,atol=1e-7) and an['WEIGHTS_0'].min()>=0 and an['JOINTS_0'].max()<len(new.doc['skins'][0]['joints']))
    check('auxiliary skeleton rest nodes skins and inverse binds retain exact identity',old.doc['nodes']==new.doc['nodes'] and old.doc['skins']==new.doc['skins'] and np.array_equal(old.accessor(old.doc['skins'][0]['inverseBindMatrices']),new.accessor(new.doc['skins'][0]['inverseBindMatrices'])))
    check('materials samplers textures and every embedded image retain exact bytes',all(old.doc[k]==new.doc[k] for k in ['materials','samplers','textures','images']) and all(old.image(i)==new.image(i) for i in range(len(old.doc['images']))),imageSha256=[sha(new.image(i)) for i in range(len(new.doc['images']))])
    normalChanged=np.any(an['NORMAL']!=ao['NORMAL'][mapping],axis=1)
    check('normal changes stay on welded boundary and all triangles remain nondegenerate',set(map(int,mapping[normalChanged]))<=bridgeVertices and np.isfinite(an['NORMAL']).all() and np.min(np.linalg.norm(np.cross(an['POSITION'][F[:,1]]-an['POSITION'][F[:,0]],an['POSITION'][F[:,2]]-an['POSITION'][F[:,0]]),axis=1))>1e-12,normalChangedVertices=int(normalChanged.sum()))
except Exception as e:failure=dict(message=str(e),stack=traceback.format_exc())
finally:
    stable=initial==snapshot();checks.append(dict(name='read-only review leaves v1 v2 sources and scripts unchanged',passed=stable))
report=dict(schema='hair-rootjoin-independent-cpu-v1',rootCommit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),authorCommit='cc12df498bde6696cdbb402901a9585420a46794',sourceSha256=initial,checks=checks,failure=failure,limits=['Independent binary topology/attribute/identity review. No GPU, rendered hair-root gap or furniture contact acceptance.','Static noncoplanar crossing and sampled alpha claims were read from author diagnostics; no broad collision rerun.'])
(OUT/'report-geometry-v1.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(dict(checks=len(checks),failure=failure,sourceStable=stable),indent=2));sys.exit(1 if failure or not stable else 0)
