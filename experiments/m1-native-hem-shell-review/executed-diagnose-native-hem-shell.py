"""One bounded Blender4.5.9 native Solidify test on saved static outer arrays.
No cloth, input mutations, body removal, collider masks or thickness search.
Run: python scripts/diagnose-native-hem-shell.py
"""
from pathlib import Path
import sys,json,hashlib,gzip,struct,time,subprocess,collections
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'experiments/m1-simple-skirt-worktree'
A=WORK/'assets-source/m1/simple-skirt-v1/two-quad-thirds-v1'
SAVED=A/'native-linear-scale-static-v1'
OUT=ROOT/'experiments/m1-native-hem-shell-review'
BLENDER=ROOT/'experiments/tools/blender-4.5.9-windows-x64/blender.exe'
sha=lambda b:hashlib.sha256(b).hexdigest()
if '--blender-run' not in sys.argv:
    assert not OUT.exists(),'Refuse overwrite of frozen experiment'
    OUT.mkdir(parents=True)
    cmd=[str(BLENDER),'--background','--factory-startup','--threads','2','--python-exit-code','1','--python',str(Path(__file__).resolve()),'--','--blender-run']
    t=time.monotonic()
    try:
        r=subprocess.run(cmd,cwd=ROOT,capture_output=True,timeout=60);code=r.returncode;logs=r.stdout+r.stderr;timeout=False
    except subprocess.TimeoutExpired as e:
        code=None;logs=(e.stdout or b'')+(e.stderr or b'');timeout=True
    (OUT/'blender.log').write_bytes(logs)
    (OUT/'runner.json').write_text(json.dumps({'command':cmd,'threads':2,'timeoutSeconds':60,'timedOut':timeout,'returnCode':code,'seconds':time.monotonic()-t,'scriptSHA256':sha(Path(__file__).read_bytes())},indent=2),encoding='utf-8')
    print(logs.decode('utf-8',errors='replace')[-4500:]);sys.exit(0 if code==0 and not timeout else 1)
import bpy
import numpy as np
from mathutils.bvhtree import BVHTree
from mathutils import Vector
assert bpy.app.version[:3]==(4,5,9),bpy.app.version_string
start=time.monotonic()
sourcePath=A/'m1-sixfold-skirt-two-quad-thirds-v1.glb';raw=sourcePath.read_bytes();assert sha(raw)=='02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7'
prep=json.loads((SAVED/'preparation.json').read_text());mapPath=A/'single-layer-author-v1/mapping.json';mapping=json.loads(mapPath.read_text());assert sha(mapPath.read_bytes())==prep['authorMappingSha256'];assert mapping['sourceSha256']==sha(raw)
capPath=WORK/'assets-source/m1/simple-skirt-v1/active-gap-hem-v1/continuous-input-v1/capture.json.gz';capRaw=capPath.read_bytes();assert sha(capRaw)==prep['captureSha256'];capture=json.loads(gzip.decompress(capRaw));frame0=capture['frames'][0];del capture,capRaw
linePath=A/'face-lineage.json';lineage=np.array(json.loads(linePath.read_text())['oldFaceForNewFace'])
length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:]
def read(i):
    a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];assert not v.get('byteStride');width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt={5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];return np.frombuffer(binary,dtype=dt,count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],width).copy()
rf=[];uv=[];materials=[];offset=0
for pr in doc['meshes'][0]['primitives']:
    tri=read(pr['indices']).reshape(-1,3)+offset;rf.extend(tri);uv.extend(read(pr['attributes']['TEXCOORD_0']));materials.extend([pr.get('material',0)]*len(tri));offset+=doc['accessors'][pr['attributes']['POSITION']]['count']
rf=np.array(rf);uv=np.array(uv);materialIds=np.array(materials);assert len(rf)==2440
keep=np.array(mapping['authorKeepOldSim']);oldToAuthor=np.full(1290,-1,int);oldToAuthor[keep]=np.arange(len(keep));faceIds=np.array(mapping['authorFaceIndices']);faces=oldToAuthor[np.array(mapping['renderToOldSim'])[rf[faceIds]]];assert faces.min()>=0 and len(keep)==1170 and len(faces)==2200
fixed=set(prep['fixedVertices']);fixedAuthor=np.array([i for i,x in enumerate(keep)if int(x)in fixed]);assert len(fixedAuthor)==200;assert sum(lineage[faceIds]<120)==120
edgeCounts=collections.Counter(tuple(sorted((int(a),int(b))))for f in faces for a,b in zip(f,np.roll(f,-1)));boundary=[e for e,n in edgeCounts.items()if n==1];assert not any(n>2 for n in edgeCounts.values())
adj=collections.defaultdict(set)
for a,b in boundary:adj[a].add(b);adj[b].add(a)
assert all(len(v)==2 for v in adj.values());seen=set();loops=[]
for v in adj:
    if v in seen:continue
    todo=[v];component=[]
    while todo:
        v=todo.pop()
        if v in seen:continue
        seen.add(v);component.append(v);todo.extend(adj[v]-seen)
    loops.append(component)
