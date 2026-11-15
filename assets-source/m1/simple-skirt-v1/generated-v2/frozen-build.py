"""Build one independent editable six-fold skirt; never writes shared runtime.
Use --out <fresh directory within this isolated checkout>. No cloth or pose claims.
"""
from pathlib import Path
import argparse, copy, hashlib, json, math, struct
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'assets-source/m1/simple-skirt-v1'
cfg = json.loads((SOURCE / 'parameters.json').read_text(encoding='utf-8'))
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
parser.add_argument('--spec', default='parameters.json')
args = parser.parse_args()
SPEC=(SOURCE/args.spec).resolve();assert SPEC.parent==SOURCE
cfg=json.loads(SPEC.read_text(encoding='utf-8'))
OUT = (ROOT / args.out).resolve()
assert ROOT.name == 'm1-simple-skirt-worktree', 'Only the authorized isolated checkout'
assert OUT.is_relative_to(ROOT) and not OUT.exists(), 'Use fresh isolated output'
raw = (ROOT / cfg['reference']).read_bytes()
assert hashlib.sha256(raw).hexdigest() == cfg['referenceSha256']
size = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+size]); binary = bytearray(raw[28+size:])
types = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def read(index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    dtype=np.dtype(types[a['componentType']]);w=widths[a['type']]
    return np.ndarray((a['count'],w),dtype=dtype,buffer=binary,
        offset=v.get('byteOffset',0)+a.get('byteOffset',0),
        strides=(v.get('byteStride',w*dtype.itemsize),dtype.itemsize)).copy()

p0=doc['meshes'][0]['primitives'][0]
original=read(p0['attributes']['POSITION']).astype(float)
faces0=read(p0['indices']).reshape(-1,3)
nodes=doc['nodes'];skin=doc['skins'][0]
parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}

def matrix(index):
    n=nodes[index]
    if 'matrix' in n: local=np.array(n['matrix']).reshape(4,4).T
    else:
        x,y,z,w=n.get('rotation',[0,0,0,1]);local=np.eye(4)
        local[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],
            [2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],
            [2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])@np.diag(n.get('scale',[1,1,1]))
        local[:3,3]=n.get('translation',[0,0,0])
    return matrix(parents[index])@local if index in parents else local

# Weld only to discover the existing real hole, never invent a waist cap.
keys={};weld=[];render_map=[]
for p in original:
    key=tuple(np.round(p,7))
    if key not in keys: keys[key]=len(weld);weld.append(p)
    render_map.append(keys[key])
weld=np.array(weld);wf=np.array(render_map)[faces0];edge_counts={}
for tri in wf:
    for a,b in zip(tri,np.roll(tri,-1)):
        key=tuple(sorted((int(a),int(b))));edge_counts[key]=edge_counts.get(key,0)+1
boundary=[e for e,count in edge_counts.items() if count==1]
remaining=set(i for e in boundary for i in e);components=[]
while remaining:
    comp=set();todo=[next(iter(remaining))]
    while todo:
        i=todo.pop()
        if i in comp:continue
        comp.add(i);remaining.discard(i)
        for a,b in boundary:
            if i==a and b not in comp:todo.append(b)
            if i==b and a not in comp:todo.append(a)
    components.append(sorted(comp))
waist=weld[max(components,key=lambda c:weld[c,1].mean())]
hem_boundary=weld[min(components,key=lambda c:weld[c,1].mean())]
assert len(waist)==20
center=waist[:,[0,2]].mean(0)
angles=np.mod(np.arctan2(waist[:,2]-center[1],waist[:,0]-center[0]),2*np.pi)
waist=waist[np.argsort(angles)];angles=np.sort(angles)
hem=float(original[:,1].min());N=cfg['segments'];rows=cfg['rows'];theta=np.arange(N+1)/N*2*np.pi
waist_grid=np.stack([np.interp(theta,np.r_[angles[-1]-2*np.pi,angles,angles[0]+2*np.pi],np.r_[waist[-1,k],waist[:,k],waist[0,k]])for k in range(3)],axis=1)
triangles0=original[faces0]
corrected=cfg.get('sectionMethod')=='complete-normalized-annulus-per-section-center'
def circular(values,points,query):
    order=np.argsort(values);values=values[order];points=points[order]
    return np.interp(query,np.r_[values[-1]-2*np.pi,values,values[0]+2*np.pi],np.r_[points[-1],points,points[0]])
