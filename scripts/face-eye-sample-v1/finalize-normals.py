"""Preserve native raw export; generate final VRM with independent shape NORMALs.
Only this local endpoint's eye-adjacent normals change. No original file writes.
"""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,gzip,hashlib,copy
import numpy as np
from normal_core import normals,append_vec3,write_glb
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-eye-sample-v1'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
outname=sys.argv[sys.argv.index('--out')+1]if '--out'in sys.argv else 'generated';OUT=(BASE/outname).resolve();assert OUT.is_relative_to(BASE.resolve())and OUT!=BASE.resolve()
spec=json.loads((BASE/'spec.json').read_text());selection=json.loads((BASE/'selection.json').read_text());reports=[]
for sex,source in spec['bodies'].items():
 folder=OUT/f'{sex}-eye-{spec["sampleId"]}';old=GLB(ROOT/source['sourceVRM']);assert sha(ROOT/source['sourceVRM'])==source['sourceVRMSha256'];mi=next(i for i,m in enumerate(old.doc['meshes'])if m['name'].startswith('Face'));om=old.doc['meshes'][mi];op=om['primitives'][0];pos=old.acc(op['attributes']['POSITION']);normal=old.acc(op['attributes']['NORMAL']);tri=np.concatenate([old.acc(p['indices']).reshape(-1,3)for p in om['primitives']]);changed=np.array(selection['bodies'][sex]['selectedVertices']);affected=np.unique(tri[np.any(np.isin(tri,changed),axis=1)]);fixed=np.setdiff1d(np.arange(len(pos)),affected)
 exports=[];report=None
 for inputName,outputName in [('addon-export.vrm','avatar.vrm'),('addon-repeat-export.vrm','repeat-export.vrm')]:
  out=folder/outputName;assert not out.exists(),f'Refuse overwrite final: {out}'
  raw=GLB(folder/inputName);nm=raw.doc['meshes'][mi];np0=nm['primitives'][0];pnew=raw.acc(np0['attributes']['POSITION']);assert pnew.shape==pos.shape
  for a,b in zip(om['primitives'],nm['primitives']):assert np.array_equal(old.acc(a['indices']),raw.acc(b['indices']))
  assert all(set(t)=={'POSITION'}for p in om['primitives']for t in p['targets'])
  assert all(set(t)=={'POSITION'}for p in nm['primitives']for t in p['targets'])
  absolute=[];rawNormal=raw.acc(np0['attributes']['NORMAL']);rows=[]
  for ti,name in enumerate(['Basis']+om['extras']['targetNames']):
   q=pnew.astype(float)+(raw.acc(np0['targets'][ti-1]['POSITION'])if ti else 0)
   computed=normals(q,tri);target=normal.astype(float).copy();target[affected]=computed[affected]
   assert np.isfinite(target).all();assert np.array_equal(target[fixed],normal[fixed]);absolute.append(target.astype('<f4'))
   originalQ=pos.astype(float)+(old.acc(op['targets'][ti-1]['POSITION'])if ti else 0);oldComputed=normals(originalQ,tri)
   angle=lambda a,b:float(np.degrees(np.arccos(np.clip(np.sum(a*b,axis=1)/np.maximum(np.linalg.norm(a,axis=1)*np.linalg.norm(b,axis=1),1e-30),-1,1))).max())
   rows.append({'name':name,'geometricNormalChangeMaxDegrees':angle(oldComputed[affected],computed[affected]),'finalVsOriginalAuthoredNormalMaxDegrees':angle(normal[affected],target[affected]),'normalRecomputedVertexCount':len(affected),'outsideNeighborhoodExact':True})
  doc=copy.deepcopy(raw.doc);blob=bytearray(raw.bin);baseAcc=append_vec3(doc,blob,absolute[0]);targetAcc=[append_vec3(doc,blob,n.astype(float)-absolute[0].astype(float))for n in absolute[1:]]
  for p in doc['meshes'][mi]['primitives']:
   p['attributes']['NORMAL']=baseAcc
   for ti,t in enumerate(p['targets']):t['NORMAL']=targetAcc[ti]
  write_glb(out,doc,blob);exports.append(sha(out))
  if inputName=='addon-export.vrm':
   np.savez_compressed(folder/'normal-reference.npz',absoluteNormals=np.stack(absolute),normalNeighborhood=affected,positionChanged=changed)
   report={'sourceOriginalSHA256':source['sourceVRMSha256'],'rawAddonSHA256':sha(folder/inputName),'finalAvatarSHA256':sha(out),'oldTargetAttributes':['POSITION'],'rawTargetAttributes':['POSITION'],'finalTargetAttributes':['POSITION','NORMAL'],'normalNeighborhoodVertices':affected.tolist(),'preservedNormalVertices':fixed.tolist(),'rawBaseNormalChangedFromOriginalVertices':int((np.linalg.norm(rawNormal-normal,axis=1)>1e-8).sum()),'normalRule':'Each actual absolute shape separately area-weighted on complete Face topology; substitute only vertices of eye-affected triangles; outside preserve original authored base normals, matching original missing morph-NORMAL semantics.','shapes':rows,'generatorSha256':sha(Path(__file__)),'normalCoreSha256':sha(Path(__file__).with_name('normal_core.py'))}
 assert len(set(exports))==1
 report['repeatFinalSHA256']=exports[1]
 if outname!='generated':assert sha(BASE/'generated'/folder.name/'avatar.vrm')==exports[0]
 (folder/'normal-export-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');reports.append(report)
 print(sex,exports[0],'normalNeighborhood',len(affected),'rawNormalChanged',report['rawBaseNormalChangedFromOriginalVertices'])
(OUT/'normal-export-report.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf-8')