assert sorted(map(len,loops))==[20,120]
# Whole static original body/top/chair remain. No masked triangle or fixed-band removal.
colliders=[]
for c in frame0['colliders']:colliders.append({'name':c['name'],'positions':np.array(c['positions']).reshape(-1,3),'faces':np.array(c['triangles']).reshape(-1,3)})
boxFaces=np.array([[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]])
for b in frame0['chair']:
    lo=b['min'];hi=b['max'];P=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(b['matrixWorld']).reshape(4,4);colliders.append({'name':b['name'],'positions':P[:,:3],'faces':boxFaces})
inputs={'source':{'path':str(sourcePath),'sha256':sha(raw)},'authorMapping':{'path':str(mapPath),'sha256':sha(mapPath.read_bytes())},'preparation':{'path':str(SAVED/'preparation.json'),'sha256':sha((SAVED/'preparation.json').read_bytes())},'lineage':{'path':str(linePath),'sha256':sha(linePath.read_bytes())},'capture':{'path':str(capPath),'sha256':prep['captureSha256'],'frameIndex':0},'frames':[]}
(OUT/'inputs').mkdir();(OUT/'inputs/source-029.glb').write_bytes(raw);(OUT/'inputs/author-mapping.json').write_bytes(mapPath.read_bytes());(OUT/'inputs/lineage.json').write_bytes(linePath.read_bytes());(OUT/'inputs/preparation.json').write_bytes((SAVED/'preparation.json').read_bytes());(OUT/'inputs/static-colliders.json.gz').write_bytes(gzip.compress(json.dumps({'sourceCaptureSHA256':prep['captureSha256'],'colliders':[{'name':c['name'],'positions':c['positions'].tolist(),'faces':c['faces'].tolist()}for c in colliders]}).encode(),mtime=0))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# A rigid axis permutation only, preserving orientation: Three Y-up -> Blender Z-up.
def to_blender(P):return np.array(P)[:,[0,2,1]]*np.array([1,-1,1])
def to_three(P):return np.array(P)[:,[0,2,1]]*np.array([1,1,-1])
def mesh(name,P,F):
    data=bpy.data.meshes.new(name);data.from_pydata(to_blender(P).tolist(),[],F.tolist());data.update();obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);return obj
mats=[]
for name,color in [('source-band',(0.12,.2,.3,1)),('source-outer',(.25,.35,.55,1)),('new-inner-band',(.55,.22,.18,1)),('new-inner',(.7,.3,.22,1)),('new-rim',(.8,.65,.2,1))]:
    m=bpy.data.materials.new(name);m.diffuse_color=color;mats.append(m)
for c in colliders:
    o=mesh('Unchanged_'+c['name'],c['positions'],c['faces']);o['sourceRole']='unchanged full captured collider';m=bpy.data.materials.new(c['name']);m.diffuse_color=(.7,.6,.5,1)if c['name']=='Bodybaked'else(.25,.3,.28,1);o.data.materials.append(m)
