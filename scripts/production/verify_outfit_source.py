"""Replay the source of a signed rule body and its three selected garments, offline."""
import argparse
import json
import os
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import cc0_body_basecolor_release as body_color
import garment_basecolor_release as garment_color
import raw_male_equipment as garment_builder
import stripped_outfit_body as body_builder
from asset_budget import AssetCost
from flow import ROOT, require
from native_import import confined, digest
from outfit_admission import exact_entry
from production_paths import project_output
from rule_body_producer import pinned
from shape_data_pack import assemble, check_tree, embedded, payload_pin, read_object, regular_path
from verify_record_room import publish
from verify_shape_delivery_batch import signed_hashes


def verify_record(original, expected_sha):
    raw = original.read_bytes()
    record = read_object(raw)
    require(record['integrity']['recordSha256'] == expected_sha, 'Different signed record than requested')
    signed_hashes(b'[' + raw + b']')
    return record, payload_pin(original.resolve().as_posix(), raw)


def verify_selection(record, profile, catalog):
    recipe = record['appearanceRecipe']
    body = {'bodyType': profile['id'], 'sha256': profile['sha256']}
    require(recipe['base'] == body and {'path':profile['url'], 'sha256':body['sha256']} in
            record['provenance']['sourceRefs'], 'Signed record belongs to a different body or source')
    default = profile['defaultOutfit']
    selected = {role:exact_entry(catalog['items'], 'id', ident) for role, ident in profile['ids'].items()}
    expected = {'index':default['index'], 'role':default['role'], 'manifestUrl':profile['manifestUrl'],
                'resources':selected}
    require(recipe['equipment'] == expected, 'Signed clothing or its source/bone binding differs')
    # D02 canonicalizes JS numbers (e.g. 1 and 1.0) but distinguishes true
    # from 1. The reconstructed equipment must yield the original signature.
    signed_hashes(json.dumps([{**record, 'appearanceRecipe':{**recipe, 'equipment':expected}}],
                             allow_nan=False).encode())
    return selected


def original_materials(root, binding_file, template, files, selected):
    # These are production recipes. Accept a receiver's independent copy only
    # against the same supplier bytes used by the registered production steps.
    def production_recipe(path):
        name = path.relative_to(ROOT).as_posix()
        return read_object(pinned(root, {'path':name, 'sha256':digest(path.read_bytes())}))

    binding_raw = binding_file.read_bytes()
    require(binding_raw == body_builder.RECIPE.read_bytes(), 'Unrecognized original garment/body binding')
    binding = read_object(binding_raw)
    documents = {}
    def document(pin):
        name = pin['path']
        raw = confined(root,name).read_bytes()
        if digest(raw) == pin['sha256']:
            documents[name] = payload_pin(name,raw)
            return read_object(raw)
        # Git text checkouts can change only line endings. A recovered stream
        # must reproduce the original pinned bytes before it is parsed.
        lf = raw.replace(b'\r\n', b'\n')
        for ending, restored in [('LF',lf), ('CRLF',lf.replace(b'\n',b'\r\n'))]:
            if digest(restored) == pin['sha256']:
                documents[name] = {**payload_pin(name,restored), 'checkoutFile':payload_pin(name,raw),
                                   'recoveredOriginalLineEndings':ending}
                return read_object(restored)
        raise ValueError('Source digest differs: ' + name)

    outfit = document(binding['outfitRecipe'])
    pants = document(outfit['pantsRecipe'])
    mapping = document(pants['sourceMapping'])
    spec = document(mapping['bodySpec'])
    origin = document(mapping['publisherReceipt'])
    require(mapping['publisherReceipt'] == template['provenance'], 'Template has a different publisher receipt')
    require(binding['body'] == {'path':spec['source'], 'sha256':spec['sourceSha256']} and
            binding['body']['sha256'] == origin['vrmSHA256'], 'Original publisher VRM binding differs')
    terms = mapping['sourceTerms']
    terms_raw = pinned(root, terms)
    documents[terms['path']] = payload_pin(terms['path'], terms_raw)
    page = (Path(template['provenance']['path']).parent/'publisher-page.html').as_posix()
    page_raw = pinned(root, {'path':page,'sha256':digest(confined(ROOT,page).read_bytes())})
    documents[page] = payload_pin(page,page_raw)
    underlying = AssetCost(confined(root,binding['body']['path']))
    require(digest(underlying.raw) == origin['vrmSHA256'] and len(underlying.raw) == origin['vrmBytes'],
            'Original VRM bytes differ from publisher declaration')
    underlying.measure()

    extraction = document(binding['equipmentReport'])
    catalog = document(binding['equipmentCatalog'])
    all_selectors, garments = [], []
    color_recipe = production_recipe(garment_color.RECIPE)
    for role, current in selected.items():
        entry = exact_entry(catalog['items'],'slot',current['slot'])
        previous = exact_entry(extraction['items'],'id',entry['id'])
        parts = previous['selection']
        selectors = [part['selector'] for part in (parts if isinstance(parts,list) else [parts])]
        all_selectors.extend(selectors)
        require(previous['source'] == binding['body'] and entry['sourceLicense'] == current['sourceLicense'] == origin,
                'Garment carries a different source declaration')
        produced, rebuilt_entry, proof = garment_builder.make_item(
            entry, selectors, underlying, spec, origin, previous['sourceReceipts'])
        raw = produced[entry['url']]
        require(rebuilt_entry == entry and proof['selection'] == parts and proof['verified'] == previous['verified'],
                'Original selected triangles, material, weights or rest binds differ')
        if digest(raw) != current['sha256']:
            variant = exact_entry(color_recipe['items'],'sourceSha256',digest(raw))
            raw, _ = garment_color.derive(raw, variant, origin)
            operation = color_recipe['operation']
        else:
            operation = 'source-primitive-extraction'
        require(raw == files[current['url'][1:]], 'Selected garment bytes differ from publisher VRM reconstruction')
        garments.append({'role':role,'id':current['id'],'slot':current['slot'],'assignedBodySha256':current['compatibleAvatarSha256'],
                         'selectors':selectors,'publisherExtractSha256':entry['sha256'],'operation':operation,
                         'file':payload_pin(current['url'][1:],raw)})

    stripped, maps, removed = body_builder.strip(underlying.raw, all_selectors)
    body_builder.verify(underlying.raw, stripped, maps, removed)
    colors = production_recipe(body_color.SPEC)
    require(digest(stripped) == colors['source']['sha256'] and colors['preservedSources']['publisherVrm'] == binding['body'],
            'Stripped body differs from texture-production source')
    base, _ = body_color.derive(stripped, colors['selection'])
    require(base == pinned(root, template['sourceBody']), 'Rebuilt body differs from shape-production source')
    perms = ('licenseName','allowedUserName','commercialUssageName')
    meta = embedded(underlying.raw)['extensions']['VRM']['meta']
    return {'sourceBinding':payload_pin(binding_file.resolve().as_posix(),binding_raw), 'original':binding['body'],
            'strippedBodySha256':digest(stripped),'shapeInputBody':template['sourceBody'],
            'authoredShapeInput':template['shapeEndpoint'],'authoredShapeDescription':template['shapeMeaning'],
            'garments':garments,'sourceDocuments':list(documents.values()),
            'thirdPartyDeclaration':origin, 'embeddedVrmDeclaration':{k:meta[k] for k in perms}}


