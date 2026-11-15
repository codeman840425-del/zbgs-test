"""Read-only original lip-seam and microphone measurements; no fit/source edits."""
from pathlib import Path
import importlib.util,json,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('source_grip',ROOT/'scripts/m1c/fit-source-grip.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
OUT=ROOT/'evidence/mic-mouth-target';OUT.mkdir(parents=True,exist_ok=True)
def worlds(g):
    parents={c:i for i,n in enumerate(g.doc['nodes'])for c in n.get('children',[])};cache={}
    def at(i):
        if i not in cache:cache[i]=(at(parents[i])if i in parents else np.eye(4))@mod.transform(g.doc['nodes'][i])
        return cache[i]
    return np.array([at(i)for i in range(len(g.doc['nodes']))])
def skin(g,primitive,ids,world,mesh_index,delta=None):
    d=g.doc;sk=d['skins'][next(n['skin']for n in d['nodes']if n.get('mesh')==mesh_index)];inv=g.acc(sk['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);pal=world[sk['joints']]@inv
    p=g.acc(primitive['attributes']['POSITION'])[ids].astype(float)
    if delta is not None:p+=delta[ids]
    j=g.acc(primitive['attributes']['JOINTS_0'])[ids];w=g.acc(primitive['attributes']['WEIGHTS_0'])[ids]
    return sum(np.einsum('nij,nj->ni',pal[j[:,k]],np.c_[p,np.ones(len(p))])*w[:,k,None]for k in range(4))[:,:3]
rows=[]
for sex in ['female','male']:
    path=ROOT/f'prototype/public/assets/foundation/base-{sex}-roundtrip.vrm';g=mod.GLB(path);d=g.doc;world=worlds(g)
    head=next(x['node']for x in d['extensions']['VRM']['humanoid']['humanBones']if x['bone']=='head');inverseHead=np.linalg.inv(world[head]);meshIndex=1
    mouth=next(p for p in d['meshes'][meshIndex]['primitives']if'FaceMouth'in d['materials'][p['material']]['name']);face=next(p for p in d['meshes'][meshIndex]['primitives']if'_Face_'in d['materials'][p['material']]['name']and'SKIN'in d['materials'][p['material']]['name'])
    P=g.acc(mouth['attributes']['POSITION']);F=g.acc(mouth['indices']).reshape(-1,3);ids=np.unique(F);skinids=np.unique(g.acc(face['indices']));lookup={};groups=[];mapping={}
    for i in ids:
        key=tuple(np.round(P[i],7))
        if key not in lookup:lookup[key]=len(groups);groups.append([])
        k=lookup[key];groups[k].append(int(i));mapping[int(i)]=k
    wf=np.array([[mapping[int(i)]for i in f]for f in F]);edges={}
    for f in wf:
        for a,b in zip(f,np.roll(f,-1)):k=tuple(sorted((int(a),int(b))));edges[k]=edges.get(k,0)+1
    adjacency={}
    for (a,b),count in edges.items():
        if count==1:adjacency.setdefault(a,set()).add(b);adjacency.setdefault(b,set()).add(a)
    loops=[]
    while adjacency:
        first=next(iter(adjacency));seen={first};todo=[first]
        while todo:
            for j in adjacency[todo.pop()]:
                if j not in seen:seen.add(j);todo.append(j)
        ii=[groups[j][0]for j in sorted(seen)];q=P[ii];dist=np.linalg.norm(q[:,None,:]-P[skinids][None,:,:],axis=2).min(1)
        loops.append({'ids':ii,'skinCoincidenceMaxMetres':float(dist.max()),'count':len(ii)})
        for j in seen:del adjacency[j]
    eligible=[x for x in loops if x['skinCoincidenceMaxMetres']<1e-6];assert len(eligible)==1
    ring=eligible[0]['ids'];assert len(ring)==32
    local=lambda q:(np.c_[q,np.ones(len(q))]@inverseHead.T)[:,:3]
    neutral=local(skin(g,mouth,ring,world,meshIndex));aa=next(x for x in d['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']if x.get('presetName')=='a')['binds'][0]['index'];delta=g.acc(mouth['targets'][aa]['POSITION']);aa1=local(skin(g,mouth,ring,world,meshIndex,delta));aa066=neutral+.66*(aa1-neutral)
    iris=next(p for p in d['meshes'][meshIndex]['primitives']if'EyeIris'in d['materials'][p['material']]['name']);irisids=np.unique(g.acc(iris['indices']));eyes=local(skin(g,iris,irisids,world,meshIndex))
    ringpts=P[ring];faceF=g.acc(face['indices']).reshape(-1,3);onrim=np.linalg.norm(P[:,None,:]-ringpts[None,:,:],axis=2).min(1)<1e-6;nearfaces=faceF[np.any(onrim[faceF],axis=1)];Q=local(skin(g,face,np.arange(len(P)),world,meshIndex));normals=np.cross(Q[nearfaces[:,1]]-Q[nearfaces[:,0]],Q[nearfaces[:,2]]-Q[nearfaces[:,0]]);normal=normals.sum(0);normal/=np.linalg.norm(normal)
    rows.append({'body':sex,'bodySha256':g.sha,'source':str(path.relative_to(ROOT)),'rawHeadNode':head,'rawHeadName':d['nodes'][head]['name'],'rawHeadRestWorldMatrixColumnMajor':world[head].T.flatten().tolist(),'mouthMesh':meshIndex,'mouthMaterial':d['materials'][mouth['material']]['name'],'method':'Unique welded FaceMouth boundary loop coincident with actual Face_SKIN surface; 32 unique vertices, not eye pivots/teeth bounds','allMouthBoundaryComponents':loops,'rimVertexIds':ring,'mouthRawHeadLocal':neutral.mean(0).tolist(),'neutralRimRawHeadLocal':neutral.tolist(),'neutralRimAABB':[neutral.min(0).tolist(),neutral.max(0).tolist()],'adjacentFaceAreaWeightedNormalRawHeadLocal':normal.tolist(),'aaMorphIndex':aa,'aa066MouthRawHeadLocal':aa066.mean(0).tolist(),'aa1MouthRawHeadLocal':aa1.mean(0).tolist(),'aa1RimAABB':[aa1.min(0).tolist(),aa1.max(0).tolist()],'visibleIrisRawHeadLocalAABB':[eyes.min(0).tolist(),eyes.max(0).tolist()],'mouthToVisibleIrisBottomYMetres':float(eyes[:,1].min()-neutral.mean(0)[1])})
mp=ROOT/'prototype/public/assets/m1c/studio-microphone-v1.glb';g=mod.GLB(mp);w=worlds(g);parts=[]
for i,n in enumerate(g.doc['nodes']):
    if 'mesh'not in n:continue
    p=np.concatenate([g.acc(pr['attributes']['POSITION'])for pr in g.doc['meshes'][n['mesh']]['primitives']]);q=(np.c_[p,np.ones(len(p))]@w[i].T)[:,:3];parts.append({'node':i,'name':n.get('name'),'min':q.min(0).tolist(),'max':q.max(0).tolist()})
grille=next(x for x in parts if x['name']=='Grille');lo=np.array(grille['min']);hi=np.array(grille['max']);center=(lo+hi)/2
mic={'sha256':g.sha,'source':str(mp.relative_to(ROOT)),'principalAxisLocal':[0,1,0],'gripSocketLocal':next(w[i,:3,3].tolist()for i,n in enumerate(g.doc['nodes'])if n.get('name')=='socket_grip'),'capsuleCenterLocal':next(w[i,:3,3].tolist()for i,n in enumerate(g.doc['nodes'])if n.get('name')=='socket_capsule'),'grilleCenterLocal':center.tolist(),'grilleRadiiMetres':((hi-lo)/2).tolist(),'grilleFrontPoleLocal':[float(center[0]),float(hi[1]),float(center[2])],'parts':parts,'meaning':'Geometric capsule/grille front pole, not measured acoustic response; model has no audio pickup simulation'}
report={'schema':'mic-mouth-source-anchors-v1','bodies':rows,'microphone':mic,'limits':['Static source geometry and aa morph; no browser or visual pose acceptance.','rawHead-local points remain valid under outer VRM0 rotation; target normalizedHead transform must use current evaluated pose.','Mouth anchor is neutral lip-rim centroid; speaking morph displaces rim, motion range explicitly retained.','No grip profile, finger pose, source asset or product file changed.']}
report['sourcePins']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in [Path(__file__).resolve(),ROOT/'scripts/m1c/fit-source-grip.py']}
(OUT/'source-anchors.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'bodies':[{k:x[k]for k in ['body','mouthRawHeadLocal','aa066MouthRawHeadLocal','adjacentFaceAreaWeightedNormalRawHeadLocal','mouthToVisibleIrisBottomYMetres']}for x in rows],'microphone':{k:mic[k]for k in ['principalAxisLocal','capsuleCenterLocal','grilleFrontPoleLocal','grilleRadiiMetres']}}))
