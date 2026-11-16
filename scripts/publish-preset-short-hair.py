"""Publish source-checked hair fits from independently pinned local templates."""
import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BODY_MANIFEST = 'assets-source/m2-representative-batch-v1/generated/manifest.json'
SPEC_PINS = {
    'short': ('assets-source/m2-preset-short-hair-fits-v1/spec.json', 'bf4d4d89b203abf1320ec3c111a1c2af0f0093afe5ba30501c72beceac1ea398'),
    'ponytail': ('assets-source/m2-preset-ponytail-fits-v1/spec.json', '19128c0d3cf7f086d0a1a8fecc5053529d1a3abb683dc258548439e4a903c3f6'),
}
MOUNT = {'bone': 'head', 'space': 'raw-head-bind-local', 'position': [0, 0, 0], 'quaternion': [0, 0, 0, 1], 'scale': [1, 1, 1]}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def local(name):
    require(isinstance(name, str) and name and ':' not in name and '..' not in Path(name).parts, 'Unsafe local source path')
    path = (ROOT/name).resolve()
    require(path.is_relative_to(ROOT.resolve()), 'Source path escapes project')
    return path


def pinned(path, expected):
    require(isinstance(expected, str) and re.fullmatch('[a-f0-9]{64}', expected), 'Invalid SHA declaration')
    data = path.read_bytes()
    require(digest(data) == expected, 'SHA mismatch: '+str(path))
    return data


def public_path(url):
    require(isinstance(url, str) and url.startswith('/assets/') and '?' not in url and '#' not in url, 'Invalid public asset URL')
    path = local('prototype/public'+url)
    require(path.is_relative_to((ROOT/'prototype/public/assets').resolve()), 'Asset escapes public assets')
    return path


def glb_parts(data):
    document, binary = None, None
    offset = 12
    while offset < len(data):
        size, kind = struct.unpack_from('<II', data, offset)
        chunk = data[offset+8:offset+8+size]
        if kind == 0x4e4f534a:
            document = json.loads(chunk)
        elif kind == 0x004e4942:
            binary = chunk
        offset += 8+size
    require(document is not None and binary is not None, 'Trusted source GLB has missing chunks')
    return document, binary


