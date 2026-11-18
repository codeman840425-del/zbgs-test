"""Compact a selected VRM0 garment with the original M1B joint, UV and material conversion."""

import copy
from dataclasses import dataclass
import hashlib
import json
import struct

import numpy as np

DTYPES = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}


@dataclass(frozen=True)
class GarmentSource:
    document: dict
    binary: bytes
    skin: dict
    inverse_binds: np.ndarray
    parents: dict
    humanoid: dict
    sha256: str
    provenance: dict
    limits: list


def emit(
    source,
    id,
    name,
    slot,
    parts,
    method,
    *,
    generator='zbgs M1B reproducible male equipment builder',
    preserve_base_sampler=False
):
    src, binary, skin, ibm = source.document, source.binary, source.skin, source.inverse_binds
    parents, human, provenance = source.parents, source.humanoid, source.provenance
    # parts = (attribute arrays, triangles, source material index OR custom material)
    used = sorted(
        {int(j) for a, t, m in parts for j, w in zip(a['JOINTS_0'].flat, a['WEIGHTS_0'].flat) if w > 1e-8}
    )
    remap = {j: i for i, j in enumerate(used)}
    needed = set(skin['joints'][j] for j in used)
    for i in list(needed):
        while i in parents:
            i = parents[i]
            needed.add(i)
    ids = {old: i + 1 for i, old in enumerate(sorted(needed))}
    nodes = [{'name': id, 'mesh': 0, 'skin': 0}]
    for old in sorted(needed):
        x = {
            k: v
            for k, v in src['nodes'][old].items()
            if k in ['name', 'translation', 'rotation', 'scale', 'matrix']
        }
        children = [ids[c] for c in src['nodes'][old].get('children', []) if c in needed]
        if children:
            x['children'] = children
        nodes.append(x)
    blob = bytearray()
    views = []
    accessors = []
    textures = []
    images = []
    materials = []
    primitives = []

    def append(data):
        blob.extend(b'\0' * ((-len(blob)) % 4))
        index = len(views)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)})
        blob.extend(data)
        return index

    def write(a, component, kind):
        a = np.asarray(a, dtype=DTYPES[component])
        vi = append(a.tobytes())
        item = {'bufferView': vi, 'componentType': component, 'count': len(a), 'type': kind}
        if kind == 'VEC3':
            item.update(min=a.min(0).tolist(), max=a.max(0).tolist())
        ai = len(accessors)
        accessors.append(item)
        return ai

    texture_cache = {}
    samplers = []

    def material(value):
        if isinstance(value, dict):
            return copy.deepcopy(value)
        original = src['materials'][value]
        # Standard glTF unlit preserves original clothing map without relying on VRM-only metadata.
        m = {
            k: copy.deepcopy(original[k])
            for k in ['name', 'alphaMode', 'alphaCutoff', 'doubleSided', 'pbrMetallicRoughness']
            if k in original
        }
        m['extensions'] = {'KHR_materials_unlit': {}}
        tex = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if tex:
            old = tex['index']
            if old not in texture_cache:
                source_tex = src['textures'][old]
                image = copy.deepcopy(src['images'][source_tex['source']])
                v = src['bufferViews'][image['bufferView']]
                image['bufferView'] = append(
                    binary[v.get('byteOffset', 0) : v.get('byteOffset', 0) + v['byteLength']]
                )
                image.pop('uri', None)
                ti = len(textures)
                texture_cache[old] = ti
                textures.append({'source': len(images)})
                images.append(image)
                if preserve_base_sampler and 'sampler' in source_tex:
                    textures[-1]['sampler'] = len(samplers)
                    samplers.append(copy.deepcopy(src['samplers'][source_tex['sampler']]))
            tex['index'] = texture_cache[old]
        return m

    multi = 0
    total = 0
    triangles = 0
    for attributes, t, m in parts:
        a = {k: v.copy() for k, v in attributes.items()}
        w = a['WEIGHTS_0']
        w /= w.sum(1, keepdims=True)
        a['JOINTS_0'] = np.array(
            [
                [remap[int(j)] if weight > 1e-8 else 0 for j, weight in zip(js, ws)]
                for js, ws in zip(a['JOINTS_0'], w)
            ],
            dtype=np.uint16,
        )
        attrs = {
            k: write(
                v,
                5123 if k == 'JOINTS_0' else 5126,
                'VEC2' if k == 'TEXCOORD_0' else 'VEC4' if k in ['JOINTS_0', 'WEIGHTS_0'] else 'VEC3',
            )
            for k, v in a.items()
        }
        primitives.append(
            {
                'attributes': attrs,
                'indices': write(t.reshape(-1, 1), 5125, 'SCALAR'),
                'material': len(materials),
            }
        )
        materials.append(material(m))
        total += len(w)
        triangles += len(t)
        multi += int(np.count_nonzero(np.count_nonzero(w > 0.001, axis=1) > 1))
    inverse = write(ibm[used], 5126, 'MAT4')
    bindings = [
        {
            'sourceBone': src['nodes'][skin['joints'][j]]['name'],
            'targetRawBone': src['nodes'][skin['joints'][j]]['name'],
            'humanoidSemantic': human.get(skin['joints'][j]),
            'inverseBindMatrix': ibm[j].tolist(),
        }
        for j in used
    ]
    doc = {
        'asset': {'version': '2.0', 'generator': generator},
        'scene': 0,
        'scenes': [{'nodes': [0] + [ids[i] for i in sorted(needed) if parents.get(i) not in needed]}],
        'nodes': nodes,
        'skins': [{'joints': [ids[skin['joints'][j]] for j in used], 'inverseBindMatrices': inverse}],
        'meshes': [{'name': id, 'primitives': primitives}],
        'materials': materials,
        'buffers': [{'byteLength': len(blob)}],
        'bufferViews': views,
        'accessors': accessors,
        'extensionsUsed': ['KHR_materials_unlit'],
        'extras': {'sourceSha256': source.sha256, 'sourceProvenance': provenance, 'method': method},
    }
    if images:
        doc.update(images=images, textures=textures)
    if samplers:
        doc['samplers'] = samplers
    jb = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode()
    jb += b' ' * ((-len(jb)) % 4)
    blob += b'\0' * ((-len(blob)) % 4)
    output = (
        struct.pack('<4sII', b'glTF', 2, 28 + len(jb) + len(blob))
        + struct.pack('<I4s', len(jb), b'JSON')
        + jb
        + struct.pack('<I4s', len(blob), b'BIN\0')
        + blob
    )
    return output, {
        'id': id,
        'name': name,
        'slot': slot,
        'url': id + '.glb',
        'sha256': hashlib.sha256(output).hexdigest(),
        'bytes': len(output),
        'compatibleAvatarSha256': source.sha256,
        'preserveOriginalBody': True,
        'requiresRawSkeleton': True,
        'bindings': bindings,
        'limits': source.limits,
        'sourceLicense': provenance,
        'method': method,
        'stats': {'vertices': total, 'triangles': triangles, 'multiBoneVertices': multi, 'joints': len(used)},
    }
