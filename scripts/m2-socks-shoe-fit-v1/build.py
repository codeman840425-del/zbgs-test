"""One constrained source shoe-fit candidate. CPU only, exact pinned inputs."""
import copy
import hashlib
import json
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
import numpy as np
from scipy.optimize import minimize
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT/'assets-source/m2-socks-shoe-fit-v1'
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB, require


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(file, data):
    file.write_text(json.dumps(data, indent=2)+'\n', encoding='utf-8', newline='\n')


def read_pinned(name, expected):
    data = (ROOT/name).read_bytes()
    require(sha(data) == expected, 'Pinned input differs: '+name)
    return GLB(data)


def surface(g, body_only=False):
    positions, faces = [], []
    for mesh in g.doc['meshes']:
        for p in mesh['primitives']:
            if body_only and '_Body_00_SKIN' not in g.doc['materials'][p['material']]['name']:
                continue
            points = np.array(g.accessor(p['attributes']['POSITION']))
            faces.extend(np.array(g.accessor(p['indices']), dtype=int).reshape(-1, 3)+len(positions))
            positions.extend(points)
    return np.array(positions), np.array(faces, dtype=int)


def bind_position(doc, bone_name):
    parents = {c: i for i, n in enumerate(doc['nodes']) for c in n.get('children', [])}
    i = next(i for i, n in enumerate(doc['nodes']) if n.get('name') == bone_name)
    result = np.zeros(3)
    while True:
        node = doc['nodes'][i]
        require(not any(k in node for k in ['rotation', 'scale', 'matrix']), 'Expected pinned translation-only bind')
        result += node.get('translation', [0, 0, 0])
        if i not in parents:
            return result
        i = parents[i]


def rays(points, faces, side, z, y):
    """Outermost source surface along the raw lateral axis, with barycentrics."""
    depth = np.full((len(y), len(z)), -np.inf)
    ids = np.full(depth.shape, -1, dtype=int)
    bary = np.zeros((*depth.shape, 3))
    for index, face in enumerate(faces):
        p = points[face]
        if (side*p[:, 0]).min() <= 0:
            continue
        zl, zh = np.searchsorted(z, [p[:, 2].min(), p[:, 2].max()])
        yl, yh = np.searchsorted(y, [p[:, 1].min(), p[:, 1].max()])
        if zl >= zh or yl >= yh:
            continue
        zz, yy = np.meshgrid(z[zl:zh], y[yl:yh])
        a, b, c = p[:, [2, 1]]
        denominator = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(denominator) < 1e-14:
            continue
        u = ((b[1]-c[1])*(zz-c[0])+(c[0]-b[0])*(yy-c[1]))/denominator
        v = ((c[1]-a[1])*(zz-c[0])+(a[0]-c[0])*(yy-c[1]))/denominator
        w = 1-u-v
        x = side*(u*p[0, 0]+v*p[1, 0]+w*p[2, 0])
        target = depth[yl:yh, zl:zh]
        mask = (u >= 0) & (v >= 0) & (w >= 0) & (x > target)
        target[mask] = x[mask]
        ids[yl:yh, zl:zh][mask] = index
        bary[yl:yh, zl:zh][mask] = np.stack([u, v, w], axis=-1)[mask]
    return depth, ids, bary


def contact_samples(shoe, sock, body, side, ankle_y, spec, spacing):
    P, F = shoe
    z = np.arange(spec['heelMinimumZM'], P[:, 2].max()+spacing/4, spacing)
    y = np.arange(P[:, 1].min()+spec['contactProtectedAboveMinimumYM'], ankle_y-spec['heelBelowAnkleM'], spacing)
    shoe_d, shoe_ids, shoe_bary = rays(P, F, side, z, y)
    sock_d, sock_ids, sock_bary = rays(*sock, side, z, y)
    body_d, _, _ = rays(*body, side, z, y)
    finite = np.isfinite(shoe_d) & np.isfinite(sock_d) & np.isfinite(body_d)
    body_gap = np.zeros(shoe_d.shape)
    body_gap[finite] = shoe_d[finite]-body_d[finite]
    mask = finite & (body_gap >= 0) & (body_gap <= spec['maximumBodyToShoeXGapM'])
    indices = np.argwhere(mask)
    require(len(indices) > 0, 'No measured heel contact samples')
    sample_points = np.column_stack([side*sock_d[mask], y[indices[:, 0]], z[indices[:, 1]]])
    return {'shoeFaces': shoe_ids[mask], 'shoeBarycentric': shoe_bary[mask],
            'sockFaces': sock_ids[mask], 'sockBarycentric': sock_bary[mask], 'sockPoints': sample_points}


def coincident_groups(points, tolerance):
    parents = np.arange(len(points))
    def find(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return int(i)
    for a, b in sorted(cKDTree(points).query_pairs(tolerance)):
        parents[find(b)] = find(a)
    roots = [find(i) for i in range(len(points))]
    unique = {r: i for i, r in enumerate(sorted(set(roots)))}
    return np.array([unique[r] for r in roots]), np.array([points[r] for r in sorted(unique)])


def signed_gaps(points, faces, samples, side):
    triangles = points[faces[samples['shoeFaces']]]
    normals = np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0])
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    normals *= np.where(normals[:, 0]*side < 0, -1, 1)[:, None]
    shoe_points = np.sum(triangles*samples['shoeBarycentric'][..., None], axis=1)
    return np.sum((shoe_points-samples['sockPoints'])*normals, axis=1)