BVH=lambda P,F:BVHTree.FromPolygons(np.asarray(P).tolist(),np.asarray(F).tolist(),all_triangles=True,epsilon=0.0)
colliderTrees={c['name']:BVH(c['positions'],c['faces'])for c in colliders};rows=[];topology=None;nativeTriTopology=None;config={'solidify_mode':'EXTRUDE (Simple)','thicknessMetres':.0008,'offset':-1.,'use_even_offset':True,'use_quality_normals':True,'use_rim':True,'use_rim_only':False,'thickness_clamp':0.,'units':'actual metres; object scale identity; not earlier author units10','expectedRisk':'Known fixed-band body clearance0.338647mm is less than requested0.8mm; expect body crossing, do not alter mask/thickness.'}
for number in [1,5,18]:
    inputPath=SAVED/f'frame-{number:02d}.json.gz';frameBytes=inputPath.read_bytes();saved=json.loads(gzip.decompress(frameBytes));assert saved['sourceActionSeconds']==0 and len(saved['positionsWorld'])==1290;P=np.array(saved['positionsWorld'])[keep];inputs['frames'].append({'frame':number,'sha256':sha(frameBytes),'path':str(inputPath)});(OUT/'inputs'/inputPath.name).write_bytes(frameBytes)
    o=mesh(f'Frame_{number:02d}_Native_Solidify',P,faces)
    for m in mats:o.data.materials.append(m)
    attr=o.data.attributes.new('source_author_vertex','INT','POINT');attr.data.foreach_set('value',np.arange(len(P),dtype=np.int32))
    fa=o.data.attributes.new('source_author_face','INT','FACE');fa.data.foreach_set('value',np.arange(len(faces),dtype=np.int32))
    for i,poly in enumerate(o.data.polygons):poly.material_index=int(materialIds[faceIds[i]]);poly.use_smooth=True
    layer=o.data.uv_layers.new(name='OriginalOuterUV');layer.data.foreach_set('uv',uv[rf[faceIds]].astype(np.float32).ravel())
    vg=o.vertex_groups.new(name='OriginalFixedBand');vg.add(fixedAuthor.tolist(),1.,'REPLACE')
    m=o.modifiers.new('Native_Solidify_One_Config','SOLIDIFY');m.solidify_mode='EXTRUDE';m.thickness=.0008;m.offset=-1.;m.use_even_offset=True;m.use_quality_normals=True;m.use_rim=True;m.use_rim_only=False;m.thickness_clamp=0.;m.material_offset=2;m.material_offset_rim=4
    bpy.context.view_layer.update();ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh(preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get());xyz=np.empty(len(me.vertices)*3);me.vertices.foreach_get('co',xyz);Q=to_three(xyz.reshape(-1,3));ids=np.empty(len(Q),np.int32);me.attributes['source_author_vertex'].data.foreach_get('value',ids);polyfaces=[list(poly.vertices)for poly in me.polygons];polyroles=['outer'if poly.material_index<2 else'inner'if poly.material_index<4 else'rim'for poly in me.polygons];roleIndex={'outer':0,'inner':1,'rim':2};outerPolys=[i for i,r in enumerate(polyroles)if r=='outer'];innerPolys=[i for i,r in enumerate(polyroles)if r=='inner'];rimPolys=[i for i,r in enumerate(polyroles)if r=='rim'];outerSet=sorted(set(v for i in outerPolys for v in polyfaces[i]));innerSet=sorted(set(v for i in innerPolys for v in polyfaces[i]));assert len(outerPolys)==2200 and len(innerPolys)==2200 and len(rimPolys)==140;assert len(outerSet)==len(innerSet)==1170 and not(set(outerSet)&set(innerSet));assert sorted(ids[outerSet])==list(range(1170)) and sorted(ids[innerSet])==list(range(1170))
    outBySource=np.array(sorted(outerSet,key=lambda i:ids[i]));inBySource=np.array(sorted(innerSet,key=lambda i:ids[i]));maxDelta=float(np.linalg.norm(Q[outBySource]-P,axis=1).max());outerExact=np.array_equal(Q[outBySource].astype(np.float32),P.astype(np.float32));assert outerExact,'Native outer surface was displaced';fixedDelta=float(np.linalg.norm(Q[outBySource[fixedAuthor]]-P[fixedAuthor],axis=1).max());assert all(np.array_equal(ids[np.array(polyfaces[i])],faces[j])for j,i in enumerate(outerPolys)),'Original outer face winding/order changed'
    # Native evaluated triangulation is measured as-is; do not rewrite diagonals to manufacture correspondence.
    me.calc_loop_triangles();tri=np.array([t.vertices[:]for t in me.loop_triangles]);triPoly=np.array([t.polygon_index for t in me.loop_triangles]);roles=[polyroles[i]for i in triPoly];normals=np.array([o.data.vertices[i].normal[:]for i in range(len(P))]);normals=to_three(normals);D=Q[inBySource]-Q[outBySource];distance=np.linalg.norm(D,axis=1);normalDistance=-np.sum(D*normals,axis=1)
    outTree=BVH(Q,tri[np.array(roles)=='outer']);nearest=[outTree.find_nearest(Vector(x))[3]for x in Q[inBySource]]
    edges=collections.Counter(tuple(sorted((int(a),int(b))))for f in polyfaces for a,b in zip(f,f[1:]+f[:1]));closed=all(v==2 for v in edges.values());assert closed,'Generated full lining/rim is not closed'
    tree=BVH(Q,tri);selfPairs=[(a,b)for a,b in tree.overlap(tree)if a<b and not(set(tri[a])&set(tri[b]))];contacts={name:tree.overlap(t)for name,t in colliderTrees.items()};outerOnly=BVH(P,faces);outerContacts={name:len(outerOnly.overlap(t))for name,t in colliderTrees.items()};outerSelf=[(a,b)for a,b in outerOnly.overlap(outerOnly)if a<b and not(set(faces[a])&set(faces[b]))]
    def region(ti):
        fixedN=sum(int(keep[ids[v]])in fixed for v in tri[ti]);return'fixed'if fixedN==3 else'mixed'if fixedN else'free'
    contactSummary={name:{'count':len(pairs),'roles':dict(collections.Counter(roles[a]for a,b in pairs)),'regions':dict(collections.Counter(region(a)for a,b in pairs))}for name,pairs in contacts.items()};selfSummary=dict(collections.Counter('|'.join(sorted([roles[a],roles[b]]))for a,b in selfPairs))
    polyHash=sha(json.dumps(polyfaces,separators=(',',':')).encode());triHash=sha(tri.astype('<i4').tobytes());topology=polyHash if topology is None else topology;nativeTriTopology=triHash if nativeTriTopology is None else nativeTriTopology
    uvNow=np.array([x.uv[:]for x in me.uv_layers['OriginalOuterUV'].data]);originalLoopIds=[v for i in outerPolys for v in me.polygons[i].loop_indices];uvError=float(np.abs(uvNow[originalLoopIds]-uv[rf[faceIds]].reshape(-1,2)).max())
    row={'frame':number,'sourceActionSeconds':saved['sourceActionSeconds'],'savedSimulationSeconds':saved['simulationSeconds'],'inputSHA256':sha(frameBytes),'counts':{'vertices':len(Q),'polygons':len(polyfaces),'triangles':len(tri),'outerFaces':len(outerPolys),'innerFaces':len(innerPolys),'rimQuads':len(rimPolys),'outerFixedOriginal120Retained':120,'outerFixedVerticesRetained':200},'outerExactlyPreservedAtNativeFloat32':outerExact,'outerMaximumDoubleToNativeFloat32ErrorMetres':maxDelta,'fixedMaximumDoubleToNativeFloat32ErrorMetres':fixedDelta,'outerUVMaxError':uvError,'closedAllEdgesIncidence2':closed,'polygonTopologySHA256':polyHash,'polygonTopologySameAsFrame1':polyHash==topology,'nativeTriangleTopologySHA256':triHash,'nativeTriangleTopologySameAsFrame1':triHash==nativeTriTopology,'pairedVertexThicknessMetres':{'min':float(distance.min()),'max':float(distance.max()),'mean':float(distance.mean())},'originalVertexNormalProjectionThicknessMetres':{'min':float(normalDistance.min()),'max':float(normalDistance.max())},'innerVertexNearestOuterTriangleDistanceMetres':{'min':float(min(nearest)),'max':float(max(nearest)),'limit':'Actual vertex→triangle samples; not global continuous surface distance.'},'unchangedOuterContacts':outerContacts,'unchangedOuterSelf':len(outerSelf),'fullGeneratedContacts':contactSummary,'fullGeneratedSelfPairs':len(selfPairs),'fullGeneratedSelfRoles':selfSummary,'staticGate':not any(contacts.values())and not selfPairs,'limits':['No collision mask, body/top deletion or source rest modification.','Old 10mm return is replaced by complete full-length inner and both closed boundary rims, not simply removed.','New inward fixed-band lining is a structural change; known sub0.8mm gap is intentionally not compensated.','This static test cannot approve dynamic outer cloth, sit/rise, arbitrary thickness or original garment equivalence.']};rows.append(row)
    payload={'frame':number,'positionsWorld':Q.tolist(),'triangles':tri.tolist(),'triangleRoles':roles,'polygonFaces':polyfaces,'polygonRoles':polyroles,'sourceAuthorVertex':ids.tolist(),'authorKeepOldSim':keep.tolist(),'contacts':contacts,'selfPairs':selfPairs};(OUT/f'frame-{number:02d}-generated.json.gz').write_bytes(gzip.compress(json.dumps(payload).encode(),mtime=0));ev.to_mesh_clear();o.hide_render=number!=1;o.hide_viewport=number!=1
    (OUT/'progress.json').write_text(json.dumps(row,indent=2),encoding='utf-8')
