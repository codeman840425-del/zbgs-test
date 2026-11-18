"""Geometry-only edge audit and orthographic CPU material-ID readback."""
import io
from collections import Counter

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree


def open_ankle_edges(points, triangles, tolerance, sign, cuff):
    # Leave the entire source ankle intact. Ignore only the new upper boundary
    # produced by selecting the lower triangles (well above the ankle seam).
    faces = triangles[(points[triangles, 1].max(1) < cuff + .015) & (points[triangles, 0].mean(1) * sign > 0)]
    used, indices = np.unique(faces, return_inverse=True)
    p = points[used]
    roots = list(range(len(p)))

    def root(i):
        while roots[i] != i:
            i = roots[i]
        return i

    for i, j in sorted(cKDTree(p).query_pairs(tolerance)):
        roots[root(j)] = root(i)
    edges = Counter()
    for tri in np.array([root(i) for i in indices.ravel()]).reshape(-1, 3):
        for i in range(3):
            edges[tuple(sorted((tri[i], tri[(i+1) % 3])))] += 1
    opened = np.array([edge for edge, n in edges.items() if n == 1 and p[list(edge), 1].max() < cuff - .05])
    vertices = np.unique(opened)
    pairs = sorted(cKDTree(p[vertices]).query_pairs(.000001))
    return {'unpairedEdges': len(opened), 'boundaryVertices': len(vertices),
            'heightRangeM': [float(p[vertices, 1].min()), float(p[vertices, 1].max())],
            'nearCoincidentUnmergedPairs': [
                {'originalVertices': used[vertices[[a, b]]].tolist(), 'separationM': float(np.linalg.norm(p[vertices[a]]-p[vertices[b]]))}
                for a, b in pairs]}


def image_alpha(g, material):
    tex = material['pbrMetallicRoughness']['baseColorTexture']
    transform = tex.get('extensions', {}).get('KHR_texture_transform', {})
    assert transform.get('offset', [0, 0]) == [0, 0] and transform.get('scale', [1, 1]) == [1, 1] and not transform.get('rotation')
    texture = g.doc['textures'][tex['index']]
    view = g.doc['bufferViews'][g.doc['images'][texture['source']]['bufferView']]
    start = view.get('byteOffset', 0)
    return np.asarray(Image.open(io.BytesIO(g.binary[start:start+view['byteLength']])).convert('RGBA'))[:, :, 3]


def draw(depth, labels, sign, points, uv, triangles, alpha, material, label, scale):
    h, w = depth.shape
    px = np.column_stack([w / 2 + sign * points[:, 0] * scale, h - points[:, 1] * scale])
    for face in triangles:
        a, b, c = px[face]
        low = np.maximum(np.floor(px[face].min(0)).astype(int), [0, 0])
        high = np.minimum(np.ceil(px[face].max(0)).astype(int), [w - 1, h - 1])
        if (low > high).any():
            continue
        ab, ac = b - a, c - a
        denominator = ab[0] * ac[1] - ab[1] * ac[0]
        if abs(denominator) < 1e-10 or (not material.get('doubleSided', False) and denominator >= 0):
            continue
        yy, xx = np.mgrid[low[1]:high[1]+1, low[0]:high[0]+1]
        dx, dy = xx + .5 - a[0], yy + .5 - a[1]
        u = (dx * ac[1] - dy * ac[0]) / denominator
        v = (ab[0] * dy - ab[1] * dx) / denominator
        inside = (u >= 0) & (v >= 0) & (u + v <= 1)
        x, y, u, v = xx[inside], yy[inside], u[inside], v[inside]
        weights = np.column_stack([1-u-v, u, v])
        z = sign * (weights @ points[face, 2])
        texels = (weights @ uv[face]) * [alpha.shape[1], alpha.shape[0]] - .5
        base = np.floor(texels).astype(int)
        fx, fy = (texels - base).T
        ix, iy = base.T
        sampled = sum(alpha[(iy+j) % alpha.shape[0], (ix+i) % alpha.shape[1]] * wx * wy
                      for i, wx in [(0, 1-fx), (1, fx)] for j, wy in [(0, 1-fy), (1, fy)])
        visible = (z > depth[y, x]) & (sampled >= 255 * material.get('alphaCutoff', .5))
        depth[y[visible], x[visible]] = z[visible]
        labels[y[visible], x[visible]] = label


def diagnose(g, attrs, faces, mi, spec, cuff, pairing, out):
    p = attrs['POSITION']
    edges = {side: open_ankle_edges(p, faces, spec['seamWeldToleranceM'], sign, cuff)
             for side, sign in [('left', 1), ('right', -1)]}
    layers = []
    for primitive in g.doc['meshes'][mi]['primitives']:
        mat = g.doc['materials'][primitive['material']]
        layer = next((i for i, token in enumerate(['_Body_00_SKIN', '_Bottoms_', '_Shoes_'], 1) if token in mat['name']), None)
        if layer:
            tris = np.array(g.accessor(primitive['indices']), dtype=int).reshape(-1, 3)
            layers.append((layer, mat, tris[p[tris, 1].min(1) < .30], image_alpha(g, mat)))
    assert [r[0] for r in layers] == [1, 2, 3]
    scale, height, width = 1000, 300, 340
    shoe_top = pairing['shoes']['boundsM'][1][1]
    band = ((height - np.arange(height) - .5) / scale > shoe_top) & ((height - np.arange(height) - .5) / scale < cuff)
    palette = np.array([[248, 246, 241], [227, 171, 133], [78, 100, 134], [53, 55, 65]], dtype=np.uint8)
    panels, views = [], {}
    for view, sign in [('front', 1), ('back', -1)]:
        depth = np.full((height, width), -np.inf)
        labels = np.zeros((height, width), dtype=int)
        for index, material, tris, alpha in layers:
            draw(depth, labels, sign, p, attrs['TEXCOORD_0'], tris, alpha, material, index, scale)
            if index == 1:
                bare = labels.copy()
        panels.extend([palette[bare], palette[labels]])
        mask = (bare == 1) & band[:, None]
        views[view] = {'bareBodyBandPixels': int(mask.sum()), 'remainingVisible': int(np.sum(mask & (labels == 1))),
                       'coveredByBottom': int(np.sum(mask & (labels == 2))), 'coveredByShoes': int(np.sum(mask & (labels == 3)))}
    Image.fromarray(np.concatenate(panels, axis=1)).save(out / 'lower-material-id.png')
    return {'edgeWeldToleranceM': spec['seamWeldToleranceM'], 'ankleOpenEdgesAfterPositionWeld': edges,
            'projectedCrewBand': {'fromYM': shoe_top, 'toYM': cuff, 'pixelsPerMetre': scale, 'views': views,
                                 'method': 'Orthographic CPU rest-pose material-ID raster, bilinear native base-color alpha and material cutoff. Counts use the exact bare Body silhouette within the band.',
                                 'imagePanels': ['front Body', 'front dressed', 'back Body', 'back dressed']}}
