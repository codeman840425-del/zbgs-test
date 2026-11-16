"""Shared exact source-texel diagnostics, rebuilt for every v2 target endpoint."""
import hashlib
import importlib.util
import io
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/m2-preset-short-hair-fits-v1'))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


short = load('original_short_fit', ROOT/'scripts/m2-preset-short-hair-fits-v1/build.py')
texels = load('source_contact_geometry', ROOT/'scripts/m2-preset-short-hair-fits-v1/contact_geometry.py')
pony = load('original_ponytail_fit', ROOT/'scripts/m2-preset-ponytail-fits-v1/build.py')
_pairs = short.strict_pairs
_cache = {}
_inclusive_cache = {}


def cached_pairs(hair, other, ids):
    key = hashlib.sha256(hair.tobytes()+other.tobytes()+ids.tobytes()).hexdigest()
    if key not in _cache: _cache[key] = _pairs(hair, other, ids)
    return _cache[key]


short.strict_pairs = cached_pairs


def inclusive_pairs(hair, other, ids):
    key = hashlib.sha256(hair.tobytes()+other.tobytes()+ids.tobytes()).hexdigest()
    if key not in _inclusive_cache:
        P, Q = hair.reshape(-1, 3), other.reshape(-1, 3)
        F, G = np.arange(len(P)).reshape(-1, 3), np.arange(len(Q)).reshape(-1, 3)
        _inclusive_cache[key] = {(int(a), int(ids[b])) for a, b in pony.diagnostics.intersections(P, F, Q, G)}
    return _inclusive_cache[key]


