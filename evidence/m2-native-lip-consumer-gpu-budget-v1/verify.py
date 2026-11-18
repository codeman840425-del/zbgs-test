"""Check the shipped sidecars and embedded Body normal PNGs against the measured WebGL2 handles."""
import hashlib
import json
import struct
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PACKAGE = ROOT / 'experiments/m2-native-lip-game-handoff-v1'
HANDOFF = ROOT / 'evidence/m2-native-lip-game-handoff-v1'
sha = lambda b: hashlib.sha256(b).hexdigest()
read = lambda p: json.loads(p.read_bytes())

def main():
    report = read(HERE / 'report.json')
    installed = read(PACKAGE/'records/manifest.json')['entries']
    inputs = read(HANDOFF/'records.json')
    source = read(HANDOFF/'budget-input.json')['records']
    assert report['status'] == 'measured-development-only' and not report['errors']
    assert all(c['build'] == '637b3f8bb4a3' for c in report['cases'])
    pair = report['cases'][-1]['handleProbe']
    assert pair['webgl2'] and all(not h['live'] for h in pair['afterRelease'])
    normals = []
    shared = []
    for record, entry, row in zip(inputs, installed, source, strict=True):
        identity = record['identity']['id']
        assert identity == entry['id'] == row['id']
        assert entry['recordSha256'] == record['integrity']['recordSha256']
        assert read(PACKAGE/entry['url'].lstrip('/')) == record
        body, = (r for r in row['files'] if 'Exact foundation body' in r['reasons'])
        data = (PACKAGE/body['path'].lstrip('/')).read_bytes()
        assert sha(data) == body['sha256']
        size, = struct.unpack_from('<I',data,12)
        doc = json.loads(data[20:20+size])
        mat, = (m for m in doc['materials'] if '_Body_00_SKIN' in m['name'])
        texture = doc['textures'][mat['normalTexture']['index']]
        img = doc['images'][texture['source']]
        view = doc['bufferViews'][img['bufferView']]
        offset = 28+size+view.get('byteOffset',0)
        png = data[offset:offset+view['byteLength']]
        normal = [b for b in pair['bindings'] if b['actor']==identity and '_Body_' in b['material'] and b['slot']=='normalMap']
        assert {b['outline'] for b in normal} == {False,True} and all(b['live'] for b in normal)
        assert all(len({b[k] for b in normal})==1 for k in ('texture','source','image','handle'))
        normals.append(dict(id=identity,bodySha256=body['sha256'],pngSha256=sha(png),pngBytes=len(png),
                            webglHandle=normal[0]['handle'],imageBitmap=normal[0]['image'],dimensions=[normal[0]['width'],normal[0]['height']],
                            mainAndOutlineShareTextureSourceImageAndHandle=True))
        for role in ('_Face_00_SKIN','_FaceEyeline_','_Body_00_SKIN'):
            channels = [b for b in pair['bindings'] if b['actor']==identity and role in b['material'] and
                        not b['outline'] and b['slot'] in ('map','shadeMultiplyTexture')]
            assert len(channels) == 2 and all(b['live'] for b in channels)
            shared.append(dict(actor=identity,material=role,slots=[b['slot'] for b in channels],
                               imageBitmaps=[b['image'] for b in channels],sources=[b['source'] for b in channels],
                               webglHandles=[b['handle'] for b in channels]))
    assert normals[0]['pngSha256']==normals[1]['pngSha256']
    assert normals[0]['webglHandle']!=normals[1]['webglHandle']
    cases = []
    for row in report['cases']:
        before, during, after = (row[k] for k in ['baseline','afterSample','released'])
        assert all(after[k]==before[k] for k in ('textures','geometries','programs'))
        assert all(not h['live'] for h in row['handleProbe']['afterRelease'])
        cases.append(dict(ids=row['ids'],baseline=before,stable=during,afterActorDisposal=after,
                          textureDelta=during['textures']-before['textures'],frameP95ms=row['summary']['frame']['p95'],
                          loadMs=row['loadMs'],sampledFrames=row['summary']['frame']['count']))
    output = dict(build=report['cases'][0]['build'],gpu=report['cases'][0]['gpu'],browser=report['browser'],
                  evidenceSha256=sha((HERE/'report.json').read_bytes()),recordsSha256=sha((HANDOFF/'records.json').read_bytes()),
                  cases=cases,bodyNormalMap=normals,pairedActiveMapShade=shared,
                  scope='Object IDs are from a single WebGL2 context for the pair. Live initialized handles are directly observed; driver residency bytes, sample cost on ordinary hardware and long-run leaks are unmeasured.')
    (HERE/'readback.json').write_text(json.dumps(output,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':
    main()
