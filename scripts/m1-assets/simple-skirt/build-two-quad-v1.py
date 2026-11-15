"""Build exactly the reviewed2quad conforming source plan, without new fitting."""
from pathlib import Path
import argparse,ast,hashlib,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';parser=argparse.ArgumentParser();parser.add_argument('--out',default='assets-source/m1/simple-skirt-v1/two-quad-thirds-v1');args=parser.parse_args();O=(R/args.out).resolve();assert R.name=='m1-simple-skirt-worktree'and O.is_relative_to(S.resolve())and not O.exists()
helper=R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py';parsed=ast.parse(helper.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in parsed.body if isinstance(n,ast.FunctionDef)and n.name=='load'],type_ignores=[]),str(helper),'exec'),globals())
parent=S/'active-gap-hem-v1/m1-sixfold-skirt-active-gap-hem-v1.glb';raw,doc,read=load(parent);assert hashlib.sha256(raw).hexdigest()=='8e0887b54bf8849d789c4f91e85be0bd5a54c706d2e5343c0a4462639042f157'
plan=json.loads((S/'two-quad-plan-v1/assessment.json').read_text(encoding='utf-8'));topology=json.loads((S/'two-quad-plan-v1/planned-face-lineage.json').read_text(encoding='utf-8'));assert plan['proposedCounts']=={'vertices':1402,'faces':2440}
n=struct.unpack_from('<I',raw,12)[0];binary=bytearray(raw[28+n:]);primitives=doc['meshes'][0]['primitives'];upperCount=len(read(primitives[0]['attributes']['POSITION']));low=primitives[1];old={k:read(a)for k,a in low['attributes'].items()};attrs={k:v.copy()for k,v in old.items()};count=len(old['POSITION']);names=[doc['nodes'][i]['name']for i in doc['skins'][0]['joints']];additions=[]
for record in plan['newVertices']:
    t=record['t'];edge=[i-upperCount for i in record['edge']];weights=np.zeros(len(names))
    for idx,factor in zip(edge,[1-t,t]):
        for j,w in zip(old['JOINTS_0'][idx],old['WEIGHTS_0'][idx]):weights[j]+=float(w)*factor
    weights/=weights.sum();rank=np.argsort(-weights,kind='stable')[:4];loss=1-weights[rank].sum();row={}
    assert abs(loss-record['discardedWeight'])<1e-12
    for key,v in old.items():
        if key=='JOINTS_0':row[key]=rank.astype(v.dtype)
        elif key=='WEIGHTS_0':row[key]=(weights[rank]/weights[rank].sum()).astype(v.dtype)
        else:
            q=v[edge[0]]*(1-t)+v[edge[1]]*t
            if key=='NORMAL':q/=np.linalg.norm(q)
            row[key]=q.astype(v.dtype)
        attrs[key]=np.vstack([attrs[key],row[key]])
    assert upperCount+len(attrs['POSITION'])-1==record['index'];additions.append(record)
for key in attrs:assert np.array_equal(attrs[key][:count],old[key])
newFaces=np.array(topology['triangles'],dtype=np.uint32);origin=np.array(topology['oldFaceForNewFace']);assert np.array_equal(newFaces[:120],read(primitives[0]['indices']).reshape(-1,3));assert np.array_equal(origin[:260],np.arange(260))
def append(values,component,kind):
    values=np.asarray(values,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[component]);binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(values.tobytes());vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes});entry={'bufferView':vi,'componentType':component,'count':len(values),'type':kind}
    if kind=='VEC3':entry.update(min=values.min(0).tolist(),max=values.max(0).tolist())
    ai=len(doc['accessors']);doc['accessors'].append(entry);return ai
for key,v in attrs.items():low['attributes'][key]=append(v,5123 if key=='JOINTS_0'else 5126,{2:'VEC2',3:'VEC3',4:'VEC4'}[v.shape[1]])
low['indices']=append((newFaces[120:]-upperCount).ravel(),5125,'SCALAR')
ident='m1-sixfold-skirt-two-quad-thirds-v1';doc['meshes'][0]['name']=ident
for node in doc['nodes']:
    if'mesh'in node:node['name']=ident
doc['extras'].update(fitId='female-027bed-two-quad-thirds-v1',notAccepted=True,method='Reviewed2quad longitudinal thirds preserving original triangle planes,10 vertices20 triangles including conforming outside fans')
doc['buffers']=[{'byteLength':len(binary)}];jb=json.dumps(doc,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary+=b'\0'*(-len(binary)%4);glb=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary
O.mkdir();(O/(ident+'.glb')).write_bytes(glb);(O/'face-lineage.json').write_text(json.dumps({'parentFaces':2420,'newFaces':2440,'oldFaceForNewFace':origin.tolist(),'splitParentFaces':[768,770,771,772,773,775],'newVertexInterpolation':additions},indent=2)+'\n',encoding='utf-8');report={'id':ident,'sha256':hashlib.sha256(glb).hexdigest(),'parentSha256':hashlib.sha256(raw).hexdigest(),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'planSha256':hashlib.sha256((S/'two-quad-plan-v1/assessment.json').read_bytes()).hexdigest(),'vertices':1402,'triangles':2440,'status':'source-only-not-admitted','allOriginalVertexAttributesExact':True,'newVertices':additions,'limits':['Source-plane subdivision only; actual skinned interpolation has recorded error.','Runtime must retain new vertices/faces. No coarse display remap.','No physics or sitting approval implied.']};(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'sha256':report['sha256'],'vertices':1402,'triangles':2440}))
