"""One bounded eight-preset revision; v1 remains immutable."""
import argparse
import copy
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
import numpy as np
from deform import ROOT, GLB, Mapper, Source, legacy, numeric, primitive, require, rewrite, sha

BASE = ROOT/'assets-source/m2-representative-batch-v2'


def encoded(value): return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()


def checked(ref):
    path = (ROOT/ref['path']).resolve(); require(path.is_relative_to(ROOT), 'Input escapes repository')
    raw = path.read_bytes(); require(sha(raw) == ref['sha256'], 'Input SHA mismatch: '+ref['path']); return raw


def ref(path, data): return {'path': path.relative_to(ROOT).as_posix(), 'sha256': sha(data), 'bytes': len(data)}


def primitives(old, new):
    rows = []
    for mi, mesh in enumerate(old.doc['meshes']):
        for pi, p in enumerate(mesh['primitives']):
            q = new.doc['meshes'][mi]['primitives'][pi]; ids = np.unique(old.accessor(p['indices']))
            require(np.array_equal(old.accessor(p['indices']), new.accessor(q['indices'])), 'Topology changed')
            for key in ['TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']:
                require((key in p['attributes']) == (key in q['attributes']), 'Attribute presence changed')
                if key in p['attributes']: require(np.array_equal(old.accessor(p['attributes'][key]), new.accessor(q['attributes'][key])), 'Original binding/UV changed')
            a, b = [np.array(g.accessor(t['attributes']['POSITION']))[ids] for g, t in [(old, p), (new, q)]]
            rows.append({'mesh': mi, 'primitive': pi, 'material': old.doc['materials'][p['material']]['name'], 'vertices': len(ids), 'triangles': len(old.accessor(p['indices']))//3,
                'sourcePositionSha256': numeric(a), 'positionSha256': numeric(b), 'maxDisplacementM': float(np.linalg.norm(b-a, axis=1).max()),
                'sourceNormalSha256': numeric(np.array(old.accessor(p['attributes']['NORMAL']))[ids]), 'normalSha256': numeric(np.array(new.accessor(q['attributes']['NORMAL']))[ids]),
                'boundsBefore': [a.min(0).tolist(), a.max(0).tolist()], 'boundsAfter': [b.min(0).tolist(), b.max(0).tolist()]})
    require(old.doc['materials'] == new.doc['materials'] and old.doc['textures'] == new.doc['textures'], 'Material/texture identity changed')
    return rows


def floor(g):
    return float(min(np.array(g.accessor(p['attributes']['POSITION']))[np.unique(g.accessor(p['indices'])), 1].min() for m in g.doc['meshes'] for p in m['primitives']))


