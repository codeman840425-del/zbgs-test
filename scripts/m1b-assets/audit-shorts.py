"""Independent final-GLB repeatability, retained-seat geometry and exposed skin checks."""
import hashlib,importlib.util,json,pathlib
import numpy as np
from scipy.spatial import cKDTree
ROOT=pathlib.Path(__file__).resolve().parents[2]
s=importlib.util.spec_from_file_location('source_glb',ROOT/'scripts/qa-m1c-source.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
folder=ROOT/'assets-source/m1b/shorts';cfg=json.loads((folder/'spec.json').read_text());out=ROOT/'prototype/public/assets/m1b'
def load(name):return m.GLB((out/name).read_bytes())
pants=load('m1b-uniform-pants.glb');shorts=load('m1b-uniform-shorts-v1.glb')
def primitive(g):
 p=next(p for p in g.j['meshes'][0]['primitives']if '_Bottoms_'in g.j['materials'][p['material']]['name']);return p,{k:g.acc(v)for k,v in p['attributes'].items()}
pp,pa=primitive(pants);sp,sa=primitive(shorts)
# Full vertex signature includes geometry/UV and semantic weight palette.
def signatures(g,a):
 names=[g.nodes[n]['name']for n in g.j['skins'][0]['joints']];rows=[]
 allNames=sorted(set(names)|set(pants.nodes[n]['name']for n in pants.j['skins'][0]['joints']))
 for i,pos in enumerate(a['POSITION']):
  weights={names[int(j)]:float(w)for j,w in zip(a['JOINTS_0'][i],a['WEIGHTS_0'][i])if w>0}
  rows.append(np.r_[pos,a['TEXCOORD_0'][i],[weights.get(n,0)for n in allNames]])
 return np.array(rows)
pt,st=signatures(pants,pa),signatures(shorts,sa);high=sa['POSITION'][:,1]>.75
distance,indices=cKDTree(pt).query(st[high]);assert distance.max()<3e-7
tri=shorts.acc(sp['indices']).reshape(-1,3);mins=sa['POSITION'][tri,1].min(1)
assert float(sa['POSITION'][:,1].min())>.65
report={'shortsSha256':hashlib.sha256((out/'m1b-uniform-shorts-v1.glb').read_bytes()).hexdigest(),
 'retainedUpperSurface':{'testBandWorldYGreaterThan':.75,'checkedVertices':int(high.sum()),'maximumPositionUvSemanticWeightDifference':float(distance.max()),'meaning':'Existing upper/seat surface is numerically preserved. This gives a prior for seating fit only; new hem and posed legs still require independent runtime contact/occlusion acceptance.'},
 'actualOuterTriangleCount':len(tri),'actualOuterMinimumY':float(sa['POSITION'][:,1].min()),'sourceBodyUntouched':hashlib.sha256((ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm').read_bytes()).hexdigest()==cfg['compatibleAvatarSha256'],
 'runtimeStatus':'Not yet visually accepted; static binding/retained-surface evidence only'}
(folder/'geometry-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report,indent=2))
