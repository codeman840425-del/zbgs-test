"""Actual source invariants and finite nonadjacent-crossing evidence."""
from pathlib import Path
import gzip,hashlib,importlib.util,json
import numpy as np
ROOT=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('space',ROOT/'scripts/audit-skirt-layer-space.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);O=m.S/'hem-return-v1'
od,oa,osh=m.glb(m.S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb');nd,na,nsh=m.glb(O/'m1-sixfold-skirt-hem-return-v1.glb');assert osh=='d7b5a881d1a64bdaf5e1d92a72573c2cef34abe859e53af0f9a2c8b091bd55fa'and nsh=='4d005100b4aba7e66710d725fdd6115f7b7d254b5a88e95d46d1ff9a800c1782'
op,np_=od['meshes'][0]['primitives'],nd['meshes'][0]['primitives'];assert od['skins']==nd['skins']and od['materials']==nd['materials']
for x,y in zip(op,np_):assert np.array_equal(oa(x['indices']),na(y['indices']))
for k in op[0]['attributes']:assert np.array_equal(oa(op[0]['attributes'][k]),na(np_[0]['attributes'][k]))
for k in ['POSITION','JOINTS_0','WEIGHTS_0','TEXCOORD_0']:assert np.array_equal(oa(op[1]['attributes'][k])[:1109],na(np_[1]['attributes'][k])[:1109])
positions=np.concatenate([oa(x['attributes']['POSITION'])for x in op]);faces=np.concatenate([oa(op[0]['indices']).reshape(-1,3),oa(op[1]['indices']).reshape(-1,3)+162]);pair=[2159,2397];tri=faces[pair];assert not set(tri[0])&set(tri[1]);assert min(np.linalg.norm(x-y)for x in positions[tri[0]]for y in positions[tri[1]])>1e-6
cap=json.loads(gzip.decompress((m.S/'private-layer-initial/capture.json.gz').read_bytes()));frame=cap['frames'][0];p=np.concatenate([np.array(x['positions']).reshape(-1,3)for x in frame['skirt']]);A,B=p[tri[0]],p[tri[1]];hits=[];distances=[]
for label,first,second in [('outer-edge-to-return',A,B),('return-edge-to-outer',B,A)]:
 e1=second[1]-second[0];e2=second[2]-second[0];normal=np.cross(e1,e2);normal/=np.linalg.norm(normal);distances.append({'direction':label,'planeVertexDistancesMetres':((first-second[0])@normal).tolist()})
 for k in range(3):
  start=first[k];direction=first[(k+1)%3]-start;h=np.cross(direction,e2);det=e1@h
  if abs(det)<1e-12:continue
  q=start-second[0];u=q@h/det;v=direction@np.cross(q,e1)/det;t=e2@np.cross(q,e1)/det
  if 0<u and 0<v and u+v<1 and 0<t<1:hits.append({'direction':label,'edge':k,'t':float(t),'barycentric':[float(1-u-v),float(u),float(v)],'world':(start+direction*t).tolist()})
assert len(hits)==2
newp=na(np_[1]['attributes']['POSITION']);f=na(np_[1]['indices']).reshape(-1,3);normal=np.cross(newp[f[:,1]]-newp[f[:,0]],newp[f[:,2]]-newp[f[:,0]]);before=oa(op[1]['attributes']['POSITION']);oldnormal=np.cross(before[f[:,1]]-before[f[:,0]],before[f[:,2]]-before[f[:,0]])
def distance(point,triangles):
 a=triangles[:,0];u=triangles[:,1]-a;v=triangles[:,2]-a;q=point-a;uu=(u*u).sum(1);uv=(u*v).sum(1);vv=(v*v).sum(1);qu=(q*u).sum(1);qv=(q*v).sum(1);den=uu*vv-uv*uv;good=abs(den)>1e-24;inv=np.divide(1,den,out=np.zeros_like(den),where=good);s=(qu*vv-qv*uv)*inv;t=(qv*uu-qu*uv)*inv;project=a+s[:,None]*u+t[:,None]*v;dist=((point-project)**2).sum(1);dist[~(good&(s>=0)&(t>=0)&(s+t<=1))]=np.inf
 for i,j in [(0,1),(1,2),(2,0)]:
  delta=triangles[:,j]-triangles[:,i];r=np.divide(((point-triangles[:,i])*delta).sum(1),(delta*delta).sum(1),out=np.zeros(len(delta)),where=(delta*delta).sum(1)>1e-24);closest=triangles[:,i]+np.clip(r,0,1)[:,None]*delta;dist=np.minimum(dist,((point-closest)**2).sum(1))
 return float(np.sqrt(dist.min()))
outerTriangles=newp[f[:-240]];separations=[distance(point,outerTriangles)for point in newp[1109:]]
result={'parentSha256':osh,'candidateSha256':nsh,'sourceAllIndicesMaterialsSkinSame':True,'retained120Exact':True,'allOuterPositionsWeightsUVExact':True,'actualParentBuild':'58394ce674e4','parentActualPair':pair,'parentVertexIDs':tri.tolist(),'sharedOrCoincidentVertex':False,'parentStrictInteriorHits':hits,'parentPlaneDistances':distances,'intersectionSegmentLengthMetres':float(np.linalg.norm(np.array(hits[0]['world'])-hits[1]['world'])),'newSourceMinimumDoubleTriangleArea':float(np.linalg.norm(normal,axis=1).min()),'newVsParentFaceNormalOver90':int(((normal*oldnormal).sum(1)<0).sum()),'actualSourceInnerRingVertexToOuterPanelMetres':{'min':min(separations),'median':float(np.median(separations)),'max':max(separations),'scope':'Finite inner ring vertex-to-all-outer-triangle distance; not minimum gap of all folded surfaces, which meet at the shared fold edge.'},'construction':{'changedLowerRange':[1109,1229],'verticalReturnMetres':.01,'inwardNormalOffsetMetres':.0008,'selfBVHInflationMetres':0,'bodyTopReserveMetres':.002,'thicknessMeaning':'Turned surface band tapers from zero separation at shared fold edge to nominal0.8mm inward offset at inner ring; not a solid cloth thickness/collision volume.'}}
(O/'source-check.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in result.items()if k not in ['parentStrictInteriorHits','parentPlaneDistances']},indent=2))
