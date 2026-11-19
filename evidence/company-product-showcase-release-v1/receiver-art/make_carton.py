"""Produce the editable Sunfield oat carton. Needs only Python 3 stdlib."""

import argparse
from hashlib import sha256
import json
from math import sqrt
from pathlib import Path
import struct
import zlib


TITLE = "SUNFIELD"
PRODUCT = "OAT"
FLAVOUR = "COCOA"
PALETTE = {
    "paper": (249, 230, 181), "gold": (236, 158, 70),
    "rust": (189, 83, 41), "field": (43, 100, 87),
    "ink": (23, 60, 56), "white": (255, 243, 207),
}
FONT = {
    "A": (14, 17, 17, 31, 17, 17, 17), "C": (14, 17, 16, 16, 16, 17, 14),
    "D": (30, 17, 17, 17, 17, 17, 30), "E": (31, 16, 16, 30, 16, 16, 31),
    "F": (31, 16, 16, 30, 16, 16, 16), "I": (31, 4, 4, 4, 4, 4, 31),
    "L": (16, 16, 16, 16, 16, 16, 31), "N": (17, 25, 25, 21, 19, 19, 17),
    "O": (14, 17, 17, 17, 17, 17, 14), "S": (15, 16, 16, 14, 1, 1, 30),
    "T": (31, 4, 4, 4, 4, 4, 4), "U": (17, 17, 17, 17, 17, 17, 14),
}
# Sections are (height, half width, half depth, vertical corner chamfer, Z centre).
# The last section folds into a shallow sloping, deliberately offset gable.
SECTIONS = [
    (0.000, .061, .042, .0080, 0),
    (.008, .064, .044, .0080, 0),
    (.168, .064, .044, .0080, 0),
    (.179, .063, .041, .0080, 0),
    (.199, .054, .006, .0035, -.006),
]
SEAL = ((-.054, .198, -.011), (.054, .207, -.000))
ART_SIZE = (128, 192)
ASSET_SOURCE = 'assets-source/company-receiver-printed-carton'
LICENSE = (
    'Sunfield is a fictitious label created for this company-platform handoff.\n'
    'This generated mesh, illustrated print and editable Python source were created '
    'for this project by Company scene art trial. Permission is granted to use, '
    'modify, reproduce and redistribute all three with the company platform or independently.\n'
    'No third-party image, brand mark, font or artwork is required.\n'
)


def png_chunk(kind, body):
    return (struct.pack('>I', len(body)) + kind + body
            + struct.pack('>I', zlib.crc32(kind + body)))


def make_label():
    width, height = ART_SIZE
    pixels = bytearray(PALETTE['paper'] * (width * height))

    def paint(x, y, colour):
        if 0 <= x < width and 0 <= y < height:
            i = (y * width + x) * 3
            pixels[i:i + 3] = bytes(PALETTE[colour])

    def rect(x0, y0, x1, y1, colour):
        for y in range(y0, y1):
            for x in range(x0, x1):
                paint(x, y, colour)

    def circle(cx, cy, radius, colour):
        for y in range(cy - radius, cy + radius + 1):
            for x in range(cx - radius, cx + radius + 1):
                if (x - cx)**2 + (y - cy)**2 <= radius**2:
                    paint(x, y, colour)

    def polygon(points, colour):
        for y in range(height):
            crossings = []
            for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
                if min(y1, y2) <= y + .5 < max(y1, y2):
                    crossings.append(x1 + (x2 - x1) * (y + .5 - y1) / (y2 - y1))
            crossings.sort()
            for start, stop in zip(crossings[::2], crossings[1::2]):
                for x in range(max(0, int(start)), min(width, int(stop) + 1)):
                    paint(x, y, colour)

    def word(text, y, unit, colour):
        length = (len(text) * 6 - 1) * unit
        x0 = (width - length) // 2
        for glyph, letter in enumerate(text):
            for row, mask in enumerate(FONT[letter]):
                for col in range(5):
                    if mask & (1 << (4 - col)):
                        x = x0 + (glyph * 6 + col) * unit
                        rect(x, y + row * unit, x + unit, y + (row + 1) * unit, colour)

    rect(0, 0, 5, height, 'rust')
    rect(width - 5, 0, width, height, 'rust')
    rect(0, 0, width, 7, 'ink')
    word(TITLE, 16, 2, 'ink')
    circle(64, 67, 26, 'gold')
    polygon([(5, 85), (39, 66), (64, 80), (92, 59), (123, 78), (123, 106), (5, 106)], 'field')
    polygon([(5, 99), (33, 84), (54, 94), (81, 81), (123, 92), (123, height), (5, height)], 'ink')
    rect(22, 104, 106, 106, 'gold')
    word(PRODUCT, 113, 5, 'white')
    rect(0, 159, width, height, 'rust')
    word(FLAVOUR, 167, 3, 'white')
    stride = width * 3
    raw = b''.join(b'\0' + pixels[y * stride:(y + 1) * stride] for y in range(height))
    return (b'\x89PNG\r\n\x1a\n'
            + png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + png_chunk(b'IDAT', zlib.compress(raw, 9)) + png_chunk(b'IEND', b''))


def ring(section):
    y, x, z, cut, shift = section
    pairs = [(-x + cut, z), (x - cut, z), (x, z - cut), (x, -z + cut),
             (x - cut, -z), (-x + cut, -z), (-x, -z + cut), (-x, z - cut)]
    return [(a, y, b + shift) for a, b in pairs]


def outward(a, b, c):
    u = [q - p for p, q in zip(a, b)]
    v = [q - p for p, q in zip(a, c)]
    n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    length = sqrt(sum(p**2 for p in n))
    return tuple(p / length for p in n)


