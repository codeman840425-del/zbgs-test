"""Blender Python, existing GLB + actual private palette only; no cloth or scene edits.
blender --background --factory-startup --threads 2 --python-exit-code 1
  --python scripts/audit-skirt-fixed-band-continuous.py -- [--worktree PATH]
"""
from pathlib import Path
import argparse, gzip, hashlib, json, struct, sys, time
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument('--worktree', type=Path, default=ROOT/'experiments/m1-simple-skirt-worktree')
ap.add_argument('--output', type=Path, default=ROOT/'evidence/skirt-fixed-band-continuous.json')
args = ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
S = args.worktree.resolve()/'assets-source/m1/simple-skirt-v1'
A = S/'two-quad-thirds-v1'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
started = time.monotonic()

def load(p):
    raw = p.read_bytes(); n = struct.unpack_from('<I', raw, 12)[0]
    d = json.loads(raw[20:20+n]); buf = raw[28+n:]
    def read(i):
        a=d['accessors'][i]; v=d['bufferViews'][a['bufferView']]
        dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']])
        w={'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16,'SCALAR':1}[a['type']]
        return np.ndarray((a['count'],w),dtype=dt,buffer=buf,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
    pr=d['meshes'][0]['primitives']; counts=[len(read(x['attributes']['POSITION']))for x in pr]
    x={key:np.concatenate([read(z['attributes'][key])for z in pr])for key in ['POSITION','JOINTS_0','WEIGHTS_0']}
    x['faces']=np.concatenate([read(z['indices']).reshape(-1,3)+sum(counts[:i])for i,z in enumerate(pr)])
    skin=d['skins'][0];x['names']=[d['nodes'][i]['name']for i in skin['joints']]
    x['inverse']=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
    return x

def posed(source, frame):
    names=source['names'];world=np.array([np.array(frame['bones'][n]).reshape(4,4).T for n in names])
    for c in frame['controls']:
        world[names.index(c['name'])]=np.array(c['privateWorld']).reshape(4,4).T
    palette=world@source['inverse']; p=np.c_[source['POSITION'],np.ones(len(source['POSITION']))]
    return sum(np.einsum('nij,nj->ni',palette[source['JOINTS_0'][:,k]],p)*source['WEIGHTS_0'][:,k,None]for k in range(4))[:,:3]

tree=lambda p,f:BVHTree.FromPolygons(np.asarray(p).tolist(),np.asarray(f).tolist(),all_triangles=True,epsilon=0.0)
BOX_FACES=np.array([[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]])
def surfaces(frame):
    for m in frame['colliders']:
        yield m['name'],np.array(m['positions']).reshape(-1,3),np.array(m['triangles']).reshape(-1,3)
    for b in frame['chair']:
        lo,hi=b['min'],b['max']
        p=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(b['matrixWorld']).reshape(4,4)
        yield b['name'],p[:,:3],BOX_FACES

def strict_witness(a,b):
    hits=[]
    for side,(edges,target) in enumerate([(a,b),(b,a)]):
        e1=target[1]-target[0];e2=target[2]-target[0]
        for i,j in [(0,1),(1,2),(2,0)]:
            origin=edges[i];direction=edges[j]-origin;h=np.cross(direction,e2);det=np.dot(e1,h)
            if abs(det)<1e-14:continue
            s=origin-target[0];u=np.dot(s,h)/det;q=np.cross(s,e1);v=np.dot(direction,q)/det;t=np.dot(e2,q)/det
            if 1e-7<t<1-1e-7 and min(u,v,1-u-v)>1e-7:
                hits.append({'edgeSide':side,'edge':[i,j],'fraction':float(t),'triangleBarycentric':[float(1-u-v),float(u),float(v)],'pointMetres':(origin+t*direction).tolist()})
    return hits

asset=A/'m1-sixfold-skirt-two-quad-thirds-v1.glb'
assert sha(asset)=='02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7'
cap_path=S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz'
assert sha(cap_path)=='e494fa798bd954554b430635f43d4aa4417d346aac6391511c08502daebc6d58'
cap=json.loads(gzip.decompress(cap_path.read_bytes()));assert len(cap['frames'])==60
assert cap['identity']['runtimeBuild']['shortId']=='58394ce674e4'
source=load(asset);faces=source['faces'][:260]
prep=json.loads((A/'native-author-trial-v1/preparation.json').read_text(encoding='utf-8'))
rmap=np.array(prep['renderToSim']);fixed=set(prep['fixedVertices'])
assert all(set(rmap[f]).issubset(fixed)for f in faces)
lineage=json.loads((A/'face-lineage.json').read_text(encoding='utf-8'))['oldFaceForNewFace']
assert lineage[:260]==list(range(260))

# Establish the coordinate path using the exact older rendered GLB, not the changed candidate.
original_path=S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb'
original=load(original_path)
four_path=S/'private-layer-initial/capture.json.gz'
four=json.loads(gzip.decompress(four_path.read_bytes()))
replay_checks=[]
for label,f in [('continuous-first',cap['frames'][0])]+[(f['label'],f)for f in four['frames']]:
    actual=np.concatenate([np.array(m['positions']).reshape(-1,3)for m in f['skirt']])
    error=float(np.linalg.norm(posed(original,f)-actual,axis=1).max())
    replay_checks.append({'label':label,'originalPrivatePaletteReplayMaxErrorMetres':error})
assert max(x['originalPrivatePaletteReplayMaxErrorMetres']for x in replay_checks)<2e-6

old_gate=json.loads((A/'geometry-gate.json').read_text(encoding='utf-8'))
four_checks=[]
for f,old in zip(four['frames'],old_gate['rows']):
    assert f['label']==old['label'];pts=posed(source,f);ct=tree(pts,faces);checks=[]
    for name,p,t in surfaces(f):
        pairs=sorted(tuple(x)for x in ct.overlap(tree(p,t)))
        expected=sorted(tuple(x)for x in next(c for c in old['contacts']if c['name']==name)['pairs']if x[0]<260)
        assert pairs==expected,(f['label'],name,pairs,expected)
        checks.append({'name':name,'pairs':pairs,'matchesOldFrozenGate':True})
    four_checks.append({'label':f['label'],'contacts':checks})

native=json.loads(gzip.decompress((A/'native-author-trial-v1/frame-01.json.gz').read_bytes()))
first=posed(source,cap['frames'][0]);native_positions=np.array(native['positionsWorld'])
first_error=float(np.linalg.norm(first-native_positions[rmap],axis=1).max())
assert first_error<2e-6
rows=[];witnesses={}
for i,f in enumerate(cap['frames']):
    points=posed(source,f);ct=tree(points,faces);contacts=[]
    for name,p,t in surfaces(f):
        pairs=sorted(tuple(x)for x in ct.overlap(tree(p,t)));strict=0
        for a,b in pairs:
            hits=strict_witness(points[faces[a]],p[t[b]])
            strict+=bool(hits);key=f'{name}:{a}:{b}'
            if key not in witnesses:
                witnesses[key]={'firstFrame':i+1,'skirtFace':a,'otherFace':b,'surface':name,'allSkirtVerticesPinned':True,'skirtRenderVertices':faces[a].tolist(),'skirtSimVertices':rmap[faces[a]].tolist(),'skirtTriangleMetres':points[faces[a]].tolist(),'otherTriangleMetres':p[t[b]].tolist(),'strictFiniteWitnesses':hits}
        contacts.append({'name':name,'count':len(pairs),'strictFiniteCrossingPairCount':int(strict),'pairs':pairs})
    rows.append({'frame':i+1,'label':f['label'],'actionSeconds':f['actionSeconds'],'authorSeconds':f['authorSeconds'],'sitProgress':f['snapshot']['motion'].get('sitProgress'),'contacts':contacts})
fail=[x for x in rows if any(c['count']for c in x['contacts'])]
report={'schema':'skirt-fixed-band-continuous-v1','status':'fixed-input-crossing-confirmed'if fail else'no-fixed-band-crossing-at-60-samples','sourceSha256':sha(asset),'captureSha256':sha(cap_path),'fourPoseCaptureSha256':sha(four_path),'originalRenderedSourceSha256':sha(original_path),'build':'58394ce674e4','blender':bpy.app.version_string,'fixedFaceRangeInclusive':[0,259],'all260FacesVerifiedFullyPinned':True,'coordinateChecks':replay_checks,'firstFrameNativeReadbackMaxErrorMetres':first_error,'fourPoseChecks':four_checks,'framesWithCrossing':[x['frame']for x in fail],'rows':rows,'uniquePairFirstWitnesses':list(witnesses.values()),'seconds':time.monotonic()-started,'physicsExecuted':False,'limits':['Actual captured private palettes, not old raw helper matrices.','60 existing samples at30Hz; not continuous collision detection or between-frame proof.','All fixed faces tested against actual full body/top and chair finite triangles; no exclusions or altered thresholds.','BVH overlap gate retained even if strict noncoplanar edge witness absent; each pair includes first-frame triangle geometry.','No cloth rerun, geometry mutation, visual acceptance or shell-volume containment claim.']}
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':report['status'],'framesWithCrossing':report['framesWithCrossing'],'uniquePairs':len(witnesses),'coordinateChecks':replay_checks,'firstFrameNativeReadbackMaxErrorMetres':first_error,'seconds':report['seconds'],'output':str(args.output)}))
