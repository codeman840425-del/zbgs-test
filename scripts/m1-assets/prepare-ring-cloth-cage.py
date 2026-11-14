"""Last bounded static alternative: regular ring cage, exact detail binding.
Preserves all original rendered skirt vertices/UVs via explicit triangle frames.
No physics, Blender, browser, source body edit, or production write.
"""
import collections,json,pathlib
import numpy as np
R=pathlib.Path(__file__).resolve().parents[2];S=R/'assets-source/m1/offline-corrective/open-waist-v1';O=R/'assets-source/m1/offline-corrective/ring-cage-v1';O.mkdir(parents=True,exist_ok=True)
t=json.loads((S/'topology.json').read_text(encoding='utf8'));r=json.loads((S/'standing-rest-candidate.json').read_text(encoding='utf8'));v=np.array(r['positionsHipLocal']);faces=np.array(t['triangles']);edges=np.array(t['boundaryEdges']);angular=40;bands=12
waist=sorted(set(edges[np.all(v[edges,1]>.12,axis=1)].ravel()));hem=sorted(set(edges[np.all(v[edges,1]<-.12,axis=1)].ravel()));assert len(waist)==20 and len(hem)>=20
axis=v[waist].mean(axis=0);axis[1]=0
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def outline(ids,theta):
 pts=v[ids];ang=np.arctan2(pts[:,0]-axis[0],pts[:,2]-axis[2]);pts=pts[np.argsort(ang)];direction=np.array([np.sin(theta),np.cos(theta)]);origin=axis[[0,2]];hits=[]
 for a,b in zip(pts,np.roll(pts,-1,axis=0)):
  p=a[[0,2]]-origin;e=(b-a)[[0,2]];den=cross(direction,e)
  if abs(den)<1e-12:continue
  distance=cross(p,e)/den;u=cross(p,direction)/den
  if distance>0 and -1e-6<=u<=1+1e-6:hits.append((distance,float(a[1]*(1-u)+b[1]*u)))
 assert hits,'Boundary radial intersection missing'
 return max(hits)
tri=v[faces];e1=tri[:,1]-tri[:,0];e2=tri[:,2]-tri[:,0]
def radial(y,theta):
 origin=axis.copy();origin[1]=y;direction=np.array([np.sin(theta),0,np.cos(theta)]);h=np.cross(direction,e2);det=np.sum(e1*h,axis=1);valid=np.abs(det)>1e-10;inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=origin-tri[:,0];u=inv*np.sum(s*h,axis=1);q=np.cross(s,e1);w=inv*np.sum(direction*q,axis=1);distance=inv*np.sum(e2*q,axis=1);hits=distance[valid&(u>=-1e-7)&(w>=-1e-7)&(u+w<=1+1e-7)&(distance>0)]
 assert len(hits),'Intermediate source section missing';return float(max(hits))
cage=[];section=[]
for band in range(bands+1):
 frac=band/bands;ring=[]
 for i in range(angular):
  theta=2*np.pi*i/angular;wr,wy=outline(waist,theta);hr,hy=outline(hem,theta);y=wy*(1-frac)+hy*frac;radius=wr if band==0 else hr if band==bands else radial(y,theta);p=axis+np.array([np.sin(theta)*radius,y,np.cos(theta)*radius]);cage.append(p);ring.append({'theta':theta,'radius':radius,'y':y})
 section.append(ring)
cage=np.array(cage);quads=[];ct=[]
for j in range(bands):
 for i in range(angular):
  a=j*angular+i;b=j*angular+(i+1)%angular;c=(j+1)*angular+(i+1)%angular;d=(j+1)*angular+i;quads.append([a,d,c,b]);ct.extend([[a,d,c],[a,c,b]])
ct=np.array(ct)
def closest(p,a,b,c):
 # Ericson triangle Voronoi regions; actual closest carrier, not UV guessing.
 ab=b-a;ac=c-a;ap=p-a;d1=ab@ap;d2=ac@ap
 if d1<=0 and d2<=0:return a,np.array([1.,0,0])
 bp=p-b;d3=ab@bp;d4=ac@bp
 if d3>=0 and d4<=d3:return b,np.array([0.,1,0])
 vc=d1*d4-d3*d2
 if vc<=0 and d1>=0 and d3<=0:
  x=d1/(d1-d3);return a+x*ab,np.array([1-x,x,0])
 cp=p-c;d5=ab@cp;d6=ac@cp
 if d6>=0 and d5<=d6:return c,np.array([0.,0,1])
 vb=d5*d2-d1*d6
 if vb<=0 and d2>=0 and d6<=0:
  x=d2/(d2-d6);return a+x*ac,np.array([1-x,0,x])
 va=d3*d6-d5*d4
 if va<=0 and d4-d3>=0 and d5-d6>=0:
  x=(d4-d3)/((d4-d3)+(d5-d6));return b+x*(c-b),np.array([0,1-x,x])
 den=1/(va+vb+vc);x=vb*den;y=vc*den;return a+ab*x+ac*y,np.array([1-x-y,x,y])
