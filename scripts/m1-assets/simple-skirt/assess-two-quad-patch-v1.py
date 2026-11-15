"""Read-only complete2quad longitudinal patch plan; no exported asset or physics."""
from pathlib import Path
import ast,gzip,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';A=S/'active-gap-hem-v1';O=S/'two-quad-plan-v1';O.mkdir(exist_ok=True)
helper=R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py';parsed=ast.parse(helper.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in parsed.body if isinstance(n,ast.FunctionDef)and n.name=='load'],type_ignores=[]),str(helper),'exec'),globals())
raw,d,read=load(A/'m1-sixfold-skirt-active-gap-hem-v1.glb');ps=d['meshes'][0]['primitives'];counts=[len(read(p['attributes']['POSITION']))for p in ps];p=np.concatenate([read(x['attributes']['POSITION'])for x in ps]);j=np.concatenate([read(x['attributes']['JOINTS_0'])for x in ps]);w=np.concatenate([read(x['attributes']['WEIGHTS_0'])for x in ps]);faces=np.concatenate([read(x['indices']).reshape(-1,3)+sum(counts[:i])for i,x in enumerate(ps)]);skin=d['skins'][0];names=[d['nodes'][i]['name']for i in skin['joints']];inv=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);cap=json.loads(gzip.decompress((A/'continuous-input-v1/capture.json.gz').read_bytes()));mat=lambda a:np.array(a).reshape(4,4).T
palettes=[]
for frame in cap['frames']:
    world=np.array([mat(frame['bones'][n])for n in names])
    for c in frame['controls']:world[names.index(c['name'])]=mat(c['privateWorld'])
    palettes.append(world@inv)
edges=[(439,560),(439,561),(440,561),(440,562),(441,562)];newPoints=list(p);pointMap={};vertices=[]
for edge in edges:
    for part in [1,2]:
        t=part/3;v=p[edge[0]]*(1-t)+p[edge[1]]*t;index=len(newPoints);newPoints.append(v);pointMap[edge[0],edge[1],part]=index;weights=np.zeros(len(names))
        for old,factor in zip(edge,[1-t,t]):
            for bone,weight in zip(j[old],w[old]):weights[bone]+=float(weight)*factor
        weights/=weights.sum();rank=np.argsort(-weights,kind='stable')[:4];loss=1-weights[rank].sum();four=np.zeros(len(names));four[rank]=weights[rank]/weights[rank].sum();fullError=[];fourError=[];pruning=[]
        for palette in palettes:
            def oldSkin(i):return sum(palette[j[i,k]]@np.r_[p[i],1]*w[i,k]for k in range(4))[:3]
            actual=oldSkin(edge[0])*(1-t)+oldSkin(edge[1])*t;full=sum(palette[i]@np.r_[v,1]*x for i,x in enumerate(weights)if x)[:3];limited=sum(palette[i]@np.r_[v,1]*x for i,x in enumerate(four)if x)[:3];fullError.append(float(np.linalg.norm(full-actual)));fourError.append(float(np.linalg.norm(limited-actual)));pruning.append(float(np.linalg.norm(limited-full)))
        vertices.append({'index':index,'edge':list(edge),'t':t,'jointUnion':int((weights>0).sum()),'discardedWeight':float(loss),'actual60FrameFullWeightVsOldEdgeMaxMetres':max(fullError),'actual60FrameTop4VsOldEdgeMaxMetres':max(fourError),'actual60FramePruningOnlyMaxMetres':max(pruning),'standingTop4VsOldEdgeMetres':fourError[0],'weights4':{names[i]:float(x)for i,x in enumerate(four)if x}})
g=lambda a,b,n:pointMap[a,b,n]
def split(f):
    a,b,c=map(int,f)
    if a in [439,440,441]and b in [439,440,441]:
        ac1,ac2,bc1,bc2=g(a,c,1),g(a,c,2),g(b,c,1),g(b,c,2)
        return[[a,b,bc1],[a,bc1,ac1],[ac1,bc1,bc2],[ac1,bc2,ac2],[ac2,bc2,c]]
    assert a in [439,440]and b in [560,561,562]and c in [560,561,562]
    ab1,ab2,ac1,ac2=g(a,b,1),g(a,b,2),g(a,c,1),g(a,c,2)
    return[[a,ab1,ac1],[ab1,ab2,ac2],[ab1,ac2,ac1],[ab2,b,c],[ab2,c,ac2]]
