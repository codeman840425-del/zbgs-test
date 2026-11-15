"""Independent final exported source gate. Frozen attempt, no correction."""
from pathlib import Path
import ast,struct,json,gzip,hashlib
import numpy as np
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'local-retailor-v1'
assert not(O/'geometry-gate.json').exists()
def reuse(path,names):
 t=ast.parse(path.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-blender-seated-author-v1.py',['load']);reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed','tree']);reuse(R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py',['point_tri','seg_seg','near_minimum'])
mesh=np.load(O/'author-meshes.npz');cap=json.loads(gzip.decompress((S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()));bodyPath=R/'prototype/public/assets/foundation/base-female-roundtrip.vrm';sourceTop=asset(R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb');sourceSkirt=asset(S/'two-quad-thirds-v1/m1-sixfold-skirt-two-quad-thirds-v1.glb');pants=asset(R/'prototype/public/assets/m1/m1-training-pants.glb');assets={};mappings={};references={};report={'status':'pending','sourceBodySha256':hashlib.sha256(bodyPath.read_bytes()).hexdigest(),'frames':[],'assets':{},'limits':['Actual exportedsource replay at frozen58394, not currentruntime acceptance','No newhand response after staticmorph, allactualBodyfaces still included','Other twointermediateposes use linear shape fraction only for diagnostic, not a finished driver','Original remotesource top intersections separated, not hidden or globallyclaimed repaired','No second construction or thresholdchange']}
for role,name in [('top','m1-sidevent-top-retailor-v1'),('skirt','m1-panel-skirt-retailor-v1')]:
 path=O/(name+'.glb');a=asset(path);raw,d,read=load(path);m=np.concatenate([read(p['targets'][0]['POSITION'])for p in d['meshes'][0]['primitives']]);N=np.concatenate([read(p['targets'][0]['NORMAL'])for p in d['meshes'][0]['primitives']]);P=mesh[role+'Basis'];Q=mesh[role+'Target'];mapping=[]
 for p,q in zip(a['P'],a['P']+m):
  error=np.linalg.norm(P-p,axis=1)+np.linalg.norm(Q-q,axis=1);j=int(error.argmin());assert error[j]<4e-6,(role,j,error[j]);mapping.append(j)
 mapping=np.array(mapping);assets[role]=(a,m);mappings[role]=mapping;report['assets'][role]={'file':str(path.relative_to(R)).replace(chr(92),'/'),'sha256':a['sha'],'exportVerticesFaces':[len(a['P']),len(a['F'])],'sourceVerticesFaces':[len(P),len(mesh[role+'Faces'])],'morphNormalPresent':True,'maxBindReplayM':float(np.max(np.linalg.norm(a['P']+m-Q[mapping],axis=1)))};references[role]={'candidateVertexToSource':mapping.tolist()}
def matstats(P,Q,F):
 E=np.unique(np.sort(np.concatenate([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]),axis=1),axis=0);length=lambda x:np.linalg.norm(x[E[:,0]]-x[E[:,1]],axis=1);area=lambda x:np.linalg.norm(np.cross(x[F[:,1]]-x[F[:,0]],x[F[:,2]]-x[F[:,0]]),axis=1)/2;L=length(P);er=length(Q)/np.maximum(L,1e-15);A=area(P);ar=area(Q)/np.maximum(A,1e-15);j=int(er.argmax());return {'edgeRatio':[float(er.min()),float(er.max())],'areaRatio':[float(ar.min()),float(ar.max())],'worstEdge':{'vertices':E[j].tolist(),'basisLengthM':float(L[j]),'targetLengthM':float(length(Q)[j])},'minimumAreaM2':float(area(Q).min()),'maxPointEditM':float(np.linalg.norm(Q-P,axis=1).max())}
for no in [1,29,35,60]:
 fr=cap['frames'][no-1];w=0. if no==1 else(1. if no==60 else min(1.,(no-3)/57));B=next(x for x in fr['colliders']if x['name']=='Bodybaked');BP=np.array(B['positions']).reshape(-1,3);BF=np.array(B['triangles']).reshape(-1,3);bt=tree(BP,BF);worlds={};row={'frame':no,'shapeWeight':w,'diagnosticInterpolation':no in [29,35],'garments':{}}
 for role,(a,m)in assets.items():
  orig=a['P'].copy();a['P']=orig+m*w;Q=posed(a,fr,role=='skirt');a['P']=orig;mapping=mappings[role];source=sourceTop if role=='top'else sourceSkirt;ww=np.array([np.array(fr['bones'][n]).reshape(4,4).T for n in source['names']])
  if role=='skirt':
   for cc in fr['controls']:ww[source['names'].index(cc['name'])]=np.array(cc['privateWorld']).reshape(4,4).T
  pp=ww@source['inv'];jj=source['J'][mesh['topOrigin']]if role=='top'else mesh['skirtJ'];wt=source['W'][mesh['topOrigin']]if role=='top'else mesh['skirtW'];hp=np.c_[mesh[role+'Basis']+(mesh[role+'Target']-mesh[role+'Basis'])*w,np.ones(len(jj))];expected=sum(np.einsum('nij,nj->ni',pp[jj[:,k]],hp)*wt[:,k,None]for k in range(4))[:,:3];world=np.empty_like(expected);maxReplay=0.
  for j in range(len(world)):
   err=np.linalg.norm(orig-mesh[role+'Basis'][j],axis=1)+np.linalg.norm(orig+m-mesh[role+'Target'][j],axis=1)+np.linalg.norm(Q-expected[j],axis=1);i=int(err.argmin());assert err[i]<5e-6,(role,j,err[i]);world[j]=Q[i];maxReplay=max(maxReplay,float(np.linalg.norm(Q[i]-expected[j])))
  if no==60:
   newmap=[]
   for i in range(len(Q)):
    err=np.linalg.norm(mesh[role+'Basis']-orig[i],axis=1)+np.linalg.norm(mesh[role+'Target']-orig[i]-m[i],axis=1)+np.linalg.norm(expected-Q[i],axis=1);newmap.append(int(err.argmin()))
   references[role]['candidateVertexToSource']=newmap
  F=mesh[role+'Faces'];worlds[role]=world;ct=tree(world,F);pairs=sorted(ct.overlap(bt));lookup={};vmap=[]
  for p in np.round(mesh[role+'Basis'],7):lookup.setdefault(tuple(p),len(lookup));vmap.append(lookup[tuple(p)])
  wf=np.array(vmap)[F];selfpairs=[(i,j)for i,j in ct.overlap(ct)if i<j and not(set(wf[i])&set(wf[j]))];chairs=[]
  for box in fr['chair']:
   lo=box['min'];hi=box['max'];P=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(box['matrixWorld']).reshape(4,4);bf=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]];chairs.append({'name':box['name'],'pairs':sorted(ct.overlap(tree(P[:,:3],np.array(bf))))})
  gate={'exportReplayMaxM':maxReplay,'bodyPairs':pairs,'selfPairs':selfpairs,'chair':chairs,'material':matstats(mesh[role+'Basis'],world,F)}
  if role=='top':
   local=np.any(mesh['topBasis'][F,1]<.98,axis=1);localPairs=[(i,j)for i,j in pairs if local[i]];old=posed(sourceTop,fr);oldpairs=set(map(tuple,tree(old,sourceTop['F']).overlap(bt)));gate.update(localBodyPairs=localPairs,newBodyPairs=sorted(set(map(tuple,pairs))-oldpairs),oldBodyPairCount=len(oldpairs),localBodyMin=({'distanceMetres':0.}if localPairs else near_minimum(world[F[local]],BP[BF],range=.003)),pantsPairs=sorted(ct.overlap(tree(posed(pants,fr),pants['F']))))
  row['garments'][role]=gate
 row['topSkirtPairs']=sorted(tree(worlds['top'],mesh['topFaces']).overlap(tree(worlds['skirt'],mesh['skirtFaces'])));report['frames'].append(row)
 if no in [1,60]:
  for role in assets:references[role]['standingWorld'if no==1 else'targetWorld']=worlds[role].tolist()
report['status']='rejected'if any(r['garments']['top']['localBodyPairs']or r['garments']['skirt']['bodyPairs']or r['topSkirtPairs']or any(g['selfPairs']or any(c['pairs']for c in g['chair'])or g['material']['edgeRatio'][1]>1.25 or g['material']['minimumAreaM2']<1e-12 for g in r['garments'].values())for r in report['frames']if r['frame']in[1,60])else'static-source-gates-only-visual-pending'
# Actual shared source boundary and panel lengths are independently reported, not replaced by edge ratios.
rows=mesh['skirtRows'];paths=np.stack([mesh['skirtBasis'][rows],np.array(references['skirt']['targetWorld'])[rows]]);report['panelAxialPathsM']=[np.linalg.norm(np.diff(p,axis=0),axis=2).sum(0).tolist()for p in paths];report['lowerRingCircumferencesM']=[np.linalg.norm(p-np.roll(p,-1,axis=1),axis=2).sum(1).tolist()for p in paths]
(O/'geometry-gate.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');(O/'gpu-target-reference.json').write_text(json.dumps(references)+'\n',encoding='utf-8');print(json.dumps({'status':report['status'],'frames':[{'frame':r['frame'],'topLocalBody':len(r['garments']['top']['localBodyPairs']),'skirtBody':len(r['garments']['skirt']['bodyPairs']),'topSkirt':len(r['topSkirtPairs']),'skirtSelf':len(r['garments']['skirt']['selfPairs']),'skirtChair':[len(c['pairs'])for c in r['garments']['skirt']['chair']],'edge':[r['garments'][k]['material']['edgeRatio']for k in ['top','skirt']]}for r in report['frames']]}))
