"""Export exactly one shared-column correction. Frozen v2 top/Basis and target curves."""
from pathlib import Path
import ast, struct, json, gzip, hashlib, copy, shutil
import numpy as np
import bpy
R=Path(__file__).resolve().parents[3]; S=R/'assets-source/m1/simple-skirt-v1'; OLD=S/'local-retailor-layout-v2'; O=S/'local-retailor-shared-columns-v1'
assert (O/'mapping-result.json').exists() and not (O/'build-report.json').exists()
def reuse(path,names):
 t=ast.parse(path.read_text(encoding='utf-8-sig')); nodes=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names]
 code=ast.unparse(ast.Module(body=nodes,type_ignores=[])).replace('build-retailor-v1.py; source cut paths and source/target coordinates retained','build-retailor-shared-columns-v1.py; frozen v2 target curves and shared material coordinates')
 exec(compile(code,str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-blender-seated-author-v1.py',['load']);reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset']);reuse(R/'scripts/m1-assets/simple-skirt/build-retailor-v1.py',['normals','export'])
m=np.load(OLD/'author-meshes.npz'); st=np.load(OLD/'layout-stages.npz'); old=json.loads((OLD/'build-report.json').read_text(encoding='utf-8')); mapping=np.load(O/'shared-mapping.npz'); Q=mapping['targetLocal']; defs=old['innerBandSourceDefinitions']; BFaces=st['innerBandFaces']; native=[]
band=lambda points:np.array([sum(points[v]*w for v,w in d)for d in defs]); conv=lambda p:np.asarray(p)[...,[0,2,1]]*np.array([1,-1,1]);unconv=lambda p:np.asarray(p)[...,[0,2,1]]*np.array([1,1,-1])
reuse(R/'scripts/m1-assets/simple-skirt/build-retailor-layout-v2.py',['solid'])
inner=solid(band(Q),'seated');QL=np.vstack([Q,inner])
cap=json.loads(gzip.decompress((S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()));fr=cap['frames'][59];H=np.array(fr['bones']['J_Bip_C_Hips']).reshape(4,4).T;SQ=(np.c_[QL,np.ones(len(QL))]@H.T)[:,:3]
sp=S/'two-quad-thirds-v1/m1-sixfold-skirt-two-quad-thirds-v1.glb';skirt=asset(sp);ww=np.array([np.array(fr['bones'][n]).reshape(4,4).T for n in skirt['names']])
for c in fr['controls']:ww[skirt['names'].index(c['name'])]=np.array(c['privateWorld']).reshape(4,4).T
pal=ww@skirt['inv'];SJ=m['skirtJ'];SW=m['skirtW'];mats=sum(pal[SJ[:,k]]*SW[:,k,None,None]for k in range(4));ST=np.linalg.solve(mats,np.c_[SQ,np.ones(len(SQ))][:,:,None])[:,:3,0]
_,sd,sr=load(sp);spr=sd['meshes'][0]['primitives'];uv0=sr(spr[0]['attributes']['TEXCOORD_0']);uv1=sr(spr[1]['attributes']['TEXCOORD_0']);SUV=uv0.tolist()+uv1[m['skirtSeamSourceIds']-skirt['counts'][0]].tolist()
for ri in range(1,11):
 for ci in range(40):SUV.append([.2+.4*ci/40,.25+.45*ri/10])
SUV=np.array(SUV);SUV=np.vstack([SUV,band(SUV)]);SF=m['skirtFaces'];smat=np.r_[np.full(120,spr[0].get('material',0)),np.full(len(SF)-120,spr[1].get('material',0))]
b=export('m1-panel-skirt-shared-columns-v1',sp,m['skirtBasis'],ST,SF,SJ,SW,SUV,smat)
for ext in ['glb','blend']:shutil.copyfile(OLD/('m1-sidevent-top-layout-v2.'+ext),O/('m1-sidevent-top-layout-v2.'+ext))
arrays={k:m[k]for k in m.files}; arrays['skirtTarget']=ST;arrays['skirtTargetWorld']=SQ;np.savez_compressed(O/'author-meshes.npz',**arrays)
np.savez_compressed(O/'layout-stages.npz',topLayout=st['topLayout'],skirtParentLocal=st['skirtParentLocal'],skirtArcMatched=Q,skirtThighSupported=Q,innerBasisBand=st['innerBasisBand'],innerTargetBand=band(Q),innerBandFaces=BFaces)
report={'status':'single-mapping-correction-awaiting-full-gates','parentManifestSha256':hashlib.sha256((OLD/'manifest.json').read_bytes()).hexdigest(),'inputs':old['inputs'],'bodySha256':old['bodySha256'],'top':old['top'],'skirt':b,'nativeHemSolidify':native,'topBytesIdentical':True,'skirtBasisTopologyWeightsIdentical':True,'mapping':json.loads((O/'mapping-result.json').read_text(encoding='utf-8')),'limits':['Only material sampling differs; new inner target follows unchanged thickness method','No controller/action/hand/sourceBasis/top alteration','No global enlargement or parameter scan']}
(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'skirt':b,'topBytesIdentical':True}))
