"""Independent CPU readback of a fixed one-piece source candidate."""
import sys
sys.dont_write_bytecode = True
import collections
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import numpy as np
from scipy.spatial import cKDTree

ROOT = Path('F:/gamemake-whole-look-prepare')
OUT = Path('F:/gamemake/evidence/m2-onepiece-source-independent-v1')
PACKAGE = ROOT / 'assets-source/m2-onepiece-v1'
COMMIT = '340371e8f50c0267792bbe1e081547b49b92be0b'
ASSET_SHA = 'e0cac5041a50bc07dde65c75414f98bab1501125939302eec0b9e1a5de826c7b'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip() == COMMIT
module_spec = importlib.util.spec_from_file_location('asset_glb', ROOT / 'scripts/m2-male-face-v1/glb.py')
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)
asset_path = PACKAGE / 'generated/author-export.glb'
assert sha(asset_path) == ASSET_SHA
asset = module.GLB(asset_path)
entry = json.loads((PACKAGE / 'generated/author-equipment.json').read_text(encoding='utf-8'))['items'][0]
fit = json.loads((PACKAGE / 'generated/fit.json').read_text(encoding='utf-8'))
spec = json.loads((PACKAGE / 'spec.json').read_text(encoding='utf-8'))
body_path = ROOT / spec['bodyPath']
assert sha(body_path) == spec['bodySha256'] == entry['compatibleAvatarSha256']
assert entry['sha256'] == fit['assetSha256'] == ASSET_SHA
assert entry['url'] == 'author-export.glb' and entry['bytes'] == asset_path.stat().st_size
assert entry['slot'] == fit['slot'] == 'onePiece' and fit['bodyCoverageMasks'] == []
body = module.GLB(body_path)
primitive = asset.doc['meshes'][0]['primitives'][0]
positions = asset.acc(primitive['attributes']['POSITION'])
faces = asset.acc(primitive['indices']).reshape(-1, 3)
joints = asset.acc(primitive['attributes']['JOINTS_0'])
weights = asset.acc(primitive['attributes']['WEIGHTS_0'])
pattern = np.load(PACKAGE / 'generated/mesh-source.npz')
point_errors, pattern_ids = cKDTree(pattern['positions']).query(positions)
assert point_errors.max() < 2e-7
surface_count = len(pattern['bodySurface'])
# Use actual authored coordinates to weld rendering seams and inspect connectivity.
weld_ids = {}
welded = []
for point in positions:
    key = tuple(np.round(point, 7))
    weld_ids.setdefault(key, len(weld_ids))
    welded.append(weld_ids[key])
welded_faces = np.asarray(welded)[faces]
edges = collections.defaultdict(list)
adjacency = collections.defaultdict(set)
for triangle in welded_faces:
    for a, b in zip(triangle, np.roll(triangle, -1)):
        edges[tuple(sorted((int(a), int(b))))].append((int(a), int(b)))
        adjacency[int(a)].add(int(b))
        adjacency[int(b)].add(int(a))
remaining = set(range(len(weld_ids)))
components = 0
while remaining:
    components += 1
    pending = [remaining.pop()]
    while pending:
        for other in adjacency[pending.pop()]:
            if other in remaining:
                remaining.remove(other)
                pending.append(other)
assert components == 1
assert all(len(uses) == 2 and uses[0] == uses[1][::-1] for uses in edges.values())
regions = {
    'chest': (positions[:, 1] > 1.20) & (np.abs(positions[:, 0]) < .12),
    'waist': (positions[:, 1] > 1.02) & (positions[:, 1] < 1.12),
    'pelvis': (positions[:, 1] > .90) & (positions[:, 1] < 1.02),
    'leftLeg': (positions[:, 1] < .85) & (positions[:, 0] < -.02),
    'rightLeg': (positions[:, 1] < .85) & (positions[:, 0] > .02),
}
assert all(mask.any() for mask in regions.values())
body_mesh = next(index for index, mesh in enumerate(body.doc['meshes']) if any('_Body_00_SKIN' in body.doc['materials'][p['material']]['name'] for p in mesh['primitives']))
body_node = next(node for node in body.doc['nodes'] if node.get('mesh') == body_mesh)
body_skin = body.doc['skins'][body_node['skin']]
body_names = [body.doc['nodes'][index]['name'] for index in body_skin['joints']]
body_matrices = dict(zip(body_names, body.acc(body_skin['inverseBindMatrices'])))
skin = asset.doc['skins'][0]
names = [asset.doc['nodes'][index]['name'] for index in skin['joints']]
matrices = asset.acc(skin['inverseBindMatrices'])
bindings = {binding['sourceBone']: binding for binding in entry['bindings']}
assert len(set(names)) == len(names) == len(bindings) == 16
assert np.isfinite(weights).all() and weights.min() >= 0 and joints.max() < len(names)
assert np.max(np.abs(weights.sum(1) - 1)) < 1e-5
for name, matrix in zip(names, matrices):
    assert bindings[name]['targetRawBone'] == name
    assert np.array_equal(matrix, np.asarray(bindings[name]['inverseBindMatrix'], dtype=np.float32))
    assert np.max(np.abs(matrix - body_matrices[name])) < 1e-5
expected = np.zeros((len(positions), len(names)))
actual = np.zeros_like(expected)
for row, source_index in enumerate(pattern_ids):
    for joint, weight in zip(pattern['joints'][source_index % surface_count], pattern['weights'][source_index % surface_count]):
        if weight > .0001:
            expected[row, names.index(body_names[int(joint)])] += weight
    expected[row] /= expected[row].sum()
    for joint, weight in zip(joints[row], weights[row]):
        actual[row, int(joint)] += weight
