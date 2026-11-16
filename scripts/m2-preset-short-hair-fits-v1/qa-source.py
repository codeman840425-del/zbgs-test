"""Repeat current outputs and probe actual resource/write/dependency failures."""
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import sys
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-preset-short-hair-fits-v1'
sys.path.insert(0,str(Path(__file__).parent))
import build
from contact_geometry import measure_pair


def main():
    batch_root = Path(sys.argv[1]).resolve()
    spec = json.loads((BASE/'spec.json').read_bytes())
    batch = json.loads((batch_root/'assets-source/m2-representative-batch-v1/generated/manifest.json').read_bytes())
    checks = []
    for row in batch['variants']:
        payloads,status = build.export(spec['families'][row['sex']],row,batch_root)
        assert all((BASE/'ready'/row['id']/name).read_bytes()==data for name,data in payloads.items())
    checks.append({'name':'All eight strict preflight target payloads repeat byte-for-byte','passed':True})
    for identifier in ['male-wide-muscular','male-round-stocky']:
        row = next(row for row in batch['variants'] if row['id']==identifier)
        payloads,status = build.export(spec['families'][row['sex']],row,batch_root,'transparent-source-texels')
        assert status=='source-contact-candidate'
        assert all((BASE/'conditional'/identifier/name).read_bytes()==data for name,data in payloads.items())
    checks.append({'name':'Both complete conditional fit/contact payloads repeat byte-for-byte','passed':True})
    fixture_root = BASE/'qa';fixture_root.mkdir(exist_ok=True)
    fixtures = Path(tempfile.mkdtemp(prefix='run-',dir=fixture_root))
    source = spec['families']['male']
    def run(identifier,sex,digest,output):
        manifest = fixtures/(identifier+'-input.json')
        manifest.write_bytes(build.encoded({'schema':'character-representative-batch-v1','variants':[{'id':identifier,'sex':sex,'status':'source-passed','avatar':{'path':source['body'],'sha256':digest}}]}))
        command = [sys.executable,'-B',str(Path(__file__).with_name('build.py')),'--batch-root',str(ROOT),'--batch-manifest',manifest.relative_to(ROOT).as_posix(),'--out',output.relative_to(ROOT).as_posix()]
        return subprocess.run(command,cwd=ROOT,capture_output=True,text=True)
    output = fixtures/'writer'
    success = run('original-male','male',source['bodySha256'],output)
    assert success.returncode==0
    assert not any(p.is_dir() and p.name.startswith('.') for p in output.iterdir())
    checks.append({'name':'Actual original VRM source CLI stages a full positive fit and removes its stage by rename','passed':True})
    for identifier,sex,digest in [('wrong-sha','male','0'*64),('wrong-family','female',source['bodySha256'])]:
        failed = run(identifier,sex,digest,output)
        folder = output/identifier
        assert failed.returncode==0 and {p.name for p in folder.iterdir()}=={'FAILED.json'}
        checks.append({'name':identifier+' actual resource refusal writes only failure receipt','passed':True,'error':json.loads((folder/'FAILED.json').read_bytes())['error']})
    folder = output/'original-male'
    target = folder/'fit.json';target.write_bytes(b'!'+target.read_bytes()[1:])
    before = {p.name:build.sha(p.read_bytes()) for p in folder.iterdir()}
    refused = run('original-male','male',source['bodySha256'],output)
    assert refused.returncode!=0 and before=={p.name:build.sha(p.read_bytes()) for p in folder.iterdir()}
    checks.append({'name':'Conflicting existing output refuses overwrite and preserves every existing payload','passed':True})
    refused = run('wrong-sha','male',source['bodySha256'],output)
    assert refused.returncode!=0 and {p.name for p in (output/'wrong-sha').iterdir()}=={'FAILED.json'}
    checks.append({'name':'A previous failed target cannot silently acquire mixed success files','passed':True})
    original,manifest,hair,head,inverse = build.family(source)
    raw = (ROOT/source['body']).read_bytes()
    for kind in ['raw-head-transform','original-cap-vertex']:
        target = build.GLB(raw)
        if kind=='raw-head-transform':
            target.doc['nodes'][head]['translation'][0]+=.01
        else:
            primitive = next(p for mesh in target.doc['meshes'] for p in mesh['primitives'] if target.doc['materials'][p['material']]['name']==source['material'])
            index = int(target.accessor(primitive['indices'])[0][0])
            accessor = target.doc['accessors'][primitive['attributes']['POSITION']]
            view = target.doc['bufferViews'][accessor['bufferView']]
            offset = view.get('byteOffset',0)+accessor.get('byteOffset',0)+index*view.get('byteStride',12)
            binary = bytearray(target.binary);value=struct.unpack_from('<f',binary,offset)[0]
            struct.pack_into('<f',binary,offset,value+.01);target.binary=bytes(binary)
        try:
            build.inspect(original,target,hair,head,inverse,source['material'])
        except ValueError as error:
            checks.append({'name':'Parsed actual GLB '+kind+' mutation rejects fit','passed':True,'error':str(error)})
        else:
            raise AssertionError('Dependency mutation was accepted')
    classification = json.loads((BASE/'contact-classification.json').read_bytes())
    evidence = classification['rows'][0]['pairs'][0]
    hi,fi = evidence['hairTriangle'],evidence['faceTriangle']
    row = next(row for row in batch['variants'] if row['id']=='male-wide-muscular')
    target = build.GLB((batch_root/row['avatar']['path']).read_bytes())
    location = classification['rows'][0]
    p = original.doc['meshes'][location['mesh']]['primitives'][location['primitive']]
    q = target.doc['meshes'][location['mesh']]['primitives'][location['primitive']]
    indices = np.array(target.accessor(q['indices']),int).reshape(-1,3)
    asset=build.GLB((ROOT/source['asset']).read_bytes());hp=asset.doc['meshes'][0]['primitives'][0]
    ht=np.array(asset.accessor(hp['indices']),int).reshape(-1,3);uv=build.points(asset,hp,'TEXCOORD_0')
    opaque=Image.new('RGBA',tuple(classification['textureDimensions']),(255,255,255,255))
    result=measure_pair(hair[hi],build.points(original,p)[indices[fi]],build.points(target,q)[indices[fi]],uv[ht[hi]],opaque,inverse)
    assert all(f['maxAlpha0To255']==255 for f in result['positiveDepthTextureFootprints'])
    checks.append({'name':'Actual contact geometry with an explicit opaque-texture fixture is classified opaque','passed':True,'fixture':'Synthetic opaque image only. Geometry is the actual new target/source pair.'})
    report={'checks':checks,'CPUOnly':True,'runtimeAccepted':False,'limits':['Dependency mutations are parsed real-GLB fixtures in memory. Original files are unchanged.','The opaque image is a declared negative fixture. Published alpha evidence uses the actual embedded PNG.','Writer test outputs and deliberate corruption remain under qa, separated from ready and conditional resources.']}
    (BASE/'writer-and-repeat-qa.json').write_bytes(build.encoded(report))
    print(json.dumps({'checks':len(checks),'passed':True}))


if __name__=='__main__':
    main()
