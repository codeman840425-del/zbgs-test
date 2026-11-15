"""One reproducible lower-hem weight candidate. Source geometry and all other data unchanged."""
from pathlib import Path
import ast,struct,json,hashlib,gzip
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'top-hem-fit-v1'
h=R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py';t=ast.parse(h.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name=='load'],type_ignores=[]),str(h),'exec'),globals())
parent=R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb';raw,d,read=load(parent);plan=json.loads((O/'weight-fit-plan.json').read_text(encoding='utf-8'));assert hashlib.sha256(raw).hexdigest()==plan['sourceSha256']=='7f266ff135096f16a6db067cceddee0cd610a886833218b1cb6531dd43721c89'
p=d['meshes'][0]['primitives'][0];oldJ=read(p['attributes']['JOINTS_0']);oldW=read(p['attributes']['WEIGHTS_0']);J=oldJ.copy();W=oldW.copy();P=read(p['attributes']['POSITION']);names=plan['jointNames'];discarded=[];denseAll=np.zeros((len(P),len(names)))
for k in range(4):np.add.at(denseAll,(np.arange(len(P)),oldJ[:,k]),oldW[:,k])
for i,t,target in zip(plan['localVertexIds'],plan['transferAmounts'],plan['targetWeightVectors']):
 if t<1e-12:continue
 desired=(1-t)*denseAll[i]+t*np.array(target);denseAll[i]=desired;js=np.argsort(-desired,kind='stable')[:4];weights=desired[js];discarded.append({'vertex':i,'droppedMass':float(max(0,1-weights.sum())),'nonzeroCount':int(np.count_nonzero(desired>1e-7))});weights/=weights.sum();J[i]=js;W[i]=weights
n=struct.unpack_from('<I',raw,12)[0];binary=bytearray(raw[28+n:])
def append(a,component):
 a=np.asarray(a,dtype='<f4'if component==5126 else'<u2');binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(a.tobytes());v=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes});index=len(d['accessors']);d['accessors'].append({'bufferView':v,'componentType':component,'count':len(a),'type':'VEC4'});return index
p['attributes']['JOINTS_0']=append(J,5123);p['attributes']['WEIGHTS_0']=append(W,5126)
ident='m1-uniform-top-open-hem-thighfit-v1';d.setdefault('extras',{}).update(candidateId=ident,fitId='female-027bed-top-hem-fit-v1',notAccepted=True,parentSha256=plan['sourceSha256']);d['buffers']=[{'byteLength':len(binary)}];jb=json.dumps(d,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary+=b'\0'*(-len(binary)%4);out=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary
path=O/(ident+'.glb');path.write_bytes(out);_,new,nread=load(path)
for k,a in p['attributes'].items():
 if k not in ['JOINTS_0','WEIGHTS_0']:assert np.array_equal(nread(a),read(a))
assert new['meshes'][0]['primitives'][1]==d['meshes'][0]['primitives'][1]
changed=np.flatnonzero(np.any(J!=oldJ,axis=1)|np.any(W!=oldW,axis=1));assert set(changed)<=set(plan['localVertexIds']);assert np.array_equal(P,read(p['attributes']['POSITION']))
cap=json.loads(gzip.decompress((S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()));inv=read(d['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);HP=np.c_[P,np.ones(len(P))];pruneError=0
for fr in cap['frames']:
 pal=np.array([np.array(fr['bones'][name]).reshape(4,4).T for name in names])@inv
 desired=np.einsum('bij,vj,vb->vi',pal,HP,denseAll)[:,:3];actual=sum(np.einsum('nij,nj->ni',pal[J[:,k]],HP)*W[:,k,None]for k in range(4))[:,:3];pruneError=max(pruneError,float(np.linalg.norm(desired-actual,axis=1).max()))
report={'id':ident,'sha256':hashlib.sha256(out).hexdigest(),'bodySha256':'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95','parentSha256':plan['sourceSha256'],'publicOriginalClosedTopSha256':'27bcfe020828ad2603f618fabf7f21cf1b09f66035c8ecd740e78cfc3650b9d6','sourceSteps':['Existing open-hem removes original cap; not new in this candidate','This candidate only changes lower-hem weights; no point/index/UV/material/inverse-bind edits'],'changedVertices':changed.tolist(),'maxDroppedMass':max(x['droppedMass']for x in discarded),'pruning':discarded,'pruneLBSMax60FramesMetres':pruneError,'maxWeightSumError':float(abs(W.sum(1)-1).max()),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'planSha256':hashlib.sha256((O/'weight-fit-plan.json').read_bytes()).hexdigest(),'status':'candidate-pending-actual-triangle-gate','license':'Derived original VRoid uniform; same original asset permissions, not CC0','sourceGeometryTopologyUVNormalsMaterialsTieAndBindingExact':True}
(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:report[k]for k in ['sha256','maxDroppedMass','pruneLBSMax60FramesMetres','maxWeightSumError']}));print('changed',len(changed))
