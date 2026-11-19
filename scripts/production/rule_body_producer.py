"""Bake an archived Blender Basis-relative endpoint into a matching VRM0 body."""
import argparse
import copy
import gzip
import json
import math
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

sys.dont_write_bytecode = True
import numpy as np

from flow import GLB, ROOT, read_json, require
from native_import import confined, digest
from native_mesh_budget import accessor, encode
from production_paths import main_checkout, project_output, publish_new_directory


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False,
                      separators=(',', ':')).encode()


def pinned(root, pin):
    require(set(pin) == {'path', 'sha256'}, 'Expected an exact input path and digest')
    raw = confined(root, pin['path']).read_bytes()
    require(digest(raw) == pin['sha256'], f"Source digest differs: {pin['path']}")
    return raw


def basis_vectors(rows):
    xyz = np.asarray(rows, dtype=np.float64)
    require(xyz.ndim == 2 and xyz.shape[1] == 3 and np.isfinite(xyz).all(), 'Invalid Blender rows')
    return xyz[:, [0, 2, 1]] * [1., 1., -1.]


def triangle_normals(positions, triangles):
    a, b, c = positions[triangles].transpose(1, 0, 2)
    return np.cross(b - a, c - a)


def rotated_normals(before, after, triangles, shading, touched):
    """Transport authored split normals by the rotation of their local triangle fan."""
    fans = []
    tri_normals = []
    for positions in (before, after):
        normals = triangle_normals(positions, triangles)
        tri_normals.append(normals)
        sums = np.zeros_like(before)
        for column in triangles.T:
            np.add.at(sums, column, normals)
        lengths = np.linalg.norm(sums[touched], axis=1)
        require(np.all(lengths > 1e-14), 'Degenerate smoothing fan in edited neighborhood')
        fans.append(sums[touched] / lengths[:, None])

    before_area = np.linalg.norm(tri_normals[0], axis=1)
    nonzero = before_area > 1e-14
    signed_area = np.einsum('ij,ij->i', *tri_normals)
    require(np.all(signed_area[nonzero] > 0), 'A source triangle folded or collapsed')
    src, dst = fans
    axis = np.cross(src, dst)
    cosine = np.einsum('ij,ij->i', src, dst)
    require(np.min(cosine) > -0.999999, 'Ambiguous normal transport')
    existing = shading[touched]
    turned = np.cross(axis, existing)
    result = shading.copy()
    result[touched] = existing + turned + np.cross(axis, turned) / (1 + cosine[:, None])
    return result


def mesh_inputs(glb, template, shape):
    matches = [(i, m) for i, m in enumerate(glb.doc['meshes']) if m.get('name') == template['mesh']]
    require(len(matches) == 1, 'Shape mesh selector is ambiguous or absent')
    mesh_index, mesh = matches[0]
    attrs = mesh['primitives'][0]['attributes']
    targets = mesh['primitives'][0]['targets']
    require({'POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0'} <= attrs.keys(), 'Expected a skinned mesh')
    edited_streams = {attrs['POSITION'], attrs['NORMAL'], *(target['NORMAL'] for target in targets)}
    for i, other in enumerate(glb.doc['meshes']):
        if i != mesh_index:
            for prim in other['primitives']:
                referenced = set(prim['attributes'].values())
                for target in prim.get('targets', []):
                    referenced.update(target.values())
                require(edited_streams.isdisjoint(referenced), 'Another mesh shares editable shape streams')
    positions = accessor(glb, attrs['POSITION']).astype(np.float64)
    basis = basis_vectors(shape['sourcePositions'])
    delta = basis_vectors(shape['delta'])
    require(positions.shape == basis.shape == delta.shape, 'Incompatible Basis vertex count')
    error = float(np.linalg.norm(positions - basis, axis=1).max())
    require(error <= 1e-7, 'Source and authored Basis vertex ordering or coordinates differ')
    moved = np.any(delta != 0, axis=1)
    require(moved.any() and not moved.all(), 'Expected a localized shape')

    triangles = []
    for primitive in mesh['primitives']:
        require(primitive['attributes'] == attrs and primitive['targets'] == targets and
                primitive.get('mode', 4) == 4, 'Expected shared face streams and indexed triangles')
        faces = accessor(glb, primitive['indices']).reshape(-1, 3)
        material = glb.doc['materials'][primitive['material']]['name']
        if material != template['mutableMaterial']:
            require(not moved[faces].any(), f'Endpoint changes protected material {material}')
        triangles.append(faces)
    triangles = np.vstack(triangles)
    touched = np.unique(triangles[moved[triangles].any(axis=1)])
    require(set(np.flatnonzero(moved)) <= set(touched), 'Unreferenced editable vertex')
    return mesh_index, attrs, targets, positions, delta, error, triangles, touched


