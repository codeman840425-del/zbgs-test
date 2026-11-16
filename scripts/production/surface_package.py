"""Read exact surface-layer source, stored CPU proof and 11 public files."""
import hashlib
import json
import struct

BASE = 'assets-source/m2-surface-layer-v1/'
GENERATED = BASE+'generated/'
SCRIPTS = 'scripts/m2-surface-layer-v1/'
OUTPUT = 'prototype/public/assets/m2-surface-layer-v1/'


def inventory_paths():
    names = [BASE+n for n in ['.gitattributes', 'README.md', 'spec.json', 'provenance.json']]
    names += [SCRIPTS+n for n in ['.gitattributes', 'requirements.txt', 'build.py', 'qa.py', 'qa-output.py', 'publish.py']]
    names += [GENERATED+n for n in ['manifest.json', 'build-report.json', 'qa-report.json', 'output-qa.json']]
    for body in ['female', 'male']:
        names += [GENERATED+body+'-'+n+'.png' for n in ['freckles', 'blush', 'freckles-region', 'blush-region', 'protected']]
    return set(names)


def validate_surface(v, ident, require, GLB):
    inventory = json.loads(v.pin(ident['manifest'], ident['manifestSha256']))
    rows = inventory['files']
    require(len(rows) == 24 and {r['path'] for r in rows} == inventory_paths(), 'Surface inventory incomplete or duplicate')
    for row in rows:
        v.pin(row['path'], row['sha256'], row['bytes'])
    spec = v.json(BASE+'spec.json'); manifest = v.json(GENERATED+'manifest.json'); report = v.json(GENERATED+'build-report.json')
    require(spec['schema'] == 'character-surface-layer-source-v1' and manifest['schema'] == 'character-surface-layer-v1' and
            spec['id'] == manifest['id'] == 'm2-face-surface-layers-v1' and spec['version'] == manifest['version'] == 1,
            'Surface source/manifest identity')
    require(report['sourceParameters'] == spec and report['GPUUsed'] is False and report['runtimeAccepted'] is False and manifest['runtimeAccepted'] is False, 'Surface source-only report identity')
    v.pin(SCRIPTS+'build.py', report['generatorSha256'])
    require(v.json(BASE+'provenance.json')['license'] == manifest['license'] == 'CC0-1.0', 'Surface license identity')
    qa, output_qa = [v.json(GENERATED+n) for n in ['qa-report.json', 'output-qa.json']]
    require(qa['passed'] is True and qa['repeatPngAndManifestBytesExact'] is True and qa['failedInputWrites'] == 0 and
            qa['missingInputExitCode'] == qa['invalidOpacityInputExitCode'] == 2 and qa['runtimeAccepted'] is False, 'Surface stored source QA')
    require(output_qa['passed'] is True and output_qa['runtimeAccepted'] is False and
            all(output_qa[k] is True for k in ['validSingleSideCLIExport', 'repeatBytesAndModificationTimesUnchanged', 'wholePlanCheckedBeforeAnyWrite', 'defaultOutputHashesUnchanged']) and
            all(output_qa[k] == 2 for k in ['defaultConflictExitCode', 'isolatedConflictExitCode', 'boundedOutputExitCode']), 'Surface stored output protection QA')
    require([r['bodyType'] for r in manifest['variants']] == ['female', 'male'], 'Surface exact original variant set')
    require(len(report['traces']) == len(qa['bodies']) == len(qa['sideProof']) == 2, 'Surface complete body proof set')
    payload = {'manifest.json': (v.root/(GENERATED+'manifest.json')).read_bytes()}; bodies = []
    def image(ref, rgba):
        name = ref['url']
        require(isinstance(name, str) and '/' not in name and '\\' not in name and ':' not in name and name.endswith('.png'), 'Unsafe surface image URL')
        data = v.pin(GENERATED+name, ref['sha256'])
        require(data[:16] == b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' and struct.unpack('>II', data[16:24]) == (1024, 1024) and
                data[24:26] == bytes([8, 6 if rgba else 0]), 'Surface PNG dimensions/type')
        require(name not in payload, 'Duplicate surface image reference'); payload[name] = data
    for variant, trace, proof, side in zip(manifest['variants'], report['traces'], qa['bodies'], qa['sideProof']):
        name = variant['bodyType']; ref = spec['bodies'][name]
        body = GLB(v.pin(ref['path'], ref['sha256'])); doc = body.doc
        require(variant['avatarSha256'] == ref['sha256'] and trace['bodyType'] == proof['bodyType'] == name and trace['source'] == ref, 'Surface exact body identity')
        primitive = doc['meshes'][trace['mesh']]['primitives'][trace['primitive']]
        material = doc['materials'][primitive['material']]
        require(material['name'] == variant['materialName'] and material['name'].endswith('_Face_00_SKIN'), 'Surface actual material identity')
        attrs = primitive['attributes']
        for key, index, fmt in [('positionSha256', attrs['POSITION'], 'f'), ('uvSha256', attrs['TEXCOORD_0'], 'f'), ('indexSha256', primitive['indices'], 'I')]:
            data = b''.join(struct.pack('<'+fmt*len(row), *row) for row in body.accessor(index))
            require(hashlib.sha256(data).hexdigest() == trace[key], 'Surface actual geometry identity: '+key)
        props = doc['extensions']['VRM']['materialProperties'][primitive['material']]['textureProperties']
        indexes = [material['pbrMetallicRoughness']['baseColorTexture']['index'], props['_MainTex'], props['_ShadeTexture']]
        require(len(variant['textureReferences']) == 3 and variant['mapAndShadeSameImage'] is True and variant['imageYEqualsUVv'] is True and variant['mapSize'] == [1024, 1024], 'Surface map/shade/orientation contract')
        for usage, index, texture in zip(['baseColorTexture', '_MainTex', '_ShadeTexture'], indexes, variant['textureReferences']):
            image_index = doc['textures'][index]['source']; view = doc['bufferViews'][doc['images'][image_index]['bufferView']]
            encoded = body.binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
            require(texture['usage'] == usage and texture['textureIndex'] == index and texture['imageIndex'] == image_index and
                    texture['sourceTextureSha256'] == variant['sourceTextureSha256'] == hashlib.sha256(encoded).hexdigest() and
                    texture['sourcePixelSha256'] == variant['sourcePixelSha256'] == proof['sourcePixelSha256'], 'Surface actual source texture identity')
        require(proof['sourceAlphaUnchanged'] is True and proof['unloadReturnsExactSourcePixels'] is True and proof['overlapPixels'] > 0 and
                side['body'] == name and side['geometryAliasPixels'] == side['leftOnlyAlphaOnRight'] == 0, 'Surface stored pixel/side proof')
        require([l['id'] for l in variant['layers']] == ['freckles', 'blush'] and len(proof['layers']) == 2, 'Surface independent layer set')
        require(variant['protectedMask']['url'] == name+'-protected.png', 'Surface protected mask body identity')
        image(variant['protectedMask'], False)
        for layer, layer_proof in zip(variant['layers'], proof['layers']):
            require(layer['sourceParameters'] == spec['layers'][layer['id']] and layer['allowedOpacity'] == [0, 1] and
                    layer['order'] == {'freckles': 10, 'blush': 20}[layer['id']] and layer_proof['layer'] == layer['id'] and
                    layer_proof['nonzeroAlphaPixels'] == layer['nonzeroAlphaPixels'] > 0 and layer_proof['protectedChangedPixels'] == 0, 'Surface independent layer/source protection identity')
            require(layer['url'] == name+'-'+layer['id']+'.png' and layer['regionMask']['url'] == name+'-'+layer['id']+'-region.png', 'Surface layer body identity')
            image(layer, True); image(layer['regionMask'], False)
        bodies.append({'bodyType': name, 'avatarSha256': ref['sha256'], 'sourcePixelSha256': variant['sourcePixelSha256']})
    require(len(payload) == 11 and len(qa['actualParameterExportEdits']) == 4 and all(p['otherLayerExact'] is True for p in qa['actualParameterExportEdits']), 'Surface complete payload/independent parameter proof')
    published = (v.root/OUTPUT).exists()
    if published:
        actual = {p.relative_to(v.root/OUTPUT).as_posix() for p in (v.root/OUTPUT).rglob('*') if p.is_file()}
        require(actual == set(payload), 'Surface public file set differs')
        for name, data in payload.items(): v.pin(OUTPUT+name, hashlib.sha256(data).hexdigest(), len(data))
    return {'id': manifest['id'], 'inventoryFiles': len(rows), 'publishedFiles': len(payload), 'bodies': bodies,
            'publishedBytesMatchSource': published, 'runtimeAccepted': False,
            'scope': 'Stored source identity/pixel QA and exact publication. Source-author readback; no independent visual acceptance.'}
