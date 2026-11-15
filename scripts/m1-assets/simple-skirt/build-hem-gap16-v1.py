"""One source-only nominal1.6mm inner return, no fitting/search."""
from pathlib import Path
import ast,hashlib,json,struct,shutil
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'hem-gap16-v1';assert R.name=='m1-simple-skirt-worktree'and not O.exists()
h=R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py';t=ast.parse(h.read_text());exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name=='load'],type_ignores=[]),str(h),'exec'),globals())
parent=S/'two-quad-thirds-v1/m1-sixfold-skirt-two-quad-thirds-v1.glb';raw,d,read=load(parent);assert hashlib.sha256(raw).hexdigest()=='02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7'
n=struct.unpack_from('<I',raw,12)[0];binary=bytearray(raw[28+n:]);low=d['meshes'][0]['primitives'][1];old={k:read(v)for k,v in low['attributes'].items()};new={k:v.copy()for k,v in old.items()};records=json.loads((S/'hem-return-v1/hem-mapping.json').read_text());indices=np.array([x['lowerVertex']for x in records]);assert len(indices)==121 and min(indices)==1109 and max(indices)==1229
for row in records:
 i=row['lowerVertex'];new['POSITION'][i]=np.array(row['surfacePoint'])-.0016*np.array(row['outwardNormal'])
faces=read(low['indices']).reshape(-1,3);touchedFaces=np.any(np.isin(faces,indices),axis=1);normalIds=np.unique(faces[touchedFaces]);normal=np.zeros_like(new['POSITION'],dtype=float);p=new['POSITION'].astype(float);cross=np.cross(p[faces[:,1]]-p[faces[:,0]],p[faces[:,2]]-p[faces[:,0]])
for k in range(3):np.add.at(normal,faces[:,k],cross)
normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-20);new['NORMAL'][normalIds]=normal[normalIds]
mask=np.ones(len(p),bool);mask[indices]=False;assert np.array_equal(new['POSITION'][mask],old['POSITION'][mask])
for key in ['JOINTS_0','WEIGHTS_0','TEXCOORD_0']:assert np.array_equal(new[key],old[key])
def append(a):
 a=np.asarray(a,dtype='<f4');binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(a.tobytes());vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes});ai=len(d['accessors']);d['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(a),'type':'VEC3','min':a.min(0).tolist(),'max':a.max(0).tolist()});return ai
for k in ['POSITION','NORMAL']:low['attributes'][k]=append(new[k])
ident='m1-sixfold-skirt-hem-gap16-v1';d['meshes'][0]['name']=ident
for node in d['nodes']:
 if'mesh'in node:node['name']=ident
d['extras'].update(fitId='female-027bed-hem-gap16-v1',notAccepted=True,method='Same029 two-quad source; only121inner return positions nominalnormaloffset1.6mm instead of.8mm; weights unchanged')
d['buffers']=[{'byteLength':len(binary)}];jb=json.dumps(d,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary+=b'\0'*(-len(binary)%4);out=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary
O.mkdir();(O/(ident+'.glb')).write_bytes(out);shutil.copyfile(S/'two-quad-thirds-v1/face-lineage.json',O/'face-lineage.json')
report={'id':ident,'sha256':hashlib.sha256(out).hexdigest(),'parentSha256':hashlib.sha256(raw).hexdigest(),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'sourceMappingSha256':hashlib.sha256((S/'hem-return-v1/hem-mapping.json').read_bytes()).hexdigest(),'changedLowerPositionIndices':indices.tolist(),'changedLowerNormalIndices':normalIds.tolist(),'nominalOffsetMetres':.0016,'maxDisplacementMetres':float(np.linalg.norm(new['POSITION']-old['POSITION'],axis=1).max()),'externalPositionsExact':True,'allWeightsUVTopologyExact':True,'upper120Seam20Exact':True,'status':'source-only-pending-gates'};(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'sha256':report['sha256'],'maxDisplacementMetres':report['maxDisplacementMetres']}))