report={'status':'static-three-frame-geometry-clear-not-dynamic-approved'if all(r['staticGate']for r in rows)else'rejected-static-native-shell','Blender':bpy.app.version_string,'sourceSHA256':sha(raw),'config':config,'inputs':inputs,'originalAuthorOuter':{'vertices':1170,'faces':2200,'fixedVertices':200,'preservedSourceFixedFaces':120,'boundaryLoopLengths':[20,120]},'removedOldReturnOnlyForAlternative':{'vertices':120,'faces':240,'scope':'Original asset untouched. Alternative has complete new inner/rim, not an empty/hidden inner layer.'},'rows':rows,'seconds':time.monotonic()-start,'materials':'Source original outer material indices/UV retained; blend uses clearly labelled diagnostic colours, not an art replacement or production export.'}
(OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'native-solidify-three-static-frames.blend'),compress=True);print(json.dumps({'status':report['status'],'seconds':report['seconds'],'frames':[{'frame':r['frame'],'counts':r['counts'],'contacts':r['fullGeneratedContacts'],'self':r['fullGeneratedSelfPairs'],'thickness':r['pairedVertexThicknessMetres'],'polyStable':r['polygonTopologySameAsFrame1'],'triStable':r['nativeTriangleTopologySameAsFrame1']}for r in rows]}))
