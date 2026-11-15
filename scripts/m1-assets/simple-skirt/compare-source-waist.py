"""Same269 original raw skinned waist vs new source; not displayed guide geometry."""
from pathlib import Path
import json,gzip,struct
import numpy as np
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';G=S/'generated-v3'
def load(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);binary=b[28+n:]
 def read(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt=np.dtype({5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);return np.ndarray((a['count'],width),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dt.itemsize),dt.itemsize)).copy()
 p=d['meshes'][0]['primitives'][0];skin=d['skins'][0]
 return {'p':read(p['attributes']['POSITION']),'f':read(p['indices']).reshape(-1,3),'j':read(p['attributes']['JOINTS_0']),'w':read(p['attributes']['WEIGHTS_0']),'names':[d['nodes'][i]['name']for i in skin['joints']],'inverse':read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)}
old=load(R/'prototype/public/assets/m1/m1-uniform-skirt.glb');new=load(G/'m1-sixfold-skirt-v3.glb');top=load(R/'prototype/public/assets/m1/m1-uniform-top.glb')
top_edit=json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/top-edit.json').read_text(encoding='utf-8'));top_caps=set(top_edit['removedOriginalFaces']);skirt_caps=set(json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/edit.json').read_text(encoding='utf-8'))['removedOriginalFaces'])
top_sides=top['f'][[i for i in range(len(top['f']))if i not in top_caps]];hem_floor=float(top['p'][np.unique(top_sides),1].min())
upper_old=[i for i,f in enumerate(old['f'])if i not in skirt_caps and float(old['p'][f,1].max())>=hem_floor];upper_new=[i for i,f in enumerate(new['f'])if float(new['p'][f,1].max())>=hem_floor]
def pose(mesh,frame):
 palette=np.array([np.array(frame['bones'][n]).reshape(4,4).T for n in mesh['names']])@mesh['inverse'];p=np.c_[mesh['p'],np.ones(len(mesh['p']))]@np.array(frame['sourceBind']).reshape(4,4);q=np.zeros_like(p)
 for k in range(4):q+=np.einsum('nij,nj->ni',palette[mesh['j'][:,k]],p)*mesh['w'][:,k,None]
 return q[:,:3]
def weighted(mesh,faces):
 ids=np.unique(mesh['f'][faces]);result={}
 for i in ids:
  for j,w in zip(mesh['j'][i],mesh['w'][i]):
   if w>0:result[mesh['names'][j]]=result.get(mesh['names'][j],0)+float(w)/len(ids)
 return result
capture=json.loads(gzip.decompress((S/'input-269/four-poses.json.gz').read_bytes()));rows=[]
for frame in capture['frames']:
 old_world=pose(old,frame);new_world=pose(new,frame);check=float(np.linalg.norm(old_world-np.array(frame['sourceSkirt']['positions']).reshape(-1,3),axis=1).max());assert check<2e-6
 tests=[]
 for label,mesh,points,selected in [('original-source-open-waist',old,old_world,upper_old),('candidate-v3-source',new,new_world,upper_new)]:
  tree=BVHTree.FromPolygons(points.tolist(),mesh['f'].tolist(),all_triangles=True);found=[]
  for m in frame['colliders']:
   if m['name'] not in ['Bodybaked','m1-uniform-top_1']:continue
   p=np.array(m['positions']).reshape(-1,3);f=np.array(m['triangles']).reshape(-1,3);bt=BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True);all_pairs=tree.overlap(bt);all_pairs=[(a,b)for a,b in all_pairs if label!='original-source-open-waist'or a not in skirt_caps];upper=[(a,b)for a,b in all_pairs if a in selected];open_upper=[(a,b)for a,b in upper if m['name']!='m1-uniform-top_1'or b not in top_caps]
   found.append({'collider':m['name'],'allNonSkirtCapPairs':len(all_pairs),'upperBandPairsClosedTop':len(upper),'upperBandPairsOpenTop':len(open_upper),'upperBandOriginalColliderFacePairs':open_upper})
  tests.append({'source':label,'collisions':found})
 rows.append({'pose':frame['label'],'sitProgress':frame['snapshot']['motion']['sitProgress'],'originalSourceWorldReadbackErrorMetres':check,'tests':tests})
out={'build':'269a73423c97','definition':{'sourceBindYAtOrAbove':hem_floor,'why':'Lowest vertex of actual original top side triangles, after excluding known internalcap. Conservative potential under-vest band; boundary-crossing triangles included.','originalSkirtCapExcluded':sorted(skirt_caps),'originalSelectedFaces':len(upper_old),'newSelectedFaces':len(upper_new)},'meanWeightsUpperBand':{'original':weighted(old,upper_old),'candidate':weighted(new,upper_new)},'poses':rows,'limits':['Source raw SkinnedMesh, never substituted displayed point-guide mesh.','Actual old-skirt hand geometry still captured; new layer needs runtime refit.','Not normalized to triangle count; unequal source topology means pair counts are not percent improvement.','Potential coverage band is geometric source definition, not approved visibility-based body deletion.']}
(G/'source-waist-comparison.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8');print(json.dumps({'definition':out['definition'],'weights':out['meanWeightsUpperBand'],'poses':[{'pose':r['pose'],'tests':[{'source':t['source'],'collisions':[{k:v for k,v in c.items()if k!='upperBandOriginalColliderFacePairs'}for c in t['collisions']]}for t in r['tests']]}for r in rows]},indent=2))
