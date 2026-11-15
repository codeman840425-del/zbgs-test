"""Classify captured body crossings by actual source bone weights; no new pose."""
import collections,json,struct,sys,os
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2];CAP=Path(sys.argv[1]);OUT=Path(os.environ.get('QA_SKIRT_OUTPUT',ROOT/'assets-source/m1/seated-front-v1'))
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
d=read(CAP/'capture.json');report=read(OUT/'triangle-alpha-report.json')
raw=(ROOT/'prototype/public/assets/foundation/base-female-roundtrip.vrm').read_bytes();length=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+length]);binary=raw[28+length:]
def accessor(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);w={'SCALAR':1,'VEC4':4}[a['type']]
 return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize))
meshnode=next(n for n in doc['nodes'] if 'mesh'in n and any(doc['materials'][p['material']]['name']=='F00_001_01_Body_00_SKIN' for p in doc['meshes'][n['mesh']]['primitives']))
primitive=next(p for p in doc['meshes'][meshnode['mesh']]['primitives']if doc['materials'][p['material']]['name']=='F00_001_01_Body_00_SKIN')
faces=accessor(primitive['indices']).reshape(-1,3);j=accessor(primitive['attributes']['JOINTS_0']);w=accessor(primitive['attributes']['WEIGHTS_0'])
bones=[doc['nodes'][i]['name'] for i in doc['skins'][meshnode['skin']]['joints']]
captured=next(m for m in d['topology']['colliders'] if m['name']=='Bodybaked')
assert np.array_equal(faces.reshape(-1),np.array(captured['triangles'])),'Body face ID mapping changed'
def region(name):
 if any(x in name for x in ['Hand','Thumb','Index','Middle','Ring','Little']):return 'hand-fingers'
 if any(x in name for x in ['LowerArm','UpperArm','Shoulder']):return 'arm-shoulder'
 if any(x in name for x in ['UpperLeg','LowerLeg','Foot','Toe']):return 'legs-feet'
 if any(x in name for x in ['Hips','Spine','Chest']):return 'pelvis-torso'
 return 'other'
roles=[]
for face in faces:
 scores=collections.Counter()
 for vertex in face:
  for joint,weight in zip(j[vertex],w[vertex]):scores[region(bones[int(joint)])]+=float(weight)/3
 roles.append(dict(scores))
top_raw=(ROOT/'prototype/public/assets/m1/m1-uniform-top.glb').read_bytes();length=struct.unpack_from('<I',top_raw,12)[0]
doc=json.loads(top_raw[20:20+length]);binary=top_raw[28+length:]
top_node=next(n for n in doc['nodes'] if 'mesh'in n and any(doc['materials'][p['material']]['name']=='F00_001_01_Tops_01_CLOTH' for p in doc['meshes'][n['mesh']]['primitives']))
top_primitive=next(p for p in doc['meshes'][top_node['mesh']]['primitives'] if doc['materials'][p['material']]['name']=='F00_001_01_Tops_01_CLOTH')
top_tri=accessor(top_primitive['indices']).reshape(-1,3);top_j=accessor(top_primitive['attributes']['JOINTS_0']);top_w=accessor(top_primitive['attributes']['WEIGHTS_0'])
top_bones=[doc['nodes'][i]['name']for i in doc['skins'][top_node['skin']]['joints']]
assert np.array_equal(top_tri.reshape(-1),next(m['triangles']for m in d['topology']['colliders']if m['name']=='m1-uniform-top_1'))
top_roles=[]
for face in top_tri:
 scores=collections.Counter()
 for vertex in face:
  for joint,weight in zip(top_j[vertex],top_w[vertex]):scores[region(top_bones[int(joint)])]+=float(weight)/3
 top_roles.append(dict(scores))
counts=collections.Counter();body_faces=collections.Counter();top_faces=collections.Counter();samples=[]
for frame in report['records']:
 for item in frame['newPairs']:
  skirt,mesh,face=item.split(':');face=int(face)
  if mesh=='Bodybaked':
   weights=roles[face];label=max(weights,key=weights.get);body_faces[(face,label)]+=1
  else:
   weights=top_roles[face] if mesh=='m1-uniform-top_1' else {'other':1}
   label='top:'+mesh+':'+max(weights,key=weights.get);top_faces[(mesh,face)]+=1
  counts[label]+=1
  if len(samples)<40 and label in ['legs-feet','pelvis-torso']:
   samples.append({'frame':frame['frame'],'sitProgress':frame['sitProgress'],'skirtFace':int(skirt),'bodyFace':face,'weights':roles[face]})
result={'status':'candidate-contact-regression-region-classification','captureBuild':d['identity']['runtimeBuild']['shortId'],
 'bodyFaceIndexMappingVerified':True,'newPairEventsByDominantActualBoneRegion':dict(counts),
 'mostFrequentBodyFaces':[{'face':f,'region':r,'events':n,'weights':roles[f]}for(f,r),n in body_faces.most_common(15)],
 'mostFrequentTopFaces':[{'mesh':m,'face':f,'events':n,'weights':top_roles[f] if m=='m1-uniform-top_1' else {}}for(m,f),n in top_faces.most_common(15)],
 'unaffectedLowerBodyExamples':samples,
 'limits':[('Actual candidate hand-refit surfaces sampled in closed-loop runtime.' if os.environ.get('QA_SKIRT_CLOSED_LOOP')=='1' else 'Arm/hand data are the original-guide hand-fit pose; candidate hand re-fit not sampled. Those are diagnostics, not closed-loop candidate failures.'),
  'Leg/pelvis/torso and unchanged upper clothing crossings remain direct candidate geometry risks.',
  'Dominant region comes from real per-vertex bone weights averaged per triangle, not spatial naming guesses. Mixed boundary weights retained.']}
direct=sum(n for k,n in counts.items() if k in ['legs-feet','pelvis-torso'] or k.endswith(':pelvis-torso'))
result['directUnaffectedRegionNewEvents']=direct
result['geometryGate']='reject-direct-contact-regression' if direct else 'no-new-unaffected-region-pairs-hand-closure-still-unverified'
(OUT/'crossing-regions.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ['mostFrequentBodyFaces','mostFrequentTopFaces','unaffectedLowerBodyExamples']},indent=2))
if direct:raise SystemExit(2)
