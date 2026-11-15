"""Read-only witness geometry for a possible one-off source gap edit.
No vertex edit; closest-witness movement is NOT a final triangle gate.
"""
from pathlib import Path
import ast,gzip,json
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';D=S/'private-layer-initial';O=S/'active-layer-admission-v1';O.mkdir(exist_ok=True)
f=json.loads(gzip.decompress((D/'capture.json.gz').read_bytes()))['frames'][0];regions=json.loads((D/'region-admission.json').read_text(encoding='utf-8'))['regions'];functions=ast.parse((R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py').read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in functions.body if isinstance(n,ast.FunctionDef)and n.name=='point_tri'],type_ignores=[]),'distance-reuse','exec'),globals())
p=[];t=[];offset=0
for m in f['skirt']:
 q=np.array(m['positions']).reshape(-1,3);p.extend(q);t.extend(np.array(m['triangles']).reshape(-1,3)+offset);offset+=len(q)
p=np.array(p);t=np.array(t);body=next(m for m in f['colliders']if m['name']=='Bodybaked');top=next(m for m in f['colliders']if m['name']=='m1-uniform-top_1');B=np.array(body['positions']).reshape(-1,3)[np.array(body['triangles']).reshape(-1,3)];T=np.array(top['positions']).reshape(-1,3)[np.array(top['triangles']).reshape(-1,3)]
def closest_point(q,tri):
 a,b,c=tri;u=b-a;v=c-a;n=np.cross(u,v);normal=n/np.linalg.norm(n);project=q-np.dot(q-a,normal)*normal;d=project-a;den=np.dot(u,u)*np.dot(v,v)-np.dot(u,v)**2;alpha=(np.dot(d,u)*np.dot(v,v)-np.dot(d,v)*np.dot(u,v))/den;beta=(np.dot(d,v)*np.dot(u,u)-np.dot(d,u)*np.dot(u,v))/den
 choices=[]
 if alpha>=0 and beta>=0 and alpha+beta<=1:choices.append(project)
 for x,y in [(a,b),(b,c),(c,a)]:
  edge=y-x;choices.append(x+np.clip(np.dot(q-x,edge)/np.dot(edge,edge),0,1)*edge)
 return min(choices,key=lambda x:np.linalg.norm(q-x))
def closest_segments(a,b,c,d):
 u=b-a;v=d-c;w=a-c;A=u@u;B=u@v;C=v@v;D=u@w;E=v@w;den=A*C-B*B;s=np.clip((B*E-C*D)/den,0,1)if den>1e-25 else 0.;tt=(B*s+E)/C
 if tt<0:tt=0.;s=np.clip(-D/A,0,1)
 elif tt>1:tt=1.;s=np.clip((B-D)/A,0,1)
 return a+s*u,c+tt*v
def closest_tri(a,b):
 pairs=[(x,closest_point(x,b))for x in a]+[(closest_point(x,a),x)for x in b]
 pairs.extend(closest_segments(x,y,z,w)for x,y in zip(a,np.roll(a,-1,axis=0))for z,w in zip(b,np.roll(b,-1,axis=0)))
 return min(pairs,key=lambda q:np.linalg.norm(q[0]-q[1]))
def ray_distance(origin,direction,tri):
 a=tri[:,0];e1=tri[:,1]-a;e2=tri[:,2]-a;h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.einsum('ij,ij->i',e1,h);valid=abs(det)>1e-12;inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=origin-a;u=inv*np.einsum('ij,ij->i',s,h);q=np.cross(s,e1);v=inv*(q@direction);dist=inv*np.einsum('ij,ij->i',e2,q);hits=dist[valid&(u>=0)&(v>=0)&(u+v<=1)&(dist>1e-8)];return float(hits.min())if len(hits)else None
rows=[]
for region in regions:
 if not region['region'].startswith('transition'):continue
 record=next(x for x in region['standingClearances']if x['name']=='m1-uniform-top_1')
 if record.get('distanceMetres',1)>=.002:continue
 skirtFace=record['skirtFace'];topFace=record['otherFace'];a,b=closest_tri(p[t[skirtFace]],T[topFace]);direction=a-b;distance=np.linalg.norm(direction);direction/=distance;wanted=b+direction*.002;bodyDist=float(np.sqrt(point_tri(np.broadcast_to(wanted,(len(B),3)),B).min()));topDist=float(np.sqrt(point_tri(np.broadcast_to(wanted,(len(T),3)),T).min()));corridor=ray_distance(b,direction,B);rows.append({'region':region['region'],'skirtFace':skirtFace,'topFace':topFace,'actualGapMetres':float(distance),'skirtPoint':a.tolist(),'topPoint':b.tolist(),'normalDirection':direction.tolist(),'moveTo2mmTopPoint':wanted.tolist(),'moveDistanceMetres':float(np.linalg.norm(wanted-a)),'movedPointBodyDistanceMetres':bodyDist,'movedPointTopDistanceMetres':topDist,'topToBodyAlongWitnessRayMetres':corridor,'has4mmDirectionalCorridor':None if corridor is None else corridor>=.004,'pointOnlyBoth2mm':bodyDist>=.002-1e-8 and topDist>=.002-1e-8})
report={'build':'58394ce674e4','scope':'Actual active row0-2 closest witnesses only; no source edits','rows':rows,'limits':['No claim that one ray proves global source infeasibility.','Even a passing point cannot certify moved whole triangles or neighboring source surfaces.','No collision threshold or static reserve was changed.']}
(O/'witness-space.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(rows,indent=2))