weight_error = float(np.max(np.abs(expected - actual)))
assert weight_error < 2e-6
license_record = json.loads((ROOT / 'assets-source/foundation-male/source.json').read_text(encoding='utf-8'))
assert entry['sourceLicense'] == license_record
repeat = {}
for directory in ['generated', 'repeat']:
    for filename in ['author-export.glb', 'author-repeat-export.glb']:
        repeat[directory + '/' + filename] = sha(PACKAGE / directory / filename)
assert set(repeat.values()) == {ASSET_SHA}
author_report = json.loads((PACKAGE / 'generated/author-report.json').read_text(encoding='utf-8'))
assert author_report['editedFromEarlierSource'] == 'initial'
assert author_report['maximumActualSourceEditMetres'] > .001
assert author_report['editableSha256'] == sha(PACKAGE / 'generated/editable.blend')
assert sha(PACKAGE / 'initial/author-export.glb') != ASSET_SHA
manifest = json.loads((PACKAGE / 'manifest.json').read_text(encoding='utf-8'))
for item in manifest['files']:
    path = PACKAGE / item['path']
    assert sha(path) == item['sha256'] and path.stat().st_size == item['bytes']
    committed = subprocess.check_output(['git', 'show', COMMIT + ':assets-source/m2-onepiece-v1/' + item['path']], cwd=ROOT)
    assert hashlib.sha256(committed).hexdigest() == item['sha256'] and len(committed) == item['bytes']
generator_blobs = {}
for script in sorted((ROOT / 'scripts/m2-onepiece-v1').glob('*.py')):
    relative = script.relative_to(ROOT).as_posix()
    committed = subprocess.check_output(['git', 'show', COMMIT + ':' + relative], cwd=ROOT)
    assert committed == script.read_bytes()
    generator_blobs[relative] = sha(script)
contact = json.loads((PACKAGE / 'generated/static-audit.json').read_text(encoding='utf-8'))
assert contact['assetSha256'] == ASSET_SHA
kinds = []
for triangle in faces:
    inner = pattern_ids[triangle] >= surface_count
    kinds.append('inner' if inner.all() else 'outer' if not inner.any() else 'rim')
body_pairs = collections.Counter(kinds[a] for a, b in contact['bodyPairs'])
self_pairs = collections.Counter('/'.join(sorted([kinds[a], kinds[b]])) for a, b in contact['selfPairs'])
source_triangles = pattern['bodySurface'][pattern['surfaceFaces']]
source_cross = np.cross(source_triangles[:, 1] - source_triangles[:, 0], source_triangles[:, 2] - source_triangles[:, 0])
source_faces = {tuple(sorted(map(int, triangle))): index for index, triangle in enumerate(pattern['surfaceFaces'])}
reversed_areas = []
for triangle in faces:
    mapped = pattern_ids[triangle]
    if np.all(mapped < surface_count):
        original = source_faces[tuple(sorted(map(int, mapped)))]
        cross = np.cross(positions[triangle[1]] - positions[triangle[0]], positions[triangle[2]] - positions[triangle[0]])
        if np.dot(cross, source_cross[original]) < 0:
            reversed_areas.append(float(np.linalg.norm(cross) / 2))
report = {
    'sourceCommit': COMMIT, 'authorAssetSha256': ASSET_SHA, 'assetPath': str(asset_path),
    'bodySha256': sha(body_path), 'bodyUnchanged': True,
    'actualAuthorGeometry': {'vertices': len(positions), 'triangles': len(faces), 'weldedComponents': components, 'closedConsistentlyOrientedManifold': True, 'regionVertexCounts': {name: int(mask.sum()) for name, mask in regions.items()}, 'maxPositionDifferenceFromPatternMetres': float(point_errors.max())},
    'binding': {'jointCount': len(names), 'indicesValid': True, 'maxWeightSumError': float(np.max(np.abs(weights.sum(1) - 1))), 'maxWeightErrorAfterDocumentedBlenderThreshold': weight_error, 'maxRestBindDifferenceFromOriginalBody': max(float(np.max(np.abs(matrix - body_matrices[name]))) for name, matrix in zip(names, matrices)), 'entryMatricesMatchActualAuthorExport': True},
    'sourceProduction': {'manifestFilesVerified': len(manifest['files']), 'committedPackageBlobsVerified': len(manifest['files']), 'generatorCommittedBlobSha256': generator_blobs, 'licenseMatchesExistingMaleSourceRecord': True, 'sourceEditMaximumMetres': author_report['maximumActualSourceEditMetres'], 'repeatedAuthorHashes': repeat},
    'knownRestContacts': {'bodyPairKinds': dict(body_pairs), 'selfPairKinds': dict(self_pairs), 'outerFacesReversedAgainstOriginalBodySurface': len(reversed_areas), 'reversedAreaSquareMetres': sum(reversed_areas), 'sampledNearestNormalPenetrationMetres': contact.get('maximumSampledNearestNormalPenetrationMetres'), 'sourceStaticContactGatePassed': contact['staticPassed']},
    'decision': 'Structural production and binding checks support actual runtime diagnosis of this exact source candidate. Recorded contact counts are not used as a zero-intersection acceptance gate.',
    'limits': ['CPU readback only. No Blender invocation, GPU, posed action or seated contact validation.', 'Regional normal reversal compares the offset shell with original body triangles. It does not establish visible severity.', 'Nearest-normal depth is a local sampled diagnostic, not a complete penetration bound. Known source contact defects remain recorded.', 'Reopen/export evidence was inspected and hashes checked. This independent review did not rerun Blender.']
}
(OUT / 'review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'sourceCommit': COMMIT, 'authorAssetSha256': ASSET_SHA, 'connectedComponents': components, 'jointCount': len(names), 'manifestFiles': len(manifest['files']), 'review': str(OUT / 'review.json')}))
