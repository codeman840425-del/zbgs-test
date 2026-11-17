"""Independent binary/reference audit of the sealed Body-image derivative."""
from pathlib import Path
import copy
import hashlib
import io
import json
import struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
PKG = ROOT / 'assets-source/native-vroid-unmasked-base-v1'
sha = lambda data: hashlib.sha256(data).hexdigest()


def load(path):
    raw = path.read_bytes()
    assert struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw))
    n, kind = struct.unpack_from('<I4s', raw, 12)
    assert kind == b'JSON'
    size, kind = struct.unpack_from('<I4s', raw, 20 + n)
    assert kind == b'BIN\0' and len(raw) == 28 + n + size
    return json.loads(raw[20:20 + n]), raw[28 + n:], raw


def view(doc, binary, index):
    row = doc['bufferViews'][index]
    assert row['buffer'] == 0
    offset = row.get('byteOffset', 0)
    data = binary[offset:offset + row['byteLength']]
    assert len(data) == row['byteLength']
    return data


def accessor(doc, binary, index):
    a = doc['accessors'][index]
    assert 'sparse' not in a
    width = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[a['componentType']]
    width *= {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    payload = view(doc, binary, a['bufferView'])
    offset = a.get('byteOffset', 0)
    stride = doc['bufferViews'][a['bufferView']].get('byteStride', width)
    rows = [payload[offset + i * stride:offset + i * stride + width] for i in range(a['count'])]
    assert all(len(row) == width for row in rows)
    return b''.join(rows)


def main():
    manifest = json.loads((PKG / 'package-files.json').read_bytes())
    for row in manifest['files']:
        data = Path(row['path']).read_bytes()
        assert sha(data) == row['sha256'] and len(data) == row['bytes']
    source_path = ROOT / 'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm'
    donor_path = ROOT / 'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/female-tops-removed.vrm'
    candidate_path = PKG / 'generated/female-native-unmasked-130-v1.vrm'
    source, old, source_raw = load(source_path)
    donor, donor_bin, donor_raw = load(donor_path)
    candidate, new, candidate_raw = load(candidate_path)
    assert sha(source_raw) == '78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3'
    assert sha(donor_raw) == '188d6e2b423d5baeae11e5dffbed88b8508edaed08eda6d8177cf07ee330bcec'
    assert sha(candidate_raw) == '843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef'
    image = 11
    new_view = len(source['bufferViews'])
    assert len(candidate['bufferViews']) == new_view + 1
    restored = copy.deepcopy(candidate)
    appended = restored['bufferViews'].pop()
    restored['images'][image]['bufferView'] = source['images'][image]['bufferView']
    restored['buffers'][0]['byteLength'] = source['buffers'][0]['byteLength']
    assert restored == source and new[:len(old)] == old
    assert appended['byteOffset'] >= len(old)
    accessor_rows = []
    for i in range(len(source['accessors'])):
        a, b = accessor(source, old, i), accessor(candidate, new, i)
        assert a == b
        accessor_rows.append({'index': i, 'sha256': sha(a), 'bytes': len(a)})
    for i in range(len(source['bufferViews'])):
        assert view(source, old, i) == view(candidate, new, i)
    texture_ids = [i for i, row in enumerate(source['textures']) if row.get('source') == image]
    assert texture_ids == [11] and all(not row.get('extensions') for row in source['textures'])
    refs = []
    def visit(value, path):
        if isinstance(value, list):
            for i, child in enumerate(value):
                visit(child, path + [i])
        elif isinstance(value, dict):
            for key, child in value.items():
                if 'texture' in key.lower() and isinstance(child, dict) and child.get('index') in texture_ids:
                    refs.append(path + [key])
                visit(child, path + [key])
    visit(source, [])
    assert refs == [['materials', 8, 'pbrMetallicRoughness', 'baseColorTexture'],
                    ['materials', 8, 'extensions', 'VRMC_materials_mtoon', 'shadeMultiplyTexture']]
    consumers = [(mi, pi) for mi, m in enumerate(source['meshes']) for pi, p in enumerate(m['primitives']) if p['material'] == 8]
    assert consumers == [(1, 0)] and source['extensions']['VRMC_vrm']['meta']['thumbnailImage'] != image
    old_png = view(source, old, source['images'][image]['bufferView'])
    new_png = view(candidate, new, candidate['images'][image]['bufferView'])
    donor_material = next(row for row in donor['materials'] if '_Body_' in row['name'] and '_SKIN' in row['name'])
    donor_texture = donor_material['pbrMetallicRoughness']['baseColorTexture']['index']
    donor_image = donor['textures'][donor_texture]['source']
    donor_png = view(donor, donor_bin, donor['images'][donor_image]['bufferView'])
    assert new_png == donor_png == (PKG / 'generated/native-restored-body.png').read_bytes()
    a, b = [Image.open(io.BytesIO(raw)).convert('RGBA') for raw in [old_png, new_png]]
    assert a.size == b.size == (2048, 2048)
    assert a.convert('RGB').tobytes() == b.convert('RGB').tobytes()
    old_alpha, new_alpha = a.getchannel('A').tobytes(), b.getchannel('A').tobytes()
    assert set(new_alpha) == {255}
    for i, row in enumerate(source['images']):
        if i != image:
            assert view(source, old, row['bufferView']) == view(candidate, new, candidate['images'][i]['bufferView'])
    result = {'schema': 'native-unmasked-independent-binary-audit-v1', 'status': 'current-artifact-preservation-verified',
        'candidateSha256': sha(candidate_raw), 'dualVrmPinsCorrect': True, 'packageEntriesChecked': len(manifest['files']),
        'onlyJsonChanges': ['images[11].bufferView', 'bufferViews append one', 'buffers[0].byteLength'],
        'oldBinPrefixExactBytes': len(old), 'originalViewsExact': new_view, 'accessors': accessor_rows,
        'imageConsumers': refs, 'materialConsumers': consumers, 'nativePngSha256': sha(new_png),
        'rgbPixelBytesEqual': True, 'newAlphaAll255': True,
        'changedAlphaTexels': sum(x != y for x, y in zip(old_alpha, new_alpha)),
        'allNonTargetJsonAndImageBytesExact': True,
        'preFixSourceProvenanceGap': 'build records current editable .vroid hashes without enforcing expected311a/76955 identities',
        'limits': ['No merged editable .vroid exists or is claimed', 'Saved source native export byte determinism not replayed here',
                   'No wardrobe coverage, factory, expression manager, motion or GPU visual acceptance']}
    (OUT / 'binary-audit.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print('Independent146accessor/image/reference/prefix audit passed')


if __name__ == '__main__':
    main()
