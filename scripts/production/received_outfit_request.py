"""Prepare exact style-planner inputs from a received rule body and its default separates."""
import argparse
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

sys.dont_write_bytecode = True

from asset_budget import budget_config, check
from flow import ROOT, Validator, local, require
from garment_source_mapping import json_bytes
from native_import import digest, exact_directory
from production_paths import project_output, publish_new_directory
from receive_rule_body import prepare as fit_rule_body
from register_texture_outfit import CATALOG, checked, install_profile, next_catalog, profile_destinations, unique_fields
from rule_body_producer import canonical
from variant_batch import ID


SLOTS = {'top': 'top', 'shoes': 'shoes', 'pants': 'bottom'}


def received_outfit(recipe, receipt, profiles, reader, budget, candidate=None):
    recipe_bytes = canonical(recipe)
    body_type = receipt['bodyType']
    body_sha = receipt['bodySha256']
    require(receipt['schema'] == 'recipe-body-reception-v1' and body_type == 'rule-body-' + body_sha[:20],
            'Expected an exact rule-body reception receipt')
    require(recipe['schema'] == 'shape-endpoint-body-recipe-v1' and digest(recipe_bytes) == receipt['recipeSha256']
            and recipe['template']['sha256'] == receipt['templateSha256'], 'Recipe differs from received identity')
    profile = profiles.get(body_type)
    require(profile is not None and profile['id'] == body_type and profile['sha256'] == body_sha
            and profile['manifestSha256'] == receipt['manifestSha256'], 'Registered body or equipment identity differs')
    default = profile['defaultOutfit']
    roles = default['equipmentRoles']
    require(default['index'] == 0 and default['role'] == default['bottomRole'] == 'pants'
            and len(roles) == len(SLOTS) and set(roles) == set(profile['ids']) == set(receipt['equipment']) == set(SLOTS)
            and profile['workbenchGroup'] == 'male' and profile['embeddedClothing'] is False
            and 'bodyCoverage' not in profile, 'Expected the received opaque three-piece male outfit')

    body_path = reader.url(profile['url'])
    manifest_url = profile['manifestUrl']
    manifest_path = reader.url(manifest_url)
    if candidate is None:
        reader.pin(body_path, body_sha)
        model = local(reader.root, body_path)
        manifest = json.loads(reader.pin(manifest_path, profile['manifestSha256']))
    else:
        model, package = candidate
        manifest = json.loads(package['equipment.json'])
    require(manifest['schema'] == 'zbgs-equipment-v1'
            and len(manifest['items']) == len(SLOTS), 'Expected the three-piece receiving manifest')
    garments = []
    assets = [(body_path, model, 'body', body_sha)]
    for role in roles:
        item = reader.item(manifest, profile['ids'][role])
        fit = receipt['equipment'][role]
        require(item['slot'] == SLOTS[role] and item['compatibleAvatarSha256'] == fit['fitSha256'] == body_sha
                and item['id'] == fit['id'] and item['sha256'] == fit['garmentSha256']
                and fit['restSweptBoundsLowerDistanceM'] > 0 and item['preserveOriginalBody'] is True
                and item['requiresRawSkeleton'] is True, 'Receiver fit or coverage differs: ' + role)
        require(ID.fullmatch(item['styleId']) and type(item['version']) is int and item['version'] > 0,
                'Expected a registered equipment style and numeric version')
        asset = reader.url(item['url'])
        reader.pin(asset, item['sha256'], item['bytes'])
        assets.append((asset, local(reader.root, asset), 'garment', item['sha256']))
        garments.append(item)
    require(len({item['styleId'] for item in garments}) == len(SLOTS), 'Expected distinct default equipment styles')

    budgets = []
    for asset, model, kind, sha in assets:
        measured = check(model, kind, budget)
        require(measured['sha256'] == sha, 'Asset changed during the budget readback')
        budgets.append({'path': asset, 'class': kind, 'sha256': sha, 'status': measured['status'],
                        'violations': measured['violations']})
    return profile, garments, recipe_bytes, budgets


