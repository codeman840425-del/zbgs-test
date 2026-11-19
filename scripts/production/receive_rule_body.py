"""Reproduce an approved shape recipe, fit its original separates and register the game candidate."""
import argparse
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

sys.dont_write_bytecode = True
import numpy as np

from flow import GLB, ROOT, Validator, read_json, require
from garment_source_mapping import json_bytes
from native_import import digest
from register_texture_outfit import CATALOG, install_profile, unique_fields
from production_paths import project_output
from rule_body_producer import generate


CONTRACTS = Path(__file__).with_name('rule-outfit-templates.json')
IDENTITY = np.eye(4).ravel().tolist()


def rest_triangles(model, mesh_indices):
    """Read indexed triangles only when their skinned mesh is in the reviewed rest space."""
    roots = model.doc['scenes'][model.doc.get('scene', 0)]['nodes']
    blocks = []
    for index in mesh_indices:
        instances = [(i, node) for i, node in enumerate(model.doc['nodes']) if node.get('mesh') == index]
        require(len(instances) == 1, 'Expected exactly one skinned mesh instance')
        i, node = instances[0]
        require('skin' in node and i in roots and node.get('matrix', IDENTITY) == IDENTITY
                and node.get('translation', [0, 0, 0]) == [0, 0, 0]
                and node.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1]
                and node.get('scale', [1, 1, 1]) == [1, 1, 1], 'Unsupported mesh rest space')
        for p in model.doc['meshes'][index]['primitives']:
            require(p.get('mode', 4) == 4, 'Expected indexed triangle geometry')
            indices = np.asarray(model.accessor(p['indices'])).reshape(-1, 3)
            positions = np.asarray(model.accessor(p['attributes']['POSITION']))
            blocks.append(positions[indices])
    return np.concatenate(blocks)


def swept_bounds(before, after, mesh):
    old, new = (rest_triangles(g, [mesh]) for g in (before, after))
    changed = np.any(old != new, axis=(1, 2))
    require(changed.any(), 'Recipe has no new rendered geometry')
    return np.minimum(old[changed], new[changed]).min(1), np.maximum(old[changed], new[changed]).max(1)


def rest_clearance(sweep, tris):
    lo, hi = tris.min(1), tris.max(1)
    lower, upper = sweep
    minimum = float('inf')
    for start in range(0, len(lower), 16):
        a, b = lower[start:start + 16, None], upper[start:start + 16, None]
        gaps = np.maximum(0, np.maximum(lo - b, a - hi))
        minimum = min(minimum, float(np.linalg.norm(gaps, axis=2).min()))
    require(np.isfinite(minimum) and minimum > 0, 'Edited surface reaches garment bounds; separate fit required')
    return minimum


