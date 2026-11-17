"""Single triangle lifecycle instrumentation, no original asset or G."""
import bpy,bmesh,json,traceback
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/m2-boundary-refinement-api-recovery-v1/diagnostic'
OUT.mkdir(exist_ok=False,parents=True)
bm=bmesh.new();vid=bm.verts.layers.int.new('original_source_id');eid=bm.edges.layers.int.new('original_edge_id')
pid=bm.faces.layers.int.new('original_parent_id');uv=bm.loops.layers.uv.new('source_uv');dw=bm.verts.layers.deform.new('source_weights')
verts=[];old_edges=[];old_faces=[];stages=[]
def item(x):
 d={'type':type(x).__name__,'isValid':bool(x.is_valid)}
 if not x.is_valid:return d
 if isinstance(x,bmesh.types.BMVert):d.update(co=list(x.co),sourceID=x[vid],weights=dict(x[dw]))
 if isinstance(x,bmesh.types.BMEdge):d.update(sourceID=x[eid],vertexSourceIDs=[v[vid] for v in x.verts])
 if isinstance(x,bmesh.types.BMFace):d.update(sourceID=x[pid],vertexSourceIDs=[v[vid] for v in x.verts])
 return d
def snap(stage,returned=None):
 row={'stage':stage,'oldVertexWrappers':[item(x) for x in verts], 'oldEdgeWrappers':[item(x) for x in old_edges],
 'oldFaceWrappers':[item(x) for x in old_faces], 'liveVertices':[item(v) for v in bm.verts],
 'liveEdges':[item(e) for e in bm.edges],'liveFaces':[item(f) for f in bm.faces],
 'counts':[len(bm.verts),len(bm.edges),len(bm.faces)]}
 if returned is not None:
  row['returned']={k:([{'key':item(a),'value':item(b)} for a,b in v.items()] if isinstance(v,dict)
   else [item(x) for x in v]) for k,v in returned.items()}
 stages.append(row);(OUT/'stages.json').write_text(json.dumps(stages,indent=2)+'\n',encoding='utf-8')
try:
 snap('empty-created-with-layers')
 for i,co in enumerate([(0,0,0),(2,0,0),(0,2,0)]):
  v=bm.verts.new(co);v[vid]=i+1;v[dw][i]=1;verts.append(v)
 snap('vertices-created')
 f=bm.faces.new(verts);f[pid]=1
 for loop in f.loops:loop[uv].uv=loop.vert.co[:2]
 old_faces=list(bm.faces);old_edges=list(bm.edges)
 for i,e in enumerate(old_edges):e[eid]=i+1
 snap('triangle-and-attributes-created-before-subdivide')
 edge=next(e for e in bm.edges if set(v[vid] for v in e.verts)=={1,2})
 op=bmesh.ops.subdivide_edges(bm,edges=[edge],cuts=1,smooth=0.0,fractal=0.0,along_normal=0.0,
 use_single_edge=True,use_grid_fill=False,use_only_quads=False,use_sphere=False)
 snap('after-subdivide-before-triangulate',op)
 tr=bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3],quad_method='FIXED',ngon_method='EAR_CLIP')
 snap('after-triangulate',tr)
 result={'version':bpy.app.version_string,'buildHash':bpy.app.build_hash.decode(),
 'stages':len(stages),'sourceAssetRuns':0,'topologyParametersChanged':False,
 'allOriginalCoordinatesStillPresent':all(sum(tuple(v.co)==co for v in bm.verts)==1 for co in [(0,0,0),(2,0,0),(0,2,0)]),
 'GCalled':False}
 (OUT/'result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
except Exception:
 (OUT/'failure.txt').write_text(traceback.format_exc(),encoding='utf-8');raise
finally:bm.free()