def fit_side(points, faces, groups, representatives, sock, body, side, ankle, spec):
    samples = contact_samples((points, faces), sock, body, side, ankle[1], spec, spec['sampleSpacingM'])
    seeds = set(groups[faces[np.unique(samples['shoeFaces'])]].flat)
    edges = {tuple(sorted((int(a), int(b)))) for f in groups[faces] for a, b in zip(f, np.roll(f, -1)) if a != b}
    support = seeds | {other for a, b in edges for target, other in [(a, b), (b, a)] if target in seeds}
    variables = sorted(i for i in support if
        representatives[i, 1] > points[:, 1].min()+spec['contactProtectedAboveMinimumYM'] and
        representatives[i, 1] < points[:, 1].max()-spec['collarProtectedBelowMaximumYM'] and
        representatives[i, 2] > spec['supportFrontZM'] and
        side*representatives[i, 0] > abs(ankle[0])+spec['supportOuterFromFootPivotM'])
    require(variables, 'No eligible local heel-upper vertices')
    variable_map = {group: i for i, group in enumerate(variables)}
    matrix = np.zeros((len(representatives), len(variables)))
    for group, i in variable_map.items():
        matrix[group, i] = 1
    vertex_matrix = matrix[groups]
    edge_matrix = np.array([matrix[a]-matrix[b] for a, b in sorted(edges) if a in support or b in support])
    quadratic = np.eye(len(variables))+spec['smoothnessWeight']*(edge_matrix.T@edge_matrix)
    def candidate(values):
        result = points.copy()
        result[:, 0] += side*(vertex_matrix@values)/1000
        return result
    def constraints(values):
        return (signed_gaps(candidate(values), faces, samples, side)-spec['restNormalClearanceM'])*1000
    fit = minimize(lambda values: .5*float(values@quadratic@values), np.zeros(len(variables)),
                   jac=lambda values: quadratic@values, method='SLSQP',
                   bounds=[(0, spec['maximumVertexDisplacementM']*1000)]*len(variables),
                   constraints=[{'type': 'ineq', 'fun': constraints}],
                   options={'maxiter': spec['solverIterations'], 'ftol': spec['solverTolerance']})
    result = candidate(fit.x)
    report = {'side': 'left' if side < 0 else 'right', 'sampleCount': len(samples['shoeFaces']),
              'eligibleGroups': [int(i) for i in variables], 'solverSuccess': bool(fit.success), 'solverMessage': str(fit.message),
              'iterations': int(fit.nit), 'beforeMinimumSignedNormalGapM': float(signed_gaps(points, faces, samples, side).min()),
              'afterMinimumSignedNormalGapM': float(signed_gaps(result, faces, samples, side).min()),
              'maximumDisplacementM': float(np.linalg.norm(result-points, axis=1).max())}
    return result, report


def write_attribute(g, binary, index, values):
    accessor = g.doc['accessors'][index]
    view = g.doc['bufferViews'][accessor['bufferView']]
    require(accessor['componentType'] == 5126 and accessor['type'] == 'VEC3', 'Expected float VEC3')
    start = view.get('byteOffset', 0)+accessor.get('byteOffset', 0)
    stride = view.get('byteStride', 12)
    for i, value in enumerate(values):
        binary[start+i*stride:start+i*stride+12] = np.array(value, dtype='<f4').tobytes()
    if 'min' in accessor or 'max' in accessor:
        packed = values.astype(np.float32)
        accessor['min'] = packed.min(0).tolist()
        accessor['max'] = packed.max(0).tolist()


def transported_normals(original, changed, faces, normals, groups):
    old = np.zeros((groups.max()+1, 3))
    new = np.zeros_like(old)
    for points, accumulated in [(original, old), (changed, new)]:
        triangles = points[faces]
        vectors = np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0])
        for k in range(3):
            np.add.at(accumulated, groups[faces[:, k]], vectors)
    old /= np.linalg.norm(old, axis=1)[:, None]
    new /= np.linalg.norm(new, axis=1)[:, None]
    result = normals.copy()
    for i, group in enumerate(groups):
        axis = np.cross(old[group], new[group])
        sine = np.linalg.norm(axis)
        if sine < 1e-12:
            continue
        axis /= sine
        cosine = np.clip(old[group]@new[group], -1, 1)
        n = normals[i]
        result[i] = n*cosine+np.cross(axis, n)*sine+axis*(axis@n)*(1-cosine)
        result[i] /= np.linalg.norm(result[i])
    return result


def encode(g, binary):
    text = json.dumps(g.doc, sort_keys=True, separators=(',', ':')).encode()
    text += b' '*(-len(text) % 4)
    binary += b'\0'*(-len(binary) % 4)
    return struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(binary))+struct.pack('<I4s', len(text), b'JSON')+text+struct.pack('<I4s', len(binary), b'BIN\0')+binary


