"""Read-only source and three frozen output frames; no new cloth evaluation."""
from pathlib import Path
import ast,gzip,hashlib,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';A=S/'active-gap-hem-v1';O=A/'native-author-trial-v1'
def reuse(path,names):
    tree=ast.parse(path.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py',['load'])
reuse(R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py',['point_tri'])
reuse(R/'scripts/m1-assets/simple-skirt/assess-active-layer-gap.py',['closest_point','closest_segments','closest_tri'])
capture=json.loads(gzip.decompress((A/'continuous-input-v1/capture.json.gz').read_bytes()));rejected=json.loads(gzip.decompress((O/'rejected-shape.json.gz').read_bytes()));prep=json.loads((O/'preparation.json').read_text(encoding='utf-8'));mapping=np.array(prep['renderToSim'])
raw,doc,read=load(A/'m1-sixfold-skirt-active-gap-hem-v1.glb');counts=[len(read(p['attributes']['POSITION']))for p in doc['meshes'][0]['primitives']];rf=np.concatenate([read(p['indices']).reshape(-1,3)+sum(counts[:i])for i,p in enumerate(doc['meshes'][0]['primitives'])]);faces=mapping[rf]
frames=[json.loads(gzip.decompress(p.read_bytes()))for p in sorted(O.glob('frame-*.json.gz'))]
body=next(m for m in capture['frames'][0]['colliders']if m['name']=='Bodybaked');bp=np.array(body['positions']).reshape(-1,3);bf=np.array(body['triangles']).reshape(-1,3);B=bp[bf];hip=np.array(capture['frames'][0]['bones']['J_Bip_C_Hips']).reshape(4,4).T
def segment_hit(p,q,t):
    e1=t[1]-t[0];e2=t[2]-t[0];delta=q-p;h=np.cross(delta,e2);det=e1@h
    if abs(det)<1e-15:return None
    s=p-t[0];u=(s@h)/det;c=np.cross(s,e1);v=(delta@c)/det;along=(e2@c)/det
    if min(u,v,along)>=-1e-9 and u+v<=1+1e-9 and along<=1+1e-9:return{'point':(p+along*delta).tolist(),'along':float(along),'triangleBarycentric':[float(1-u-v),float(u),float(v)]}
    return None
def signed_nearest(p):
    ds=point_tri(np.broadcast_to(p,(len(B),3)),B);i=int(ds.argmin());near=closest_point(p,B[i]);normal=np.cross(B[i,1]-B[i,0],B[i,2]-B[i,0]);normal/=np.linalg.norm(normal)
    return{'bodyFace':i,'distanceMetres':float(np.sqrt(ds[i])),'nearestNormalSignedMetres':float((p-near)@normal),'point':p.tolist()}
rows=[]
for skirtFace in sorted(set(a for a,b in rejected['exactColliderPairs']['Bodybaked'])):
    bodyFaces=sorted(set(b for a,b in rejected['exactColliderPairs']['Bodybaked']if a==skirtFace));history=[]
    for fr in frames:
        p=np.array(fr['positionsWorld']);tri=p[faces[skirtFace]];hits=[]
        for bi in bodyFaces:
            bt=B[bi];intersection=[]
            for k,l in [(0,1),(1,2),(2,0)]:
                h=segment_hit(tri[k],tri[l],bt)
                if h:intersection.append({'origin':'skirtEdge','indices':[k,l],**h})
                h=segment_hit(bt[k],bt[l],tri)
                if h:intersection.append({'origin':'bodyEdge','indices':[k,l],**h})
            a,b=closest_tri(tri,bt);hits.append({'bodyFace':bi,'edgeCrossings':intersection,'closestNonIntersectionFeatureDistance':float(np.linalg.norm(a-b))})
        grid=[]
        # A diagnostic dense sample locates normal depth; exact edge intersection
        # above proves crossing. Grid maximum is NOT a certified penetration bound.
        if fr['frame']==3:
            for i in range(21):
                for j in range(21-i):grid.append(signed_nearest((i*tri[0]+j*tri[1]+(20-i-j)*tri[2])/20))
        worst=min(grid,key=lambda q:q['nearestNormalSignedMetres'])if grid else None
        center=np.r_[tri.mean(0),1]@np.linalg.inv(hip).T
        history.append({'frame':fr['frame'],'region':'transitionRow2','sourceRenderIndices':rf[skirtFace].tolist(),'simIndices':faces[skirtFace].tolist(),'hipLocalCenter':center[:3].tolist(),'edgesMetres':np.linalg.norm(tri-np.roll(tri,-1,axis=0),axis=1).tolist(),'verticesNearest': [signed_nearest(v)for v in tri],'bodyPairCrossingDetails':hits,'sampledInteriorMostNegativeNormalDistance':worst,'sourceMaterialEdgeRatio':fr['maxEdgeStretch']})
    rows.append({'skirtFace':skirtFace,'bodyFaces':bodyFaces,'history':history})
report={'basis':'Saved actual native output frames1..3, exact captured body triangles; no repeated simulation','inputSha256':hashlib.sha256((A/'continuous-input-v1/capture.json.gz').read_bytes()).hexdigest(),'rows':rows,'limits':['Nearest triangle normal signed distance is local surface-side evidence, not a global watertight inside test.','Interior20 subdivisions locate depth only; not a proven maximum.','Exact segment/triangle intersections certify the4 reported pairs; zero-thickness cross counts remain original gate.']}
(O/'first-failure-geometry.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps([{'face':r['skirtFace'],'history':[{'frame':h['frame'],'center':h['hipLocalCenter'],'edges':h['edgesMetres'],'vertexSigned':[v['nearestNormalSignedMetres']for v in h['verticesNearest']],'hits':sum(len(p['edgeCrossings'])for p in h['bodyPairCrossingDetails']),'sampledDepth':h['sampledInteriorMostNegativeNormalDistance']}for h in r['history']]}for r in rows],indent=2))
