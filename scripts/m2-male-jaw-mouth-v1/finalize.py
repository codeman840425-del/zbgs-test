"""Map freshly computed jaw-source coefficients; preserve raw, finalize normals."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,gzip,hashlib,copy
import numpy as np
from scipy.spatial import cKDTree
from normal_core import normals,append_vec3,write_glb
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-male-jaw-mouth-v1';SPEC=json.loads((BASE/'spec.json').read_text());src=SPEC['bodies']['male-jaw'];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
outname=sys.argv[sys.argv.index('--out')+1]if '--out'in sys.argv else 'generated';OUT=(BASE/outname).resolve();assert OUT.is_relative_to(BASE.resolve())and OUT!=BASE.resolve();folder=OUT/f'male-jaw-mouth-width-{round(SPEC["factors"][0]*100)}-v1';parent=ROOT/src['sourceVRM'];assert sha(parent)==src['sourceVRMSha256'];old=GLB(parent);mi=next(i for i,m in enumerate(old.doc['meshes'])if m['name'].startswith('Face'));mesh=old.doc['meshes'][mi];op=mesh['primitives'][0];pos=old.acc(op['attributes']['POSITION']);N=old.acc(op['attributes']['NORMAL']);tri=np.concatenate([old.acc(p['indices']).reshape(-1,3)for p in mesh['primitives']]);mapping=json.loads(gzip.decompress((folder/'mapping.json.gz').read_bytes()));sp=np.array(mapping['sourcePositions']);converted=sp[:,[0,2,1]].copy();converted[:,2]*=-1;tree=cKDTree(converted);dist,index=tree.query(pos);assert dist.max()<1e-6;sw=np.array(mapping['sourceVertexWeights']);w=sw[index];candidates=[]
for p,weight in zip(pos,w):
 choices=tree.query_ball_point(p,1e-6);assert choices and max(abs(sw[choices]-weight))<1e-10;candidates.append(choices)
selected=np.flatnonzero(w>0);affected=np.unique(tri[np.any(np.isin(tri,selected),axis=1)]);fixed=np.setdiff1d(np.arange(len(pos)),affected)
oldRecipe=json.loads((ROOT/'assets-source/face-parameters-v1/male-mouth-width.recipe.json').read_text());oldw=np.array(oldRecipe['weights']);oldMapping=json.loads(gzip.decompress((ROOT/'assets-source/face-parameters-v1/generated/male-mouth-width-104-v1/mapping.json.gz').read_bytes()));oldsp=np.array(oldMapping['sourcePositions']);sourceChanged=np.linalg.norm(sp-oldsp,axis=1)>1e-8
selection={'schema':'jaw-mouth-fresh-source-selection-v1','baseAvatarSha256':sha(parent),'meshIndex':mi,'sourceVertexMap':index.tolist(),'sourceVertexCandidates':candidates,'mappingMaxErrorM':float(dist.max()),'weights':w.tolist(),'centerX':mapping['centerX'],'selectedVertices':selected.tolist(),'normalNeighborhoodVertices':affected.tolist(),'protectedVertices':np.flatnonzero(w==0).tolist(),'oldRecipeComparison':{'path':'assets-source/face-parameters-v1/male-mouth-width.recipe.json','sha256':sha(ROOT/'assets-source/face-parameters-v1/male-mouth-width.recipe.json'),'weightMaxDifference':float(np.abs(w-oldw).max()),'nonzeroDomainEqual':bool(np.array_equal(w>0,oldw>0)),'centerDifferenceM':float(mapping['centerX']-oldRecipe['centerX']),'newSourceMappingWasRecomputed':True,'jawSourceChangedCountAbove10nm':int(sourceChanged.sum()),'activeSourcePointJawChangeMaxM':float(np.linalg.norm((sp-oldsp)[sw>0],axis=1).max())}}
(folder/'selection.json').write_text(json.dumps(selection,indent=2)+'\n',encoding='utf-8')
reports=[]
for rawname,finalname in [('addon-export.vrm','avatar.vrm'),('addon-repeat-export.vrm','repeat-export.vrm')]:
 out=folder/finalname;assert not out.exists(),f'Refuse overwrite {out}';raw=GLB(folder/rawname);rm=raw.doc['meshes'][mi];rp=rm['primitives'][0];q0=raw.acc(rp['attributes']['POSITION']);assert all(np.array_equal(old.acc(a['indices']),raw.acc(b['indices']))for a,b in zip(mesh['primitives'],rm['primitives']));assert all(set(t)=={'POSITION'}for p in rm['primitives']for t in p['targets']);absolute=[];rows=[]
 for ti,name in enumerate(['Basis']+mesh['extras']['targetNames']):
  q=q0.astype(float)+(raw.acc(rp['targets'][ti-1]['POSITION'])if ti else 0);before=pos.astype(float)+(old.acc(op['targets'][ti-1]['POSITION'])if ti else 0);computed=normals(q,tri);originalComputed=normals(before,tri);n=N.astype(float).copy();n[affected]=computed[affected];assert np.isfinite(n).all();absolute.append(n.astype('<f4'))
  angle=lambda a,b:float(np.degrees(np.arccos(np.clip(np.sum(a*b,axis=1)/np.maximum(np.linalg.norm(a,axis=1)*np.linalg.norm(b,axis=1),1e-30),-1,1))).max())
  rows.append({'name':name,'geometryNormalChangeMaxDegrees':angle(originalComputed[affected],computed[affected]),'finalVsJawAuthoredNormalMaxDegrees':angle(N[affected],n[affected]),'outsideNeighborhoodExact':bool(np.array_equal(n[fixed],N[fixed]))})
 doc=copy.deepcopy(raw.doc);blob=bytearray(raw.bin);baseAcc=append_vec3(doc,blob,absolute[0]);targets=[append_vec3(doc,blob,n.astype(float)-absolute[0].astype(float))for n in absolute[1:]]
 for p in doc['meshes'][mi]['primitives']:
  p['attributes']['NORMAL']=baseAcc
  for t,ni in zip(p['targets'],targets):t['NORMAL']=ni
 write_glb(out,doc,blob);reports.append({'raw':rawname,'rawSha256':sha(folder/rawname),'final':finalname,'finalSha256':sha(out),'shapes':rows})
 if rawname=='addon-export.vrm':np.savez_compressed(folder/'normal-reference.npz',absoluteNormals=np.stack(absolute),normalNeighborhood=affected)
assert reports[0]['finalSha256']==reports[1]['finalSha256']
(folder/'normal-export-report.json').write_text(json.dumps({'parentSha256':sha(parent),'generatorSha256':sha(Path(__file__)),'normalCoreSha256':sha(Path(__file__).with_name('normal_core.py')),'sourceMappingSha256':sha(folder/'mapping.json.gz'),'selectionSha256':sha(folder/'selection.json'),'rawTargetAttributes':['POSITION'],'finalTargetAttributes':['POSITION','NORMAL'],'normalNeighborhoodCount':len(affected),'jawOverlapReason':'28 vertices of mouth normal domain overlap jaw triangle neighborhood; recompute from actual jaw baseline, never original male authored normals.','exports':reports},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'out':outname,'selected':len(selected),'normalDomain':len(affected),'oldRecipeComparison':selection['oldRecipeComparison'],'finalSha256':reports[0]['finalSha256']},indent=2))
