from pathlib import Path
import json,struct,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
sha=lambda x:hashlib.sha256(x).hexdigest()
class GLB:
 def __init__(self,path):
  self.path=path;self.raw=(ROOT/path).read_bytes();n=struct.unpack_from('<I',self.raw,12)[0];self.doc=json.loads(self.raw[20:20+n]);self.bin=self.raw[28+n:]
 def acc(self,i):
  a=self.doc['accessors'][i];v=self.doc['bufferViews'][a['bufferView']];dt={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];offset=v.get('byteOffset',0)+a.get('byteOffset',0);item=np.dtype(dt).itemsize
  return np.ndarray((a['count'],size),dtype=dt,buffer=self.bin,offset=offset,strides=(v.get('byteStride',size*item),item)).copy()
 def image(self,i):
  v=self.doc['bufferViews'][self.doc['images'][i]['bufferView']];return self.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
 def material(self,i):
  def canonical(v,key=''):
   if isinstance(v,list):return [canonical(x) for x in v]
   if not isinstance(v,dict):return v
   if 'texture' in key.lower() and 'index' in v:
    t=self.doc['textures'][v['index']];return {**{k:canonical(x,k) for k,x in v.items() if k!='index'},'imageSHA':sha(self.image(t['source'])),'sampler':self.doc.get('samplers',[{}])[t.get('sampler',0)]}
   return {k:canonical(x,k) for k,x in v.items()}
  return canonical(self.doc['materials'][i])
source=GLB('assets-source/native-vroid-hairset-study-v1/generated/male-hairset001.vrm')
target=GLB('assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm')
hair=GLB('assets-source/native-vroid-hair-equipment-v1/generated/hair.glb')
assert sha(source.raw)=='dab423674f42d3e6e79eb1b8aa1375e5b664e11bf130d093c14f78c5d3967238'
assert sha(target.raw)=='7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81'
fit=json.loads((ROOT/'assets-source/native-vroid-hair-equipment-v1/generated/fit.json').read_text(encoding='utf8'))
assert sha(hair.raw)==fit['assetSha256']
names=lambda g:[n['name'] for n in g.doc['nodes']]
sn,tn,hn=map(names,[source,target,hair]);assert len(set(hn))==len(hn)
parents=lambda d:{c:i for i,n in enumerate(d['nodes']) for c in n.get('children',[])}
sp,tp,hp=map(lambda g:parents(g.doc),[source,target,hair])
def local(n):return {k:n.get(k,v) for k,v in [('translation',[0,0,0]),('rotation',[0,0,0,1]),('scale',[1,1,1])]}
for i,n in enumerate(hair.doc['nodes']):
 if 'mesh' in n:
  mat=hair.doc['materials'][hair.doc['meshes'][n['mesh']]['primitives'][0]['material']]['name']
  j=next(j for j,ss in enumerate(source.doc['nodes']) if 'mesh'in ss and any(source.doc['materials'][p['material']]['name']==mat for p in source.doc['meshes'][ss['mesh']]['primitives']))
 else:j=sn.index(hn[i])
 assert local(n)==local(source.doc['nodes'][j]);assert (hn[hp[i]] if i in hp else None)==(sn[sp[j]] if j in sp else None)
