"""Two-case source and supplied-pose diagnosis of vest/pants layer contact."""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from qa_representative_batch_v2 import nearest_binding
reader = importlib.util.spec_from_file_location('vest_glb', ROOT/'scripts/m2-male-face-v1/glb.py')
module = importlib.util.module_from_spec(reader)
reader.loader.exec_module(module)
GLB = module.GLB
IDS = ['female-round-full-v2', 'female-soft-wide-v2']
FILES = {}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(path):
    path = path.resolve()
    raw = path.read_bytes()
    name = path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else str(path)
    FILES[name] = {'path': name, 'sha256': sha(raw), 'bytes': len(raw)}
    return raw


def load(path, token):
    pin(path)
    model = GLB(path)
    primitive = next(p for mesh in model.doc['meshes'] for p in mesh['primitives'] if token in model.doc['materials'][p['material']]['name'])
    return {'model': model, 'primitive': primitive, 'positions': model.acc(primitive['attributes']['POSITION']).astype(float),
            'faces': model.acc(primitive['indices']).astype(int).reshape(-1, 3)}


def material_info(mesh):
    model, p = mesh['model'], mesh['primitive']
    material = model.doc['materials'][p['material']]
    result = {'material': material, 'images': model.images() if model.doc.get('images') else [], 'alpha': None}
    texture = material.get('pbrMetallicRoughness', {}).get('baseColorTexture')
    if texture:
        image = model.doc['images'][model.doc['textures'][texture['index']]['source']]
        view = model.doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        encoded = model.bin[start:start+view['byteLength']]
        alpha = np.asarray(Image.open(io.BytesIO(encoded)).convert('RGBA'))[:, :, 3]
        result['alpha'] = {'encodedImageSha256': sha(encoded), 'width': alpha.shape[1], 'height': alpha.shape[0],
                           'decodedAlphaSha256': sha(alpha.tobytes()), 'minimum': int(alpha.min()), 'maximum': int(alpha.max())}
    return result


def bones(model):
    return {model.doc['nodes'][node]['name']: matrix for skin in model.doc['skins']
            for node, matrix in zip(skin['joints'], model.acc(skin['inverseBindMatrices']))}


def blended_weights(mesh, triangle, barycentric):
    model, primitive = mesh['model'], mesh['primitive']
    joints = model.acc(primitive['attributes']['JOINTS_0'])
    weights = model.acc(primitive['attributes']['WEIGHTS_0'])
    names = [model.doc['nodes'][i]['name'] for i in model.doc['skins'][0]['joints']]
    result = {}
    for vertex, fraction in zip(mesh['faces'][triangle], barycentric):
        for joint, weight in zip(joints[vertex], weights[vertex]):
            if weight > 0:
                name = names[int(joint)]
                result[name] = result.get(name, 0)+float(weight*fraction)
    return result


def cover(point, triangle_xy, triangle_depth):
    a = triangle_xy[:, 0]
    e1, e2 = triangle_xy[:, 1]-a, triangle_xy[:, 2]-a
    delta = point-a
    det = e1[:, 0]*e2[:, 1]-e1[:, 1]*e2[:, 0]
    u = np.divide(delta[:, 0]*e2[:, 1]-delta[:, 1]*e2[:, 0], det, out=np.full(len(det), np.inf), where=abs(det)>1e-14)
    v = np.divide(e1[:, 0]*delta[:, 1]-e1[:, 1]*delta[:, 0], det, out=np.full(len(det), np.inf), where=abs(det)>1e-14)
    inside = (u >= -1e-10)&(v >= -1e-10)&(u+v <= 1+1e-10)
    depth = triangle_depth[:, 0]+u*(triangle_depth[:, 1]-triangle_depth[:, 0])+v*(triangle_depth[:, 2]-triangle_depth[:, 0])
    depth[~inside] = np.inf
    index = int(np.argmin(depth))
    if not np.isfinite(depth[index]):
        return None
    return index, np.array([1-u[index]-v[index], u[index], v[index]]), float(depth[index])


