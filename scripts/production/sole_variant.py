"""Extrude the two authored tread islands of the registered CC0 flat shoe."""
import argparse
from collections import Counter, defaultdict
import copy
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory

import numpy as np

from flow import GLB, ROOT, Validator, require
from garment_source_mapping import json_bytes
from native_import import digest
from native_mesh_budget import accessor, encode
from production_paths import project_output, publish_new_directory

SOURCE = ROOT / 'assets-source/sole-variant-v1'
RECIPE = SOURCE / 'recipe.json'
GENERATED = SOURCE / 'generated'
PUBLIC = ROOT / 'prototype/public/assets/sole-variant-v1'


def geometry(source, recipe):
    mesh, = source.doc['meshes']
    primitive, = mesh['primitives']
    require(mesh['name'] == recipe['sourceMesh'] and source.doc['materials'][primitive['material']]['name'] == recipe['material'],
            'Wrong shoe surface')
    attrs = primitive['attributes']
    arrays = {k: accessor(source, v).copy() for k, v in attrs.items()}
    pos, uv = arrays['POSITION'], arrays['TEXCOORD_0']
    faces = accessor(source, primitive['indices']).reshape(-1, 3)
    chosen = np.concatenate([np.arange(start, end + 1) for start, end in recipe['outsoleFaceRangesInclusive']])
    # The original dark tread painting sits below v=.26. The adjacent shoe
    # lining begins at v=.2704. Verify the authored face selection independently.
    require(np.array_equal(chosen, np.flatnonzero(uv[faces, 1].max(axis=1) < .26)), 'Authored outsole UV islands differ')
    cap = np.unique(faces[chosen])
    remaining = np.delete(faces, chosen, axis=0)
    require(not np.intersect1d(cap, remaining).size, 'Tread and upper no longer have independent UV vertices')
    offset = recipe['soleOffsetM']
    require(np.isfinite(offset) and offset > 0, 'Expected a finite positive thickness, in metres')
    original = pos.copy()
    pos[cap, 1] -= offset

    # Geometric edges may cross UV/normal splits. Locate the adjacent upper
    # triangles by their exact source positions and verify the seam skinning.
    selected = set(chosen.tolist())
    edges = defaultdict(list)
    for number, triangle in enumerate(faces):
        for a, b, c in zip(triangle, np.roll(triangle, -1), np.roll(triangle, -2)):
            key = tuple(sorted((tuple(original[a]), tuple(original[b]))))
            edges[key].append((number, a, b, c))
    rims = []
    for adjacent in edges.values():
        tread = [side for side in adjacent if side[0] in selected]
        if len(tread) != 1:
            continue
        require(len(adjacent) == 2, 'Open or non-manifold outsole perimeter')
        (_, a, b, c), = tread
        (_, other_b, other_a, _), = [side for side in adjacent if side[0] not in selected]
        for i, j in ((a, other_a), (b, other_b)):
            require(np.array_equal(original[i], original[j]) and all(
                np.array_equal(arrays[k][i], arrays[k][j]) for k in ('WEIGHTS_0','JOINTS_0')), 'Skin weights differ across seam')
        rims.append((a, b, c))
    edge_counts = Counter('left' if original[a, 0] > 0 else 'right' for a, _, _ in rims)
    require(edge_counts == {'left':18, 'right':18}, 'Expected both authored 18-edge sole outlines')
    added = {k:[] for k in attrs}
    walls = []
    for a, b, c in rims:
        top_a, top_b, bot_b, bot_a = original[a], original[b], pos[b], pos[a]
        normal = np.cross(top_b - top_a, bot_b - top_a)
        norm = np.linalg.norm(normal)
        require(norm > 0, 'Collapsed outsole sidewall')
        corner = len(pos) + len(added['POSITION'])
        added['POSITION'].extend((top_a, top_b, bot_b, bot_a))
        added['NORMAL'].extend([normal / norm] * 4)
        for k in ('WEIGHTS_0', 'JOINTS_0'):
            added[k].extend(arrays[k][[a,b,b,a]])
        # Map the new rubber strip inside its own original tread triangle.
        # Inset both edges to keep transparent atlas padding off the sidewalls.
        center = (uv[a] + uv[b] + uv[c]) / 3
        added['TEXCOORD_0'].extend([uv[i] + (center - uv[i]) * f for i, f in ((a,.12),(b,.12),(b,.42),(a,.42))])
        walls.extend([[corner,corner+1,corner+2],[corner,corner+2,corner+3]])
    result = {k:np.concatenate((values, np.asarray(added[k], dtype=values.dtype))) for k, values in arrays.items()}
    triangles = np.concatenate((faces, np.asarray(walls, dtype=faces.dtype)))
    audit = {'outsoleTriangles':len(chosen), 'unchangedUpperTriangles':len(remaining), 'perimeterEdges':dict(edge_counts),
             'addedSidewallTriangles':len(walls), 'sourceVertices':len(pos), 'vertices':len(result['POSITION']),
             'sourceTriangles':len(faces), 'triangles':len(triangles), 'floorBeforeM':float(original[:,1].min()),
             'floorAfterM':float(result['POSITION'][:,1].min()),
             'maxUpperVertexDeltaM':float(np.abs(result['POSITION'][remaining] - original[remaining]).max()),
             'maxTreadDisplacementErrorM':float(np.abs(original[cap,1] - pos[cap,1] - offset).max())}
    return result, triangles, audit