def quad(a, b, c, d):
    return [(a, b, c), (a, c, d)]


def shell(sections, printed_segment=None):
    rings = [ring(section) for section in sections]
    body, print_face = [], []
    for level, (base, top) in enumerate(zip(rings, rings[1:])):
        for index in range(8):
            other = (index + 1) % 8
            target = print_face if (level, index) == printed_segment else body
            target.extend(quad(base[index], base[other], top[other], top[index]))
    bottom, top = rings[0], rings[-1]
    bc = (0, sections[0][0], sections[0][4])
    tc = (0, sections[-1][0], sections[-1][4])
    for side in range(8):
        other = (side + 1) % 8
        body += [(bc, bottom[other], bottom[side]), (tc, top[side], top[other])]
    return body, print_face


def make_glb():
    body, art = shell(SECTIONS, (1, 0))
    low, high = SEAL
    seal_center = (low[2] + high[2]) / 2
    seal = shell([(y, high[0], (high[2] - low[2]) / 2, .001, seal_center) for y in (low[1], high[1])])[0]
    blob = bytearray()
    gltf = {
        'asset': {'version': '2.0', 'copyright': 'Company scene art trial · Project-authorized original'},
        'scene': 0, 'scenes': [{'nodes': [0, 1, 2]}], 'nodes': [], 'meshes': [], 'accessors': [], 'bufferViews': [],
        'materials': [
            {'name': 'folded-board', 'pbrMetallicRoughness': {'baseColorFactor': [.79, .51, .30, 1], 'metallicFactor': 0, 'roughnessFactor': .90}},
            {'name': 'printed-face', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': .88}},
            {'name': 'sealed-fold', 'pbrMetallicRoughness': {'baseColorFactor': [.13, .32, .25, 1], 'metallicFactor': 0, 'roughnessFactor': .88}},
        ],
        'images': [{'uri': 'art/carton-label.png'}],
        'textures': [{'source': 0, 'sampler': 0}],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
    }

    def accessor(values, kind, range_info=False):
        offset = len(blob)
        for value in values:
            blob.extend(struct.pack('<' + 'f' * len(value), *value))
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(blob) - offset, 'target': 34962})
        source = {'bufferView': view, 'componentType': 5126, 'count': len(values), 'type': kind}
        if range_info:
            source.update(min=[min(v[i] for v in values) for i in range(3)], max=[max(v[i] for v in values) for i in range(3)])
        gltf['accessors'].append(source)
        return len(gltf['accessors']) - 1

    for material, (name, triangles) in enumerate([('carton-board', body), ('carton-print', art), ('carton-seal', seal)]):
        positions = [p for triangle in triangles for p in triangle]
        normals = [outward(*triangle) for triangle in triangles for _ in triangle]
        attributes = {'POSITION': accessor(positions, 'VEC3', True), 'NORMAL': accessor(normals, 'VEC3')}
        if material == 1:
            left, right = min(p[0] for p in positions), max(p[0] for p in positions)
            bottom, top = min(p[1] for p in positions), max(p[1] for p in positions)
            uv = [((p[0] - left) / (right - left), (top - p[1]) / (top - bottom)) for p in positions]
            attributes['TEXCOORD_0'] = accessor(uv, 'VEC2')
        gltf['meshes'].append({'name': name, 'primitives': [{'attributes': attributes, 'material': material}]})
        gltf['nodes'].append({'name': name, 'mesh': material})
    gltf['buffers'] = [{'byteLength': len(blob)}]
    metadata = json.dumps(gltf, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    metadata += b' ' * (-len(metadata) % 4)
    return (struct.pack('<IIIII', 0x46546C67, 2, 28 + len(metadata) + len(blob), len(metadata), 0x4E4F534A)
            + metadata + struct.pack('<II', len(blob), 0x004E4942) + blob)


def recipe_for(mesh, label, permission, author_script):
    def pin(name, data):
        return {'path': ASSET_SOURCE + '/' + name, 'sha256': sha256(data).hexdigest()}
    return {
        'schema': 'company-showcase-product-collection', 'version': 1,
        'sources': {'printed-oat': {
            **pin('carton.glb', mesh), 'author': 'Company scene art trial', 'license': 'Project-authorized-original',
            'licensePath': pin('License.txt', permission)['path'], 'licenseSha256': sha256(permission).hexdigest(),
            'editable': pin('make_carton.py', author_script), 'textures': {'art/carton-label.png': pin('carton-label.png', label)},
        }},
        'designs': [{'id': 'showcase-product-printed-carton', 'version': 1, 'displayName': '带货货样 · 日野可可燕麦纸盒',
                     'source': 'printed-oat', 'metresPerUnit': 1, 'yawQuarterTurns': 0}],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    mesh, label, permission = make_glb(), make_label(), LICENSE.encode('utf-8')
    source = Path(__file__).read_bytes()
    draft = recipe_for(mesh, label, permission, source)
    files = {'carton.glb': mesh, 'carton-label.png': label, 'License.txt': permission,
             'recipe.json': (json.dumps(draft, ensure_ascii=False, indent=2) + '\n').encode('utf-8')}
    for filename, data in files.items():
        target = output / filename
        if target.exists():
            if target.read_bytes() != data:
                raise FileExistsError(f'Different existing art file: {target}')
        else:
            with target.open('xb') as file:
                file.write(data)
    print(json.dumps({'generated': {name: sha256(data).hexdigest() for name, data in files.items()},
                      'authorScript': sha256(source).hexdigest()}))


if __name__ == '__main__':
    main()
