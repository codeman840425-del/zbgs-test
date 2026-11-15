"""Combine two independently authored disjoint source edits; no new fitting."""
from pathlib import Path
import argparse,ast,hashlib,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1'
parser=argparse.ArgumentParser();parser.add_argument('--out',default='assets-source/m1/simple-skirt-v1/active-gap-hem-v1');args=parser.parse_args();O=(R/args.out).resolve()
assert R.name=='m1-simple-skirt-worktree'and O.is_relative_to(S.resolve())and not O.exists()
helper=R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py';parsed=ast.parse(helper.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in parsed.body if isinstance(n,ast.FunctionDef)and n.name=='load'],type_ignores=[]),str(helper),'exec'),globals())
paths=[S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb',S/'active-layer-admission-v1/m1-sixfold-skirt-active-gap-v1.glb',S/'hem-return-v1/m1-sixfold-skirt-hem-return-v1.glb']
expected=['d7b5a881d1a64bdaf5e1d92a72573c2cef34abe859e53af0f9a2c8b091bd55fa','148ad6a3c4d03d461240185069377abc1fd4422f0aa8220203c1e309b0db2e9b','4d005100b4aba7e66710d725fdd6115f7b7d254b5a88e95d46d1ff9a800c1782']
loaded=[load(p)for p in paths]
assert [hashlib.sha256(b).hexdigest()for b,d,r in loaded]==expected
raw,doc,read=loaded[1];n=struct.unpack_from('<I',raw,12)[0];binary=bytearray(raw[28+n:]);attrs={};diffs=[]
for attribute in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0','TEXCOORD_0']:
    values=[rd(d['meshes'][0]['primitives'][1]['attributes'][attribute])for b,d,rd in loaded]
    changed=[np.flatnonzero(np.any(v!=values[0],axis=1))for v in values[1:]]
    assert not len(np.intersect1d(*changed)),f'Overlapping edits: {attribute}'
    combined=values[1].copy();combined[changed[1]]=values[2][changed[1]];attrs[attribute]=combined
    assert np.array_equal(combined[:20],values[0][:20])
    diffs.append({'attribute':attribute,'activeChangedIndices':changed[0].tolist(),'hemChangedIndices':changed[1].tolist(),'overlap':0})
    for b,d,rd in loaded[1:]:
        assert np.array_equal(rd(d['meshes'][0]['primitives'][0]['attributes'][attribute]),loaded[0][2](loaded[0][1]['meshes'][0]['primitives'][0]['attributes'][attribute]))
for b,d,rd in loaded[1:]:
    assert d['skins']==loaded[0][1]['skins']and d['materials']==loaded[0][1]['materials']
    assert np.array_equal(rd(d['skins'][0]['inverseBindMatrices']),loaded[0][2](loaded[0][1]['skins'][0]['inverseBindMatrices']))
    for i in range(2):assert np.array_equal(rd(d['meshes'][0]['primitives'][i]['indices']),loaded[0][2](loaded[0][1]['meshes'][0]['primitives'][i]['indices']))
def append(values,component,kind):
    values=np.asarray(values,dtype={5126:'<f4',5123:'<u2'}[component]);binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(values.tobytes());vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes});entry={'bufferView':vi,'componentType':component,'count':len(values),'type':kind}
    if kind=='VEC3':entry.update(min=values.min(0).tolist(),max=values.max(0).tolist())
    ai=len(doc['accessors']);doc['accessors'].append(entry);return ai
for attribute in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']:doc['meshes'][0]['primitives'][1]['attributes'][attribute]=append(attrs[attribute],5123 if attribute=='JOINTS_0'else 5126,'VEC4'if attribute in ['JOINTS_0','WEIGHTS_0']else'VEC3')
ident='m1-sixfold-skirt-active-gap-hem-v1';doc['meshes'][0]['name']=ident
for node in doc['nodes']:
    if'mesh'in node:node['name']=ident
doc['extras'].update(fitId='female-027bed-active-gap-hem-v1',notAccepted=True,method='Exact disjoint active-gap30 position edits plus hem121 position/weight construction; no new fit')
doc['buffers']=[{'byteLength':len(binary)}];jb=json.dumps(doc,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary+=b'\0'*(-len(binary)%4);glb=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary
O.mkdir();(O/(ident+'.glb')).write_bytes(glb)
report={'id':ident,'sha256':hashlib.sha256(glb).hexdigest(),'status':'pending-combined-full-gate-not-admitted','inputs':[{'path':p.relative_to(R).as_posix(),'sha256':h}for p,h in zip(paths,expected)],'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'attributeChanges':diffs,'exactInvariants':['upper primitive all tested attributes','lower seam20 attributes','all index/UV/materials','skeleton/skin/inverseBind'],'limits':['Hem intentionally changes121 weights from its own independently verified source construction. Not all original weights unchanged.','No new pose, controller or cloth.']}
(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'id':ident,'sha256':report['sha256'],'attributes':[(d['attribute'],len(d['activeChangedIndices']),len(d['hemChangedIndices']))for d in diffs]}))
