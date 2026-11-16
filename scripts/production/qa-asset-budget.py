"""CPU regression for cost accounting, real admission and invalid dependencies."""
import copy
import io
import json
import pathlib
import struct
import subprocess
import sys
import tempfile

from PIL import Image
from asset_budget import AssetCost, ROOT, budget_config, check


def write_glb(path, doc, binary):
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' '*(-len(text) % 4)
    binary += b'\0'*(-len(binary) % 4)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(binary))
                     + struct.pack('<I4s', len(text), b'JSON')+text
                     + struct.pack('<I4s', len(binary), b'BIN\0')+binary)


passed = []


def verify(name, condition):
    if not condition:
        raise AssertionError(name)
    passed.append(name)


def rejects(name, callback, expected):
    try:
        callback()
    except (ValueError, OSError, KeyError) as error:
        verify(name, expected in str(error))
        return
    raise AssertionError(name+' did not reject')


config = budget_config(ROOT/'scripts/production/asset-budgets-v1.json', 'm2-technical-v1')
real = ROOT/'prototype/public/assets/m1b/m1b-uniform-shorts-v1.glb'
result = check(real, 'garment', config)
verify('real shorts actual triangles and image dimensions', result['status'] == 'admitted'
       and result['metrics']['triangles'] == 928 and result['images'][0]['width'] == 1024)
low = copy.deepcopy(config)
low['classes']['garment']['triangles'] = 1
rejected = check(real, 'garment', low)
verify('real asset low budget rejects without changing asset', rejected['status'] == 'rejected'
       and rejected['violations'] == [{'metric': 'triangles', 'actual': 928, 'limit': 1}]
       and rejected['sha256'] == result['sha256'])
