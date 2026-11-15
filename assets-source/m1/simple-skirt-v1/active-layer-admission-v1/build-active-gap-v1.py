"""One bounded source-position edit from actual private-palette triangle witnesses.

Not a cloth solver. Fixed topology, weights, UV, waist/seam and hem. Every
constraint comes from the closest point of whole triangle pairs, not sampled
vertices. Failure at the original 2 mm gate is retained without parameter retry.
"""
from pathlib import Path
import argparse, ast, gzip, hashlib, json, struct, time
import numpy as np

R=Path(__file__).resolve().parents[3]; S=R/'assets-source/m1/simple-skirt-v1'
parser=argparse.ArgumentParser();parser.add_argument('--out',default='assets-source/m1/simple-skirt-v1/active-layer-admission-v1');args=parser.parse_args()
O=(R/args.out).resolve(); SRC=S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb'
assert O.is_relative_to(S.resolve()),'Output must remain in this isolated source package'
assert R.name=='m1-simple-skirt-worktree'
assert not (O/'m1-sixfold-skirt-active-gap-v1.glb').exists(), 'Frozen one-off output already exists'
O.mkdir(exist_ok=True)
def reuse(path,names):
    tree=ast.parse(path.read_text(encoding='utf-8'))
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/verify-private-palette.py',['load'])
reuse(R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py',['point_tri','seg_seg','near_minimum'])
reuse(R/'scripts/m1-assets/simple-skirt/assess-active-layer-gap.py',['closest_point','closest_segments','closest_tri'])
raw,doc,read=load(SRC)
assert hashlib.sha256(raw).hexdigest()=='d7b5a881d1a64bdaf5e1d92a72573c2cef34abe859e53af0f9a2c8b091bd55fa'
capture=json.loads(gzip.decompress((S/'private-layer-initial/capture.json.gz').read_bytes()))
assert capture['identity']['runtimeBuild']['shortId']=='58394ce674e4'
primitives=doc['meshes'][0]['primitives']; counts=[len(read(p['attributes']['POSITION'])) for p in primitives]
source=np.concatenate([read(p['attributes']['POSITION']) for p in primitives]).astype(float)
normals=np.concatenate([read(p['attributes']['NORMAL']) for p in primitives])
js=np.concatenate([read(p['attributes']['JOINTS_0']) for p in primitives])
ws=np.concatenate([read(p['attributes']['WEIGHTS_0']) for p in primitives])
faces=np.concatenate([read(p['indices']).reshape(-1,3)+sum(counts[:i]) for i,p in enumerate(primitives)])
skin=doc['skins'][0]; names=[doc['nodes'][i]['name'] for i in skin['joints']]
inverse=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
mat=lambda x:np.array(x).reshape(4,4).T
def palette(frame):
    world=np.array([mat(frame['bones'][name]) for name in names])
    for control in frame['controls']: world[names.index(control['name'])]=mat(control['privateWorld'])
    transforms=world@inverse
    return sum(transforms[js[:,k]]*ws[:,k,None,None] for k in range(4))
P=palette(capture['frames'][0]); A=P[:,:3,:3]
def posed(points,pal=P): return np.einsum('nij,nj->ni',pal,np.c_[points,np.ones(len(points))])[:,:3]
# Position duplicates share exactly one editable source delta. Original topology
# is used for grouping; newly close points never become fictitious adjacency.
groups={}; groupFor=[]
for i,p in enumerate(source): groups.setdefault(tuple(np.round(p,7)),[]).append(i)
groupList=list(groups.values()); groupFor=np.zeros(len(source),int)
for g,ids in enumerate(groupList): groupFor[ids]=g
freeVertex=np.zeros(len(source),bool); freeVertex[counts[0]+20:counts[0]+504]=True
freeGroup=np.array([bool(np.all(freeVertex[ids])) for ids in groupList])
delta=np.zeros((len(groupList),3)); actual=source.copy()
colliders=[]
for m in capture['frames'][0]['colliders']:
    if m['name'] not in ['Bodybaked','m1-uniform-top_1']:continue
    t=np.array(m['positions']).reshape(-1,3)[np.array(m['triangles']).reshape(-1,3)]
    colliders.append((m['name'],t,t.min(1),t.max(1)))
active=np.flatnonzero(np.any(freeVertex[faces],axis=1))
TARGET=.002010; LIMIT=.003; ROUNDS=48
def conservative_pairs(points,tri,lo,hi):
    # All future vertices are bounded in source. Frobenius norm bounds each
    # skin-linear operator, so this precomputation cannot cull a reachable pair.
    reach=TARGET+LIMIT*float(np.linalg.norm(A,axis=(1,2)).max())
    pairs=[]
    for i in active:
        a=points[faces[i]]
        js=np.flatnonzero(np.all(hi>=a.min(0)-reach,axis=1)&np.all(lo<=a.max(0)+reach,axis=1))
        pairs.extend((i,int(j)) for j in js)
    return np.array(pairs,dtype=int).reshape(-1,2)
pairCache=[conservative_pairs(posed(actual),tri,lo,hi)for name,tri,lo,hi in colliders]
def pairs_below(points,tri,pairs):
    if len(pairs)==0:return []
    a=points[faces[pairs[:,0]]]; b=tri[pairs[:,1]]
    values=[point_tri(a[:,k],b) for k in range(3)]+[point_tri(b[:,k],a) for k in range(3)]
    for i,j in [(0,1),(1,2),(2,0)]:
        for k,l in [(0,1),(1,2),(2,0)]:values.append(seg_seg(a[:,i],a[:,j],b[:,k],b[:,l]))
    d=np.sqrt(np.min(values,axis=0)); order=np.flatnonzero(d<TARGET)
    return [(int(pairs[k,0]),int(pairs[k,1]),float(d[k])) for k in order]
def barycentric(p,t):
    uv=np.column_stack([t[1]-t[0],t[2]-t[0]])
    b=np.linalg.lstsq(uv,p-t[0],rcond=None)[0]
    return np.array([1-b.sum(),*b])
history=[]; started=time.monotonic(); bounded=0; zero=0
for iteration in range(ROUNDS):
    points=posed(actual); count=0; worst=0
    for (name,tri,lo,hi),possible in zip(colliders,pairCache):
        constraints=pairs_below(points,tri,possible); count+=len(constraints)
        for fi,ti,_ in constraints:
            ids=faces[fi]; a,b=closest_tri(points[ids],tri[ti]); d=np.linalg.norm(a-b)
            if d>=TARGET-1e-9:continue
            worst=max(worst,TARGET-d)
            if d<1e-10:zero+=1;continue
            normal=(a-b)/d; bary=barycentric(a,points[ids]); gradients={}
            for vi,weight in zip(ids,bary):
                g=groupFor[vi]
                if freeGroup[g]:gradients[g]=gradients.get(g,np.zeros(3))+weight*(A[vi].T@normal)
            denom=sum(v@v for v in gradients.values())
            if denom<1e-16:zero+=1;continue
            for g,gradient in gradients.items():
                proposal=delta[g]+gradient*((TARGET-d)/denom)
                length=np.linalg.norm(proposal)
                if length>LIMIT:proposal*=LIMIT/length;bounded+=1
                delta[g]=proposal; members=groupList[g]
                actual[members]=source[members]+proposal
                points[members]=np.einsum('nij,nj->ni',P[members],np.c_[actual[members],np.ones(len(members))])[:,:3]
    history.append({'iteration':iteration,'pairsBelowTarget':count,'maximumConstraintDeficitMetres':worst,'maximumSourceDisplacementMetres':float(np.linalg.norm(delta,axis=1).max())})
    if count==0:break
# Serialize float32 before the independent gate, never certify double-precision
# transient geometry that differs from the real exported asset.
actual=actual.astype(np.float32)
assert np.array_equal(actual[:counts[0]],source[:counts[0]].astype(np.float32))
assert np.array_equal(actual[counts[0]:counts[0]+20],source[counts[0]:counts[0]+20].astype(np.float32))
assert np.array_equal(actual[counts[0]+504:],source[counts[0]+504:].astype(np.float32))
n=struct.unpack_from('<I',raw,12)[0]; binary=bytearray(raw[28+n:])
lower=actual[counts[0]:]; lowerFaces=faces[120:]-counts[0]
newNormals=np.zeros_like(lower,dtype=float)
cross=np.cross(lower[lowerFaces[:,1]]-lower[lowerFaces[:,0]],lower[lowerFaces[:,2]]-lower[lowerFaces[:,0]])
for k in range(3):np.add.at(newNormals,lowerFaces[:,k],cross)
newNormals/=np.maximum(np.linalg.norm(newNormals,axis=1)[:,None],1e-20)
# Preserve unaffected and seam normals. Only affected faces' vertex normals
# change; no UV, tangent, material, alpha or weight changes are permitted.
touched=np.unique(lowerFaces[np.any(freeVertex[faces[120:]],axis=1)])
outNormals=normals[counts[0]:].copy(); outNormals[touched]=newNormals[touched]
outNormals[:20]=normals[counts[0]:counts[0]+20]
def append(values):
    values=np.asarray(values,dtype='<f4'); binary.extend(b'\0'*(-len(binary)%4)); offset=len(binary);binary.extend(values.tobytes())
    vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes})
    ai=len(doc['accessors']);doc['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(values),'type':'VEC3','min':values.min(0).tolist(),'max':values.max(0).tolist()});return ai
primitives[1]['attributes']['POSITION']=append(lower);primitives[1]['attributes']['NORMAL']=append(outNormals)
ident='m1-sixfold-skirt-active-gap-v1';doc['meshes'][0]['name']=ident
for node in doc['nodes']:
    if 'mesh' in node:node['name']=ident
doc['extras'].update(fitId='female-027bed-active-gap-v1',notAccepted=True,method='One bounded full-triangle-witness source edit; active upper transition only')
doc['buffers']=[{'byteLength':len(binary)}];jb=json.dumps(doc,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary+=b'\0'*(-len(binary)%4)
glb=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary
(O/(ident+'.glb')).write_bytes(glb)
changes=actual.astype(float)-source; changed=np.flatnonzero(np.linalg.norm(changes,axis=1)>1e-10)
parameters={'id':ident,'targetMetres':TARGET,'gateMetres':.002,'maximumSourceDisplacementMetres':LIMIT,'maximumRounds':ROUNDS,'editableLowerVertices':[20,503],'preserved':['primitive0 all attributes','lower boundary0..19 all attributes','all UV/weights/joints/indices','lower positions504+ including hem'],'algorithm':'Deterministic sequential closest-triangle half-space source corrections, shared source-position groups; one attempt, no parameter sweep'}
(O/'parameters.json').write_text(json.dumps(parameters,indent=2)+'\n',encoding='utf-8')
(O/'source-deltas.json').write_text(json.dumps({'vertices':[{'index':int(i),'before':source[i].tolist(),'after':actual[i].tolist(),'delta':changes[i].tolist()} for i in changed]},indent=2)+'\n',encoding='utf-8')
report={'status':'pending-independent-full-face-gate-not-cloth-admitted','sha256':hashlib.sha256(glb).hexdigest(),'parentSha256':hashlib.sha256(raw).hexdigest(),'captureSha256':hashlib.sha256((S/'private-layer-initial/capture.json.gz').read_bytes()).hexdigest(),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'buildBasis':'58394ce674e4 actual private palette, standing','seconds':time.monotonic()-started,'changedVertices':len(changed),'maximumActualSourceDisplacementMetres':float(np.linalg.norm(changes,axis=1).max()),'boundClamps':bounded,'unresolvableWitnessEvents':zero,'history':history,'limits':['No cloth, no new sitting pose, no runtime install.','Four-pose replay retains recorded body/hand positions; final changed garment requires new closed-loop hands.','Preserved waist/zipper are NOT silently certified at2mm; full garment gate remains required.','Independent hem repair is not included.']}
(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='history'}));print(json.dumps(history[-3:]))
