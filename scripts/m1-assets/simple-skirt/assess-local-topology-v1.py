"""Read-only local conforming edge refinement cost/weight assessment; no asset edit."""
from pathlib import Path
import ast,gzip,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];A=R/'assets-source/m1/simple-skirt-v1/active-gap-hem-v1';O=A/'native-author-trial-v1'
def reuse(path,names):
    parsed=ast.parse(path.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in parsed.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py',['load'])
reuse(R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py',['point_tri'])
reuse(R/'scripts/m1-assets/simple-skirt/assess-active-layer-gap.py',['closest_point'])
raw,d,read=load(A/'m1-sixfold-skirt-active-gap-hem-v1.glb');primitives=d['meshes'][0]['primitives'];counts=[len(read(p['attributes']['POSITION']))for p in primitives];p=np.concatenate([read(x['attributes']['POSITION'])for x in primitives]);j=np.concatenate([read(x['attributes']['JOINTS_0'])for x in primitives]);w=np.concatenate([read(x['attributes']['WEIGHTS_0'])for x in primitives]);tri=np.concatenate([read(x['indices']).reshape(-1,3)+sum(counts[:i])for i,x in enumerate(primitives)]);skin=d['skins'][0];names=[d['nodes'][i]['name']for i in skin['joints']];inv=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
capture=json.loads(gzip.decompress((A/'continuous-input-v1/capture.json.gz').read_bytes()));prep=json.loads((O/'preparation.json').read_text(encoding='utf-8'));failed=json.loads(gzip.decompress((O/'frame-03.json.gz').read_bytes()));sim=np.array(failed['positionsWorld']);mapping=np.array(prep['renderToSim']);body=next(m for m in capture['frames'][0]['colliders']if m['name']=='Bodybaked');bp=np.array(body['positions']).reshape(-1,3);bf=np.array(body['triangles']).reshape(-1,3);B=bp[bf];mat=lambda a:np.array(a).reshape(4,4).T
incident=[i for i,f in enumerate(tri)if 440 in f and 561 in f];assert incident==[770,773]
normals=[]
for i in [825,834]:v=B[i];n=np.cross(v[1]-v[0],v[2]-v[0]);normals.append(n/np.linalg.norm(n))
rows=[]
for t in [1/3,2/3]:
    pos=p[440]*(1-t)+p[561]*t;weights=np.zeros(len(names))
    for idx,factor in [(440,1-t),(561,t)]:
        for ji,wi in zip(j[idx],w[idx]):weights[ji]+=float(wi)*factor
    weights/=weights.sum();rank=np.argsort(-weights,kind='stable')[:4];loss=1-weights[rank].sum();pruned=np.zeros(len(names));pruned[rank]=weights[rank]/weights[rank].sum();unprunedError=[];prunedError=[];pruningOnly=[]
    for frame in capture['frames']:
        world=np.array([mat(frame['bones'][n])for n in names])
        for c in frame['controls']:world[names.index(c['name'])]=mat(c['privateWorld'])
        palette=world@inv
        def original(i):return sum(palette[j[i,k]]@np.r_[p[i],1]*w[i,k]for k in range(4))[:3]
        old=original(440)*(1-t)+original(561)*t;new=sum(palette[x]@np.r_[pos,1]*v for x,v in enumerate(weights)if v)[:3];four=sum(palette[x]@np.r_[pos,1]*v for x,v in enumerate(pruned)if v)[:3]
        unprunedError.append(float(np.linalg.norm(new-old)));prunedError.append(float(np.linalg.norm(four-old)));pruningOnly.append(float(np.linalg.norm(four-new)))
    failedPoint=sim[mapping[440]]*(1-t)+sim[mapping[561]]*t;ds=point_tri(np.broadcast_to(failedPoint,(len(B),3)),B);i=int(ds.argmin());near=closest_point(failedPoint,B[i]);normal=np.cross(B[i,1]-B[i,0],B[i,2]-B[i,0]);normal/=np.linalg.norm(normal)
    rows.append({'t':t,'sourcePoint':pos.tolist(),'fullInterpolatedWeights':{names[i]:float(x)for i,x in enumerate(weights)if x},'conventionalTop4Weights':{names[i]:float(x)for i,x in enumerate(pruned)if x},'discardedWeight':float(loss),'actual60FrameFullWeightVsOldEdgeMaximumMetres':max(unprunedError),'actual60FrameTop4VsOldEdgeMaximumMetres':max(prunedError),'actual60FramePruningOnlyMaximumMetres':max(pruningOnly),'standingTop4VsOldEdgeMetres':prunedError[0],'frozenFailurePointNearestNormalSignedMetres':float((failedPoint-near)@normal),'bodyFaceAtFailurePoint':i})
report={'status':'proposal-only-no-new-mesh-or-cloth','sourceId':'m1-sixfold-skirt-active-gap-hem-v1','edgeRender':[440,561],'incidentFaces':incident,'bodyNormalAngleDegrees':float(np.degrees(np.arccos(np.clip(normals[0]@normals[1],-1,1)))),'actualFailureEdgeLengthMetres':float(np.linalg.norm(sim[mapping[440]]-sim[mapping[561]])),'proposedRule':'Only the one proven cross-body active edge, source parameter1/3 and2/3; split both incident triangles into3 and retain all other indices/positions. No recursive/global refinement.','newRenderVertices':1394,'newTriangles':2424,'addedVertices':2,'addedTriangles':4,'samples':rows,'limits':['5-joint union cannot be called lossless4-weight interpolation. Conventional top4 is measured here, not approved or installed.','New actual renderer must retain these vertices/faces; never map successful dense simulation back to old coarse faces and inherit collision approval.','All static/private-palette/body/top/self gates must rerun. No claim that this local edge suffices for all body curvature or future motion.','Explicit old-face to child-face provenance replaces old numeric face-range assumptions.']}
(O/'local-third-refinement-assessment.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))
