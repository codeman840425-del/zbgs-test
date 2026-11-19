"""Rebuild the authored 3 mm stud and measure both original VRMs in head-bind space."""
import argparse
import copy
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

from production_paths import project_output, publish_new_directory

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/m2-paired-ear-accessory-v1'))
import build as author
from qa import nearest_surface
import numpy as np

PACKAGE = ROOT / 'assets-source/paired-ear-style-batch-v1'
PUBLIC = ROOT / 'prototype/public/assets/m2-ear-stud-3mm-v1'


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def reference(file, data):
    return {'file': file, 'sha256': author.digest(data), 'bytes': len(data)}


def read_pin(name, expected):
    data = author.local(ROOT, name).read_bytes()
    author.require(author.digest(data) == expected, 'Source digest mismatch: ' + name)
    return data


def check_shape(asset, expected, style):
    actual, ref = author.GLB(asset), author.GLB(expected)
    metadata = copy.deepcopy(ref.doc)
    metadata['nodes'][0]['name'] = style
    author.require(actual.doc == metadata and actual.binary == ref.binary,
                   'Historical 3 mm mesh, material or geometry buffer differs')
    mesh = actual.doc['meshes'][0]['primitives'][0]
    positions = np.array(actual.accessor(mesh['attributes']['POSITION']))
    indices = np.array(actual.accessor(mesh['indices']), dtype=int).reshape(-1, 3)
    return positions, indices, {
        'historicalNodeName': ref.doc['nodes'][0]['name'], 'newNodeName': style,
        'matchingBinarySha256': author.digest(actual.binary), 'onlyDifference': 'nodes[0].name',
        'vertexCount': len(positions), 'triangleCount': len(indices),
        'boundsM': [positions.min(0).tolist(), positions.max(0).tolist()],
        'material': actual.doc['materials'][mesh['material']],
    }


def measure_surface(source, fit, vertices, triangles):
    avatar = author.GLB(read_pin(source['path'], source['sha256']))
    primitive = avatar.doc['meshes'][source['meshIndex']]['primitives'][source['primitiveIndex']]
    skin = np.array(avatar.accessor(primitive['attributes']['POSITION']))
    normals = np.array(avatar.accessor(primitive['attributes']['NORMAL']))
    faces = np.array(avatar.accessor(primitive['indices']), dtype=int).reshape(-1, 3)
    face = np.array(fit['faceWorldRestMatrixColumnMajor']).reshape(4, 4).T
    head = np.array(fit['headWorldRestMatrixColumnMajor']).reshape(4, 4).T
    world = skin @ face[:3, :3].T + face[:3, 3]
    world_normals = normals @ np.linalg.inv(face[:3, :3])
    observations = []
    for mount in fit['mounts']:
        local = vertices @ author.rotation(mount['quaternion']).T + mount['position']
        stud = local @ head[:3, :3].T + head[:3, 3]
        samples = np.vstack([stud, stud[triangles].mean(1)])
        distance, nearest = nearest_surface(samples, world[faces])
        normal = world_normals[faces[nearest]].mean(1)
        normal /= np.linalg.norm(normal, axis=1, keepdims=True)
        signed = ((samples - world[faces[nearest, 0]]) * normal).sum(1)
        author.require(signed.min() >= -.0001, 'Rest-pose clearance below original source tolerance')
        observations.append({'side': mount['side'], 'faceId': mount['trace']['faceId'],
                             'triangleVertexIds': mount['trace']['triangleVertexIds'],
                             'headWeightPerCorner': mount['trace']['headWeightPerCorner'],
                             'headLocalM': mount['position'], 'sampleCount': len(samples),
                             'minSampledDistanceM': float(distance.min()),
                             'minSampledSignedDistanceM': float(signed.min())})
    return observations


