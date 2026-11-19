"""Read back a shape-record batch delivery from its original batch and physical game files."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
from flow import ROOT, require
from native_import import confined, digest
from receive_rule_body import unique_fields
from rule_body_producer import generate
from shape_data_pack import assemble, check_tree, regular_path


def parse(raw):
    return json.loads(raw, object_pairs_hook=unique_fields)


def local(root, name):
    confined(root, name)
    return regular_path(root / name)


def pin(data):
    return {'sha256': digest(data), 'bytes': len(data)}


def matches(actual, fields, context):
    for key, expected in fields.items():
        require(key in actual and actual[key] == expected, f'{context}: {key} differs')


def game_files(game, rows):
    listed = {}
    folded = set()
    for row in rows:
        name = row['path']
        require(name.casefold() not in folded and name.casefold() != 'runtime-package.json',
                f'Duplicate game file: {name}')
        folded.add(name.casefold())
        file = local(game, name)
        require(file.is_file(), f'Missing game file: {name}')
        matches(row, pin(file.read_bytes()), name)
        listed[name] = row
    names = {f.relative_to(game).as_posix() for f in game.rglob('*') if regular_path(f).is_file()}
    require(names == set(listed) | {'runtime-package.json'}, 'Unexpected physical game files')
    return listed


def runtime_review(runtime, files):
    directory = ROOT/'scripts/runtime-package'
    registry = parse((directory/'game-runtime-reviews.json').read_bytes())['externalRecords']
    entry = registry.get(runtime['sourceDigest'])
    require(entry is not None, 'Unreviewed ordinary game runtime')
    raw = local(directory, entry['file']).read_bytes()
    require(digest(raw) == entry['sha256'], 'Registered review digest differs')
    review = parse(raw)
    matches(runtime, {k:review[k] for k in ('sourceCommit','sourceDigest')}, 'runtime')
    matches(runtime, {'buildId':review['sourceDigest'][:12],'entry':'record-consumer.html',
                      'entryUrl':'record-consumer.html?records=/records/manifest.json'}, 'ordinary entry')
    for name, measured in review['files'].items():
        matches(files[name], measured, f'reviewed game file {name}')


def signed_hashes(raw):
    # Use the production record canonicalizer, including its JS number spelling.
    script = """
import {validateCharacterRecord} from './prototype/src/character-record.js';
let input='';process.stdin.setEncoding('utf8');
for await (const part of process.stdin) input+=part;
for (const record of JSON.parse(input))
  await validateCharacterRecord(record,{validationCallback:()=>({status:'pending'})});