def pack(source, recipe, recipe_sha, arrays, triangles):
    doc = copy.deepcopy(source.doc)
    mesh, = doc['meshes']
    primitive, = mesh['primitives']
    streams = {**{i:arrays[k] for k, i in primitive['attributes'].items()}, primitive['indices']:triangles.reshape(-1,1)}
    replacements = {}
    for i, values in streams.items():
        a = doc['accessors'][i]
        a['count'] = len(values)
        for bound, fn in [('min', np.min), ('max', np.max)]:
            if bound in a:
                a[bound] = fn(values, axis=0).tolist()
        replacements[a['bufferView']] = values.tobytes()
    binary = bytearray()
    for i, view in enumerate(doc['bufferViews']):
        start = view.get('byteOffset', 0)
        raw = replacements.get(i, source.binary[start:start + view['byteLength']])
        binary.extend(bytes(-len(binary) % 4))
        view['byteOffset'], view['byteLength'] = len(binary), len(raw)
        binary.extend(raw)
    binary.extend(bytes(-len(binary) % 4))
    doc['buffers'][0]['byteLength'] = len(binary)
    mesh['name'] = recipe['id']
    for node in doc['nodes']:
        if 'mesh' in node:
            node['name'] = recipe['id']
    doc['extras']['soleVariant'] = {'parentShoeSha256':recipe['sourceSha256'], 'recipeSha256':recipe_sha}
    return encode(doc, binary)


