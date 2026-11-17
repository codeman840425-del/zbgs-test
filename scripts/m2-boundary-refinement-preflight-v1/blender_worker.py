"""Official BMesh selected-edge refinement, authoritative attributes from source rows."""
import bpy,bmesh
import hashlib,importlib.util,json,time,traceback
from collections import defaultdict
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-boundary-refinement-preflight-v1';OUT=BASE/'generated'
OLD=ROOT/'assets-source/m2-source-subdivision-seam-v1/generated'
def clean(x):
 if isinstance(x,np.ndarray):return clean(x.tolist())
 if isinstance(x,np.generic):return x.item()
 if isinstance(x,bytes):return x.decode()
 if isinstance(x,dict):return {str(k):clean(v) for k,v in x.items()}
 if isinstance(x,(list,tuple)):return [clean(v) for v in x]
 return x
def save(name,x):(OUT/name).write_text(json.dumps(clean(x),ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def canonical(tri):
 t=tuple(map(int,tri));return min(t,t[1:]+t[:1],t[2:]+t[:2])
def refine(P,F,UV,W,materials,selected,expected_parents):
 """One official operation pair; return actual topology and provenance, never normal data."""
 bm=bmesh.new();pid=bm.faces.layers.int.new('source_parent_id');eid=bm.edges.layers.int.new('source_edge_id')
 uv=bm.loops.layers.uv.new('original_loop_uv');deform=bm.verts.layers.deform.new('source_joint_weights')
 verts=[bm.verts.new(p) for p in P];origin={v:i for i,v in enumerate(verts)}
 for i,v in enumerate(verts):
  for j in np.flatnonzero(W[i]):v[deform][int(j)]=float(W[i,j])
 for i,f in enumerate(F):
  face=bm.faces.new([verts[int(j)] for j in f]);face[pid]=i+1;face.material_index=int(materials[i])
  for loop,j in zip(face.loops,f):loop[uv].uv=UV[i][list(f).index(j)] if UV.ndim==3 else UV[j]
 edges={tuple(sorted((origin[e.verts[0]],origin[e.verts[1]]))):e for e in bm.edges}
 edge_ids={key:i+1 for i,key in enumerate(sorted(edges))};id_edges={i:key for key,i in edge_ids.items()}
 for key,e in edges.items():e[eid]=edge_ids[key]
 required=[edges[tuple(sorted(e))] for e in selected]
 selected_ids={edge_ids[tuple(sorted(e))] for e in selected}
 before_weights={v:dict(v[deform]) for v in verts};before_co={v:tuple(v.co) for v in verts}
 op=bmesh.ops.subdivide_edges(bm,edges=required,cuts=1,smooth=0.0,fractal=0.0,along_normal=0.0,
  use_single_edge=True,use_grid_fill=False,use_only_quads=False,use_sphere=False)
 intermediate=[{'parent':int(f[pid])-1,'vertices':len(f.verts)} for f in bm.faces if len(f.verts)>3]
 assert all(x['parent'] in expected_parents for x in intermediate)
 tri=bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3],quad_method='FIXED',ngon_method='EAR_CLIP')
 for child,parent in tri['face_map'].items():assert child[pid]==parent[pid]
 assert all(tuple(v.co)==before_co[v] and dict(v[deform])==before_weights[v] for v in verts)
 new=[]
 for v in bm.verts:
  if v in origin:continue
  source_ids={e[eid] for e in v.link_edges if e[eid] in selected_ids}
  assert len(source_ids)==1,('ambiguous-new-vertex-edge',source_ids)
  new.append((id_edges[next(iter(source_ids))],v))
 new.sort(key=lambda x:x[0]);assert [x[0] for x in new]==sorted(tuple(sorted(e)) for e in selected)
 out_id={**origin,**{v:len(P)+i for i,(_,v) in enumerate(new)}}
 supports=[([i],[1.]) for i in range(len(P))]+[(list(edge),[.5,.5]) for edge,_ in new]
 points=np.vstack([P,*[P[list(edge)].mean(0)[None] for edge,_ in new]])
 new_weights=np.vstack([W,*[W[list(edge)].mean(0)[None] for edge,_ in new]])
 backend_co=np.array([tuple(v.co) for v in verts]+[tuple(v.co) for _,v in new])
 backend_weight_error=0.
 for edge,v in new:
  expected={int(j):float(new_weights[out_id[v],j]) for j in np.flatnonzero(new_weights[out_id[v]])}
  assert set(dict(v[deform]))==set(expected)
  backend_weight_error=max(backend_weight_error,max([abs(v[deform][j]-w) for j,w in expected.items()]+[0.]))
 faces=[];uv_error=0.;loop_rows=[]
 for face in bm.faces:
  parent=int(face[pid])-1;assert 0<=parent<len(F) and len(face.verts)==3
  assert face.material_index==materials[parent]
  ids=[out_id[v] for v in face.verts]
  bary=np.zeros((3,3));source=F[parent].tolist()
  for k,i in enumerate(ids):
   si,sw=supports[i];assert set(si)<=set(source)
   for j,w in zip(si,sw):bary[k,source.index(j)]=w
  if parent not in expected_parents:
   assert canonical(ids)==canonical(F[parent]);ids=F[parent].tolist();bary=np.eye(3)
  row={'parent':parent,'indices':ids,'bary':bary,'material':face.material_index}
  faces.append(row)
  sourceuv=UV[parent] if UV.ndim==3 else UV[F[parent]]
  for loop in face.loops:
   i=out_id[loop.vert];si,sw=supports[i]
   expected=sum(sourceuv[source.index(j)]*w for j,w in zip(si,sw))
   actual=np.array(loop[uv].uv[:],float);error=float(abs(actual-expected).max());uv_error=max(uv_error,error)
   loop_rows.append({'parent':parent,'vertex':i,'actualUV':actual,'expectedUV':expected})
 faces.sort(key=lambda r:(r['parent'],canonical(r['indices'])))
 newF=np.array([x['indices'] for x in faces],int);parents=np.array([x['parent'] for x in faces],int)
 parentbary=np.array([x['bary'] for x in faces]);actualmats=np.array([x['material'] for x in faces],int)
 assert set(parents)==set(range(len(F)))
 assert all(np.sum(parents==p)==1 for p in range(len(F)) if p not in expected_parents)
 nnew=len(new);edge_array=np.array([edge for edge,_ in new],int)
 cross=lambda pp,ff:np.cross(pp[ff[:,1]]-pp[ff[:,0]],pp[ff[:,2]]-pp[ff[:,0]])
 oldcross=cross(P,F);newcross=cross(points,newF)
 scales=np.linalg.det(parentbary[:,1:,1:]-parentbary[:,0,None,1:])
 assert np.all(scales>0) and np.all(np.einsum('ij,ij->i',newcross,oldcross[parents])>0)
 sums=np.bincount(parents,weights=scales,minlength=len(F));assert np.array_equal(sums,np.ones(len(F)))
 area_error=float(abs(newcross-oldcross[parents]*scales[:,None]).max())
 assert area_error<1e-15
 all_edges={tuple(sorted((int(a),int(b)))) for f in newF for a,b in zip(f,np.roll(f,-1))}
 for i,edge in enumerate(edge_array):
  mid=len(P)+i;assert tuple(edge) not in all_edges
  assert all(tuple(sorted((int(v),mid))) in all_edges for v in edge)
 assert all(e in all_edges for e in edges if e not in {tuple(x) for x in edge_array})
 result={'oldVerticesExactInBackend':True,'oldDeformLayerUnchangedInBackend':True,'newVertices':len(points),
  'newTriangles':len(newF),'newPointCount':nnew,'triangulateFaceMapCount':len(tri['face_map']),
  'intermediateNontriangles':intermediate,'maxBackendCoordinateErrorM':float(abs(backend_co-points).max()),
  'maxBackendNewWeightError':backend_weight_error,'maxBackendLoopUVInterpolationError':uv_error,
  'maxAreaCrossErrorM2':area_error,'parentAreasSumExactlyOne':True,'allOldUnselectedEdgesRetained':True,
  'newPointEdges':edge_array,'normalSource':'sealed authored arrays via sparse lineage; never BMVert.normal',
  'bmeshOutputCounts':{k:len(v) for k,v in op.items()}}
 bm.free()
 return result,{'P':points,'F':newF,'parents':parents,'bary':parentbary,'materials':actualmats,
  'weights':new_weights,'edges':edge_array,'backendPositions':backend_co,'loopUV':loop_rows}

