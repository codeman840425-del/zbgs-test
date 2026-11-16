"""Exact existing short-hair reuse, checked against actual target body geometry."""
import argparse
import ast
import copy
import hashlib
import json
from pathlib import Path
import re
import sys
import time
import tempfile

sys.dont_write_bytecode = True
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-preset-short-hair-fits-v1'
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB, local, require


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()


def diagnostic_bytes(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n').encode()


def pinned(root, name, expected):
    data = local(root, name).read_bytes()
    require(sha(data) == expected, 'SHA mismatch: '+name)
    return data


def points(glb, primitive, key='POSITION'):
    return np.array(glb.accessor(primitive['attributes'][key]))


def apply(vertices, matrix):
    return (np.column_stack([vertices, np.ones(len(vertices))]) @ matrix.T)[:, :3]


# Reuse only the reviewed pure numerical function. The historical script's
# top-level source writer and report code never execute in this pipeline.
PROBE = ROOT/'scripts/m2-hairstyle-v1/check-head-space.py'
tree = ast.parse(PROBE.read_text(encoding='utf-8-sig'))
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'segment_hits')
namespace = {'np': np}
exec(compile(ast.Module(body=[function], type_ignores=[]), str(PROBE), 'exec'), namespace)
segment_hits = namespace['segment_hits']


def strict_pairs(hair, other, triangle_ids):
    result = set()
    lo, hi = other.min(1), other.max(1)
    for hair_index, triangle in enumerate(hair):
        candidates = np.flatnonzero(np.all(hi >= triangle.min(0), axis=1) & np.all(lo <= triangle.max(0), axis=1))
        if not len(candidates):
            continue
        triangles = other[candidates]
        hits = np.zeros(len(triangles), dtype=bool)
        for edge in range(3):
            hits |= segment_hits(triangle[edge], triangle[(edge+1) % 3], triangles)
        for index, face in enumerate(triangles):
            for edge in range(3):
                if segment_hits(face[edge], face[(edge+1) % 3], triangle[None])[0]:
                    hits[index] = True
        result.update((hair_index, int(triangle_ids[candidates[index]])) for index in np.flatnonzero(hits))
    return result


def frame(glb):
    head = next(bone['node'] for bone in glb.doc['extensions']['VRM']['humanoid']['humanBones'] if bone['bone'] == 'head')
    skin = next(skin for skin in glb.doc['skins'] if head in skin['joints'])
    inverse = np.array(glb.accessor(skin['inverseBindMatrices']))[skin['joints'].index(head)].reshape(4, 4).T
    return head, inverse