hem_angles=np.mod(np.arctan2(hem_boundary[:,2]-center[1],hem_boundary[:,0]-center[0]),2*np.pi)
hem_grid_y=circular(hem_angles,hem_boundary[:,1],theta)
point_angles=np.mod(np.arctan2(original[:,2]-center[1],original[:,0]-center[0]),2*np.pi)
waist_y=circular(angles,waist[:,1],point_angles);hem_y=circular(hem_angles,hem_boundary[:,1],point_angles)
source_fraction=np.clip((waist_y-original[:,1])/np.maximum(waist_y-hem_y,1e-6),0,1)
section_records=[]
def closed_section(t):
    if t==0:q=waist.copy()
    elif t==1:q=hem_boundary.copy()
    else:
        cuts=[];values=source_fraction[faces0]
        for a,b in [(0,1),(1,2),(2,0)]:
            va,vb=values[:,a],values[:,b];mask=((va<=t)&(vb>t))|((vb<=t)&(va>t));p=triangles0[mask,a];r=triangles0[mask,b]
            cuts.extend(p+(r-p)*((t-va[mask])/(vb[mask]-va[mask]))[:,None])
        q=np.asarray(cuts)
    assert len(q)>=20,'Refuse incomplete source section'
    origin=(q[:,[0,2]].min(0)+q[:,[0,2]].max(0))*.5
    v=q[:,[0,2]]-origin;ang=np.sort(np.mod(np.arctan2(v[:,1],v[:,0]),2*np.pi));max_gap=float(np.diff(np.r_[ang,ang[0]+2*np.pi]).max())
    assert max_gap<np.pi/2,'Refuse an unobserved quarter-circle; no ellipse extrapolation'
    coefficient=np.linalg.lstsq(v*v,np.ones(len(v)),rcond=None)[0];assert np.all(coefficient>0)
    axes=1/np.sqrt(coefficient);section_records.append({'fraction':t,'points':len(q),'centerXZ':origin.tolist(),'maximumAngularGapRadians':max_gap,'axes':axes.tolist()})
    return origin,axes


def ellipse(y):
    cuts=[]
    for a,b in [(0,1),(1,2),(2,0)]:
        p=triangles0[:,a];q=triangles0[:,b];mask=((p[:,1]<=y)&(q[:,1]>y))|((q[:,1]<=y)&(p[:,1]>y))
        p=p[mask];q=q[mask]
        if len(p):cuts.extend(p+(q-p)*((y-p[:,1])/(q[:,1]-p[:,1]))[:,None])
    if len(cuts)<10:cuts=waist
    cuts=np.asarray(cuts);v=cuts[:,[0,2]]-center
    # Fit broad original silhouette, without sampling its tiny pleat zigzags.
    coefficient=np.linalg.lstsq(v*v,np.ones(len(v)),rcond=None)[0]
    assert np.all(coefficient>0), 'Reference section is not elliptical'
    axes=1/np.sqrt(coefficient)
    return axes

hips=next(i for i,n in enumerate(skin['joints']) if nodes[n]['name']=='J_Bip_C_Hips')
sectors=[]
for i,n in enumerate(skin['joints']):
    if 'Skirt' in nodes[n]['name']:
        q=matrix(n)[:3,3];sectors.append((math.atan2(q[2]-center[1],q[0]-center[0])%(2*math.pi),i))
sectors.sort();assert len(sectors)==6

def weight(t,angle):
    values=np.array([x[0]for x in sectors]);end=int(np.searchsorted(values,angle))%6;start=(end-1)%6
    lo=values[start];hi=values[end]
    if hi<=lo:hi+=2*np.pi
    a=angle+(2*np.pi if angle<lo else 0);mix=(a-lo)/(hi-lo)
    total=cfg['maximumHelperWeight']*t*t*(3-2*t)
    return [hips,sectors[start][1],sectors[end][1],0],[1-total,total*(1-mix),total*mix,0]

positions=[];uv=[];joints=[];weights=[]
for t in rows:
    y=waist_grid[:,1]*(1-t)+(hem_grid_y if corrected else hem)*t
    origin,axes=closed_section(t) if corrected else (center,ellipse(float(y.mean())))
    broad=np.stack([origin[0]+axes[0]*np.cos(theta),y,origin[1]+axes[1]*np.sin(theta)],axis=1)
    blend=min(1,t/.19);blend=blend*blend*(3-2*blend)
    p=waist_grid.copy();p[:,1]=y;p[:,[0,2]]=(1-blend)*waist_grid[:,[0,2]]+blend*broad[:,[0,2]]
    dr=(cfg['sideEaseMetres']*blend+cfg['hemFoldDepthMetres']*t*t*(.5+.5*np.cos(cfg['foldCount']*theta)))
    p[:,0]+=dr*np.cos(theta);p[:,2]+=dr*np.sin(theta)
    for i,q in enumerate(p):
        js,ws=weight(t,theta[i]%(2*np.pi));positions.append(q);uv.append([i/N,1-t]);joints.append(js);weights.append(ws)