def verify(original, pack, record_sha, index_sha, root, binding):
    record, original_pin = verify_record(original, record_sha)
    pack = regular_path(pack.absolute())
    require(digest(regular_path(pack/'index.json').read_bytes()) == index_sha, 'Different shape pack index than requested')
    recipe = read_object(regular_path(pack/'recipe.json').read_bytes())
    files = assemble(recipe,None,root)
    check_tree(pack,files)
    require(digest(files['index.json']) == index_sha, 'Reconstructed pack index differs')
    profile = read_object(files['profile.json'])
    selected = verify_selection(record, profile, read_object(files[profile['manifestUrl'][1:]]))
    lineage = original_materials(root, binding, read_object(pinned(root,recipe['template'])), files, selected)
    return {'schema':'signed-rule-outfit-source-replay-v1','technicalStatus':'source-bytes-reproduced',
            'scope':'Selected body, shape input and three listed garments only.', 'id':record['identity']['id'],
            'recordSha256':record_sha,'originalRecord':original_pin,'packIndexSha256':index_sha,
            'template':recipe['template'],'fitSha256':digest(files['fit.json']),
            'shapeRecipeSha256':read_object(files['index.json'])['recipeSha256'],
            'body':payload_pin(profile['url'][1:],files[profile['url'][1:]]), 'lineage':lineage,
            'projectSpecificRightsholderAuthorization':'not established by these source materials',
            'humanRightsReview':'not evaluated','provenanceAndRightsLane':'not adjudicated'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record',required=True,type=Path)
    parser.add_argument('--record-sha256',required=True,help='Independent signed record digest')
    parser.add_argument('--pack',required=True,type=Path)
    parser.add_argument('--index-sha256',required=True,help='Independent published shape-pack index digest')
    parser.add_argument('--source-root',type=Path,default=ROOT,help='Read-only checkout containing the original bound assets')
    parser.add_argument('--source-binding',type=Path,help='Original body and outfit binding recipe from the source kit')
    parser.add_argument('--out',type=Path,help='Optional immutable engineering-project receipt')
    args = parser.parse_args()
    os.environ['NODE_DISABLE_COMPILE_CACHE'] = '1'
    try:
        out = project_output(args.out,__file__) if args.out else None
        source = args.source_root.resolve(strict=True)
        binding = args.source_binding or source/body_builder.RECIPE.relative_to(ROOT)
        result = verify(args.record,args.pack,args.record_sha256,args.index_sha256,source,binding)
        raw = (json.dumps(result,indent=2,ensure_ascii=True)+'\n').encode()
        if out:
            publish(out,raw)
        sys.stdout.buffer.write(raw)
    except (OSError,ValueError,KeyError,TypeError,IndexError) as error:
        parser.exit(1,f'{parser.prog}: {error}\n')
