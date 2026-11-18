"""Editable OBJ re-export retaining the pattern's native skin and indexed topology."""
import argparse
import json
from pathlib import Path

import numpy as np

import make


def write_obj(path, parts):
    text = ['# Native 7586 reference pose in metres, Y up; preserve vertex and triangle order for re-export.']
    offset = 1
    for side, (attrs, faces) in zip(['left','right'],parts):
        text.append('o ' + side)
        text.extend('v ' + ' '.join(format(float(v), '.9g') for v in xyz) for xyz in attrs['POSITION'])
        text.extend('f ' + ' '.join(str(int(i)+offset) for i in tri) for tri in faces)
        offset += len(attrs['POSITION'])
    path.write_bytes(('\n'.join(text)+'\n').encode('ascii'))


def read_obj(path):
    sides, positions, faces, prior = {}, [], [], 0
    name = None
    for line in path.read_text(encoding='ascii').splitlines() + ['o end']:
        if not line or line.startswith('#'):
            continue
        key, *args = line.split()
        if key == 'o':
            if name:
                sides[name] = (np.array(positions,dtype='<f4'),np.array(faces,int))
                prior += len(positions)
            name, positions, faces = args[0], [], []
        elif key == 'v' and len(args) == 3:
            positions.append(list(map(float,args)))
        elif key == 'f' and len(args) == 3:
            faces.append([int(x)-1-prior for x in args])
        else:
            raise ValueError('Unsupported OBJ record. Use ordered triangular geometry only: '+line)
    return sides


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pattern', type=Path, default=make.HERE/'editable.obj')
    parser.add_argument('--output', type=Path, help='Write different edited bytes to a new .glb file')
    args = parser.parse_args()
    spec, template, body, g, view, new, tris, skin, parts, pre = make.load_context()
    authored = read_obj(args.pattern)
    make.require(list(authored) == ['left','right'], 'Two ordered pattern objects required')
    assembled = []
    for part in parts:
        vertices, faces = authored[part['binding']['side']]
        make.require(len(vertices) == len(part['contact'])*2 and np.array_equal(faces,part['faces']) and np.isfinite(vertices).all(),
                     'Original pattern topology required to reuse skin calibration')
        normals = make.crew.normals(vertices.astype(float),faces).astype('<f4')
        mesh = {'POSITION':vertices, 'NORMAL':normals, 'JOINTS_0':np.tile(part['joints'],(2,1)),
                'WEIGHTS_0':np.tile(part['weights'],(2,1)).astype('<f4')}
        assembled.append((mesh,faces))
    data, _ = make.crew.export(view,skin,assembled,make.ID,spec['color'])
    if args.output:
        make.require(args.output.suffix.lower()=='.glb' and not args.output.exists(), 'Supply a new .glb path for an edited derivative')
        args.output.write_bytes(data)
    else:
        entry = json.loads((make.HERE/'corrected/entry.json').read_bytes())
        make.require(make.hashlib.sha256(data).hexdigest()==entry['sha256'], 'Edited bytes require a new output path and fit QA')
    print(make.hashlib.sha256(data).hexdigest())


if __name__ == '__main__':
    main()