def front_samples(top, pants):
    p, f, q, g = top['positions'], top['faces'], pants['positions'], pants['faces']
    samples = q[g].mean(1)
    ids = np.flatnonzero((samples[:, 1] >= .98)&(samples[:, 1] <= 1.04)&(abs(samples[:, 0]) <= .10)&(samples[:, 2] < 0))
    rows = []
    for index in ids:
        hit = cover(samples[index, :2], p[f, :2], p[f, 2])
        if hit and hit[2]-samples[index, 2] > 1e-7:
            ti, bary, z = hit
            rows.append({'pantsTriangle': int(index), 'pantsIndices': g[index].tolist(), 'pantsBarycentric': [1/3]*3,
                         'pantsPointM': samples[index].tolist(), 'topTriangle': ti, 'topIndices': f[ti].tolist(),
                         'topBarycentric': bary.tolist(), 'topPointM': [*samples[index, :2].tolist(), z],
                         'frontDepthDifferenceM': float(z-samples[index, 2])})
    return {'candidateCentroids': len(ids), 'pantsAheadOfCompleteTopCentroids': rows,
            'maximumSampledFrontDepthDifferenceM': max((r['frontDepthDifferenceM'] for r in rows), default=0),
            'scope': 'Original mesh coordinates, parallel rays from negative Z. Depth is along Z, not Euclidean penetration. Centroid sampling is not a surface maximum.'}


def segment_triangle(start, end, triangle):
    direction = end-start
    e1, e2 = triangle[1]-triangle[0], triangle[2]-triangle[0]
    h = np.cross(direction, e2)
    det = e1@h
    if abs(det) <= 1e-14:
        return None
    s = start-triangle[0]
    u = (s@h)/det
    cross = np.cross(s, e1)
    v, t = (direction@cross)/det, (e2@cross)/det
    if u >= -1e-9 and v >= -1e-9 and u+v <= 1+1e-9 and -1e-9 <= t <= 1+1e-9:
        return start+t*direction
    return None


def crossing_pairs(top, pants):
    a, b = top['positions'][top['faces']], pants['positions'][pants['faces']]
    low, high = a.min(1), a.max(1)
    rows = []
    for bi, triangle in enumerate(b):
        if triangle[:, 1].max() < .98 or triangle[:, 2].min() >= 0 or triangle[:, 0].min() > .10 or triangle[:, 0].max() < -.10:
            continue
        candidates = np.flatnonzero(np.all(high >= triangle.min(0)-1e-10, axis=1)&np.all(low <= triangle.max(0)+1e-10, axis=1))
        for ai in candidates:
            points = []
            for first, second in [(triangle, a[ai]), (a[ai], triangle)]:
                for edge in range(3):
                    point = segment_triangle(first[edge], first[(edge+1)%3], second)
                    if point is not None and not any(np.linalg.norm(point-old) < 1e-8 for old in points):
                        points.append(point)
            if len(points) >= 2:
                rows.append({'topTriangle': int(ai), 'pantsTriangle': bi, 'topIndices': top['faces'][ai].tolist(),
                             'pantsIndices': pants['faces'][bi].tolist(), 'intersectionPointsM': [p.tolist() for p in points]})
    return rows


