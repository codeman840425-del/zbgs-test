"""One bounded offline weight fit on measured lower hem domain; no source position changes."""
from pathlib import Path
import ast,gzip,json,struct,hashlib
import numpy as np
from scipy.optimize import minimize,LinearConstraint,Bounds
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';D=S/'top-hem-fit-v1';e=json.loads((D/'source-fit-evidence.json').read_text());h=R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py';t=ast.parse(h.read_text());exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name=='load'],type_ignores=[]),str(h),'exec'),globals())
raw,d,read=load(R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb');p=d['meshes'][0]['primitives'][0];P=read(p['attributes']['POSITION']);F=read(p['indices']).reshape(-1,3);J=read(p['attributes']['JOINTS_0']);W=read(p['attributes']['WEIGHTS_0']);skin=d['skins'][0];names=[d['nodes'][i]['name']for i in skin['joints']];inv=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);dense=np.zeros((len(P),len(names)))
for k in range(4):np.add.at(dense,(np.arange(len(P)),J[:,k]),W[:,k])
br,bd,ba=load(R/'prototype/public/assets/foundation/base-female-roundtrip.vrm');bp=bd['meshes'][0]['primitives'][0];BF=ba(bp['indices']).reshape(-1,3);BJ=ba(bp['attributes']['JOINTS_0']);BW=ba(bp['attributes']['WEIGHTS_0']);bs=bd['skins'][next(n['skin']for n in bd['nodes']if n.get('mesh')==0)];bn=[bd['nodes'][i]['name']for i in bs['joints']]
cap=json.loads(gzip.decompress((S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()));ids=np.array([r['topVertex']for r in e['nearestSourceCorrespondences']]);index={int(v):i for i,v in enumerate(ids)};target=dense.copy();origin=[]
for rec in e['nearestSourceCorrespondences']:
 i=rec['topVertex'];target[i]=np.array([rec['bodyTransferredWeights'].get(n,0)for n in names])
for i in e['coreVertices']:
 candidates=[(row['frame'],next(q for q in row['coreVertexNearest']if q['topVertex']==i))for row in e['rows']];frn,q=min(candidates,key=lambda x:x[1]['signedNearestMetres']);fr=cap['frames'][frn-1];body=next(x for x in fr['colliders']if x['name']=='Bodybaked');positions=np.array(body['positions']).reshape(-1,3);tri=positions[BF[q['bodyFace']]];coeff=np.linalg.lstsq((tri[1:]-tri[0]).T,np.array(q['nearestPointWorld'])-tri[0],rcond=None)[0];bary=np.maximum(np.r_[1-coeff.sum(),coeff],0);bary/=bary.sum();weights=np.zeros(len(names))
 for vi,factor in zip(BF[q['bodyFace']],bary):
  for j,w in zip(BJ[vi],BW[vi]):
   if w*factor>1e-7 and bn[j]not in names:raise ValueError((i,frn,q['bodyFace'],bn[j],float(w*factor)))
   if bn[j]in names:weights[names.index(bn[j])]+=w*factor
 weights/=weights.sum();target[i]=weights;origin.append({'topVertex':i,'worstFrame':frn,'bodyFace':q['bodyFace'],'barycentric':bary.tolist(),'targetWeights':{n:float(w)for n,w in zip(names,weights)if w>1e-6}})
# One scalar transfer amount per source point, smooth within this existing hem band.
mat=lambda x:np.array(x).reshape(4,4).T;palettes=np.array([[mat(fr['bones'][n])for n in names]for fr in cap['frames']])@inv;HP=np.c_[P,np.ones(len(P))];bybone=np.einsum('fbij,vj->fvbi',palettes,HP)[:,:,:,:3];delta=np.einsum('fvbi,vb->fvi',bybone,target-dense);C=[];rhs=[];details=[]
for row in e['rows']:
 k=row['frame']-1
 for q in row['coreVertexNearest']:
  i=q['topVertex'];co=float(np.dot(q['nearestNormalWorld'],delta[k,i]));line=np.zeros(len(ids));line[index[i]]=co;C.append(line);rhs.append(.0024-q['signedNearestMetres']);details.append({'frame':k+1,'vertex':i,'oldSigned':q['signedNearestMetres'],'coefficient':co,'requiredIncrement':rhs[-1]})
C=np.array(C);rhs=np.array(rhs);edges=np.unique(np.sort(np.concatenate([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]),axis=1),axis=0);L=np.zeros((len(ids),len(ids)))
for a,b in edges:
 if int(a)in index and int(b)in index:
  i=index[int(a)];j=index[int(b)];L[i,i]+=1;L[j,j]+=1;L[i,j]-=1;L[j,i]-=1
 elif int(a)in index:L[index[int(a)],index[int(a)]]+=1
 elif int(b)in index:L[index[int(b)],index[int(b)]]+=1
H=np.eye(len(ids))+L;upper=np.ones(len(ids));upper[P[ids,1]>=.975]=0
# Explicit convex minimum-transfer fit, no parameter search. Record infeasibility rather than hide it.
constraints=LinearConstraint(C,rhs,np.inf);fit=minimize(lambda x:float(x@H@x),np.full(len(ids),.3),jac=lambda x:2*H@x,bounds=Bounds(np.zeros(len(ids)),upper),constraints=[constraints],method='SLSQP',options={'maxiter':200,'ftol':1e-10});x=np.clip(fit.x,0,upper);res=C@x-rhs
report={'status':'plane-feasible'if res.min()>-1e-7 else'plane-infeasible','optimizerSuccess':bool(fit.success),'message':fit.message,'iterations':fit.nit,'maximumPlaneDeficitMetres':float(max(0,-res.min())),'targetMarginMetres':.0024,'scopeYBelow':.98,'fixedUpperBandYAtLeast':.975,'regularization':'identityplusunweightedexistingedgeLaplacian; minimumtotaltransfer, no tuning sweep','localVertexIds':ids.tolist(),'transferAmounts':x.tolist(),'targetWeightVectors':target[ids].tolist(),'jointNames':names,'worstFrameBodyCorrespondences':origin,'planeFailures':[details[k]|{'residual':float(res[k])}for k in np.flatnonzero(res< -1e-7)],'sourceSha256':hashlib.sha256(raw).hexdigest(),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'limits':['Local signed planes are preparation constraints only; fullactualtriangles60frames remain required.','This changes weights, not sourcegeometry or runtimeactions.']};(D/'weight-fit-plan.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['status','optimizerSuccess','message','iterations','maximumPlaneDeficitMetres']}));print('maxtransfer',x.max(),'failedconstraints',len(report['planeFailures']))
