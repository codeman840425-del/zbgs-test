"""One evidence-led source layout correction. Parentv1 frozen; no parameter sweep."""
from pathlib import Path
import ast,struct,gzip,json,hashlib,copy,math
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';OLD=S/'local-retailor-v1';O=S/'local-retailor-layout-v2';O.mkdir(exist_ok=True)
assert not(O/'build-report.json').exists(),'Refuse second layout candidate'
def reuse(path,names):
 t=ast.parse(path.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-blender-seated-author-v1.py',['load']);reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed']);reuse(R/'scripts/m1-assets/simple-skirt/build-retailor-v1.py',['normals','export'])
mesh=np.load(OLD/'author-meshes.npz');parent=json.loads((OLD/'build-report.json').read_text());measure=json.loads((OLD/'space-report.json').read_text());cap=json.loads(gzip.decompress((S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()));fr=cap['frames'][59];H=np.array(fr['bones']['J_Bip_C_Hips']).reshape(4,4).T;Hinv=np.linalg.inv(H);local=lambda p:(np.c_[p,np.ones(len(p))]@Hinv.T)[:,:3];world=lambda p:(np.c_[p,np.ones(len(p))]@H.T)[:,:3]
tp=R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb';sp=S/'two-quad-thirds-v1/m1-sixfold-skirt-two-quad-thirds-v1.glb';top=asset(tp);skirt=asset(sp);body=next(x for x in fr['colliders']if x['name']=='Bodybaked');B=np.array(body['positions']).reshape(-1,3);BF=np.array(body['triangles']).reshape(-1,3)
rb,bd,br=load(R/'prototype/public/assets/foundation/base-female-roundtrip.vrm');bp=bd['meshes'][0]['primitives'][0];BJ=br(bp['attributes']['JOINTS_0']);BW=br(bp['attributes']['WEIGHTS_0']);bn=[bd['nodes'][j]['name']for j in bd['skins'][0]['joints']];allowed=np.array([n in ['J_Bip_C_Hips','J_Bip_L_UpperLeg','J_Bip_R_UpperLeg']for n in bn]);role=(BW*allowed[BJ]).sum(1);supportIds=np.flatnonzero(np.all(role[BF]>.9,axis=1));bodyLocal=local(B);support=BVHTree.FromPolygons(bodyLocal.tolist(),BF[supportIds].tolist(),all_triangles=True)
#1: Front X-plane flap, unsupported side copies drape vertically; eight side handles from truebody.
T=mesh['topBasis'].copy();TT=T.copy();TF=mesh['topFaces'];origin=mesh['topOrigin'];angle=parent['topHingeAngleRadians'];interface=np.array(measure['interfaceVertices']);frontInterface=interface[top['P'][interface,2]<.015];order=np.argsort(top['P'][frontInterface,0]);fp=top['P'][frontInterface[order]];hip=top['names'].index('J_Bip_C_Hips');bodyBind=(np.c_[B,np.ones(len(B))]@np.linalg.inv(H@top['inv'][hip]).T)[:,:3];sideTree=BVHTree.FromPolygons(bodyBind.tolist(),BF[supportIds].tolist(),all_triangles=True);sideControls=[]
for cut in parent['sideCuts']:
 controls=[]
 for old,new in cut['duplicateMap'].items():
  v=int(new);p=T[v];sgn=np.sign(p[0]);start=np.array([0.,p[1],p[2]]);direction=np.array([sgn,0.,0.]);done=0.;last=None
  for _ in range(20):
   hit,n,face,dist=sideTree.ray_cast(start+direction*done,direction,.3-done)
   if hit is None:break
   done+=float(dist);cos=float(np.dot(n,direction))
   if cos>0:last={'bodyFace':int(supportIds[face]),'exitM':done,'normalCos':cos,'position':list(hit)}
   done+=1e-6
  extra=0. if last is None else max(0.,last['exitM']+.0024/max(last['normalCos'],1e-4)-abs(p[0]));controls.append({'sourceVertex':int(old),'copy':v,'sourceY':float(p[1]),'outwardM':float(extra),'support':last})
 controls.append({'sourceY':.975,'outwardM':0.});controls.sort(key=lambda x:x['sourceY']);sideControls.append(controls)
cutOriginal={int(k)for c in parent['sideCuts']for k in c['duplicateMap']};cutCopies={int(v)for c in parent['sideCuts']for v in c['duplicateMap'].values()}
for i,p in enumerate(T):
 if p[1]>=.975:continue
 old=int(origin[i]);frontCopy=i in cutCopies
 if (old in cutOriginal and not frontCopy)or(p[2]>=.015 and not frontCopy):continue
 radial=np.linalg.norm(p[[0,2]]);frontness=np.clip(-p[2]/max(radial,1e-9),0,1);blend=frontness*frontness*(3-2*frontness)
 if frontCopy:blend=0.
 phi=angle*blend;z0=np.interp(p[0],fp[:,0],fp[:,2]);dy=p[1]-.975;dz=p[2]-z0;c=np.cos(phi);s=np.sin(phi);controls=sideControls[0 if p[0]<0 else 1];extra=np.interp(p[1],[v['sourceY']for v in controls],[v['outwardM']for v in controls])*(1-blend)**2;TT[i]=[p[0]+np.sign(p[0])*extra,.975+c*dy-s*dz,z0+s*dy+c*dz]
assert np.array_equal(TT[origin>=0][T[:,1]>=.975],T[T[:,1]>=.975]);topStage=TT.copy()
#2: Same target ring curves, intrinsic source arc-length correspondence. No global enlargement.
outerN=int(mesh['skirtInner'].min());P=mesh['skirtBasis'][:outerN].copy();Q=local(mesh['skirtTargetWorld'][:outerN]);F=mesh['skirtFaces'][:900].copy();rows=mesh['skirtRows'];arc=[]
for row in rows:
 src=P[row];dst=Q[row].copy();sl=np.linalg.norm(np.roll(src,-1,axis=0)-src,axis=1);dl=np.linalg.norm(np.roll(dst,-1,axis=0)-dst,axis=1);sfrac=np.r_[0,np.cumsum(sl[:-1])]/sl.sum();dc=np.r_[0,np.cumsum(dl)];closed=np.vstack([dst,dst[0]]);new=np.stack([np.interp(sfrac*dl.sum(),dc,closed[:,k])for k in range(3)],axis=1);Q[row]=new;arc.append({'sourceCircumferenceM':float(sl.sum()),'oldTargetCircumferenceM':float(dl.sum()),'maxPointReassignmentM':float(np.linalg.norm(new-dst,axis=1).max())})
arcStage=Q.copy()
#3: One bounded left-front authored support lift, finite samples at real non-symmetric thigh.
weights=np.zeros(len(Q));selected=[]
for ri,row in enumerate(rows,1):
 if ri<7:continue
 for ci,v in enumerate(row):
  if 3<=ci<=9:weights[v]=(0.5 if ri==7 else 1.)*(.5 if ci in [3,9]else 1.)
region=np.flatnonzero(np.any(weights[F]>0,axis=1));barys=np.array([[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3]*3]);required=0.;witness=[];unsupported=[]
for fi in region:
 for bi,bary in enumerate(barys):
  coverage=float(bary@weights[F[fi]])
  if coverage<1e-6:continue
  p=bary@Q[F[fi]];near,n,face,d=support.find_nearest(p);signed=float((p-near)@n)
  if signed>=.0024:continue
  hit=None;done=0.
  if signed>=0 and n[1]>.15:hit={'distanceM':0.,'bodyFace':int(supportIds[face]),'normalY':float(n[1]),'requiredM':(.0024-signed)/float(n[1])}
  else:
   for _ in range(12):
    q,nn,ff,dd=support.ray_cast(p+np.array([0,done,0]),[0,1,0],.08-done)
    if q is None:break
    done+=float(dd)
    if nn[1]>.15:hit={'distanceM':done,'bodyFace':int(supportIds[ff]),'normalY':float(nn[1]),'requiredM':done+.0024/float(nn[1])};break
    done+=1e-6
  if hit:
   amount=hit['requiredM']/coverage;required=max(required,amount);witness.append({'garmentFace':int(fi),'sample':bi,'coverage':coverage,'handleRequiredM':amount,**hit})
  elif signed<0:unsupported.append({'face':int(fi),'sample':bi,'signedM':signed})
assert required<.06,'Measured support would exceed bounded local edit; stop without extra iteration';Q[:,1]+=weights*required;supportStage=Q.copy()
#4: Clip actual outer triangles to nominal last10mm, then nativeSolidify .8mm/evenoffset.
# The diagonal is retained in the returned surface; not independently averaged per-column normals.
L=np.linalg.norm(P[rows[-2]]-P[rows[-1]],axis=1);height={int(v):float(l)for v,l in zip(rows[-2],L)};height.update({int(v):0. for v in rows[-1]});keys={};defs=[];BFaces=[]
def node(key,definition):
 if key not in keys:keys[key]=len(defs);defs.append(definition)
 return keys[key]
for face in F[820:900]:
 poly=[(int(v),float(height[int(v)]),[(int(v),1.)])for v in face];clipped=[]
 for j,(v,h,d)in enumerate(poly):
  pv,ph,pd=poly[j-1];inside=h<=.01;prev=ph<=.01
  if inside!=prev:
   t=(.01-ph)/(h-ph);key=('edge',min(pv,v),max(pv,v));idx=node(key,[(pv,1-t),(v,t)]);clipped.append(idx)
  if inside:clipped.append(node(('vertex',v),d))
 for j in range(1,len(clipped)-1):BFaces.append([clipped[0],clipped[j],clipped[j+1]])
BFaces=np.array(BFaces);band=lambda points:np.array([sum(points[v]*w for v,w in d)for d in defs]);conv=lambda p:np.asarray(p)[...,[0,2,1]]*np.array([1,-1,1]);unconv=lambda p:np.asarray(p)[...,[0,2,1]]*np.array([1,1,-1]);native=[]
def solid(points,label):
 bpy.ops.wm.read_factory_settings(use_empty=True);me=bpy.data.meshes.new(label);me.from_pydata(conv(points).tolist(),[],BFaces.tolist());me.update();ob=bpy.data.objects.new(label,me);bpy.context.scene.collection.objects.link(ob);bpy.context.view_layer.objects.active=ob;ob.select_set(True);mod=ob.modifiers.new('ActualFacetedHemReturn','SOLIDIFY');mod.thickness=.0008;mod.offset=-1.;mod.use_even_offset=True;mod.use_quality_normals=True;mod.use_rim=False;bpy.ops.wm.save_as_mainfile(filepath=str(O/('hem-'+label+'-author.blend')));bpy.ops.object.modifier_apply(modifier=mod.name);v=np.array([v.co[:]for v in ob.data.vertices]);assert len(v)==2*len(points);assert np.max(np.linalg.norm(unconv(v[:len(points)])-points,axis=1))<1e-6;native.append({'label':label,'inputVertices':len(points),'outputVertices':len(v),'operator':'SOLIDIFY','thicknessM':.0008,'offset':-1,'evenOffset':True,'qualityNormals':True});return unconv(v[len(points):])
ib=solid(band(P),'basis');it=solid(band(Q),'seated');innerIds=np.arange(len(P),len(P)+len(ib));SP=np.vstack([P,ib]);QL=np.vstack([Q,it]);SF=F.tolist()+[[int(innerIds[k])for k in face[::-1]]for face in BFaces]
# Attach the true bottom thickness rim only; upperreturn edge intentionally remains an opening.
for ci,v in enumerate(rows[-1]):
 nxt=int(rows[-1][(ci+1)%40]);a=int(v);b=nxt;i=int(innerIds[keys[('vertex',a)]]);j=int(innerIds[keys[('vertex',b)]]);SF.extend([[a,b,j],[a,j,i]])
SF=np.array(SF);SJ=np.vstack([mesh['skirtJ'][:outerN],np.tile([skirt['names'].index('J_Bip_C_Hips'),0,0,0],(len(ib),1))]);SW=np.vstack([mesh['skirtW'][:outerN],np.tile([1.,0,0,0],(len(ib),1))]);SQ=world(QL)
ww=np.array([np.array(fr['bones'][n]).reshape(4,4).T for n in skirt['names']])
for c in fr['controls']:ww[skirt['names'].index(c['name'])]=np.array(c['privateWorld']).reshape(4,4).T
pal=ww@skirt['inv'];mats=sum(pal[SJ[:,k]]*SW[:,k,None,None]for k in range(4));ST=np.linalg.solve(mats,np.c_[SQ,np.ones(len(SQ))][:,:,None])[:,:3,0]
_,td,tr=load(tp);tpr=td['meshes'][0]['primitives'];UV=np.concatenate([tr(p['attributes']['TEXCOORD_0'])for p in tpr])[origin];TJ=top['J'][origin];TW=top['W'][origin];tmat=np.repeat([p.get('material',0)for p in tpr],[len(tr(p['indices']))//3 for p in tpr]);_,sd,sr=load(sp);spr=sd['meshes'][0]['primitives'];uv0=sr(spr[0]['attributes']['TEXCOORD_0']);uv1=sr(spr[1]['attributes']['TEXCOORD_0']);SUV=uv0.tolist()+uv1[mesh['skirtSeamSourceIds']-skirt['counts'][0]].tolist()
for ri in range(1,11):
 for ci in range(40):SUV.append([.2+.4*ci/40,.25+.45*ri/10])
SUV=np.array(SUV);SUV=np.vstack([SUV,band(SUV)]);smat=np.r_[np.full(120,spr[0].get('material',0)),np.full(len(SF)-120,spr[1].get('material',0))]
a=export('m1-sidevent-top-layout-v2',tp,T,TT,TF,TJ,TW,UV,tmat);b=export('m1-panel-skirt-layout-v2',sp,SP,ST,SF,SJ,SW,SUV,smat)
np.savez_compressed(O/'author-meshes.npz',topBasis=T,topTarget=TT,topFaces=TF,topOrigin=origin,skirtBasis=SP,skirtTarget=ST,skirtTargetWorld=SQ,skirtFaces=SF,skirtJ=SJ,skirtW=SW,skirtInner=innerIds,skirtRows=rows,skirtSeamSourceIds=mesh['skirtSeamSourceIds']);np.savez_compressed(O/'layout-stages.npz',topLayout=topStage,skirtParentLocal=local(mesh['skirtTargetWorld'][:outerN]),skirtArcMatched=arcStage,skirtThighSupported=supportStage,innerBasisBand=band(P),innerTargetBand=band(Q),innerBandFaces=BFaces)
report={'status':'single-layout-correction-pending-gates','parentManifestSha256':hashlib.sha256((OLD/'manifest.json').read_bytes()).hexdigest(),'inputs':parent['inputs'],'bodySha256':parent['bodySha256'],'top':a,'skirt':b,'sideCutPathsRetained':parent['sideCuts'],'top':a,'sideControlMeasurements':sideControls,'topXPlaneAngleUsesParentRadians':angle,'topSideFalloff':'smoothstep front direction cosine; exact front-side seam copies0 rotation','arcCorrespondence':arc,'leftThighHandleLiftM':required,'leftThighSupportWitnesses':witness,'leftThighUnsupportedSamples':unsupported,'nativeHemSolidify':native,'innerBandSourceDefinitions':defs,'limits':['Four explicit layout changes, no new parameter variant or nativecloth','Support subsets author only; full Body remains finalgate','Source outer skirt Basis exact parent; only inner topology/thickness construction changes','No runtime hand refit, transitions or gameplay acceptance']};(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'top':a,'skirt':b,'liftM':required,'unsupported':len(unsupported),'hemVertices':len(ib),'sourceOuterExact':bool(np.array_equal(SP[:outerN],mesh['skirtBasis'][:outerN]))}))
