"""Independent CPU readback of the eight representative source presets.

Consumes the producer's character-representative-batch-v1 manifest. Does not
run exporters, publish assets, infer visual acceptance, or edit source files.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import sys
import time

import numpy as np

sys.dont_write_bytecode = True
EXPECTED = {
    'female-round-full': 'female', 'female-long-slender': 'female',
    'female-square-athletic': 'female', 'female-soft-wide': 'female',
    'male-wide-muscular': 'male', 'male-long-lean': 'male',
    'male-round-stocky': 'male', 'male-angular-athletic': 'male',
}
BODY_SHA = {
    'female': '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',
    'male': '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',
}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def equal(a, b):
    return a.dtype == b.dtype and a.shape == b.shape and a.tobytes() == b.tobytes()


class Audit:
    def __init__(self, root):
        self.root = root.resolve()
        self.files = {}
        self.checks = []
        spec = importlib.util.spec_from_file_location('existing_glb_reader', self.root / 'scripts/m2-male-face-v1/glb.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.glb = module.GLB
        self.read('scripts/m2-male-face-v1/glb.py')

    def check(self, name, passed, detail=None):
        self.checks.append({'name': name, 'passed': bool(passed), 'detail': detail})
        return bool(passed)

    def resolve(self, name):
        path = (self.root / name).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError('Path leaves selected source root: ' + str(name))
        return path

    def read(self, name, expected=None, size=None):
        path = self.resolve(name)
        raw = path.read_bytes()
        record = {'path': path.relative_to(self.root).as_posix(), 'sha256': digest(raw), 'bytes': len(raw)}
        self.files[record['path']] = record
        if expected is not None and record['sha256'] != expected:
            raise ValueError('SHA mismatch: ' + str(name))
        if size is not None and len(raw) != size:
            raise ValueError('Byte count mismatch: ' + str(name))
        return raw

    def ref(self, reference):
        return self.read(reference['path'], reference['sha256'], reference.get('bytes'))

    def json_ref(self, reference):
        return json.loads(self.ref(reference))

    def bones(self, model):
        result = {}
        for skin in model.doc.get('skins', []):
            for index, matrix in zip(skin['joints'], model.acc(skin['inverseBindMatrices'])):
                name = model.doc['nodes'][index]['name']
                if name in result and not equal(result[name], matrix):
                    raise ValueError('Conflicting inverse binds for ' + name)
                result[name] = matrix
        return result

    def compare_avatar(self, source, target):
        result = {'primitives': [], 'morphTargets': [], 'changedVertices': 0, 'paletteDependencies': [], 'hairDependencies': []}
        self.check('mesh-count', len(source.doc['meshes']) == len(target.doc['meshes']))
        self.check('nodes-preserved', source.doc['nodes'] == target.doc['nodes'])
        old_bones, new_bones = self.bones(source), self.bones(target)
        self.check('all-inverse-binds-preserved', old_bones.keys() == new_bones.keys() and all(equal(a, new_bones[n]) for n, a in old_bones.items()))
        old_vrm = source.doc.get('extensions', {}).get('VRM', {})
        new_vrm = target.doc.get('extensions', {}).get('VRM', {})
        self.check('humanoid-preserved', old_vrm.get('humanoid') == new_vrm.get('humanoid'))
        self.check('expression-bindings-preserved', old_vrm.get('blendShapeMaster') == new_vrm.get('blendShapeMaster'))
        self.check('embedded-images-preserved', source.images() == target.images())
        self.check('materials-preserved', source.doc.get('materials') == target.doc.get('materials'))
        self.check('vrm-material-properties-preserved', old_vrm.get('materialProperties') == new_vrm.get('materialProperties'))
        result['embeddedImages'] = {'source': source.images(), 'output': target.images()}
        positions_old, positions_new = [], []
        seen_position_accessors = set()
        for mi, (old_mesh, new_mesh) in enumerate(zip(source.doc['meshes'], target.doc['meshes'])):
            self.check('primitive-count-' + str(mi), len(old_mesh['primitives']) == len(new_mesh['primitives']))
            self.check('morph-names-' + str(mi), old_mesh.get('extras', {}).get('targetNames') == new_mesh.get('extras', {}).get('targetNames'))
            for pi, (old, new) in enumerate(zip(old_mesh['primitives'], new_mesh['primitives'])):
                label = str(mi) + '/' + str(pi)
                index_a, index_b = source.acc(old['indices']), target.acc(new['indices'])
                self.check('topology-' + label, equal(index_a, index_b))
                self.check('attribute-set-' + label, old['attributes'].keys() == new['attributes'].keys())
                material = source.doc['materials'][old['material']]['name']
                used = np.unique(index_a)
                if any(name in material for name in ['Face_00_SKIN', 'FaceMouth', 'EyeIris']):
                    result['paletteDependencies'].append({'material': material,
                        'materialJsonExactlyEqual': source.doc['materials'][old['material']] == target.doc['materials'][new['material']],
                        'imagesExactlyEqual': source.images() == target.images(),
                        'indicesExactlyEqual': equal(index_a, index_b),
                        'uvExactlyEqual': equal(source.acc(old['attributes']['TEXCOORD_0']), target.acc(new['attributes']['TEXCOORD_0'])),
                        'scope': 'Source texture coordinates/material identity for reuse review. New-body palette admission still requires explicit identity and runtime checks.'})
                attributes = {}
                for key, accessor in old['attributes'].items():
                    a, b = source.acc(accessor), target.acc(new['attributes'][key])
                    attributes[key] = {'sourceSha256': digest(a.tobytes()), 'outputSha256': digest(b.tobytes()), 'equal': equal(a, b)}
                    self.check('finite-' + label + '/' + key, np.isfinite(b).all())
                    self.check('attribute-shape-' + label + '/' + key, a.shape == b.shape)
                    if key not in ('POSITION', 'NORMAL', 'TANGENT'):
                        self.check('preserved-' + label + '/' + key, equal(a, b))
                a, b = source.acc(old['attributes']['POSITION']), target.acc(new['attributes']['POSITION'])
                delta = np.linalg.norm(b.astype(float) - a.astype(float), axis=1)
                changed = int(np.count_nonzero(delta[used] > 1e-7))
                accessor_pair = (old['attributes']['POSITION'], new['attributes']['POSITION'])
                if accessor_pair not in seen_position_accessors:
                    seen_position_accessors.add(accessor_pair)
                    result['changedVertices'] += int(np.count_nonzero(delta > 1e-7))
                    positions_old.append(a)
                    positions_new.append(b)
                if 'HairBack' in material or 'Body_00_SKIN' in material:
                    selected = used
                    label_region = 'original-cap'
                    if 'Body_00_SKIN' in material:
                        label_region = 'head-neck-weighted-body-scalp-proxy'
                        mesh_node = next(n for n in source.doc['nodes'] if n.get('mesh') == mi)
                        skin = source.doc['skins'][mesh_node['skin']]
                        head_joints = [i for i, node in enumerate(skin['joints']) if source.doc['nodes'][node]['name'] in ['J_Bip_C_Head', 'J_Bip_C_Neck']]
                        joints = source.acc(old['attributes']['JOINTS_0'])[used]
                        weights = source.acc(old['attributes']['WEIGHTS_0'])[used]
                        selected = used[np.any(np.isin(joints, head_joints) & (weights > 0), axis=1)]
                    region_changed = selected[delta[selected] > 1e-7]
                    result['hairDependencies'].append({'region': label_region, 'material': material,
                        'vertices': len(selected), 'changedPositionVerticesAbove1eMinus7M': len(region_changed),
                        'maximumDisplacementM': float(delta[selected].max()) if len(selected) else 0,
                        'sourceChangedBoundsLocalM': [a[region_changed].min(0).tolist(), a[region_changed].max(0).tolist()] if len(region_changed) else None,
                        'attributesExactlyEqual': {key: equal(source.acc(accessor)[selected], target.acc(new['attributes'][key])[selected]) for key, accessor in old['attributes'].items()},
                        'scope': 'Original cap and positive Head/Neck-weighted Body selection in source mesh local coordinates. Region selection alone does not define entire anatomical scalp or hair fit.'})
                normal = target.acc(new['attributes']['NORMAL'])
                lengths = np.linalg.norm(normal[used], axis=1)
                self.check('nonzero-normals-' + label, (lengths > .5).all() and (lengths < 1.5).all())
                result['primitives'].append({'mesh': mi, 'primitive': pi, 'material': material, 'attributes': attributes,
                    'changedVerticesAbove1eMinus7M': changed, 'maximumDisplacementM': float(delta[used].max()),
                    'normalLengthRange': [float(lengths.min()), float(lengths.max())]})
                old_targets, new_targets = old.get('targets', []), new.get('targets', [])
                self.check('morph-count-' + label, len(old_targets) == len(new_targets))
                morphs = []
                for ti, (before, after) in enumerate(zip(old_targets, new_targets)):
                    self.check('morph-attributes-' + label + '/' + str(ti), set(before).issubset(after) and set(after).difference(before).issubset({'NORMAL'}))
                    for key in after:
                        if key not in before:
                            y = target.acc(after[key])
                            audit_shape = source.acc(old['attributes']['POSITION']).shape
                            self.check('added-morph-normal-' + label + '/' + str(ti), key == 'NORMAL' and y.shape == audit_shape and np.isfinite(y).all())
                            morphs.append({'target': ti, 'attribute': key, 'sourceSha256': None, 'outputSha256': digest(y.tobytes()), 'declaredAddedNormal': True})
                            continue
                        accessor = before[key]
                        x, y = source.acc(accessor), target.acc(after[key])
                        self.check('morph-finite-shape-' + label + '/' + str(ti) + '/' + key, x.shape == y.shape and np.isfinite(y).all())
                        morphs.append({'target': ti, 'attribute': key, 'sourceSha256': digest(x.tobytes()),
                                       'outputSha256': digest(y.tobytes()), 'exactEqual': equal(x, y)})
                result['morphTargets'].append({'mesh': mi, 'primitive': pi, 'attributes': morphs})
        a = np.concatenate(positions_old).astype(float)
        b = np.concatenate(positions_new).astype(float)
        center_a, center_b = a.mean(0), b.mean(0)
        aa, bb = a - center_a, b - center_b
        scale = float(np.sum(aa * bb) / np.sum(aa * aa))
        residual = np.linalg.norm(bb - scale * aa, axis=1)
        result['changedVertexCountScope'] = 'Unique POSITION accessors, threshold 1e-7m. Per-primitive counts use referenced indices only.'
        result['uniformScaleFit'] = {'scale': scale, 'maximumResidualM': float(residual.max()), 'rmsResidualM': float(np.sqrt(np.mean(residual ** 2)))}
        self.check('real-geometry-change', result['changedVertices'] > 0)
        self.check('not-only-global-uniform-scale-and-translation', residual.max() > 1e-5)
        result['positionContentSha256'] = digest(np.concatenate(positions_new).tobytes())
        result['scope'] = 'Source bind arrays. Morph hashes and finite values do not establish expression quality or naturalness.'
        return result

    def image_payloads(self, reference):
        path = self.resolve(reference['path'])
        asset = self.glb(path)
        results = []
        for image in asset.doc.get('images', []):
            view = asset.doc['bufferViews'][image['bufferView']]
            offset = view.get('byteOffset', 0)
            payload = asset.bin[offset:offset + view['byteLength']]
            results.append({'resource': reference['path'], 'sha256': digest(payload), 'bytes': len(payload), 'mimeType': image.get('mimeType')})
        return results

    def garment(self, item, avatar, directory, source_reference):
        name = Path(item['url']).name
        path = (directory / name).relative_to(self.root).as_posix()
        self.read(path, item['sha256'], item.get('bytes'))
        garment = self.glb(self.resolve(path))
        self.ref(source_reference)
        source = self.glb(self.resolve(source_reference['path']))
        self.check('garment-mesh-count-' + item['id'], len(source.doc['meshes']) == len(garment.doc['meshes']))
        self.check('garment-materials-' + item['id'], source.doc.get('materials') == garment.doc.get('materials'))
        self.check('garment-images-' + item['id'], (source.images() if source.doc.get('images') else []) == (garment.images() if garment.doc.get('images') else []))
        primitive_results = []
        for mi, (before_mesh, after_mesh) in enumerate(zip(source.doc['meshes'], garment.doc['meshes'])):
            self.check('garment-primitive-count-' + item['id'] + '/' + str(mi), len(before_mesh['primitives']) == len(after_mesh['primitives']))
            for pi, (before, after) in enumerate(zip(before_mesh['primitives'], after_mesh['primitives'])):
                label = item['id'] + '/' + str(mi) + '/' + str(pi)
                self.check('garment-topology-' + label, equal(source.acc(before['indices']), garment.acc(after['indices'])))
                self.check('garment-attribute-set-' + label, before['attributes'].keys() == after['attributes'].keys())
                attributes = {}
                used = np.unique(source.acc(before['indices']))
                for key, accessor in before['attributes'].items():
                    a, b = source.acc(accessor), garment.acc(after['attributes'][key])
                    self.check('garment-attribute-shape-finite-' + label + '/' + key, a.shape == b.shape and np.isfinite(b).all())
                    if key not in ('POSITION', 'NORMAL', 'TANGENT'):
                        self.check('garment-preserved-' + label + '/' + key, equal(a, b))
                    attributes[key] = {'sourceSha256': digest(a.tobytes()), 'outputSha256': digest(b.tobytes()), 'equal': equal(a, b)}
                a, b = source.acc(before['attributes']['POSITION']), garment.acc(after['attributes']['POSITION'])
                delta = np.linalg.norm(b[used].astype(float) - a[used].astype(float), axis=1)
                primitive_results.append({'mesh': mi, 'primitive': pi, 'attributes': attributes, 'usedVertices': len(used),
                    'changedVerticesAbove1eMinus7M': int(np.count_nonzero(delta > 1e-7)), 'maximumDisplacementM': float(delta.max())})
        avatar_bones, garment_bones = self.bones(avatar), self.bones(garment)
        self.check('garment-inverse-binds-' + item['id'], bool(garment_bones) and all(n in avatar_bones and equal(m, avatar_bones[n]) for n, m in garment_bones.items()))
        bindings = item.get('bindings', [])
        self.check('garment-binding-list-' + item['id'], bool(bindings))
        for binding in bindings:
            n = binding['targetRawBone']
            matrix = np.asarray(binding['inverseBindMatrix'], dtype='<f4').reshape(-1)
            self.check('binding-' + item['id'] + '/' + n, n in avatar_bones and equal(matrix, avatar_bones[n].reshape(-1)))
        return {'id': item['id'], 'slot': item['slot'], 'path': path, 'sha256': item['sha256'],
                'skinJoints': len(garment_bones), 'primitives': primitive_results, 'scope': 'Identity/bind readback only, not shape/contact acceptance'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--revision', type=int, choices=(1, 2), default=1)
    parser.add_argument('--manifest')
    parser.add_argument('--out', type=Path)
    parser.add_argument('--producer-commit', help='Exact committed producer identity, required for revision 2')
    args = parser.parse_args()
    package = 'assets-source/m2-representative-batch-v' + str(args.revision)
    args.manifest = args.manifest or package + '/generated/manifest.json'
    args.out = args.out or Path(__file__).resolve().parents[1] / ('evidence/m2-representative-batch-audit-v' + str(args.revision))
    expected = EXPECTED if args.revision == 1 else {key + '-v2': sex for key, sex in EXPECTED.items()}
    args.out.mkdir(parents=True, exist_ok=True)
    audit = Audit(args.root)
    started = time.perf_counter()
    variants = []
    images = []
    history = None
    try:
        manifest = json.loads(audit.read(args.manifest))
    except Exception as error:
        audit.check('manifest-readable', False, str(error))
        manifest = {}
    try:
        audit.check('manifest-schema', manifest.get('schema') == 'character-representative-batch-v1' and manifest.get('version') == args.revision)
        audit.check('runtime-acceptance-not-inferred', manifest.get('runtimeAccepted') is False)
        raw_entries = manifest.get('variants', [])
        valid_entries = isinstance(raw_entries, list) and all(isinstance(e, dict) and isinstance(e.get('id'), str) for e in raw_entries)
        audit.check('variant-records-well-formed', valid_entries)
        try:
            producer_files = ['scripts/m2-representative-batch-v' + str(args.revision) + '/build.py', 'scripts/m2-representative-batch-v' + str(args.revision) + '/deform.py']
            producer_files.append(package + '/output-contract.json')
            for producer_file in producer_files:
                audit.read(producer_file)
            source_spec = json.loads(audit.read(package + '/spec.json'))
            for sex, source_config in source_spec['sources'].items():
                audit.check('spec-original-body-' + sex, source_config['body']['sha256'] == BODY_SHA[sex])
                audit.ref(source_config['body'])
                audit.read(source_config['equipmentManifest'])
                for original_equipment in source_config['equipment']:
                    audit.ref(original_equipment)
        except Exception as error:
            audit.check('source-spec-inputs', False, str(error))
        entries = [e for e in raw_entries if isinstance(e, dict) and isinstance(e.get('id'), str)] if isinstance(raw_entries, list) else []
        ids = [entry.get('id') for entry in entries]
        audit.check('exact-eight-ids-once', len(ids) == 8 and set(ids) == set(expected))
        for identifier, sex in expected.items():
            start = len(audit.checks)
            entry = next((entry for entry in entries if entry.get('id') == identifier), None)
            result = {'id': identifier, 'sex': sex}
            try:
                if entry is None:
                    raise ValueError('Missing expected preset')
                audit.check('sex-' + identifier, entry.get('sex') == sex)
                spec_variant = next(v for v in source_spec['variants'] if v['id'] == identifier)
                audit.check('exact-spec-parameters-' + identifier, entry.get('parameters') == spec_variant['parameters'] and spec_variant['sex'] == sex)
                audit.check('source-status-' + identifier, entry.get('status') == 'source-passed', entry.get('error'))
                if args.revision == 2 and entry.get('status') == 'failed':
                    result['producerFailure'] = json.loads(audit.read(package + '/generated/' + identifier + '/FAILED.json'))
                    audit.check('failed-record-identity-' + identifier, result['producerFailure'] == entry)
                    raise ValueError(entry.get('error', 'Producer failed without output'))
                audit.check('original-input-identity-' + identifier, entry['sourceBody']['sha256'] == BODY_SHA[sex])
                audit.ref(entry['sourceBody'])
                audit.check('output-byte-count-declared-' + identifier, isinstance(entry['avatar'].get('bytes'), int) and entry['avatar']['bytes'] > 0)
                audit.ref(entry['avatar'])
                old = audit.glb(audit.resolve(entry['sourceBody']['path']))
                new = audit.glb(audit.resolve(entry['avatar']['path']))
                result['geometry'] = audit.compare_avatar(old, new)
                equipment = audit.json_ref(entry['equipmentManifest'])
                fit = audit.json_ref(entry['fit'])
                result['producerReport'] = audit.json_ref(entry['report'])
                audit.check('equipment-schema-' + identifier, equipment.get('schema') == 'zbgs-equipment-v1')
                items = equipment.get('items', [])
                audit.check('required-three-slots-' + identifier, len(items) == 3 and {i.get('slot') for i in items} == {'top', 'bottom', 'shoes'})
                result['equipment'] = []
                for item in items:
                    audit.check('equipment-target-body-' + item['id'], item.get('compatibleAvatarSha256') == entry['avatar']['sha256'])
                    result['equipment'].append(audit.garment(item, new, audit.resolve(entry['equipmentManifest']['path']).parent, next(g for g in source_spec['sources'][sex]['equipment'] if g['slot'] == item['slot'])))
                repeated = result['producerReport'].get('repeatExport', {})
                audit.check('repeat-avatar-identity-' + identifier, repeated.get('avatarSha256') == entry['avatar']['sha256'])
                audit.check('repeat-equipment-identities-' + identifier, repeated.get('equipment') == {i['slot']: i['sha256'] for i in items})
                audit.check('repeat-all-assets-byte-identical-' + identifier, repeated.get('allAssetBytesIdentical') is True)
                audit.check('fit-schema-' + identifier, fit.get('schema') == 'character-batch-fit-v1' and fit.get('version') == args.revision)
                audit.check('fit-body-identities-' + identifier, fit.get('sourceBodySha256') == BODY_SHA[sex] and fit.get('avatarSha256') == entry['avatar']['sha256'])
                audit.check('fit-parameters-' + identifier, fit.get('parameters') == entry.get('parameters'))
                audit.check('fit-equipment-identities-' + identifier, {i['id']: i['sha256'] for i in fit.get('equipment', [])} == {i['id']: i['sha256'] for i in items})
                audit.check('fit-runtime-pending-' + identifier, fit.get('runtimeAccepted') is False)
                audit.check('fit-skeleton-declaration-' + identifier, fit.get('unchangedSkeleton') is True)
                profile = audit.json_ref(entry['profile'])
                audit.check('profile-identity-' + identifier, profile.get('schema') == 'foundation-profile-draft-v1' and profile.get('sha256') == entry['avatar']['sha256'] and profile.get('referenceBody') == sex)
                audit.check('profile-equipment-ids-' + identifier, profile.get('ids') == {('pants' if i['slot'] == 'bottom' else i['slot']): i['id'] for i in items})
                audit.check('profile-floor-declaration-' + identifier, profile.get('sourceFloorY') == result['producerReport'].get('sourceFloorY'))
                audit.check('profile-runtime-pending-' + identifier, profile.get('runtimeAccepted') is False)
                directory = audit.resolve(entry['avatar']['path']).parent
                variant_files = [f for f in audit.files.values() if audit.resolve(f['path']).parent == directory]
                result['outputFiles'] = variant_files
                result['outputBytes'] = sum(f['bytes'] for f in variant_files)
                for file in variant_files:
                    if Path(file['path']).suffix in ['.vrm', '.glb']:
                        images.extend(audit.image_payloads(file))
                if args.revision == 2:
                    from qa_representative_batch_v2 import verify_variant
                    result['v2Mechanisms'] = verify_variant(audit, entry, old, new, equipment, fit, profile, result['producerReport'], source_spec)
            except Exception as error:
                result['error'] = str(error)
                audit.check('readback-' + identifier, False, str(error))
            result['checks'] = audit.checks[start:]
            result['passed'] = all(c['passed'] for c in result['checks'])
            variants.append(result)
            if args.revision == 2:
                print(json.dumps({'id': identifier, 'passed': result['passed'], 'checks': len(result['checks'])}), flush=True)
        for sex in BODY_SHA:
            hashes = [v['geometry']['positionContentSha256'] for v in variants if v['sex'] == sex and 'geometry' in v]
            audit.check('four-distinct-position-contents-' + sex, len(hashes) == 4 and len(set(hashes)) == 4)
        batch = manifest.get('batch', {})
        correction_key = 'commonCorrections' if args.revision == 1 else 'commonStructuralCorrections'
        audit.check('cost-ledger-present', all(k in batch for k in ['initialRuns', correction_key, 'singleCaseEdits', 'totalSeconds', 'totalOutputBytes', 'textureLedger']))
        audit.check('cost-output-byte-total', batch.get('totalOutputBytes') == sum(v.get('outputBytes', 0) for v in variants))
        texture_ledger = batch.get('textureLedger', {})
        image_key = lambda image: (image['resource'], image['sha256'], image['bytes'], image['mimeType'])
        audit.check('texture-ledger-exact-payloads', sorted(map(image_key, images)) == sorted(map(image_key, texture_ledger.get('resources', []))))
        unique_images = {i['sha256']: i['bytes'] for i in images}
        audit.check('texture-ledger-total', texture_ledger.get('totalEmbeddedImageBytes') == sum(i['bytes'] for i in images))
        audit.check('texture-ledger-unique', texture_ledger.get('uniqueEncodedImageBytes') == sum(unique_images.values()) and texture_ledger.get('uniqueImagePayloads') == len(unique_images))
        timing = batch.get('timing', [])
        timing_expected = set(expected) if args.revision == 1 else {e['id'] for e in entries if e.get('status') == 'source-passed'}
        audit.check('cost-timing-presets', {t['id'] for t in timing} == timing_expected and len(timing) == len(timing_expected))
        for v in variants:
            if args.revision == 2 and v['id'] not in timing_expected:
                continue
            t = next((t for t in timing if t['id'] == v['id']), {})
            audit.check('cost-timing-' + v['id'], t.get('outputBytes') == v.get('outputBytes') and t.get('exportSeconds', -1) >= 0 and t.get('repeatExportSeconds', -1) >= 0)
        if args.revision == 1 and batch.get('commonCorrections', 0) > 0:
            try:
                prior = json.loads(audit.read('assets-source/m2-representative-batch-v1/attempt-1/manifest.json'))
                correction = json.loads(audit.read('assets-source/m2-representative-batch-v1/common-correction.json'))
                history = {'priorAttemptVariants': [{'id': v['id'], 'status': v['status'], 'error': v.get('error')} for v in prior['variants']], 'commonCorrection': correction}
                audit.check('parameters-unchanged-after-common-correction', {v['id']: v['parameters'] for v in prior['variants']} == {v['id']: v['parameters'] for v in entries})
                audit.check('prior-attempt-preserves-eight-ids', {v['id'] for v in prior['variants']} == set(expected) and len(prior['variants']) == 8)
            except Exception as error:
                audit.check('correction-evidence-readable', False, str(error))
        if args.revision == 2:
            from qa_representative_batch_v2 import verify_batch
            history = verify_batch(audit, manifest, source_spec, args.producer_commit)
        ledger = batch
    except Exception as error:
        audit.check('manifest-readable', False, str(error))
        ledger = None
    for file in list(audit.files.values()):
        audit.check('stable-input-' + file['path'], digest(audit.resolve(file['path']).read_bytes()) == file['sha256'])
    environment = {'python': platform.python_version(), 'numpy': np.__version__}
    if args.revision == 2:
        import scipy
        environment['scipy'] = scipy.__version__
    variant_check_ids = {id(c) for variant in variants for c in variant['checks']}
    report = {'status': 'body-garment-cpu-readback-passed-appearance-runtime-pending' if all(c['passed'] for c in audit.checks) else 'cpu-readback-incomplete-or-failed',
        'root': str(audit.root), 'manifest': args.manifest, 'revision': args.revision, 'producerCommit': args.producer_commit, 'expected': expected, 'checks': audit.checks, 'variants': variants,
        'globalChecks': [c for c in audit.checks if id(c) not in variant_check_ids],
        'supplementalVerifierSha256': digest(Path(__file__).with_name('qa_representative_batch_v2.py').read_bytes()) if args.revision == 2 else None,
        'producerCostLedger': ledger, 'producerAttemptHistory': history, 'files': list(audit.files.values()),
        'verifierSha256': digest(Path(__file__).read_bytes()),
        'environment': environment, 'auditSeconds': time.perf_counter() - started,
        'limits': ['No exports, GPU, browser or runtime admission. This verifier reads body/garment outputs, and does not establish a qualified hairstyle for the eight complete looks.', 'Source geometry and bind checks do not establish naturalness, garment contact, dynamic hair compatibility or target-PC performance.']}
    (args.out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'passedChecks': sum(c['passed'] for c in audit.checks), 'checks': len(audit.checks), 'presets': [{'id': v['id'], 'passed': v['passed'], 'error': v.get('error')} for v in variants]}, ensure_ascii=False))
    return 0 if all(c['passed'] for c in audit.checks) else 1


if __name__ == '__main__':
    raise SystemExit(main())