def api_tests():
 results=[]
 for name,two,shared in [('triangle-one-edge',False,False),('triangle-two-edges',True,False),('shared-edge-independent-loop-uv',False,True)]:
  P=np.array([[0.,0.,0.],[2.,0.,0.],[0.,2.,0.]]+([[0.,-2.,0.]] if shared else []))
  F=np.array([[0,1,2]]+([[1,0,3]] if shared else []))
  UV=np.array([P[f,:2]+i*np.array([10.,20.]) for i,f in enumerate(F)])
  W=np.zeros((len(P),3));W[:,2]=1;W[0]=[.75,.25,0];W[1]=[0,1,0]
  selected=[[0,1],[1,2]] if two else [[0,1]]
  r,a=refine(P,F,UV,W,np.arange(len(F)),selected,set(range(len(F))))
  assert r['newPointCount']==len(selected) and r['newTriangles']==len(F)+len(selected)*(2 if shared else 1)
  assert r['maxBackendLoopUVInterpolationError']==0 and r['maxBackendNewWeightError']==0
  if shared:
   midpoint=len(P);uvs=[x['actualUV'] for x in a['loopUV'] if x['vertex']==midpoint]
   assert {tuple(x) for x in uvs}=={(1.,0.),(11.,20.)}
  results.append({'name':name,'passed':True,'result':r})
 save('api-tests.json',{'tests':results,'passed':True,'realSourceNotYetRun':True})

