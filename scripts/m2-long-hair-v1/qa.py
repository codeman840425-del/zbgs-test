"""CPU finite/skin/clearance checks of source hair and one length edit."""
import importlib.util
import copy
import io
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build
from flow import GLB, require

helper_path = build.ROOT/'scripts/m2-socks-layer-v1/qa.py'
helper_spec = importlib.util.spec_from_file_location('retained_triangle_diagnostics', helper_path)
diagnostics = importlib.util.module_from_spec(helper_spec); helper_spec.loader.exec_module(diagnostics)


def main():
    spec = json.loads((build.BASE/'spec.json').read_text(encoding='utf-8')); out = build.BASE/'generated'
    plan = build.make_plan(spec)
    require(all((out/name).read_bytes() == data for name, data in plan.items()), 'Exact repeated export changed')
    source, primitive, cap, cap_faces, inverse, root = build.source(spec)
    image = source.doc['images'][source.doc['textures'][source.doc['materials'][primitive['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
    view = source.doc['bufferViews'][image['bufferView']]
    encoded = source.binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
    pixels = np.array(Image.open(io.BytesIO(encoded)).convert('RGBA')); u0, v0, u1, v1 = spec['texturePatchUV']
    patch = pixels[int(v0*1024):int(v1*1024)+1, int(u0*1024):int(u1*1024)+1]
    require(patch[..., 3].min() == 255, 'New tail texture patch must be actually opaque')
    targets = []
    for mi, pi in [(0, 0), (1, 7), (0, 1)]:
        p = source.doc['meshes'][mi]['primitives'][pi]
        P = build.apply(np.array(source.accessor(p['attributes']['POSITION'])), inverse)
        F = np.array(source.accessor(p['indices']), int).reshape(-1, 3)
        targets.append((source.doc['materials'][p['material']]['name'], P, F))
    rows = []
    for folder in ['', 'parameter-variant/']:
        g = GLB((out/(folder+'female-ponytail.glb')).read_bytes()); p = g.doc['meshes'][0]['primitives'][0]
        P = np.array(g.accessor(p['attributes']['POSITION'])); F = np.array(g.accessor(p['indices']), int).reshape(-1, 3)
        J = np.array(g.accessor(p['attributes']['JOINTS_0']), int); W = np.array(g.accessor(p['attributes']['WEIGHTS_0']))
        require(np.isfinite(P).all() and np.isfinite(W).all() and W.min() >= 0 and abs(W.sum(1)-1).max() < 1e-7 and J.min() >= 0 and J.max() < 8, 'Finite geometry/normalized weight bounds failed')
        require(np.count_nonzero((W > .001).sum(1) > 1) > 100 and len(set(J[W > .001])) == 8, 'Tail lacks actual multi-joint weighted vertices')
        count = len(cap['POSITION']); require(np.max(abs(P[:count]-cap['POSITION'])) < 1e-7, 'Source crown/front was stretched')
        require(np.array_equal(np.array(g.accessor(p['attributes']['TEXCOORD_0']))[:count], cap['TEXCOORD_0']), 'Original cap UV changed')
        require(np.array_equal(F[:len(cap_faces)], cap_faces), 'Original cap topology changed')
        material = copy.deepcopy(g.doc['materials'][0]); original_material = source.doc['materials'][primitive['material']]
        for key, owner in [('baseColorTexture', 'pbrMetallicRoughness'), ('normalTexture', None), ('emissiveTexture', None)]:
            original_owner = original_material[owner] if owner else original_material
            actual_owner = material[owner] if owner else material
            original_index = original_owner[key]['index']; actual_index = actual_owner[key]['index']
            def texture_bytes(asset, index):
                im = asset.doc['images'][asset.doc['textures'][index]['source']]; view = asset.doc['bufferViews'][im['bufferView']]
                return asset.binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
            require(texture_bytes(source, original_index) == texture_bytes(g, actual_index), 'Embedded source hair texture changed')
            actual_owner[key]['index'] = original_index
        require(material == original_material, 'Source hair material parameters changed')
        nodes = g.doc['nodes']; worlds = {}
        def walk(index, parent):
            worlds[index] = parent+nodes[index].get('translation', [0, 0, 0])
            for child in nodes[index].get('children', []): walk(child, worlds[index])
        walk(0, np.zeros(3))
        skin = g.doc['skins'][0]; ibms = np.array(g.accessor(skin['inverseBindMatrices'])).reshape(-1, 4, 4).transpose(0, 2, 1)
        neutral = np.array([worlds[j] for j in skin['joints']])+ibms[:, :3, 3]
        require(abs(neutral).max() < 1e-7, 'Auxiliary rest skin matrices are inconsistent')
        added_faces = F[len(cap_faces):]-count
        edges = {}
        for face in added_faces:
            for a, b in zip(face, np.roll(face, -1)):
                key = tuple(sorted([int(a), int(b)])); edges[key] = edges.get(key, 0)+1
        require(all(n == 2 for n in edges.values()), 'New tail/tie surface must be closed')
        clearance = []
        for name, Q, G in targets:
            distance = diagnostics.nearest_distance(P[count:], Q[G]); pairs = diagnostics.intersections(P[count:], added_faces, Q, G)
            clearance.append({'sourceMaterial': name, 'newHairMinimumVertexDistanceM': float(distance.min()),
                              'newHairCrossingTrianglePairs': len(pairs), 'firstPairs': pairs[:8]})
        cap_clearance = [{'sourceMaterial': name, 'retainedCapMinimumVertexDistanceM': float(diagnostics.nearest_distance(P[:count], Q[G]).min())} for name, Q, G in targets]
        fit = json.loads((out/(folder+'fit.json')).read_text(encoding='utf-8'))
        points = np.array([worlds[i] for i in range(3, 10)])
        proxy_margins = []
        for i, item in enumerate(fit['dynamics']['colliders']):
            proxy = json.loads((out/'build-report.json').read_text(encoding='utf-8'))['variant' if folder else 'base']['proxySelections'][i]
            a, b = np.array(proxy['headLocalOffset']), np.array(proxy['headLocalTail']); edge = b-a
            t = np.clip((points[1:]-a) @ edge/max(np.dot(edge, edge), 1e-20), 0, 1)
            margin = np.linalg.norm(points[1:]-(a+t[:, None]*edge), axis=1)-item['radius']-np.array([j['hitRadius'] for j in fit['dynamics']['joints']])
            proxy_margins.append({'collider': i, 'minimumRestTailSphereMarginM': float(margin.min())})
        rows.append({'variant': bool(folder), 'vertices': len(P), 'triangles': len(F), 'weightedJoints': 8,
            'mixedWeightVertices': int(np.count_nonzero((W > .001).sum(1) > 1)), 'neutralMatrixError': float(abs(neutral).max()),
            'newHairClearance': clearance, 'retainedCapClearance': cap_clearance, 'restSpringTailProxyMargins': proxy_margins,
            'minimumHeadLocalY': float(P[:, 1].min()), 'leafCenterY': float(points[-1, 1]), 'runtimeAccepted': False})
    if any(c['newHairCrossingTrianglePairs'] for row in rows for c in row['newHairClearance']):
        failure_path = build.BASE/'initial-clearance-failure.json'
        if not failure_path.exists(): failure_path.write_bytes(build.encoded({'sourceParameters': spec, 'measurements': rows, 'runtimeAccepted': False}))
    require(all(c['newHairCrossingTrianglePairs'] == 0 for row in rows for c in row['newHairClearance']), 'New hair crosses source Body/Face/collar; review fixed source before integration')
    require(all(m['minimumRestTailSphereMarginM'] >= 0 for row in rows for m in row['restSpringTailProxyMargins']), 'Rest child sphere inside fitted proxy')
    require(abs(rows[1]['leafCenterY']-rows[0]['leafCenterY']+.04) < 1e-9 and
            abs(rows[1]['minimumHeadLocalY']-rows[0]['minimumHeadLocalY']+.04) < 2e-5 and
            plan['female-ponytail.glb'] != plan['parameter-variant/female-ponytail.glb'], 'Length source edit lacks actual export change')
    report = {'passed': True, 'exactRepeatExport': True, 'sourceCapPositionsUVAndTopologyPreserved': True, 'newTubeAndTieClosed': True,
        'sourceMaterialAndTexturesPreserved': True,
        'sourceTextureSha256': build.sha(encoded), 'sourcePatchAlphaMinimum': int(patch[..., 3].min()), 'measurements': rows,
        'geometryDiagnosticDependency': {'path': helper_path.relative_to(build.ROOT).as_posix(), 'sha256': build.sha(helper_path.read_bytes())},
        'GPUUsed': False, 'runtimeAccepted': False, 'limits': ['Rest vertex/surface distances and noncoplanar edge/triangle crossings only; no full signed interior or continuous collision proof.',
        'Colliders enclose selected rest-pose vertices only. Skin/garment posing can leave the measured proxy region.', 'No game motion, wind, body collision, expression or visual acceptance.']}
    (out/'qa-report.json').write_bytes(build.encoded(report))
    files = [p for directory in [build.BASE, Path(__file__).resolve().parent] for p in directory.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name != 'package-files.json']
    (out/'package-files.json').write_bytes(build.encoded({'files': [{'path': p.relative_to(build.ROOT).as_posix(), 'sha256': build.sha(p.read_bytes()), 'bytes': p.stat().st_size} for p in sorted(files)]}))
    print(json.dumps(report, indent=2))


if __name__ == '__main__': main()
