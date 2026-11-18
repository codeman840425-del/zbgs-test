"""Reproduce the corrected 7586 candidate catalog and its existing style registration."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

from verify import check

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB, Validator, local, require
from register_equipment_style import MATRIX, register
from variant_batch import publish_plan
from variant_matrix import validate_matrix_files

PUBLIC_URL = '/assets/native-crew-template-v1/'
BASE_CATALOG = '/assets/native-male-factory-v1/native-vroid-male-equipment-v1/generated/equipment.json'
BASE_CATALOG_SHA = 'e412188206670c9bf84b7f2019aab8a60778a2d0f6ac29df9d92091fd18d80a8'


def encode(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode('utf-8')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def prepare(args):
    entry_path, fit_path, lock_path = (p.resolve() for p in (args.entry,args.fit,args.source_lock))
    lock_bytes = lock_path.read_bytes()
    lock = json.loads(lock_bytes)
    check(lock['producerInputs'], ROOT)
    check(lock['editableInput'], lock_path.parent)
    check(lock['generatedFiles'], lock_path.parent)
    validator = Validator(ROOT)

    def locked(path):
        member = path.relative_to(lock_path.parent).as_posix()
        return validator.pin(path.relative_to(ROOT).as_posix(), lock['generatedFiles'][member])

    entry = json.loads(locked(entry_path))
    fit_bytes = locked(fit_path)
    fit = json.loads(fit_bytes)
    name = entry['url']
    require(Path(name).name == name and name.endswith('.glb'), 'Expected a local corrected GLB')
    model = locked(local(entry_path.parent, name))
    require(len(model) == entry['bytes'] and digest(model) == entry['sha256'], 'GLB differs from entry')
    expected_fit = {'id':entry['fitId'], 'garmentId':entry['id'], 'garmentSha256':entry['sha256'],
                    'baseAvatarSha256':entry['compatibleAvatarSha256'], 'styleId':entry['styleId'],
                    'slot':entry['slot'], 'version':entry['version'], 'bodyCoverageMasks':[],
                    'pairingStatus':entry['pairingStatus'], 'runtimeAccepted':False}
    require(all(k in fit and fit[k] == v for k,v in expected_fit.items()), 'Fit differs from corrected equipment')
    require(entry['slot'] == 'socks' and entry['preserveOriginalBody'] is True and
            fit['pairingStatus']['shoes'] == 'known-visible-sock-over-shoe-pixels; candidate-only',
            'Expected the recorded candidate with its shoe-side limitation')
    body = GLB(validator.pin(fit['sourceBodyPath'], fit['baseAvatarSha256']))
    validator.equipment(entry, fit['baseAvatarSha256'], body, entry_path.relative_to(ROOT).as_posix())
    base = json.loads(validator.pin(validator.url(args.pairing_catalog), args.pairing_sha256))
    require(base['schema'] == 'zbgs-equipment-v1', 'Expected the original equipment catalog')
    declared = [(p['id'], p['sha256']) for refs in entry['pairedWith'].values() for p in refs]
    fitted = [(p['id'], p['sha256']) for p in fit['pairingCandidates']]
    require(sorted(declared) == sorted(fitted) and len(set(p[0] for p in fitted)) == len(fitted),
            'Fit pairings differ from equipment')
    for p in fit['pairingCandidates']:
        partner = validator.item(base, p['id'])
        require(partner['compatibleAvatarSha256'] == fit['baseAvatarSha256'] and partner['sha256'] == p['sha256'],
                'Original catalog partner differs: ' + p['id'])
        validator.pin(p['path'], p['sha256'], partner['bytes'])

    catalog = encode({'schema':'zbgs-equipment-v1',
                      'pairingCatalog':{'url':args.pairing_catalog,'sha256':args.pairing_sha256},
                      'items':[dict(entry,url=PUBLIC_URL + name)]})
    fit_ref = fit_path.relative_to(ROOT).as_posix()
    row = {'bodyType':'native-male-7586-v1', 'bodySha256':fit['baseAvatarSha256'],
           'resourceManifest':PUBLIC_URL+'equipment.json#'+entry['id'], 'resourceManifestSha256':digest(catalog),
           'fitManifest':fit_ref, 'fitManifestSha256':digest(fit_bytes),
           'coverageManifest':fit_ref+'#bodyCoverageMasks', 'coverageManifestSha256':digest(fit_bytes),
           'recipeSource':lock_path.relative_to(ROOT).as_posix(), 'recipeSha256':digest(lock_bytes),
           'status':'candidate', 'variantVersion':'v'+str(entry['version']),
           'admissionBlockers':['visibleSockOverShoe','wholeOutfitRuntimeAdmission'],
           'limits':['Internal technical fit for the original 7586 shorts and shoes only.',
                     'CPU rest and ankle poses show visible sock pixels over the shoe sides.']}
    matrix = json.loads(args.matrix.read_bytes())
    style, = [s for s in matrix['styles'] if s['styleId'] == entry['styleId']]
    merged = register(matrix, dict(style,variants=[row]))
    return {name:model, 'equipment.json':catalog}, matrix, merged, row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--entry', type=Path, default=HERE/'corrected/entry.json')
    parser.add_argument('--fit', type=Path, default=HERE/'corrected/fit.json')
    parser.add_argument('--source-lock', type=Path, default=HERE/'source-lock.json')
    parser.add_argument('--pairing-catalog', default=BASE_CATALOG, help='Public URL of the original equipment catalog')
    parser.add_argument('--pairing-sha256', default=BASE_CATALOG_SHA)
    parser.add_argument('--matrix', type=Path, default=MATRIX)
    parser.add_argument('--output', type=Path, help='Write catalog, GLB and merged matrix in a fresh directory')
    args = parser.parse_args()
    files, matrix, merged, row = prepare(args)
    if args.output is None:
        published = ROOT / ('prototype/public'+PUBLIC_URL)
        for name,data in files.items():
            require((published/name).read_bytes() == data, 'Published bytes differ: '+name)
        require(matrix == merged, 'Expected the exact candidate row in the registered matrix')
        errors = validate_matrix_files(merged, ROOT)
        require(not errors, '; '.join(errors))
    else:
        output = args.output.resolve()
        require(output.is_relative_to(ROOT) and not output.exists(), 'Supply a new directory inside the project')
        output.parent.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=output.parent) as temp:
            stage = Path(temp)/'publication'
            stage.mkdir()
            for name,data in {**files,'representative-matrix.json':encode(merged)}.items():
                (stage/name).write_bytes(data)
            publish_plan(stage,output)
    print(json.dumps({'mode':'generated' if args.output else 'verified', 'candidate':row,
                      'files':{name:digest(data) for name,data in files.items()}},ensure_ascii=False))


if __name__ == '__main__':
    main()
