"""Read-only lineage/strict-crossing diagnosis of the one frozen pattern."""
from pathlib import Path
import ast,collections,hashlib,json,sys
import numpy as np
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-layered-outer-v1';OUT=BASE/'generated'
# Replay only the pure geometry prefix, stopping BEFORE mkdir/export/write.
script=ROOT/'scripts/m2-layered-outer-v1/build.py';parsed=ast.parse(script.read_text(encoding='utf-8'));prefix=[]
for node in parsed.body:
 if isinstance(node,ast.Expr)and isinstance(node.value,ast.Call)and isinstance(node.value.func,ast.Attribute)and node.value.func.attr=='mkdir':break
 prefix.append(node)
ns={'__file__':str(script),'__name__':'source_geometry_readonly'};oldargv=sys.argv;sys.argv=[str(script),'--out','diagnostic-not-written']
try:exec(compile(ast.Module(body=prefix,type_ignores=[]),str(script),'exec'),ns)
finally:sys.argv=oldargv
assert not(BASE/'diagnostic-not-written').exists()
source=ROOT/'scripts/audit-skirt-layer-corridor-dynamic.py';nodes=ast.parse(source.read_text(encoding='utf-8')).body
exec(compile(ast.Module(body=[n for n in nodes if isinstance(n,ast.FunctionDef)and n.name=='intersections'],type_ignores=[]),str(source),'exec'))
tree=lambda p,f:BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True,epsilon=0.)
def nonadjacent(p,f):
 ids=[];w={}
 for q in p:
  key=tuple(np.round(q,6));w.setdefault(key,len(w));ids.append(w[key])
 return [(a,b)for a,b in tree(p,f).overlap(tree(p,f))if a<b and not(set(ids[i]for i in f[a])&set(ids[i]for i in f[b]))]
m=ns['m'];P=ns['positions'].astype(np.float32).astype(float);F=ns['alltri'];raw=ns['v'][:,:3];t=ns['t'];count=len(t);lineage=ns['lineage'];a=ns['a'];sourceP=a['POSITION'].astype(float);sourceF=ns['tri'];audit=json.loads((OUT/'source-audit.json').read_text(encoding='utf-8'))
def kind(i):return 'outer'if i<count else'inner'if i<2*count else'rim'
def origin(i):return lineage[i%count]if i<2*count else None
def categories(p,f,pairs):
 counts=collections.Counter();witness=[]
 for a,b in pairs:
  line,strict=intersections(p[f[a]],p[f[b]]);counts['strict'if strict else'non-strict-or-coplanar']+=1
  if strict and len(witness)<8:witness.append({'faces':[int(a),int(b)],'line':[q.tolist()for q in line]})
 return {'counts':dict(counts),'witnesses':witness}
rawpairs=nonadjacent(raw,t);sourcepairs=nonadjacent(sourceP,sourceF)
rawdiag=categories(raw,t,rawpairs);sourcediag=categories(sourceP,sourceF,sourcepairs)
selfrows=[];counts=collections.Counter()
for i,j in audit['selfNonAdjacentPairs']:
 oi,oj=origin(i),origin(j);line,strict=intersections(P[F[i]],P[F[j]])
 relation='rim'if oi is None or oj is None else'same-source-face'if oi==oj else'source-adjacent'if set(sourceF[oi])&set(sourceF[oj])else'source-nonadjacent'
 key='/'.join([kind(i),kind(j),relation,'strict'if strict else'non-strict-or-coplanar']);counts[key]+=1
 selfrows.append({'faces':[i,j],'kind':[kind(i),kind(j)],'sourceFaces':[oi,oj],'relation':relation,'strict':strict,'line':[q.tolist()for q in line]})
topP=sourceP;topF=sourceF;topCounts=collections.Counter();toprows=[]
for i,j in audit['contacts']['topAndTie']['trianglePairs']:
 oi=origin(i)
 if j>=len(sourceF):topCounts['tie']+=1;continue
 line,strict=intersections(P[F[i]],topP[topF[j]])
 relation='rim'if oi is None else'same-source-face'if oi==j else'source-adjacent'if set(sourceF[oi])&set(sourceF[j])else'source-nonadjacent'
 topCounts[kind(i)+'/'+relation+('/strict'if strict else'/non-strict-or-coplanar')]+=1
 toprows.append({'faces':[i,j],'sourceFace':oi,'relation':relation,'strict':strict,'line':[q.tolist()for q in line]})
norm=a['NORMAL'].astype(float);faceNormal=np.cross(sourceP[sourceF[:,1]]-sourceP[sourceF[:,0]],sourceP[sourceF[:,2]]-sourceP[sourceF[:,0]]);dot=np.einsum('ij,ij->i',faceNormal,norm[sourceF].mean(1))
originalRelations=collections.Counter();seamRelations=collections.Counter();seamExamples=[]
for r in selfrows:
 oi,oj=r['sourceFaces']
 if oi is None or oj is None:continue
 aa,bb=sourceP[sourceF[oi]],sourceP[sourceF[oj]]
 hits,strict=intersections(aa,bb)
 identical=all(any(np.array_equal(p,q)for q in bb)for p in aa)
 common=[(int(i),int(j))for i in sourceF[oi]for j in sourceF[oj]if np.linalg.norm(sourceP[i]-sourceP[j])<1e-7]
 if common:
  angles=[float(np.degrees(np.arccos(np.clip(norm[i]@norm[j]/(np.linalg.norm(norm[i])*np.linalg.norm(norm[j])),-1,1))))for i,j in common]
  seamRelations['source-geometric-adjacent-with-split-normal'if max(angles)>.1 else'source-geometric-adjacent-same-normal']+=1
  if len(seamExamples)<6:seamExamples.append({'finalFaces':r['faces'],'sourceFaces':[oi,oj],'matchedVertices':common,'maxAuthoredNormalAngleDegrees':max(angles)})
 else:seamRelations['source-no-shared-position']+=1
 originalRelations['duplicate-source-triangle'if identical else'original-strict-crossing'if strict else'original-contact'if hits else'original-not-crossing']+=1
result={'sourceGeometryReplayOnly':True,'outputGuardNotBypassed':True,'generatorSha256':hashlib.sha256(script.read_bytes()).hexdigest(),
 'predicateSourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'strictPredicate':'finite edge/triangle crossing, barycentric and segment interior >1e-7; determinant >1e-15; not a thickness/depth certification',
 'sourceUnmodifiedTopSelf':sourcediag,'clippedBeforeOffsetSelf':rawdiag,'sourceFacesOpposingAuthoredNormals':int(np.count_nonzero(dot<0)),
 'originalRelationsOfFinalSelfPairs':dict(originalRelations),'sourceGeometricAdjacencyOfFinalSelfPairs':dict(seamRelations),'splitNormalWitnesses':seamExamples,'finalSelfCounts':dict(counts),'finalTopCounts':dict(topCounts),'finalSelfRows':selfrows,'finalTopRows':toprows,
 'limitations':['Source-face adjacency is exact original render-index adjacency, UV duplicates may be classified nonadjacent.','Original top/tie primitive triangle ordering checked separately.','No new parameter, offset candidate, solver or asset generation.']}
(OUT/'contact-diagnosis.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items()if k not in ['finalSelfRows','finalTopRows']},indent=2))
