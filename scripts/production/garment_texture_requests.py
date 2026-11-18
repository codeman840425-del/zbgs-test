"""Plan the two garment-texture D02 requests and verify their returned records."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import urljoin


CHECKOUT = Path(__file__).resolve().parents[2]
PUBLIC = CHECKOUT / 'prototype/public'
FITS = CHECKOUT / 'evidence/m2-garment-basecolor-release-v1/runtime-fits.json'
CREATE_OUTPUT = CHECKOUT / 'evidence/m2-garment-texture-game-v1/create-near.batch.json'
BODIES = {'male': 'source-male-ab9a-release-v1', 'female': 'female'}
SCHEMA = 'character-production-request-v1'
PHASES = {'near': ('pants', 'top'), 'far': ('pants-top-far', 'topFar')}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def node(source, data, args=()):
    result = subprocess.run(
        ['node', '--input-type=module', '-e', source, *args],
        cwd=CHECKOUT, input=json.dumps(data), text=True, encoding='utf-8',
        capture_output=True, check=False,
    )
    require(result.returncode == 0, result.stderr.strip())
    return json.loads(result.stdout)


def project_paths(paths):
    # Match the write boundary used by the D02 CLI, including worktrees,
    # dangling links and Windows device/stream names.
    values = node("""
        import { productionRoot, projectOutput } from './scripts/project-output.cjs';
        const root = await productionRoot();
        console.log(JSON.stringify(await Promise.all(process.argv.slice(1)
          .map(value => projectOutput(value, root)))));
    """, None, [str(path.absolute()) for path in paths])
    return [Path(value) for value in values]


def read_json(path):
    return json.loads(path.read_bytes())


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def public_bytes(url):
    require(url.startswith('/assets/'), f'Expected a local asset URL: {url}')
    candidate = (PUBLIC / url[1:]).resolve(strict=True)
    require(candidate.is_relative_to(PUBLIC), f'Asset escapes public directory: {url}')
    return candidate.read_bytes()


def load_fits():
    report = read_json(FITS)
    require(report['schema'] == 'garment-basecolor-runtime-fits-v1', 'Invalid runtime fit evidence')
    profiles = node("""
        import { foundationProfile } from './prototype/src/foundation-profiles.js';
        import { outfitSelection } from './prototype/src/outfit-selection.js';
        const profiles = process.argv.slice(1).map(bodyType => {
          const profile = foundationProfile(bodyType);
          const looks = profile.outfits.filter(row => ['pants', 'pants-top-far'].includes(row.role))
            .map(row => outfitSelection(profile, row.index));
          return [bodyType, { profile, looks }];
        });
        console.log(JSON.stringify(Object.fromEntries(profiles)));
    """, None, BODIES.values())
    output = {}
    for sex, body in BODIES.items():
        profile, looks = (profiles[body][key] for key in ('profile', 'looks'))
        proof = report['items'][profile['ids']['topFar']]
        sha = profile['sha256']
        require(proof['bodySha256'] == sha == digest(public_bytes(profile['url'])),
                f'{sex}: body identity does not match the verified fit')
        entries = {}
        catalogs = [{'url': profile['manifestUrl'], 'sha256': profile.get('equipmentManifestSha256')},
                    *profile['additionalEquipmentManifests']]
        for catalog in catalogs:
            raw = public_bytes(catalog['url'])
            if catalog['sha256']:
                require(digest(raw) == catalog['sha256'], f'{sex}: equipment catalog SHA mismatch')
            source = json.loads(raw)
            require(source['schema'] == 'zbgs-equipment-v1', f'{sex}: invalid equipment catalog')
            for entry in source['items']:
                require(entry['id'] not in entries, f'Duplicate equipment ID: {entry["id"]}')
                entries[entry['id']] = (entry, catalog)
        outfits = {}
        for phase, (role, top_role) in PHASES.items():
            (look,) = [look for look in looks if look['selection']['role'] == role]
            require(look['roles'] == [top_role, 'shoes', 'pants'],
                    f'{sex}/{phase}: unexpected outfit equipment roles')
            resources = {}
            for key, identifier in zip(look['roles'], look['ids'], strict=True):
                entry, catalog = entries[identifier]
                slot = {'top': 'top', 'topFar': 'top', 'pants': 'bottom', 'shoes': 'shoes'}[key]
                require(entry['compatibleAvatarSha256'] == sha and entry['slot'] == slot,
                        f'{identifier}: slot or exact body fit differs')
                raw = public_bytes(urljoin(catalog['url'], entry['url']))
                require(len(raw) == entry['bytes'] and digest(raw) == entry['sha256'],
                        f'{identifier}: GLB bytes differ from the manifest')
                resources[key] = entry
            top = resources[top_role]
            require(top['id'] == proof[phase]['id'] and sha == proof[phase]['fitSha256'],
                    f'{sex}/{phase}: upper-garment fit differs from evidence')
            outfits[phase] = {
                'index': look['selection']['index'], 'role': role,
                'manifestUrl': profile['manifestUrl'], 'resources': resources,
            }
        far = outfits['far']['resources']['topFar']
        require(far['sha256'] == proof['glbSha256'] and
                entries[far['id']][1]['sha256'] == proof['manifestSha256'],
                f'{sex}: 1K garment bytes or catalog differ from evidence')
        if sex == 'female':
            (coverage,) = [item['descriptor'] for item in profile['additionalBodyCoverage']
                           if item['role'] == 'topFar']
            require(digest(public_bytes(coverage['url'])) == coverage['sha256'] == proof['coverage']['sha256'],
                    'Female 1K body coverage differs from the verified fit')
        output[sex] = {'base': {'bodyType': body, 'sha256': sha}, **outfits}
    return output


def identity(sex):
    return {'id': f'garment-texture-{sex}', 'name': f'Garment texture {sex}', 'gender': sex}


def request(operation, fit, phase, **fields):
    look = fit[phase]
    selection = {
        'bodySha256': fit['base']['sha256'], 'role': look['role'],
        'equipment': [{key: entry[key] for key in ('id', 'slot', 'sha256')}
                      for entry in look['resources'].values()],
    }
    return {'schema': SCHEMA, 'operation': operation, **fields,
            'edits': [{'domain': 'outfit', 'selection': selection}]}


def verify_envelopes(records):
    node("""
        import { readFileSync } from 'node:fs';
        import { canonicalJson, validateCharacterRecord } from './prototype/src/character-record.js';
        import { deriveCharacterResourceIdentities } from './prototype/src/character-runtime-record.js';
        import { validateGarmentMaterials } from './prototype/src/garment-material-record.js';
        for (const record of JSON.parse(readFileSync(0, 'utf8'))) {
          await validateCharacterRecord(record, { validationCallback: row => {
            const { appearanceRecipe, liveAccessories, equipmentMaterials, nativeHairCenter } = row;
            validateGarmentMaterials({profile: {sha256: appearanceRecipe.base.sha256}},
              appearanceRecipe, equipmentMaterials);
            const expected = deriveCharacterResourceIdentities(appearanceRecipe, liveAccessories,
              equipmentMaterials, nativeHairCenter);
            if (canonicalJson(expected) !== canonicalJson(row.resourceIdentities))
              throw Error('Resource identities differ from the final record');
            return {status: 'pending'};
          }});
        }
        console.log('true');
    """, records)


def verify_look(record, fit, sex, phase):
    recipe = record['appearanceRecipe']
    require(record['identity']['id'] == identity(sex)['id'], f'{sex}: unexpected character ID')
    require(recipe['base'] == fit['base'], f'{sex}: unexpected body')
    require(recipe['equipment'] == fit[phase], f'{sex}: {phase} equipment or binding differs')


def read_near(path, fits):
    records = read_json(path)
    require(isinstance(records, list) and len(records) == len(BODIES), 'Expected two near records')
    verify_envelopes(records)
    by_id = {record['identity']['id']: record for record in records}
    require(set(by_id) == {identity(sex)['id'] for sex in BODIES}, 'Expected the two near character IDs')
    result = {sex: by_id[identity(sex)['id']] for sex in BODIES}
    for sex, record in result.items():
        verify_look(record, fits[sex], sex, 'near')
    return result


def unchanged_fields(value, excluded):
    return json.dumps({key: item for key, item in value.items() if key not in excluded}, sort_keys=True)


def verify_edit(before, after, fit, sex):
    verify_look(after, fit, sex, 'far')
    require(after['revision'] == before['revision'] + 1, f'{sex}: revision must increase by one')
    require(unchanged_fields(before, {'revision', 'updatedAt', 'integrity', 'appearanceRecipe',
                                    'resourceIdentities', 'equipmentMaterials'}) ==
            unchanged_fields(after, {'revision', 'updatedAt', 'integrity', 'appearanceRecipe',
                                   'resourceIdentities', 'equipmentMaterials'}),
            f'{sex}: identity, creation, provenance or accessory fields changed')
    require(unchanged_fields(before['appearanceRecipe'], {'equipment'}) ==
            unchanged_fields(after['appearanceRecipe'], {'equipment'}),
            f'{sex}: appearance changed beyond the outfit')
    old_top = before['appearanceRecipe']['equipment']['resources']['top']['id']
    new_top = after['appearanceRecipe']['equipment']['resources']['topFar']['id']
    for key in ('shoes', 'pants'):
        require(before['appearanceRecipe']['equipment']['resources'][key] ==
                after['appearanceRecipe']['equipment']['resources'][key],
                f'{sex}: {key} resource changed')
    old_materials = {row['equipmentId']: row for row in before['equipmentMaterials']['selections']}
    new_materials = {row['equipmentId']: row for row in after['equipmentMaterials']['selections']}
    require(old_materials.pop(old_top)['selection'] is None and
            new_materials.pop(new_top)['selection'] is None and old_materials == new_materials,
            f'{sex}: garment material selections changed beyond the original-texture upper garment')


def write_fresh(path, value):
    with path.open('xb') as stream:
        stream.write((json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest='action', required=True)
    create = actions.add_parser('create', help='write one batch-create-v1 request')
    create.add_argument('--out', type=Path, default=CREATE_OUTPUT)
    edit = actions.add_parser('edit', help='write D02 edit requests in a new directory')
    merge = actions.add_parser('merge', help='verify two D02 single-record results and write an array')
    for action in (edit, merge):
        action.add_argument('--near', type=Path, required=True)
        action.add_argument('--out', type=Path, required=True)
    for sex in BODIES:
        merge.add_argument(f'--{sex}', type=Path, required=True)
    args = parser.parse_args(argv)
    paths = [args.out]
    if args.action != 'create':
        paths.append(args.near)
    if args.action == 'merge':
        paths.extend(getattr(args, sex) for sex in BODIES)
    out, *sources = project_paths(paths)
    require(not out.exists() and out.parent.is_dir(), f'Expected a new path with an existing parent: {out}')
    fits = load_fits()
    if args.action == 'create':
        requests = [request('create', fits[sex], 'near', identity=identity(sex), bodyType=body)
                    for sex, body in BODIES.items()]
        write_fresh(out, {'schema': 'character-production-batch-create-v1', 'requests': requests})
    else:
        near = read_near(sources[0], fits)
        if args.action == 'edit':
            out.mkdir()
            for sex in BODIES:
                write_fresh(out / f'edit-{sex}.request.json',
                            request('edit', fits[sex], 'far', record=near[sex]))
        else:
            results = {sex: read_json(path) for sex, path in zip(BODIES, sources[1:], strict=True)}
            verify_envelopes(list(results.values()))
            for sex, record in results.items():
                verify_edit(near[sex], record, fits[sex], sex)
            write_fresh(out, list(results.values()))
    print(out)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError) as error:
        sys.exit(str(error))
