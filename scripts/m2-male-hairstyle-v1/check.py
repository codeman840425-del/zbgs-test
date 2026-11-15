"""Meaningful data identity and source regeneration checks; no visual pass claim."""
import pathlib,sys,json,hashlib,subprocess,numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/m2-male-hairstyle-v1'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'));from glb import GLB
files=['male-sidepart.glb','original-head-local.glb','manifest.json','fit.json']
before={f:hashlib.sha256((OUT/f).read_bytes()).hexdigest()for f in files}
subprocess.run([sys.executable,str(ROOT/'scripts/m2-male-hairstyle-v1/build.py')],cwd=ROOT,check=True)
after={f:hashlib.sha256((OUT/f).read_bytes()).hexdigest()for f in files};assert before==after
g=GLB(OUT/'male-sidepart.glb');p=g.doc['meshes'][0]['primitives'][0]
assert len(g.doc['nodes'])==1 and 'skins' not in g.doc and 'JOINTS_0' not in p['attributes']
for k in p['attributes']:assert np.isfinite(g.acc(p['attributes'][k])).all()
n=g.acc(p['attributes']['NORMAL']);assert np.max(abs(np.linalg.norm(n,axis=1)-1))<1e-6
r={'deterministicRebuild':True,'hashes':after,'singleRigidMesh':True,'finiteAttributes':True,'unitNormals':True,'canonicalRebuild':'python scripts/m2-male-hairstyle-v1/build.py'}
if (OUT/'editable-export.glb').exists():
 e=GLB(OUT/'editable-export.glb');ep=e.doc['meshes'][0]['primitives'][0]
 # Exporter may split/reorder vertices; compare actual triangle corner positions.
 def corners(o,p):return o.acc(p['attributes']['POSITION'])[o.acc(p['indices']).ravel()]
 a=corners(g,p);b=corners(e,ep)
 def canonical(a):return sorted(tuple(np.round(v,6))for v in a)
 assert canonical(a)==canonical(b)
 r['editableExportTriangleCornerPositionsWithinMicrometre']=True
 r['editableExportSha256']=hashlib.sha256((OUT/'editable-export.glb').read_bytes()).hexdigest()
(OUT/'check-report.json').write_text(json.dumps(r,indent=2),encoding='utf-8');print(json.dumps(r))
