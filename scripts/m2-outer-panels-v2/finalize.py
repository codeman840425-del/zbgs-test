"""Record binding, topology, source export correspondence and exact fit identity."""
from pathlib import Path
import collections
import hashlib
import importlib.util
import json
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-outer-panels-v2'
OUT = BASE / 'generated'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB, Validator


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def corners(path):
    glb = GLB(path.read_bytes())
    primitive = glb.doc['meshes'][0]['primitives'][0]
    indices = np.array(glb.accessor(primitive['indices']), dtype=int).reshape(-1)
    attrs = primitive['attributes']
    p = np.array(glb.accessor(attrs['POSITION']))[indices]
    joint_indices = np.array(glb.accessor(attrs['JOINTS_0']), dtype=int)[indices]
    weights = np.array(glb.accessor(attrs['WEIGHTS_0']))[indices]
    names = [glb.doc['nodes'][i]['name'] for i in glb.doc['skins'][0]['joints']]
    dense = {name: np.zeros(len(indices)) for name in names}
    for name in names:
        dense[name] = np.where(joint_indices == names.index(name), weights, 0).sum(1)
    return p, dense


spec = json.loads((BASE / 'spec.json').read_text(encoding='utf-8'))
entry = json.loads((OUT / 'equipment-entry.json').read_text(encoding='utf-8'))
asset = OUT / 'author-export.glb'
entry.update(url=asset.name, sha256=sha(asset), bytes=asset.stat().st_size)
entry['sourceSpec'] = 'assets-source/m2-outer-panels-v2/spec.json'
audit = json.loads((OUT / 'source-audit.json').read_text(encoding='utf-8'))
entry['admission'] = 'static-source-candidate-runtime-pending' if audit['passedNoInitialIntersections'] else 'rejected-static-source-contact'
body = GLB((ROOT / 'prototype/public/assets/foundation/base-male-roundtrip.vrm').read_bytes())
validator = Validator(ROOT)
manifest_path = 'assets-source/m2-outer-panels-v2/generated/author-equipment.json'
binding = validator.equipment(entry, spec['bodySha256'], body, manifest_path)
negatives = []
for label, bad in [('wrong-body', dict(entry, compatibleAvatarSha256='0' * 64)), ('wrong-asset', dict(entry, sha256='0' * 64))]:
    try:
        validator.equipment(bad, spec['bodySha256'], body, manifest_path)
    except ValueError as error:
        negatives.append({'case': label, 'rejected': str(error)})
    else:
        raise AssertionError(label)

pattern_positions, pattern_weights = corners(OUT / (spec['id'] + '.glb'))
author_positions, author_weights = corners(asset)
assert pattern_positions.shape == author_positions.shape
max_position_delta = float(np.max(np.abs(pattern_positions - author_positions)))
assert max_position_delta < 1e-7
assert set(pattern_weights) == set(author_weights)
max_weight_delta = max(float(np.max(np.abs(pattern_weights[name] - author_weights[name]))) for name in pattern_weights)
# Blender 4.5.9 primitive_extract.py deliberately removes influences <= 0.0001.
# Check that exact pruning/renormalization rule instead of loosening correspondence.
names = sorted(pattern_weights)
before = np.stack([pattern_weights[name] for name in names], axis=1)
after = np.stack([author_weights[name] for name in names], axis=1)
expected = np.where(before > 0.0001, before, 0)
expected /= expected.sum(1)[:, None]
max_export_rule_delta = float(np.max(np.abs(expected - after)))
assert max_export_rule_delta < 2e-6
construction = json.loads((OUT / 'construction.json').read_text(encoding='utf-8'))
surface_faces = construction['faces']
edge_uses = collections.defaultdict(list)
for tri in surface_faces:
    for a, b in zip(tri, tri[1:] + tri[:1]):
        edge_uses[tuple(sorted((a, b)))].append((a, b))
assert all(len(uses) <= 2 for uses in edge_uses.values())
assert all(len(uses) == 1 or uses[0] == uses[1][::-1] for uses in edge_uses.values())
boundary = collections.defaultdict(set)
for a, b in construction['boundaryEdges']:
    boundary[a].add(b)
    boundary[b].add(a)
