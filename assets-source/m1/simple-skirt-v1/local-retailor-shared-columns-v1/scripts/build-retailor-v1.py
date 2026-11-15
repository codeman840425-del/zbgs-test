"""One re-tailored paired source: actual side cuts and connected panel skirt.
No cloth, per-frame guide, controller edit, or search over author parameters.
"""
from pathlib import Path
import ast,struct,gzip,json,hashlib,copy,heapq,math
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'local-retailor-v1'
assert not(O/'build-report.json').exists(),'Single frozen construction; refuse overwrite'
def reuse(path,names):
 t=ast.parse(path.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-blender-seated-author-v1.py',['load'])
reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed'])
tp=R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb';sp=S/'two-quad-thirds-v1/m1-sixfold-skirt-two-quad-thirds-v1.glb';top=asset(tp);skirt=asset(sp);cap=json.loads(gzip.decompress((S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()));fr=cap['frames'][59];H=np.array(fr['bones']['J_Bip_C_Hips']).reshape(4,4).T;Hinv=np.linalg.inv(H);toLocal=lambda p:(np.c_[p,np.ones(len(p))]@Hinv.T)[:,:3];toWorld=lambda p:(np.c_[p,np.ones(len(p))]@H.T)[:,:3]
measure=json.loads((O/'space-report.json').read_text());hemMeasure=json.loads((O/'hem-contour-space.json').read_text());P=top['P'];F=top['F'];domain=P[:,1]<.98;free=P[:,1]<.975;interface=np.array(measure['interfaceVertices']);hem=np.array(hemMeasure['hemVertices']);E=np.unique(np.sort(np.concatenate([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]),axis=1),axis=0);adj={i:[]for i in range(len(P))}
for a,b in E:
 if domain[a]or domain[b]:adj[int(a)].append(int(b));adj[int(b)].append(int(a))
paths=[]
for start in [int(hem[np.argmin(P[hem,0])]),int(hem[np.argmax(P[hem,0])])]:
 queue=[(0.,start)];cost={start:0.};prev={};end=None
 while queue:
  c,i=heapq.heappop(queue)
  if c>cost[i]:continue
  if i in interface:end=i;break
  for j in adj[i]:
   if P[j,1]<P[i,1]-.002 or np.sign(P[j,0])!=np.sign(P[start,0]):continue
   w=float(np.linalg.norm(P[j]-P[i])*(1+25*abs(P[j,2])));q=c+w
   if q<cost.get(j,1e9):cost[j]=q;prev[j]=i;heapq.heappush(queue,(q,j))
 assert end is not None,'No bounded seam path';path=[end]
 while path[-1]!=start:path.append(prev[path[-1]])
 paths.append(path[::-1])
# Duplicate actual cut edge vertices below fixed interface, front faces only.
T=P.tolist();TF=F.copy();origin=list(range(len(P)));cutRecords=[]
for path in paths:
 mapping={}
 for v in path[:-1]:mapping[v]=len(T);T.append(P[v].tolist());origin.append(v)
 changed=[]
 for fi,face in enumerate(F):
  on=[int(v)for v in face if int(v)in mapping]
  if on and P[face,2].mean()<np.mean(P[on,2]):
   for k,v in enumerate(face):
    if int(v)in mapping:TF[fi,k]=mapping[int(v)]
   changed.append(fi)
 cutRecords.append({'sourcePath':path,'duplicateMap':mapping,'frontFaces':changed,'sourcePathLengthM':float(np.linalg.norm(np.diff(P[path],axis=0),axis=1).sum())})
T=np.array(T);origin=np.array(origin);raw,td,rd=load(tp);tp0=td['meshes'][0]['primitives'];UV=np.concatenate([rd(p['attributes']['TEXCOORD_0'])for p in tp0])[origin];TJ=top['J'][origin];TW=top['W'][origin]
angles=np.arctan2(P[interface,2],P[interface,0]);sort=np.argsort(angles);ang=angles[sort];rad=np.linalg.norm(P[interface[sort]][:,[0,2]],axis=1)
# Continuous radial hinge defined by fixed original upper contour; no arbitrary whole-hem translation.
def upperRadius(theta):return np.interp(theta,np.r_[ang[-1]-2*np.pi,ang,ang[0]+2*np.pi],np.r_[rad[-1],rad,rad[0]])
needed={s['vertex']:s['rays']['up']['lastExitPlusReserveM']for s in hemMeasure['rows'][-1]['samples']};requirements=[]
for v in hem:
 if P[v,2]>=.015 or needed[int(v)]<=0:continue
 dy=P[v,1]-.975;r=np.linalg.norm(P[v,[0,2]]);dr=r-upperRadius(np.arctan2(P[v,2],P[v,0]));A=-dy;B=dr;C=A-needed[int(v)];amp=np.hypot(A,B);phi=np.arccos(np.clip(C/amp,-1,1))-np.arctan2(B,A);requirements.append(float(phi))
angle=max(requirements,default=0.);assert 0<angle<np.pi/2,'Measured front flap cannot be authored in bound'
TT=T.copy()
for i,p in enumerate(T):
 if p[1]>=.975:continue
 # Split front face copies and unambiguous front interior; rear stays original.
 v=int(origin[i]);isDuplicate=i>=len(P);isCutOriginal=any(v in c['duplicateMap']for c in cutRecords)
 if (isCutOriginal and not isDuplicate)or(p[2]>=.015 and not isDuplicate):continue
 theta=np.arctan2(p[2],p[0]);r=np.linalg.norm(p[[0,2]]);r0=upperRadius(theta);dy=p[1]-.975;dr=r-r0;c=np.cos(angle);s=np.sin(angle);rn=r0-s*dy+c*dr;TT[i]=[rn*np.cos(theta),.975+c*dy+s*dr,rn*np.sin(theta)]
# All edits live in the old85-vertex source region; fixed interface remains exact.
assert np.array_equal(TT[~free[origin]],T[~free[origin]])
# Fresh connected skirt panels: original yoke and exact20-point seam, then40 columns/10rows.
K=skirt['P'];KF=skirt['F'];nUpper=skirt['counts'][0];seamIds=np.arange(nUpper,nUpper+20);seam=K[seamIds];sa=np.arctan2(seam[:,2],seam[:,0]);order=np.argsort(sa);seamIds=seamIds[order];sa=sa[order];seam=K[seamIds];seated=posed(skirt,fr,True);localSeam=toLocal(seated[seamIds]);tree=BVHTree.FromPolygons(K.tolist(),KF.tolist(),all_triangles=True)
# Author stations are measured against actual thigh/seat in hip coordinates (see savedbodysections).
# No pointwise projection, collision push, shrinking action or hidden surface.
seat=next(b for b in fr['chair']if b['name']=='chairSeat');seatTop=float((np.array(seat['matrixWorld']).reshape(4,4).T@np.array([0,seat['max'][1],0,1]))[1]);seatLocal=seatTop-H[1,3]
control={'hemFrontZ':-.32,'hemBackZ':.115,'hemHalfWidth':.185,'hemFrontY':-.03,'hemSideY':-.125,'hemBackY':seatLocal+.0024,'midFrontZ':-.22,'midBackZ':.13,'midHalfWidth':.18,'midFrontY':.015,'midSideY':-.035,'midBackY':-.025,'rows':10,'columns':40,'innerReturnLengthM':.01,'innerNormalOffsetM':.0008,'measuredSourceAxialPriorM':[.2356,.2518]}
angles40=np.array([x for i in range(20)for x in [sa[i],(sa[i]+(sa[i+1]if i<19 else sa[0]+2*np.pi))/2]])
seam40=np.array([x for i in range(20)for x in [seam[i],(seam[i]+seam[(i+1)%20])/2]])
local40=np.array([x for i in range(20)for x in [localSeam[i],(localSeam[i]+localSeam[(i+1)%20])/2]])
SP=K[:nUpper].tolist()+seam.tolist();SQ=seated[:nUpper].tolist()+seated[seamIds].tolist();SF=KF[:120].tolist();SJ=skirt['J'][:nUpper].tolist()+skirt['J'][seamIds].tolist();SW=skirt['W'][:nUpper].tolist()+skirt['W'][seamIds].tolist();sr,sd,rr=load(sp);uv0=rr(sd['meshes'][0]['primitives'][0]['attributes']['TEXCOORD_0']);uv1=rr(sd['meshes'][0]['primitives'][1]['attributes']['TEXCOORD_0']);SUV=uv0.tolist()+uv1[seamIds-nUpper].tolist();hipJ=skirt['names'].index('J_Bip_C_Hips');rowIds=[];restMiss=[]
for row in range(1,11):
 t=row/10;ids=[]
 for c,theta in enumerate(angles40):
  y=(1-t)*seam40[c,1]+t*.72217;direction=np.array([np.cos(theta),0,np.sin(theta)]);start=np.array([0.,y,0.]);done=0.;hits=[]
  for _ in range(12):
   hit,n,face,dist=tree.ray_cast(start+direction*done,direction,.4-done)
   if hit is None:break
   done+=float(dist);hits.append(np.array(hit));done+=1e-6
  if hits:p=hits[-1]
  else:
   # Last row is actual hem, sampled from nearest source direction and lowest source band.
   valid=np.flatnonzero(K[:,1]<.735);delta=np.abs(np.angle(np.exp(1j*(np.arctan2(K[valid,2],K[valid,0])-theta))));v=valid[np.lexsort((-np.linalg.norm(K[valid][:,[0,2]],axis=1),delta))[0]];radial=np.linalg.norm(K[v,[0,2]]);p=np.array([direction[0]*radial,y,direction[2]*radial]);restMiss.append({'row':row,'column':c,'sourceNearest':int(v),'angleError':float(delta.min())})
  front=max(0.,-np.sin(theta));back=max(0.,np.sin(theta));side=1-front-back
  mid=np.array([control['midHalfWidth']*np.cos(theta),front*control['midFrontY']+back*control['midBackY']+side*control['midSideY'],(control['midFrontZ']+control['midBackZ'])/2+(control['midBackZ']-control['midFrontZ'])/2*np.sin(theta)])
  end=np.array([control['hemHalfWidth']*np.cos(theta),front*control['hemFrontY']+back*control['hemBackY']+side*control['hemSideY'],(control['hemFrontZ']+control['hemBackZ'])/2+(control['hemBackZ']-control['hemFrontZ'])/2*np.sin(theta)])
  # Quadratic Bezier through an explicit middle author station; coherent shared ring neighbors.
  handle=2*mid-.5*(local40[c]+end);q=(1-t)**2*local40[c]+2*t*(1-t)*handle+t*t*end
  ids.append(len(SP));SP.append(p.tolist());SQ.append(toWorld(q[None,:])[0].tolist());SJ.append([hipJ,0,0,0]);SW.append([1.,0,0,0]);SUV.append([.2+.4*c/40,.25+.45*t])
 rowIds.append(ids)
for c in range(20):
 a=nUpper+c;b=nUpper+(c+1)%20;i=rowIds[0][2*c];m=rowIds[0][(2*c+1)%40];j=rowIds[0][(2*c+2)%40];SF.extend([[a,i,m],[a,m,b],[b,m,j]])
for r in range(1,10):
 for c in range(40):
  a=rowIds[r-1][c];b=rowIds[r-1][(c+1)%40];d=rowIds[r][c];e=rowIds[r][(c+1)%40];SF.extend([[a,d,e],[a,e,b]])
# Actual attached return:10mm along coherent neighboring panel tangent, .8mm inward.
for c in range(40):
 def returnPoint(points):
  p=np.array(points[rowIds[-1][c]]);up=np.array(points[rowIds[-2][c]])-p;up/=np.linalg.norm(up);tan=np.array(points[rowIds[-1][(c+1)%40]])-np.array(points[rowIds[-1][(c-1)%40]]);tan/=np.linalg.norm(tan);n=np.cross(up,tan);n/=np.linalg.norm(n);radial=p-np.mean(np.array(points)[rowIds[-1]],axis=0)
  if n@radial<0:n=-n
  return p+.01*up-.0008*n
 SP.append(returnPoint(SP).tolist());SQ.append(returnPoint(SQ).tolist());SJ.append([hipJ,0,0,0]);SW.append([1.,0,0,0]);SUV.append([.2+.4*c/40,.68])
inner=np.arange(len(SP)-40,len(SP))
for c in range(40):a=rowIds[-1][c];b=rowIds[-1][(c+1)%40];i=int(inner[c]);j=int(inner[(c+1)%40]);SF.extend([[a,b,j],[a,j,i]])
SP=np.array(SP);SQ=np.array(SQ);SF=np.array(SF);SJ=np.array(SJ);SW=np.array(SW);SUV=np.array(SUV)
# Orient newly constructed sheet consistently outward before inner strip follows reverse.
for fi in range(120,len(SF)-80):
 face=SF[fi];p=SP[face];n=np.cross(p[1]-p[0],p[2]-p[0]);radial=p.mean(0)*[1,0,1]
 if n@radial<0:SF[fi,[1,2]]=SF[fi,[2,1]]
# Obtain bind-space target via original inverse bind for each new weighted point.
world=np.array([np.array(fr['bones'][n]).reshape(4,4).T for n in skirt['names']])
for c in fr['controls']:world[skirt['names'].index(c['name'])]=np.array(c['privateWorld']).reshape(4,4).T
pal=world@skirt['inv'];mats=sum(pal[SJ[:,k]]*SW[:,k,None,None]for k in range(4));ST=np.linalg.solve(mats,np.c_[SQ,np.ones(len(SQ))][:,:,None])[:,:3,0]
# Standard GLB source transport; standard Blender exporter supplies POSITION/NORMAL shape channels below.
def normals(p,f):
 n=np.zeros_like(p);tri=p[f];fn=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
 for k in range(3):np.add.at(n,f[:,k],fn)
 return n/np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-20)
