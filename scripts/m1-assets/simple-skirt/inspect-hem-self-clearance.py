"""Frozen-frame exact nonadjacent hem/outer distances; no physical rerun."""
from pathlib import Path
import ast,gzip,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';A=S/'two-quad-thirds-v1';O=A/'native-author-trial-v1'
def reuse(path,names):
    tree=ast.parse(path.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py',['load']);reuse(R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py',['point_tri','seg_seg'])
raw,d,read=load(A/'m1-sixfold-skirt-two-quad-thirds-v1.glb');ps=d['meshes'][0]['primitives'];counts=[len(read(p['attributes']['POSITION']))for p in ps];rf=np.concatenate([read(p['indices']).reshape(-1,3)+sum(counts[:i])for i,p in enumerate(ps)]);prep=json.loads((O/'preparation.json').read_text());mapping=np.array(prep['renderToSim']);faces=mapping[rf];lineage=np.array(json.loads((A/'face-lineage.json').read_text())['oldFaceForNewFace']);outer=np.flatnonzero((lineage>=1940)&(lineage<2180));inner=np.flatnonzero(lineage>=2180);fixed=set(prep['fixedVertices']);nearLong=np.flatnonzero(np.any(np.isin(rf,[1350,1351]),axis=1));pairs=np.array([(i,j)for i in inner for j in outer if not(set(faces[i])&set(faces[j]))and not(all(int(v)in fixed for v in faces[i])and all(int(v)in fixed for v in faces[j]))])
def distance(p,pairs):
    a=p[faces[pairs[:,0]]];b=p[faces[pairs[:,1]]];values=[point_tri(a[:,k],b)for k in range(3)]+[point_tri(b[:,k],a)for k in range(3)]
    for i,j in [(0,1),(1,2),(2,0)]:
        for k,l in [(0,1),(1,2),(2,0)]:values.append(seg_seg(a[:,i],a[:,j],b[:,k],b[:,l]))
    return np.sqrt(np.min(values,axis=0))
rows=[]
for number in [1,3,7,18]:
    fr=json.loads(gzip.decompress((O/('frame-%02d.json.gz'%number)).read_bytes()));p=np.array(fr['positionsWorld']);ds=distance(p,pairs);qualify=np.flatnonzero(ds<=.001);local=np.flatnonzero(np.isin(pairs[:,0],nearLong));order=local[np.argsort(ds[local])];selected=[]
    for ix in order[:4]:
        a,b=map(int,pairs[ix]);selected.append({'faces':[a,b],'parentFaces':[int(lineage[a]),int(lineage[b])],'simIndices':[faces[a].tolist(),faces[b].tolist()],'renderIndices':[rf[a].tolist(),rf[b].tolist()],'sharedVertices':[],'distanceMetres':float(ds[ix]),'officialTrigger1mm':bool(ds[ix]<=.001),'officialResponseTargetDeficitMetres':max(0.,.001*8/9-float(ds[ix]))})
    pointRows=[]
    for vertex in [1350,1351]:
        point=p[mapping[vertex]];dist=np.sqrt(point_tri(np.broadcast_to(point,(len(outer),3)),p[faces[outer]]));i=int(dist.argmin());pointRows.append({'renderVertex':vertex,'outerFace':int(outer[i]),'outerParentFace':int(lineage[outer[i]]),'pointToOuterDistanceMetres':float(dist[i])})
    rows.append({'frame':number,'eligibleNonAdjacentPairCountUnder1mm':len(qualify),'minimumEligibleDistanceMetres':float(ds.min()),'localIncidentInnerFaces':nearLong.tolist(),'localEligibleUnder1mm':int(np.sum(ds[local]<=.001)),'localClosestNonAdjacentPairs':selected,'longestEdgeEndpoints':pointRows})
report={'source':'https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/blenkernel/intern/collision.cc','sourceFunctions':['cloth_bvh_selfcollision_is_active','cloth_selfcollision','cloth_selfcollision_response_static'],'authoringScale':10,'selfDistanceAuthoring':.005,'worldTriggerDistance':.001,'worldResponseDistance':.001*8/9,'rows':rows,'scope':'Only actual inner-return vs outer-hem face sets, no shared sim vertices, no pinned pair; no sewing/no exclusion group in saved trial','limits':['Geometrically eligible under official narrow-phase threshold, not an instrumented native impulse log.','Final post-solve distances do not reconstruct all intermediate substeps or establish causal dominance for edge stretch.','Zero triangle intersections is different from nonzero-thickness self-contact response.']}
(O/'hem-self-clearance.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))