def prepare(recipe, candidate, root=ROOT):
    contract = read_json(CONTRACTS)['templates'].get(recipe.get('template', {}).get('sha256'))
    require(contract is not None, 'Unregistered authoring template')
    expected, production = generate(recipe, root)
    require(candidate == expected, 'Candidate differs from independent recipe replay')
    reader = Validator(root)
    parent = reader.json(CATALOG.as_posix())[contract['parent']]
    require(digest(json_bytes(parent)) == contract['parentProfileSha256']
            and parent['embeddedClothing'] is False and 'bodyCoverage' not in parent
            and production['sourceBodySha256'] == parent['sha256'], 'Unsupported parent outfit or coverage')
    before = GLB(reader.pin(reader.url(parent['url']), parent['sha256']))
    after = GLB(candidate)
    require(before.doc['nodes'] == after.doc['nodes'] and before.bind_by_name() == after.bind_by_name()
            and before.doc['extensions'] == after.doc['extensions'], 'Rest skeleton or VRM mapping differs')
    sweep = swept_bounds(before, after, production['geometry']['meshIndex'])
    ident = 'rule-body-' + production['bodySha256'][:20]
    asset_url = '/assets/' + ident
    manifest_path = reader.url(parent['manifestUrl'])
    garments = json.loads(reader.pin(manifest_path, parent['manifestSha256']))
    items, fits, ids = [], {}, {}
    for role, parent_role in contract['equipmentRoles'].items():
        row = reader.item(garments, parent['ids'][parent_role])
        require(row['restMatrix'] == IDENTITY and row['slot'] == {'pants':'bottom', 'top':'top', 'shoes':'shoes'}[role],
                'Unsupported garment coordinates or slot')
        reader.equipment(row, parent['sha256'], before, manifest_path)
        item_id = ident + '-' + role
        new = dict(row, id=item_id, fitId=item_id + '-fit', compatibleAvatarSha256=production['bodySha256'])
        bound = reader.equipment(new, production['bodySha256'], after, manifest_path)
        model = GLB(reader.pin(reader.url(row['url']), row['sha256'], row['bytes']))
        tris = rest_triangles(model, range(len(model.doc['meshes'])))
        clearance = rest_clearance(sweep, tris)
        if role == 'shoes':
            require(abs(tris[:, :, 1].min() - parent['sourceFloorY']) < 1e-7, 'Shoe sole differs from floor')
        ids[role] = item_id
        fits[role] = dict(bound, sourceItem=row['id'], garmentSha256=row['sha256'],
                          restSweptBoundsLowerDistanceM=clearance)
        items.append(new)
    manifest = json_bytes({'schema': 'zbgs-equipment-v1', 'items': items})
    label = contract['displayLabel'] + ' · ' + str(recipe['weight'])
    profile = {k:parent[k] for k in ('embeddedClothing','baseBodyDisplay','sourceFloorY','seatLayerThickness','workbenchGroup')}
    profile.update(id=ident, label=label, workbenchLabel=label, source=parent['source'], ids=ids,
                   url=asset_url + '/body.vrm', sha256=production['bodySha256'],
                   manifestUrl=asset_url + '/equipment.json', manifestSha256=digest(manifest),
                   defaultOutfit={'index': 0, 'role':'pants', 'bottomRole':'pants',
                                  'equipmentRoles':['top','shoes','pants'], 'label':contract['outfitLabel']},
                   fitStatus='静止几何、蒙皮及鞋底已检查。动作与正式准入见该身体的验收记录。')
    proof = dict(schema='recipe-body-reception-v1', bodyType=ident, bodySha256=profile['sha256'],
                 recipeSha256=production['recipeSha256'], templateSha256=production['templateSha256'],
                 sourceBodySha256=parent['sha256'], manifestSha256=profile['manifestSha256'],
                 affectedTriangles=len(sweep[0]), equipment=fits, inputs=reader.observed,
                 scope='Rest-pose geometry, bind and floor only; formal outfit admission pending.')
    return profile, {'body.vrm':candidate, 'equipment.json':manifest}, proof


def fit_receipt_path(name):
    requested = ROOT / name
    actual = project_output(requested, __file__)
    require(actual == Path(os.path.abspath(requested)) and actual.suffix == '.json'
            and any(actual.is_relative_to(ROOT / folder) for folder in ('output', 'evidence')),
            'Fit receipt must be a local JSON file under output or evidence')
    return actual


def save_fit_receipt(path, proof):
    data = json_bytes(proof)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=path.parent, prefix='.body-fit-') as temp:
            staged = Path(temp) / 'fit.json'
            staged.write_bytes(data)
            try:
                os.link(staged, path)
            except FileExistsError:
                pass
    require(path.is_file() and path.read_bytes() == data, 'Existing fit receipt differs')


def receive(recipe_path, candidate_path, check=False, receipt_path=None):
    receipt = fit_receipt_path(receipt_path) if receipt_path is not None else None
    recipe = json.loads(recipe_path.read_bytes(), object_pairs_hook=unique_fields)
    profile, files, proof = prepare(recipe, candidate_path.read_bytes())
    if receipt is not None:
        # This attests CPU fit only. A failed catalog installation can reuse this
        # immutable evidence, but cannot be mistaken for a successful registration.
        save_fit_receipt(receipt, proof)
    registration = install_profile(ROOT, profile, files, profile['url'].rsplit('/', 1)[0], check)
    return dict(proof, registration=registration)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', type=Path, required=True)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--receipt', type=Path, help='Write or check a body-specific CPU fit receipt inside the project')
    args = parser.parse_args()
    print(json.dumps(receive(args.recipe, args.candidate, args.check, args.receipt), ensure_ascii=True, indent=2))
