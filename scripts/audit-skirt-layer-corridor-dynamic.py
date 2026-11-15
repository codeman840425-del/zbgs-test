"""Read-only actual body/top and saved garment geometry, no cloth evaluation."""
from pathlib import Path
import ast,gzip,hashlib,json,struct,time
import numpy as np
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]
R=ROOT/'experiments/m1-simple-skirt-worktree';S=R/'assets-source/m1/simple-skirt-v1';A=S/'two-quad-thirds-v1';D=A/'native-quality64-moving-v1'
OUT=ROOT/'evidence/skirt-layer-corridor-dynamic.json.gz'
def reuse(path,names):
    parsed=ast.parse(path.read_text(encoding='utf-8'))
    exec(compile(ast.Module(body=[n for n in parsed.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(ROOT/'scripts/audit-skirt-fixed-band-continuous.py',['load','posed'])
reuse(R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py',['point_tri','seg_seg','near_minimum'])
reuse(R/'scripts/m1-assets/simple-skirt/assess-active-layer-gap.py',['closest_point','closest_segments','closest_tri'])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
asset=A/'m1-sixfold-skirt-two-quad-thirds-v1.glb';cap_path=S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz'
assert sha(asset)=='02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7'
assert sha(cap_path)=='e494fa798bd954554b430635f43d4aa4417d346aac6391511c08502daebc6d58'
cap=json.loads(gzip.decompress(cap_path.read_bytes()));four_path=S/'private-layer-initial/capture.json.gz';four=json.loads(gzip.decompress(four_path.read_bytes()))
source=load(asset);faces=source['faces'];prep=json.loads((D/'preparation.json').read_text(encoding='utf-8'));mapping=np.array(prep['renderToSim'])
assert prep['sourceSha256']==sha(asset)and prep['captureSha256']==sha(cap_path)
tree=lambda p,f:BVHTree.FromPolygons(np.asarray(p).tolist(),np.asarray(f).tolist(),all_triangles=True,epsilon=0.)
def mesh(m):
    p=np.array(m['positions']).reshape(-1,3);f=np.array(m['triangles']).reshape(-1,3)
    return p,f
def intersections(a,b):
    hits=[];strict=False
    for side,(edge,tri)in enumerate([(a,b),(b,a)]):
        e1=tri[1]-tri[0];e2=tri[2]-tri[0]
        for i,j in [(0,1),(1,2),(2,0)]:
            delta=edge[j]-edge[i];h=np.cross(delta,e2);det=e1@h
            if abs(det)<1e-15:continue
            q=edge[i]-tri[0];u=(q@h)/det;c=np.cross(q,e1);v=(delta@c)/det;t=(e2@c)/det
            if min(u,v,t)>=-1e-8 and u+v<=1+1e-8 and t<=1+1e-8:
                p=edge[i]+t*delta
                if not any(np.linalg.norm(p-n)<1e-8 for n in hits):hits.append(p)
                strict|=min(u,v,1-u-v,t,1-t)>1e-7
    if len(hits)>2:
        ij=max(((i,j)for i in range(len(hits))for j in range(i)),key=lambda ij:np.linalg.norm(hits[ij[0]]-hits[ij[1]]));hits=[hits[i]for i in ij]
    return hits,bool(strict)
def relation(samples,length,bt,offset=0):
    found=[bt.find_nearest(p)for p in samples];k=min(range(len(found)),key=lambda i:found[i][3]);q=found[k]
    return{'sampledDistanceMetres':q[3],'lineDistanceLowerBoundMetres':max(0,q[3]-length/4),'skirtFace':q[2]+offset,'closestSkirtPoint':list(q[0]),'lineSample':samples[k].tolist()}

started=time.monotonic();rows=[];selected=[]
work=[(i+1,f)for i,f in enumerate(cap['frames'])]+[(f['label'],f)for f in four['frames']]
for index,frame in work:
    points=posed(source,frame);fixed_tree=tree(points,faces[:260]);free_tree=tree(points,faces[260:])
    body=next(m for m in frame['colliders']if m['name']=='Bodybaked');bp,bf=mesh(body);B=bp[bf];body_tree=tree(bp,bf)
    hip=np.array(frame['bones']['J_Bip_C_Hips']).reshape(4,4).T;hip_inv=np.linalg.inv(hip)
    actual=None;actual_tree=None;failed={}
    if index in [19,29,35]:
        path=D/f'frame-{index:02d}.json.gz';actual=json.loads(gzip.decompress(path.read_bytes()));ap=np.array(actual['positionsWorld']);actual_tree=tree(ap, mapping[faces[260:]])
        failed={name:set(b for a,b in pairs)for name,pairs in actual['exactColliderPairs'].items()}
    tops=[]
    for m in frame['colliders']:
        if not m['name'].startswith('m1-uniform-top'):continue
        tp,tf=mesh(m);T=tp[tf];pairs=sorted(body_tree.overlap(tree(tp,tf)));details=[]
        for bi,ti in pairs:
            line,strict=intersections(B[bi],T[ti]);detail={'bodyFace':bi,'topFace':ti,'strictFiniteCrossing':strict,'intersectionPointsWorld':[p.tolist()for p in line]}
            if line:
                length=float(np.linalg.norm(line[-1]-line[0]));samples=line+[np.mean(line,axis=0)];fix=relation(samples,length,fixed_tree);free=relation(samples,length,free_tree,260)
                center=np.r_[np.mean(line,axis=0),1]@hip_inv.T
                detail.update({'intersectionLengthMetres':length,'hipLocalIntersectionCenter':center[:3].tolist(),'fixedRelation':fix,'freeSourceRelation':free,'regionScreen20mm':'near-fixed-or-free'if min(fix['sampledDistanceMetres'],free['sampledDistanceMetres'])<=.02 else'remote-from-skirt-certified'if min(fix['lineDistanceLowerBoundMetres'],free['lineDistanceLowerBoundMetres'])>.02 else'borderline','sameTopFaceAsNativeFailure':ti in failed.get(m['name'],set())})
                if actual_tree:detail['actualClothFreeRelation']=relation(samples,length,actual_tree,260)
            details.append(detail)
        kept=[x for x in details if x.get('regionScreen20mm')=='near-fixed-or-free' or x.get('sameTopFaceAsNativeFailure') or x.get('actualClothFreeRelation',{}).get('sampledDistanceMetres',1)<.02]
        tops.append({'name':m['name'],'pairCount':len(pairs),'strictPairCount':sum(x['strictFiniteCrossing']for x in details),'nearSkirtPairCount':sum(x.get('regionScreen20mm')=='near-fixed-or-free'for x in details),'pairs':pairs,'localWitnesses':kept,'allWitnesses':details})
        if actual is not None:
            face_details=[]
            for ti in sorted(failed.get(m['name'],set())):
                overlaps=[bi for bi,t in pairs if t==ti]
                clearance={'distanceMetres':0.,'intersectingBodyFaces':overlaps}if overlaps else near_minimum(T[ti:ti+1],B,range=.003)
                if 'skirtFace'in clearance:del clearance['skirtFace']
                if 'otherFace'in clearance:clearance['bodyFace']=clearance.pop('otherFace')
                if not overlaps and clearance.get('distanceMetres',1)<.003:
                    p,q=closest_tri(T[ti],B[clearance['bodyFace']]);clearance.update({'topPointWorld':p.tolist(),'bodyPointWorld':q.tolist()})
                face_details.append({'topFace':ti,'actualFailedSkirtFaces':[a for a,b in actual['exactColliderPairs'][m['name']]if b==ti],'bodyClearance':clearance})
            selected.append({'frame':index,'actionSeconds':frame['actionSeconds'],'top':m['name'],'trial':'native-quality64-moving-v1','nativeFrameSha256':sha(D/f'frame-{index:02d}.json.gz'),'actualFailureCount':len(actual['exactColliderPairs'][m['name']]),'uniqueFailedTopFaces':face_details})
    rows.append({'frame':index,'actionSeconds':frame.get('actionSeconds'),'sitProgress':frame['snapshot']['motion'].get('sitProgress'),'tops':tops})
report={'schema':'skirt-layer-corridor-dynamic-v1','sourceSha256':sha(asset),'captureSha256':sha(cap_path),'fourPoseCaptureSha256':sha(four_path),'build':'58394ce674e4','trialPreparationSha256':sha(D/'preparation.json'),'basis':'Full actual Bodybaked/top capture; private-palette source skirt used only for proximity classification. Selected nativequality64 outputs remain separately identified.','rows':rows,'selectedNativeFailureRelationships':selected,'seconds':time.monotonic()-started,'physicsExecuted':False,'limits':['20mm screen is a region label, not a clearance acceptance threshold. All global pairs preserved; detailed witnesses retained for local or failure-related pairs.','Line distance measured at endpoints/midpoint; lower bound subtracts quarter-line length via1-Lipschitz distance.','Surface intersections establish local zero separation, not global impossibility to route garment elsewhere.','Near source skirt uses029LBS, selected actual cloth has its own separate proximity field; never substitutes source for simulated output.','Failed top face minimum distance below3mm is exact finite vertex-face/edge-edge minimum or zero intersect; absence within3mm is a lower bound.','1.2mm per-side detection envelopes sum to2.4mm, but response targets sum to2.133333mm. A2.22554mm gap alone is not proof of infeasibility.','60 samples plus four historic poses; notCCD, solid containment or GPU visible acceptance.']}
raw=(json.dumps(report,indent=2)+'\n').encode();packed=gzip.compress(raw,compresslevel=6,mtime=0)
assert gzip.decompress(packed)==raw
OUT.write_bytes(packed)
(ROOT/'evidence/skirt-layer-corridor-dynamic.json').write_text(json.dumps({'schema':'skirt-layer-corridor-dynamic-summary-v1','stage':'geometry-complete-source-mapping-pending','archive':OUT.name,'rawSha256':hashlib.sha256(raw).hexdigest(),'gzipSha256':hashlib.sha256(packed).hexdigest(),'rawBytes':len(raw),'gzipBytes':len(packed),'allGlobalWitnessesPreserved':True},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'seconds':report['seconds'],'output':str(OUT),'selected':[{'frame':x['frame'],'top':x['top'],'failedTopFaces':len(x['uniqueFailedTopFaces']),'facesCrossingBody':sum(bool(f['bodyClearance'].get('intersectingBodyFaces'))for f in x['uniqueFailedTopFaces']),'facesGapUnder2p4mm':sum(f['bodyClearance'].get('distanceMetres',1)<.0024 for f in x['uniqueFailedTopFaces'])}for x in selected],'keyRows':[{'frame':r['frame'],'tops':[{k:t[k]for k in ['name','pairCount','strictPairCount','nearSkirtPairCount']}for t in r['tops']]}for r in rows if r['frame']in[1,19,29,35,60,'standing','sit-in','seated','rise']]}))