def transfer_rows(original, target, body, target_body, vertex_ids):
    selected = np.array(sorted(set(vertex_ids)), int)
    points = original['positions'][selected]
    chosen, bary, anchor, _, _ = nearest_binding(points, body['positions'], body['faces'])
    donor_old = body['positions'][body['faces'][chosen]]
    donor_new = target_body['positions'][body['faces'][chosen]]
    target_anchor = np.einsum('ni,nij->nj', bary, donor_new)
    offset = points-anchor
    actual_offset = target['positions'][selected]-target_anchor
    def normals(tris):
        n = np.cross(tris[:, 1]-tris[:, 0], tris[:, 2]-tris[:, 0])
        return n/np.linalg.norm(n, axis=1)[:, None]
    before, after = normals(donor_old), normals(donor_new)
    return [{'vertex': int(vertex), 'donorBodyTriangle': int(chosen[i]), 'donorIndices': body['faces'][chosen[i]].tolist(), 'barycentric': bary[i].tolist(),
             'sourceOffsetM': offset[i].tolist(), 'targetOffsetM': actual_offset[i].tolist(),
             'worldOffsetVectorErrorM': float(np.linalg.norm(actual_offset[i]-offset[i])),
             'orientedDonorNormalAngleDegrees': float(np.degrees(np.arccos(np.clip(before[i]@after[i], -1, 1)))),
             'signedOffsetAlongGeometricDonorNormalBeforeM': float(offset[i]@before[i]),
             'signedOffsetAlongGeometricDonorNormalAfterM': float(actual_offset[i]@after[i])} for i, vertex in enumerate(selected)]


def project(points, camera):
    view = np.array(camera['matrixWorldInverse']).reshape(4, 4).T
    projection = np.array(camera['projectionMatrix']).reshape(4, 4).T
    clip = np.column_stack((points, np.ones(len(points))))@view.T@projection.T
    return clip[:, :3]/clip[:, 3, None], clip[:, 3]


def pose_contact(top, pants, camera, screenshot=None):
    p, f = np.array(top['worldPositions']), np.array(top['indices']).reshape(-1, 3)
    q, g = np.array(pants['worldPositions']), np.array(pants['indices']).reshape(-1, 3)
    ndc_top, w_top = project(p, camera)
    ndc_pants, w_pants = project(q, camera)
    raw = np.array(pants['positions'])[g].mean(1)
    eligible = np.flatnonzero((raw[:, 1] >= .98)&(raw[:, 1] <= 1.04)&(abs(raw[:, 0]) <= .10)&(raw[:, 2] < 0))
    samples, _ = project(q[g].mean(1), camera)
    rows = []
    for index in eligible:
        hit = cover(samples[index, :2], ndc_top[f, :2], ndc_top[f, 2])
        if hit and hit[2] > samples[index, 2]+1e-9:
            ti, bary, depth = hit
            weights = bary/w_top[f[ti]]; weights /= weights.sum()
            top_point = weights@p[f[ti]]
            pants_point = q[g[index]].mean(0)
            rows.append({'pantsTriangle': int(index), 'topTriangle': ti, 'pantsWorldM': pants_point.tolist(), 'topWorldM': top_point.tolist(),
                         'rayGapM': float(np.linalg.norm(top_point-pants_point)), 'ndcPoint': samples[index].tolist(), 'topNdcDepth': depth})
    pixels = []
    if screenshot:
        pin(screenshot)
        image = Image.open(screenshot).convert('RGB')
        projected = samples[eligible, :2]
        left, right = max(0, int((projected[:, 0].min()+1)/2*image.width)-2), min(image.width, int((projected[:, 0].max()+1)/2*image.width)+3)
        upper, lower = max(0, int((1-projected[:, 1].max())/2*image.height)-2), min(image.height, int((1-projected[:, 1].min())/2*image.height)+3)
        for y in range(upper, lower):
            for x in range(left, right):
                rgb = image.getpixel((x, y))
                if not (rgb[1] >= rgb[0]+25 and rgb[1] >= 65 and rgb[1]-10 <= rgb[2] <= rgb[1]+25 and max(rgb) < 180):
                    continue
                point = np.array([2*(x+.5)/image.width-1, 1-2*(y+.5)/image.height])
                top_hit = cover(point, ndc_top[f, :2], ndc_top[f, 2])
                pants_hit = cover(point, ndc_pants[g, :2], ndc_pants[g, 2])
                row = {'pixel': [x, y], 'rgb': list(rgb), 'topHit': top_hit is not None, 'pantsHit': pants_hit is not None}
                if top_hit and pants_hit:
                    ti, tb, tz = top_hit; bi, bb, bz = pants_hit
                    tw = tb/w_top[f[ti]]; tw /= tw.sum()
                    bw = bb/w_pants[g[bi]]; bw /= bw.sum()
                    tp, bp = tw@p[f[ti]], bw@q[g[bi]]
                    row.update(topTriangle=ti, pantsTriangle=bi, pantsInFrontOfTop=bool(bz < tz), topNdcDepth=tz, pantsNdcDepth=bz,
                               topWorldM=tp.tolist(), pantsWorldM=bp.tolist(), rayGapM=float(np.linalg.norm(tp-bp)),
                               topUV=(tw@np.array(top['uv'])[f[ti]]).tolist(), topIndices=f[ti].tolist(), pantsIndices=g[bi].tolist())
                pixels.append(row)
    return {'frontCentroidSamples': rows, 'tealPixelsInProjectedWaistROI': pixels,
            'limits': ['Teal RGB rule only locates pixels in this bounded waist region after root layer attribution. Pixel-center triangle intersections use actual supplied pose and camera. Antialiasing/mip/shadows are not raster-reimplemented.']}