assert all(len(neighbors) == 2 for neighbors in boundary.values())
remaining = set(boundary)
loops = 0
while remaining:
    loops += 1
    stack = [remaining.pop()]
    while stack:
        for vertex in boundary[stack.pop()]:
            if vertex in remaining:
                remaining.remove(vertex)
                stack.append(vertex)
assert loops == 3
exported = GLB(asset.read_bytes())
primitive = exported.doc['meshes'][0]['primitives'][0]
indices = [row[0] for row in exported.accessor(primitive['indices'])]
closed_edges = collections.defaultdict(list)
for start in range(0, len(indices), 3):
    tri = indices[start:start + 3]
    for a, b in zip(tri, tri[1:] + tri[:1]):
        closed_edges[tuple(sorted((a, b)))].append((a, b))
assert all(len(uses) == 2 and uses[0] == uses[1][::-1] for uses in closed_edges.values())
material = exported.doc['materials'][primitive['material']]
assert 'KHR_materials_unlit' in material.get('extensions', {})
assert np.max(np.abs(np.array(material['pbrMetallicRoughness']['baseColorFactor']) - spec['color'])) < 1e-7
assert material['pbrMetallicRoughness'].get('metallicFactor', 1) == 0
assert abs(material['pbrMetallicRoughness']['roughnessFactor'] - 0.9) < 1e-6
assert material.get('doubleSided', False) is False

repeat = {}
for filename in [spec['id'] + '.glb', 'author-export.glb', 'author-repeat-export.glb']:
    observed = [sha(BASE / directory / filename) for directory in ['generated', 'rebuild']]
    assert observed[0] == observed[1]
    repeat[filename] = observed[0]
assert repeat['author-export.glb'] == repeat['author-repeat-export.glb']
write(OUT / 'author-equipment.json', {'schema': 'zbgs-equipment-v1', 'items': [entry]})
fit = {'schema': 'm2-layered-garment-fit-v1', 'id': spec['fitId'], 'version': 2, 'styleId': spec['styleId'], 'assetSha256': entry['sha256'],
       'targetBodySha256': spec['bodySha256'], 'innerTopSha256': spec['parentTopSha256'], 'layerWith': spec['layerWith'], 'allowedBottoms': spec['allowedBottoms'],
       'sourceSpecSha256': sha(BASE / 'spec.json'), 'bindingMode': 'exact original inverse binds; barycentric skin transfer from actual top section/shoulder surface; measured local panel clearance fit',
       'coverage': [], 'physics': 'skinning-only', 'sourceAdmission': entry['admission'], 'notRuntimeRegistered': True, 'gameAcceptance': False}
write(OUT / 'fit.json', fit)
write(OUT / 'binding-check.json', {'structuralBindingPassed': True, 'result': binding, 'negativeChecks': negatives, 'sourceGeometryAdmission': audit['passedNoInitialIntersections'], 'gameAcceptance': False})
write(OUT / 'source-correspondence.json', {'sameTriangleCornerOrdering': True, 'maxCornerPositionDeltaM': max_position_delta, 'maxNamedBoneWeightDelta': max_weight_delta,
      'blenderWeightRule': 'Blender 4.5.9 glTF exporter removes influences <= 0.0001 and normalizes survivors', 'maxExportRuleDelta': max_export_rule_delta,
      'threeBoundaryLoops': loops, 'surfaceEdgeOrientationPassed': True, 'actualAuthorExportClosedEdgeOrientationPassed': True,
      'actualAuthorExportMaterial': material, 'actualAuthorExportMeshNames': [mesh['name'] for mesh in exported.doc['meshes']],
      'repeatedExports': repeat, 'runtimeAcceptance': False})
write(BASE / 'manifest.json', {'files': [{'path': path.relative_to(BASE).as_posix(), 'sha256': sha(path), 'bytes': path.stat().st_size} for path in sorted(BASE.rglob('*')) if path.is_file() and path.name != 'manifest.json']})
print(json.dumps({'binding': binding, 'admission': entry['admission'], 'positionDeltaM': max_position_delta, 'weightDelta': max_weight_delta, 'repeat': repeat}))