def basis(p):
 x=p[1]-p[0];x/=np.linalg.norm(x);n=np.cross(p[1]-p[0],p[2]-p[0]);n/=np.linalg.norm(n);return np.array([x,np.cross(n,x),n])
bindings=[];reconstructed=[];carrierErrors=[]
for p in v:
 best=None
 for index,f in enumerate(ct):
  q,bary=closest(p,*cage[f]);distance=float(np.linalg.norm(p-q))
  if best is None or distance<best[0]:best=(distance,index,q,bary)
 distance,index,q,bary=best;frame=basis(cage[ct[index]]);detail=(p-q)@frame.T;back=q+detail@frame;reconstructed.append(back);carrierErrors.append(distance);bindings.append({'triangle':index,'barycentric':bary.tolist(),'restDetailInTriangleFrame':detail.tolist()})
allEdges=np.array(sorted(set(tuple(sorted((a,b)))for f in ct for a,b in zip(f,np.roll(f,-1)))));lengths=np.linalg.norm(cage[allEdges[:,0]]-cage[allEdges[:,1]],axis=1);area=np.linalg.norm(np.cross(cage[ct[:,1]]-cage[ct[:,0]],cage[ct[:,2]]-cage[ct[:,0]]),axis=1)/2;reconstructed=np.array(reconstructed)
widths=[]
for j in range(bands+1):
 p=cage[j*angular:(j+1)*angular];widths.append({'ring':j,'yRange':[float(min(p[:,1])),float(max(p[:,1]))],'widthX':float(np.ptp(p[:,0])),'depthZ':float(np.ptp(p[:,2]))})
hip=np.array(r['hipWorld']).reshape(4,4).T;world=(np.c_[cage,np.ones(len(cage))]@hip.T)[:,:3]
report={'schema':'m1.regular-ring-static-cage.1','status':'source-prepared-static-check-only','angularSegments':angular,'verticalBands':bands,'simulationVertices':len(cage),'quads':quads,'triangles':ct.tolist(),'positionsHipLocal':cage.tolist(),'positionsWorld':world.tolist(),'renderWeldedBindings':bindings,'originalRenderToWeld':t['renderToWeld'],'originalRenderTriangles':t['renderTriangles'],'originalUV':t['uv'],'originalWeldedSourcePositions':v.tolist(),'pinRingIndices':list(range(angular)),'widths':widths,'edges':{'min':float(min(lengths)),'p50':float(np.median(lengths)),'max':float(max(lengths)),'under1mm':int(sum(lengths<.001))},'minimumTriangleArea':float(min(area)),'carrierApproximationError':{'rms':float(np.sqrt(np.mean(np.square(carrierErrors)))),'max':max(carrierErrors)},'withRetainedPleatDetailReconstructionError':float(np.max(np.linalg.norm(reconstructed-v,axis=1))),'limits':['No cloth or dynamic acceptance','Static zero reconstruction error includes retained detail offset; it is not zero cage approximation error','Rendered pleat details transported in deformed carrier triangle frames, no runtime implementation added','Cage geometry may still conflict with true body/top and must be checked independently','All original render UV/material structure remains, original source/production unchanged']}
(O/'cage-and-binding.json').write_text(json.dumps(report,separators=(',',':')),encoding='utf8')
lines=['# Independent regular simulation cage, not final game cloth']+['v %.9g %.9g %.9g'%tuple(p)for p in cage]+['f '+' '.join(str(i+1)for i in q)for q in quads];(O/'regular-sim-cage.obj').write_text('\n'.join(lines)+'\n',encoding='utf8')
lines=['# Original pleat render mesh, exact static carrier+detail reconstruction']+['v %.9g %.9g %.9g'%tuple(p)for p in reconstructed[np.array(t['renderToWeld'])]]+['vt %.9g %.9g'%tuple(uv)for uv in t['uv']]+['f '+' '.join(f'{i+1}/{i+1}'for i in f)for f in t['renderTriangles']];(O/'original-render-reconstructed.obj').write_text('\n'.join(lines)+'\n',encoding='utf8')
print(json.dumps({k:report[k]for k in ['simulationVertices','edges','minimumTriangleArea','carrierApproximationError','withRetainedPleatDetailReconstructionError']}))
