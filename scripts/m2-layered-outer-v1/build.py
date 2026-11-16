"""One reproducible skinned outer-vest pattern; no public or original writes."""
from pathlib import Path
import argparse, collections, hashlib, importlib.util, json
import numpy as np

ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-layered-outer-v1'
ap=argparse.ArgumentParser();ap.add_argument('--out',default='generated');args=ap.parse_args()
OUT=(BASE/args.out).resolve();assert OUT.is_relative_to(BASE) and OUT!=BASE and not OUT.exists()
S=json.loads((BASE/'spec.json').read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(ROOT/S['parentTop'])==S['parentTopSha256']
spec=importlib.util.spec_from_file_location('male_export',ROOT/'scripts/m1b-assets/build.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert m.SPEC['roundtripSha256']==S['bodySha256']
primitive=next(i for i,p in enumerate(m.src['meshes'][m.body_mesh]['primitives'])if '_Tops_'in m.src['materials'][p['material']]['name'])
a,tri=m.arrays(primitive);boneCount=len(m.skin['joints']);dense=np.zeros((len(a['POSITION']),boneCount))
for k in range(4):np.add.at(dense,(np.arange(len(dense)),a['JOINTS_0'][:,k].astype(int)),a['WEIGHTS_0'][:,k])
data=np.concatenate([a['POSITION'],a['NORMAL'],a['TEXCOORD_0'],dense],axis=1).astype(float)
cx=float((a['POSITION'][:,0].min()+a['POSITION'][:,0].max())/2)

def clip(poly,plane):
    if not poly:return []
    result=[];p=poly[-1];d=plane(p)
    for q in poly:
        e=plane(q)
        if (d>=-1e-12)!=(e>=-1e-12):result.append(p+(q-p)*(d/(d-e)))
        if e>=-1e-12:result.append(q)
        p,d=q,e
    return result

vertices=[];faces=[];lookup={};lineage=[]
def add(p):
    key=tuple(np.round(p,8))
    if key not in lookup:lookup[key]=len(vertices);vertices.append(p)
    return lookup[key]

for faceId,t in enumerate(tri):
 for sign in [-1,1]:
  for front in [False,True]:
   for upper in [False,True]:
    for vneck in [False,True]:
     p=[data[i].copy()for i in t]
     planes=[lambda q,sign=sign:sign*(q[0]-cx),lambda q:q[1]-S['hemY'],
             lambda q,sign=sign:S['neckBaseY']+S['neckSlope']*sign*(q[0]-cx)-q[1],
             lambda q,front=front:(-1 if front else 1)*(q[2]-S['frontSplitZ']),
             lambda q,upper=upper:(1 if upper else -1)*(q[1]-S['armholeStartY']),
             lambda q,vneck=vneck:(1 if vneck else -1)*(q[1]-S['vStartY'])]
     if upper:planes.append(lambda q,sign=sign:S['armholeHalfWidth']+S['armholeSlope']*(q[1]-S['armholeStartY'])-sign*(q[0]-cx))
     if front:planes.append(lambda q,sign=sign,vneck=vneck:sign*(q[0]-cx)-S['openingHalfWidth']-(S['vSlope']*(q[1]-S['vStartY'])if vneck else 0))
     for plane in planes:p=clip(p,plane)
     for k in range(1,len(p)-1):
      pts=[p[0],p[k],p[k+1]]
      if np.linalg.norm(np.cross(pts[1][:3]-pts[0][:3],pts[2][:3]-pts[0][:3]))<1e-12:continue
      faces.append([add(q)for q in pts]);lineage.append(faceId)

v=np.array(vertices);t=np.array(faces,dtype=np.uint32);norm=v[:,3:6];norm/=np.linalg.norm(norm,axis=1)[:,None]
outer=v[:,:3]+norm*S['outerOffsetM'];inner=outer-norm*S['thicknessM']
weights=v[:,8:];joints=np.argsort(-weights,axis=1,kind='stable')[:,:4];w=np.take_along_axis(weights,joints,axis=1);lost=1-w.sum(1);w/=w.sum(1)[:,None]
# Geometric UV seams are not garment edges. Pair by rest position + skin weights.
weld={};ids=[]
for row in v:
 key=tuple(np.round(np.r_[row[:3],row[8:]],7));weld.setdefault(key,len(weld));ids.append(weld[key])
edges=collections.defaultdict(list)
for f in t:
 for x,y in zip(f,np.roll(f,-1)):edges[tuple(sorted((ids[x],ids[y])))].append((int(x),int(y)))
bad=[e for e,l in edges.items()if len(l)>2];assert not bad,('Nonmanifold clipped source',bad[:5])
boundary=[l[0]for l in edges.values()if len(l)==1];n=len(v)
rim=np.array([[x,y,y+n]for x,y in boundary]+[[x,y+n,x+n]for x,y in boundary],dtype=np.uint32)
positions=np.vstack([outer,inner]);alltri=np.vstack([t,t[:,::-1]+n,rim])
# Area-weighted normals on the actual finite-thickness output; no authored top normals claim.
N=np.zeros_like(positions)
cross=np.cross(positions[alltri[:,1]]-positions[alltri[:,0]],positions[alltri[:,2]]-positions[alltri[:,0]])
for k in range(3):np.add.at(N,alltri[:,k],cross)
length=np.linalg.norm(N,axis=1);assert np.all(length>1e-12);N/=length[:,None]
attrs={'POSITION':positions.astype('<f4'),'NORMAL':N.astype('<f4'),'TEXCOORD_0':np.vstack([v[:,6:8],v[:,6:8]]).astype('<f4'),
       'JOINTS_0':np.vstack([joints,joints]).astype('<u2'),'WEIGHTS_0':np.vstack([w,w]).astype('<f4')}
OUT.mkdir(parents=True);m.OUT=OUT
material={'name':'M2_OpenVest_Navy','doubleSided':False,'pbrMetallicRoughness':{'baseColorFactor':S['color'],'metallicFactor':0,'roughnessFactor':.9},'extensions':{'KHR_materials_unlit':{}}}
entry=m.export(S['id'],'男性短款开襟无袖马甲（技术样件）','outerwear',[(attrs,alltri,material)],S['method'])
entry.update(styleId=S['styleId'],fitId=S['fitId'],version=1,layerWith=S['layerWith'],allowedBottoms=S['allowedBottoms'],
             limits=['Original male only; no automatic jaw/body morph compatibility.','Static source/layer geometry checked separately; actual motion and visual readback pending.','No cloth dynamics or coverage/body hiding.'])
(OUT/'equipment-entry.json').write_text(json.dumps(entry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'equipment.json').write_text(json.dumps({'schema':'zbgs-equipment-v1','items':[entry]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report={'specSha256':sha(BASE/'spec.json'),'generatorSha256':sha(Path(__file__)),'parentTopSha256':S['parentTopSha256'],'bodySha256':S['bodySha256'],
        'sourcePrimitive':primitive,'sourceVertices':len(data),'sourceTriangles':len(tri),'retainedSourceFaces':len(set(lineage)),
        'outerVertices':n,'outerTriangles':len(t),'rimEdges':len(boundary),'totalTriangles':len(alltri),'totalVertices':len(positions),
        'weightTruncationMax':float(max(0,lost.max())),'multiBoneVertices':int(np.count_nonzero((w>.001).sum(1)>1)),
        'bounds':[positions.min(0).tolist(),positions.max(0).tolist()],'assetSha256':entry['sha256'],'skinBones':[b['sourceBone']for b in entry['bindings']],
        'sourceNormalOffsetM':S['outerOffsetM'],'thicknessM':S['thicknessM'],'notMerelyRenamedSource':True,'runtimeAccepted':False}
(OUT/'construction.json').write_text(json.dumps({'sourceFaceLineage':lineage,'boundaryRenderEdges':boundary,'report':report},indent=2)+'\n',encoding='utf-8')
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
