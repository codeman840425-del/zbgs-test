"""Read saved3-frame failure only; no cloth, fit edit or browser.
Run outside perf windows. Quantifies specific failures instead of blaming cloth generically.
"""
from pathlib import Path
import json,hashlib
import numpy as np
R=Path(__file__).resolve().parents[2];S=R/'assets-source/m1/offline-corrective/open-waist-v1';O=R/'assets-source/m1/cloth-admission-v1';O.mkdir(exist_ok=True)
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
rest=read(S/'standing-rest-candidate.json');capPath=R/'experiments/skirt-offline-corrective/displayed-initial-0df63cf2bdea/standing-01/initial.json';cap=read(capPath);result=read(R/'experiments/skirt-offline-corrective/standing-open-v1/result.json');failure=read(R/'experiments/skirt-offline-corrective/standing-open-v1/rejected-shape.json');cfg=read(S/'standing-cloth-config.json');valid=read(S/'native-initial-validation.json')
body=next(m for m in cap['colliders']if m['name']=='Bodybaked');bp=np.array(body['positions']);bf=np.array(body['triangles']).reshape(-1,3);bt=bp[bf];sf=np.array(rest['triangles']);reference=np.array(rest['positionsWorld']);hip=np.array(rest['hipWorld']).reshape(4,4).T;inv=np.linalg.inv(hip)
ba,bb,bc=bt[:,0],bt[:,1],bt[:,2];e0=bb-ba;e1=bc-ba;normals=np.cross(e0,e1);normals/=np.linalg.norm(normals,axis=1)[:,None]
d00=np.sum(e0*e0,axis=1);d01=np.sum(e0*e1,axis=1);d11=np.sum(e1*e1,axis=1);den=d00*d11-d01*d01
def nearest(point):
 signed=np.sum((point-ba)*normals,axis=1);projected=point-signed[:,None]*normals;v=projected-ba;d20=np.sum(v*e0,axis=1);d21=np.sum(v*e1,axis=1);u=(d11*d20-d01*d21)/den;w=(d00*d21-d01*d20)/den;inside=(u>=0)&(w>=0)&(u+w<=1);best=projected.copy();distance=np.where(inside,abs(signed),np.inf)
 for a,b in [(ba,bb),(bb,bc),(bc,ba)]:
  edge=b-a;t=np.clip(np.sum((point-a)*edge,axis=1)/np.sum(edge*edge,axis=1),0,1);p=a+t[:,None]*edge;d=np.linalg.norm(p-point,axis=1);mask=d<distance;distance[mask]=d[mask];best[mask]=p[mask]
 i=int(distance.argmin());return {'distance':float(distance[i]),'orientedDistance':float(np.sign((point-best[i])@normals[i])*distance[i]),'bodyFace':i,'nearest':best[i].tolist(),'normal':normals[i].tolist()}
affected=sorted(set(i for face,_ in failure['exactColliderPairs']['Bodybaked']for i in sf[face]));records=[]
samples=[('rest',reference)]+[(row['frame'],np.array(row['positionsWorld']))for row in result['frames']]
for name,points in samples:
 vertices=[]
 for i in affected:
  p=points[i];n=nearest(p);delta=p-reference[i];vertices.append({'id':int(i),'world':p.tolist(),'hipLocal':(inv@np.r_[p,1])[:3].tolist(),'deltaFromRest':delta.tolist(),'normalApproachFromRest':float(-delta@np.array(n['normal'])),'nearestBody':n})
 faces=[]
 for face,bodyface in failure['exactColliderPairs']['Bodybaked']:
  tri=points[sf[face]];plane=(tri-bt[bodyface,0])@normals[bodyface];edges=np.linalg.norm(tri-np.roll(tri,-1,axis=0),axis=1);altitude=np.linalg.norm(np.cross(tri[1]-tri[0],tri[2]-tri[0]))/edges.max()
  probes=[]
  for i in range(11):
   for j in range(11-i):
    bary=np.array([i,j,10-i-j])/10;p=bary@tri;n=nearest(p);probes.append({'bary':bary.tolist(),'world':p.tolist(),**n})
  nearestInside=min(probes,key=lambda x:x['orientedDistance']);faces.append({'skirtFace':face,'bodyFace':bodyface,'vertices':sf[face].tolist(),'vertexPlaneSignedDistances':plane.tolist(),'edgeLengths':edges.tolist(),'minimumAltitude':float(altitude),'aspectLongestEdgeOverAltitude':float(edges.max()/altitude),'sampleMinimumOrientedBodyDistance':nearestInside,'vertexDistances':[nearest(p)for p in tri]})
 records.append({'frame':name,'vertices':vertices,'faces':faces})
gap=(cfg['clothDistanceAuthoring']+cfg['colliderThicknessAuthoring'])/cfg['authoringScale'];mins={x['name']:x['exactNearTriangleMinimum']['distance']for x in valid['colliders']if x.get('exactNearTriangleMinimum')}
report={'schema':'m1.cloth-admission-measurement.1','purpose':'Specific saved initial failure diagnosis only; no source candidate or new trial yet','sourceHashes':{str(p.relative_to(R)):hashlib.sha256(p.read_bytes()).hexdigest()for p in [S/'standing-rest-candidate.json',capPath,R/'experiments/skirt-offline-corrective/standing-open-v1/result.json']},'collisionGapMetres':gap,'initialExactBodyAndTopDistances':mins,'residualStaticGapMetres':{k:v-gap for k,v in mins.items()},'nominalGravityOneClothSubstepTravelMetres':.5*9.81/(30*8)**2,'records':records,'limits':['Nearest oriented sign uses actual triangle winding; not volumetric signed distance near edges.','Interior grid is diagnostic samples, not exact minimum penetration or CCD.','Static gap larger than collision sum is necessary only, not proof of dynamic stability.','Saved open-v1 failure does not isolate integrator quality as a sole cause.']}
(O/'saved-three-frame-analysis.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'gap':gap,'initial':mins,'remaining':report['residualStaticGapMetres'],'frames':[{'frame':r['frame'],'verticesMin':min(x['nearestBody']['orientedDistance']for x in r['vertices']),'interiorSampleMin':min(x['sampleMinimumOrientedBodyDistance']['orientedDistance']for x in r['faces']),'maxNormalApproach':max(x['normalApproachFromRest']for x in r['vertices'])}for r in records]},indent=2))
