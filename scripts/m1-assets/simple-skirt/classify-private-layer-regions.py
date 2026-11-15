"""Locate actual private-layer clearance/crossings without altering solver scope."""
from pathlib import Path
import ast,gzip,hashlib,json
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'private-layer-initial'
capture=json.loads(gzip.decompress((O/'capture.json.gz').read_bytes()));gate=json.loads((O/'actual-geometry-gate.json').read_text(encoding='utf-8'))
# Reuse only the tested pure geometry functions, never module execution/gating.
helper=R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py';tree=ast.parse(helper.read_text(encoding='utf-8'));defs=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in ['point_tri','seg_seg','near_minimum']];exec(compile(ast.Module(body=defs,type_ignores=[]),str(helper),'exec'),globals())
regions=[('preserved120',0,120),('zipper',120,260),('transitionRow0',260,500),('transitionRow1',500,740),('transitionRow2',740,980),('transitionRow3Join',980,1220),('lowerRow4',1220,1460),('lowerRow5',1460,1700),('lowerRow6',1700,1940),('outerHemRow7',1940,2180),('innerReturn',2180,2420)]
standing=capture['frames'][0];points=[];faces=[];offset=0
for m in standing['skirt']:
 p=np.array(m['positions']).reshape(-1,3);points.extend(p);faces.extend(np.array(m['triangles']).reshape(-1,3)+offset);offset+=len(p)
points=np.array(points);faces=np.array(faces);results=[]
for name,start,end in regions:
 row={'region':name,'faceStartInclusive':start,'faceEndExclusive':end,'standingClearances':[],'fourPoseCrossings':[]}
 for collider in standing['colliders']:
  if collider['name']not in ['Bodybaked','m1-uniform-top_1']:continue
  q=np.array(collider['positions']).reshape(-1,3);t=np.array(collider['triangles']).reshape(-1,3);distance=near_minimum(points[faces[start:end]],q[t]);
  if 'skirtFace'in distance:distance['skirtFace']+=start
  row['standingClearances'].append({'name':collider['name'],**distance})
 for f in gate['rows']:
  row['fourPoseCrossings'].append({'label':f['label'],'contacts':{c['name']:sum(start<=pair[0]<end for pair in c['pairs'])for c in f['contacts']},'selfPairsTouchingRegion':sum(start<=a<end or start<=b<end for a,b in f['selfPairs'])})
 results.append(row)
report={'build':gate['build'],'helperSha256':hashlib.sha256(helper.read_bytes()).hexdigest(),'basis':'Actual final private palette, both primitive indices concatenated; original interface still intact','regions':results,'limits':['Classifies current geometry only; does NOT exempt pinned regions or redefine material/contact gates.','Upper source preservation is not equivalent to every transition ring being fixed or collision-free.','Four poses do not prove entire motion source-pin feasibility.']}
(O/'region-admission.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps([{'region':r['region'],'standing':[(c['name'],c.get('distanceMetres'),c.get('lowerBoundMetres'),c.get('skirtFace'))for c in r['standingClearances']],'seatedBody':r['fourPoseCrossings'][2]['contacts']['Bodybaked']}for r in results],indent=2))
