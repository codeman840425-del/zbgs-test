"""Read-only exact body/seat space sampling. No fitting or proxy inflation."""
from pathlib import Path
import gzip,json,hashlib
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'pose-response-v1'
packed=(S/'input-269/four-poses.json.gz').read_bytes();capture=json.loads(gzip.decompress(packed));frame=capture['frames'][2]
seat=next(b for b in frame['chair']if b['name']=='chairSeat');world=np.array(seat['matrixWorld']).reshape(4,4).T;inverse=np.linalg.inv(world);lo=np.array(seat['min']);hi=np.array(seat['max']);triangles=[]
for mesh in frame['colliders']:
 if not mesh['name'].startswith('Body'):continue
 p=np.array(mesh['positions']).reshape(-1,3);local=(np.c_[p,np.ones(len(p))]@inverse.T)[:,:3];triangles.extend(local[np.array(mesh['triangles']).reshape(-1,3)])
t=np.array(triangles);a=t[:,0];b=t[:,1];c=t[:,2];den=(b[:,2]-c[:,2])*(a[:,0]-c[:,0])+(c[:,0]-b[:,0])*(a[:,2]-c[:,2]);mask=abs(den)>1e-12;t=t[mask];a,b,c=t[:,0],t[:,1],t[:,2];den=den[mask]
def clip(poly,axis,bound,keep_above):
 result=[]
 for p,q in zip(poly,poly[1:]+poly[:1]):
  pin=(p[axis]>=bound)if keep_above else(p[axis]<=bound);qin=(q[axis]>=bound)if keep_above else(q[axis]<=bound)
  if pin:result.append(p)
  if pin!=qin:result.append(p+(q-p)*((bound-p[axis])/(q[axis]-p[axis])))
 return result
closest=None;crossing=0;clipped_count=0
for raw in triangles:
 poly=[p.copy()for p in raw]
 for axis,bound,above in [(0,lo[0],True),(0,hi[0],False),(2,lo[2],True),(2,hi[2],False)]:
  if poly:poly=clip(poly,axis,bound,above)
 if not poly:continue
 poly=np.array(poly);min_y=poly[:,1].min();max_y=poly[:,1].max()
 if max_y<hi[1]or min_y>hi[1]+.30:continue
 clipped_count+=1
 if min_y<=hi[1]:crossing+=1
 if closest is None or min_y<closest['y']:
  point=poly[np.argmin(poly[:,1])];closest={'y':float(min_y),'gapMetres':float(min_y-hi[1]),'seatLocalPoint':point.tolist(),'worldPoint':(world@np.r_[point,1])[:3].tolist()}
# Select true projected triangles, no nearest vertices/expanded box. Lower
# intersection is underside of actual body; upper arm skin can only be above
# the lower body where both exist. Save all hits rather than hiding ambiguity.
samples=[]
for x in np.linspace(lo[0]+.005,hi[0]-.005,21):
 for z in np.linspace(lo[2]+.005,hi[2]-.005,21):
  u=((b[:,2]-c[:,2])*(x-c[:,0])+(c[:,0]-b[:,0])*(z-c[:,2]))/den;v=((c[:,2]-a[:,2])*(x-c[:,0])+(a[:,0]-c[:,0])*(z-c[:,2]))/den;w=1-u-v;valid=(u>=0)&(v>=0)&(w>=0)
  ys=u*a[:,1]+v*b[:,1]+w*c[:,1];ys=ys[valid&(ys>hi[1]-.10)&(ys<hi[1]+.30)]
  if not len(ys):continue
  bottom=float(ys.min());world_point=world@np.array([x,bottom,z,1]);hips=np.linalg.inv(np.array(frame['bones']['J_Bip_C_Hips']).reshape(4,4).T)@world_point
  samples.append({'seatLocalXZ':[float(x),float(z)],'bodyBottomY':bottom,'gapMetres':bottom-float(hi[1]),'intersections':len(ys),'hipsLocalBodyPoint':hips[:3].tolist()})
gaps=np.array([s['gapMetres']for s in samples]);report={'schema':'actual-seat-body-space-grid-v1','sourceGzipSha256':hashlib.sha256(packed).hexdigest(),'pose':'seated','seat':seat,'method':'21x21 vertical rays in actual seat local XZ; barycentric intersection with complete captured body triangles; lower surface in seat-top[-.10,+.30]m band','samples':samples,'summary':{'coveredSamples':len(samples),'minGapMetres':float(gaps.min()),'medianGapMetres':float(np.median(gaps)),'under0':int(sum(gaps<0)),'under0_8mm':int(sum(gaps<.0008)),'under2mm':int(sum(gaps<.002)),'under4_8mm':int(sum(gaps<.0048))},'limits':['Finite grid is NOT full minimum-distance or contact admission.','0.8mm is source hem lining inset, not an approved global garment thickness.','2/4.8mm bands are descriptive comparisons, not relaxed or new acceptance thresholds.','Old captured hand fit; support lower surface may include hand-only samples where no body underneath, so retain coordinates for review.','No source garment or body changes.']}
report['exactProjectedTriangleCheck']={'method':'Clip each full actual body triangle to true seat local XZ footprint; minimum linear Y over clipped polygon for surfaces meeting top[0,+.30]m band','clippedTriangles':clipped_count,'straddlingSeatPlane':crossing,'minimum':closest}
(O/'actual-body-seat-space.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report['summary']))
