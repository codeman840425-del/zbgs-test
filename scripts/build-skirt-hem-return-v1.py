"""One hem-construction correction; no collision exclusions or body changes."""
from pathlib import Path
import argparse,copy,hashlib,importlib.util,json,struct,shutil
import numpy as np
ROOT=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('space',ROOT/'scripts/audit-skirt-layer-space.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
parser=argparse.ArgumentParser();parser.add_argument('--out',default='experiments/m1-simple-skirt-worktree/assets-source/m1/simple-skirt-v1/hem-return-v1');args=parser.parse_args();O=(ROOT/args.out).resolve();assert O.is_relative_to(ROOT)and not O.exists()
source=m.S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb';d,a,sha=m.glb(source);assert sha=='d7b5a881d1a64bdaf5e1d92a72573c2cef34abe859e53af0f9a2c8b091bd55fa';raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];binary=bytearray(raw[28+n:]);d=copy.deepcopy(d);pr=d['meshes'][0]['primitives'][1];old={k:a(v)for k,v in pr['attributes'].items()};new={k:v.copy()for k,v in old.items()};f=a(pr['indices']).reshape(-1,3);N=120;previous=20+7*121;outer=20+8*121;inner=20+9*121;records=[]
assert len(new['POSITION'])==1230 and inner==1109
for col in range(121):
 i=col%N;bottom=old['POSITION'][outer+i].astype(float);up=old['POSITION'][previous+i].astype(float)-bottom;assert up[1]>.01
 fraction=.01/up[1];surface=bottom+fraction*up
 tangent=old['POSITION'][outer+(i+1)%N].astype(float)-old['POSITION'][outer+(i-1)%N].astype(float);normal=np.cross(up,tangent);normal/=np.linalg.norm(normal);radial=bottom[[0,2]]-old['POSITION'][outer:outer+120][:,[0,2]].mean(0)
 if normal[[0,2]]@radial<0:normal=-normal
 target=surface-.0008*normal;weights=np.zeros(len(d['skins'][0]['joints']))
 for vertex,factor in [(outer+i,1-fraction),(previous+i,fraction)]:
  for j,w in zip(old['JOINTS_0'][vertex],old['WEIGHTS_0'][vertex]):weights[j]+=factor*w
 js=np.argsort(-weights,kind='stable')[:4];assert weights[js].sum()>1-1e-6;ws=weights[js]/weights[js].sum()
 new['POSITION'][inner+col]=target;new['JOINTS_0'][inner+col]=js;new['WEIGHTS_0'][inner+col]=ws
 records.append({'lowerVertex':inner+col,'outerVertex':outer+i,'upperNeighborVertex':previous+i,'fraction':fraction,'surfacePoint':surface.tolist(),'outwardNormal':normal.tolist(),'oldPosition':old['POSITION'][inner+col].tolist(),'newPosition':target.tolist(),'displacementMetres':float(np.linalg.norm(target-old['POSITION'][inner+col])),'normalOffsetMetres':.0008})
normals=np.zeros_like(new['POSITION'],dtype=float);p=new['POSITION'].astype(float);cross=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
for k in range(3):np.add.at(normals,f[:,k],cross)
normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-20);normals[:outer]=old['NORMAL'][:outer];new['NORMAL']=normals.astype(np.float32)
def append(arr,component,kind):
 arr=np.asarray(arr,dtype={5123:'<u2',5126:'<f4'}[component]);binary.extend(b'\0'*(-len(binary)%4));off=len(binary);binary.extend(arr.tobytes());vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':arr.nbytes});item={'bufferView':vi,'componentType':component,'count':len(arr),'type':kind}
 if kind=='VEC3':item.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
 ai=len(d['accessors']);d['accessors'].append(item);return ai
for key in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']:pr['attributes'][key]=append(new[key],5123 if key=='JOINTS_0'else 5126,'VEC4'if key in ['JOINTS_0','WEIGHTS_0']else'VEC3')
ident='m1-sixfold-skirt-hem-return-v1';d['meshes'][0]['name']=ident
for node in d['nodes']:
 if 'mesh'in node:node['name']=ident
d['extras'].update(fitId='female-027bed-hem-return-v1',notAccepted=True,method='Layer transition parent; inner hem follows actual outer panel tangent then original0.8mm inward normal, same10mm return')
d['buffers']=[{'byteLength':len(binary)}];jb=json.dumps(d,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary+=b'\0'*(-len(binary)%4);result=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary
assert np.array_equal(new['POSITION'][:inner],old['POSITION'][:inner])and np.array_equal(new['JOINTS_0'][:inner],old['JOINTS_0'][:inner])and np.array_equal(new['WEIGHTS_0'][:inner],old['WEIGHTS_0'][:inner])
O.mkdir(parents=True);asset=O/(ident+'.glb');asset.write_bytes(result);report={'id':ident,'sha256':hashlib.sha256(result).hexdigest(),'bytes':len(result),'vertices':1392,'triangles':2420,'parentSha256':sha,'changedLowerVertices':[inner,1229],'outerPositionsWeightsUntouched':True,'retained120AndBoundary20Untouched':True,'indicesMaterialsSkinUnchanged':True,'nominalReturnMetres':.01,'nominalNormalSeparationMetres':.0008,'selfGateThicknessMetres':0,'bodyTopReserveGateMetres':.002,'maxDisplacementMetres':max(r['displacementMetres']for r in records),'status':'source-only-not-admitted'}
(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');(O/'hem-mapping.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8');entry=json.loads((m.S/'layer-transition-v1/equipment-entry.json').read_text(encoding='utf-8'));entry.update(id=ident,fitId='female-027bed-hem-return-v1',url=ident+'.glb',sha256=report['sha256'],bytes=report['bytes'],method=d['extras']['method']);entry['limits']=['Source hem repair candidate only; no sitting response or runtime validation','0.8mm nominal turned-layer gap; zero-thickness self intersection gate, not a2mm self-collision cloth volume','Body/top reserve unchanged; no collision exclusions'];(O/'equipment-entry.json').write_text(json.dumps(entry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');shutil.copyfile(__file__,O/Path(__file__).name);print(json.dumps(report,indent=2))