def output_plan(v, source_spec, source):
    mapper = Mapper(source, v['parameters']); raw = checked(source_spec['body'])
    avatar, trace = rewrite(raw, mapper, v['id'], True); new = GLB(avatar); digest = sha(avatar)
    files = {'avatar.vrm': avatar}; entries = []; gear = []
    old_manifest = json.loads((ROOT/source_spec['equipmentManifest']).read_bytes())
    for original in source_spec['equipment']:
        entry = copy.deepcopy(next(e for e in old_manifest['items'] if e['id'] == original['id']))
        require(entry['sha256'] == original['sha256'], 'Source equipment manifest mismatch')
        data = checked(original); asset, details = rewrite(data, mapper, v['id']+'-'+original['slot'])
        dropped = {key: entry.pop(key) for key in ['materialRecipes', 'fitResource', 'sourceSpec'] if key in entry}
        identifier = v['id']+'-'+original['slot']; name = identifier+'.glb'; files[name] = asset
        entry.update(id=identifier, styleId=original['id'], fitId=identifier+'-fit-v2', compatibleAvatarSha256=digest, url=name,
            sha256=sha(asset), bytes=len(asset), sourceSpec='assets-source/m2-representative-batch-v2/spec.json', sourceResource=original,
            method='Fixed original Body_SKIN triangle/barycentric donor displacement with original metre-space offset retained',
            limits=['Source/rest only. Posed clearance and volume contacts require exact runtime verification.'])
        entries.append(entry); gear.append({'slot': original['slot'], 'source': original, 'sha256': sha(asset), 'bytes': len(asset),
            'omittedOriginalDependencies': dropped, 'trace': details, 'primitives': primitives(GLB(data), GLB(asset))})
    rows = primitives(source.g, new)
    require(source.g.doc['extensions']['VRM']['blendShapeMaster'] == new.doc['extensions']['VRM']['blendShapeMaster'], 'Expression bindings changed')
    require(all(r['maxDisplacementM'] == 0 and r['normalSha256'] == r['sourceNormalSha256'] for r in rows if 'HAIR' in r['material']), 'Original hair changed')
    files['equipment.json'] = encoded({'schema': 'zbgs-equipment-v1', 'items': entries})
    fit = {'schema': 'character-batch-fit-v1', 'id': v['id']+'-source-fit-v2', 'version': 2, 'basePresetId': v['basePresetId'],
        'sourceBodySha256': source_spec['body']['sha256'], 'avatarSha256': digest, 'parameters': v['parameters'], 'unchangedSkeleton': True,
        'parameterRealization': 'partial-constrained-face-projection',
        'equipment': [{'id': e['id'], 'sha256': e['sha256'], 'slot': e['slot']} for e in entries],
        'dependencies': {'forearmCollision': None, 'handContact': None, 'seatContact': None, 'hair': None,
            'reason': 'New volume and face map require newly measured contacts and explicit replacement-hair fits; v1 identities not inherited'}, 'runtimeAccepted': False}
    files['fit.json'] = encoded(fit); shoe = GLB(files[v['id']+'-shoes.glb']); source_floor = min(floor(new), floor(shoe))
    profile = {'schema': 'foundation-profile-draft-v1', 'id': 'm2-'+v['id'], 'bodyType': v['id'], 'basePresetId': v['basePresetId'], 'referenceBody': v['sex'],
        'url': '/assets/m2-representative-batch-v2/'+v['id']+'/avatar.vrm', 'sha256': digest,
        'manifestUrl': '/assets/m2-representative-batch-v2/'+v['id']+'/equipment.json',
        'ids': {('pants' if e['slot'] == 'bottom' else e['slot']): e['id'] for e in entries}, 'sourceFloorY': source_floor,
        'floorEvidence': {'avatarMinimumY': floor(new), 'shoeMinimumY': floor(shoe)}, 'forearmCollision': None, 'handContact': None,
        'fitStatus': 'Source-only v2 common structural correction; projected face intent, volume contacts and posed acceptance pending', 'runtimeAccepted': False}
    files['profile.json'] = encoded(profile)
    report = {'id': v['id'], 'basePresetId': v['basePresetId'], 'sex': v['sex'], 'sourceBody': source_spec['body'], 'parameters': v['parameters'],
        'avatarSha256': digest, 'avatarBytes': len(avatar), 'trace': trace, 'primitives': rows, 'equipment': gear, 'faceCurve': mapper.curve_report,
        'garmentTransfers': mapper.transfer_report, 'skeletonNodesUnchanged': True, 'skinsAndInverseBindsUnchanged': True,
        'materialsAndTextureObjectsUnchanged': True, 'imageBytesUnchanged': True, 'expressionBindingsUnchanged': True, 'sourceFloorY': source_floor,
        'parameterSemantics': {'torso': 'Hip/waist/chest relative target section width/depth blended by nonnegative partition-of-unity weights, with continuous neutral support outside region',
            'face': 'Unchanged requested jaw/cheek relative contour growth, projected once into monotone concave cubic B-spline with protected eye boundary value/slope; chin length/depth remain metre requests',
            'clothes': 'Fixed source Body_SKIN nearest point; target garment = source garment + barycentric body displacement; offset vectors preserved; actual transfer Jacobian normals'},
        'editableRepresentation': 'Pinned original complete VRMs and editable unchanged eight parameter dictionaries plus common v2 scripts',
        'limits': ['Partial face intent is explicitly projected and measured. Source checks do not establish artistic acceptance.',
            'Original full-VRM clothing and independent gear use the same donor mechanism. Frozen independent skirt/dance untouched.',
            'Original female painted stockings/UV/image bytes remain unchanged. No new sock mesh.',
            'Fixed bind-space garment offsets do not guarantee posed cloth clearance. Contact profiles and all replacement hair need new fits.'], 'runtimeAccepted': False}
    return files, report


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--out', default='assets-source/m2-representative-batch-v2/generated'); args = parser.parse_args()
    out = (ROOT/args.out).resolve(); require(out.is_relative_to(BASE) and out != BASE, 'Output outside v2 source child directory')
    spec = json.loads((BASE/'spec.json').read_bytes()); checked(spec['sourceSpec']); checked(spec['v1Manifest'])
    old = json.loads(checked(spec['sourceSpec']))
    require(len(spec['variants']) == 8 and len({v['id'] for v in spec['variants']}) == 8, 'Eight unique v2 targets required')
    for v in spec['variants']:
        original = next(p for p in old['variants'] if p['id'] == v['basePresetId'])
        require(v['id'] == original['id']+'-v2' and v['parameters'] == original['parameters'], 'Preset parameters/identity changed')
    sources = {sex: Source(checked(row['body'])) for sex, row in spec['sources'].items()}
    results = []; timing = []; images = []; start = time.perf_counter()
    for v in spec['variants']:
        folder = out/v['id']; started = time.perf_counter()
        try:
            files, report = output_plan(v, spec['sources'][v['sex']], sources[v['sex']]); first = time.perf_counter()-started
            repeated, again = output_plan(v, spec['sources'][v['sex']], sources[v['sex']]); require(files == repeated and report == again, 'Repeat asset/report bytes differ')
            report['repeatExport'] = {'avatarSha256': sha(files['avatar.vrm']), 'equipment': {r['slot']: r['sha256'] for r in report['equipment']}, 'allAssetBytesIdentical': True}
            files['build-report.json'] = encoded(report)
            for name, data in files.items(): require(not (folder/name).exists() or (folder/name).read_bytes() == data, 'Existing output differs: '+str(folder/name))
            folder.mkdir(parents=True, exist_ok=True)
            for name, data in files.items():
                if not (folder/name).exists(): (folder/name).write_bytes(data)
            row = {**v, 'status': 'source-passed', 'parameterRealization': 'partial-constrained-face-projection', 'sourceBody': spec['sources'][v['sex']]['body']}
            for key, name in [('avatar', 'avatar.vrm'), ('equipmentManifest', 'equipment.json'), ('fit', 'fit.json'), ('profile', 'profile.json'), ('report', 'build-report.json')]: row[key] = ref(folder/name, files[name])
            results.append(row); timing.append({'id': v['id'], 'exportSeconds': first, 'repeatExportSeconds': time.perf_counter()-started-first, 'outputBytes': sum(map(len, files.values()))})
            for name, data in files.items():
                if name.endswith(('.glb', '.vrm')):
                    images.extend({'resource': (folder/name).relative_to(ROOT).as_posix(), **r} for r in legacy.image_rows(GLB(data)))
            print(json.dumps({'id': v['id'], 'status': 'source-passed', 'seconds': time.perf_counter()-started, 'faceProjectionMaxMm': report['faceCurve']['maximumProjectionDifferenceM']*1000}), flush=True)
        except Exception as error:
            row = {**v, 'status': 'failed', 'error': str(error), 'runtimeAccepted': False}; folder.mkdir(parents=True, exist_ok=True)
            (folder/'FAILED.json').write_bytes(encoded(row)); results.append(row); print(json.dumps(row), flush=True)
    unique = {r['sha256']: r['bytes'] for r in images}
    manifest = {'schema': 'character-representative-batch-v1', 'version': 2, 'sourceSpec': spec['sourceSpec'], 'variants': results,
        'batch': {'initialRuns': 1, 'commonStructuralCorrections': 1, 'singleCaseEdits': 0, 'totalSeconds': time.perf_counter()-start, 'totalOutputBytes': sum(t['outputBytes'] for t in timing),
            'timing': timing, 'textureLedger': {'resources': images, 'totalEmbeddedImageBytes': sum(r['bytes'] for r in images), 'uniqueEncodedImageBytes': sum(unique.values()),
                'uniqueImagePayloads': len(unique), 'scope': 'Encoded duplication only. No subtraction of independent texture objects or renderer allocations.'}}, 'runtimeAccepted': False}
    out.mkdir(parents=True, exist_ok=True); (out/'manifest.json').write_bytes(encoded(manifest))
    print(json.dumps({'passed': sum(v['status'] == 'source-passed' for v in results), 'total': 8, 'seconds': manifest['batch']['totalSeconds']}))


if __name__ == '__main__': main()
