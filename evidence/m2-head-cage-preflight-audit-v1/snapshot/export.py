"""Preserve the original GLB container contracts while baking modifier results."""
import copy
import json
import struct

import numpy as np


def normals(P, F, original):
    cross = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    result = np.zeros_like(P, dtype=float)
    for corner in range(3):
        np.add.at(result, F[:, corner], cross)
    length = np.linalg.norm(result, axis=1)
    result[length > 1e-12] /= length[length > 1e-12, None]
    result[length <= 1e-12] = original[length <= 1e-12]
    return result.astype('<f4')


def bake(g, results):
    doc = copy.deepcopy(g.doc)
    blob = bytearray(g.binary)
    def append(source, values):
        values = np.asarray(values, dtype='<f4')
        blob.extend(b'\0' * (-len(blob) % 4))
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': values.nbytes})
        blob.extend(values.tobytes())
        row = copy.deepcopy(doc['accessors'][source])
        row.update(bufferView=len(doc['bufferViews']) - 1, byteOffset=0, componentType=5126,
                   min=values.min(0).tolist(), max=values.max(0).tolist())
        doc['accessors'].append(row)
        return len(doc['accessors']) - 1
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            source = primitive['attributes']['POSITION']
            record = results[source]
            if 'positionAccessor' not in record:
                record['positionAccessor'] = append(source, record['positions'])
                record['normalAccessor'] = append(primitive['attributes']['NORMAL'], record['normals'])
                record['targets'] = []
                for target, endpoint, endpoint_normals in zip(primitive.get('targets', []), record['endpoints'], record['endpointNormals']):
                    item = copy.deepcopy(target)
                    item['POSITION'] = append(target['POSITION'], endpoint - record['positions'])
                    item['NORMAL'] = append(target.get('NORMAL', primitive['attributes']['NORMAL']), endpoint_normals - record['normals'])
                    record['targets'].append(item)
            primitive['attributes']['POSITION'] = record['positionAccessor']
            primitive['attributes']['NORMAL'] = record['normalAccessor']
            if record['targets']:
                primitive['targets'] = record['targets']
    doc['asset']['generator'] = 'm2-representative-head-cage-v1 exact v2 body plus official local MeshDeform'
    doc['buffers'][0]['byteLength'] = len(blob)
    text = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    blob.extend(b'\0' * (-len(blob) % 4))
    return struct.pack('<4sII', b'glTF', 2, 28 + len(text) + len(blob)) + struct.pack('<I4s', len(text), b'JSON') + text + struct.pack('<I4s', len(blob), b'BIN\0') + blob
