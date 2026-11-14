"""Offline actual intersection-segment alpha test; no browser/Blender.
Uses already captured same-frame vertices, retained UVs, and original images.
"""
import collections,io,json,pathlib,struct
import numpy as np
from PIL import Image
R=pathlib.Path(__file__).resolve().parents[2]
P=R/'experiments/skirt-offline-corrective/displayed-initial-0df63cf2bdea/standing-01'
c=json.loads((P/'initial.json').read_text(encoding='utf8'));d=json.loads((P/'contact-diagnosis.json').read_text(encoding='utf8'));t=json.loads((R/'experiments/skirt-offline-corrective/source-topology.json').read_text(encoding='utf8'))
def source(name,primitive=0):
 b=(R/'prototype/public/assets/m1'/name).read_bytes();n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n]);binary=b[28+n:];p=doc['meshes'][0]['primitives'][primitive];m=doc['materials'][p['material']];tex=m['pbrMetallicRoughness']['baseColorTexture'];im=doc['images'][doc['textures'][tex['index']]['source']];v=doc['bufferViews'][im['bufferView']];a=np.asarray(Image.open(io.BytesIO(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGBA'))[:,:,3]/255
 return {'material':m,'alpha':a}
skirt=source('m1-uniform-skirt.glb');top=source('m1-uniform-top.glb')
def bary(point,tri):
 a,b,c=tri;v=b-a;w=c-a;q=point-a;vv=v@v;ww=w@w;vw=v@w;den=vv*ww-vw*vw
 if abs(den)<1e-18:return None
 x=(q@v*ww-q@w*vw)/den;y=(q@w*vv-q@v*vw)/den;return np.array([1-x-y,x,y])
def intersections(a,b):
 pts=[]
 for one,other in [(a,b),(b,a)]:
  normal=np.cross(other[1]-other[0],other[2]-other[0]);normal/=max(np.linalg.norm(normal),1e-30)
  for p,q in zip(one,np.roll(one,-1,axis=0)):
   dp=(p-other[0])@normal;dq=(q-other[0])@normal
   if abs(dp-dq)<1e-12:continue
   u=dp/(dp-dq)
   if -1e-7<=u<=1+1e-7:
    x=p+u*(q-p);weights=bary(x,other)
    if weights is not None and min(weights)>=-1e-6 and not any(np.linalg.norm(x-y)<1e-7 for y in pts):pts.append(x)
 if len(pts)>1:
  # Dense samples of the actual intersection segment, not whole face centroids.
  ends=max(((x,y)for x in pts for y in pts),key=lambda p:np.linalg.norm(p[0]-p[1]));return [ends[0]*(1-f)+ends[1]*f for f in np.linspace(0,1,17)]
 return pts
def alpha(src,uv):
 a=src['alpha'];h,w=a.shape;x=(uv[0]%1)*w-.5;y=(uv[1]%1)*h-.5;i,j=int(np.floor(x)),int(np.floor(y));fx,fy=x-i,y-j
 value=(a[j%h,i%w]*(1-fx)+a[j%h,(i+1)%w]*fx)*(1-fy)+(a[(j+1)%h,i%w]*(1-fx)+a[(j+1)%h,(i+1)%w]*fx)*fy
 return float(value*src['material'].get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1])[3])
topmesh=next(m for m in c['colliders'] if m['name']=='m1-uniform-top_1');tv=np.array(topmesh['positions']);tt=np.array(topmesh['triangles']).reshape(-1,3);tu=np.array(topmesh['uv']).reshape(-1,2)
def boundarySegments(vertices,faces):
 keys={};mp=[];points=[]
 for v in vertices:
  key=tuple(np.round(v,6))
  if key not in keys:keys[key]=len(points);points.append(v)
  mp.append(keys[key])
 faces=np.array(mp)[faces];edges=collections.Counter(tuple(sorted((int(a),int(b))))for t in faces for a,b in zip(t,np.roll(t,-1)))
 return np.array(points)[[e for e,n in edges.items()if n==1]]
def boundaryDistance(points,segments):
 if not len(segments):return [None]*len(points)
 a=segments[:,0];edge=segments[:,1]-a;den=np.sum(edge*edge,axis=1)
 result=[]
 for p in points:
  f=np.clip(np.sum((p-a)*edge,axis=1)/np.maximum(den,1e-25),0,1);result.append(float(np.min(np.linalg.norm(p-a-f[:,None]*edge,axis=1))))
 return result
tb=boundarySegments(tv,tt)
out=[]
for s in d['surfaces']:
 mesh=c[s['surface']];v=np.array(mesh['positions']);faces=np.array(mesh['triangles']).reshape(-1,3);uv=np.array(mesh['uv']).reshape(-1,2)
 sb=boundarySegments(v,faces)
 pairs=next(r['trianglePairs']for r in s['colliders']if r['name']=='m1-uniform-top_1');rows=[]
 for i,j in pairs:
  points=intersections(v[faces[i]],tv[tt[j]]);samples=[]
  for point in points:
   sa=alpha(skirt,bary(point,v[faces[i]])@uv[faces[i]]);ta=alpha(top,bary(point,tv[tt[j]])@tu[tt[j]])
   samples.append({'point':point.tolist(),'skirtAlpha':sa,'topAlpha':ta,'bothVisible':sa>=.5 and ta>=.5})
  a=v[faces[i]];b=tv[tt[j]];na=np.cross(a[1]-a[0],a[2]-a[0]);na/=np.linalg.norm(na);nb=np.cross(b[1]-b[0],b[2]-b[0]);nb/=np.linalg.norm(nb)
  signedA=(a-b[0])@nb;signedB=(b-a[0])@na
  rows.append({'skirtTriangle':i,'topTriangle':j,'waistCap':i<20,'samples':samples,'bothVisibleSamples':sum(x['bothVisible']for x in samples),
   'segmentLength':float(np.linalg.norm(points[-1]-points[0]))if len(points)>1 else 0,'skirtSignedToTopPlane':signedA.tolist(),'topSignedToSkirtPlane':signedB.tolist(),
   'normalAngleDeg':float(np.degrees(np.arccos(np.clip(abs(na@nb),0,1)))),'distanceToSkirtBoundary':boundaryDistance(points,sb),'distanceToTopBoundary':boundaryDistance(points,tb),
   'strictCrossBothPlanes':bool(min(signedA)<-1e-5 and max(signedA)>1e-5 and min(signedB)<-1e-5 and max(signedB)>1e-5)})
 out.append({'surface':s['surface'],'pairCount':len(rows),'pairsWithResolvedSegment':sum(bool(r['samples'])for r in rows),'bothVisiblePairs':sum(r['bothVisibleSamples']>0 for r in rows),'nonCapBothVisiblePairs':sum(r['bothVisibleSamples']>0 and not r['waistCap']for r in rows),'rows':rows})
 for section in [out[-1]]:
  active=[r for r in rows if not r['waistCap']];lengths=[r['segmentLength']for r in active]
  section['nonCapGeometry']={'totalPairSegmentLength':sum(lengths),'maximumPairSegmentLength':max(lengths,default=0),'medianPairSegmentLength':float(np.median(lengths))if lengths else 0,'strictCrossBothPlanes':sum(r['strictCrossBothPlanes']for r in active),'bothBoundaryTouchWithin10Microns':sum(bool(r['samples'])and max(r['distanceToSkirtBoundary'])<1e-5 and max(r['distanceToTopBoundary'])<1e-5 for r in active),'note':'Pair segment sum may double-count coincident segments. Signed plane spans measure local crossing, not physical penetration volume/depth.'}
report={'schema':'m1.skirt-top-layer-alpha.1','method':'Actual triangle-edge intersection segments, 17 samples per segment; barycentric UV + bilinear embedded image alpha; glTF V maps to PNG top. Alpha MASK cutoff .5. Not mip/raster exact; unresolved/coplanar pairs retained. No geometry changed.',
 'materials':{'skirt':skirt['material'],'top':top['material']},'surfaces':out}
# Horizontal body rays at each real noncap intersection. This checks whether
# a proposed body -> skirt -> top ordering even has room; it does not move it.
body=next(m for m in c['colliders']if m['name']=='Bodybaked');bp=np.array(body['positions']);bt=bp[np.array(body['triangles']).reshape(-1,3)]
e1=bt[:,1]-bt[:,0];e2=bt[:,2]-bt[:,0];hip=np.array(c['hipWorld']).reshape(4,4).T[:3,3]
gaps=[]
for row in out[1]['rows']:
 if row['waistCap'] or not row['samples']:continue
 q=np.array(row['samples'][len(row['samples'])//2]['point']);origin=hip.copy();origin[1]=q[1];direction=q-origin;radius=np.linalg.norm(direction)
 if radius<1e-5:continue
 direction/=radius;h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.sum(e1*h,axis=1);valid=np.abs(det)>1e-10;inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=origin-bt[:,0];u=inv*np.sum(s*h,axis=1);k=np.cross(s,e1);v=inv*np.sum(direction*k,axis=1);dist=inv*np.sum(e2*k,axis=1)
 hits=dist[valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(dist>0)&(dist<.5)]
 if len(hits):gaps.append({'skirtTriangle':row['skirtTriangle'],'topTriangle':row['topTriangle'],'point':q.tolist(),'radiusTop':float(radius),'bodyFirstExitRadius':float(min(hits)),'allBodyHitRadii':sorted(hits.tolist()),'availableGap':float(radius-min(hits))})
report['layerSpace']={'method':'Horizontal ray from actual hips XZ center at the actual top-skirt intersection Y; first positive body hit below .5m (torso exit, excludes further hand/arm intersections but retains all hits). Assumes origin inside torso, no inside proof; diagnostic bound for radial fitting, not signed 3D clearance. Provisional 3mm each-side margin needs >=6mm gap.',
 'rows':gaps,'resolved':len(gaps),'lessThan6mm':sum(r['availableGap']<.006 for r in gaps),'minimum':min((r['availableGap']for r in gaps),default=None),'median':float(np.median([r['availableGap']for r in gaps]))if gaps else None}
(P/'layer-alpha-diagnosis.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps([ {k:v for k,v in s.items()if k!='rows'}for s in out]))
print(json.dumps({k:v for k,v in report['layerSpace'].items()if k!='rows'}))