def virtual_mesh(source, original_live):
    p = source['positions']
    joints = np.array(original_live['joints'], int)
    weights = np.array(original_live['weights'], float)
    bind = np.array(original_live['bindMatrix']).reshape(4, 4).T
    inverse_bind = np.array(original_live['bindMatrixInverse']).reshape(4, 4).T
    world = np.array(original_live['matrixWorld']).reshape(4, 4).T
    base = np.column_stack((p, np.ones(len(p))))@bind.T
    skinned = np.zeros_like(base)
    for joint, bone in enumerate(original_live['bones']):
        palette = np.array(bone['matrixWorld']).reshape(4, 4).T@np.array(bone['inverseBind']).reshape(4, 4).T
        influence = np.where(joints == joint, weights, 0).sum(1)
        skinned += (base@palette.T)*influence[:, None]
    skinned[:, 3] = 1
    result = dict(original_live)
    result.update(positions=p.tolist(), worldPositions=(skinned@inverse_bind.T@world.T)[:, :3].tolist())
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--posed', type=Path)
    parser.add_argument('--out', type=Path, default=ROOT/'evidence/m2-representative-vest-source-diagnosis-v1')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    pin(Path(__file__))
    pin(ROOT/'scripts/m2-male-face-v1/glb.py')
    pin(ROOT/'scripts/qa_representative_batch_v2.py')
    attribution = json.loads(pin(ROOT/'evidence/m2-representative-vest-specks-68a-v1/root-attribution.json'))
    original_top = load(ROOT/'prototype/public/assets/m1/m1-uniform-top.glb', 'Tops_01_CLOTH')
    original_pants = load(ROOT/'prototype/public/assets/m1/m1-training-pants.glb', 'M1_TrainingPants')
    original_body = load(ROOT/'prototype/public/assets/foundation/base-female-roundtrip.vrm', 'Body_00_SKIN')
    source = {'original': {'top': original_top, 'pants': original_pants}}
    report = {'schema': 'vest-source-diagnosis-v1', 'sourceReferenceCommit': '88ad482ebdb23e74dc9f4c5d971a556d60f1936d', 'rootLayerAttribution': attribution,
              'material': {'top': material_info(original_top), 'pants': material_info(original_pants)}, 'cases': [], 'posed': []}
    for identifier in ['original', *IDS]:
        if identifier == 'original':
            top, pants = original_top, original_pants
        else:
            folder = ROOT/'assets-source/m2-representative-batch-v2/generated'/identifier
            manifest = json.loads(pin(folder/'equipment.json'))
            top = load(folder/(identifier+'-top.glb'), 'Tops_01_CLOTH')
            pants = load(folder/(identifier+'-bottom.glb'), 'M1_TrainingPants')
            for item in manifest['items']:
                if item['slot'] in ['top', 'bottom']:
                    assert sha((folder/item['url']).read_bytes()) == item['sha256']
            source[identifier] = {'top': top, 'pants': pants}
        samples = front_samples(top, pants)
        pairs = crossing_pairs(top, pants)
        row = {'id': identifier, 'bindFrontSamples': samples, 'upperFrontCrossingPairs': pairs,
               'topTriangleCount': len(top['faces']), 'pantsTriangleCount': len(pants['faces']),
               'topCanonicalU32IndexSha256': sha(top['faces'].astype('<u4').tobytes()), 'pantsCanonicalU32IndexSha256': sha(pants['faces'].astype('<u4').tobytes()),
               'originalTopIndicesPreserved': np.array_equal(top['faces'], original_top['faces']), 'originalPantsIndicesPreserved': np.array_equal(pants['faces'], original_pants['faces']),
               'materialsAndImagesPreserved': material_info(top) == report['material']['top'] and material_info(pants) == report['material']['pants']}
        avatar = original_body['model'] if identifier == 'original' else load(ROOT/'assets-source/m2-representative-batch-v2/generated'/identifier/'avatar.vrm', 'Body_00_SKIN')['model']
        avatar_path = ROOT/'prototype/public/assets/foundation/base-female-roundtrip.vrm' if identifier == 'original' else ROOT/'assets-source/m2-representative-batch-v2/generated'/identifier/'avatar.vrm'
        row['avatarSha256'] = sha(avatar_path.read_bytes())
        avatar_bones = bones(avatar)
        row['inverseBindsMatchAvatar'] = all(name in avatar_bones and np.array_equal(matrix, avatar_bones[name]) for mesh in [top, pants] for name, matrix in bones(mesh['model']).items())
        if identifier != 'original':
            target_body = load(ROOT/'assets-source/m2-representative-batch-v2/generated'/identifier/'avatar.vrm', 'Body_00_SKIN')
            for role, original in [('top', original_top), ('pants', original_pants)]:
                vertex_ids = [v for sample in samples['pantsAheadOfCompleteTopCentroids'] for v in sample[role+'Indices']]
                row[role+'FixedBodyOffsetTransfer'] = transfer_rows(original, source[identifier][role], original_body, target_body, vertex_ids)
                a, b = original['primitive']['attributes'], source[identifier][role]['primitive']['attributes']
                row[role+'OriginalUVSkinPreserved'] = all(np.array_equal(original['model'].acc(a[k]), source[identifier][role]['model'].acc(b[k])) for k in a if k not in ['POSITION','NORMAL'])
        representative = next((r for r in samples['pantsAheadOfCompleteTopCentroids'] if r['pantsTriangle'] == 419), None)
        if representative:
            row['representative419BlendedSkinWeights'] = {'pants': blended_weights(pants, 419, representative['pantsBarycentric']), 'top': blended_weights(top, representative['topTriangle'], representative['topBarycentric'])}
        report['cases'].append(row)
    if args.posed:
        report['posedReadbackReceipt'] = json.loads(pin(args.posed/'report.json'))
        pin(args.posed/'executed-script.cjs')
        baseline = json.loads(pin(args.posed/'female.json'))
        baseline_top = next(m for m in baseline['meshes'] if m['role'] == 'top' and 'Tops_01' in m['materials'][0]['name'])
        baseline_pants = next(m for m in baseline['meshes'] if m['role'] == 'pants')
        for identifier in ['female', *IDS]:
            data = json.loads(pin(args.posed/(identifier+'.json')))
            top = next(m for m in data['meshes'] if m['role'] == 'top' and 'Tops_01' in m['materials'][0]['name'])
            pants = next(m for m in data['meshes'] if m['role'] == 'pants')
            source_id = 'original' if identifier == 'female' else identifier
            expected = next(c for c in report['cases'] if c['id'] == source_id)
            assert data['bodySha256'] == expected['avatarSha256']
            row = {'id': identifier, 'bodySha256': data['bodySha256'], 'actualPose': pose_contact(top, pants, data['camera'], args.posed/(identifier+'.png')),
                   'topMaterial': top['materials'][0], 'pantsMaterial': pants['materials'][0], 'topDrawRange': top['drawRange'], 'topGroups': top['groups'],
                   'topIndexMatchesExactSource': top['canonicalU32IndexSha256'] == sha(source[source_id]['top']['faces'].astype('<u4').tobytes()),
                   'pantsIndexMatchesExactSource': pants['canonicalU32IndexSha256'] == sha(source[source_id]['pants']['faces'].astype('<u4').tobytes()),
                   'topAlphaMatchesSource': top['materials'][0]['map']['alphaSha256'] == report['material']['top']['alpha']['decodedAlphaSha256']}
            common_top, common_pants = virtual_mesh(source[source_id]['top'], baseline_top), virtual_mesh(source[source_id]['pants'], baseline_pants)
            row['rawPositionAttributesMatchSource'] = all(np.array_equal(np.array(live['positions']).astype('<f4'), source[source_id][role]['positions'].astype('<f4')) for role, live in [('top', top), ('pants', pants)])
            if identifier == 'female':
                row['virtualSkinReproductionMaximumWorldErrorM'] = max(float(np.linalg.norm(np.array(virtual['worldPositions'])-np.array(live['worldPositions']), axis=1).max()) for virtual, live in [(common_top, top), (common_pants, pants)])
            row['virtualOriginalPose'] = pose_contact(common_top, common_pants, baseline['camera'])
            row['virtualScope'] = 'Derived source attributes evaluated with original female live skin palette/bind/world transforms. This is explicitly a virtual identical-pose control, not another rendered frame.'
            row['unexplainedTealPixelCenters'] = [p for p in row['actualPose']['tealPixelsInProjectedWaistROI'] if not p.get('pantsInFrontOfTop')]
            report['posed'].append(row)
    implicated_faces = [894, 901, 903, 904]
    vertices = np.unique(original_top['faces'][implicated_faces])
    report['repairLocalization'] = {'topSource': 'prototype/public/assets/m1/m1-uniform-top.glb', 'topPrimitiveMaterial': 'F00_001_01_Tops_01_CLOTH',
        'topTriangles': {str(i): original_top['faces'][i].tolist() for i in implicated_faces}, 'sourceVertices': vertices.tolist(),
        'sourcePositionsM': {str(i): original_top['positions'][i].tolist() for i in vertices},
        'sourceBoundsM': [original_top['positions'][vertices].min(0).tolist(), original_top['positions'][vertices].max(0).tolist()],
        'scope': 'Localization only. No vertex, weight, coverage or asset was edited.'}
    report['limits'] = ['Static intersections exclude coplanar-only overlap. Front samples and color ROI are confined to two upper-waist cases.', 'Frozen skirts/dance and all other bodies are outside this diagnosis.', 'Actual supplied poses have different phases. Virtual common-pose controls do not constitute animation acceptance.']
    report['files'] = list(FILES.values())
    report['inputsStable'] = all(sha((ROOT/f['path']).read_bytes() if not Path(f['path']).is_absolute() else Path(f['path']).read_bytes()) == f['sha256'] for f in report['files'])
    (args.out/'report.json').write_text(json.dumps(report, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    print(json.dumps({'status':'diagnosed-source-and-supplied-pose' if args.posed else 'diagnosed-source-only', 'stable':report['inputsStable'],
                      'bindCases':[{ 'id':r['id'], 'crossingPairs':len(r['upperFrontCrossingPairs']), 'frontCentroids':len(r['bindFrontSamples']['pantsAheadOfCompleteTopCentroids']), 'maximumFrontGapMm':r['bindFrontSamples']['maximumSampledFrontDepthDifferenceM']*1000} for r in report['cases']],
                      'posedCases':[{'id':r['id'], 'tealPixels':len(r['actualPose']['tealPixelsInProjectedWaistROI']), 'pantsInFront':sum(p.get('pantsInFrontOfTop',False) for p in r['actualPose']['tealPixelsInProjectedWaistROI'])} for r in report['posed']]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
