"""One source-derived layer candidate; preserves v4 waist/boundary exactly."""
from pathlib import Path
import argparse,copy,hashlib,importlib.util,json,struct,shutil
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('layer_space',ROOT/'scripts/audit-skirt-layer-space.py');space=importlib.util.module_from_spec(spec);spec.loader.exec_module(space)
parser=argparse.ArgumentParser();parser.add_argument('--out',default='experiments/m1-simple-skirt-worktree/assets-source/m1/simple-skirt-v1/layer-transition-v1');args=parser.parse_args();O=(ROOT/args.out).resolve();assert O.is_relative_to(ROOT)and not O.exists()
inspection,low,old,body,top,doc,read=space.inspect();rows=inspection['vertices'];assert all(r['source']is not None and r['bodyRadius']is not None for r in rows)
assert all(r['source']['distance']>r['bodyRadius']and(r['topRadius']is None or r['source']['distance']<r['topRadius'])for r in rows),'Original source has no verified vertex-layer interval'
source=space.S/'generated-v4/m1-sixfold-skirt-v4.glb';raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];binary=bytearray(raw[28+n:]);doc=copy.deepcopy(doc);primitive=doc['meshes'][0]['primitives'][1];before={k:read(v)for k,v in primitive['attributes'].items()};a={k:v.copy()for k,v in before.items()};faces=read(primitive['indices']).reshape(-1,3);center=np.array(inspection['centerXZ']);changes=[];names=[doc['nodes'][i]['name']for i in doc['skins'][0]['joints']]
for r in rows:
 i=r['lowVertex'];p=before['POSITION'][i];origin=np.array([center[0],p[1],center[1]]);direction=(p-origin)/r['radius'];hit=r['source'];f=old['f'][hit['face']];bary=np.array(hit['barycentric']);point=bary@old['p'][f];w=np.zeros(len(names))
 for vertex,factor in zip(f,bary):
  for joint,weight in zip(old['j'][vertex],old['w'][vertex]):w[joint]+=factor*weight
 assert w.min()>-1e-7;w=np.maximum(w,0);w/=w.sum();j=np.argsort(-w,kind='stable')[:4];loss=1-w[j].sum();chosen=w[j]/w[j].sum()
 a['POSITION'][i]=point;a['JOINTS_0'][i]=j;a['WEIGHTS_0'][i]=chosen
 changes.append({'lowVertex':i,'sourceTriangle':hit['face'],'barycentric':bary.tolist(),'radialBodyGapMetres':hit['distance']-r['bodyRadius'],'radialTopGapMetres':None if r['topRadius']is None else r['topRadius']-hit['distance'],'positionDelta':(point-p).tolist(),'discardedWeight':float(loss),'unprunedWeights':w.tolist()})
normals=np.zeros_like(a['POSITION'],dtype=float);p=a['POSITION'].astype(float);cross=np.cross(p[faces[:,1]]-p[faces[:,0]],p[faces[:,2]]-p[faces[:,0]])
for k in range(3):np.add.at(normals,faces[:,k],cross)
normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-20);normals[:20]=before['NORMAL'][:20];a['NORMAL']=normals.astype(np.float32)
def append(values,component,kind):
 values=np.asarray(values,dtype={5123:'<u2',5126:'<f4'}[component]);binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(values.tobytes());vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes});entry={'bufferView':vi,'componentType':component,'count':len(values),'type':kind}
 if kind=='VEC3':entry.update(min=values.min(0).tolist(),max=values.max(0).tolist())
 ai=len(doc['accessors']);doc['accessors'].append(entry);return ai
for name in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']:primitive['attributes'][name]=append(a[name],5123 if name=='JOINTS_0'else 5126,'VEC4'if name in ['JOINTS_0','WEIGHTS_0']else'VEC3')
ident='m1-sixfold-skirt-layer-transition-v1';doc['meshes'][0]['name']=ident
for node in doc['nodes']:
 if 'mesh'in node:node['name']=ident
doc['extras'].update(method='Frozen v4 plus original source triangle-derived first four lower rings; exact retained waist and seam',fitId='female-027bed-layer-transition-v1',notAccepted=True)
doc['buffers']=[{'byteLength':len(binary)}];jb=json.dumps(doc,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary+=b'\0'*(-len(binary)%4);glb=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary
assert all(np.array_equal(a[k][:20],before[k][:20])for k in a)
assert np.array_equal(a['POSITION'][504:],before['POSITION'][504:])and np.array_equal(a['JOINTS_0'][504:],before['JOINTS_0'][504:])and np.array_equal(a['WEIGHTS_0'][504:],before['WEIGHTS_0'][504:])
O.mkdir(parents=True);(O/(ident+'.glb')).write_bytes(glb);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
report={'id':ident,'sha256':hashlib.sha256(glb).hexdigest(),'vertices':1392,'triangles':2420,'bytes':len(glb),'parentV4Sha256':inspection['v4Sha256'],'preservedPrimitive0AccessorsAndIndicesExact':True,'first20LowerBoundaryAttributesExact':True,'modifiedLowerPositionWeightVertices':[20,503],'maximumPositionDeltaMetres':max(float(np.linalg.norm(c['positionDelta']))for c in changes),'maximumDiscardedWeight':max(c['discardedWeight']for c in changes),'normalChanges':'Area normals recomputed; boundary original20 normals retained. Adjacent fixed row normals may change.','status':'source-only-not-admitted','poseResponse':'Not authored; four poses are diagnostics, not completed sitting garment controller','inputs':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)}for p in [source,ROOT/'prototype/public/assets/foundation/base-female-roundtrip.vrm',ROOT/'prototype/public/assets/m1/m1-uniform-top.glb',ROOT/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-skirt-open-waist.glb',Path(__file__),ROOT/'scripts/audit-skirt-layer-space.py']]}
(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');(O/'source-mapping.json').write_text(json.dumps({'parameters':{'firstLowerRing':0,'lastLowerRing':3,'arbitraryClearanceMetres':0,'sourceSelection':'nearest radial original-source surface at unchanged height/angle','weightMethod':'same source-triangle barycentric, largest4 normalized'},'vertices':changes},indent=2)+'\n',encoding='utf-8');(O/'layer-space-input.json').write_text(json.dumps(inspection,indent=2)+'\n',encoding='utf-8')
for file in [Path(__file__),ROOT/'scripts/audit-skirt-layer-space.py']:shutil.copyfile(file,O/file.name)
print(json.dumps(report,indent=2))
