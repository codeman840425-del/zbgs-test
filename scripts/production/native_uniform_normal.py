"""Generate the exact native VRM uniform-normal loader pin without editing the VRM."""

import argparse
import base64
from collections import defaultdict
import io
import json
from pathlib import Path
import re
import struct
import zlib

from PIL import Image

from native_import import ROOT, digest, embedded_glb


OUTPUT = ROOT / 'prototype/src/native-uniform-normal-pins.json'
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
REVIEWED_EXTENSIONS = {'VRMC_vrm', 'VRMC_springBone', 'VRMC_materials_mtoon',
                       'KHR_materials_unlit', 'KHR_texture_transform'}


def entries(tree, path=()):
    if isinstance(tree, list):
        for index, value in enumerate(tree):
            yield from entries(value, path + (index,))
    elif isinstance(tree, dict):
        for key, value in tree.items():
            child = path + (key,)
            yield child, value
            yield from entries(value, child)


def usages(doc):
    textures, views = defaultdict(list), defaultdict(list)
    if (set(doc.get('extensionsUsed', [])) | set(doc.get('extensionsRequired', []))) - REVIEWED_EXTENSIONS:
        raise ValueError('Unreviewed glTF extension')
    for path, value in entries(doc):
        key = path[-1]
        if key == 'extensions' and set(value) - REVIEWED_EXTENSIONS:
            raise ValueError(f'Unreviewed glTF extension at {path}')
        if key == 'bufferView':
            if type(value) is not int:
                raise ValueError(f'Invalid bufferView reference at {path}')
            views[value].append(path)
        if isinstance(key, str) and key.endswith('Texture') and isinstance(value, dict) and 'index' in value:
            index = value['index']
            if type(index) is not int:
                raise ValueError(f'Invalid texture reference at {path}')
            textures[index].append(path)
    return textures, views


def read_normal_png(png):
    if not png.startswith(PNG_SIGNATURE):
        raise ValueError('Invalid PNG signature')
    offset = len(PNG_SIGNATURE)
    kinds = []
    while offset < len(png):
        if offset + 12 > len(png):
            raise ValueError('Truncated PNG chunk')
        length, kind = struct.unpack_from('>I4s', png, offset)
        end = offset + 12 + length
        if end > len(png):
            raise ValueError('Truncated PNG payload')
        content = png[offset + 8:end - 4]
        if zlib.crc32(kind + content) != struct.unpack_from('>I', png, end - 4)[0]:
            raise ValueError('PNG CRC mismatch')
        if kind not in (b'IHDR', b'IDAT', b'IEND'):
            return None
        kinds.append(kind)
        offset = end
    if len(kinds) < 3 or kinds[0] != b'IHDR' or kinds[-1] != b'IEND' or set(kinds[1:-1]) != {b'IDAT'}:
        raise ValueError('Unexpected PNG chunk order')
    width, height, depth, color_type, compression, filtering, interlace = struct.unpack_from('>IIBBBBB', png, 16)
    if struct.unpack_from('>I', png, 8)[0] != 13 or struct.unpack_from('>I', png, len(png) - 12)[0] != 0:
        raise ValueError('Invalid IHDR/IEND length')
    if min(width, height) < 256 or depth != 8 or color_type not in (2, 6) or (compression, filtering, interlace) != (0, 0, 0):
        return None
    with Image.open(io.BytesIO(png)) as image:
        if image.size != (width, height) or image.format != 'PNG' or image.mode not in ('RGB', 'RGBA') or image.is_animated:
            return None
        extrema = image.convert('RGBA').getextrema()
    if extrema[3] != (255, 255) or any(low != high for low, high in extrema):
        return None
    return width, height, [low for low, _ in extrema]


def encode_pixel(rgba):
    def chunk(kind, value):
        return struct.pack('>I', len(value)) + kind + value + struct.pack('>I', zlib.crc32(kind + value))

    png = PNG_SIGNATURE + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes([0, *rgba]), level=0)) + chunk(b'IEND', b'')
    with Image.open(io.BytesIO(png)) as image:
        if image.size != (1, 1) or list(image.getpixel((0, 0))) != rgba:
            raise ValueError('Generated PNG has different pixels')
    return base64.b64encode(png).decode('ascii')