def image_hash(document, binary, texture):
    image = document['images'][document['textures'][texture]['source']]
    view = document['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    return digest(binary[start:start+view['byteLength']])


def template(spec, kind):
    if kind == 'short':
        body = pinned(local(spec['body']), spec['bodySha256'])
        asset = pinned(local(spec['asset']), spec['assetSha256'])
        manifest = json.loads(pinned(local(spec['manifest']), spec['manifestSha256']))
        source_fit = None
        style, source_sha, asset_sha = spec['styleId'], spec['bodySha256'], spec['assetSha256']
    else:
        body = pinned(local(spec['sourceBody']['path']), spec['sourceBody']['sha256'])
        asset = pinned(local(spec['asset']['path']), spec['asset']['sha256'])
        manifest = json.loads(pinned(local(spec['sourceManifest']['path']), spec['sourceManifest']['sha256']))
        source_fit = json.loads(pinned(local(spec['sourceFit']['path']), spec['sourceFit']['sha256']))
        for helper in spec['helpers']:
            pinned(local(helper['path']), helper['sha256'])
        style, source_sha, asset_sha = spec['styleId'], spec['sourceBody']['sha256'], spec['asset']['sha256']
        require(source_fit['styleId'] == style and source_fit['sourceBodySha256'] == source_sha and source_fit['assetSha256'] == asset_sha, 'Pinned ponytail template identity differs')
    require(manifest['id'] == style and manifest['sha256'] == asset_sha, 'Pinned source manifest differs')
    pinned(public_path(manifest['url']), asset_sha)
    body_doc, body_bin = glb_parts(body)
    asset_doc, asset_bin = glb_parts(asset)
    head = next(bone['node'] for bone in body_doc['extensions']['VRM']['humanoid']['humanBones'] if bone['bone'] == 'head')
    material = asset_doc['materials'][0]
    texture_sha = image_hash(asset_doc, asset_bin, material['pbrMetallicRoughness']['baseColorTexture']['index'])
    vrm_material = next(m for m in body_doc['extensions']['VRM']['materialProperties'] if m['name'] == manifest['sourceMaterial'])
    require(image_hash(body_doc, body_bin, vrm_material['textureProperties']['_MainTex']) == texture_sha, 'Actor MainTex and source asset texture differ')
    return {'manifest': manifest, 'fit': source_fit, 'sourceSha': source_sha, 'assetSha': asset_sha, 'rawHead': body_doc['nodes'][head]['name'],
            'textureSha': texture_sha, 'blendMode': vrm_material['floatProperties']['_BlendMode'], 'alphaMode': material.get('alphaMode'),
            'hairTriangles': asset_doc['accessors'][asset_doc['meshes'][0]['primitives'][0]['indices']]['count']//3,
            'materials': {m['name'] for m in body_doc['materials']}}


def finite(value):
    return type(value) in [int, float] and math.isfinite(value)


def validate_colliders(actual, original):
    require(isinstance(actual, list) and len(actual) == len(original), 'Ponytail collider count differs')
    for collider, source in zip(actual, original):
        require(set(collider) == set(source) and collider['bone'] == source['bone'] and collider['shape'] == source['shape'], 'Collider role/shape differs')
        require(finite(collider['radius']) and .001 <= collider['radius'] <= .6, 'Invalid collider radius')
        for field in ['offset']+(['tail'] if source['shape'] == 'capsule' else []):
            require(isinstance(collider[field], list) and len(collider[field]) == 3 and all(finite(x) for x in collider[field]), 'Invalid collider vector')


def validate_contact(contact, result, reference):
    require(contact['targetId'] == result['targetId'] and contact['targetBodySha256'] == result['targetBodySha256'], 'Contact target differs')
    require(contact['sourceAssetSha256'] == reference['assetSha'] and contact['sourceTextureSha256'] == reference['textureSha'], 'Contact source identity differs')
    require(contact['policy'] == 'transparent-source-texels' and reference['alphaMode'] == 'BLEND' and reference['blendMode'] == 2, 'Unsupported contact alpha mechanism')
    records = contact['records']
    poses = {'neutral'} | {'morph-'+str(i) for i in range(54)}
    require(records and {r['pose'] for r in records} == poses, 'Contact poses must be neutral plus morph-0..53')
    require(len({(r['material'], r['pose']) for r in records}) == len(records), 'Duplicate contact record')
    for record in records:
        require(record['material'] in reference['materials'], 'Unknown contact material')
        measurements, summary = record['measurements'], record['summary']
        require(isinstance(measurements, list) and measurements, 'Empty contact measurements')
        require(type(summary['introducedPairs']) is int and summary['introducedPairs'] == len(measurements), 'Contact measurement count differs')
        require(summary['allPositiveDepthPatchesTransparent'] is True, 'Contact transparency summary failed')
        require(len({(m['hairTriangle'], m['targetTriangle']) for m in measurements}) == len(measurements), 'Duplicate contact measurement')
        for measurement in measurements:
            require(type(measurement['hairTriangle']) is int and 0 <= measurement['hairTriangle'] < reference['hairTriangles'], 'Invalid hair triangle')
            require(type(measurement['targetTriangle']) is int and measurement['targetTriangle'] >= 0, 'Invalid target triangle')
            depth = measurement['targetProjectedPlaneDepthM']
            require(finite(depth) and depth >= 0, 'Invalid contact depth')
            footprints = measurement['positiveDepthTextureFootprints']
            require(len(footprints) == 2 and all(type(p['flipV']) is bool for p in footprints) and {p['flipV'] for p in footprints} == {True, False}, 'Both V orientations required')
            require(all(type(p['conservativeTexelFootprint']) is int and p['conservativeTexelFootprint'] > 0 and type(p['maxAlpha0To255']) is int and p['maxAlpha0To255'] == 0 for p in footprints), 'Empty or opaque contact texel footprint')
        maximum = max(m['targetProjectedPlaneDepthM'] for m in measurements)
        require(finite(summary['maxProjectedPlaneDepthM']) and math.isclose(summary['maxProjectedPlaneDepthM'], maximum, rel_tol=1e-10, abs_tol=1e-12), 'Contact depth summary differs')


def publish(prefix, pending, catalog):
    output = ROOT/'prototype/public/assets'/prefix
    # Preserve the original Windows write_text serialization byte-for-byte.
    data = (json.dumps(catalog, ensure_ascii=False, indent=2)+'\n').replace('\n', os.linesep).encode('utf8')
    expected = {Path('catalog.json'): data}
    for relative, payloads in pending:
        expected.update({Path(relative)/name: value for name, value in payloads.items()})
    try:
        unchanged = output.is_dir() and all((output/name).is_file() and (output/name).read_bytes() == value for name, value in expected.items())
    except OSError as error:
        raise RuntimeError('Cannot verify existing publication; its files remain untouched') from error
    if unchanged:
        return digest(data)

    # Cleanup is explicit because an unsuccessful rollback must retain the
    # only surviving previous directory, outside any automatic temp cleanup.
    temporary = Path(tempfile.mkdtemp(prefix='publish-hair-', dir=ROOT))
    stage, previous = temporary/'next', temporary/'previous'
    preserve_recovery = False
    installed = False
    receipt = {'output': str(output), 'previous': str(previous), 'stage': str(stage)}
    try:
        try:
            if output.exists():
                shutil.copytree(output, stage)
            else:
                stage.mkdir()
            for name, value in expected.items():
                path = stage/name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(value)
            (temporary/'RECOVERY.json').write_bytes((json.dumps(receipt, indent=2)+'\n').encode('utf8'))
        except OSError as error:
            raise RuntimeError('Publication preparation failed; previous output remains untouched') from error
        if output.exists():
            try:
                output.rename(previous)
            except OSError as error:
                raise RuntimeError('Cannot move existing publication; previous output remains untouched') from error
        try:
            stage.rename(output)
            installed = True
        except OSError as install_error:
            if previous.exists():
                try:
                    previous.rename(output)
                except OSError as restore_error:
                    preserve_recovery = True
                    receipt = {'output': str(output), 'previous': str(previous), 'stage': str(stage),
                               'installError': str(install_error), 'restoreError': str(restore_error)}
                    try:
                        (temporary/'RECOVERY.json').write_bytes((json.dumps(receipt, ensure_ascii=False, indent=2)+'\n').encode('utf8'))
                    except OSError:
                        pass
                    raise RuntimeError('Publication and restoration failed; previous files are preserved at '+str(previous)) from restore_error
                raise RuntimeError('Publication installation failed; previous output was restored') from install_error
            raise RuntimeError('Publication installation failed; no previous output existed') from install_error
    finally:
        if previous.exists() and not installed:
            preserve_recovery = True
        if not preserve_recovery:
            shutil.rmtree(temporary, ignore_errors=True)
    return digest(data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--kind', choices=['short', 'ponytail'], default='short')
    parser.add_argument('--conditional-manifest', type=Path)
    args = parser.parse_args()
    kind = args.kind
    spec_path, spec_sha = SPEC_PINS[kind]
    spec = json.loads(pinned(local(spec_path), spec_sha))
    body_bytes = local(BODY_MANIFEST).read_bytes()
    body = json.loads(body_bytes)
    require(body['schema'] == 'character-representative-batch-v1', 'Unsupported body manifest')
    targets = {row['id']: row for row in body['variants']}
    require(len(targets) == len(body['variants']), 'Duplicate body target')
    runtime = json.loads(local('prototype/public/assets/m2-representative-batch-v1/runtime-index.json').read_bytes())
    require(runtime['sourceManifestSha256'] == digest(body_bytes), 'Runtime index body source differs')
    profiles = {row['id']: row['profile'] for row in runtime['presets']}
    require(len(profiles) == len(runtime['presets']) and set(profiles) == set(targets), 'Runtime target set differs')
    batch = json.loads(args.manifest.read_bytes())
    prefix = 'm2-preset-short-hair-fits-v1' if kind == 'short' else 'm2-preset-ponytail-fits-v1'
    if kind == 'short':
        references = {sex: template(family, kind) for sex, family in spec['families'].items()}
        require(batch['schema'] == 'preset-short-hair-fit-batch-v1' and batch['batchManifestSha256'] == digest(body_bytes), 'Hair batch body source differs')
        require(len(batch['results']) == len(targets) and {r['targetId'] for r in batch['results']} == set(targets), 'Incomplete/duplicate short-hair source batch')
        results = [dict(r, source=args.manifest.parent/r['targetId'], relative=r['targetId']) for r in batch['results']]
        if args.conditional_manifest:
            conditional = json.loads(args.conditional_manifest.read_bytes())
            require(conditional['schema'] == batch['schema'] and conditional['batchManifestSha256'] == digest(body_bytes), 'Conditional batch source differs')
            require(all(r['status'] == 'source-contact-candidate' for r in conditional['results']), 'Invalid conditional source status')
            results += [dict(r, source=args.conditional_manifest.parent/r['targetId'], relative='conditional/'+r['targetId']) for r in conditional['results']]
    else:
        references = {'female': template(spec, kind)}
        require(batch['schema'] == 'preset-ponytail-fits-v1' and batch['repeatBytesIdentical'] is True and batch['sourceSpec'] == spec, 'Ponytail source spec differs')
        require(spec['batchManifest']['sha256'] == digest(body_bytes) and not args.conditional_manifest, 'Ponytail body source differs')
        require(len(batch['variants']) == len(spec['targets']) and {r['id'] for r in batch['variants']} == {r['id'] for r in spec['targets']}, 'Ponytail target set differs')
        results = [{'targetId': r['id'], 'targetBodySha256': r['targetBodySha256'], 'source': args.manifest.parent/r['id'], 'relative': r['id'],
                    'status': 'source-fit-ready' if r['status'] == 'source-passed' else 'failed', 'files': {'fit.json': r['fitSha256'], 'manifest.json': r['manifestSha256']}} for r in batch['variants']]
    pending, published, seen = [], [], set()
    for result in results:
        if result['status'] not in ['source-fit-ready', 'source-contact-candidate']:
            require(result['status'] == 'failed', 'Unsupported source status')
            continue
        identifier = result['targetId']
        require(re.fullmatch('[a-z0-9-]+', identifier) and identifier in targets and identifier in profiles and identifier not in seen, 'Unknown/duplicate target')
        seen.add(identifier)
        target, profile = targets[identifier], profiles[identifier]
        target_sha, sex = target['avatar']['sha256'], target['sex']
        require(target['status'] == 'source-passed' and target_sha == result['targetBodySha256'] == profile['sha256'], 'Target SHA differs from body source')
        require(result.get('sex', sex) == sex and profile['referenceBody'] == sex, 'Target family differs')
        reference = references[sex]
        require(target['sourceBody']['sha256'] == reference['sourceSha'], 'Target original source SHA differs')
        pinned(local(target['avatar']['path']), target_sha)
        pinned(public_path(profile['url']), target_sha)
        contact_candidate = result['status'] == 'source-contact-candidate'
        names = {'fit.json', 'manifest.json'} | ({'fit-report.json'} if kind == 'short' else set()) | ({'contact-report.json'} if contact_candidate else set())
        require(set(result['files']) == names, 'Source payload file set differs')
        payloads = {name: pinned(result['source']/name, result['files'][name]) for name in names}
        manifest, fit = json.loads(payloads['manifest.json']), json.loads(payloads['fit.json'])
        expected_fit = copy.deepcopy(reference['fit']) if kind == 'ponytail' else {
            'schema': 'character-hair-fit-v1', 'styleId': reference['manifest']['id'], 'sourceBodySha256': reference['sourceSha'],
            'assetSha256': reference['assetSha'], 'sourceMaterial': reference['manifest']['sourceMaterial'], 'rawBone': reference['rawHead'],
            'physics': 'rigid', 'geometryReuse': True, 'attachment': MOUNT,
            'hideOriginal': {'materialNames': [reference['manifest']['sourceMaterial']], 'hideWholeBody': False}, 'runtimeAccepted': False}
        expected_fit.update(id=reference['manifest']['id']+'-'+identifier+'-fit-v1', version=1, targetBodySha256=target_sha)
        if kind == 'ponytail':
            validate_colliders(fit['dynamics']['colliders'], expected_fit['dynamics']['colliders'])
            expected_fit['dynamics']['colliders'] = fit['dynamics']['colliders']
        if contact_candidate:
            require(kind == 'short' and args.conditional_manifest, 'Conditional source context missing')
            validate_contact(json.loads(payloads['contact-report.json']), result, reference)
            expected_fit['contactEvidence'] = {'url': f'/assets/{prefix}/{result["relative"]}/contact-report.json', 'sha256': result['files']['contact-report.json'], 'status': 'conditional-transparent-source-contact'}
        require(fit == expected_fit, 'Fit fields differ from pinned source template')
        expected_manifest = copy.deepcopy(reference['manifest'])
        expected_manifest['compatibleBodies'] = [target_sha]
        expected_manifest['fit'] = {'id': fit['id'], 'version': 1, 'url': f'/assets/{prefix}/{result["relative"]}/fit.json', 'sha256': result['files']['fit.json']}
        if contact_candidate:
            expected_manifest['status'] = 'source-contact-candidate-not-visually-accepted'
        require(manifest == expected_manifest, 'Manifest fields differ from pinned source family')
        copies = {name: data for name, data in payloads.items() if name != 'fit-report.json'}
        pending.append((result['relative'], copies))
        label = '长束发 · 当前体型适配候选' if kind == 'ponytail' else ('齐颈短发 · 当前体型适配候选' if manifest['id'] == 'female-bob-v1' else '偏侧短发 · 当前体型适配候选')
        published.append({'id': manifest['id'], 'label': label, 'manifestUrl': f'/assets/{prefix}/{result["relative"]}/manifest.json',
                          'manifestSha256': result['files']['manifest.json'], 'assetSha256': manifest['sha256'], 'sourceMaterial': manifest['sourceMaterial'],
                          'sourceBodySha256': fit['sourceBodySha256'], 'compatibleBodies': manifest['compatibleBodies'], 'legacyImplicitFit': False, 'fit': manifest['fit']})
    catalog_sha = publish(prefix, pending, published)
    print(json.dumps({'published': len(published), 'catalogSHA256': catalog_sha, 'visualAcceptance': 'pending'}))


if __name__ == '__main__':
    main()