def main():
 start=time.monotonic();spec=json.loads((BASE/'spec.json').read_bytes())
 for row in spec['inputs']:assert sha(ROOT/row['path'])==row['sha256'],row['path']
 version={'version':bpy.app.version,'versionString':bpy.app.version_string,'buildHash':bpy.app.build_hash,
  'buildDate':bpy.app.build_commit_date,'buildTime':bpy.app.build_commit_time,'binaryPath':bpy.app.binary_path,
  'background':bpy.app.background,'numpyVersion':np.__version__,'license':'Blender BMesh source GPL-2.0-or-later',
  'sourceTag':'https://github.com/blender/blender/tree/v4.5.9','gpuOrRenderCalled':False}
 save('tool-identity.json',version);assert list(bpy.app.version)==spec['expectedBlenderVersion']
 api_tests()
 old=np.load(OLD/'group-7.npz',allow_pickle=False);face=np.load(OLD/'group-21.npz',allow_pickle=False)
 P=old['sourcePosition'];F=old['sourceTriangles'];W=old['sourceDenseWeights'];UV=old['source_TEXCOORD_0']
 prov=json.loads((OLD/'provenance-7.json').read_bytes());faceprov=json.loads((OLD/'provenance-21.json').read_bytes())
 reader=importlib.util.spec_from_file_location('boundary_glb',ROOT/'scripts/m2-male-face-v1/glb.py')
 module=importlib.util.module_from_spec(reader);reader.loader.exec_module(module)
 source=ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm';assert sha(source)==spec['sourceSHA256'];g=module.GLB(source)
 assert np.array_equal(g.acc(7),P) and old['sourceDelta'].shape==(0,len(P),3)
 for r in prov['consumers']:
  p=g.doc['meshes'][r['mesh']]['primitives'][r['primitive']];assert not p.get('targets') and p['attributes']==r['attributes']
  for key,acc in p['attributes'].items():
   original=P if key=='POSITION' else old['sourceJointIDs'] if key=='JOINTS_0' else old['sourceWeights'] if key=='WEIGHTS_0' else old['source_'+key]
   assert np.array_equal(g.acc(acc),original)
 fixed=json.loads((ROOT/'evidence/m2-boundary-refinement-method-review-v1/readback.json').read_bytes())
 selected=[x['sourceEdge'] for x in fixed['requiredBodyEdges']];affected={x['sourceTriangle'] for x in fixed['adjacentParentTriangles']}
 assert len(selected)==41 and len(affected)==39
 mats=np.array([prov['consumers'][x['consumer']]['materialIndex'] for x in prov['parentTriangles']])
 # The only actual original-source BMesh refinement in this package.
 r,a=refine(P,F,UV,W,mats,selected,affected)
 assert r['newVertices']==7896 and r['newTriangles']==12049 and r['newPointCount']==41
 Q=a['P'];edges=a['edges'];nw=a['weights'];n=len(P)
 assert np.max((nw>0).sum(1))<=4 and np.max((nw[n:]>0).sum(1))==1
 attributes={}
 for key in ['NORMAL','TEXCOORD_0']:
  raw=old['source_'+key];attributes[key]=np.concatenate([raw.astype(float),raw[edges].astype(float).mean(1)])
  assert np.array_equal(attributes[key][:n],raw)
 joints=old['sourceJointIDs'];weights=old['sourceWeights'];nj=np.zeros((len(Q),4),joints.dtype);nweights=np.zeros((len(Q),4),weights.dtype)
 nj[:n]=joints;nweights[:n]=weights
 for i in range(n,len(Q)):
  active=np.flatnonzero(nw[i]);assert len(active)<=4;nj[i,:len(active)]=active;nweights[i,:len(active)]=nw[i,active]
 assert np.array_equal(nj[:n],joints) and np.array_equal(nweights[:n],weights)
 # Save replayable CSR S without requiring scipy in bundled Blender.
 indices=np.concatenate([np.arange(n),edges.ravel()]);values=np.concatenate([np.ones(n),np.full(82,.5)])
 indptr=np.concatenate([np.arange(n+1),n+2*np.arange(1,42)])
 np.savez_compressed(OUT/'S-body-csr.npz',data=values,indices=indices,indptr=indptr,shape=[7896,7855])
 def midpoint_extend(values):return np.concatenate([values,values[edges].mean(1)])
 lbs=[];errors=[]
 for pose,palette in enumerate(old['posePalettes']):
  def skin(points,dense):
   ans=np.zeros_like(points);hom=np.c_[points,np.ones(len(points))]
   for j in np.flatnonzero((dense>0).any(0)):ans+=(hom@palette[j].T)[:,:3]*dense[:,j,None]
   return ans
  expected=midpoint_extend(skin(P,W));actual=skin(Q,nw);error=np.linalg.norm(actual-expected,axis=1)
  lbs.append({'poseIndex':pose,'maxErrorM':float(error.max()),'worstVertex':int(error.argmax()),'recordedAnimation':False});errors.append(error)
 assert max(x['maxErrorM'] for x in lbs)<1e-12
 mapping={tuple(e):n+i for i,e in enumerate(edges)};cross=json.loads((OLD/'cross-accessor-seams.json').read_bytes());seams=[]
 for x in cross:
  bv=mapping[tuple(sorted(x['bodyEdge']))];fv=x['faceMidpoint'];error=float(np.linalg.norm(Q[bv]-face['newPosition'][fv]))
  face_nodes={int(face['skinJointNodes'][j]):float(face['newDenseWeights'][fv,j]) for j in np.flatnonzero(face['newDenseWeights'][fv])}
  body_nodes={int(old['skinJointNodes'][j]):float(nw[bv,j]) for j in np.flatnonzero(nw[bv])}
  assert error==0 and face_nodes==body_nodes
  seams.append({**x,'localBodyMidpointID':bv,'localMidpointDifferenceM':error,'localNodeWeightsEqual':True})
 np.savez_compressed(OUT/'body-arrays.npz',sourcePosition=P,sourceTriangles=F,newPosition=Q,newTriangles=a['F'],
  parentTriangle=a['parents'],parentBary=a['bary'],materialIndices=a['materials'],newPointEdges=edges,
  sourceJointIDs=joints,sourceWeights=weights,newJointIDs=nj,newWeights=nweights,newDenseWeights=nw,
  sourceNORMAL=old['source_NORMAL'],sourceUV=UV,newNORMAL=attributes['NORMAL'],newUV=attributes['TEXCOORD_0'],
  inverseBindMatrices=old['inverseBindMatrices'],skinJointNodes=old['skinJointNodes'],
  sourceNodeLocalMatrices=old['sourceNodeLocalMatrices'],posePalettes=old['posePalettes'],lbsErrorsM=errors,
  backendPositions=a['backendPositions'])
 save('body-provenance.json',{'original':prov,'affectedParents':sorted(affected),'newPointEdges':edges,
  'actualChildCountByAffectedParent':{i:int((a['parents']==i).sum()) for i in sorted(affected)},'bodyMorphTargets':0})
 save('loop-uv-readback.json',a['loopUV']);save('cross-accessor-seams.json',seams)
 save('face-reuse.json',{'files':[row for row in spec['inputs'] if any(p in row['path'] for p in ['group-21.npz','S-21.npz','provenance-21.json'])],
  'targets':54,'consumers':9,'newVertices':7251,'newTriangles':12672,'newFaceSubdivisionCalls':0,
  'dataUnmodified':True,'targetSignatures':faceprov['consumers'][0]['targetSignatures']})
 result={'schema':'boundary-refinement-preflight-result-v1','status':'topology-preflight-passed-no-shape-or-expression-admission',
  'sourceRuns':1,'apiTestsPassed':3,'faceSubdivisionCalls':0,'body':r,'all6BodyConsumers':True,
  'all9FaceConsumersReused':True,'bodyTargets':0,'faceTargets':54,'maxAllBodyInfluences':int((nw>0).sum(1).max()),
  'maxNewPointInfluences':1,'over4Count':0,'oldRawJointSlotsAndWeightsExact':True,'oldAuthoredNormalsUVExact':True,
  'IBMAndSkeletonPreserved':True,'crossAccessorSeams':41,'noTNodesAtDeclaredSeams':True,'lbs':lbs,
  'GCalled':False,'candidateContactsExecuted':False,'exported':False,'runtimeChanged':False,
  'parentContactClassifierStillPending':True,'seconds':time.monotonic()-start,
  'backendFloat32VsAuthoritativeFloat64':'Blender topology source coordinates use float; authoritative midpoint arrays use exact .5/.5 of original Float32 source, with backend error separately recorded.'}
 save('result.json',result);print(json.dumps(clean(result)))
try:main()
except Exception as exc:
 save('failure.json',{'exception':type(exc).__name__,'message':str(exc),'traceback':traceback.format_exc(),'GCalled':False})
 raise
