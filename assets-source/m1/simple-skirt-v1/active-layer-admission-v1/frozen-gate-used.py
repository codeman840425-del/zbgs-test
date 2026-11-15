"""Independent exported-float32 full-face gate, fixed58394 private-palette replay.
Run with Blender Python. Does not run cloth or change controller/thresholds.
"""
from pathlib import Path
import ast,gzip,hashlib,json,struct,time
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'active-layer-admission-v1'
assert R.name=='m1-simple-skirt-worktree'and not(O/'geometry-gate.json').exists()
def reuse(path,names):
    tree=ast.parse(path.read_text(encoding='utf-8'))
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
def load(path):
    b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);buf=b[28+n:]
    def read(i):
        a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']]);w={'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16,'SCALAR':1}[a['type']]
        return np.ndarray((a['count'],w),dtype=dt,buffer=buf,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
    return b,d,read
reuse(R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py',['point_tri','seg_seg','near_minimum'])
candidate=O/'m1-sixfold-skirt-active-gap-v1.glb';raw,doc,read=load(candidate)
oldRaw,oldDoc,oldRead=load(S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb')
capture=json.loads(gzip.decompress((S/'private-layer-initial/capture.json.gz').read_bytes()))
primitives=doc['meshes'][0]['primitives'];counts=[len(read(p['attributes']['POSITION']))for p in primitives]
source=np.concatenate([read(p['attributes']['POSITION'])for p in primitives]);original=np.concatenate([oldRead(p['attributes']['POSITION'])for p in oldDoc['meshes'][0]['primitives']])
faces=np.concatenate([read(p['indices']).reshape(-1,3)+sum(counts[:i])for i,p in enumerate(primitives)])
js=np.concatenate([read(p['attributes']['JOINTS_0'])for p in primitives]);ws=np.concatenate([read(p['attributes']['WEIGHTS_0'])for p in primitives])
skin=doc['skins'][0];names=[doc['nodes'][i]['name']for i in skin['joints']];inverse=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
mat=lambda x:np.array(x).reshape(4,4).T
tree=lambda p,t:BVHTree.FromPolygons(np.asarray(p).tolist(),np.asarray(t).tolist(),all_triangles=True)
lookup={};weld=[]
for p in np.round(original,7):key=tuple(p);lookup.setdefault(key,len(lookup));weld.append(lookup[key])
wt=np.array(weld)[faces];rows=[];started=time.monotonic()
for frame in capture['frames']:
    world=np.array([mat(frame['bones'][n])for n in names])
    for c in frame['controls']:world[names.index(c['name'])]=mat(c['privateWorld'])
    palette=world@inverse;points=np.zeros((len(source),4));P=np.c_[source,np.ones(len(source))]
    for k in range(4):points+=np.einsum('nij,nj->ni',palette[js[:,k]],P)*ws[:,k,None]
    points=points[:,:3];ct=tree(points,faces);contacts=[]
    for mesh in frame['colliders']:
        q=np.array(mesh['positions']).reshape(-1,3);f=np.array(mesh['triangles']).reshape(-1,3);pairs=ct.overlap(tree(q,f));row={'name':mesh['name'],'count':len(pairs),'pairs':pairs}
        if frame['label']=='standing':
            row['wholeGarmentMinimum']=near_minimum(points[faces],q[f])
            row['activeDomainMinimum']=near_minimum(points[faces[260:]],q[f])
            if 'skirtFace'in row['activeDomainMinimum']:row['activeDomainMinimum']['skirtFace']+=260
            row['activeDomain2mmPass']=not any(a>=260 for a,b in pairs)and row['activeDomainMinimum'].get('distanceMetres',.003)>=.002
            row['wholeGarment2mmPass']=not pairs and row['wholeGarmentMinimum'].get('distanceMetres',.003)>=.002
        contacts.append(row)
    for box in frame['chair']:
        lo=box['min'];hi=box['max'];q=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(box['matrixWorld']).reshape(4,4);f=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]];pairs=ct.overlap(tree(q[:,:3],f));contacts.append({'name':box['name'],'count':len(pairs),'pairs':pairs,'chair':True})
    selfpairs=[(a,b)for a,b in ct.overlap(ct)if a<b and not(set(wt[a])&set(wt[b]))]
    rows.append({'label':frame['label'],'contacts':contacts,'selfCount':len(selfpairs),'selfPairs':selfpairs})
invariants=[]
for i,(p,old)in enumerate(zip(primitives,oldDoc['meshes'][0]['primitives'])):
    for key in ['JOINTS_0','WEIGHTS_0','TEXCOORD_0']:
        invariants.append({'primitive':i,'attribute':key,'exact':bool(np.array_equal(read(p['attributes'][key]),oldRead(old['attributes'][key])))})
    invariants.append({'primitive':i,'attribute':'indices','exact':bool(np.array_equal(read(p['indices']),oldRead(old['indices'])))})
invariants.extend([{'attribute':'waistAllPositions','exact':bool(np.array_equal(source[:counts[0]],original[:counts[0]]))},{'attribute':'seam20Positions','exact':bool(np.array_equal(source[counts[0]:counts[0]+20],original[counts[0]:counts[0]+20]))},{'attribute':'lower504plusPositions','exact':bool(np.array_equal(source[counts[0]+504:],original[counts[0]+504:]))}])
assert all(x['exact']for x in invariants)
edges=np.unique(np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1),axis=0)
edge=lambda p:np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)
area=lambda p:np.linalg.norm(np.cross(p[faces[:,1]]-p[faces[:,0]],p[faces[:,2]]-p[faces[:,0]]),axis=1)*.5
edgeRatio=edge(source)/edge(original);areaRatio=area(source)/area(original)
report={'status':'not-cloth-admitted','candidateSha256':hashlib.sha256(raw).hexdigest(),'parentSha256':hashlib.sha256(oldRaw).hexdigest(),'captureSha256':hashlib.sha256((S/'private-layer-initial/capture.json.gz').read_bytes()).hexdigest(),'basis':'58394 actual private helpers and frozen body/open-top/chair, exportedfloat32 LBS replay','seconds':time.monotonic()-started,'activeDomainFaces':[260,2419],'fixedAuthoredUpperFaces':[0,259],'rows':rows,'invariants':invariants,'sourceEdgeRatioMinMax':[float(edgeRatio.min()),float(edgeRatio.max())],'sourceTriangleAreaRatioMinMax':[float(areaRatio.min()),float(areaRatio.max())],'limits':['Region report is not a new global2mm pass. Whole upper waist remains included in all final contact gates.','No simulation or time-continuous closed-loop hand fit.','Independent hem repair not combined; existing self1 remains recorded.','Four poses are recorded motion samples, not authored sitting response.']}
(O/'geometry-gate.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(candidate));bpy.ops.wm.save_as_mainfile(filepath=str(O/'active-gap-v1.blend'))
bpy.ops.wm.open_mainfile(filepath=str(O/'active-gap-v1.blend'))
(O/'blend-readback.json').write_text(json.dumps({'blender':bpy.app.version_string,'meshObjects':[(o.name,len(o.data.vertices),len(o.data.polygons))for o in bpy.data.objects if o.type=='MESH'],'sha256':hashlib.sha256((O/'active-gap-v1.blend').read_bytes()).hexdigest(),'source':candidate.name},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'seconds':report['seconds'],'rows':[{'label':r['label'],'contacts':[(c['name'],c['count'],c.get('activeDomainMinimum'))for c in r['contacts']],'self':r['selfCount']}for r in rows],'edgeRatio':report['sourceEdgeRatioMinMax'],'areaRatio':report['sourceTriangleAreaRatioMinMax']},indent=2))
