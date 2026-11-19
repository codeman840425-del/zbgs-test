"""Build the short-sleeved studio overshirt from the pinned native shirt block."""
import argparse
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB, Validator, require
from native_mesh_budget import encode
from production_paths import main_checkout, project_output


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def cut(p, recipe):
    q = p.copy()
    x, y, z = p.T
    hem = smooth((1.12 - y) / 0.11) * recipe['hemRadialEase']
    q[:, 0] += x * hem
    q[:, 2] += (z + .012) * hem
    cuff = smooth((np.abs(x) - .19) / .075)
    q[:, 0] += np.sign(x) * cuff * recipe['sleeveExtensionMetres']
    return q


def cut_normals(p, n, recipe):
    # Transform the authored split normals by the local deformation gradient.
    h = .00001
    axes = np.eye(3) * h
    gradient = np.stack([(cut(p + a, recipe) - cut(p - a, recipe)) / (2*h) for a in axes], axis=2)
    result = np.linalg.solve(gradient.transpose(0, 2, 1), n[..., None])[..., 0]
    return result / np.linalg.norm(result, axis=1)[:, None]


def print_panels(points, palette):
    """Pattern in native metre coordinates; garment front faces negative Z."""
    x, y, z = points.T
    ax = np.abs(x)
    front = z < -.036
    color = np.tile(palette['twill'], (len(points), 1))

    # Shoulder yoke, narrow contrast piping, underarm inserts and rib cuffs.
    yoke = 1.361 + np.minimum(ax, .16) * .38
    color[y > yoke] = palette['yoke']
    color[(y > yoke - .006) & (y <= yoke)] = palette['tape']
    color[(y < yoke - .006) & (ax > .095 + .026 * smooth((y-1.11) / .20))] = palette['side']
    color[(ax > .256) | (y < 1.021)] = palette['rib']
    color[(ax > .248) & (ax < .254)] = palette['tape']
    color[(y > 1.023) & (y < 1.025)] = palette['stitch']

    # Central snap tape, two angled chest pocket welts, a stitched equipment tag.
    color[front & (ax < .010)] = palette['rib']
    color[front & (ax > .0076) & (ax < .0088)] = palette['stitch']
    for level in (1.070, 1.126, 1.182, 1.238, 1.294, 1.350, 1.406):
        color[front & (x*x + (y-level)**2 < .0029**2)] = palette['stud']
    pocket_x = (ax >= .030) & (ax <= .100)
    pocket_y = 1.326 + .10 * (ax - .030)
    base = 1.230 + .19 * np.abs(ax-.065)
    pocket = front & pocket_x & (y < pocket_y) & (y > base)
    color[pocket] = palette['welt']
    color[pocket & (y > pocket_y-.014)] = palette['rib']
    color[pocket & (y < pocket_y-.005) & (y > pocket_y-.008)] = palette['tape']
    color[pocket & ((ax < .032) | (ax > .098) | (y < base+.002))] = palette['stitch']
    color[front & (x > -.086) & (x < -.050) & (y > 1.280) & (y < 1.294)] = palette['rib']
    for k in range(3):
        color[front & (x > -.081 + k*.009) & (x < -.077 + k*.009)
              & (y > 1.282) & (y < 1.286 + k*.003)] = palette['yoke']
    return color