with tempfile.TemporaryDirectory(prefix='asset-budget-') as directory:
    folder = pathlib.Path(directory)
    image = io.BytesIO()
    Image.new('RGBA', (4, 2)).save(image, format='PNG')
    (folder/'image.png').write_bytes(image.getvalue())
    path = folder/'fixture.glb'
    binary = struct.pack('<9f', 0, 0, 0, 1, 0, 0, 0, 1, 0)
    doc = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': len(binary)}],
           'bufferViews': [{'buffer': 0, 'byteLength': len(binary)}],
           'accessors': [{'bufferView': 0, 'componentType': 5126, 'type': 'VEC3', 'count': 3}],
           'meshes': [{'primitives': [{'attributes': {'POSITION': 0}}, {'attributes': {'POSITION': 0}}]}],
           'nodes': [{'mesh': 0}, {'mesh': 0}], 'images': [{'uri': 'image.png'}],
           'textures': [{'source': 0}, {'source': 0}]}
    write_glb(path, doc, binary)
    m = AssetCost(path).measure()
    verify('shared accessor and repeated node counts stay distinct', m['metrics']['uniquePositionVertices'] == 3
           and m['metrics']['primitiveVertices'] == 6 and m['metrics']['triangles'] == 2
           and m['metrics']['nodeTriangles'] == 4)
    verify('one source image and two texture objects stay distinct', m['uniqueImagePayloads'] == 1
           and m['uniqueImageRgba8MipBytes'] == 44 and m['metrics']['rgba8MipBytes'] == 88
           and m['metrics']['externalImageBytes'] == len(image.getvalue()))
    skinned = copy.deepcopy(doc)
    skinned['bufferViews'] += [{'buffer': 0, 'byteOffset': 36, 'byteLength': 12},
                              {'buffer': 0, 'byteOffset': 48, 'byteLength': 48}]
    skinned['accessors'] += [{'bufferView': 1, 'componentType': 5121, 'type': 'VEC4', 'count': 3},
                             {'bufferView': 2, 'componentType': 5126, 'type': 'VEC4', 'count': 3}]
    skinned['nodes'] = [{'mesh': 0, 'skin': 0}, {'name': 'joint'}]
    skinned['skins'] = [{'joints': [1]}]
    for primitive in skinned['meshes'][0]['primitives']:
        primitive['attributes'].update({'JOINTS_0': 1, 'WEIGHTS_0': 2})
    skin_binary = binary+bytes(12)+struct.pack('<12f', *([1, 0, 0, 0]*3))
    skinned['buffers'][0]['byteLength'] = len(skin_binary)
    write_glb(path, skinned, skin_binary)
    verify('actual joint and weight accounting', AssetCost(path).measure()['metrics']['maxInfluences'] == 1)
    broken_joint = skin_binary[:36]+bytes([2])+skin_binary[37:]
    write_glb(path, skinned, broken_joint)
    rejects('joint index must fit referenced skin', lambda: AssetCost(path).measure(), 'joint index outside skin')
    write_glb(path, skinned, skin_binary[:48]+bytes(48))
    rejects('zero sum weights rejected', lambda: AssetCost(path).measure(), 'invalid weights')
    missing_buffer = copy.deepcopy(doc)
    missing_buffer['buffers'][0]['uri'] = 'missing.bin'
    write_glb(path, missing_buffer, binary)
    rejects('external geometry buffer rejected explicitly', lambda: AssetCost(path), 'External GLB buffers')
    for uri, expected in [('missing.png', 'missing.png'), ('../image.png', 'Unsafe path'),
                          ('%2e%2e/image.png', 'Unsafe path'), ('https://host/image.png', 'relative image'),
                          ('image.png?x=1', 'relative image'), ('/image.png', 'relative image')]:
        bad = copy.deepcopy(doc)
        bad['images'][0]['uri'] = uri
        write_glb(path, bad, binary)
        rejects('dependency rejects '+uri, lambda: AssetCost(path).measure(), expected)
    bad = copy.deepcopy(doc)
    bad['accessors'][0]['count'] = 4
    write_glb(path, bad, binary)
    rejects('accessor cannot spill outside bufferView', lambda: AssetCost(path), 'exceeds bufferView')
    bad['accessors'][0]['count'] = -1
    write_glb(path, bad, binary)
    rejects('negative count rejected', lambda: AssetCost(path), '.count')
    write_glb(path, doc, struct.pack('<9f', float('nan'), *([0]*8)))
    rejects('nonfinite geometry rejected', lambda: AssetCost(path), 'nonfinite')
    path.write_bytes(b'glTF')
    rejects('bad GLB rejected', lambda: AssetCost(path), 'expected JSON')
    write_glb(path, doc, binary)
    (folder/'image.png').write_bytes(b'bad png')
    rejects('corrupt image rejected', lambda: AssetCost(path).measure(), 'images[0]')
    bad_config = copy.deepcopy(config)
    bad_config['classes']['body']['fileBytes'] = True
    config_path = folder/'budget.json'
    config_path.write_text(json.dumps(bad_config), encoding='utf-8')
    rejects('boolean budget rejected', lambda: budget_config(config_path, config['version']), 'fileBytes')
    rejects('wrong budget version rejected', lambda: budget_config(ROOT/'scripts/production/asset-budgets-v1.json', 'unknown'), 'version')
    bad_config['classes']['body'].pop('fileBytes')
    config_path.write_text(json.dumps(bad_config), encoding='utf-8')
    rejects('missing metric rejected', lambda: budget_config(config_path, config['version']), 'missing/unknown')
    cli = [sys.executable, str(ROOT/'scripts/production/asset_budget.py'), 'check',
           'prototype/public/assets/m1b/m1b-uniform-shorts-v1.glb', '--class', 'garment',
           '--budget-version', config['version']]
    process = subprocess.run(cli, cwd=ROOT, capture_output=True, text=True, check=False)
    verify('normal CLI structured success', process.returncode == 0 and json.loads(process.stdout)['status'] == 'admitted')
    process = subprocess.run(cli[:3]+['missing.glb']+cli[4:], cwd=ROOT, capture_output=True, text=True, check=False)
    verify('missing asset CLI structured invalid exit 2', process.returncode == 2 and json.loads(process.stdout)['status'] == 'invalid')
    cli[3] = 'prototype/public/assets/foundation/base-female-roundtrip.vrm'
    cli[5] = 'body'
    process = subprocess.run(cli, cwd=ROOT, capture_output=True, text=True, check=False)
    verify('legacy over-budget CLI structured rejection exit 1', process.returncode == 1
           and json.loads(process.stdout)['violations'][0]['metric'] == 'rgba8MipBytes')
print(json.dumps({'passed': len(passed), 'checks': passed, 'GPUUsed': False}, indent=2))
