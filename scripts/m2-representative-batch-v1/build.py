"""Eight deterministic presets through one field, with exact existing gear fits."""
import argparse
import copy
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
import numpy as np
from deform import ROOT, GLB, field, image_rows, numeric, require, rewrite, sha, source_context

BASE = ROOT/'assets-source/m2-representative-batch-v1'


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()


def ref(path, data):
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': sha(data), 'bytes': len(data)}


def checked(row):
    path = (ROOT/row['path']).resolve(); require(path.is_relative_to(ROOT), 'Input path escapes repository')
    data = path.read_bytes(); require(sha(data) == row['sha256'], 'Input SHA mismatch: '+row['path']); return data


def primitive_report(old, new):
    result = []
    for mi, mesh in enumerate(old.doc['meshes']):
        for pi, p in enumerate(mesh['primitives']):
            q = new.doc['meshes'][mi]['primitives'][pi]; name = old.doc['materials'][p['material']]['name']
            ids = np.unique(old.accessor(p['indices'])); before = np.array(old.accessor(p['attributes']['POSITION']))[ids]; after = np.array(new.accessor(q['attributes']['POSITION']))[ids]
            require(numeric(old.accessor(p['indices'])) == numeric(new.accessor(q['indices'])), 'Topology changed')
            for key in ['TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']:
                require((key in p['attributes']) == (key in q['attributes']), 'Attribute presence changed: '+key)
                if key in p['attributes']:
                    require(numeric(old.accessor(p['attributes'][key])) == numeric(new.accessor(q['attributes'][key])), 'Invariant attribute changed: '+key)
            result.append({'mesh': mi, 'primitive': pi, 'material': name, 'vertices': len(ids), 'triangles': len(old.accessor(p['indices']))//3,
                'sourcePositionSha256': numeric(before), 'positionSha256': numeric(after),
                'sourceNormalSha256': numeric(np.array(old.accessor(p['attributes']['NORMAL']))[ids]), 'normalSha256': numeric(np.array(new.accessor(q['attributes']['NORMAL']))[ids]),
                'maxDisplacementM': float(np.linalg.norm(after-before, axis=1).max()),
                'boundsBefore': [before.min(0).tolist(), before.max(0).tolist()], 'boundsAfter': [after.min(0).tolist(), after.max(0).tolist()]})
    return result


def floor(g):
    return float(min(np.array(g.accessor(p['attributes']['POSITION']))[np.unique(g.accessor(p['indices'])), 1].min() for mesh in g.doc['meshes'] for p in mesh['primitives']))


