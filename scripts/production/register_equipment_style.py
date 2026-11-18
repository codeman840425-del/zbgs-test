"""Generate candidate matrix rows for an already published skinned, unmasked clothing style."""
import argparse
import hashlib
import json
from pathlib import Path

from flow import GLB, Validator, local, require
from variant_matrix import validate_matrix_files

ROOT = Path(__file__).resolve().parents[2]
MATRIX = ROOT / 'assets-source/variant-matrix-v1/representative-matrix.json'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build_style(root, spec_path, publication_path, label):
    v = Validator(root)
    spec = v.json(spec_path)
    public = v.json(publication_path)
    require(public['styleId'] == spec['styleId'] and public['runtimeAccepted'] is False,
            'Expected a matching candidate publication')
    generated = str(Path(spec_path).parent.as_posix()) + '/generated/'
    inventory_path = generated + 'package-files.json'
    inventory = json.loads(v.pin(inventory_path, public['sourceInventorySha256']))
    pins = {r['path']: r for r in inventory['files']}
    require(len(pins) == len(inventory['files']), 'Duplicate source inventory entry')

    def source(name):
        require(name in pins, 'Missing source inventory reference: ' + name)
        return v.pin(name, pins[name]['sha256'], pins[name]['bytes'])

    require(json.loads(source(spec_path)) == spec, 'Spec changed during registration')
    variants, evidence = [], []
    entries = public['items']
    require(len(entries) == len(spec['bodies']), 'Expected one published member per source body')
    for body_type, body in spec['bodies'].items():
        matches = [e for e in entries if e['compatibleAvatarSha256'] == body['sha256']]
        require(len(matches) == 1, 'Missing or duplicate publication member for ' + body_type)
        entry = matches[0]
        published_path = v.url(entry['url'])
        require(Path(published_path).parent == Path(publication_path).parent, 'Asset outside publication directory')
        entry_path = generated + body_type + '-entry.json'
        authored = json.loads(source(entry_path))
        require(authored['url'] == Path(published_path).name and
                entry == dict(authored, url=entry['url']) and entry['styleId'] == spec['styleId'],
                'Published member differs from source entry')
        inventory_asset = source(generated + authored['url'])
        require(inventory_asset == v.pin(published_path, entry['sha256'], entry['bytes']), 'Published GLB differs from source')
        catalog = v.json(body['manifest'])
        require(v.item(catalog, entry['id']) == entry, 'Equipment member differs from publication')
        fit_path = generated + body_type + '-fit.json'
        fit_bytes = source(fit_path)
        fit = json.loads(fit_bytes)
        require(fit['styleId'] == entry['styleId'] and fit['id'] == entry['fitId'] and fit['slot'] == entry['slot']
                and fit['baseAvatarSha256'] == body['sha256'] and fit['garmentId'] == entry['id']
                and fit['garmentSha256'] == entry['sha256'] and fit['version'] == entry['version'],
                'Fit identity differs from its member')
        require(entry['preserveOriginalBody'] is True and fit['bodyCoverageMasks'] == [] and
                fit['physics'] == 'skinning-only' and fit['runtimeAccepted'] is False,
                'Expected a candidate skinning-only fit that preserves the body without coverage masks')
        bound = v.equipment(entry, body['sha256'], GLB(v.pin(body['path'], body['sha256'])), body['manifest'])
        fitted = sorted((r['id'],r['sha256']) for r in fit['pairingCandidates'])
        declared = sorted((r['id'],r['sha256']) for refs in entry['pairedWith'].values() for r in refs)
        require(fitted == declared, 'Pairings differ between fit and equipment')
        for ref in fit['pairingCandidates']:
            require(v.item(catalog, ref['id'])['sha256'] == ref['sha256'], 'Pairing differs from body catalog')
            v.pin(ref['path'], ref['sha256'])
        manifest_path = local(root, body['manifest'])
        url = '/' + manifest_path.relative_to(root/'prototype/public').as_posix()
        variants.append({
            'bodyType':body_type, 'bodySha256':body['sha256'],
            'recipeSource':spec_path, 'recipeSha256':pins[spec_path]['sha256'],
            'resourceManifest':url+'#'+entry['id'], 'resourceManifestSha256':digest(manifest_path.read_bytes()),
            'fitManifest':fit_path, 'fitManifestSha256':digest(fit_bytes),
            'coverageManifest':fit_path+'#bodyCoverageMasks', 'coverageManifestSha256':digest(fit_bytes),
            'status':'candidate', 'variantVersion':'v'+str(entry['version']),
            'limits':['exact source body and declared shoe/lower pairs only',
                      'preserveOriginalBody; the fit declares no body coverage masks'],
        })
        evidence.append({'bodyType':body_type,'member':entry['id'],'fitId':fit['id'],'assetSha256':entry['sha256'],
                         'bones':bound['bones'],'weightedVertices':bound['weightedVertices'],
                         'preserveOriginalBody':entry['preserveOriginalBody'],
                         'bodyCoverageMasks':fit['bodyCoverageMasks'],'pairedWith':entry['pairedWith']})
    return {'styleId':spec['styleId'],'label':label,'variants':variants}, evidence


def register(matrix, style):
    previous = [s for s in matrix['styles'] if s['styleId'] == style['styleId']]
    if not previous:
        return dict(matrix, styles=[*matrix['styles'],style])
    require(len(previous) == 1, 'Ambiguous existing style')
    existing = previous[0]
    metadata = lambda obj: {key:value for key,value in obj.items() if key != 'variants'}
    require(metadata(existing) == metadata(style), 'Existing style metadata differs')
    rows = {(row['bodyType'],row['variantVersion']):row for row in existing['variants']}
    for row in style['variants']:
        key = (row['bodyType'],row['variantVersion'])
        require(key not in rows or rows[key] == row, 'Existing variant has different data; retain the original row')
        rows[key] = row
    combined = dict(existing, variants=list(rows.values()))
    return dict(matrix, styles=[combined if s is existing else s for s in matrix['styles']])


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--spec',required=True,help='Repository-relative author spec')
    p.add_argument('--publication',required=True,help='Repository-relative published manifest')
    p.add_argument('--label',required=True)
    p.add_argument('--matrix',type=Path,default=MATRIX)
    p.add_argument('--output',type=Path,help='Fresh output matrix; omitted to verify the existing registration')
    a=p.parse_args()
    style, evidence=build_style(ROOT,a.spec,a.publication,a.label)
    raw=a.matrix.read_bytes()
    matrix=json.loads(raw)
    new=register(matrix,style)
    require(not (errors:=validate_matrix_files(new,ROOT)), '; '.join(errors))
    if a.output:
        encoded=json.dumps(new,ensure_ascii=False,indent=2)+'\n'
        with a.output.open('xb') as stream:
            stream.write(encoded.encode('utf-8'))
    else:
        require(new == matrix, 'Candidate missing; specify a new output matrix to prepare it')
    print(json.dumps({'styleId':style['styleId'],'status':'candidate','source':a.spec,'publication':a.publication,
                      'bodies':evidence},indent=2,ensure_ascii=False))


if __name__ == '__main__':
    main()
