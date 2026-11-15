"""Verify actual captured skin face IDs/weights against the exact source VRM.
No browser, poses or renderer. Use after qa-variant-seat-arms.cjs.
"""
from pathlib import Path
import collections,hashlib,json,struct,sys
import numpy as np
ROOT=Path(__file__).resolve().parents[1];folder=Path(sys.argv[1]);report=json.loads((folder/'report.json').read_text(encoding='utf8'));records=[]
for case in report['reports']:
 id=case['id'];source=ROOT/'prototype/public/assets'/('foundation/base-female-roundtrip.vrm' if id=='beta-base-female-m1' else f'm1-variants/{id}/avatar.vrm');raw=source.read_bytes();digest=hashlib.sha256(raw).hexdigest();assert digest==case['initialGate']['primary']['actualSha256']==case['finalGate']['primary']['actualSha256']
 n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);buf=raw[28+n:]
 def acc(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);width={'SCALAR':1,'VEC4':4}[a['type']];return np.ndarray((a['count'],width),dtype=dt,buffer=buf,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dt.itemsize),dt.itemsize))
 matches=[(node,p)for node in doc['nodes']if'mesh'in node for p in doc['meshes'][node['mesh']]['primitives']if doc['materials'][p['material']]['name']=='F00_001_01_Body_00_SKIN'];assert len(matches)==1;node,p=matches[0]
 faces=acc(p['indices']).reshape(-1,3);j=acc(p['attributes']['JOINTS_0']);w=acc(p['attributes']['WEIGHTS_0']);names=[doc['nodes'][k]['name']for k in doc['skins'][node['skin']]['joints']]
 capture=json.loads((folder/(id+'.json')).read_text(encoding='utf8'));indices=next(x['indices']for x in capture['actualBodyIndices']if x['mesh']=='Bodybaked');assert np.array_equal(faces.reshape(-1),indices)
 counts=collections.Counter();stages={};first={};examples=[]
 for row in capture['rows']:
  for hit in row['hits']:
   assert np.array_equal(faces[hit['skinFace']],hit['skinIndices']);weights=collections.Counter()
   for i in faces[hit['skinFace']]:
    for joint,weight in zip(j[i],w[i]):weights[names[int(joint)]]+=float(weight)/3
   assert max(abs(weights[k]-hit['skinWeights'].get(k,0))for k in weights)<1e-6
   name=max(weights,key=weights.get);region='hand-fingers' if any(x in name for x in ['Hand','Thumb','Index','Middle','Ring','Little'])else'forearm' if'LowerArm'in name else'other'
   if'region'in hit:assert hit['region']==region
   counts[region]+=1;stages.setdefault(row['stage'],collections.Counter())[region]+=1
   first.setdefault(region,{'t':row['t'],'sitProgress':row['sitProgress'],'stage':row['stage']})
   if len(examples)<3:examples.append({'t':row['t'],'stage':row['stage'],'sitProgress':row['sitProgress'],**hit})
 records.append({'id':id,'sourceBodySHA256':digest,'sourceIndexSHA256':hashlib.sha256(faces.astype('<u4').tobytes()).hexdigest(),'indexAndWeightMappingVerified':True,'counts':dict(counts),'stages':{k:dict(v)for k,v in stages.items()},'first':first,'examples':examples})
result={'build':report['build'],'diagnosticForearm':report.get('diagnosticForearm'),'capture':str(folder).replace('\\','/'),'records':records,'limits':['Pair events are not penetration depth, contact area or exposed pixels.','Finite edge intersection alpha/GPU limitations belong to the original capture; this only independently verifies source mapping/classification.']}
(folder/'source-classification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps([{k:v for k,v in r.items()if k not in ['examples','stages']}for r in records]))