def atlas(model, recipe, position, normal, uv, triangles):
    n = recipe['atlasSize']
    palette = {name: np.asarray(value) for name, value in recipe['palette'].items()}
    view = model.doc['bufferViews'][model.doc['images'][0]['bufferView']]
    start = view['byteOffset']
    original = np.asarray(Image.open(io.BytesIO(model.binary[start:start+view['byteLength']])).convert('RGB'))
    require(original.shape == (n, n, 3), 'Unexpected source texture dimensions')
    texels = uv * n - .5
    fabric = np.zeros_like(original)
    covered = np.zeros((n, n), dtype=bool)
    for tri in triangles:
        a, b, c = texels[tri]
        edge = np.stack((b-a, c-a), axis=1)
        if abs(np.linalg.det(edge)) < 1e-7:
            continue
        x0, y0 = np.maximum(np.ceil(texels[tri].min(axis=0)).astype(int), 0)
        x1, y1 = np.minimum(np.floor(texels[tri].max(axis=0)).astype(int), n-1)
        ys, xs = np.mgrid[y0:y1+1, x0:x1+1]
        grid = np.stack((xs.ravel(), ys.ravel()), axis=1)
        bc = (grid - a) @ np.linalg.inv(edge).T
        inside = (bc.min(axis=1) >= -1e-7) & (bc.sum(axis=1) <= 1+1e-7)
        if not inside.any():
            continue
        xx, yy = grid[inside].T
        w = np.column_stack((1-bc[inside].sum(axis=1), bc[inside]))
        colors = print_panels(w @ position[tri], palette)
        # Retain a little of the native painted folds and directional cloth relief.
        luminance = original[yy, xx].mean(axis=1) / 255
        normals = w @ normal[tri]
        lighting = .85 + .20*luminance + .070*normals[:, 1] - .032*normals[:, 0]
        fabric[yy, xx] = np.rint(colors * lighting[:, None]).clip(0, 255)
        covered[yy, xx] = True
    # Extrude the atlas islands so bilinear reads across a seam stay on fabric.
    nearest = distance_transform_edt(~covered, return_distances=False, return_indices=True)
    image = Image.fromarray(fabric[tuple(nearest)])
    result = io.BytesIO()
    image.save(result, format='PNG', compress_level=9)
    return result.getvalue()


def make_garment(model, texture_source, recipe):
    doc = copy.deepcopy(model.doc)
    mesh, = doc['meshes']
    shirt = mesh['primitives'][recipe['sourceGarmentPrimitive']]
    p = np.asarray(model.accessor(shirt['attributes']['POSITION']))
    n = np.asarray(model.accessor(shirt['attributes']['NORMAL']))
    uv = np.asarray(model.accessor(shirt['attributes']['TEXCOORD_0']))
    triangles = np.asarray(model.accessor(shirt['indices'])).reshape(-1, 3)
    cloth = cut(p, recipe).astype('<f4')
    normals = cut_normals(p, n, recipe).astype('<f4')
    png = atlas(texture_source, recipe, p, n, uv, triangles)
    mesh['primitives'] = [shirt]
    doc['nodes'][0]['name'] = mesh['name'] = recipe['id']
    doc['materials'] = doc['materials'][:1]
    doc['materials'][0]['name'] = 'Studio overshirt color-block twill'
    doc['materials'][0]['alphaMode'] = 'OPAQUE'
    doc['materials'][0].pop('alphaCutoff', None)
    doc['images'] = [{'name': 'Studio overshirt twill and trim', 'mimeType': 'image/png', 'bufferView': 6}]
    doc['textures'] = doc['textures'][:1]
    doc['asset']['generator'] = 'gamemake studio overshirt v1'
    doc['extras'] = {
        'sourceSha256': model.doc['extras']['sourceSha256'],
        'sourceProvenance': model.doc['extras']['sourceProvenance'],
        'parentGarmentSha256': recipe['sourceGarment'][1], 'garmentId': recipe['id']
    }
    doc['accessors'] = doc['accessors'][:6] + doc['accessors'][-1:]
    doc['accessors'][6]['bufferView'] = 7
    doc['skins'][0]['inverseBindMatrices'] = 6
    for idx, values in ((2, cloth), (1, normals)):
        doc['accessors'][idx].update(min=values.min(axis=0).tolist(), max=values.max(axis=0).tolist())
    blob = bytearray()
    doc['bufferViews'] = []
    overrides = {2: cloth.tobytes(), 1: normals.tobytes(), 6: png}
    for idx in (0, 1, 2, 3, 4, 5, 6, 14):
        view = model.doc['bufferViews'][idx]
        start = view['byteOffset']
        data = overrides.get(idx, model.binary[start:start+view['byteLength']])
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)})
        blob.extend(data)
        blob.extend(bytes(-len(blob) % 4))
    doc['buffers'] = [{'byteLength': len(blob)}]
    return encode(doc, blob)