def build():
    recipe_bytes = RECIPE.read_bytes()
    r = json.loads(recipe_bytes)
    recipe_sha = digest(recipe_bytes)
    require(r['schema'] == 'cc0-uniform-platform-sole-v1' and re.fullmatch(r'[a-z][a-z0-9-]{1,79}', r['id']),
            'Invalid sole recipe or equipment ID')
    reader = Validator()
    catalog = reader.json(r['equipmentCatalog'])
    parent = reader.item(catalog, r['sourceId'])
    require(parent['sha256'] == r['sourceSha256'] and parent['compatibleAvatarSha256'] == r['body']['sha256'],
            'Different registered source shoe or target body')
    original = GLB(reader.pin(reader.url(parent['url']), parent['sha256'], parent['bytes']))
    body = GLB(reader.pin(r['body']['path'], r['body']['sha256']))
    source_vrm = GLB(reader.pin(r['publisherModel']['path'], r['publisherModel']['sha256']))
    require(source_vrm.doc['extensions']['VRM']['meta']['licenseName'] == 'CC0'
            and parent['sourceLicense']['vrmSHA256'] == r['publisherModel']['sha256'], 'Publisher source changed')
    reader.pin(r['editableRoundtripShoe']['path'], r['editableRoundtripShoe']['sha256'])
    arrays, triangles, audit = geometry(original, r)
    raw = pack(original, r, recipe_sha, arrays, triangles)
    result = GLB(raw)
    body_binds = body.bind_by_name()
    require(result.bind_by_name() == original.bind_by_name() and all(
        np.max(np.abs(np.array(mat) - body_binds[name])) < 1e-6 for name, mat in result.bind_by_name().items()),
        'Shoe bindings differ from the exact target')
    filename = r['id'] + '.glb'
    multi = int(np.count_nonzero((arrays['WEIGHTS_0'] > 0).sum(axis=1) > 1))
    stats = {'vertices':audit['vertices'], 'triangles':audit['triangles'], 'multiBoneVertices':multi, 'joints':len(result.bind_by_name())}
    entry = dict(parent, id=r['id'], name='CC0 制服鞋 · 平行厚底', url='/assets/sole-variant-v1/'+filename,
                 fitId=r['fitId'], styleId=r['styleId'], version=1, sha256=digest(raw), bytes=len(raw), stats=stats,
                 method='Original upper; orthogonal extrusion of both authored outsole UV islands.',
                 limits=['Exact authored 1K male body; standing, walking and seated support require independent runtime verification.'])
    fit = {'schema':'uniform-platform-sole-fit-v1', 'id':r['fitId'], 'styleId':r['styleId'], 'version':1,
           'slot':'shoes', 'equipmentId':r['id'], 'bodyType':r['bodyType'], 'bodySha256':r['body']['sha256'],
           'shoeSha256':entry['sha256'], 'sourceShoeId':parent['id'], 'sourceShoeSha256':parent['sha256'],
           'recipeSha256':recipe_sha, 'soleOffsetM':r['soleOffsetM'], 'runtimeAccepted':False,
           'geometry':audit}
    return {filename:raw, 'fit.json':json_bytes(fit),
            'equipment.json':json_bytes({'schema':catalog['schema'], 'items':[entry]})}


def checked(path):
    resolved = project_output(path, __file__)
    require(resolved == path.absolute(), 'Redirected sole variant destination: ' + str(path))
    return resolved


def verify(directory, files):
    require(directory.is_dir() and {p.name for p in directory.iterdir()} == set(files), 'Incomplete sole variant directory')
    for name, raw in files.items():
        require(checked(directory/name).read_bytes() == raw, 'Existing sole variant differs: ' + name)


def install(output, files, check_only):
    if output.exists() or check_only:
        verify(output, files)
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=output.parent, prefix='.sole-') as tmp:
            fresh = Path(tmp)/'package'
            fresh.mkdir()
            for name, raw in files.items():
                (fresh/name).write_bytes(raw)
            try:
                publish_new_directory(fresh, output)
            except FileExistsError:
                verify(output, files)
    return {name:digest(data) for name, data in files.items()}


def run(output, check_only=False):
    return install(checked(output), build(), check_only)


def publish(check_only=False):
    output = checked(PUBLIC)
    source = checked(GENERATED)
    expected = build()
    require(set(expected) == {'cc0-texture-release-platform-shoes-v1.glb','equipment.json','fit.json'},
            'Unexpected shoe publication file set')
    verify(source, expected)
    files = {name:checked(source/name).read_bytes() for name in expected}
    require(files == expected, 'Generated shoe changed before publication')
    return install(output, files, check_only)


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    mode = cli.add_mutually_exclusive_group()
    mode.add_argument('--output', type=Path)
    mode.add_argument('--publish', action='store_true', help='Copy the three verified generated files to the fixed public shoe directory')
    cli.add_argument('--check', action='store_true')
    args = cli.parse_args()
    print(json.dumps(publish(args.check) if args.publish else run(args.output or GENERATED, args.check), indent=2))
