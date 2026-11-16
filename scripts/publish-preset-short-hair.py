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
SPEC_PINS_V2 = {
    'short': ('assets-source/m2-preset-short-hair-fits-v2/spec.json', '3509644d3ec6dacd889ad4355f4b7edcf9ea4272843d5640c75dbad620af5cb4'),
    'ponytail': ('assets-source/m2-preset-ponytail-fits-v2/spec.json', 'acee8258c9aad43de9db0b122c1c6c7f772354bae8bec781a795836b09ba63a4'),
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
    return {'bodyBytes': body, 'assetBytes': asset, 'manifest': manifest, 'fit': source_fit, 'sourceSha': source_sha, 'assetSha': asset_sha, 'rawHead': body_doc['nodes'][head]['name'],
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


def validate_contact(contact, result, reference, poses=None, positive_depth=False):
    require(contact['targetId'] == result['targetId'] and contact['targetBodySha256'] == result['targetBodySha256'], 'Contact target differs')
    require(contact['sourceAssetSha256'] == reference['assetSha'] and contact['sourceTextureSha256'] == reference['textureSha'], 'Contact source identity differs')
    require(contact['policy'] == 'transparent-source-texels' and reference['alphaMode'] == 'BLEND' and reference['blendMode'] == 2, 'Unsupported contact alpha mechanism')
    records = contact['records']
    if poses is None:
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
            require(finite(depth) and (depth > 0 if positive_depth else depth >= 0), 'Invalid contact depth')
            footprints = measurement['positiveDepthTextureFootprints']
            require(len(footprints) == 2 and all(type(p['flipV']) is bool for p in footprints) and {p['flipV'] for p in footprints} == {True, False}, 'Both V orientations required')
            require(all(type(p['conservativeTexelFootprint']) is int and p['conservativeTexelFootprint'] > 0 and type(p['maxAlpha0To255']) is int and p['maxAlpha0To255'] == 0 for p in footprints), 'Empty or opaque contact texel footprint')
        maximum = max(m['targetProjectedPlaneDepthM'] for m in measurements)
        require(finite(summary['maxProjectedPlaneDepthM']) and math.isclose(summary['maxProjectedPlaneDepthM'], maximum, rel_tol=1e-10, abs_tol=1e-12), 'Contact depth summary differs')


def validate_evidence_v2(payloads, result, reference, target, kind, prefix):
    import numpy as np

    evidence = json.loads(payloads['evidence.json'])
    geometry = json.loads(payloads['geometry-report.json'])
    contact = json.loads(payloads['contact-report.json'])
    base_url = f'/assets/{prefix}/{result["targetId"]}/'
    require(evidence['schema'] == 'hair-fit-evidence-v2' and evidence['targetId'] == result['targetId'], 'Measured evidence target differs')
    require(evidence['targetBodySha256'] == target['avatar']['sha256'] and evidence['assetSha256'] == reference['assetSha'], 'Measured evidence resource identity differs')
    require(evidence['allAuthoredEndpointsMeasured'] is True and evidence['originalCapUnchanged'] is True and evidence['originalHeadSurfaceUnchanged'] is False, 'V2 dependency criterion differs')
    for key, name in [('geometryReport', 'geometry-report.json'), ('contactReport', 'contact-report.json')] + ([('proxyReport', 'proxy-report.json')] if kind == 'ponytail' else []):
        require(evidence[key] == {'url': base_url+name, 'sha256': result['files'][name]}, 'Measured report reference differs')
    require(geometry['schema'] == 'measured-v2-hair-authored-endpoints-v1' and geometry['failure'] is None and geometry['runtimeAccepted'] is False, 'Measured geometry failed')
    require(geometry['actualTargetAll55FaceEndpoints'] is True and result['completeEndpoints'] is True and result['actualGeometryFailure'] is None, 'Incomplete endpoint result')
    require(evidence['runtimeAccepted'] is False and contact['runtimeAccepted'] is False, 'Source evidence must retain pending runtime acceptance')
    require(geometry['inclusiveCoordinateSpace'] == 'Exact authored raw-head-local asset POSITION, body/face endpoints transformed by original exact head inverse bind; no asset modelspace round-trip', 'Inclusive contact coordinate definition differs')
    require(contact['sourceTextureSha256'] == reference['textureSha'] and contact['freshTargetEndpointCalculation'] is True, 'Contact texture or calculation identity differs')
    original = glb_parts(reference['bodyBytes'])
    changed = glb_parts(pinned(local(target['avatar']['path']), target['avatar']['sha256']))
    old_doc, new_doc = original[0], changed[0]

    def array(model, index):
        document, binary = model
        accessor = document['accessors'][index]
        require('sparse' not in accessor, 'Sparse hair dependencies unsupported')
        view = document['bufferViews'][accessor['bufferView']]
        require(view.get('buffer', 0) == 0, 'External hair dependency buffer unsupported')
        dtype = np.dtype({5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[accessor['componentType']])
        components = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[accessor['type']]
        return np.ndarray((accessor['count'], components), dtype, buffer=binary,
                          offset=view.get('byteOffset', 0)+accessor.get('byteOffset', 0),
                          strides=(view.get('byteStride', components*dtype.itemsize), dtype.itemsize))

    require(old_doc['nodes'] == new_doc['nodes'] and old_doc['skins'] == new_doc['skins'], 'Actual raw node/skin dependency differs')
    for old_skin, new_skin in zip(old_doc['skins'], new_doc['skins']):
        require(np.array_equal(array(original, old_skin['inverseBindMatrices']), array(changed, new_skin['inverseBindMatrices'])), 'Actual inverse binds differ')
    require(old_doc['materials'] == new_doc['materials'] and old_doc.get('textures') == new_doc.get('textures'), 'Actual body material/texture dependency differs')
    def images(model):
        doc, binary = model
        result = []
        for image in doc.get('images', []):
            view = doc['bufferViews'][image['bufferView']]
            start = view.get('byteOffset', 0)
            result.append((image.get('mimeType'), digest(binary[start:start+view['byteLength']])))
        return result
    require(images(original) == images(changed), 'Actual embedded images differ')
    head = next(b['node'] for b in old_doc['extensions']['VRM']['humanoid']['humanBones'] if b['bone'] == 'head')
    skin = old_doc['skins'][0]
    inverse = array(original, skin['inverseBindMatrices'])[skin['joints'].index(head)].astype(float).reshape(4, 4).T
    rows = {(r['mesh'], r['primitive']): r for r in geometry['primitives']}
    expected_rows = {(mi, pi) for mi, mesh in enumerate(old_doc['meshes']) for pi in range(len(mesh['primitives']))}
    require(len(rows) == len(geometry['primitives']) and set(rows) == expected_rows and len(old_doc['meshes']) == len(new_doc['meshes']), 'Incomplete measured primitive set')
    expected_contacts, neutral_changes, measurement_inputs = {}, [], {}
    maximum_morphs = 0
    for mi, old_mesh in enumerate(old_doc['meshes']):
        require(len(old_mesh['primitives']) == len(new_doc['meshes'][mi]['primitives']), 'Actual primitive count differs')
        for pi, before in enumerate(old_mesh['primitives']):
            after = new_doc['meshes'][mi]['primitives'][pi]
            row = rows[mi, pi]
            material = old_doc['materials'][before['material']]['name']
            indices = array(original, before['indices']).reshape(-1, 3)
            used = np.unique(indices)
            require(row['material'] == material and before['material'] == after['material'] and np.array_equal(indices, array(changed, after['indices']).reshape(-1, 3)), 'Actual material/topology differs')
            require(set(before['attributes']) == set(after['attributes']), 'Actual attribute set differs')
            for attribute in set(before['attributes']) - {'POSITION', 'NORMAL'}:
                require(np.array_equal(array(original, before['attributes'][attribute]), array(changed, after['attributes'][attribute])), 'Actual UV/skin dependency differs')
            a = array(original, before['attributes']['POSITION']).astype(float)
            b = array(changed, after['attributes']['POSITION']).astype(float)
            old_morphs, new_morphs = before.get('targets', []), after.get('targets', [])
            require(len(old_morphs) == len(new_morphs) == row['morphEndpoints'], 'Actual morph count differs')
            maximum_morphs = max(maximum_morphs, len(new_morphs))
            poses = {'neutral': (a, b)}
            for i, (old_morph, new_morph) in enumerate(zip(old_morphs, new_morphs)):
                poses['morph-'+str(i)] = (a+array(original, old_morph['POSITION']).astype(float), b+array(changed, new_morph['POSITION']).astype(float))
            checks = {p['pose']: p for p in row['poseChecks']}
            require(len(checks) == len(row['poseChecks']) and set(checks) == set(poses), 'Actual authored endpoint set differs')
            joints, weights = array(original, before['attributes']['JOINTS_0']), array(original, before['attributes']['WEIGHTS_0']).astype(float)
            local_positions = (np.column_stack((a, np.ones(len(a))))@inverse.T)[:, :3]
            head_weight = np.where(joints == skin['joints'].index(head), weights, 0).sum(1)
            protected = used[(head_weight[used] > .98)&((local_positions[used, 1] >= .06)|(local_positions[used, 2] >= -.025)|('SKIN' not in material))]
            fixed = any(token in material for token in ['HAIR', '_EYE', 'FaceMouth', 'Eyeline', 'Eyelash', 'FaceBrow'])
            if fixed:
                require(np.array_equal(array(original, before['attributes']['NORMAL'])[used], array(changed, after['attributes']['NORMAL'])[used]), 'Actual cap/eye/mouth normals differ')
            for pose, (source_pose, target_pose) in poses.items():
                check = checks[pose]
                require(np.isfinite(target_pose).all() and check['targetPositionSha256'] == digest(target_pose[used].astype('<f4').tobytes()), 'Measured endpoint bytes differ from actual target')
                if fixed:
                    require(np.array_equal(source_pose[used], target_pose[used]), 'Actual cap/eye/mouth endpoint differs')
                changed_vertices = used[np.any(source_pose[used] != target_pose[used], axis=1)]
                changed_triangles = np.flatnonzero(np.any(np.isin(indices, changed_vertices), axis=1))
                require(check['changedTriangles'] == len(changed_triangles), 'Changed-triangle evidence differs: '+material+'/'+pose)
                protected_error = float(np.max(abs(source_pose[protected]-target_pose[protected]), initial=0))
                require(finite(check['protectedPositionMaxErrorM']) and math.isclose(check['protectedPositionMaxErrorM'], protected_error, abs_tol=1e-12), 'Side-head displacement evidence differs')
                pairs = check['allIntroducedPairs']
                require(isinstance(pairs, list) and len({tuple(p) for p in pairs}) == len(pairs), 'Duplicate measured intersection pair')
                require(all(len(p) == 2 and type(p[0]) is int and 0 <= p[0] < reference['hairTriangles'] and type(p[1]) is int and 0 <= p[1] < len(indices) for p in pairs), 'Measured intersection index differs')
                require('introducedStrictPairs' in check and set(map(tuple, check['introducedStrictPairs'])).issubset(map(tuple, pairs)), 'Strict intersections missing from inclusive union')
                require(all(type(check[k]) is int and check[k] >= 0 for k in ['sourcePairs','targetPairs','sourceInclusivePairs','targetInclusivePairs']), 'Missing intersection metrics')
                require(len(pairs) >= max(0, check['targetPairs']-check['sourcePairs'], check['targetInclusivePairs']-check['sourceInclusivePairs']), 'Introduced-pair set omits reported new crossings')
                if pairs:
                    expected_contacts[material, pose] = set(map(tuple, pairs))
                    measurement_inputs[material, pose] = (source_pose, target_pose, indices)
                if pose == 'neutral':
                    altered = protected[np.max(abs(source_pose[protected]-target_pose[protected]), axis=1) >= 1e-7]
                    if len(altered):
                        neutral_changes.append({'mesh': mi, 'primitive': pi, 'material': material, 'vertices': altered.tolist(), 'sourceHeadLocalM': local_positions[altered].tolist(),
                            'targetHeadLocalM': ((np.column_stack((target_pose[altered], np.ones(len(altered))))@inverse.T)[:, :3]).tolist(),
                            'maxDisplacementM': float(np.linalg.norm(target_pose[altered]-source_pose[altered], axis=1).max())})
    endpoints = maximum_morphs+1
    require(endpoints == (57 if target['sex'] == 'female' else 55), 'Actual family endpoint count differs')
    require(geometry['faceAuthoredMorphCount'] == maximum_morphs and geometry['faceEndpointCountIncludingNeutral'] == endpoints == evidence['faceEndpointCountIncludingNeutral'], 'Measured face endpoint summary differs')
    require(neutral_changes and geometry['neutralHeadChanges'] == evidence['neutralHeadChanges'] == neutral_changes, 'Actual changed head surface evidence differs')
    added = sum(len(pairs) for pairs in expected_contacts.values())
    require(type(evidence['introducedPairsAcrossEndpoints']) is int and evidence['introducedPairsAcrossEndpoints'] == added, 'Introduced-pair total differs')
    require((result['status'] == 'source-contact-candidate') == (added > 0), 'Conditional source status differs from actual evidence')
    records = contact['records']
    require(len(records) == len({(r['material'], r['pose']) for r in records}) and {(r['material'], r['pose']) for r in records} == set(expected_contacts), 'Contact measurement coverage differs')
    for record in records:
        require({(m['hairTriangle'], m['targetTriangle']) for m in record['measurements']} == expected_contacts[record['material'], record['pose']], 'Contact pair measurements differ')
    if added:
        adapted = {'targetId': result['targetId'], 'targetBodySha256': result['targetBodySha256'], 'sourceAssetSha256': reference['assetSha'],
                   'sourceTextureSha256': contact['sourceTextureSha256'], 'policy': 'transparent-source-texels', 'records': records}
        validate_contact(adapted, result, reference, poses={r['pose'] for r in records}, positive_depth=True)
        # Reuse the pinned pure measurement helper against the actual triangles
        # and embedded image. No builder or exporter entry point executes.
        import importlib.util
        import io
        from PIL import Image
        helper = reference['contactHelper']
        helper_path = local(helper['path'])
        pinned(helper_path, helper['sha256'])
        loader = importlib.util.spec_from_file_location('hair_contact_measurement', helper_path)
        measurement = importlib.util.module_from_spec(loader)
        loader.loader.exec_module(measurement)
        asset = glb_parts(reference['assetBytes'])
        primitive = asset[0]['meshes'][0]['primitives'][0]
        hair_positions = array(asset, primitive['attributes']['POSITION']).astype(float)
        hair_indices = array(asset, primitive['indices']).reshape(-1, 3)
        hair_uv = array(asset, primitive['attributes']['TEXCOORD_0']).astype(float)
        world_hair = (np.column_stack((hair_positions, np.ones(len(hair_positions))))@np.linalg.inv(inverse).T)[:, :3]
        texture = asset[0]['materials'][primitive['material']]['pbrMetallicRoughness']['baseColorTexture']['index']
        image_ref = asset[0]['images'][asset[0]['textures'][texture]['source']]
        view = asset[0]['bufferViews'][image_ref['bufferView']]
        start = view.get('byteOffset', 0)
        image_bytes = asset[1][start:start+view['byteLength']]
        require(digest(image_bytes) == contact['sourceTextureSha256'], 'Measured image bytes differ')
        image = Image.open(io.BytesIO(image_bytes)).convert('RGBA')
        for record in records:
            source_pose, target_pose, indices = measurement_inputs[record['material'], record['pose']]
            for actual in record['measurements']:
                hair_id, face_id = actual['hairTriangle'], actual['targetTriangle']
                measured = measurement.measure_pair(world_hair[hair_indices[hair_id]], source_pose[indices[face_id]], target_pose[indices[face_id]], hair_uv[hair_indices[hair_id]], image, inverse)
                expected = {'hairTriangle': hair_id, 'targetTriangle': face_id, **measured}
                require(actual == expected, 'Contact measurement differs from actual triangles/texture')
    if kind == 'ponytail':
        proxy = json.loads(payloads['proxy-report.json'])
        require(proxy['target'] == target['avatar'] and proxy['sourceAssetSha256'] == reference['assetSha'], 'Proxy target/source differs')
        require(proxy['auxiliaryBonesInverseBindsGeometryUnchanged'] is True and proxy['springJointsAndReferenceUnchanged'] is True, 'Proxy dependency changes unverified')
        reported_colliders = []
        for change in proxy['proxyChanges']:
            measured = change['target']
            node = next(b['node'] for b in new_doc['extensions']['VRM']['humanoid']['humanBones'] if b['bone'] == change['bone'])
            raw_inverse = array(changed, new_doc['skins'][0]['inverseBindMatrices'])[new_doc['skins'][0]['joints'].index(node)].astype(float).reshape(4, 4).T
            conversion = raw_inverse@np.linalg.inv(inverse)
            endpoints = np.array([measured['headLocalOffset'], measured['headLocalTail']])
            bone_local = (np.column_stack((endpoints, np.ones(2)))@conversion.T)[:, :3]
            collider = {'bone': change['bone'], 'shape': change['shape'], 'offset': bone_local[0].tolist(), 'radius': measured['radius']}
            if collider['shape'] == 'capsule':
                collider['tail'] = bone_local[1].tolist()
            reported_colliders.append(collider)
        require(json.loads(payloads['fit.json'])['dynamics']['colliders'] == reported_colliders, 'Fit colliders differ from measured target proxies')
        require(proxy['restSpringProxyMargins'] and all(finite(r['minimumM']) and r['minimumM'] >= 0 and r['tailSphereMarginsM'] and all(finite(v) and v >= 0 for v in r['tailSphereMarginsM']) and math.isclose(min(r['tailSphereMarginsM']), r['minimumM'], abs_tol=1e-12) for r in proxy['restSpringProxyMargins']), 'Proxy rest clearance evidence failed')


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
    parser.add_argument('--revision', type=int, choices=(1, 2), default=1)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--kind', choices=['short', 'ponytail'], default='short')
    parser.add_argument('--conditional-manifest', type=Path)
    args = parser.parse_args()
    kind = args.kind
    revision = args.revision
    spec_path, spec_sha = (SPEC_PINS if revision == 1 else SPEC_PINS_V2)[kind]
    spec = json.loads(pinned(local(spec_path), spec_sha))
    body_manifest = BODY_MANIFEST if revision == 1 else 'assets-source/m2-representative-batch-v2/generated/manifest.json'
    body_bytes = local(body_manifest).read_bytes()
    body = json.loads(body_bytes)
    require(body['schema'] == 'character-representative-batch-v1', 'Unsupported body manifest')
    require(body.get('version') == revision, 'Body manifest revision differs')
    all_targets = {row['id']: row for row in body['variants']}
    require(len(all_targets) == len(body['variants']), 'Duplicate body target')
    targets = all_targets if revision == 1 else {identifier: row for identifier, row in all_targets.items() if row['status'] == 'source-passed'}
    if revision == 2:
        require(len(targets) == 6 and set(all_targets) - set(targets) == {'female-long-slender-v2', 'male-long-lean-v2'}, 'Expected six measured v2 targets and two source failures')
        require(all(all_targets[key]['status'] == 'failed' for key in set(all_targets) - set(targets)), 'Unpublished body outcome differs')
        require(spec['batchManifest'] == {'path': body_manifest, 'sha256': digest(body_bytes)}, 'Pinned spec body source differs')
    runtime = json.loads(local(f'prototype/public/assets/m2-representative-batch-v{revision}/runtime-index.json').read_bytes())
    require(runtime['sourceManifestSha256'] == digest(body_bytes), 'Runtime index body source differs')
    profiles = {row['id']: row['profile'] for row in runtime['presets']}
    require(len(profiles) == len(runtime['presets']) and set(profiles) == set(targets), 'Runtime target set differs')
    batch = json.loads(args.manifest.read_bytes())
    prefix = f'm2-preset-{"short-hair" if kind == "short" else "ponytail"}-fits-v{revision}'
    if revision == 2:
        require(not args.conditional_manifest, 'V2 measured results share one canonical batch')
        require(args.manifest.resolve() == local('assets-source/' + prefix + '/generated/manifest.json'), 'V2 requires canonical generated source batch')
        schema = 'preset-short-hair-fit-batch-v2' if kind == 'short' else 'preset-ponytail-fit-batch-v2'
        require(batch['schema'] == schema and batch['spec' if kind == 'short' else 'sourceSpec'] == spec, 'Measured batch source spec differs')
        expected = set(targets) if kind == 'short' else {identifier for identifier, target in targets.items() if target['sex'] == 'female'}
        require(len(batch['results']) == len(expected) and {r['targetId'] for r in batch['results']} == expected, 'Measured batch target set differs')
        for helper in spec['helpers']:
            pinned(local(helper['path']), helper['sha256'])
        references = {sex: template(family, kind) for sex, family in spec['families'].items()} if kind == 'short' else {'female': template(spec, kind)}
        contact_helper = next(h for h in spec['helpers'] if h['path'] == 'scripts/m2-preset-short-hair-fits-v1/contact_geometry.py')
        for reference in references.values():
            reference['contactHelper'] = contact_helper
        require(all(row['status'] in ['source-fit-ready-measured-v2', 'source-contact-candidate-measured-v2'] for row in batch['results']), 'Incomplete measured batch retains failed targets')
        results = [dict(row, source=args.manifest.parent/row['targetId'], relative=row['targetId']) for row in batch['results']]
    elif kind == 'short':
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
        if revision == 2 and result['status'] in ['source-fit-ready-measured-v2', 'source-contact-candidate-measured-v2']:
            result['status'] = 'source-fit-ready' if result['status'] == 'source-fit-ready-measured-v2' else 'source-contact-candidate'
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
        names = ({'fit.json', 'manifest.json', 'evidence.json', 'geometry-report.json', 'contact-report.json'} | ({'proxy-report.json'} if kind == 'ponytail' else set())) if revision == 2 else ({'fit.json', 'manifest.json'} | ({'fit-report.json'} if kind == 'short' else set()) | ({'contact-report.json'} if contact_candidate else set()))
        require(set(result['files']) == names, 'Source payload file set differs')
        payloads = {name: pinned(result['source']/name, result['files'][name]) for name in names}
        manifest, fit = json.loads(payloads['manifest.json']), json.loads(payloads['fit.json'])
        expected_fit = copy.deepcopy(reference['fit']) if kind == 'ponytail' else {
            'schema': 'character-hair-fit-v1', 'styleId': reference['manifest']['id'], 'sourceBodySha256': reference['sourceSha'],
            'assetSha256': reference['assetSha'], 'sourceMaterial': reference['manifest']['sourceMaterial'], 'rawBone': reference['rawHead'],
            'physics': 'rigid', 'geometryReuse': True, 'attachment': MOUNT,
            'hideOriginal': {'materialNames': [reference['manifest']['sourceMaterial']], 'hideWholeBody': False}, 'runtimeAccepted': False}
        expected_fit.update(id=reference['manifest']['id']+'-'+identifier+'-fit-v'+str(revision), version=revision, targetBodySha256=target_sha)
        if kind == 'ponytail':
            validate_colliders(fit['dynamics']['colliders'], expected_fit['dynamics']['colliders'])
            expected_fit['dynamics']['colliders'] = fit['dynamics']['colliders']
        if revision == 2:
            validate_evidence_v2(payloads, result, reference, target, kind, prefix)
            expected_fit['fitEvidence'] = {'schema': 'hair-fit-evidence-v2', 'url': f'/assets/{prefix}/{identifier}/evidence.json', 'sha256': result['files']['evidence.json']}
        elif contact_candidate:
            require(kind == 'short' and args.conditional_manifest, 'Conditional source context missing')
            validate_contact(json.loads(payloads['contact-report.json']), result, reference)
            expected_fit['contactEvidence'] = {'url': f'/assets/{prefix}/{result["relative"]}/contact-report.json', 'sha256': result['files']['contact-report.json'], 'status': 'conditional-transparent-source-contact'}
        require(fit == expected_fit, 'Fit fields differ from pinned source template')
        expected_manifest = copy.deepcopy(reference['manifest'])
        if revision == 2 and kind == 'short':
            expected_manifest['version'] = 2
        expected_manifest['compatibleBodies'] = [target_sha]
        expected_manifest['fit'] = {'id': fit['id'], 'version': revision, 'url': f'/assets/{prefix}/{result["relative"]}/fit.json', 'sha256': result['files']['fit.json']}
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
