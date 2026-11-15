"""Single fixed author solve; no parameter search or native cloth."""
from pathlib import Path
import json,hashlib,time
import numpy as np
from scipy.optimize import minimize,Bounds,LinearConstraint,NonlinearConstraint
R=Path(__file__).resolve().parents[3];O=R/'assets-source/m1/simple-skirt-v1/top-hem-corrective-v1';data=np.load(O/'author-constraints.npz');A=data['A'];rhs=data['rhs']*1000;E=data['E'];edge=data['edgeOriginal']*1000;length=data['edgeLength']*1000;H=np.eye(len(data['ids']))+4*E.T@E
# Heights in millimetres; preserve actual edge lengths and signed projected triangle area.
def lengthSlack(x):
 v=edge.copy();v[:,1]+=E@x;return 1.25*length-np.linalg.norm(v,axis=1)
def lengthJac(x):
 v=edge.copy();v[:,1]+=E@x;return -v[:,1,None]/np.maximum(np.linalg.norm(v,axis=1)[:,None],1e-10)*E
start=time.monotonic();fit=minimize(lambda x:float(x@H@x/2500),np.zeros(len(data['ids'])),jac=lambda x:2*H@x/2500,bounds=Bounds(np.zeros(len(data['ids'])),data['upper']*1000),constraints=[LinearConstraint(A,rhs,np.inf),LinearConstraint(data['normalC']/data['area2'][:,None]*.001,-.8,np.inf),NonlinearConstraint(lengthSlack,0,np.inf,jac=lengthJac)],method='SLSQP',options={'maxiter':300,'ftol':1e-9});x=fit.x;delta=np.zeros_like(data['posed']);delta[data['ids'],1]=x/1000;np.savez_compressed(O/'author-target.npz',worldTarget=data['posed']+delta,worldDelta=delta,ids=data['ids'],heights=x/1000)
report={'status':'author-constraint-feasible'if (A@x-rhs).min()>-1e-5 and lengthSlack(x).min()>-1e-5 else'author-constraint-failed','optimizerSuccess':bool(fit.success),'message':str(fit.message),'iterations':int(fit.nit),'seconds':time.monotonic()-start,'maxRequiredSupportDeficitMetres':max(0.,float((rhs-A@x).max()))/1000,'minimumEdgeSlackMetres':float(lengthSlack(x).min())/1000,'maxLiftMetres':float(x.max())/1000,'minProjectedAreaRatio':float((1+data['normalC']@(x/1000)/data['area2']).min()),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'constraintsSha256':hashlib.sha256((O/'author-constraints.npz').read_bytes()).hexdigest(),'limits':['Finite support rays are author constraints, not final bodytriangle proof.','One pose only, no continuous blend or runtime applied.','50mm author bound was fixed before solve, not changed to reach success.']};(O/'author-solve.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