# Real turned hem strip; no polygon fan crossing the legs or waist.
outer=np.array(positions[-(N+1):]);inner=outer.copy();inner[:,0]-=cfg['liningInsetMetres']*np.cos(theta);inner[:,2]-=cfg['liningInsetMetres']*np.sin(theta);inner[:,1]+=cfg['hemReturnMetres']
for i,p in enumerate(inner):
    js,ws=weight(1,theta[i]%(2*np.pi));positions.append(p);uv.append([i/N,.03]);joints.append(js);weights.append(ws)
indices=[]
for row in range(len(rows)):
    for i in range(N):
        a=row*(N+1)+i;b=a+1;c=a+N+1;d=c+1
        indices.extend([[a,b,d],[a,d,c]])
p=np.array(positions);f=np.array(indices,dtype=np.uint32);normals=np.zeros_like(p)
face_norm=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
for k in range(3):np.add.at(normals,f[:,k],face_norm)
normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-20)

def write(a,component,kind):
    a=np.asarray(a,dtype=types[component]);binary.extend(b'\0'*(-len(binary)%4));off=len(binary);binary.extend(a.tobytes());vi=len(doc['bufferViews'])
    doc['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':a.nbytes})
    entry={'bufferView':vi,'componentType':component,'count':len(a),'type':kind}
    if kind=='VEC3':entry.update(min=a.min(0).tolist(),max=a.max(0).tolist())
    index=len(doc['accessors']);doc['accessors'].append(entry);return index

attrs={k:write(a,c,kind)for k,a,c,kind in [('POSITION',p,5126,'VEC3'),('NORMAL',normals,5126,'VEC3'),('TEXCOORD_0',uv,5126,'VEC2'),('JOINTS_0',joints,5123,'VEC4'),('WEIGHTS_0',weights,5126,'VEC4')]}
doc['meshes']=[{'name':cfg['id'],'primitives':[{'attributes':attrs,'indices':write(f.reshape(-1,1),5125,'SCALAR'),'material':0}]}]
doc['materials']=[{'name':'Sixfold_Navy_Cloth','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':cfg['color'],'metallicFactor':0,'roughnessFactor':.95}}]
doc.pop('extensionsUsed',None);doc.pop('extensionsRequired',None)
for node in doc['nodes']:
    if 'mesh'in node:node['name']=cfg['id']
doc['buffers']=[{'byteLength':len(binary)}]
doc['extras']={'sourceSha256':cfg['bodySha256'],'method':'Independent six-fold authoring surface; new authored weights; original skeleton inverse binds','fitId':cfg['fitId'],'parametersSha256':hashlib.sha256(SPEC.read_bytes()).hexdigest()}
jb=json.dumps(doc,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary+=b'\0'*(-len(binary)%4)
out=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary
OUT.mkdir(parents=True);(OUT/(cfg['id']+'.glb')).write_bytes(out)
report={'status':'generated-source-only-no-contact-or-visual-acceptance','id':cfg['id'],'sha256':hashlib.sha256(out).hexdigest(),'bytes':len(out),'vertices':len(p),'triangles':len(f),'bounds':[p.min(0).tolist(),p.max(0).tolist()],'boneNames':[nodes[n]['name']for n in skin['joints']],'maxWeightSumError':float(abs(np.array(weights).sum(1)-1).max()),'sourceWaistVertices':20,'generatedWaistVertices':N,'hemReturn':True,'bodyUnchanged':True,'legacyGuide':False,'parameters':cfg,'sectionRecords':section_records}
(OUT/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
manifest=json.loads((ROOT/'prototype/public/assets/m1/equipment.json').read_text(encoding='utf-8'))
entry=copy.deepcopy(next(x for x in manifest['items']if x['id']=='m1-uniform-skirt'))
entry.update(id=cfg['id'],name='六宽褶裙技术候选（未验收）',fitId=cfg['fitId'],url=cfg['id']+'.glb',sha256=report['sha256'],bytes=len(out),method=doc['extras']['method'],limits=cfg['limits'],stats={'vertices':len(p),'triangles':len(f),'multiBoneVertices':sum(np.count_nonzero(w)>1 for w in weights),'joints':len(skin['joints'])})
entry['stats']['multiBoneVertices']=int(entry['stats']['multiBoneVertices'])
(OUT/'equipment-entry.json').write_text(json.dumps(entry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['parameters','boneNames']},indent=2))