def audit(original, target, asset, hair, head, inverse, material):
    dependencies = pony.head_dependencies(original, target)
    p = asset.doc['meshes'][0]['primitives'][0]
    triangles = np.array(asset.accessor(p['indices']), int).reshape(-1, 3)
    inclusive_hair_local = short.points(asset, p)[triangles]
    uv = short.points(asset, p, 'TEXCOORD_0')
    m = asset.doc['materials'][p['material']]
    short.require(m.get('alphaMode') == 'BLEND', 'Only exact original BLEND texture contact diagnostics supported')
    texture = asset.doc['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]
    view = asset.doc['bufferViews'][asset.doc['images'][texture['source']]['bufferView']]
    offset = view.get('byteOffset', 0); image_bytes = asset.binary[offset:offset+view['byteLength']]
    image = Image.open(io.BytesIO(image_bytes)).convert('RGBA'); contacts = []
    def classify(pairs, source_pose, target_pose, indices, name, pose):
        measurements = []
        for h, f in pairs:
            measured = texels.measure_pair(hair[h], source_pose[indices[f]], target_pose[indices[f]], uv[triangles[h]], image, inverse)
            measurements.append({'hairTriangle': h, 'targetTriangle': f, **measured})
        transparent = all(len(r['positiveDepthTextureFootprints']) == 2 and all(f['conservativeTexelFootprint'] > 0 and f['maxAlpha0To255'] == 0 for f in r['positiveDepthTextureFootprints']) for r in measurements)
        summary = {'allPositiveDepthPatchesTransparent': transparent, 'introducedPairs': len(pairs),
            'maxProjectedPlaneDepthM': max(r['targetProjectedPlaneDepthM'] for r in measurements)}
        contacts.append({'material': name, 'pose': pose, 'summary': summary, 'measurements': measurements})
        return summary
    # New explicit v2 contract. The v1 absolute-position gate is untouched.
    # Every changed surface is measured at every authored endpoint, including
    # side-head rows that differ from the original body's protected heuristic.
    rows = []; failure = None; neutral_head_changes = []
    for mi, (old_mesh, new_mesh) in enumerate(zip(original.doc['meshes'], target.doc['meshes'])):
        short.require(len(old_mesh['primitives']) == len(new_mesh['primitives']), 'Primitive set changed')
        for pi, (p, q) in enumerate(zip(old_mesh['primitives'], new_mesh['primitives'])):
            name = original.doc['materials'][p['material']]['name']
            indices = np.array(original.accessor(p['indices']), int).reshape(-1, 3); used = np.unique(indices)
            short.require(np.array_equal(indices, np.array(target.accessor(q['indices'])).reshape(-1, 3)), 'Topology changed')
            for key in ['TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']:
                short.require((key in p['attributes']) == (key in q['attributes']), 'Attribute presence changed')
                if key in p['attributes']: short.require(original.accessor(p['attributes'][key]) == target.accessor(q['attributes'][key]), 'UV/skin changed')
            A, B = short.points(original, p), short.points(target, q)
            old_targets, new_targets = p.get('targets', []), q.get('targets', [])
            short.require(len(old_targets) == len(new_targets), 'Morph count changed')
            poses = [('neutral', A, B)]+[('morph-'+str(i), A+np.array(original.accessor(a['POSITION'])), B+np.array(target.accessor(b['POSITION']))) for i, (a, b) in enumerate(zip(old_targets, new_targets))]
            skin = original.doc['skins'][0]; J, W = short.points(original, p, 'JOINTS_0'), short.points(original, p, 'WEIGHTS_0')
            hw = np.where(J == skin['joints'].index(head), W, 0).sum(1); local = short.apply(A, inverse)
            protected = used[(hw[used] > .98)&((local[used, 1] >= .06)|(local[used, 2] >= -.025)|('SKIN' not in name))]
            row = {'mesh': mi, 'primitive': pi, 'material': name, 'morphEndpoints': len(poses)-1, 'poseChecks': []}
            for pose, source_pose, target_pose in poses:
                short.require(np.isfinite(target_pose).all(), 'Nonfinite target endpoint')
                changed = used[np.any(source_pose[used] != target_pose[used], axis=1)]
                changed_triangles = np.flatnonzero(np.any(np.isin(indices, changed), axis=1))
                old_pairs = cached_pairs(hair, source_pose[indices[changed_triangles]], changed_triangles) if len(changed_triangles) else set()
                new_pairs = cached_pairs(hair, target_pose[indices[changed_triangles]], changed_triangles) if len(changed_triangles) else set()
                old_inclusive = inclusive_pairs(inclusive_hair_local, short.apply(source_pose, inverse)[indices[changed_triangles]], changed_triangles) if len(changed_triangles) else set()
                new_inclusive = inclusive_pairs(inclusive_hair_local, short.apply(target_pose, inverse)[indices[changed_triangles]], changed_triangles) if len(changed_triangles) else set()
                introduced = sorted((new_pairs-old_pairs)|(new_inclusive-old_inclusive))
                protected_error = float(np.max(abs(source_pose[protected]-target_pose[protected]), initial=0))
                record = {'pose': pose, 'changedTriangles': len(changed_triangles), 'sourcePairs': len(old_pairs), 'targetPairs': len(new_pairs), 'allIntroducedPairs': introduced,
                    'sourceInclusivePairs': len(old_inclusive), 'targetInclusivePairs': len(new_inclusive), 'introducedStrictPairs': sorted(new_pairs-old_pairs),
                    'targetPositionSha256': short.sha(target_pose[used].astype('<f4').tobytes()), 'protectedPositionMaxErrorM': protected_error}
                if introduced:
                    record['contactClassification'] = classify(introduced, source_pose, target_pose, indices, name, pose)
                    if not record['contactClassification']['allPositiveDepthPatchesTransparent'] and failure is None:
                        failure = {'material': name, 'pose': pose, 'introducedStrictPairs': len(introduced), 'samplePairs': introduced[:24]}
                row['poseChecks'].append(record)
                if pose == 'neutral':
                    altered = protected[np.max(abs(source_pose[protected]-target_pose[protected]), axis=1) >= 1e-7]
                    if len(altered): neutral_head_changes.append({'mesh': mi, 'primitive': pi, 'material': name, 'vertices': altered.tolist(),
                        'sourceHeadLocalM': local[altered].tolist(), 'targetHeadLocalM': short.apply(target_pose[altered], inverse).tolist(),
                        'maxDisplacementM': float(np.linalg.norm(target_pose[altered]-source_pose[altered], axis=1).max())})
            rows.append(row)
    source_dependency_changes = [{'material': r['material'], 'pose': p['pose'], 'maximumM': p['protectedPositionMaxErrorM']}
        for r in rows for p in r['poseChecks'] if p.get('protectedPositionMaxErrorM', 0) >= 1e-7]
    result = {'schema': 'measured-v2-hair-authored-endpoints-v1', 'dependencies': dependencies, 'primitives': rows, 'failure': failure, 'sourceProtectedDependencyChanges': source_dependency_changes,
        'neutralHeadChanges': neutral_head_changes,
        'actualTargetAll55FaceEndpoints': all(len(r['poseChecks']) == r['morphEndpoints']+1 for r in rows) and max(r['morphEndpoints'] for r in rows) >= 54,
        'faceAuthoredMorphCount': max(r['morphEndpoints'] for r in rows), 'faceEndpointCountIncludingNeutral': max(r['morphEndpoints'] for r in rows)+1,
        'inclusiveCoordinateSpace': 'Exact authored raw-head-local asset POSITION, body/face endpoints transformed by original exact head inverse bind; no asset modelspace round-trip',
        'geometryAdmission': 'New exact-target v2 fit requires preserved cap/nodes/binds/materials/UV/images plus all endpoint added pairs zero, or explicitly recorded freshly verified zero-alpha footprints',
        'runtimeAccepted': False}
    receipt = {'sourceTextureSha256': short.sha(image_bytes), 'records': contacts, 'freshTargetEndpointCalculation': True,
        'limits': ['Both V orientations and conservative positive-depth texel footprints must have max alpha exactly zero.',
            'Source side-head changes are recorded explicitly under the new exact-target v2 criterion. Combined expressions and game shading/motion remain untested.'], 'runtimeAccepted': False}
    return result, receipt


def evidence_files(target_id, body_sha, asset_sha, geometry, contacts, prefix):
    short.require(geometry['actualTargetAll55FaceEndpoints'] and geometry['failure'] is None, 'Complete endpoint geometry failed')
    geometry_bytes, contact_bytes = short.diagnostic_bytes(geometry), short.diagnostic_bytes(contacts)
    added = sum(len(p['allIntroducedPairs']) for r in geometry['primitives'] for p in r['poseChecks'])
    evidence = {'schema': 'hair-fit-evidence-v2', 'targetId': target_id, 'targetBodySha256': body_sha, 'assetSha256': asset_sha,
        'criterion': 'Exact cap/nodes/inverse-binds/materials/UV/images preserved; neutral plus every authored morph endpoint; union of added strict-interior and original inclusive ponytail pairs requires freshly measured zero-alpha positive-depth footprints',
        'intersectionMetrics': ['reviewed strict-interior hair segment test', 'unchanged original ponytail inclusive triangle test'],
        'introducedPairsAcrossEndpoints': added, 'allAuthoredEndpointsMeasured': True, 'faceEndpointCountIncludingNeutral': geometry['faceEndpointCountIncludingNeutral'], 'originalHeadSurfaceUnchanged': False, 'originalCapUnchanged': True,
        'neutralHeadChanges': geometry['neutralHeadChanges'], 'geometryReport': {'url': prefix+target_id+'/geometry-report.json', 'sha256': short.sha(geometry_bytes)},
        'contactReport': {'url': prefix+target_id+'/contact-report.json', 'sha256': short.sha(contact_bytes)},
        'limits': ['Individual authored endpoints only. Combined/continuous expressions, posed contact and actual side-head/ears/roots require game review.'], 'runtimeAccepted': False}
    raw = short.encoded(evidence)
    return {'geometry-report.json': geometry_bytes, 'contact-report.json': contact_bytes, 'evidence.json': raw}, {'schema': evidence['schema'], 'url': prefix+target_id+'/evidence.json', 'sha256': short.sha(raw)}