patch=[770,771,772,773];outer=[(439,560),(441,562)];neighbors={};newFaces=[];lineage=[]
for edge in outer:
    incident=[i for i,f in enumerate(faces)if all(v in f for v in edge)];outside=[i for i in incident if i not in patch];assert len(outside)==1;neighbors[outside[0]]=edge
for i,f in enumerate(faces):
    if i in patch:children=split(f)
    elif i in neighbors:
        edge=neighbors[i];a,b,other=next((int(f[k]),int(f[(k+1)%3]),int(f[(k+2)%3]))for k in range(3)if set([int(f[k]),int(f[(k+1)%3])])==set(edge));mids=[g(*edge,1),g(*edge,2)];mids=mids if a==edge[0]else mids[::-1];chain=[a,*mids,b];children=[[other,x,y]for x,y in zip(chain,chain[1:])]
    else:children=[f.tolist()]
    newFaces.extend(children);lineage.extend([i]*len(children))
newPoints=np.array(newPoints);newFaces=np.array(newFaces);lineage=np.array(lineage);assert len(newPoints)==1402 and len(newFaces)==2440
affected=np.isin(lineage,patch);pf=newFaces[affected];lengths=np.linalg.norm(newPoints[pf]-newPoints[np.roll(pf,-1,axis=1)],axis=2)
sourceWeld={};ids=[]
for q in np.round(newPoints,7):key=tuple(q);sourceWeld.setdefault(key,len(sourceWeld));ids.append(sourceWeld[key])
wf=np.array(ids)[newFaces];ec={}
for f in wf:
    for a,b in zip(f,np.roll(f,-1)):key=tuple(sorted([int(a),int(b)]));ec[key]=ec.get(key,0)+1
assert max(ec.values())==2
report={'status':'plan-only-no-new-asset-or-cloth','sourceId':'m1-sixfold-skirt-active-gap-hem-v1','patchParentFaces':patch,'outerClosureFaces':{str(k):list(v)for k,v in neighbors.items()},'originalCounts':{'vertices':1392,'faces':2420},'proposedCounts':{'vertices':1402,'faces':2440},'addedVertices':10,'addedFaces':20,'patchTrianglesBeforeAfter':[4,20],'outerTrianglesBeforeAfter':[2,6],'bindPatchMaximumChildEdgeMetres':float(lengths.max()),'maximumEdgeIncidence':max(ec.values()),'newVertices':vertices,'rules':['All5 longitudinal existing edges of the2quads including2 internal diagonals get thirds; preserve old source planes rather than create a ruled quad surface.','4 parent triangles each become5;2 outside neighbors each become3 for conforming boundary.','Original120,20source seam and every old vertex all attributes unchanged.','Real runtime must retain new displayed topology, with explicit source-face lineage.'],'limits':['No third physical run. No new source GLB or actual gate yet.','Outside closure fans still contain long edges outside the bounded2quad patch; no universal curvature claim.','All new4-weight truncation and LBS deviation retained; new static/full-surface gates mandatory.']}
(O/'assessment.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');(O/'planned-face-lineage.json').write_text(json.dumps({'oldFaceForNewFace':lineage.tolist(),'triangles':newFaces.tolist()},separators=(',',':'))+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items()if k not in ['newVertices']},indent=2));print(json.dumps({'maxWeightLoss':max(v['discardedWeight']for v in vertices),'maxLBS':max(v['actual60FrameTop4VsOldEdgeMaxMetres']for v in vertices),'maxPruningOnly':max(v['actual60FramePruningOnlyMaxMetres']for v in vertices),'maxStanding':max(v['standingTop4VsOldEdgeMetres']for v in vertices)}))
