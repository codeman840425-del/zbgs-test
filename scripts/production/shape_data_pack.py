"""Build and verify immutable data-only packs against frozen production inputs."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory

sys.dont_write_bytecode = True
from flow import ROOT, require
from garment_source_mapping import json_bytes
from native_import import confined, digest, embedded_glb
from production_paths import main_checkout, project_output, publish_new_directory
from receive_rule_body import CONTRACTS, prepare, unique_fields
from rule_body_producer import canonical, generate, pinned


def read_object(raw):
    value = json.loads(raw, object_pairs_hook=unique_fields)
    require(isinstance(value, dict), 'Expected a JSON object')
    return value


def resource_path(url, extension):
    require(isinstance(url, str) and url.startswith('/assets/') and url.endswith(extension),
            'Expected a local asset URL of the approved file type')
    parts = url[1:].split('/')
    require(all(re.fullmatch('[a-z0-9][a-z0-9._-]*', part) for part in parts), 'Invalid resource path')
    return '/'.join(parts)


def embedded(raw):
    doc, _ = embedded_glb(raw)
    require(len(doc['buffers']) == 1 and 'uri' not in doc['buffers'][0]
            and all('uri' not in im and 'bufferView' in im for im in doc.get('images', [])),
            'Model contains an external buffer or image')
    return doc


def payload_pin(name, raw):
    return {'path': name, 'sha256': digest(raw), 'bytes': len(raw)}


def assemble(recipe, candidate, source_root=ROOT):
    source_root = Path(source_root).resolve()
    # Do not let a package provide its own list of authorized templates.
    binding = recipe.get('template')
    require(isinstance(binding, dict) and binding.get('sha256') in read_object(CONTRACTS.read_bytes())['templates'],
            'Unregistered authoring template')
    template = read_object(pinned(source_root, binding))
    origin = read_object(pinned(source_root, template['provenance']))
    # During verification, derive the candidate from external trusted inputs. No
    # descriptor, path or proof supplied by the incoming index chooses a file.
    if candidate is None:
        candidate, _ = generate(recipe, source_root)
    profile, model_files, fit = prepare(recipe, candidate, source_root)
    body_doc = embedded(candidate)
    meta = body_doc['extensions']['VRM']['meta']
    require((meta['licenseName'], meta['allowedUserName'], meta['commercialUssageName']) ==
            ('CC0', 'Everyone', 'Allow'), 'Unexpected VRM source permissions')
    body_name = resource_path(profile['url'], '.vrm')
    manifest_name = resource_path(profile['manifestUrl'], '.json')
    require(body_name == 'assets/' + profile['id'] + '/body.vrm'
            and manifest_name == 'assets/' + profile['id'] + '/equipment.json', 'Unexpected body package URLs')
    payloads = {'recipe.json': json_bytes(json.loads(canonical(recipe))), 'fit.json': json_bytes(fit),
                'profile.json': json_bytes(profile), body_name: candidate, manifest_name: model_files['equipment.json']}
    items = read_object(model_files['equipment.json'])['items']
    require(len(items) == 3 and {row['slot'] for row in items} == {'top', 'bottom', 'shoes'},
            'Expected the reviewed three-piece outfit')
    for item in items:
        name = resource_path(item['url'], '.glb')
        require(name not in payloads, 'Duplicate payload path')
        data = confined(source_root / 'prototype/public', name).read_bytes()
        require(digest(data) == item['sha256'] and len(data) == item['bytes'], 'Shared garment changed')
        extras = embedded(data)['extras']
        require(item['sourceLicense'] == origin == extras['sourceProvenance']
                and extras['sourceSha256'] == origin['vrmSHA256'], 'Unreviewed garment source')
        payloads[name] = data
    pins = {name:payload_pin(name, payloads[name]) for name in sorted(payloads)}
    index = {'schema': 'shape-data-pack-v1', 'bodyType': profile['id'],
             'templateSha256': fit['templateSha256'], 'sourceBodySha256': fit['sourceBodySha256'],
             'recipeSha256': fit['recipeSha256'], 'profile': pins['profile.json'], 'recipe': pins['recipe.json'],
             'fit': pins['fit.json'], 'files': list(pins.values())}
    return {'index.json': json_bytes(index), **payloads}


def regular_path(path):
    require(path.resolve() == Path(os.path.abspath(path)) and not path.is_symlink() and not path.is_junction(),
            'Redirected package path: ' + str(path))
    return path


def check_tree(folder, expected):
    regular_path(folder)
    require(folder.is_dir(), 'Package directory is missing')
    directories = {str(parent.as_posix()) for name in expected for parent in Path(name).parents}
    actual = set()
    pending = [folder]
    while pending:
        for item in pending.pop().iterdir():
            regular_path(item)
            name = item.relative_to(folder).as_posix()
            if item.is_dir():
                require(name in directories, 'Unexpected directory: ' + name)
                pending.append(item)
            else:
                require(name in expected and item.is_file(), 'Unexpected payload: ' + name)
                require(item.stat().st_size == len(expected[name]) and item.read_bytes() == expected[name],
                        'Content differs from trusted reconstruction: ' + name)
                actual.add(name)
    require(actual == set(expected), 'Missing package payload: ' + ', '.join(sorted(set(expected) - actual)))


def result(files):
    index = files['index.json']
    return {'indexSha256': digest(index), 'bodyType': read_object(index)['bodyType'], 'fileCount': len(files)}


def destination(path):
    checkout = main_checkout(__file__)
    requested = checkout / path
    actual = project_output(requested, __file__)
    regular_path(requested)
    require('..' not in requested.parts and (checkout / 'output') in actual.parents,
            'Pack output must be inside the main output directory')
    return actual


def build(recipe, candidate, out, source_root=ROOT):
    out = destination(out)
    files = assemble(recipe, candidate, source_root)
    if out.exists():
        check_tree(out, files)
    else:
        out.parent.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=out.parent, prefix='.shape-pack-') as tmp:
            stage = destination(Path(tmp) / 'package')
            for name, data in files.items():
                path = regular_path(confined(stage, name))
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            check_tree(stage, files)
            try:
                publish_new_directory(stage, out)
            except FileExistsError:
                check_tree(out, files)
    return result(files)


def verify(folder, expected_index=None, source_root=ROOT):
    folder = regular_path(Path(folder).absolute())
    index_path = regular_path(folder / 'index.json')
    if expected_index is not None:
        require(digest(index_path.read_bytes()) == expected_index, 'External index digest differs')
    recipe = read_object(regular_path(folder / 'recipe.json').read_bytes())
    files = assemble(recipe, None, source_root)
    check_tree(folder, files)
    return result(files)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    create = commands.add_parser('build')
    create.add_argument('--recipe', required=True, type=Path)
    create.add_argument('--candidate', required=True, type=Path)
    create.add_argument('--out', required=True, type=Path)
    check = commands.add_parser('verify')
    check.add_argument('--pack', required=True, type=Path)
    check.add_argument('--index-sha256')
    for command in (create, check):
        command.add_argument('--source-root', type=Path, default=ROOT)
    args = parser.parse_args()
    if args.command == 'build':
        report = build(read_object((ROOT / args.recipe).read_bytes()), (ROOT / args.candidate).read_bytes(),
                       args.out, args.source_root)
    else:
        report = verify(ROOT / args.pack, args.index_sha256, args.source_root)
    print(json.dumps(report))
