"""Small isolated one-pass source rest fit. No browser/Blender or runtime edits.
Does not claim BVH clearance; output is rejected/pending until independently checked.
"""
import hashlib,json,pathlib
import numpy as np
R=pathlib.Path(__file__).resolve().parents[2];O=R/'assets-source/m1/offline-corrective/open-waist-v1'
cfg=json.loads((O/'layer-fit-config.json').read_text(encoding='utf8'));capturePath=R/cfg['capture'];c=json.loads(capturePath.read_text(encoding='utf8'));edit=json.loads((O/'edit.json').read_text(encoding='utf8'));topo=json.loads((O/'topology.json').read_text(encoding='utf8'))
used=np.array(edit['resultRenderVertexToOriginal']);original=np.array(c['displayed']['positions'])[used];mapping=np.array(topo['renderToWeld']);counts=np.bincount(mapping);points=np.zeros((len(topo['position']),3));np.add.at(points,mapping,original);points/=counts[:,None];fitted=points.copy()
def surface(name):
 m=next(m for m in c['colliders']if m['name']==name);p=np.array(m['positions']);ids=np.array(m['triangles']).reshape(-1,3)
 if name=='m1-uniform-top_1':
  editTop=json.loads((O/'top-edit.json').read_text(encoding='utf8'));ids=np.delete(ids,editTop['removedOriginalFaces'],axis=0)
 tri=p[ids];return tri,tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]
body=surface('Bodybaked');top=surface('m1-uniform-top_1');hip=np.array(c['hipWorld']).reshape(4,4).T;axis=hip[:3,3];issues=[];rows=[]
def ray(origin,direction,surface):
 tri,e1,e2=surface;h=np.cross(direction,e2);det=np.sum(e1*h,axis=1);valid=np.abs(det)>1e-10;inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=origin-tri[:,0];u=inv*np.sum(s*h,axis=1);q=np.cross(s,e1);v=inv*np.sum(direction*q,axis=1);t=inv*np.sum(e2*q,axis=1)
 hit=t[valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(t>0)&(t<.5)];return float(min(hit))if len(hit)else None
for i,p in enumerate(points):
 if p[1]<cfg['minimumFitWorldY']:continue
 origin=axis.copy();origin[1]=p[1];direction=p-origin;radius=np.linalg.norm(direction);direction/=radius
 b=ray(origin,direction,body);t=ray(origin,direction,top);underlap=False
 if t is None:
  # The coarse skirt triangle spans the actual top hem even when its low
  # vertex lies below that edge. Tailor the configured underlap allowance;
  # this is an offline rest edit, not a new runtime constraint or hidden top.
  # Use the actual smallest hem radius through the overlap band, rather
  # than its higher/flared endpoint. 1mm samples are authoring diagnostics;
  # the full triangle gate below still decides geometric acceptance.
  limits=[]
  for height in np.linspace(.001,cfg.get('hemUnderlap',0),round(cfg.get('hemUnderlap',0)/.001)):
   elevated=origin.copy();elevated[1]+=height;hit=ray(elevated,direction,top)
   if hit is not None:limits.append(hit)
  t=min(limits)if limits else None;underlap=t is not None
 if t is None:continue
 if b is None:issues.append({'vertex':i,'reason':'No torso exit despite top hit'});continue
 low,high=b+cfg['bodyMargin'],t-cfg['topMargin']
 if low>high:issues.append({'vertex':i,'reason':'Contradictory physical layers','body':b,'top':t});continue
 target=np.clip(radius,low,high);fitted[i]=origin+direction*target;delta=abs(target-radius)
 if delta>cfg['maximumDisplacement']:issues.append({'vertex':i,'reason':'Source edit too large','metres':delta})
 rows.append({'vertex':i,'radiusBefore':float(radius),'radiusAfter':float(target),'bodyExitRadius':b,'topRadius':t,'delta':float(delta),'hemUnderlap':underlap})
local=(np.c_[fitted,np.ones(len(fitted))]@np.linalg.inv(hip).T)[:,:3]
report={'schema':'m1.offline-fitted-rest.1','status':'rejected-contradictory-bounds'if issues else'prepared-pending-full-triangle-validation',
 'captureSHA256':hashlib.sha256(capturePath.read_bytes()).hexdigest(),'sourceOpenWaistSHA256':edit['resultSha256'],'config':cfg,'bodyGeometryUnchanged':True,'topSidewallAndTieUnchanged':True,'topInternalCapRemovedFaces':20,'issues':issues,
 'fitRows':rows,'maxDisplacement':float(np.max(np.linalg.norm(fitted-points,axis=1))),'positionsWorld':fitted.tolist(),'positionsHipLocal':local.tolist(),'renderToWeld':mapping.tolist(),'triangles':topo['triangles'],'renderTriangles':topo['renderTriangles'],'uv':topo['uv'],'hipWorld':c['hipWorld']}
(O/'standing-rest-candidate.json').write_text(json.dumps(report,indent=2),encoding='utf8')
# Editable OBJ retains UV loops and each surviving source render vertex. The
# original rigged GLB is separate; OBJ is explicitly an offline authoring shape.
lines=['# Offline standing-rest candidate, not rigged/runtime approved']
for p in local[mapping]:lines.append('v %.9g %.9g %.9g'%tuple(p))
for uv in topo['uv']:lines.append('vt %.9g %.9g'%tuple(uv))
for t in topo['renderTriangles']:lines.append('f '+' '.join(f'{i+1}/{i+1}'for i in t))
(O/'standing-rest-candidate.obj').write_text('\n'.join(lines)+'\n',encoding='utf8')
print(json.dumps({'status':report['status'],'maxDisplacement':report['maxDisplacement'],'fitVertices':len(rows),'issues':issues}))