def images(glb):
    result = []
    for image in glb.doc['images']:
        require('uri' not in image, 'External images unsupported')
        view = glb.doc['bufferViews'][image['bufferView']]
        result.append((image.get('mimeType'), sha(glb.binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']])))
    return result


def family(spec):
    original = GLB(pinned(ROOT, spec['body'], spec['bodySha256']))
    asset = GLB(pinned(ROOT, spec['asset'], spec['assetSha256']))
    manifest = json.loads(pinned(ROOT, spec['manifest'], spec['manifestSha256']))
    require(manifest['id'] == spec['styleId'] and manifest['sourceMaterial'] == spec['material'], 'Source manifest mismatch')
    require(manifest['physics'] == 'rigid' and manifest['headLocal'] is True, 'Source mechanism differs')
    require(len(asset.doc['meshes']) == 1 and len(asset.doc['meshes'][0]['primitives']) == 1 and not asset.doc.get('skins') and not asset.doc.get('animations'), 'Expected exact rigid single-mesh hair')
    head, inverse = frame(original)
    primitive = asset.doc['meshes'][0]['primitives'][0]
    vertices = apply(points(asset, primitive), np.linalg.inv(inverse))
    triangles = np.array(asset.accessor(primitive['indices']), int).reshape(-1, 3)
    require(np.isfinite(vertices).all(), 'Nonfinite source hair')
    return original, manifest, vertices[triangles], head, inverse


def inspect(original, target, hair, head, inverse, material, classify=None):
    require(original.doc['nodes'] == target.doc['nodes'], 'Target nodes/raw transforms differ')
    require(original.doc['materials'] == target.doc['materials'] and images(original) == images(target), 'Target material/image identity differs')
    require(len(original.doc['skins']) == len(target.doc['skins']), 'Skin count differs')
    for a, b in zip(original.doc['skins'], target.doc['skins']):
        require(a['joints'] == b['joints'] and original.accessor(a['inverseBindMatrices']) == target.accessor(b['inverseBindMatrices']), 'Raw joint/bind identity differs')
    require(len(original.doc['meshes']) == len(target.doc['meshes']), 'Mesh count differs')
    diagnostics = []
    for mesh_index, (a, b) in enumerate(zip(original.doc['meshes'], target.doc['meshes'])):
        require(len(a['primitives']) == len(b['primitives']), 'Primitive count differs')
        for primitive_index, (p, q) in enumerate(zip(a['primitives'], b['primitives'])):
            name = original.doc['materials'][p['material']]['name']
            require(p['material'] == q['material'], 'Primitive material differs')
            require(original.accessor(p['indices']) == target.accessor(q['indices']), 'Index topology differs')
            for attribute in ['TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']:
                require(original.accessor(p['attributes'][attribute]) == target.accessor(q['attributes'][attribute]), 'UV/skin dependency differs')
            indices = np.array(original.accessor(p['indices']), int).reshape(-1, 3)
            used = np.unique(indices)
            source_positions, target_positions = points(original, p), points(target, q)
            source_local = apply(source_positions, inverse)
            if name == material:
                require(np.array_equal(source_positions[used], target_positions[used]), 'Original HAIR cap geometry differs')
                require(np.array_equal(points(original, p, 'NORMAL')[used], points(target, q, 'NORMAL')[used]), 'Original HAIR cap normals differ')
                skin = original.doc['skins'][0]
                joints, weights = points(original, p, 'JOINTS_0'), points(original, p, 'WEIGHTS_0')
                require(all(skin['joints'][int(j)] == head for j, w in zip(joints[used].flat, weights[used].flat) if w > 1e-7), 'Source cap not head-only weighted')
            targets_a, targets_b = p.get('targets', []), q.get('targets', [])
            require(len(targets_a) == len(targets_b), 'Morph target count differs')
            poses = [('neutral', source_positions, target_positions)]
            for index, (ta, tb) in enumerate(zip(targets_a, targets_b)):
                da = np.array(original.accessor(ta['POSITION']))
                db = np.array(target.accessor(tb['POSITION']))
                poses.append(('morph-'+str(index), source_positions+da, target_positions+db))
            # Keep the source scalp, posterior head and non-skin head parts
            # exact. Front lower-face changes still need real contact tests.
            skin = original.doc['skins'][0]
            if head in skin['joints']:
                joints, weights = points(original, p, 'JOINTS_0'), points(original, p, 'WEIGHTS_0')
                head_weight = np.sum(np.where(joints == skin['joints'].index(head), weights, 0), axis=1)
                protected = used[(head_weight[used] > .98) & ((source_local[used, 1] >= .06) | (source_local[used, 2] >= -.025) | ('SKIN' not in name))]
            else:
                protected = np.array([], int)
            row = {'mesh': mesh_index, 'primitive': primitive_index, 'material': name, 'morphEndpoints': len(poses)-1,
                   'protectedHeadVertices': len(protected), 'changedNeutralVertices': int(np.count_nonzero(np.any(source_positions[used] != target_positions[used], axis=1))), 'poseChecks': []}
            for pose_name, source_pose, target_pose in poses:
                require(np.isfinite(target_pose).all(), 'Nonfinite target positions')
                require(np.max(np.abs(source_pose[protected]-target_pose[protected]), initial=0) < 1e-7, 'Protected head/ear/eye morph geometry differs: '+name+'/'+pose_name)
                changed = used[np.any(source_pose[used] != target_pose[used], axis=1)]
                if not len(changed):
                    continue
                changed_triangles = np.flatnonzero(np.any(np.isin(indices, changed), axis=1))
                old_pairs = strict_pairs(hair, source_pose[indices[changed_triangles]], changed_triangles)
                new_pairs = strict_pairs(hair, target_pose[indices[changed_triangles]], changed_triangles)
                introduced = sorted(new_pairs-old_pairs)
                row['poseChecks'].append({'pose': pose_name, 'changedTriangles': len(changed_triangles), 'sourcePairs': len(old_pairs), 'targetPairs': len(new_pairs), 'introducedPairs': introduced[:24]})
                if introduced:
                    review = classify(introduced, source_pose, target_pose, indices, name, pose_name) if classify else None
                    if review:
                        row['poseChecks'][-1]['contactClassification'] = review
                    if not review or not review['allPositiveDepthPatchesTransparent']:
                        diagnostics.append(row)
                        return diagnostics, {'material': name, 'pose': pose_name, 'introducedStrictPairs': len(introduced), 'samplePairs': introduced[:24]}
            diagnostics.append(row)
    return diagnostics, None


def export(spec, row, batch_root, contact_policy=None):
    original, manifest, hair, head, inverse = family(spec)
    target_bytes = pinned(batch_root, row['avatar']['path'], row['avatar']['sha256'])
    target = GLB(target_bytes)
    contact_records = []
    texture_sha = None
    classifier = None
    if contact_policy == 'transparent-source-texels':
        import io
        from PIL import Image
        from contact_geometry import measure_pair
        asset = GLB(pinned(ROOT, spec['asset'], spec['assetSha256']))
        primitive = asset.doc['meshes'][0]['primitives'][0]
        uv = points(asset, primitive, 'TEXCOORD_0')
        hair_indices = np.array(asset.accessor(primitive['indices']), int).reshape(-1, 3)
        material = asset.doc['materials'][primitive['material']]
        require(material.get('alphaMode') == 'BLEND', 'Conditional source must retain reviewed alpha blending')
        texture = asset.doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
        image = asset.doc['images'][texture['source']]
        view = asset.doc['bufferViews'][image['bufferView']]
        image_bytes = asset.binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
        texture_sha = sha(image_bytes)
        alpha_image = Image.open(io.BytesIO(image_bytes)).convert('RGBA')
        def classifier(pairs, source_pose, target_pose, indices, name, pose):
            measurements = []
            for hair_index, face_index in pairs:
                result = measure_pair(hair[hair_index], source_pose[indices[face_index]], target_pose[indices[face_index]], uv[hair_indices[hair_index]], alpha_image, inverse)
                measurements.append({'hairTriangle': hair_index, 'targetTriangle': face_index, **result})
            transparent = all(len(m['positiveDepthTextureFootprints']) == 2 and all(f['conservativeTexelFootprint'] > 0 and f['maxAlpha0To255'] == 0 for f in m['positiveDepthTextureFootprints']) for m in measurements)
            summary = {'allPositiveDepthPatchesTransparent': transparent, 'introducedPairs': len(pairs),
                       'maxProjectedPlaneDepthM': max(m['targetProjectedPlaneDepthM'] for m in measurements)}
            contact_records.append({'material': name, 'pose': pose, 'summary': summary, 'measurements': measurements})
            return summary
    diagnostics, failure = inspect(original, target, hair, head, inverse, spec['material'], classifier)
    report = {'targetId': row['id'], 'styleId': spec['styleId'], 'targetBodySha256': sha(target_bytes),
              'sourceBodySha256': spec['bodySha256'], 'assetSha256': spec['assetSha256'], 'primitives': diagnostics,
              'failure': failure, 'runtimeAccepted': False, 'scope': 'Exact raw/head/material dependencies plus neutral and individual authored morph endpoint changed-triangle checks. Preserved source intersection pairs remain. No alpha-aware or continuous motion acceptance.'}
    if contact_policy:
        report['contactPolicy'] = contact_policy
        report['contactSummary'] = [record['summary'] for record in contact_records]
    if failure:
        return {'FAILED.json': diagnostic_bytes(report)}, 'failed'
    fit = {'schema': 'character-hair-fit-v1', 'id': spec['styleId']+'-'+row['id']+'-fit-v1', 'version': 1,
           'styleId': spec['styleId'], 'targetBodySha256': sha(target_bytes), 'sourceBodySha256': spec['bodySha256'],
           'assetSha256': spec['assetSha256'], 'sourceMaterial': spec['material'], 'rawBone': original.doc['nodes'][head]['name'],
           'physics': 'rigid', 'geometryReuse': True,
           'attachment': {'bone': 'head', 'space': 'raw-head-bind-local', 'position': [0, 0, 0], 'quaternion': [0, 0, 0, 1], 'scale': [1, 1, 1]},
           'hideOriginal': {'materialNames': [spec['material']], 'hideWholeBody': False}, 'runtimeAccepted': False}
    url_base = '/assets/m2-preset-short-hair-fits-v1/'
    extra = {}
    status = 'source-fit-ready'
    manifest = copy.deepcopy(manifest)
    if contact_records:
        url_base += 'conditional/'
        contact_report = {'targetId': row['id'], 'targetBodySha256': sha(target_bytes), 'sourceAssetSha256': spec['assetSha256'],
                          'sourceTextureSha256': texture_sha, 'policy': contact_policy, 'records': contact_records, 'runtimeAccepted': False,
                          'limits': ['All introduced pairs in neutral and individual authored morph endpoints have zero alpha over their conservative positive-depth UV footprints in both V orientations.',
                                     'Original geometric intersections are retained. Combined expressions, shader/outline behavior and game motion require actual root verification.']}
        contact_bytes = diagnostic_bytes(contact_report)
        fit['contactEvidence'] = {'url': url_base+row['id']+'/contact-report.json', 'sha256': sha(contact_bytes), 'status': 'conditional-transparent-source-contact'}
        manifest['status'] = 'source-contact-candidate-not-visually-accepted'
        extra['contact-report.json'] = contact_bytes
        status = 'source-contact-candidate'
    manifest['compatibleBodies'] = [sha(target_bytes)]
    manifest['fit'] = {'id': fit['id'], 'version': 1, 'url': url_base+row['id']+'/fit.json', 'sha256': sha(encoded(fit))}
    return {'fit.json': encoded(fit), 'manifest.json': encoded(manifest), 'fit-report.json': diagnostic_bytes(report), **extra}, status


def main():
    started = time.perf_counter()
    parser = argparse.ArgumentParser()
    parser.add_argument('--batch-root', required=True)
    parser.add_argument('--batch-manifest', default='assets-source/m2-representative-batch-v1/generated/manifest.json')
    parser.add_argument('--out', default='assets-source/m2-preset-short-hair-fits-v1/ready')
    parser.add_argument('--contact-policy', choices=['transparent-source-texels'])
    parser.add_argument('--only', nargs='+')
    args = parser.parse_args()
    batch_root = Path(args.batch_root).resolve()
    batch_bytes = local(batch_root, args.batch_manifest).read_bytes()
    batch = json.loads(batch_bytes)
    require(batch['schema'] == 'character-representative-batch-v1', 'Unsupported batch contract')
    spec = json.loads((BASE/'spec.json').read_text(encoding='utf-8-sig'))
    out = local(ROOT, args.out)
    require(out.is_relative_to(BASE) and out != BASE, 'Output outside new source package')
    results = []
    for row in batch['variants']:
        if args.only and row['id'] not in args.only:
            continue
        require(re.fullmatch(r'[a-z0-9-]{1,64}', row['id']), 'Unsafe target id')
        require(row['status'] == 'source-passed' and row['sex'] in spec['families'], 'Source target not ready')
        try:
            files, status = export(spec['families'][row['sex']], row, batch_root, args.contact_policy)
        except Exception as error:
            files, status = {'FAILED.json': encoded({'targetId': row['id'], 'targetBodySha256': row['avatar']['sha256'], 'error': str(error), 'runtimeAccepted': False})}, 'failed'
        folder = out/row['id']
        if folder.exists():
            require({p.name for p in folder.iterdir()} == set(files), 'Existing output status/file set differs: '+row['id'])
            require(all((folder/name).read_bytes() == data for name, data in files.items()), 'Conflicting output bytes: '+row['id'])
        else:
            out.mkdir(parents=True, exist_ok=True)
            stage = Path(tempfile.mkdtemp(prefix='.'+row['id']+'-', dir=out))
            try:
                for name, data in files.items():
                    (stage/name).write_bytes(data)
                stage.rename(folder)
            except Exception as error:
                (stage/'FAILED-WRITE.json').write_bytes(encoded({'targetId': row['id'], 'error': str(error)}))
                raise
        results.append({'targetId': row['id'], 'sex': row['sex'], 'status': status, 'targetBodySha256': row['avatar']['sha256'],
                        'files': {name: sha(data) for name, data in files.items()}})
        print(json.dumps(results[-1]), flush=True)
    receipt = {'schema': 'preset-short-hair-fit-batch-v1', 'batchManifestSha256': sha(batch_bytes), 'intersectionProbeSha256': sha(PROBE.read_bytes()),
               'results': results, 'wallClockSeconds': time.perf_counter()-started, 'runtimeAccepted': False}
    (out/'manifest.json').write_bytes(encoded(receipt))


if __name__ == '__main__':
    main()