skinActive=set();meshes=[]
for ni,n in enumerate(hair.doc['nodes']):
 if 'mesh' not in n:continue
 op=hair.doc['meshes'][n['mesh']]['primitives'][0];mat=hair.doc['materials'][op['material']]['name'];matches=[]
 for si,ss in enumerate(source.doc['nodes']):
  if 'mesh' not in ss:continue
  for p in source.doc['meshes'][ss['mesh']]['primitives']:
   if source.doc['materials'][p['material']]['name']==mat:matches.append((si,ss,p))
 assert len(matches)==1;si,ss,p=matches[0];origIndices=source.acc(p['indices']).flatten();ids=np.unique(origIndices).astype(int)
 assert np.array_equal(ids[hair.acc(op['indices']).flatten().astype(int)],origIndices)
 assert set(op['attributes'])==set(p['attributes'])
 for key in p['attributes']:
  if key!='JOINTS_0':assert np.array_equal(hair.acc(op['attributes'][key]),source.acc(p['attributes'][key])[ids]),key
 sj=source.doc['skins'][ss['skin']]['joints'];hj=hair.doc['skins'][n['skin']]['joints'];assert len(hj)==64
 a=source.acc(p['attributes']['JOINTS_0'])[ids].astype(int);b=hair.acc(op['attributes']['JOINTS_0']).astype(int);w=hair.acc(op['attributes']['WEIGHTS_0'])
 for x,y in zip(a[w>0],b[w>0]):assert sn[sj[x]]==hn[hj[y]];skinActive.add(sn[sj[x]])
 ibm=source.acc(source.doc['skins'][ss['skin']]['inverseBindMatrices']);hbm=hair.acc(hair.doc['skins'][n['skin']]['inverseBindMatrices'])
 assert np.array_equal(hbm,np.array([ibm[[sn[x] for x in sj].index(hn[y])] for y in hj]))
 assert source.material(p['material'])==hair.material(op['material'])
 meshes.append({'material':mat,'vertices':len(ids),'triangles':len(origIndices)//3,'attributesAndIndicesExact':True,'positiveWeightJointSemanticsExact':True,'IBM64Exact':True,'MToonAndTextureBytesExact':True})
assert len(meshes)==2
se=source.doc['extensions']['VRMC_springBone'];he=hair.doc['extensions']['VRMC_springBone']
def namedext(ext,ns):
 e=json.loads(json.dumps(ext))
 for c in e['colliders']:c['node']=ns[c['node']]
 for s in e['springs']:
  if 'center'in s:s['center']=ns[s['center']]
  for j in s['joints']:j['node']=ns[j['node']]
 return e
se,he=namedext(se,sn),namedext(he,hn)
expected=[s for s in se['springs'] if any(j['node'].startswith('J_Sec_Hair') for j in s['joints'])]
for s in he['springs']:
 matches=[x for x in expected if x['joints']==s['joints'] and x.get('center')==s.get('center')];assert len(matches)==1
 # Compare collider geometry+node membership, independent of compact indices.
 def colliders(e,s):return [e['colliders'][c] for g in s.get('colliderGroups',[]) for c in e['colliderGroups'][g]['colliders']]
 assert colliders(se,matches[0])==colliders(he,s)
assert len(expected)==len(he['springs'])==12 and len(he['colliders'])==22 and len(he['colliderGroups'])==10
for f in fit['externalFrames']:
 h=hair.doc['nodes'][f['node']];t=target.doc['nodes'][tn.index(f['targetRawNode'])];assert h['name']==f['name'];assert local(h)==local(t)
 assert (tn[tp[tn.index(f['targetRawNode'])]] if tn.index(f['targetRawNode']) in tp else None)==f['targetParentName']
assert len(fit['externalFrames'])==15
targetHair=[m['name'] for m in target.doc['materials'] if '_HAIR'in m['name']];assert set(targetHair)==set(fit['hideOriginal']['materialNames'])
r={'passed':True,'pins':{g.path:sha(g.raw) for g in [source,target,hair]},'fitSHA':sha((ROOT/'assets-source/native-vroid-hair-equipment-v1/generated/fit.json').read_bytes()),'meshes':meshes,'activeSkinJoints':len(skinActive),'ownedNodes':len(hn),'externalFrames':len(fit['externalFrames']),'springCounts':{'sourceAll':len(se['springs']),'hairOnly':len(he['springs']),'colliders':len(he['colliders']),'groups':len(he['colliderGroups'])},'centers':sorted(set(s['center'] for s in he['springs'])),'targetOriginalHairMaterials':targetHair,'scope':'Source/output GLB exact attribute/index/positive joint/IBM/material-image and spring membership readback. Runtime posed binding and lifecycle separate.'}
(OUT/'source-readback.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
