"""Replay frozen actual private palettes onto new source; not a new GPU capture."""
from pathlib import Path
import argparse,copy,gzip,hashlib,json,struct,sys
import numpy as np
ROOT=Path(__file__).resolve().parents[1];R=ROOT/'experiments/m1-simple-skirt-worktree';S=R/'assets-source/m1/simple-skirt-v1'
parser=argparse.ArgumentParser();parser.add_argument('--candidate-dir',default='hem-return-v1');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]if '--'in sys.argv else []);O=(S/args.candidate_dir).resolve();assert O.is_relative_to(S)
def load(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);buf=b[28+n:]
 def read(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']]);w={'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16,'SCALAR':1}[a['type']]
  return np.ndarray((a['count'],w),dtype=dt,buffer=buf,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 return d,read,hashlib.sha256(b).hexdigest()
packed=(S/'private-layer-initial/capture.json.gz').read_bytes();raw=gzip.decompress(packed);assert hashlib.sha256(packed).hexdigest()=='4fd19faa881fee247942dc8d74ff58008f1f6769546c1fb4b4dc0340ba99937f'and hashlib.sha256(raw).hexdigest()=='80dbf946b2db0e766d31920f73241123f647a33ab9cb1f157cc026a040c02d14';capture=json.loads(raw);assert capture['identity']['runtimeBuild']['shortId']=='58394ce674e4';predicted=copy.deepcopy(capture)
nd,na,nsha=load(O/'m1-sixfold-skirt-hem-return-v1.glb');od,oa,osha=load(S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb');assert nsha=='4d005100b4aba7e66710d725fdd6115f7b7d254b5a88e95d46d1ff9a800c1782'
assert osha=='d7b5a881d1a64bdaf5e1d92a72573c2cef34abe859e53af0f9a2c8b091bd55fa';names=[nd['nodes'][i]['name']for i in nd['skins'][0]['joints']];ib=na(nd['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);mat=lambda x:np.array(x).reshape(4,4).T;rows=[]
for oldframe,frame in zip(capture['frames'],predicted['frames']):
 world=np.array([mat(frame['bones'][n])for n in names])
 for c in frame['controls']:world[names.index(c['name'])]=mat(c['privateWorld'])
 palette=world@ib;errors=[]
 for k,(oldpr,newpr)in enumerate(zip(od['meshes'][0]['primitives'],nd['meshes'][0]['primitives'])):
  def pose(pr,a):
   p=a(pr['attributes']['POSITION']);h=np.c_[p,np.ones(len(p))];j=a(pr['attributes']['JOINTS_0']);w=a(pr['attributes']['WEIGHTS_0']);out=np.zeros((len(p),4))
   for i in range(4):out+=np.einsum('nij,nj->ni',palette[j[:,i]],h)*w[:,i,None]
   return out[:,:3]
  expected=pose(oldpr,oa);actual=np.array(oldframe['skirt'][k]['positions']).reshape(-1,3);err=float(np.linalg.norm(expected-actual,axis=1).max());assert err<2e-6;errors.append(err);points=pose(newpr,na);frame['skirt'][k]['positions']=points.reshape(-1).tolist();frame['skirt'][k]['triangles']=na(newpr['indices']).reshape(-1).tolist()
 rows.append({'pose':frame['label'],'parentActualReadbackErrors':errors})
predicted['prediction']={'sourceSha256':nsha,'originalActualCaptureBuild':'58394ce674e4','basis':'Offline new source on exact captured final PRIVATE bone palette; colliders/hands from old source capture, no new runtime acceptance'}
out=O/'capture.json.gz';assert not out.exists();out.write_bytes(gzip.compress(json.dumps(predicted).encode(),mtime=0));(O/'private-palette-prediction.json').write_text(json.dumps({'parentSha256':osha,**predicted['prediction'],'frames':rows},indent=2)+'\n',encoding='utf-8')
gate=R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py';code=gate.read_text(encoding='utf-8')
relative=O.relative_to(S).as_posix();replacements={"O=S/'private-layer-initial'":"O=S/"+repr(relative),"S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb'":"S/"+repr(relative+'/m1-sixfold-skirt-hem-return-v1.glb'),"ACTUAL final visible two-primitives with private helpers and newly fitted hands":"OFFLINE candidate source on frozen58394 final private palettes; old captured hands, not new GPU"}
for a,b in replacements.items():assert code.count(a)==1;code=code.replace(a,b)
(O/'gate-adapter.json').write_text(json.dumps({'originalGate':gate.relative_to(ROOT).as_posix(),'originalSHA256':hashlib.sha256(gate.read_bytes()).hexdigest(),'replacements':replacements,'unchanged':'BVH self filtering, body/top2mm reserve, finite distance formulas and all4poses'},indent=2)+'\n',encoding='utf-8')
exec(compile(code,str(gate),'exec'),{'__file__':str(gate),'__name__':'__main__'})
