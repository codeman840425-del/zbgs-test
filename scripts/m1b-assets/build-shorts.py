"""Deterministic knee-exposing male shorts; no body deletion or runtime edits.

Uses the existing exact-bind equipment exporter. The original source trousers
remain unchanged. Canonical editable input is shorts/spec.json + this script.
"""
import collections, hashlib, importlib.util, io, json, pathlib
import numpy as np
from PIL import Image

ROOT=pathlib.Path(__file__).resolve().parents[2]
s=importlib.util.spec_from_file_location('male_export', pathlib.Path(__file__).with_name('build.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
folder=ROOT/'assets-source/m1b/shorts';cfg=json.loads((folder/'spec.json').read_text())
assert cfg['compatibleAvatarSha256']==m.SPEC['roundtripSha256']
sourceSha=hashlib.sha256(m.raw).hexdigest()
prim=next(i for i,p in enumerate(m.src['meshes'][m.body_mesh]['primitives']) if '_Bottoms_' in m.src['materials'][p['material']]['name'])
a,tri=m.arrays(prim)

def world(i):
    n=m.src['nodes'][i];v=np.eye(4)
    assert 'rotation' not in n or np.allclose(n['rotation'],[0,0,0,1]), 'Male source rest must retain identity rotation'
    assert 'matrix' not in n
    v[:3,3]=n.get('translation',[0,0,0]);v[:3,:3]*=np.array(n.get('scale',[1,1,1]))[None,:]
    return world(m.parents[i])@v if i in m.parents else v
knees=[world(i)[:3,3] for i,n in enumerate(m.src['nodes']) if n.get('name') in ['J_Bip_L_LowerLeg','J_Bip_R_LowerLeg']]
assert len(knees)==2
hem=float(max(p[1] for p in knees)+cfg['hemAboveKneeMeters'])
vertices=[];faces=[];cache={};maxDiscard=0.
def original(i):return {k:v[i].astype(float).copy() for k,v in a.items()}
def blend(i,j,f):
    global maxDiscard
    v={k:a[k][i]*(1-f)+a[k][j]*f for k in a if k not in ['JOINTS_0','WEIGHTS_0']}
    weights=collections.defaultdict(float)
    for p,alpha in [(i,1-f),(j,f)]:
        for joint,w in zip(a['JOINTS_0'][p],a['WEIGHTS_0'][p]):weights[int(joint)]+=float(w)*alpha
    values=sorted(weights.items(),key=lambda x:(-x[1],x[0]));maxDiscard=max(maxDiscard,sum(w for _,w in values[4:]));values=values[:4]
    values += [(0,0.)]*(4-len(values));v['JOINTS_0']=np.array([j for j,w in values]);v['WEIGHTS_0']=np.array([w for j,w in values]);v['WEIGHTS_0']/=v['WEIGHTS_0'].sum()
    v['NORMAL']/=max(np.linalg.norm(v['NORMAL']),1e-12);v['POSITION'][1]=hem
    return v
def vertex(key,value):
    if key not in cache:cache[key]=len(vertices);vertices.append(value)
    return cache[key]
for t in tri:
    poly=[]
    for i,j in zip(t,np.roll(t,-1)):
        i,j=int(i),int(j);yi,yj=a['POSITION'][i,1],a['POSITION'][j,1]
        if yi>=hem:poly.append(vertex(('v',i),original(i)))
        if (yi<hem)!=(yj<hem):
            lo,hi=sorted([i,j]);f=(hem-a['POSITION'][lo,1])/(a['POSITION'][hi,1]-a['POSITION'][lo,1]);poly.append(vertex(('e',lo,hi),blend(lo,hi,f)))
    for k in range(1,len(poly)-1):faces.append([poly[0],poly[k],poly[k+1]])
attrs={k:np.array([v[k]for v in vertices],dtype=np.uint16 if k=='JOINTS_0'else np.float32)for k in a};faces=np.array(faces,dtype=np.uint32)
assert maxDiscard<1e-5, 'Do not silently lose significant interpolation influences'
# Real open leg hems: retain the leg opening and add an inward/upward cloth facing.
edges=collections.Counter(tuple(sorted((int(x),int(y))))for t in faces for x,y in zip(t,np.roll(t,-1)))
hemEdges=[e for e,count in edges.items() if count==1 and all(abs(float(attrs['POSITION'][i,1])-hem)<1e-6 for i in e)]
assert len(hemEdges)>20
centers={sign:np.mean([attrs['POSITION'][i] for e in hemEdges for i in e if np.sign(attrs['POSITION'][i,0])==sign],axis=0)for sign in [-1,1]}
rim=[];rimFaces=[]
for i,j in hemEdges:
    # Separate quads retain hard cloth-edge normals, original binding and UV.
    outer=[{k:v[idx].copy()for k,v in attrs.items()}for idx in [i,j]]
    inner=[]
    for v in outer:
        x={k:value.copy()for k,value in v.items()};direction=x['POSITION']-centers[int(np.sign(x['POSITION'][0]))];direction[1]=0;direction/=np.linalg.norm(direction)
        x['POSITION']-=direction*cfg['hemThicknessMeters'];x['POSITION'][1]+=cfg['innerFacingHeightMeters'];inner.append(x)
    quad=[outer[0],outer[1],inner[1],inner[0]];offset=len(rim);rim.extend(quad);rimFaces.extend([[offset,offset+1,offset+2],[offset,offset+2,offset+3]])
rimAttrs={k:np.array([v[k]for v in rim],dtype=np.uint16 if k=='JOINTS_0'else np.float32)for k in a}
rimMaterial={'name':'M1B_Shorts_InnerFacing','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.055,.063,.08,1],'roughnessFactor':1,'metallicFactor':0},'extensions':{'KHR_materials_unlit':{}}}
entry=m.export(cfg['id'],'男性露膝独立短裤','bottom',[(attrs,faces,m.src['meshes'][m.body_mesh]['primitives'][prim]['material']),(rimAttrs,np.array(rimFaces),rimMaterial)],'Original male trousers clipped at measured knee height + 80mm; UV/weights retained and interpolated; new physical inward hem facing; intact body')
entry.update(styleId=cfg['styleId'],fitId=cfg['fitId'],limits=cfg['limits'],sourceSpec='assets-source/m1b/shorts/spec.json')
manifestPath=m.OUT/'equipment.json';manifest=json.loads(manifestPath.read_text(encoding='utf8'));manifest['items']=[e for e in manifest['items']if e['id']!=entry['id']]+[entry];manifestPath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
# Audit actual body indices and alpha in the exposed knee/lower-leg band.
bp=next(p for p in m.src['meshes'][m.body_mesh]['primitives'] if '_Body_'in m.src['materials'][p['material']]['name']);pos=m.read(bp['attributes']['POSITION']);bt=m.read(bp['indices']).reshape(-1,3);uv=m.read(bp['attributes']['TEXCOORD_0']);mat=m.src['materials'][bp['material']]
image=m.src['images'][m.src['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];bv=m.src['bufferViews'][image['bufferView']];im=np.array(Image.open(io.BytesIO(m.binary[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGBA'))
selected=bt[np.all((pos[bt,1]>.15)&(pos[bt,1]<hem),axis=1)];bary=np.array([[1,0,0],[0,1,0],[0,0,1],[1/3]*3,[.5,.5,0],[0,.5,.5],[.5,0,.5]])
samples=np.einsum('bi,tij->tbj',bary,uv[selected]).reshape(-1,2);xy=np.floor((samples%1)*[im.shape[1],im.shape[0]]).astype(int);alpha=im[xy[:,1],xy[:,0],3]
bodyAudit={'bodySkinTriangles':len(bt),'exposedBandFullyContainedTriangles':len(selected),'alphaSamples':len(alpha),'alphaMinimum':int(alpha.min()),'samplesBelowMaskCutoff':int((alpha<float(mat.get('alphaCutoff',.5))*255).sum()),'materialAlphaMode':mat.get('alphaMode','OPAQUE'),'meaning':'Actual source body indexed triangles plus seven UV alpha samples per exposed-band triangle. This establishes existing visible skin data, not final runtime visibility or full texture coverage.'}
report={'sourceAvatarSha256':sourceSha,'styleId':cfg['styleId'],'fitId':cfg['fitId'],'kneesWorld':np.array(knees).tolist(),'hemWorldY':hem,'kneeClearanceMeters':[hem-float(k[1])for k in knees],'sourceTriangles':len(tri),'outerTriangles':len(faces),'hemFacingTriangles':len(rimFaces),'hemEdges':len(hemEdges),'maximumDiscardedWeight':maxDiscard,'garment':{k:v for k,v in entry.items()if k not in ['bindings','sourceLicense']},'bodyAudit':bodyAudit,'bodyUnchanged':hashlib.sha256((ROOT/m.SPEC['roundtrip']).read_bytes()).hexdigest()==sourceSha}
(folder/'build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({k:report[k]for k in ['hemWorldY','kneeClearanceMeters','outerTriangles','hemFacingTriangles','bodyAudit','bodyUnchanged']},ensure_ascii=False,indent=2))
