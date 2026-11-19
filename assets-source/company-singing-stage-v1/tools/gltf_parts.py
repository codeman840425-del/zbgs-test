"""Read the fixed, indexed static primitives in the two Grab3D GLBs."""
import json
from pathlib import Path
import struct
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components


def read(path):
    data = Path(path).read_bytes()
    magic, version, length, size, tag = struct.unpack_from('<5I', data)
    assert (magic, version, length, tag) == (0x46546C67, 2, len(data), 0x4E4F534A)
    offset = 20 + size
    size_bin, type_bin = struct.unpack_from('<2I', data, offset)
    assert (size_bin, type_bin) == (len(data) - offset - 8, 0x004E4942)
    return json.loads(data[20:offset]), data[offset + 8:]


def arr(gltf, binary, index):
    accessor = gltf['accessors'][index]
    view = gltf['bufferViews'][accessor['bufferView']]
    dtype = np.dtype({5123: '<u2', 5125: '<u4', 5126: '<f4', 5121: 'u1'}[accessor['componentType']])
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    return np.ndarray((accessor['count'], width), dtype=dtype, buffer=binary, offset=offset,
                      strides=(view.get('byteStride', dtype.itemsize * width), dtype.itemsize))


def components(gltf, binary, node):
    primitive, = gltf['meshes'][node['mesh']]['primitives']
    coords = arr(gltf, binary, primitive['attributes']['POSITION']).astype(float) + node['translation']
    indices = arr(gltf, binary, primitive['indices']).reshape(-1, 3)
    # Component IDs are derived from coordinates at 10µm precision, so UV seams share topology.
    welded, remap = np.unique(np.round(coords, 5), axis=0, return_inverse=True)
    triples = remap[indices]
    ends = (triples.ravel(), np.roll(triples, 1, axis=1).ravel())
    graph = coo_matrix((np.ones(triples.size), ends), shape=(len(welded), len(welded)))
    _, labels = connected_components(graph, directed=False)
    return coords, indices, labels[triples[:, 0]]
