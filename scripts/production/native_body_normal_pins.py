"""Derive per-body normal texture identities from pinned factory packages."""
import argparse
import json
from pathlib import Path
import struct

from native_import import ROOT, confined, digest, embedded_glb


def pinned_file(spec, name, root):
    path, expected = spec['files'][name]
    raw = confined(root, path).read_bytes()
    if digest(raw) != expected:
        raise ValueError(f"{spec['bodyType']}: file identity mismatch: {name}")
    return raw


def extract_normal(body, coverage):
    doc, binary = embedded_glb(body)
    indices = [i for i, mat in enumerate(doc['materials']) if mat.get('name') == coverage['materialName']]
    if len(indices) != 1:
        raise ValueError('Expected one exact coverage material')
    material = indices[0]
    normal = doc['materials'][material].get('normalTexture')
    if normal is None:
        return None

    def indexed(table, index):
        if type(index) is not int or not 0 <= index < len(doc[table]):
            raise ValueError(f'Invalid {table} index')
        return doc[table][index]

    tex_index = normal['index']
    texture = indexed('textures', tex_index)
    image_index = texture['source']
    image = indexed('images', image_index)
    if image.get('mimeType') != 'image/png' or 'uri' in image or texture.get('extensions'):
        return None
    view = indexed('bufferViews', image['bufferView'])
    start, length = view.get('byteOffset', 0), view['byteLength']
    if view['buffer'] != 0 or start < 0 or length < 24 or start + length > len(binary):
        raise ValueError('Invalid embedded normal PNG range')
    png = binary[start:start + length]
    if png[:8] != b'\x89PNG\r\n\x1a\n' or png[12:16] != b'IHDR':
        raise ValueError('Invalid embedded normal PNG header')
    if struct.unpack_from('>II', png, 16) != (2048, 2048):
        return None
    return dict(material=material, texture=tex_index, image=image_index, pngSha256=digest(png))


def build(batches, root):
    avatars = {}
    for path in batches:
        batch = json.loads(path.read_bytes())
        if batch['schema'] != 'native-factory-import-batch-v1':
            raise ValueError('Expected a native factory batch')
        for item in batch['items']:
            spec = json.loads(confined(root, item['spec']).read_bytes())
            if item['package'] != spec['bodyType'] or spec['schema'] != 'native-parameter-factory-staging-v1':
                raise ValueError('Body specification mismatch')
            body = pinned_file(spec, spec['bodyFile'], root)
            coverage = json.loads(pinned_file(spec, 'manifest.json', root))
            sha = spec['bodySha256']
            if sha != digest(body) or coverage['avatarSha256'] != sha:
                raise ValueError(f"{item['package']}: coverage/body mismatch")
            pin = extract_normal(body, coverage)
            if pin is not None:
                if sha in avatars and avatars[sha] != pin:
                    raise ValueError(f'{sha}: conflicting normal ownership')
                avatars[sha] = pin
    return {'schema':'native-body-normal-source-pins-v1', 'avatars':avatars}


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--batch', type=Path, action='append', required=True)
    mode = cli.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', type=Path)
    mode.add_argument('--write-new', type=Path)
    args = cli.parse_args()
    result = build(args.batch, ROOT)
    if args.check:
        if result != json.loads(args.check.read_bytes()):
            raise SystemExit('Body normal pins differ from source packages')
    else:
        with args.write_new.open('x', encoding='utf-8', newline='\n') as f:
            f.write(json.dumps(result, indent=2) + '\n')
    print(f"{len(result['avatars'])} body bindings")
