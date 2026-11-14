"""Offline local-specimen source/morph/rest-bind/equipment identity checks.
No browser or visual acceptance; all original assets remain unchanged.
Run python scripts/m1-variants/audit.py after exporting both specimens/equipment.
"""
import pathlib,json,hashlib,struct
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2]
SPEC=json.loads((ROOT/'assets-source/m1-variants/spec.json').read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
class GLB:
 def __init__(self,path):
  data=path.read_bytes();magic,version,total=struct.unpack_from('<4sII',data);assert magic==b'glTF' and version==2 and total==len(data)
  length,kind=struct.unpack_from('<I4s',data,12);assert kind==b'JSON';self.doc=json.loads(data[20:20+length]);self.bin=data[28+length:]
 def acc(self,index):
  a=self.doc['accessors'][index];v=self.doc['bufferViews'][a['bufferView']];dtype=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
  return np.ndarray((a['count'],width),dtype=dtype,buffer=self.bin,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()
 def images(self):
  hashes=[]
  for image in self.doc.get('images',[]):
   assert 'uri' not in image;v=self.doc['bufferViews'][image['bufferView']];start=v.get('byteOffset',0);hashes.append(hashlib.sha256(self.bin[start:start+v['byteLength']]).hexdigest())
  return hashes
 def primitives(self):return {self.doc['materials'][p['material']]['name']:p for m in self.doc['meshes'] for p in m['primitives']}
 def bindings(self):return {self.doc['nodes'][node]['name']:inv for skin in self.doc['skins'] for node,inv in zip(skin['joints'],self.acc(skin['inverseBindMatrices']))}
 def section(self,material,height):
  p=self.primitives()[material];pos=self.acc(p['attributes']['POSITION']);tri=self.acc(p['indices']).reshape(-1,3);length=0.;segments=0
  for indices in tri:
   points=pos[indices];hits=[]
   if np.max(np.abs(points[:,0]))>.24:continue
   for a,b in zip(points,np.roll(points,-1,axis=0)):
    if (a[1]<height)!=(b[1]<height):hits.append(a+(b-a)*(height-a[1])/(b[1]-a[1]))
   if len(hits)==2:length+=float(np.linalg.norm(hits[1]-hits[0]));segments+=1
  return {'height':height,'totalContourLength':length,'segments':segments,'selection':'Complete source skin triangles crossing horizontal plane, |X|<=.24m excludes arms'}
original=ROOT/SPEC['sourceVRM'];assert sha(original)==SPEC['sourceVRMSha256'];assert sha(ROOT/SPEC['sourceBlend'])==SPEC['sourceBlendSha256']
base=GLB(original);bp=base.primitives();bb=base.bindings();reports=[]
for variant in SPEC['variants']:
 identifier=variant['id'];folder=ROOT/'prototype/public/assets/m1-variants'/identifier;sourceReport=json.loads((ROOT/'assets-source/m1-variants'/identifier/'build-report.json').read_text());target=folder/'avatar.vrm';assert sha(target)==sourceReport['vrmSha256'];new=GLB(target);np_=new.primitives();assert bp.keys()==np_.keys();assert base.images()==new.images(),'Image changed'
 assert base.doc['extensions']['VRM']['humanoid']==new.doc['extensions']['VRM']['humanoid'],'Humanoid changed'
 assert {k:v for k,v in base.doc['extensions']['VRM']['meta'].items() if k!='title'}=={k:v for k,v in new.doc['extensions']['VRM']['meta'].items() if k!='title'},'Source permission/provenance metadata changed'
 assert len(base.doc['nodes'])==len(new.doc['nodes'])
 for a,b in zip(base.doc['nodes'],new.doc['nodes']):
  for key in ['name','children','matrix','translation','rotation','scale','skin','mesh']:assert a.get(key)==b.get(key),(key,a.get('name'))
 nb=new.bindings();assert bb.keys()==nb.keys();assert all(np.array_equal(bb[k],nb[k])for k in bb),'Inverse bind changed'
 materialChecks=[];maxMorphError=0.
 for name,oldp in bp.items():
  p=np_[name];assert np.array_equal(base.acc(oldp['indices']),new.acc(p['indices'])),name
  for k in ['JOINTS_0','WEIGHTS_0','TEXCOORD_0']:assert np.array_equal(base.acc(oldp['attributes'][k]),new.acc(p['attributes'][k])),(name,k)
  used=np.unique(new.acc(p['indices']));oldPositions=base.acc(oldp['attributes']['POSITION'])[used];newPositions=new.acc(p['attributes']['POSITION'])[used];delta=newPositions-oldPositions
  assert np.isfinite(newPositions).all()
  targets=p.get('targets',[]);assert len(targets)==len(oldp.get('targets',[]))
  for ta,tb in zip(oldp.get('targets',[]),targets):
   if 'POSITION' in ta:maxMorphError=max(maxMorphError,float(np.max(np.abs(base.acc(ta['POSITION'])-new.acc(tb['POSITION'])))))
  maxDelta=float(np.linalg.norm(delta,axis=1).max());changed=int(np.sum(np.linalg.norm(delta,axis=1)>1e-8))
  if variant['kind']=='jaw' and any(s in name for s in ['Body_','_CLOTH','_HAIR','_EYE']):assert maxDelta<1e-7,(name,maxDelta)
  if variant['kind']=='waisthip' and not any(s in name for s in ['Body_','_CLOTH']):assert maxDelta<1e-7,(name,maxDelta)
  if '_Shoes_' in name:assert maxDelta<1e-7
  materialChecks.append({'material':name,'vertices':len(used),'triangles':len(new.acc(p['indices']))//3,'changedVertices':changed,'maxDisplacement':maxDelta,'morphTargets':len(targets)})
 assert maxMorphError<3e-7,('Morph POSITION deltas changed',maxMorphError)
 equipment=json.loads((folder/'equipment/equipment.json').read_text(encoding='utf8'));gear=[]
 for entry in equipment['items']:
  filepath=folder/'equipment'/entry['url'];assert sha(filepath)==entry['sha256'];assert entry['compatibleAvatarSha256']==sourceReport['vrmSha256'];assert entry['compatibleAvatarSha256']!=SPEC['sourceVRMSha256']
  g=GLB(filepath);gb=g.bindings();assert set(g.images())<=set(new.images());assert len(entry['bindings'])==len(gb)
  for binding in entry['bindings']:
   name=binding['targetRawBone'];assert binding['sourceBone']==name and name in nb
   assert np.max(np.abs(np.array(binding['inverseBindMatrix'])-nb[name]))<1e-7;assert np.array_equal(gb[name],nb[name])
  maxWeightError=0
  for m in g.doc['meshes']:
   for p in m['primitives']:
    w=g.acc(p['attributes']['WEIGHTS_0']);maxWeightError=max(maxWeightError,float(np.max(np.abs(w.sum(1)-1))));assert np.isfinite(g.acc(p['attributes']['POSITION'])).all()
  assert maxWeightError<1e-5
  gear.append({'id':entry['id'],'sha256':entry['sha256'],'exactIdentity':entry['compatibleAvatarSha256'],'maxWeightSumError':maxWeightError,'bindingsUnchanged':True})
 skin=next(name for name in bp if 'Body_00_SKIN' in name);sections=[]
 for height in [.80,.88,.90,1.0,1.05,1.1,1.18]:
  before=base.section(skin,height);after=new.section(skin,height);sections.append({'height':height,'before':before,'after':after,'relativeChange':after['totalContourLength']/before['totalContourLength']-1})
 reports.append({'id':identifier,'bodySha256':sourceReport['vrmSha256'],'originalUnchanged':True,'nodesAndSkeletonRestUnchanged':True,'topologyUVWeightsAndTexturesUnchanged':True,'maxMorphPositionDeltaError':maxMorphError,'materials':materialChecks,'bodyContourSections':sections,'equipment':gear,'limits':['Offline structural and numerical checks only; face/mouth/eye/garment expression and animation visuals are not accepted here','Circumference is exact sum of intersected source triangle segments at chosen planes, not arbitrary garment fit validation','Male sources differ in topology and shape-key set and receive no inherited compatibility']})
(ROOT/'assets-source/m1-variants/audit-report.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf8')
print(json.dumps([{'id':r['id'],'maxMorphPositionDeltaError':r['maxMorphPositionDeltaError'],'contours':[(s['height'],s['relativeChange'])for s in r['bodyContourSections']],'equipmentCount':len(r['equipment'])}for r in reports],indent=2))


catalog={'schema':'zbgs-local-female-specimens-v1','originalAvatarSha256':SPEC['sourceVRMSha256'],'profiles':[]}
for variant in SPEC['variants']:
 identifier=variant['id'];report=json.loads((ROOT/'assets-source/m1-variants'/identifier/'build-report.json').read_text(encoding='utf8'))
 catalog['profiles'].append({'id':identifier,'url':report['url'],'sha256':report['vrmSha256'],'manifestUrl':'/assets/m1-variants/'+identifier+'/equipment/equipment.json','ids':{'top':identifier+'-uniform-top','shoes':identifier+'-uniform-shoes','skirt':identifier+'-uniform-skirt','pants':identifier+'-training-pants'},'referenceBody':'female','geometryChange':variant['kind'],'offlineAuditPassed':True,'runtimeAcceptance':'unverified; no inherited seat/contact/garment acceptance','seatLayerThickness':'must be measured by runtime integration; not supplied as passed'})
(ROOT/'prototype/public/assets/m1-variants/catalog.json').write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf8')
