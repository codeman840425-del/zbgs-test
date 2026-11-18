"""Derive per-body normal texture identities from pinned bodies and coverage."""
import argparse
import json
from pathlib import Path
import struct

from native_import import ROOT, body_image, confined, digest, embedded_glb


def pinned_file(root, reference, label):
    path, expected = reference
    raw = confined(root, path).read_bytes()
    if digest(raw) != expected:
        raise ValueError(f'{label}: file identity mismatch: {path}')
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


def add_binding(avatars, root, body_ref, coverage_ref, label):
    sha = body_ref[1]
    body = pinned_file(root, body_ref, label)
    coverage = json.loads(pinned_file(root, coverage_ref, label))
    if coverage['schema'] != 'native-body-texture-coverage-v1' or coverage['avatarSha256'] != sha:
        raise ValueError(f'{label}: coverage/body mismatch')
    body_image(body, coverage)
    pin = extract_normal(body, coverage)
    if pin is not None:
        if sha in avatars and avatars[sha] != pin:
            raise ValueError(f'{sha}: conflicting normal ownership')
        avatars[sha] = pin


def build(batches, root, sources=()):
    avatars = {}
    for path in batches:
        batch = json.loads(path.read_bytes())
        if batch['schema'] != 'native-factory-import-batch-v1':
            raise ValueError('Expected a native factory batch')
        for item in batch['items']:
            spec = json.loads(confined(root, item['spec']).read_bytes())
            if item['package'] != spec['bodyType'] or spec['schema'] != 'native-parameter-factory-staging-v1':
                raise ValueError('Body specification mismatch')
            body_ref = spec['files'][spec['bodyFile']]
            if spec['bodySha256'] != body_ref[1]:
                raise ValueError(f"{item['package']}: body pin mismatch")
            add_binding(avatars, root, body_ref, spec['files']['manifest.json'], item['package'])
    for path in sources:
        source = json.loads(path.read_bytes())
        if set(source) != {'schema', 'body', 'coverage'} or source['schema'] != 'native-body-normal-source-v1':
            raise ValueError(f'{path.name}: expected a native body normal source')
        add_binding(avatars, root, source['body'], source['coverage'], path.name)
    return {'schema':'native-body-normal-source-pins-v1', 'avatars':dict(sorted(avatars.items()))}


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--batch', type=Path, action='append', default=[])
    cli.add_argument('--source', type=Path, action='append', default=[])
    mode = cli.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', type=Path)
    mode.add_argument('--write-new', type=Path)
    args = cli.parse_args()
    if not (args.batch or args.source):
        cli.error('provide at least one --batch or --source')
    result = build(args.batch, ROOT, args.source)
    if args.check:
        if result != json.loads(args.check.read_bytes()):
            raise SystemExit('Body normal pins differ from source packages')
    else:
        with args.write_new.open('x', encoding='utf-8', newline='\n') as f:
            f.write(json.dumps(result, indent=2) + '\n')
    print(f"{len(result['avatars'])} body bindings")
