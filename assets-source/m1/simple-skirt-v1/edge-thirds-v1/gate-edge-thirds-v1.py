"""Actual four-pose full gate with explicit old-face lineage, not index inheritance."""
from pathlib import Path
import ast,gzip,hashlib,json,struct,time
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'edge-thirds-v1';assert not(O/'geometry-gate.json').exists()
helper=R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py';parsed=ast.parse(helper.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in parsed.body if isinstance(n,ast.FunctionDef)and n.name=='load'],type_ignores=[]),str(helper),'exec'),globals())
pure=R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py';parsed=ast.parse(pure.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in parsed.body if isinstance(n,ast.FunctionDef)and n.name in ['point_tri','seg_seg','near_minimum']],type_ignores=[]),str(pure),'exec'),globals())
asset=O/'m1-sixfold-skirt-edge-thirds-v1.glb';raw,doc,read=load(asset);oldRaw,oldDoc,oldRead=load(S/'active-gap-hem-v1/m1-sixfold-skirt-active-gap-hem-v1.glb');lineage=json.loads((O/'face-lineage.json').read_text(encoding='utf-8'));origin=np.array(lineage['oldFaceForNewFace']);primitives=doc['meshes'][0]['primitives'];counts=[len(read(p['attributes']['POSITION']))for p in primitives];pointsSource=np.concatenate([read(p['attributes']['POSITION'])for p in primitives]);faces=np.concatenate([read(p['indices']).reshape(-1,3)+sum(counts[:i])for i,p in enumerate(primitives)]);js=np.concatenate([read(p['attributes']['JOINTS_0'])for p in primitives]);ws=np.concatenate([read(p['attributes']['WEIGHTS_0'])for p in primitives]);skin=doc['skins'][0];names=[doc['nodes'][i]['name']for i in skin['joints']];inverse=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
for i,p in enumerate(primitives):
    old=oldDoc['meshes'][0]['primitives'][i];n=len(oldRead(old['attributes']['POSITION']))
    for key in old['attributes']:assert np.array_equal(read(p['attributes'][key])[:n],oldRead(old['attributes'][key]))
assert doc['skins']==oldDoc['skins']and doc['materials']==oldDoc['materials']
oldFaces=np.concatenate([oldRead(p['indices']).reshape(-1,3)+sum([len(oldRead(q['attributes']['POSITION']))for q in oldDoc['meshes'][0]['primitives'][:i]])for i,p in enumerate(oldDoc['meshes'][0]['primitives'])]);unchanged=~np.isin(origin,[770,773]);assert np.array_equal(faces[unchanged],oldFaces[origin[unchanged]])
lookup={};weld=[]
for p in np.round(pointsSource,7):key=tuple(p);lookup.setdefault(key,len(lookup));weld.append(lookup[key])
weld=np.array(weld);wf=weld[faces];edgeCounts={}
for f in wf:
    assert len(set(f))==3
    for a,b in zip(f,np.roll(f,-1)):
        edge=tuple(sorted([int(a),int(b)]));edgeCounts[edge]=edgeCounts.get(edge,0)+1
assert max(edgeCounts.values())==2
tree=lambda p,f:BVHTree.FromPolygons(np.asarray(p).tolist(),np.asarray(f).tolist(),all_triangles=True)
capture=json.loads(gzip.decompress((S/'private-layer-initial/capture.json.gz').read_bytes()));mat=lambda a:np.array(a).reshape(4,4).T;active=np.flatnonzero(origin>=260);rows=[];started=time.monotonic()
for frame in capture['frames']:
    world=np.array([mat(frame['bones'][n])for n in names])
    for c in frame['controls']:world[names.index(c['name'])]=mat(c['privateWorld'])
    palette=world@inverse;P=np.c_[pointsSource,np.ones(len(pointsSource))];p=sum(np.einsum('nij,nj->ni',palette[js[:,k]],P)*ws[:,k,None]for k in range(4))[:,:3];ct=tree(p,faces);contacts=[]
    for m in frame['colliders']:
        q=np.array(m['positions']).reshape(-1,3);f=np.array(m['triangles']).reshape(-1,3);pairs=ct.overlap(tree(q,f));row={'name':m['name'],'count':len(pairs),'pairs':pairs,'parentFacePairs':[(int(origin[a]),b)for a,b in pairs]}
        if frame['label']=='standing':
            row['wholeGarmentMinimum']=near_minimum(p[faces],q[f]);row['activeDomainMinimum']=near_minimum(p[faces[active]],q[f])
            if'skirtFace'in row['activeDomainMinimum']:
                fi=int(active[row['activeDomainMinimum']['skirtFace']]);row['activeDomainMinimum'].update(skirtFace=fi,parentFace=int(origin[fi]))
            row['activeDomain2mmPass']=not any(origin[a]>=260 for a,b in pairs)and row['activeDomainMinimum'].get('distanceMetres',.003)>=.002
            row['wholeGarment2mmPass']=not pairs and row['wholeGarmentMinimum'].get('distanceMetres',.003)>=.002
        contacts.append(row)
    for box in frame['chair']:
        lo=box['min'];hi=box['max'];q=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(box['matrixWorld']).reshape(4,4);f=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]];pairs=ct.overlap(tree(q[:,:3],f));contacts.append({'name':box['name'],'chair':True,'count':len(pairs),'pairs':pairs,'parentFacePairs':[(int(origin[a]),b)for a,b in pairs]})
    selfPairs=[(a,b)for a,b in ct.overlap(ct)if a<b and not(set(wf[a])&set(wf[b]))];rows.append({'label':frame['label'],'contacts':contacts,'selfCount':len(selfPairs),'selfPairs':selfPairs})
report={'status':'source-diagnostic-not-cloth-admitted','candidateSha256':hashlib.sha256(raw).hexdigest(),'parentSha256':hashlib.sha256(oldRaw).hexdigest(),'basis':'Exact58394 private-palette4pose replay, actual refined render triangles, original body/open-top/chair','seconds':time.monotonic()-started,'rows':rows,'allExistingAttributesExact':True,'activeDomain':'Explicit parentFace>=260 using face-lineage, not shifted index assumption','maximumEdgeIncidence':max(edgeCounts.values()),'sourceWeldedVertices':len(lookup),'limits':['Full garment fixed zipper2mm gap still fails.','New sitting response not authored. Recorded body/hand remains old capture; future hand closure unverified.','Static and4pose gates do not certify native solver or visible benefit.']}
(O/'geometry-gate.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(asset));bpy.ops.wm.save_as_mainfile(filepath=str(O/'edge-thirds-v1.blend'));bpy.ops.wm.open_mainfile(filepath=str(O/'edge-thirds-v1.blend'));(O/'blend-readback.json').write_text(json.dumps({'meshObjects':[(o.name,len(o.data.vertices),len(o.data.polygons))for o in bpy.data.objects if o.type=='MESH'],'sha256':hashlib.sha256((O/'edge-thirds-v1.blend').read_bytes()).hexdigest()},indent=2)+'\n',encoding='utf-8');print(json.dumps({'rows':[{'label':r['label'],'counts':[(c['name'],c['count'],c.get('activeDomainMinimum'))for c in r['contacts']],'self':r['selfCount']}for r in rows],'seconds':report['seconds']},indent=2))
