"""One proven active edge, two conforming vertices; no global subdivision."""
from pathlib import Path
import argparse,ast,hashlib,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';parser=argparse.ArgumentParser();parser.add_argument('--out',default='assets-source/m1/simple-skirt-v1/edge-thirds-v1');args=parser.parse_args();O=(R/args.out).resolve();assert R.name=='m1-simple-skirt-worktree'and O.is_relative_to(S.resolve())and not O.exists()
helper=R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py';parsed=ast.parse(helper.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in parsed.body if isinstance(n,ast.FunctionDef)and n.name=='load'],type_ignores=[]),str(helper),'exec'),globals())
parent=S/'active-gap-hem-v1/m1-sixfold-skirt-active-gap-hem-v1.glb';raw,doc,read=load(parent);assert hashlib.sha256(raw).hexdigest()=='8e0887b54bf8849d789c4f91e85be0bd5a54c706d2e5343c0a4462639042f157'
n=struct.unpack_from('<I',raw,12)[0];binary=bytearray(raw[28+n:]);primitives=doc['meshes'][0]['primitives'];upperCount=len(read(primitives[0]['attributes']['POSITION']));low=primitives[1];attrs={k:read(a)for k,a in low['attributes'].items()};old={k:v.copy()for k,v in attrs.items()};count=len(attrs['POSITION']);edge=[440-upperCount,561-upperCount];faces=read(low['indices']).reshape(-1,3);incident=[i for i,f in enumerate(faces)if all(v in f for v in edge)];assert incident==[650,653]
jointCount=len(doc['skins'][0]['joints']);names=[doc['nodes'][i]['name']for i in doc['skins'][0]['joints']];additions=[]
for t in [1/3,2/3]:
    row={};weights=np.zeros(jointCount)
    for idx,factor in zip(edge,[1-t,t]):
        for j,w in zip(old['JOINTS_0'][idx],old['WEIGHTS_0'][idx]):weights[j]+=float(w)*factor
    weights/=weights.sum();rank=np.argsort(-weights,kind='stable')[:4];loss=1-weights[rank].sum()
    for k,values in old.items():
        if k=='JOINTS_0':row[k]=rank.astype(values.dtype)
        elif k=='WEIGHTS_0':row[k]=(weights[rank]/weights[rank].sum()).astype(values.dtype)
        else:
            value=values[edge[0]]*(1-t)+values[edge[1]]*t
            if k=='NORMAL':value/=np.linalg.norm(value)
            row[k]=value.astype(values.dtype)
        attrs[k]=np.vstack([attrs[k],row[k]])
    additions.append({'lowerIndex':len(attrs['POSITION'])-1,'renderIndex':upperCount+len(attrs['POSITION'])-1,'edgeRender':[440,561],'t':t,'fullWeights':{names[i]:float(v)for i,v in enumerate(weights)if v},'selected4':{names[int(i)]:float(v)for i,v in zip(row['JOINTS_0'],row['WEIGHTS_0'])},'discardedWeight':float(loss)})
newFaces=[];provenance=[]
for i,f in enumerate(faces):
    if i not in incident:newFaces.append(f.tolist());provenance.append(i+120);continue
    oriented=next((int(f[k]),int(f[(k+1)%3]),int(f[(k+2)%3]))for k in range(3)if set([int(f[k]),int(f[(k+1)%3])])==set(edge));a,b,opposite=oriented;mids=[count,count+1]if a==edge[0]else[count+1,count];chain=[a,*mids,b]
    for x,y in zip(chain,chain[1:]):newFaces.append([opposite,x,y]);provenance.append(i+120)
newFaces=np.array(newFaces,dtype=np.uint32);assert len(newFaces)==len(faces)+4
for key in attrs:assert np.array_equal(attrs[key][:count],old[key])
def append(values,component,kind):
    values=np.asarray(values,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[component]);binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(values.tobytes());vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes});entry={'bufferView':vi,'componentType':component,'count':len(values),'type':kind}
    if kind=='VEC3':entry.update(min=values.min(0).tolist(),max=values.max(0).tolist())
    ai=len(doc['accessors']);doc['accessors'].append(entry);return ai
for key,v in attrs.items():low['attributes'][key]=append(v,5123 if key=='JOINTS_0'else 5126,{2:'VEC2',3:'VEC3',4:'VEC4'}[v.shape[1]])
low['indices']=append(newFaces.ravel(),5125,'SCALAR')
ident='m1-sixfold-skirt-edge-thirds-v1';doc['meshes'][0]['name']=ident
for node in doc['nodes']:
    if 'mesh'in node:node['name']=ident
doc['extras'].update(fitId='female-027bed-edge-thirds-v1',notAccepted=True,method='One actual-render active edge thirds,2 vertices4 triangles; explicit interpolation/pruning and face lineage')
doc['buffers']=[{'byteLength':len(binary)}];jb=json.dumps(doc,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary+=b'\0'*(-len(binary)%4);glb=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary
O.mkdir();(O/(ident+'.glb')).write_bytes(glb);(O/'face-lineage.json').write_text(json.dumps({'parentFaces':2420,'newFaces':2424,'oldFaceForNewFace':list(range(120))+provenance,'splitParentFaces':[770,773],'newVertexInterpolation':additions},indent=2)+'\n',encoding='utf-8')
report={'id':ident,'sha256':hashlib.sha256(glb).hexdigest(),'parentSha256':hashlib.sha256(raw).hexdigest(),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'vertices':1394,'triangles':2424,'status':'source-only-not-admitted','invariants':['All existing vertices all attributes exact','Original upper120 faces and20source seam unchanged','Only2 proven adjacent parent triangles replaced, conforming split','No materials/bones/inverse-bind/UV-image/controller change'],'newVertices':additions,'limits':['Bind-space planar subdivision only; skinned surface is NOT exactly old edge due to LBS position/weight interpolation and4-weight pruning.','Actual renderer must retain refined topology. No dense-proxy back-map approval.']}
(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'sha256':report['sha256'],'vertices':1394,'triangles':2424,'loss':[a['discardedWeight']for a in additions]}))
