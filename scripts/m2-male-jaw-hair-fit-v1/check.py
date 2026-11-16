"""Source/export geometry checks, deterministic fit rebuild, then public packaging."""
from pathlib import Path
import sys,subprocess,json,hashlib,time
import numpy as np
ROOT=Path(__file__).resolve().parents[2];PACKAGE=ROOT/'assets-source/m2-male-jaw-hair-fit-v1';OUT=ROOT/'evidence/m2-male-jaw-hair-fit-v1'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'));from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
t=time.perf_counter()
subprocess.run([sys.executable,str(ROOT/'scripts/m2-male-jaw-hair-fit-v1/rebuild-original-geometry.py')],check=True,cwd=ROOT)
files=['fit.json','manifest.json','parameters.json','male-sidepart.glb','editable.blend','provenance.json']
before={f:sha(PACKAGE/f)for f in files}
subprocess.run([sys.executable,str(ROOT/'scripts/m2-male-jaw-hair-fit-v1/build.py'),'--out',str(PACKAGE/'fresh')],check=True,cwd=ROOT)
assert before=={f:sha(PACKAGE/'fresh'/f)for f in files}
assert sha(PACKAGE/'editable-export.glb')==sha(PACKAGE/'reexport-repeat.glb')
g=GLB(PACKAGE/'male-sidepart.glb');e=GLB(PACKAGE/'editable-export.glb')
assert len(g.doc['meshes'])==len(e.doc['meshes'])==1
p=g.doc['meshes'][0]['primitives'][0];q=e.doc['meshes'][0]['primitives'][0]
assert 'skins'not in g.doc and 'skins'not in e.doc and not p.get('targets')and not q.get('targets')
def values(glb,prim,key):return glb.acc(prim['attributes'][key]).astype(float)
v,w=values(g,p,'POSITION'),values(e,q,'POSITION');a,b=values(g,p,'TEXCOORD_0'),values(e,q,'TEXCOORD_0')
n,m=values(g,p,'NORMAL'),values(e,q,'NORMAL')
for z in [v,w,a,b,n,m]:assert np.isfinite(z).all()
ia,ib=g.acc(p['indices']).reshape(-1,3),e.acc(q['indices']).reshape(-1,3)
assert len(ia)==len(ib)==408
# Match vertices jointly by position + UV; allow exporter seam duplication.
distance=np.max(abs(v[:,None,:]-w[None,:,:]),axis=2);uvdistance=np.max(abs(a[:,None,:]-b[None,:,:]),axis=2)
matches=[];duplicates=[]
for j in range(len(w)):
    ids=np.flatnonzero((distance[:,j]<=1e-6)&(uvdistance[:,j]<=1e-6));assert len(ids)>0
    # Coincident source seam points 7/106 have distinct normals. Preserve that
    # split when reporting normal deviation; position/UV-only nearest is ambiguous.
    matches.append(int(ids[np.argmin(np.max(abs(n[ids]-m[j]),axis=1))]))
    if len(ids)>1:duplicates.append({'export':j,'sourceCandidates':ids.tolist()})
matches=np.array(matches)
assert np.all(np.any((distance<=1e-6)&(uvdistance<=1e-6),axis=1))
def triangleKeys(vertices,uv,indices):
    result=[]
    for row in indices:
        corners=[tuple(np.round(np.r_[vertices[i],uv[i]],6))for i in row]
        result.append(min(tuple(corners[k:]+corners[:k])for k in range(3)))
    return sorted(result)
assert triangleKeys(v,a,ia)==triangleKeys(w,b,ib)
posmax=float(np.max(abs(v[matches]-w)));uvmax=float(np.max(abs(a[matches]-b)));normalmax=float(np.max(abs(n[matches]-m)))
assert posmax<=1e-6 and uvmax<=1e-6
assert max(float(abs(np.linalg.norm(z,axis=1)-1).max())for z in [n,m])<1e-6
# The original export is independently archived; present candidate is exactly it.
assert sha(PACKAGE/'editable-export.glb')==sha(ROOT/'assets-source/m2-male-hairstyle-v1/editable-export.glb')
assert sha(PACKAGE/'male-sidepart.glb')==sha(ROOT/'assets-source/m2-male-hairstyle-v1/male-sidepart.glb')
fit=json.loads((PACKAGE/'fit.json').read_text(encoding='utf8'));manifest=json.loads((PACKAGE/'manifest.json').read_text(encoding='utf8'))
assert fit['id']==manifest['fit']['id']=='male-sidepart-jaw-fit-v1'and fit['version']==manifest['fit']['version']==1
assert manifest['fit']['sha256']==sha(PACKAGE/'fit.json')
assert manifest['compatibleBodies']==[fit['targetBodySha256']]
assert fit['assetSha256']==manifest['sha256']==sha(PACKAGE/'male-sidepart.glb')
assert fit['sourceBodySha256']==g.doc['extras']['avatarSha256']
assert fit['targetBodySha256']!=fit['sourceBodySha256']
assert fit['attachment']=={'bone':'head','space':'raw-head-bind-local','position':[0,0,0],'quaternion':[0,0,0,1],'scale':[1,1,1]}
geom=json.loads((OUT/'geometry-report.json').read_text(encoding='utf8'));assert geom['nodesExact']and len(geom['headRegionAll54Shapes'])==54
assert all(not x['originalStrictHit']and not x['jawStrictHit']for x in geom['changedRegionStrictIntersectionChecks'])
public=ROOT/'prototype/public/assets/m2-male-jaw-hair-fit-v1';public.mkdir(parents=True,exist_ok=True)
for f in ['fit.json','manifest.json','male-sidepart.glb']:(public/f).write_bytes((PACKAGE/f).read_bytes())
(public/'.gitattributes').write_text('* -text whitespace=cr-at-eol\n',encoding='ascii',newline='\n')
report={'deterministicPackageRebuild':True,'hashes':before,'independentBlenderExportsByteIdentical':True,'editableExportSHA256':sha(PACKAGE/'editable-export.glb'),
 'canonicalAndEditableExportByteIdentical':False,'canonicalVertices':len(v),'exportVertices':len(w),'triangles':len(ia),'orientedTriangleCornerPositionUVEquivalentAt1eMinus6':True,'distinctNormalDisambiguatedSourceMatches':len(set(matches)),'coincidentPositionUVSeamCandidates':duplicates,
 'maxPositionComponentM':posmax,'maxUVComponent':uvmax,'maxNormalComponentDifference':normalmax,'normalGate':'finite/unit; source exporter normals measured, canonical production normals unchanged',
 'originalAssetExtrasUnchanged':True,'fitReferenceSHAValid':True,'allInputsRevalidatedByBuild':True,
 'publicByteCopiesExact':all(sha(public/f)==sha(PACKAGE/f)for f in ['fit.json','manifest.json','male-sidepart.glb']),
 'seconds':time.perf_counter()-t,'runtimeOrVisualPass':False}
(OUT/'source-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report))
normalRows=[{'source':int(i),'export':j,'normalMax':float(abs(n[i]-m[j]).max())}for j,i in enumerate(matches)]
(OUT/'export-normal-diagnostic.json').write_text(json.dumps({'maxNormalBestEquivalentPositionUV':normalmax,'worst':sorted(normalRows,key=lambda x:-x['normalMax'])[:5],'duplicatePositionUVCandidates':duplicates,'productionCanonicalUnchanged':True,'notAClaimOfExporterNormalEquivalence':True},indent=2)+'\n',encoding='utf8')