def generate(recipe, source_root=ROOT):
    root = Path(source_root).resolve()
    require(set(recipe) == {'schema', 'template', 'weight'} and
            recipe['schema'] == 'shape-endpoint-body-recipe-v1', 'Unknown shape recipe')
    template = json.loads(pinned(root, recipe['template']))
    require(template['schema'] == 'blender-shape-endpoint-template-v1' and
            template['sourceSpace'] == 'blender-mesh-local-metres', 'Unknown endpoint template')
    weight = recipe['weight']
    lo, hi = template['weightRange']
    require(type(weight) in (int, float) and math.isfinite(weight) and 0 <= lo <= weight <= hi <= 1,
            'Shape weight must be a finite number within the registered endpoint range')
    pinned(root, template['provenance'])
    source = pinned(root, template['sourceBody'])
    shape = json.loads(gzip.decompress(pinned(root, template['shapeEndpoint'])))
    glb = GLB(source)
    vrm = glb.doc['extensions']['VRM']
    require(vrm['meta']['licenseName'] == 'CC0', 'Expected the registered legacy CC0 model')
    mesh, attrs, targets, positions, delta, basis_error, triangles, touched = mesh_inputs(glb, template, shape)
    new_positions = (positions + weight * delta).astype('<f4').astype(np.float64)
    moved = np.any(positions != new_positions, axis=1)
    require(weight == 0 or np.any(moved), 'Nonzero weight rounded to identical geometry')
    normals = accessor(glb, attrs['NORMAL']).astype(np.float64)
    new_normals = rotated_normals(positions, new_positions, triangles, normals, touched)
    replacements = {attrs['POSITION']: new_positions, attrs['NORMAL']: new_normals}
    for target in targets:
        require(set(target) == {'NORMAL', 'POSITION'}, 'Expected authored position and normal morphs')
        offset = accessor(glb, target['POSITION'])
        normal_offset = accessor(glb, target['NORMAL']).astype(np.float64)
        posed_normals = rotated_normals(positions + offset, new_positions + offset, triangles,
                                        normals + normal_offset, touched)
        updated = normal_offset.copy()
        updated[touched] = posed_normals[touched] - new_normals[touched]
        require(target['NORMAL'] not in replacements, 'Ambiguous shared target normal stream')
        replacements[target['NORMAL']] = updated

    doc = copy.deepcopy(glb.doc)
    binary = bytearray(glb.binary)
    changed_views = []
    for index, rows in replacements.items():
        a = doc['accessors'][index]
        view_id = a['bufferView']
        v = doc['bufferViews'][view_id]
        data = rows.astype('<f4').tobytes()
        require(a['type'] == 'VEC3' and a['componentType'] == 5126 and a.get('byteOffset', 0) == 0 and
                v.get('buffer') == 0 and v['byteLength'] == len(data) and 'byteStride' not in v and
                sum(other.get('bufferView') == view_id for other in doc['accessors']) == 1,
                'Cannot safely replace a shared or non-packed stream')
        start = v.get('byteOffset', 0)
        stop = start + len(data)
        require(all(j == view_id or other.get('byteOffset', 0) >= stop or
                    other.get('byteOffset', 0) + other['byteLength'] <= start
                    for j, other in enumerate(doc['bufferViews'])), 'Overlapping view')
        if weight and glb.binary[start:stop] != data:
            binary[start:stop] = data
            changed_views.append(view_id)
            for key, reducer in [('min', np.min), ('max', np.max)]:
                if key in a:
                    a[key] = reducer(rows.astype('<f4'), axis=0).tolist()
    raw = encode(doc, binary) if weight else source
    result = GLB(raw)
    bindings = {}
    for group in vrm['blendShapeMaster']['blendShapeGroups']:
        for bind in group['binds']:
            require(bind['mesh'] == mesh and bind['weight'] > 0, 'Unexpected expression binding')
            idx = targets[bind['index']]['POSITION']
            retained = accessor(result, idx)
            require(np.array_equal(retained, accessor(glb, idx)), 'Expression displacement changed')
            bindings[group['name']] = float(np.linalg.norm(retained, axis=1).max())
    for preset in ('a', 'i', 'u', 'e', 'o', 'blink', 'blink_l', 'blink_r'):
        active = [bindings[g['name']] for g in vrm['blendShapeMaster']['blendShapeGroups']
                  if g['presetName'] == preset and g['name'] in bindings]
        require(any(value > 0 for value in active), f'Missing functional expression: {preset}')
    unchanged = []
    for idx, view in enumerate(doc['bufferViews']):
        if idx in changed_views:
            continue
        start = view.get('byteOffset', 0)
        span = slice(start, start + view['byteLength'])
        require(glb.binary[span] == result.binary[span], 'Unlisted buffer range changed')
        unchanged.append(idx)
    return raw, {
        'schema': 'shape-endpoint-body-receipt-v1', 'sourceBodySha256': digest(source),
        'bodySha256': digest(raw), 'recipeSha256': digest(canonical(recipe)),
        'templateSha256': recipe['template']['sha256'], 'geometry': {
            'mesh': template['mesh'], 'meshIndex': mesh, 'material': template['mutableMaterial'],
            'vertexCount': len(positions), 'changedVertices': int(moved.sum()), 'positionAccessor': attrs['POSITION'],
            'positionSha256': digest(accessor(result, attrs['POSITION']).tobytes()),
            'sourcePositionSha256': digest(accessor(glb, attrs['POSITION']).tobytes()),
            'changedViews': sorted(changed_views), 'maxBasisErrorM': basis_error,
            'maxDisplacementM': float(np.linalg.norm(new_positions - positions, axis=1).max()),
            'weight': weight, 'normalNeighborhoodVertices': len(touched)
        }, 'preserved': {
            'bufferViewsByteIdentical': len(unchanged), 'nodeCount': len(doc['nodes']),
            'skins': len(doc['skins']), 'humanoidBones': len(vrm['humanoid']['humanBones']),
            'positionMorphs': len(targets), 'expressionMaximumDisplacementM': bindings,
            'lookAt': vrm['firstPerson']['lookAtTypeName'],
            'garmentDependencyScope': 'Topology, skin, bind matrices, body geometry, materials and all images retained. Receiver must verify outfit fit against the emitted body.'
        }, 'admission': 'producer-only'
    }


def produce(recipe, output, source_root=ROOT):
    checkout = main_checkout(__file__)
    output = project_output(checkout / output, __file__)
    for name in ('body.vrm', 'receipt.json'):
        project_output(output / name, __file__)
    body, receipt = generate(recipe, source_root)
    files = {'body.vrm': body, 'receipt.json': (json.dumps(receipt, indent=2, allow_nan=False) + '\n').encode()}
    if output.exists():
        require({p.name for p in output.iterdir()} == set(files) and
                all((output / name).read_bytes() == data for name, data in files.items()),
                'Existing destination differs; choose a new directory')
        return receipt
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='.body-', dir=output.parent) as temporary:
        stage = project_output(Path(temporary) / 'package', __file__)
        stage.mkdir()
        for name, data in files.items():
            project_output(stage / name, __file__).write_bytes(data)
        publish_new_directory(stage, output)
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--source-root', type=Path, default=ROOT)
    args = parser.parse_args()
    print(json.dumps(produce(read_json(args.source_root / args.recipe), args.out, args.source_root)))
