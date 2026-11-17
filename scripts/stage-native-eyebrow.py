"""Stage an independently authored brow palette, preserving source and target identity."""
import argparse, hashlib, json, os, struct, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets-source/native-vroid-hair-color-study-v1'
PINS = {
    'manifest.json': '62905d3336598164f31c6d3ed29443e9cf713562f47d08205e95145f26d8ae88',
    'cpu-readback/source-brow.png': '651a9bfb2eafc3c111ab511ce92e534cf2d807897214a06ea5fc6c4b4fb156c4',
    'cpu-readback/changed-brow.png': '73b4aea1a0c64921fc177eecd87e5d4ebb994f13508c064ef9b1f8c82b96dedb',
}
TARGET = '7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81'
MATERIAL = 'N00_000_00_FaceBrow_00_FACE (Instance)'
BASE = '/assets/native-eyebrow-palette-v1/'
digest = lambda data: hashlib.sha256(data).hexdigest()


def resources():
    data = {name: (SOURCE / name).read_bytes() for name in PINS}
    for name, value in data.items():
        if digest(value) != PINS[name]:
            raise ValueError('Source identity differs: ' + name)
    source = json.loads(data['manifest.json'])
    if not source['browExported'] or source['hairExported']:
        raise ValueError('This admission covers the brow-only export outcome')
    target = (ROOT / 'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm').read_bytes()
    if digest(target) != TARGET:
        raise ValueError('Target body differs')
    if struct.unpack_from('<III', target) != (0x46546c67, 2, len(target)):
        raise ValueError('Invalid GLB')
    chunks, offset = {}, 12
    while offset < len(target):
        size, kind = struct.unpack_from('<II', target, offset)
        chunks[kind] = target[offset + 8:offset + 8 + size]
        offset += 8 + size
    doc = json.loads(chunks[0x4e4f534a])
    material, = [m for m in doc['materials'] if m['name'] == MATERIAL]
    main = material['pbrMetallicRoughness']['baseColorTexture']
    if main.get('texCoord', 0) != 0 or material['alphaMode'] != 'BLEND':
        raise ValueError('Unexpected UV/alpha binding')
    if main['index'] != material['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture']['index']:
        raise ValueError('Independent shade source needs separate admission')
    texture = doc['textures'][main['index']]
    view = doc['bufferViews'][doc['images'][texture['source']]['bufferView']]
    start = view.get('byteOffset', 0)
    if chunks[0x004e4942][start:start + view['byteLength']] != data['cpu-readback/source-brow.png']:
        raise ValueError('Target original eyebrow bytes differ')
    for name in ('cpu-readback/source-brow.png', 'cpu-readback/changed-brow.png'):
        value = data[name]
        if value[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack_from('>II', value, 16) != (1024, 256):
            raise ValueError('Image dimensions differ')
    sampler = doc['samplers'][texture['sampler']]
    if sampler != {'magFilter': 9729, 'minFilter': 9729, 'wrapS': 10497, 'wrapT': 10497}:
        raise ValueError('Sampler differs')
    manifest = {
        'schema': 'native-facial-palette-v2', 'id': 'native-male-eyebrow-palette-v1', 'version': 1,
        'avatarSha256': TARGET, 'sourceManifestSha256': PINS['manifest.json'],
        'parts': {'eyebrowColor': {
            'materialName': MATERIAL, 'width': 1024, 'height': 256, 'texCoord': 0,
            'source': {'url': BASE + 'source-brow.png', 'sha256': PINS['cpu-readback/source-brow.png']},
            'colors': {'brown': {'color': '#3a241e', 'url': BASE + 'brow-brown.png', 'sha256': PINS['cpu-readback/changed-brow.png']}},
            'sampler': {**sampler, 'flipY': False, 'colorSpace': 'srgb'}, 'alphaMode': 'BLEND',
        }},
    }
    return {'manifest.json': (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode(),
            'source-brow.png': data['cpu-readback/source-brow.png'],
            'brow-brown.png': data['cpu-readback/changed-brow.png']}


def stage(destination):
    data = resources()
    for name, value in data.items():
        path = destination / name
        if path.exists() and path.read_bytes() != value:
            raise ValueError('Existing output differs: ' + str(path))
    destination.mkdir(parents=True, exist_ok=True)
    for name, value in data.items():
        path = destination / name
        if not path.exists():
            with tempfile.NamedTemporaryFile(dir=destination, delete=False) as handle:
                handle.write(value)
                temporary = Path(handle.name)
            try:
                try:
                    os.link(temporary, path)
                except FileExistsError:
                    if path.read_bytes() != value:
                        raise ValueError('Concurrent output differs: ' + str(path))
            finally:
                temporary.unlink()
        if path.read_bytes() != value:
            raise ValueError('Readback differs: ' + name)
    return {'target': TARGET, 'files': [{'name': n, 'sha256': digest(b), 'bytes': len(b)} for n, b in data.items()],
            'limit': 'Native exported eyebrow only; failed hair color is not admitted. Runtime/visual proof separate.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--destination', type=Path, default=ROOT / 'prototype/public/assets/native-eyebrow-palette-v1')
    print(json.dumps(stage(parser.parse_args().destination), ensure_ascii=False))