def export(name,parent,points,target,faces,joints,weights,uv,faceMaterials):
 raw,doc,read=load(parent);doc=copy.deepcopy(doc);jlen=struct.unpack_from('<I',raw,12)[0];buf=bytearray(raw[28+jlen:28+jlen+doc['buffers'][0]['byteLength']]);newp=[];N=normals(points,faces);NT=normals(target,faces)
 def acc(a,typ,ctype):
  a=np.asarray(a,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[ctype]);buf.extend(b'\0'*((-len(buf))%4));off=len(buf);buf.extend(a.tobytes());v=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':a.nbytes});i=len(doc['accessors']);d={'bufferView':v,'componentType':ctype,'count':len(a),'type':typ}
  if typ=='VEC3':d.update(min=a.min(0).tolist(),max=a.max(0).tolist())
  doc['accessors'].append(d);return i
 for material in sorted(set(faceMaterials)):
  select=np.flatnonzero(np.array(faceMaterials)==material);ids=np.unique(faces[select]);imap=np.full(len(points),-1);imap[ids]=np.arange(len(ids));primitive={'attributes':{'POSITION':acc(points[ids],'VEC3',5126),'NORMAL':acc(N[ids],'VEC3',5126),'TEXCOORD_0':acc(uv[ids],'VEC2',5126),'JOINTS_0':acc(joints[ids],'VEC4',5123),'WEIGHTS_0':acc(weights[ids],'VEC4',5126)},'indices':acc(imap[faces[select]].reshape(-1),'SCALAR',5125),'material':int(material),'targets':[{'POSITION':acc(target[ids]-points[ids],'VEC3',5126),'NORMAL':acc(NT[ids]-N[ids],'VEC3',5126)}]};newp.append(primitive)
 doc['meshes'][0]['primitives']=newp;doc['meshes'][0]['weights']=[0];doc['meshes'][0]['extras']={'targetNames':['retailor_seated_v1']};doc['buffers'][0]['byteLength']=len(buf);bjson=json.dumps(doc,separators=(',',':')).encode();bjson+=b' '*((-len(bjson))%4);buf.extend(b'\0'*((-len(buf))%4));out=O/(name+'-staging.glb');out.write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(bjson)+8+len(buf))+struct.pack('<II',len(bjson),0x4e4f534a)+bjson+struct.pack('<II',len(buf),0x004e4942)+buf)
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(out));garment=next(o for o in bpy.data.objects if o.type=='MESH');garment['candidate_status']='UNVERIFIED single paired re-tailoring author';garment['source_parent_sha256']=hashlib.sha256(parent.read_bytes()).hexdigest();garment['edit_recipe']='build-retailor-v1.py; source cut paths and source/target coordinates retained';bpy.ops.wm.save_as_mainfile(filepath=str(O/(name+'.blend')));bpy.ops.export_scene.gltf(filepath=str(O/(name+'.glb')),export_format='GLB',export_yup=True,export_skins=True,export_morph=True,export_morph_normal=True,export_animations=False,export_apply=False);return {'id':name,'sha256':hashlib.sha256((O/(name+'.glb')).read_bytes()).hexdigest(),'blendSha256':hashlib.sha256((O/(name+'.blend')).read_bytes()).hexdigest(),'sourceVertexFaceCounts':[len(points),len(faces)]}
matTop=np.repeat([p.get('material',0)for p in tp0],[len(rd(p['indices']))//3 for p in tp0]);matSkirt=np.r_[np.full(120,sd['meshes'][0]['primitives'][0].get('material',0)),np.full(len(SF)-120,sd['meshes'][0]['primitives'][1].get('material',0))]
a=export('m1-sidevent-top-retailor-v1',tp,T,TT,TF,TJ,TW,UV,matTop);b=export('m1-panel-skirt-retailor-v1',sp,SP,ST,SF,SJ,SW,SUV,matSkirt)
np.savez_compressed(O/'author-meshes.npz',topBasis=T,topTarget=TT,topFaces=TF,topOrigin=origin,skirtBasis=SP,skirtTarget=ST,skirtTargetWorld=SQ,skirtFaces=SF,skirtJ=SJ,skirtW=SW,skirtInner=inner,skirtRows=np.array(rowIds),skirtSeamSourceIds=seamIds)
report={'status':'source-produced-awaiting-gates','inputs':measure['inputs'],'bodySha256':'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95','top':a,'skirt':b,'sideCuts':cutRecords,'topHingeAngleRadians':angle,'topFixedResidualM':float(np.linalg.norm(TT[~free[origin]]-T[~free[origin]],axis=1).max()),'authorStationsHipLocal':control,'restRayMissFallbacks':restMiss,'sourceDomain85Retained':True,'normalAndPositionMorph':True,'runtimeModified':False,'nativeCloth':False,'limits':['One paired source re-cut, not a passed static or animated outfit','Original top closed27bc and isolated open7f parents stay distinct','New skirt panels use Hips support plus exported seatedshape; no walking or cancellation driver exists','Outer target comes from explicit connectedBezier author stations, not runtime guide or collision projection','Panel lengths, intersections, normals and appearance await unchanged independent gates','Two existing body/top source and newasset material primitives are retained, fullbody is not masked']};(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'top':a,'skirt':b,'hingeAngle':angle,'cutPaths':paths,'fallbacks':len(restMiss)}))