def build_body(body_type, config, spec, output):
    shoe = read_pinned(config['shoePath'], config['shoeSha256'])
    sock = read_pinned(config['sockPath'], config['sockSha256'])
    body = read_pinned(config['bodyPath'], config['bodySha256'])
    require(len(shoe.doc['meshes']) == 1 and len(shoe.doc['meshes'][0]['primitives']) == 1, 'Expected exact single shoe primitive')
    primitive = shoe.doc['meshes'][0]['primitives'][0]
    positions, faces = surface(shoe)
    original = positions.copy()
    groups, representatives = coincident_groups(positions, spec['coincidentVertexToleranceM'])
    reports = []
    for side, raw in [(-1, 'J_Bip_L_Foot'), (1, 'J_Bip_R_Foot')]:
        positions, report = fit_side(positions, faces, groups, representatives, surface(sock), surface(body, True), side, bind_position(body.doc, raw), spec)
        reports.append(report)
    changed = np.flatnonzero(np.linalg.norm(positions-original, axis=1) > 1e-9)
    delta = positions-original
    require(np.linalg.norm(delta, axis=1).max() <= spec['maximumVertexDisplacementM']+1e-9, 'Candidate exceeded displacement bound')
    require(np.all(delta[original[:, 1] <= original[:, 1].min()+spec['contactProtectedAboveMinimumYM']] == 0), 'Shoe contact protection changed')
    binary = bytearray(shoe.binary)
    write_attribute(shoe, binary, primitive['attributes']['POSITION'], positions)
    normals = np.array(shoe.accessor(primitive['attributes']['NORMAL']))
    write_attribute(shoe, binary, primitive['attributes']['NORMAL'], transported_normals(original, positions, faces, normals, groups))
    identifier = body_type+'-plain-crew-socks-shoe-fit-v1'
    shoe.doc['asset']['generator'] = 'm2-socks-shoe-fit-v1 bounded source derivative'
    data = encode(shoe, binary)
    (output/(identifier+'.glb')).write_bytes(data)
    manifest = json.loads((ROOT/config['shoeManifest']).read_text(encoding='utf-8'))
    entry = copy.deepcopy(next(e for e in manifest['items'] if e['id'] == config['shoeId']))
    entry.update(id=identifier, name='Original flat shoe, crew-sock heel fit', styleId=spec['styleId'], fitId=identifier+'-fit',
                 version=1, url=identifier+'.glb', bytes=len(data), sha256=sha(data))
    entry['socksFit'] = {'requiredSockSha256': config['sockSha256'], 'sourceShoeId': config['shoeId'], 'sourceShoeSha256': config['shoeSha256']}
    write_json(output/(body_type+'-entry.json'), entry)
    passed = all(r['solverSuccess'] and r['afterMinimumSignedNormalGapM'] >= spec['restNormalClearanceM']-1e-8 for r in reports)
    result = {'bodyType': body_type, 'assetId': identifier, 'assetSha256': sha(data), 'assetBytes': len(data),
              'candidateStatus': 'created-pending-dense-and-posed-qa' if passed else 'failed-source-constraints',
              'inputs': config, 'sideFits': reports, 'movedVertices': len(changed),
              'maximumDisplacementM': float(np.linalg.norm(delta, axis=1).max()),
              'changedVertexRecords': [{'id': int(i), 'before': original[i].tolist(), 'after': positions[i].tolist()} for i in changed],
              'limits': ['One constrained solve per side; no parameter sweep or runtime compensation.', 'Source shoe derivative only. Source Body, sock, original shoe and historical outfits remain unchanged.', 'This authored candidate requires root integration and actual browser viewing.']}
    write_json(output/(body_type+'-fit.json'), result)
    return result


def main():
    spec = json.loads((PACKAGE/'spec.json').read_text(encoding='utf-8'))
    output = PACKAGE/'generated'
    output.mkdir(exist_ok=True)
    results = [build_body(body, config, spec, output) for body, config in spec['bodies'].items()]
    summaries = [{'bodyType': r['bodyType'], 'assetId': r['assetId'], 'assetSha256': r['assetSha256'],
                  'candidateStatus': r['candidateStatus'], 'fitReport': r['bodyType']+'-fit.json',
                  'fitReportSha256': sha((output/(r['bodyType']+'-fit.json')).read_bytes())} for r in results]
    report = {'schema': 'm2-socks-shoe-fit-build-v1', 'specSha256': sha((PACKAGE/'spec.json').read_bytes()),
              'generatorSha256': sha(Path(__file__).read_bytes()), 'bodies': summaries,
              'status': 'candidate-created' if all(r['candidateStatus'].startswith('created') for r in results) else 'failed'}
    write_json(output/'build-report.json', report)
    print(json.dumps({'status': report['status'], 'bodies': [{'body': r['bodyType'], 'sha256': r['assetSha256'], 'movedVertices': r['movedVertices'], 'maximumDisplacementM': r['maximumDisplacementM'], 'sideFits': r['sideFits']} for r in results]}))


if __name__ == '__main__':
    main()