def pins_for_body(raw, sha256):
    if not re.fullmatch('[0-9a-f]{64}', sha256) or digest(raw) != sha256:
        raise ValueError('VRM SHA256 mismatch')
    doc, binary = embedded_glb(raw)
    textures = doc.get('textures', [])
    images = doc.get('images', [])
    views = doc.get('bufferViews', [])
    buffers = doc.get('buffers', [])
    if doc.get('asset', {}).get('version') != '2.0' or len(buffers) != 1 or 'uri' in buffers[0]:
        raise ValueError('Expected one embedded glTF 2.0 buffer')
    if not 0 <= len(binary) - buffers[0]['byteLength'] <= 3:
        raise ValueError('GLB buffer length mismatch')
    if any('extensions' in texture or type(texture.get('source')) is not int or not 0 <= texture['source'] < len(images)
           for texture in textures):
        raise ValueError('Expected direct glTF texture sources')
    texture_use, view_use = usages(doc)
    if any(not 0 <= index < len(textures) for index in texture_use) or any(not 0 <= index < len(views) for index in view_use):
        raise ValueError('Out of bounds glTF texture or bufferView reference')
    thumbnail = doc.get('extensions', {}).get('VRMC_vrm', {}).get('meta', {}).get('thumbnailImage')
    candidates = []
    for material, definition in enumerate(doc.get('materials', [])):
        if 'normalTexture' not in definition:
            continue
        texture = definition['normalTexture']['index']
        if texture_use[texture] != [('materials', material, 'normalTexture')]:
            continue
        image = textures[texture]['source']
        if image == thumbnail or sum(row['source'] == image for row in textures) != 1:
            continue
        entry = images[image]
        if entry.get('mimeType') != 'image/png' or 'uri' in entry or 'extensions' in entry or 'bufferView' not in entry:
            continue
        index = entry['bufferView']
        if view_use[index] != [('images', image, 'bufferView')]:
            continue
        view = views[index]
        if set(view) - {'buffer', 'byteOffset', 'byteLength', 'name'} or view['buffer'] != 0:
            raise ValueError('Expected a plain embedded image bufferView')
        start = view.get('byteOffset', 0)
        end = start + view['byteLength']
        if not 0 <= start < end <= buffers[0]['byteLength']:
            raise ValueError('Invalid image byte range')
        if any(other_index != index and other['buffer'] == 0 and
               max(start, other.get('byteOffset', 0)) < min(end, other.get('byteOffset', 0) + other['byteLength'])
               for other_index, other in enumerate(views)):
            raise ValueError('Image byte range overlaps another bufferView')
        png = binary[start:end]
        uniform = read_normal_png(png)
        if uniform is None:
            continue
        width, height, rgba = uniform
        candidates.append({
            'material': material, 'texture': texture, 'image': image, 'bufferView': index,
            'sourcePngSha256': digest(png), 'width': width, 'height': height,
            'rgba': rgba, 'png1x1Base64': encode_pixel(rgba),
        })
    if len(candidates) != 1 or (candidates[0]['width'], candidates[0]['height']) != (1024, 1024):
        raise ValueError('Expected exactly the single reviewed 1024×1024 uniform native normal')
    return {'schema': 'native-uniform-normal-pins-v1', 'avatars': {sha256: candidates}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vrm', type=Path, required=True)
    parser.add_argument('--sha256', required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--write-new', action='store_true')
    args = parser.parse_args()
    report = pins_for_body(args.vrm.read_bytes(), args.sha256)
    raw = (json.dumps(report, indent=2) + '\n').encode('utf-8')
    if args.check:
        if raw != OUTPUT.read_bytes():
            raise SystemExit('Uniform normal pins differ from the VRM source')
    else:
        with OUTPUT.open('xb') as output:
            output.write(raw)
    print(f'{OUTPUT.relative_to(ROOT)} {digest(raw)}')


if __name__ == '__main__':
    main()
