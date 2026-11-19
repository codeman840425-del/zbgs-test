"""Derive the neutral, already fitted runtime masters from the two pinned Grab3D source pairs."""
import argparse
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import struct
import subprocess
import tempfile

import numpy as np
from gltf_parts import read, arr, components
from resize_maps import image_roles, shrink_jpeg

FAMILY = Path(__file__).resolve().parents[1]
FITTED_CLIP_WIDTH = .94


class Glb:
    def __init__(self, source):
        self.doc = {k: deepcopy(source[k]) for k in ('asset', 'materials', 'textures', 'samplers', 'images')}
        self.doc.update(nodes=[], meshes=[], bufferViews=[], accessors=[], scene=0, scenes=[{'nodes': [0]}])
        self.doc['asset']['generator'] = 'company-singing-stage-v1 / prepare_master.py'
        self.binary = bytearray()

    def view(self, payload, target=None):
        self.binary.extend(bytes(-len(self.binary) % 4))
        entry = {'buffer': 0, 'byteOffset': len(self.binary), 'byteLength': len(payload)}
        if target:
            entry['target'] = target
        self.doc['bufferViews'].append(entry)
        self.binary.extend(payload)
        return len(self.doc['bufferViews']) - 1

    def accessor(self, values, kind, component, target):
        values = np.ascontiguousarray(values)
        entry = {'bufferView': self.view(values.tobytes(), target), 'type': kind,
                 'componentType': component, 'count': len(values)}
        if kind == 'VEC3':
            entry.update(min=values.min(axis=0).tolist(), max=values.max(axis=0).tolist())
        self.doc['accessors'].append(entry)
        return len(self.doc['accessors']) - 1

    def node(self, entry, parent=None):
        index = len(self.doc['nodes'])
        self.doc['nodes'].append(entry)
        if parent is not None:
            parent['children'].append(index)
        return entry

    def encode(self):
        self.doc['buffers'] = [{'byteLength': len(self.binary)}]
        desc = json.dumps(self.doc, separators=(',', ':')).encode()
        desc += b' ' * (-len(desc) % 4)
        self.binary.extend(bytes(-len(self.binary) % 4))
        return (struct.pack('<5I', 0x46546C67, 2, 28+len(desc)+len(self.binary), len(desc), 0x4E4F534A)
                + desc + struct.pack('<II', len(self.binary), 0x004E4942) + self.binary)


def split_parts(slug, index, coords, tris, labels):
    if index == 0:
        return {'singing-tripod': np.ones(len(labels), dtype=bool)}
    if slug == 'microphone-stand':
        component_numbers = {'singing-mic-pickup': 1, 'singing-mic-collar': 4,
                             'singing-mic-handle': 5, 'singing-mic-clip': 2}
        pieces = {name: labels == number for name, number in component_numbers.items()}
        pieces['singing-boom'] = ~np.isin(labels, list(component_numbers.values()))
        return pieces
    # Two facing pages (4 and 53) and the original shallow extrusions making up their staff lines.
    staff = [c for c in np.unique(labels) if np.count_nonzero(labels == c) == 16
             and np.ptp(coords[tris[labels == c]][:, :, 0]) > .17]
    paper = np.isin(labels, [4, 53, *staff])
    return {'singing-score-pages': paper, 'singing-score-panel-and-slider': ~paper}


def make_master(source, native):
    slug = source['id']
    original = FAMILY / 'original' / (slug + '.glb')
    assert sha256(original.read_bytes()).hexdigest() == source['sha256'], original
    assert sha256(original.with_suffix('.blend').read_bytes()).hexdigest() == source['editable']['sha256']
    g, binary = read(original)
    glb = Glb(g)
    roles = image_roles(g)
    assert sorted(roles.values()) == sorted(['normal', 'srgb', 'linear'] * 2)
    for i, image in enumerate(glb.doc['images']):
        view = g['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        jpeg = binary[start:start+view['byteLength']]
        image['bufferView'] = glb.view(shrink_jpeg(jpeg, roles[i]))
    root = glb.node({'name': slug + '-assembly', 'children': [], 'extras': {'source': source['site'], 'license': 'CC0-1.0'}})
    groups = {}
    for i, node in enumerate(g['nodes'][:2]):
        name = node['name']
        coords, tris, labels = components(g, binary, node)
        vertices = native[name + '_pos']
        assert np.array_equal(tris, native[name + '_idx']), 'Editable topology or winding changed: ' + name
        assert np.max(abs(coords - vertices)) < 2e-7, 'Editable vertex geometry differs from exported original: ' + name
        origin = np.asarray(node['translation'])
        group = glb.node({'name': name, 'translation': origin.tolist(), 'children': []}, root)
        primitive, = g['meshes'][node['mesh']]['primitives']
        parts = split_parts(slug, i, coords, tris, labels)
        for part, mask in parts.items():
            used, indices = np.unique(tris[mask], return_inverse=True)
            attrs = {}
            for attr, access in primitive['attributes'].items():
                meta = g['accessors'][access]
                if attr == 'POSITION':
                    values = (vertices[used] - origin).astype('<f4')
                else:
                    values = arr(g, binary, access)[used]
                if part == 'singing-mic-clip' and attr == 'POSITION':
                    values[:, 0] *= FITTED_CLIP_WIDTH
                elif part == 'singing-mic-clip' and attr == 'NORMAL':
                    values[:, 0] /= FITTED_CLIP_WIDTH
                    values /= np.linalg.norm(values, axis=1)[:, None]
                attrs[attr] = glb.accessor(values, meta['type'], meta['componentType'], 34962)
            index = glb.accessor(indices.reshape(-1).astype('<u2'), 'SCALAR', 5123, 34963)
            glb.node({'name': part, 'mesh': len(glb.doc['meshes'])}, group)
            glb.doc['meshes'].append({'name': part, 'primitives': [{'attributes': attrs, 'indices': index, 'material': primitive['material']}]})
            groups[part] = np.count_nonzero(mask)
    expected = ([4672, 2112, 192, 192, 768, 2336] if slug == 'microphone-stand' else [1216, 1792, 1368])
    assert list(groups.values()) == expected
    assert sum(groups.values()) == source['triangles']
    return glb.encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--blender', default='blender', help='Blender executable (4.5.9 tested)')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--output', type=Path)
    args = parser.parse_args()
    sources = json.loads((FAMILY/'original/sources.json').read_text(encoding='utf-8-sig'))
    with tempfile.TemporaryDirectory(dir=args.output.parent if args.output else None) as tmp:
        npz = Path(tmp) / 'editable.npz'
        subprocess.run([args.blender, '-b', '--factory-startup', '--disable-autoexec', '-t', '1',
                        '--python-exit-code', '1', '--python', str(FAMILY/'tools/read_blend.py'),
                        '--', str(FAMILY/'original'), str(npz)], check=True)
        with np.load(npz) as native:
            results = {s['id']+'.glb': make_master(s, native) for s in sources}
    if args.check:
        for name, data in results.items():
            assert (FAMILY/'master'/name).read_bytes() == data, 'Master differs: ' + name
    else:
        args.output.mkdir(exist_ok=False)
        for name, data in results.items():
            (args.output/name).write_bytes(data)
    print(json.dumps({k: sha256(v).hexdigest() for k, v in results.items()}))


if __name__ == '__main__':
    main()