def output_plan(variant, source, output):
    raw = checked(source['body']); g = GLB(raw); context = source_context(g)
    avatar, trace = rewrite(raw, variant['parameters'], context, variant['id'], True); derived = GLB(avatar)
    avatar_sha = sha(avatar); folder = output/variant['id']; files = {'avatar.vrm': avatar}; entries = []; gear_reports = []
    manifest = json.loads((ROOT/source['equipmentManifest']).read_bytes())
    for item in source['equipment']:
        original = next(e for e in manifest['items'] if e['id'] == item['id']); require(original['sha256'] == item['sha256'], 'Equipment manifest/source mismatch')
        data = checked(item); result, garment_trace = rewrite(data, variant['parameters'], context, variant['id']+'-'+item['slot'])
        entry = copy.deepcopy(original); omitted = {}
        for key in ['materialRecipes', 'fitResource', 'sourceSpec']:
            if key in entry: omitted[key] = entry.pop(key)
        slot = item['slot']; identifier = variant['id']+'-'+slot; name = identifier+'.glb'; files[name] = result
        entry.update(id=identifier, styleId=item['id'], fitId=identifier+'-fit-v1', compatibleAvatarSha256=avatar_sha,
            url=name, sha256=sha(result), bytes=len(result), sourceSpec='assets-source/m2-representative-batch-v1/spec.json',
            sourceResource=item, method='Same common metre-space deformation field as exact target avatar; original skin binding retained',
            limits=['Source/rest fit only; root game/pose/contact acceptance pending'])
        entries.append(entry); gear_reports.append({'slot': slot, 'source': item, 'sha256': sha(result), 'bytes': len(result),
            'omittedOriginalDependencies': omitted, 'trace': garment_trace, 'primitives': primitive_report(GLB(data), GLB(result))})
    files['equipment.json'] = encoded({'schema': 'zbgs-equipment-v1', 'items': entries})
    primitives = primitive_report(g, derived)
    require(g.doc['materials'] == derived.doc['materials'] and g.doc['textures'] == derived.doc['textures'], 'Material/texture object identity changed')
    require(g.doc['extensions']['VRM']['blendShapeMaster'] == derived.doc['extensions']['VRM']['blendShapeMaster'], 'Expression binding changed')
    head = context['joints']['head']; protected_hair = [p for p in primitives if 'HAIR' in p['material']]
    require(all(p['maxDisplacementM'] == 0 and p['sourceNormalSha256'] == p['normalSha256'] for p in protected_hair), 'Original hair changed')
    fit = {'schema': 'character-batch-fit-v1', 'id': variant['id']+'-source-fit-v1', 'version': 1,
        'sourceBodySha256': source['body']['sha256'], 'avatarSha256': avatar_sha, 'parameters': variant['parameters'], 'unchangedSkeleton': True,
        'equipment': [{'id': e['id'], 'sha256': e['sha256'], 'slot': e['slot']} for e in entries],
        'dependencies': {'forearmCollision': None, 'handContact': None, 'seatContact': None,
            'reason': 'Volume-specific collision/contact profiles must be measured; exact original profiles are not inherited',
            'hair': 'Embedded original cap preserved; replacement hair requires exact derived fit'}, 'runtimeAccepted': False}
    files['fit.json'] = encoded(fit)
    shoe = GLB(files[variant['id']+'-shoes.glb']); source_floor = min(floor(derived), floor(shoe))
    profile = {'schema': 'foundation-profile-draft-v1', 'id': 'm2-'+variant['id']+'-v1', 'bodyType': variant['id'], 'referenceBody': variant['sex'],
        'url': '/assets/m2-representative-batch-v1/'+variant['id']+'/avatar.vrm', 'sha256': avatar_sha,
        'manifestUrl': '/assets/m2-representative-batch-v1/'+variant['id']+'/equipment.json',
        'ids': {('pants' if e['slot'] == 'bottom' else e['slot']): e['id'] for e in entries},
        'sourceFloorY': source_floor, 'floorEvidence': {'avatarMinimumY': floor(derived), 'shoeMinimumY': floor(shoe)},
        'forearmCollision': None, 'handContact': None, 'fitStatus': 'source-only; volume contacts and game acceptance pending', 'runtimeAccepted': False}
    files['profile.json'] = encoded(profile)
    report = {'id': variant['id'], 'sex': variant['sex'], 'sourceBody': source['body'], 'parameters': variant['parameters'],
        'avatarSha256': avatar_sha, 'avatarBytes': len(avatar), 'trace': trace, 'primitives': primitives, 'equipment': gear_reports,
        'skeletonNodesUnchanged': True, 'skinsAndInverseBindsUnchanged': True, 'materialsAndTextureObjectsUnchanged': True,
        'imageBytesUnchanged': True, 'expressionBindingsUnchanged': True, 'headDependencies': {'rawHead': next(n['name'] for n in g.doc['nodes'] if n.get('name') == 'J_Bip_C_Head'),
            'headRestPositionM': head.tolist(), 'originalHairPrimitives': protected_hair}, 'sourceFloorY': source_floor,
        'editableRepresentation': 'Pinned complete source VRM + deterministic regional parameters and common Python field. No new Blender file.',
        'limits': ['Body/face and matched top/bottom/shoes source only. Frozen independent skirt/dance untouched.',
            'Embedded original VRM clothing follows the common field; only exported top/bottom/shoes receive explicit new fit entries.',
            'Original female Body texture includes painted stockings; texture bytes retain that existing content. No new sock mesh is authored.'], 'runtimeAccepted': False}
    return files, report


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--out', default='assets-source/m2-representative-batch-v1/generated'); args = parser.parse_args()
    output = (ROOT/args.out).resolve(); require(output.is_relative_to(BASE), 'Output outside source package')
    spec = json.loads((BASE/'spec.json').read_bytes()); results = []; timing = []; all_images = []; start = time.perf_counter()
    require(len(spec['variants']) == 8 and len({v['id'] for v in spec['variants']}) == 8, 'Exact eight unique presets required')
    for variant in spec['variants']:
        t = time.perf_counter(); folder = output/variant['id']
        try:
            files, report = output_plan(variant, spec['sources'][variant['sex']], output); export_seconds = time.perf_counter()-t
            repeat_start = time.perf_counter(); repeated, repeat_report = output_plan(variant, spec['sources'][variant['sex']], output)
            require(files == repeated and report == repeat_report, 'Repeat export differs')
            report['repeatExport'] = {'avatarSha256': sha(files['avatar.vrm']), 'equipment': {e['slot']: e['sha256'] for e in report['equipment']}, 'allAssetBytesIdentical': True}
            files['build-report.json'] = encoded(report)
            for name, data in files.items(): require(not (folder/name).exists() or (folder/name).read_bytes() == data, 'Existing output differs: '+str(folder/name))
            folder.mkdir(parents=True, exist_ok=True)
            for name, data in files.items():
                if not (folder/name).exists(): (folder/name).write_bytes(data)
            row = {**variant, 'status': 'source-passed', 'sourceBody': spec['sources'][variant['sex']]['body']}
            for key, name in [('avatar','avatar.vrm'), ('equipmentManifest','equipment.json'), ('fit','fit.json'), ('report','build-report.json'), ('profile','profile.json')]: row[key] = ref(folder/name, files[name])
            results.append(row); timing.append({'id': variant['id'], 'exportSeconds': export_seconds, 'repeatExportSeconds': time.perf_counter()-repeat_start, 'outputBytes': sum(map(len, files.values()))})
            for name, data in files.items():
                if name.endswith(('.glb','.vrm')):
                    for image in image_rows(GLB(data)): all_images.append({'resource': (folder/name).relative_to(ROOT).as_posix(), **image})
            print(json.dumps({'id': variant['id'], 'status': 'source-passed', 'avatarSha256': row['avatar']['sha256'], 'seconds': time.perf_counter()-t}), flush=True)
        except Exception as error:
            folder.mkdir(parents=True, exist_ok=True); failure = {'id': variant['id'], 'error': str(error), 'runtimeAccepted': False}
            (folder/'FAILED.json').write_bytes(encoded(failure)); results.append({**variant, 'status': 'failed', 'error': str(error)})
            print(json.dumps(failure), flush=True)
    unique = {row['sha256']: row['bytes'] for row in all_images}
    manifest = {'schema': 'character-representative-batch-v1', 'version': 1, 'variants': results,
        'batch': {'initialRuns': 1, 'commonCorrections': int((BASE/'common-correction.json').exists()), 'singleCaseEdits': 0, 'totalSeconds': time.perf_counter()-start,
            'totalOutputBytes': sum(row['outputBytes'] for row in timing), 'timing': timing,
            'textureLedger': {'resources': all_images, 'totalEmbeddedImageBytes': sum(row['bytes'] for row in all_images), 'uniqueEncodedImageBytes': sum(unique.values()),
                'uniqueImagePayloads': len(unique), 'scope': 'Encoded file payload duplication only. Independent texture objects and renderer memory are not deduplicated by this ledger.'}}, 'runtimeAccepted': False}
    output.mkdir(parents=True, exist_ok=True); (output/'manifest.json').write_bytes(encoded(manifest))
    print(json.dumps({'completed': len(results), 'passed': sum(row['status'] == 'source-passed' for row in results), 'seconds': time.perf_counter()-start}))


if __name__ == '__main__': main()
