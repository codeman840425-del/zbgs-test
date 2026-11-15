"""Actual GLB invariants, transition angles, and four-pose source interpolation error."""
from pathlib import Path
import importlib.util,json,gzip,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('space',ROOT/'scripts/audit-skirt-layer-space.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);O=m.S/'layer-transition-v1'
base=m.S/'generated-v4/m1-sixfold-skirt-v4.glb';new=O/'m1-sixfold-skirt-layer-transition-v1.glb';oldD,oldA,oldSHA=m.glb(base);newD,newA,newSHA=m.glb(new)
assert oldSHA=='cdd2d206650aa7375b335e42b8cea93dcebea9c9269e360124d198964240c885'and newSHA=='d7b5a881d1a64bdaf5e1d92a72573c2cef34abe859e53af0f9a2c8b091bd55fa'
op,np_=oldD['meshes'][0]['primitives'],newD['meshes'][0]['primitives']
for k in op[0]['attributes']:assert np.array_equal(oldA(op[0]['attributes'][k]),newA(np_[0]['attributes'][k]))
for x,y in zip(op,np_):assert np.array_equal(oldA(x['indices']),newA(y['indices']))
assert oldD['skins']==newD['skins']and oldD['materials']==newD['materials']
for k in op[1]['attributes']:
 before=oldA(op[1]['attributes'][k]);after=newA(np_[1]['attributes'][k]);assert np.array_equal(before[:20],after[:20])
 if k!='NORMAL':assert np.array_equal(before[504:],after[504:])
res={'parentSha256':oldSHA,'candidateSha256':newSHA,'invariants':{'original120AllAttributesExact':True,'allIndicesExact':True,'skinAndMaterialsExact':True,'first20BoundaryAllAttributesExact':True,'lower504PlusPositionWeightsUVExact':True},'ringDefinition':'Zero-based new lower rows, after preserved20 boundary vertices. ring3 is fourth modified row; ring4 fifth fixed row.'}
for label,d,a in [('v4',oldD,oldA),('candidate',newD,newA)]:
 p=d['meshes'][0]['primitives'][1];v=a(p['attributes']['POSITION']);f=a(p['indices']).reshape(-1,3);cross=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]);length=np.linalg.norm(cross,axis=1);norm=cross/np.maximum(length[:,None],1e-20);edges={}
 for i,tri in enumerate(f):
  for x,y in zip(tri,np.roll(tri,-1)):edges.setdefault(tuple(sorted([int(x),int(y)])),[]).append(i)
 rings={}
 for ring in [2,3,4,5]:
  vals=[]
  for col in range(120):
   pair=edges.get((20+ring*121+col,20+ring*121+col+1),[])
   if len(pair)==2:vals.append({'column':col,'degrees':float(np.degrees(np.arccos(np.clip(norm[pair[0]]@norm[pair[1]],-1,1)))),'faces':[int(x+120)for x in pair]})
  rings[str(ring)]={'max':max(x['degrees']for x in vals),'median':float(np.median([x['degrees']for x in vals])),'maximum':max(vals,key=lambda x:x['degrees'])}
 res[label]={'rings':rings,'minimumDoubleArea':float(length.min())}
 if label=='v4':oldnorm=norm.copy()
 else:res[label]['faceNormalOver90ComparedWithV4']=int(((norm*oldnorm).sum(1)<0).sum())
od,oa,_=m.glb(ROOT/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-skirt-open-waist.glb');old=m.primitive(od,oa,od['meshes'][0]['primitives'][0]);candidate=m.primitive(newD,newA,np_[1]);mapping=json.loads((O/'source-mapping.json').read_text())['vertices'];names=[od['nodes'][i]['name']for i in od['skins'][0]['joints']];ib=oa(od['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
def pose(mesh,palette):
 p=np.c_[mesh['p'],np.ones(len(mesh['p']))];out=np.zeros((len(p),4))
 for k in range(4):out+=np.einsum('nij,nj->ni',palette[mesh['j'][:,k]],p)*mesh['w'][:,k,None]
 return out[:,:3]
res['sourceInterpolationErrors']=[]
for frame in json.loads(gzip.decompress((m.S/'input-269/four-poses.json.gz').read_bytes()))['frames']:
 palette=np.array([np.array(frame['bones'][n]).reshape(4,4).T for n in names])@ib;oldWorld=pose(old,palette);newWorld=pose(candidate,palette);errors=[];prune=[]
 for row in mapping:
  i=row['lowVertex'];target=np.array(row['barycentric'])@oldWorld[old['f'][row['sourceTriangle']]];errors.append(float(np.linalg.norm(target-newWorld[i])));point=np.r_[candidate['p'][i],1];unpruned=np.einsum('b,bij,j->i',np.array(row['unprunedWeights']),palette,point)[:3];prune.append(float(np.linalg.norm(unpruned-newWorld[i])))
 res['sourceInterpolationErrors'].append({'pose':frame['label'],'maximumBarycentricPosedSourceVsNewLbsMetres':max(errors),'maximumPruningOnlyWorldErrorMetres':max(prune)})
res['limits']=['Increased24.76/17.44deg connection bends are unresolved source quality risk, not visual acceptance.','LBS of interpolated point/weights differs from barycentric interpolation of already-skinned source points; actual full gate required.','No corrected sitting garment response and no GPU run.']
(O/'geometry-check.json').write_text(json.dumps(res,indent=2)+'\n',encoding='utf-8');print(json.dumps({'invariants':res['invariants'],'sourceInterpolationErrors':res['sourceInterpolationErrors']},indent=2))