def make_package():
    recipe_data = (PACKAGE / 'recipe.json').read_bytes()
    recipe = json.loads(recipe_data)
    parent = recipe['parent']
    spec = json.loads(read_pin(parent['spec'], parent['specSha256']))
    previous = read_pin(parent['referenceGlb'], parent['referenceSha256'])
    provenance = json.loads(author.local(ROOT, parent['provenance']).read_bytes())
    author.require(provenance['license'] == recipe['license'] == 'CC0-1.0'
                   and author.local(ROOT, parent['licenseFile']).is_file(), 'Missing CC0 source')
    edit = recipe['geometryEdit']
    author.require(edit == spec['parameterVariant'], 'The selected historical variant differs')
    baseline = author.export_glb(spec)
    spec['geometry'][edit['parameter']] = edit['value']
    author.require(author.export_glb(spec) == previous != baseline, 'Historical edit does not reproduce')
    spec.update(styleId=recipe['styleId'], pairId=recipe['pairId'])
    asset = author.export_glb(spec)
    vertices, indices, shape = check_shape(asset, previous, spec['styleId'])
    identity = {key: recipe[key] for key in ('styleId', 'pairId', 'version')}
    instances = [{'id': id_, 'side': side, 'socket': 'ear.' + side,
                  'styleId': spec['styleId'], 'pairId': spec['pairId']}
                 for side, id_ in recipe['instanceIds'].items()]
    manifest = {'schema': 'zbgs-paired-rigid-accessory-style-v1', **identity,
                'asset': {**reference('stud.glb', asset), 'units': 'metres',
                          'localOutwardAxis': '+Z', 'localUpAxis': '+Y'},
                'instances': instances, 'fits': [], 'physics': 'rigid-head-attachment',
                'provenance': '../../recipe.json', 'license': recipe['license'], 'runtimeAccepted': False}
    runtime = {'stud.glb': asset}
    bodies = {}
    for body, source in spec['inputs'].items():
        fit = author.source_fit(body, source, spec, manifest['asset']['sha256'])
        fit['fitId'] = recipe['fitIds'][body]
        for mount in fit['mounts']:
            mount['instanceId'] = recipe['instanceIds'][mount['side']]
        name = body + '-fit.json'
        runtime[name] = json_bytes(fit)
        ref = {**reference(name, runtime[name]), 'fitId': fit['fitId'],
               'bodyType': body, 'baseAvatarSha256': source['sha256']}
        manifest['fits'].append(ref)
        bodies[body] = {**ref, 'source': source['path'],
                        'mounts': measure_surface(source, fit, vertices, indices)}
    runtime['manifest.json'] = json_bytes(manifest)
    fragment = {'styleId': spec['styleId'], 'version': recipe['version'],
                'manifestUrl': '/assets/' + PUBLIC.name + '/manifest.json',
                'manifestSha256': author.digest(runtime['manifest.json'])}
    report = {'recipeSha256': author.digest(recipe_data), 'license': recipe['license'],
              'originalRadiusM': json.loads(read_pin(parent['spec'], parent['specSha256']))['geometry']['radiusM'],
              'geometryEdit': edit, 'originalAssetSha256': author.digest(baseline),
              'historicalVariantSha256': author.digest(previous), 'newAsset': manifest['asset'],
              'shapeReadback': shape, 'bodyFits': bodies, 'catalog': fragment, 'runtimeAccepted': False,
              'limits': ['Exact source VRM SHA governs aliases. Identity gender is not used to select a fit.',
                         'One rigid mesh is instanced for left/right. No additional body or ear shape measured.',
                         'Rest-pose vertices and triangle centroids only. Motion, occlusion and room visibility require runtime checks.']}
    return runtime, {'catalog-fragment.json': json_bytes(fragment), 'build-report.json': json_bytes(report)}


def deliver(folder, files):
    if folder.exists():
        existing = {p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file()}
        if existing != files.keys() or any(project_output(folder / n, __file__).read_bytes() != b
                                           for n, b in files.items()):
            raise ValueError('Existing package is incomplete or differs: ' + str(folder))
        return
    folder.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=folder.parent) as temp:
        staged = Path(temp) / 'package'
        for name, data in files.items():
            target = project_output(staged / name, __file__)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        publish_new_directory(staged, folder)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default=PACKAGE / 'generated', help='Source receipt and runtime copy')
    parser.add_argument('--publish', action='store_true', help='Publish the four checked runtime files')
    options = parser.parse_args()
    out = project_output(options.out, __file__)
    public = project_output(PUBLIC, __file__)
    author.require(not (out.is_relative_to(public) or public.is_relative_to(out)), 'Overlapping output directories')
    runtime, receipts = make_package()
    deliver(out, {**receipts, **{'runtime/' + key: value for key, value in runtime.items()}})
    if options.publish:
        deliver(public, runtime)
    print(receipts['catalog-fragment.json'].decode().strip())


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        sys.exit(str(error))
