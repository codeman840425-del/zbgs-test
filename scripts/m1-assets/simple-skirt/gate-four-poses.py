"""Blender BVH admission of actual candidate LBS against fixed 269 captured surfaces.
Not a new-skirt hand refit, alpha-aware visual gate, or continuous animation proof.
"""
from pathlib import Path
import gzip, hashlib, json, struct, sys, time
import numpy as np
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[3]
assert ROOT.name=='m1-simple-skirt-worktree'
S=ROOT/'assets-source/m1/simple-skirt-v1';G=S/(sys.argv[sys.argv.index('--candidate-dir')+1] if '--candidate-dir'in sys.argv else 'generated');I=S/'input-269'
manifest=json.loads((I/'manifest.json').read_text(encoding='utf-8'))
packed=(I/'four-poses.json.gz').read_bytes();raw=gzip.decompress(packed)
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(packed)==manifest['gzipSha256'] and sha(raw)==manifest['rawSha256']
capture=json.loads(raw);assert manifest['build']=='269a73423c97'
report=json.loads((G/'build-report.json').read_text(encoding='utf-8'))
asset=G/(report['id']+'.glb');assert sha(asset.read_bytes())==report['sha256']
assert not(G/'four-pose-gate.json').exists(),'Do not overwrite failed specimen evidence'

def load(path):
    b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);binary=b[28+n:]
    def read(i):
        a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dtype=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        return np.ndarray((a['count'],w),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dtype.itemsize),dtype.itemsize)).copy()
    s=d['skins'][0];positions=[];triangles=[];joints=[];weights=[];offset=0
    for p in d['meshes'][0]['primitives']:
        points=read(p['attributes']['POSITION']);positions.append(points);triangles.append(read(p['indices']).reshape(-1,3)+offset);joints.append(read(p['attributes']['JOINTS_0']));weights.append(read(p['attributes']['WEIGHTS_0']));offset+=len(points)
    return {'positions':np.concatenate(positions),'triangles':np.concatenate(triangles),'joints':np.concatenate(joints),'weights':np.concatenate(weights),'names':[d['nodes'][i]['name']for i in s['joints']],'inverse':read(s['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)}

def posed(mesh,frame):
    bind=np.array(frame['sourceBind']).reshape(4,4).T
    p=np.c_[mesh['positions'],np.ones(len(mesh['positions']))]@bind.T
    palette=np.array([np.array(frame['bones'][name]).reshape(4,4).T for name in mesh['names']])@mesh['inverse']
    out=np.zeros((len(p),4))
    for k in range(4):out+=np.einsum('nij,nj->ni',palette[mesh['joints'][:,k]],p)*mesh['weights'][:,k,None]
    return out[:,:3]

def tree(points,triangles):return BVHTree.FromPolygons(np.asarray(points).tolist(),np.asarray(triangles).tolist(),all_triangles=True)
candidate=load(asset);original=load(ROOT/'prototype/public/assets/m1/m1-uniform-skirt.glb')
top_open=json.loads((ROOT/'assets-source/m1/offline-corrective/open-waist-v1/top-edit.json').read_text(encoding='utf-8'))
cap_faces=set(top_open['removedOriginalFaces']);rows=[];start=time.monotonic();pose_arrays=[]
selected=capture['frames'][:1] if '--standing-only'in sys.argv else capture['frames']
for frame in selected:
    expected=np.array(frame['sourceSkirt']['positions']).reshape(-1,3)
    error=float(np.linalg.norm(posed(original,frame)-expected,axis=1).max())
    assert error<2e-6, f'Original-source LBS/world readback mismatch {error}'
    p=posed(candidate,frame);t=tree(p,candidate['triangles']);original_t=tree(np.array(frame['displayedSkirt']['positions']).reshape(-1,3),np.array(frame['displayedSkirt']['triangles']).reshape(-1,3));collisions=[]
    for m in frame['colliders']:
        if not('Body' in m['name'] or 'uniform-top' in m['name']):continue
        q=np.array(m['positions']).reshape(-1,3);f=np.array(m['triangles']).reshape(-1,3);bt=tree(q,f);pairs=t.overlap(bt);baseline=original_t.overlap(bt)
        internal=[pair for pair in pairs if m['name']=='m1-uniform-top_1' and pair[1] in cap_faces]
        other=[pair for pair in pairs if pair not in internal]
        collisions.append({'name':m['name'],'candidatePairs':pairs,'candidatePairCount':len(pairs),'knownOriginalTopCapPairs':internal,'otherPairs':other,'originalDisplayedPairCount':len(baseline),'bodyOrTopRegions':[{ 'min':p[candidate['triangles'][a]].min(0).tolist(),'max':p[candidate['triangles'][a]].max(0).tolist(),'candidateFace':a,'otherFace':b}for a,b in other[:20]],'note':'Original/candidate face IDs differ: counts are not repair percentages. Unfiltered actual triangles; exposed vs internal requires viewing/alpha.'})
    for box in frame['chair']:
        lo=np.array(box['min']);hi=np.array(box['max']);q=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]]);q=(q@np.array(box['matrixWorld']).reshape(4,4))[:,:3]
        f=np.array([[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]])
        pairs=t.overlap(tree(q,f));collisions.append({'name':box['name'],'candidatePairs':pairs,'candidatePairCount':len(pairs),'chair':True})
    key=np.round(candidate['positions'],7);weld={};ids=[]
    for v in key:
        k=tuple(v)
        if k not in weld:weld[k]=len(weld)
        ids.append(weld[k])
    wf=np.array(ids)[candidate['triangles']]
    self_pairs=[(a,b)for a,b in t.overlap(t)if a<b and not(set(wf[a])&set(wf[b]))]
    rows.append({'label':frame['label'],'sitProgress':frame['snapshot']['motion']['sitProgress'],'sourceLbsMaximumErrorMetres':error,'collisions':collisions,'nonadjacentSelfPairs':self_pairs})
    pose_arrays.append(p.tolist())
fail=any(any(c['candidatePairCount'] for c in row['collisions'])or row['nonadjacentSelfPairs']for row in rows)
result={'status':'failed-raw-four-pose-admission'if fail else'static-four-pose-only-not-accepted','build':manifest['build'],'inputSha256':manifest['rawSha256'],'candidateSha256':report['sha256'],'seconds':time.monotonic()-start,'poses':rows,'testedPoses':[r['label']for r in rows],'limits':['Current old-skirt hand geometry is diagnostic only; changed skirt requires current runtime hand recomputation.','Known cap and alpha/exposed classification cannot be conflated with visible penetration.','No temporal interval test, no new clothing runtime or performance acceptance.','These are initial true-skinned source shapes without invented legacy guide compensation.']}
(G/'four-pose-gate.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
(G/'four-pose-geometry.json.gz').write_bytes(gzip.compress(json.dumps({'candidateSha256':report['sha256'],'triangles':candidate['triangles'].tolist(),'poses':pose_arrays}).encode(),mtime=0))
print(json.dumps({'status':result['status'],'seconds':result['seconds'],'poses':[{'label':r['label'],'LBSerror':r['sourceLbsMaximumErrorMetres'],'self':len(r['nonadjacentSelfPairs']),'collisions':[{k:c[k]for k in ['name','candidatePairCount']}for c in r['collisions']]}for r in rows]},indent=2))
if fail:raise SystemExit(2)