"""
    proc = subprocess.run(['node','--input-type=module','-e',script], cwd=ROOT, input=raw,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    require(proc.returncode == 0, 'Invalid D02 record: '+proc.stderr.decode(errors='replace')[:1200])


def original_pack(batch, source, delivery, ordinal, item):
    recipe_name = source['recipe']
    require(isinstance(recipe_name,str) and recipe_name.strip(),'Expected a source recipe path')
    recipe_file = (batch.parent/recipe_name).resolve()
    matches(item, {'recipePath':f'items/{ordinal}/recipe.json','producerPath':f'items/{ordinal}/producer.json',
                   'identity':source['identity']}, f'batch item {ordinal}')
    raw = recipe_file.read_bytes()
    require(local(delivery,item['recipePath']).read_bytes()==raw,'Archived source recipe differs')
    recipe = parse(raw)
    body, producer = generate(recipe,ROOT)
    saved = local(delivery,item['producerPath']).read_bytes()
    require(parse(saved)==producer and producer['admission']=='producer-only','Recomputed producer receipt differs')
    payloads = assemble(recipe,body,ROOT)
    index = parse(payloads['index.json'])
    index_sha = digest(payloads['index.json'])
    matches(item, {'bodySha256':digest(body),'bodyType':index['bodyType'],'recipeSha256':index['recipeSha256'],
                   'recipeFileSha256':digest(raw),'producerSha256':digest(saved),'indexSha256':index_sha,
                   'profileSha256':index['profile']['sha256'],'shapePackPath':'shape-packs/'+index_sha},
            f'reconstructed batch item {ordinal}')
    check_tree(local(delivery,item['shapePackPath']),payloads)
    return payloads


def record_bindings(item, record, catalog, fit):
    body = item['bodyType']
    sha = item['bodySha256']
    matches(record, {'identity':item['identity'],'revision':item['revision']}, body)
    matches(record['integrity'], {'recordSha256':item['recordSha256']}, body)
    matches(record['appearanceRecipe']['base'], {'bodyType':body,'sha256':sha}, 'signed body')
    gear = record['appearanceRecipe']['equipment']
    matches(gear, {'manifestUrl':f'/assets/{body}/equipment.json'}, 'signed equipment')
    require(set(gear['resources'])=={'top','shoes','pants'}, 'Unexpected signed equipment roles')
    require(len(catalog['items'])==3, 'Unexpected catalog size')
    ids = {c['id']:c for c in catalog['items']}
    matches(fit, {'bodyType':body,'bodySha256':sha,'recipeSha256':item['recipeSha256']}, 'fit receipt')
    for role, garment in gear['resources'].items():
        name = f'{body}-{role}'
        require(garment['id']==name and ids.get(name)==garment, f'Signed catalog differs for {name}')
        matches(garment, {'compatibleAvatarSha256':sha,'fitId':name+'-fit'}, name)
        matches(fit['equipment'][role], {'id':name,'fitSha256':sha,'garmentSha256':garment['sha256']}, name)
    return ids


def shared_paths(files, origins):
    for name, bindings in origins.items():
        row = files[name]
        copies = [path for path,other in files.items() if other['sha256']==row['sha256']]
        require(copies == [name], 'Multiple game copies of shared garment: '+name)
        refs = [p['indexSha256'] for p in row['provenance'] if p.get('packPath')==name]
        require(sorted(refs)==sorted(bindings), 'Shared garment origins differ: '+name)
        catalog_refs = {(p['indexSha256'],p['packPath'],p.get('equipmentId')) for p in row['provenance']
                        if 'indexSha256' in p and p.get('packPath','').endswith('/equipment.json')}
        require(catalog_refs=={(index,catalog,item) for index,(catalog,item) in bindings.items()},
                'Shared garment catalog binding differs: '+name)


def verify(batch_path, delivery, receipt_sha=None):
    batch_path = Path(batch_path).resolve()
    delivery = regular_path(Path(delivery).absolute())
    batch_bytes = batch_path.read_bytes()
    batch = parse(batch_bytes)
    receipt_bytes = local(delivery,'receipt.json').read_bytes()
    if receipt_sha is not None:
        require(receipt_sha==digest(receipt_bytes), 'External delivery receipt digest differs')
    receipt = parse(receipt_bytes)
    require(batch['schema']=='shape-record-delivery-batch-v1','Unknown source batch schema')
    matches(receipt, {'schema':'shape-record-batch-technical-delivery-v1','status':'technical-package-exported',
                      'wholeOutfitAdmission':'not-evaluated','ordinaryPCPerformance':'unmeasured',
                      'batchFileSha256':digest(batch_bytes)}, 'technical delivery')
    game = local(delivery,'game')
    inventory = local(delivery,'inventory.json').read_bytes()
    require(local(game,'runtime-package.json').read_bytes()==inventory,'Installed inventory differs')
    require(digest(inventory)==receipt['packageManifestSha256'],'Game inventory fingerprint differs')
    manifest = parse(inventory)
    matches(manifest, {'schema':'game-character-record-package-v1','runtime':receipt['runtime'],
                       'recordManifest':'records/manifest.json'}, 'game inventory')
    files = game_files(game,manifest['files'])
    require(receipt['gameFileCount']==len(files)+1,'Game file count differs')
    runtime_review(manifest['runtime'],files)
    raw = local(delivery,'records.json').read_bytes()
    records = parse(raw)
    signed_hashes(raw)
    issued = receipt['issuance']
    matches(issued, {'operation':'batch-create','build':manifest['runtime']['buildId'],'recordsPath':'records.json',
                     'recordsFileSha256':digest(raw)}, 'D02 issuance')
    items = receipt['items']
    selection = parse(local(game,manifest['recordManifest']).read_bytes())
    rows = selection['entries']
    require(2<=len(items)<=4 and all(len(group)==len(items) for group in
            [batch['items'],records,manifest['records'],rows,issued['items']]),'Batch counts differ')
    descriptors = {}
    origins = defaultdict(dict)
    actors = set()
    for ordinal,(source,item,record,inventory_row,entry,ack) in enumerate(zip(
            batch['items'],items,records,manifest['records'],rows,issued['items']),1):
        payloads = original_pack(batch_path,source,delivery,ordinal,item)
        body, index_sha = item['bodyType'],item['indexSha256']
        identity = item['identity']['id']
        require(identity not in actors,'Duplicate signed actor ID')
        actors.add(identity)
        record_sha = item['recordSha256']
        rel = 'records/'+identity+'.json'
        matches(ack, {'id':identity,'revision':item['revision'],'hash':record_sha}, 'D02 acknowledgement')
        matches(entry, {'id':identity,'url':'/'+rel,'recordSha256':record_sha}, 'game record manifest')
        require(rel in files and parse(local(game,rel).read_bytes())==record, 'Game record differs from D02')
        prefix = f'character-data/{body}/'
        descriptors[body] = {'bodyType':body,'url':'/'+prefix+'index.json',**pin(payloads['index.json'])}
        for name,data in payloads.items():
            installed = name if name.startswith('assets/') else prefix+name
            require(installed in files,'Unlisted shape dependency: '+installed)
            matches(files[installed],pin(data),'Installed shape payload '+installed)
        ids = record_bindings(item,record,parse(payloads[f'assets/{body}/equipment.json']),parse(payloads['fit.json']))
        for garment in ids.values():
            origins[garment['url'][1:]][index_sha] = (f'assets/{body}/equipment.json',garment['id'])
        matches(inventory_row, {'id':identity,'file':rel,'recordSha256':record_sha,'revision':item['revision'],
                                'bodyType':body,'avatarSha256':item['bodySha256']}, 'inventory character')
        require(sorted(ids)==sorted(inventory_row['equipmentIds']), 'Inventory equipment IDs differ')
    matches(selection, {'schema':'character-record-input-v1','ruleBodyDataPacks':[descriptors[b] for b in sorted(descriptors)]},
            'installed shape pointers')
    folders = {regular_path(p).name for p in local(delivery,'shape-packs').iterdir()}
    require(folders=={row['sha256'] for row in descriptors.values()},'Unexpected delivered shape-pack directory')
    require(len(origins)==3 and all(len(refs)==len(descriptors) for refs in origins.values()),
            'The verified packs do not share the three declared uniform garments')
    shared_paths(files,origins)
    return {'receiptSha256':digest(receipt_bytes),'packageManifestSha256':digest(inventory),
            'recordsFileSha256':digest(raw),'recordSha256':[i['recordSha256'] for i in items],
            'distinctBodies':len(descriptors),'shapePacks':list(descriptors.values()),
            'sharedGarments':{name:{**{k:files[name][k] for k in ('sha256','bytes')},
                                   'indexSha256':sorted(refs)} for name,refs in origins.items()},
            'gameFiles':len(files)+1,'wholeOutfitAdmission':receipt['wholeOutfitAdmission']}


if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--batch',required=True,type=Path)
    cli.add_argument('--delivery',required=True,type=Path)
    cli.add_argument('--receipt-sha256')
    args=cli.parse_args()
    try:
        print(json.dumps(verify(args.batch,args.delivery,args.receipt_sha256),ensure_ascii=True))
    except (ValueError,OSError,TypeError,KeyError) as error:
        print(json.dumps({'ok':False,'reason':str(error)},ensure_ascii=True),file=sys.stderr)
        sys.exit(1)