def verify(source, garment, body, entry):
    binds = garment.bind_by_name()
    require(source.doc['nodes'][1:] == garment.doc['nodes'][1:], 'Changed raw joint hierarchy')
    require(source.bind_by_name() == binds, 'Changed inverse binds')
    body_binds = body.bind_by_name()
    declared = {b['targetRawBone']: tuple(b['inverseBindMatrix']) for b in entry['bindings']}
    require(binds == declared and all(body_binds[k] == v for k, v in binds.items()), 'Parent body fit differs')
    require(len(garment.doc['meshes'][0]['primitives']) == len(garment.doc['images']) == 1, 'Unexpected garment parts')
    for idx in (0, 3, 4, 5):
        require(source.accessor(idx) == garment.accessor(idx), 'Changed UVs, joints, weights or triangle indices')
    old = np.asarray(source.accessor(2))
    new = np.asarray(garment.accessor(2))
    require(np.isfinite(new).all() and np.isfinite(garment.accessor(1)).all(), 'Nonfinite output')
    idx = np.asarray(garment.accessor(5)).reshape(-1, 3)
    def area(points):
        a, b, c = points[idx].transpose(1, 0, 2)
        return np.cross(b-a, c-a)
    require(np.all((area(old)*area(new)).sum(axis=1) > 0), 'Degenerate or flipped cut')
    delta = np.linalg.norm(new-old, axis=1)
    return {'vertices': len(new), 'triangles': len(idx), 'changedPositionRows': int(np.count_nonzero(delta)),
            'maxPositionChangeMetres': float(delta.max()), 'weightedRawBones': list(binds),
            'identicalSourceUvsWeightsJointsIndices': True, 'exactParentInverseBinds': True}


def publish(target, data, check):
    if target.exists() or check:
        require(target.is_file() and target.read_bytes() == data, 'Pinned output missing or different: '+target.name)
        return
    # Publish only complete, previously absent files; an interrupted build is safe to retry.
    with NamedTemporaryFile(dir=target.parent, prefix='.build-', delete=False) as temp:
        tmp = Path(temp.name)
        try:
            temp.write(data)
            temp.close()
            try:
                os.link(tmp, target)
            except FileExistsError:
                require(target.read_bytes() == data, 'Concurrent result differs')
        finally:
            tmp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Rebuild in memory and check both existing outputs')
    args = parser.parse_args()
    rel = Path('assets-source/shared-male-studio-top-v1')
    output = main_checkout(__file__) / rel
    # Reject redirected output directories and files, even within the main checkout.
    destinations = [output / name for name in ('shared-male-studio-top-v1.glb', 'receipt.json')]
    for target in destinations:
        require(project_output(target, __file__) == target, 'Redirected garment output')
    recipe = json.loads((HERE / 'recipe.json').read_bytes())
    require(recipe['id'] == rel.name and recipe['sourceGarmentPrimitive'] == 0, 'Unexpected studio garment recipe')
    pins = Validator(ROOT)
    source = GLB(pins.pin(*recipe['sourceGarment']))
    body = GLB(pins.pin(*recipe['parentBody']))
    fit, = (item for item in json.loads(pins.pin(*recipe['sourceFit']))['items'] if item['id'] == 'm1b-uniform-top')
    require(fit['compatibleAvatarSha256'] == recipe['parentBody'][1] and fit['sha256'] == recipe['sourceGarment'][1],
            'Source equipment catalog mismatch')
    require(source.doc['extras']['sourceProvenance'] == json.loads(pins.pin(*recipe['sourceReceipt'])), 'Provenance differs')
    pins.pin(*recipe['sourceTerms'])
    texture_source = GLB(pins.pin(*recipe['sourceTextureGarment']))
    binary = make_garment(source, texture_source, recipe)
    stats = verify(source, GLB(binary), body, fit)
    receipt = {'id': recipe['id'], 'sha256': hashlib.sha256(binary).hexdigest(), 'bytes': len(binary),
               'slot': recipe['slot'], 'parentBodySha256': recipe['parentBody'][1], 'inputPins': pins.observed,
               'sourceEquipmentId': fit['id'], 'readback': stats}
    publish(destinations[0], binary, args.check)
    publish(destinations[1], (json.dumps(receipt, indent=2)+'\n').encode(), args.check)
    print(receipt['id'], receipt['sha256'], receipt['bytes'])


if __name__ == '__main__':
    main()
