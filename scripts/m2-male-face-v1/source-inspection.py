import bpy,pathlib,json,hashlib,collections
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/m2-male-face-v1';spec=json.loads((ROOT/'assets-source/m1b/spec.json').read_text());source=ROOT/spec['editableSource'];assert hashlib.sha256(source.read_bytes()).hexdigest()==spec['editableSourceSha256']
bpy.ops.wm.open_mainfile(filepath=str(source));face=bpy.data.objects['Face'];mesh=face.data;basis=mesh.shape_keys.key_blocks[0];p=[x.co.copy()for x in basis.data];by=[]
for i,m in enumerate(mesh.materials):
 ids=sorted({v for f in mesh.polygons if f.material_index==i for v in f.vertices});pts=[p[k]for k in ids];by.append({'index':i,'material':m.name,'count':len(ids),'bounds':[[min(v[k]for v in pts)for k in range(3)],[max(v[k]for v in pts)for k in range(3)]],'ids':ids})
keys=[]
for key in mesh.shape_keys.key_blocks[1:]:
 ids=[i for i,x in enumerate(key.data)if(x.co-p[i]).length>1e-7];pts=[p[k]for k in ids];keys.append({'name':key.name,'changedCount':len(ids),'bounds':[[min(v[k]for v in pts)for k in range(3)],[max(v[k]for v in pts)for k in range(3)]]if pts else None,'ids':ids})
edges=collections.Counter(tuple(sorted((a,b)))for f in mesh.polygons for a,b in zip(f.vertices,list(f.vertices[1:])+[f.vertices[0]]));boundary=sorted({v for e,n in edges.items()if n==1 for v in e})
report={'sourceBlend':spec['editableSource'],'sourceBlendSha256':spec['editableSourceSha256'],'sourceVRM':spec['roundtrip'],'sourceVRMSha256':spec['roundtripSha256'],'matrixWorld':[list(x)for x in face.matrix_world],'positions':[list(v)for v in p],'materials':by,'shapeKeys':keys,'boundaryVertexIds':boundary,'boundaryPositions':[list(p[i])for i in boundary]}
(OUT/'inspection.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({'materials':[{k:v for k,v in m.items()if k!='ids'}for m in by],'keys':[{k:v for k,v in m.items()if k!='ids'}for m in keys if any(x in m['name']for x in ['MTH_A','EYE_Close'])],'boundary':len(boundary)},indent=2))