def outfit_payload(inputs, output, reader, profiles):
    budget = budget_config(local(ROOT, 'scripts/production/asset-budgets-v1.json'), 'm2-technical-v1')
    matrix = {'schema': 'zbgs-style-variant-matrix-v1', 'matrixVersion': 'received-outfit-v1', 'styles': []}
    request = {'schema': 'zbgs-style-variant-batch-request-v1', 'batchId': 'received-rule-outfit-v1', 'items': []}
    styles, budgets, files = {}, {}, {}
    for recipe, receipt, candidate in inputs:
        body_type = receipt['bodyType']
        require(body_type not in budgets, 'Duplicate received body: ' + body_type)
        profile, garments, raw_recipe, budgets[body_type] = received_outfit(recipe, receipt, profiles, reader, budget, candidate)
        recipe_file = 'recipes/' + body_type + '.json'
        files[recipe_file] = raw_recipe
        if candidate is not None:
            files['fits/' + body_type + '.json'] = json_bytes(receipt)
        budget_status = ('reject-static-over-budget' if any(asset['violations'] for asset in budgets[body_type])
                         else 'within-static-individual-assets')
        refs, pins = [], []
        for item in garments:
            style_id = item['styleId']
            version = 'v' + str(item['version'])
            style = styles.setdefault(style_id, {'styleId': style_id, 'label': item['name'], 'variants': []})
            member = profile['manifestUrl'] + '#' + item['id']
            manifest_digest = profile['manifestSha256']
            style['variants'].append({
                'bodyType': body_type, 'bodySha256': profile['sha256'], 'bodyAsset': profile['url'],
                'variantVersion': version, 'recipeSource': (output / recipe_file).relative_to(reader.root).as_posix(),
                'recipeSha256': receipt['recipeSha256'], 'resourceManifest': member,
                'resourceManifestSha256': manifest_digest, 'fitManifest': member + '.bindings',
                'fitManifestSha256': manifest_digest, 'coverageManifest': member + '.preserveOriginalBody',
                'coverageManifestSha256': manifest_digest, 'status': 'candidate', 'budgetStatus': budget_status,
                'limits': ['Rest-pose fit and skin bindings. Whole-outfit review pending.'],
            })
            refs.append({'styleId': style_id, 'variantVersion': version})
            pins.append({part: item[part] for part in ('id', 'slot', 'sha256')})
        stable_id = 'rule-male-' + body_type.removeprefix('rule-body-')
        request['items'].append({
            'stableId': stable_id, 'bodyType': body_type, **refs[0], 'matchingStyles': refs,
            'identity': {'id': stable_id, 'name': f"规则男体 {recipe['weight']}", 'gender': 'male'},
            'outfit': {'role': profile['defaultOutfit']['role'], 'equipment': pins},
        })
    matrix['styles'] = list(styles.values())
    files.update({'matrix.json': json_bytes(matrix), 'request.json': json_bytes(request),
                  'budget.json': json_bytes({'schema': 'received-outfit-asset-budget-v1', 'bodies': budgets})})
    return files


def check_package(output, files):
    for name in files:
        checked(output / name)
    if output.exists():
        exact_directory(output, files)


def publish_package(output, files):
    check_package(output, files)
    if output.exists():
        return 'reused-identical'
    parent = ROOT if output.parent == ROOT else checked(output.parent)
    parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=parent, prefix='.received-outfit-') as scratch:
        staged = Path(scratch) / 'batch'
        for name, raw in files.items():
            path = checked(staged / name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
        try:
            publish_new_directory(staged, checked(output))
        except FileExistsError:
            check_package(output, files)
            return 'reused-identical'
    return 'prepared'


def prepare(pairs, output):
    output = project_output(ROOT / output, __file__)
    reader = Validator(ROOT)
    profiles = reader.json(CATALOG.as_posix())
    inputs = [(reader.json(recipe), reader.json(receipt), None) for recipe, receipt in pairs]
    return publish_package(output, outfit_payload(inputs, output, reader, profiles))


def import_outfits(pairs, output, target_root):
    root = ROOT if ROOT / target_root == ROOT else checked(ROOT / target_root)
    output = checked(root / output)
    require(output != root and output.is_relative_to(root) and not output.is_relative_to(root / 'prototype'),
            'Import request output must be inside the target, outside prototype')
    catalog = checked(root / CATALOG)
    previous = catalog.read_bytes()
    projected = previous
    reader = Validator(root)
    inputs, registrations, seen = [], [], set()

    for recipe_name, candidate_name in pairs:
        recipe = json.loads((ROOT / recipe_name).read_bytes(), object_pairs_hook=unique_fields)
        model = ROOT / candidate_name
        profile, package, proof = fit_rule_body(recipe, model.read_bytes())
        body_type = profile['id']
        require(body_type not in seen, 'Duplicate received body: ' + body_type)
        seen.add(body_type)
        asset_url = profile['url'].rsplit('/', 1)[0]
        _, _, destination = profile_destinations(root, asset_url, package)
        projected = next_catalog(projected, profile)
        if destination.exists():
            exact_directory(destination, package)
        inputs.append((recipe, proof, (model, package)))
        registrations.append((profile, package, asset_url))

    files = outfit_payload(inputs, output, reader, json.loads(projected, object_pairs_hook=unique_fields))
    check_package(output, files)
    for profile, package, asset_url in registrations:
        install_profile(root, profile, package, asset_url)
    return {'status': publish_package(output, files), 'bodyTypes': [proof['bodyType'] for _, proof, _ in inputs]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--pair', action='append', nargs=2, metavar=('RECIPE', 'RECEPTION'),
                        help='Project-relative recipe and receiver JSON files')
    source.add_argument('--import', dest='imports', action='append', nargs=2, metavar=('RECIPE', 'CANDIDATE_VRM'),
                        help='Recompute, register and prepare the complete batch')
    parser.add_argument('--target-root', type=Path, help='Import into an in-project target with the original outfit assets')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        require(args.imports or args.target_root is None, '--target-root is available with --import only')
        result = (import_outfits(args.imports, args.output, args.target_root or ROOT)
                  if args.imports else {'status': prepare(args.pair, args.output)})
        print(json.dumps(result))
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({'status': 'rejected', 'reason': str(error)}, ensure_ascii=True), file=sys.stderr)
        sys.exit(1)
