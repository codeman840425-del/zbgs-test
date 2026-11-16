"""Declare the actual author export and verify topology, binds and repeatability."""
from pathlib import Path
import collections
import hashlib
import importlib.util
import json
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-onepiece-v1'
OUT = BASE / 'generated'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB, Validator

module_spec = importlib.util.spec_from_file_location('onepiece_build', ROOT / 'scripts/m2-onepiece-v1/build.py')
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
write = module.write
spec = json.loads((BASE / 'spec.json').read_text(encoding='utf-8'))
asset = OUT / 'author-export.glb'
exported = GLB(asset.read_bytes())
pattern_entry = json.loads((OUT / 'equipment-entry.json').read_text(encoding='utf-8'))
by_name = {binding['sourceBone']: binding for binding in pattern_entry['bindings']}
skin = exported.doc['skins'][0]
matrices = exported.accessor(skin['inverseBindMatrices'])
names = [exported.doc['nodes'][index]['name'] for index in skin['joints']]
entry = dict(pattern_entry, url=asset.name, sha256=sha(asset), bytes=asset.stat().st_size)
entry['bindings'] = [dict(by_name[name], inverseBindMatrix=matrix) for name, matrix in zip(names, matrices)]
entry.update(sourceSpec='assets-source/m2-onepiece-v1/spec.json', admission='source-topology-and-binding-checked; rest-contact-defects-recorded; runtime-pending')
body = GLB((ROOT / spec['bodyPath']).read_bytes())
binding = Validator(ROOT).equipment(entry, spec['bodySha256'], body, 'assets-source/m2-onepiece-v1/generated/author-equipment.json')
negative = []
for key in ['compatibleAvatarSha256', 'sha256']:
    bad = dict(entry)
    bad[key] = '0' * 64
    try:
        Validator(ROOT).equipment(bad, spec['bodySha256'], body, 'assets-source/m2-onepiece-v1/generated/author-equipment.json')
    except ValueError as error:
        negative.append({'field': key, 'rejected': str(error)})
    else:
        raise AssertionError(key)


def corners(path):
    glb = GLB(path.read_bytes())
    primitive = glb.doc['meshes'][0]['primitives'][0]
    indices = np.array(glb.accessor(primitive['indices']), dtype=int).reshape(-1)
    attributes = primitive['attributes']
    points = np.array(glb.accessor(attributes['POSITION']))[indices]
    joint_ids = np.array(glb.accessor(attributes['JOINTS_0']), dtype=int)[indices]
    weights = np.array(glb.accessor(attributes['WEIGHTS_0']))[indices]
    bones = [glb.doc['nodes'][index]['name'] for index in glb.doc['skins'][0]['joints']]
    return points, {name: np.where(joint_ids == bones.index(name), weights, 0).sum(1) for name in bones}


before, before_weights = corners(OUT / (spec['id'] + '.glb'))
after, after_weights = corners(asset)
position_delta = float(np.max(np.abs(before - after)))
assert position_delta < 2e-7
assert set(before_weights) == set(after_weights)
ordered = sorted(before_weights)
expected = np.stack([before_weights[name] for name in ordered], axis=1)
expected = np.where(expected > .0001, expected, 0)
expected /= expected.sum(1)[:, None]
actual = np.stack([after_weights[name] for name in ordered], axis=1)
weight_rule_delta = float(np.max(np.abs(expected - actual)))
assert weight_rule_delta < 2e-6
# Weld rendering duplicates by actual position, then verify the actual GLB shell.
lookup, points, faces = {}, [], []
for triangle in after.reshape(-1, 3, 3):
    face = []
    for point in triangle:
        key = tuple(np.round(point, 7))
        if key not in lookup:
            lookup[key] = len(points)
            points.append(point)
        face.append(lookup[key])
    faces.append(face)
edges, components = module.topology(np.array(faces), len(points))
assert components == 1 and all(len(uses) == 2 for uses in edges.values())
repeat = {}
for filename in [spec['id'] + '.glb', 'author-export.glb', 'author-repeat-export.glb']:
    repeated = [sha(BASE / directory / filename) for directory in ['generated', 'repeat']]
    assert repeated[0] == repeated[1], filename
    repeat[filename] = repeated[0]
assert repeat['author-export.glb'] == repeat['author-repeat-export.glb']
audit = json.loads((OUT / 'static-audit.json').read_text(encoding='utf-8'))
source_edit = json.loads((OUT / 'author-report.json').read_text(encoding='utf-8'))
assert source_edit['editedFromEarlierSource'] == 'initial' and source_edit['maximumActualSourceEditMetres'] > .001
write(OUT / 'author-equipment.json', {'schema': 'zbgs-equipment-v1', 'items': [entry]})
fit = {'schema': 'm2-onepiece-fit-v1', 'id': spec['fitId'], 'version': 1, 'styleId': spec['styleId'], 'targetBodySha256': spec['bodySha256'],
       'assetSha256': entry['sha256'], 'sourceSpecSha256': sha(BASE / 'spec.json'), 'slot': 'onePiece', 'occupies': ['top', 'bottom'],
       'outerSurfaceOffsetMetres': spec['outerSurfaceOffsetMetres'], 'clothThicknessMetres': spec['clothThicknessMetres'],
       'nominalInnerSurfaceOffsetMetres': spec['outerSurfaceOffsetMetres'] - spec['clothThicknessMetres'],
       'neckOpeningYMetres': spec['neckOpeningYMetres'], 'sleeveOpeningAbsXMetres': spec['sleeveOpeningAbsXMetres'],
       'hemYMetres': json.loads((OUT / 'report.json').read_text())['hemYMetres'], 'units': 'original glTF mesh-local metres, Y-up',
       'bindingMode': 'exact original raw bones and inverse binds; clipped Body triangle weights, normalized four influences',
       'bodyCoverageMasks': [], 'physics': 'skinning-only', 'staticContacts': {key: audit[key] for key in ['bodyTriangleIntersections', 'selfNonAdjacentIntersections', 'maximumSampledNearestNormalPenetrationMetres']},
       'limits': ['Original male only; no female or derived-body fit.', 'Offsets are construction values, not guaranteed animated clearances.', 'Room contact/seating and full-speed actions pending.'], 'runtimeAccepted': False}
write(OUT / 'fit.json', fit)
write(OUT / 'verification.json', {'structuralBinding': binding, 'negativeChecks': negative, 'actualAuthorClosedConnectedShell': True,
      'actualAuthorVerticesAfterPositionWeld': len(points), 'actualAuthorEulerCharacteristic': len(points) - len(edges) + len(faces),
      'positionDeltaMetres': position_delta, 'blenderWeightRule': 'remove influences <= 0.0001 and normalize survivors', 'maxWeightRuleDelta': weight_rule_delta,
      'repeatedExports': repeat, 'bodyUnchanged': sha(ROOT / spec['bodyPath']) == spec['bodySha256'], 'runtimeAcceptance': False})
write(BASE / 'manifest.json', {'files': [{'path': path.relative_to(BASE).as_posix(), 'sha256': sha(path), 'bytes': path.stat().st_size}
      for path in sorted(BASE.rglob('*')) if path.is_file() and path.name != 'manifest.json']})
print(json.dumps({'assetSha256': entry['sha256'], 'binding': binding, 'positionDeltaMetres': position_delta, 'maxWeightRuleDelta': weight_rule_delta, 'repeat': repeat}))
