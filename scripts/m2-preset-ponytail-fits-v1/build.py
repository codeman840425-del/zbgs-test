"""Exact four-body fits for unchanged head-reference ponytail geometry."""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-preset-ponytail-fits-v1'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


hair = load('ponytail_source', ROOT/'scripts/m2-long-hair-v1/build.py')
diagnostics = load('ponytail_triangle_checks', ROOT/'scripts/m2-socks-layer-v1/qa.py')
GLB, require = hair.GLB, hair.require


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()


def checked(ref):
    path = (ROOT/ref['path']).resolve()
    require(path.is_relative_to(ROOT), 'Input outside repository: '+ref['path'])
    data = path.read_bytes()
    require(sha(data) == ref['sha256'], 'Input SHA mismatch: '+ref['path'])
    return data


def human(g):
    return {row['bone']: row['node'] for row in g.doc['extensions']['VRM']['humanoid']['humanBones']}


def inverse(g, semantic):
    skin = g.doc['skins'][0]
    return np.array(g.accessor(skin['inverseBindMatrices']))[skin['joints'].index(human(g)[semantic])].reshape(4, 4).T


def primitive(g, token):
    return next(p for m in g.doc['meshes'] for p in m['primitives'] if token in g.doc['materials'][p['material']]['name'])


def images(g):
    result = []
    for image in g.doc['images']:
        require('bufferView' in image, 'Only embedded original images supported')
        view = g.doc['bufferViews'][image['bufferView']]; offset = view.get('byteOffset', 0)
        result.append(sha(g.binary[offset:offset+view['byteLength']]))
    return result


def head_dependencies(source, target):
    require(source.doc['nodes'] == target.doc['nodes'], 'Original raw/rest nodes changed')
    require(source.doc['skins'] == target.doc['skins'], 'Original skin bindings changed')
    require(source.doc['materials'] == target.doc['materials'] and source.doc['textures'] == target.doc['textures'], 'Original material/texture objects changed')
    require(images(source) == images(target), 'Original image payload changed')
    bones = []
    for semantic in ['head', 'neck', 'chest']:
        old, new = inverse(source, semantic), inverse(target, semantic)
        require(np.array_equal(old, new) and human(source)[semantic] == human(target)[semantic], 'Raw semantic/IBM changed: '+semantic)
        node = target.doc['nodes'][human(target)[semantic]]
        bones.append({'semantic': semantic, 'rawName': node['name'], 'node': human(target)[semantic],
                      'inverseBindSha256': sha(new.astype('<f4').tobytes()), 'unchanged': True})
    old, new = primitive(source, '_HAIR'), primitive(target, '_HAIR')
    ids = np.unique(source.accessor(old['indices']))
    require(np.array_equal(source.accessor(old['indices']), target.accessor(new['indices'])), 'Original cap triangle indices changed')
    require(old['attributes'].keys() == new['attributes'].keys(), 'Original cap attribute set changed')
    attrs = {}
    for key in old['attributes']:
        a, b = np.array(source.accessor(old['attributes'][key]))[ids], np.array(target.accessor(new['attributes'][key]))[ids]
        require(np.array_equal(a, b), 'Original cap attribute changed: '+key)
        attrs[key] = sha(b.tobytes())
    return {'bones': bones, 'allRawNodesAndSkinsUnchanged': True, 'materialTextureAndImagePayloadUnchanged': True,
            'capSelectedVertices': len(ids), 'capAttributeSha256': attrs, 'capIndicesSha256': sha(np.array(target.accessor(new['indices'])).tobytes()),
            'imagePayloadSha256': images(target)}


def static_geometry(g, P, F):
    inv = inverse(g, 'head'); rows = []
    for token in ['Body_00_SKIN', 'Face_00_SKIN', 'Tops_01_CLOTH']:
        p = primitive(g, token)
        Q = hair.apply(np.array(g.accessor(p['attributes']['POSITION'])), inv)
        G = np.array(g.accessor(p['indices']), int).reshape(-1, 3)
        pairs = diagnostics.intersections(P, F, Q, G)
        # This sample distance is descriptive. It is not a signed/full-motion proof.
        near = G[np.all(Q[G].max(1) >= P.min(0)-.1, axis=1)&np.all(Q[G].min(1) <= P.max(0)+.1, axis=1)]
        rows.append({'material': g.doc['materials'][p['material']]['name'], 'crossingPairs': pairs,
                     'minimumHairVertexDistanceM': float(diagnostics.nearest_distance(P, Q[near]).min()),
                     'targetHeadLocalBoundsM': [Q[np.unique(G)].min(0).tolist(), Q[np.unique(G)].max(0).tolist()]})
    return rows


def tail_spheres(g, joints):
    asset_nodes = g.doc['nodes']; world = {}
    def visit(index, parent):
        world[index] = parent+np.array(asset_nodes[index].get('translation', [0, 0, 0]))
        for child in asset_nodes[index].get('children', []): visit(child, world[index])
    visit(g.doc['scenes'][0]['nodes'][0], np.zeros(3))
    by_name = {n['name']: world[i] for i, n in enumerate(asset_nodes)}
    points = np.array([by_name[j['child']] for j in joints]); radii = np.array([j['hitRadius'] for j in joints])
    return points, radii


def plan(spec):
    require(spec['schema'] == 'preset-ponytail-fit-source-v1' and spec['version'] == 1, 'Unknown source schema/version')
    source = GLB(checked(spec['sourceBody'])); asset_bytes = checked(spec['asset']); asset = GLB(asset_bytes)
    old_fit = json.loads(checked(spec['sourceFit'])); old_manifest = json.loads(checked(spec['sourceManifest']))
    for ref in spec['helpers']: checked(ref)
    batch = json.loads(checked(spec['batchManifest']))
    require({r['id'] for r in spec['targets']} == {r['id'] for r in batch['variants'] if r['sex'] == 'female'} and len(spec['targets']) == 4, 'Exact four distinct female batch targets required')
    require(old_fit['assetSha256'] == old_manifest['sha256'] == spec['asset']['sha256'], 'Source fit/asset mismatch')
    require(old_fit['dynamics']['simulationReference'] == 'raw-head' and old_fit['styleId'] == spec['styleId'], 'Exact v3 head reference required')
    old_colliders, old_trace = hair.proxies(source, inverse(source, 'head'))
    require(old_colliders == old_fit['dynamics']['colliders'], 'Source proxy algorithm no longer reproduces v3')
    p = asset.doc['meshes'][0]['primitives'][0]; P = np.array(asset.accessor(p['attributes']['POSITION'])); F = np.array(asset.accessor(p['indices']), int).reshape(-1, 3)
    old_geometry = static_geometry(source, P, F)
    points, radii = tail_spheres(asset, old_fit['dynamics']['joints'])
    outputs = {}; result = []
    for row in spec['targets']:
        try:
            batch_row = next(v for v in batch['variants'] if v['id'] == row['id'])
            require(batch_row['sex'] == 'female' and batch_row['status'] == 'source-passed' and batch_row['avatar'] == row['avatar'], 'Target differs from fixed female batch')
            target = GLB(checked(row['avatar'])); dependencies = head_dependencies(source, target)
            colliders, trace = hair.proxies(target, inverse(target, 'head')); geometry = static_geometry(target, P, F)
            changes = []
            for old, new, a, b in zip(old_colliders, colliders, old_trace, trace):
                changes.append({'bone': new['bone'], 'shape': new['shape'], 'source': a, 'target': b,
                    'radiusDeltaM': new['radius']-old['radius'], 'offsetDeltaM': (np.array(new['offset'])-old['offset']).tolist()})
            new_pairs = [{'material': b['material'], 'pairs': [pair for pair in b['crossingPairs'] if pair not in a['crossingPairs']]} for a, b in zip(old_geometry, geometry)]
            require(all(not r['pairs'] for r in new_pairs), 'New rest hair/surface crossings: '+json.dumps(new_pairs))
            proxy_margins = []
            for item, t in zip(colliders, trace):
                a, b = np.array(t['headLocalOffset']), np.array(t['headLocalTail']); edge = b-a
                fraction = np.clip((points-a)@edge/max(edge@edge, 1e-20), 0, 1)
                values = np.linalg.norm(points-(a+fraction[:, None]*edge), axis=1)-item['radius']-radii
                proxy_margins.append({'bone': item['bone'], 'shape': item['shape'], 'tailSphereMarginsM': values.tolist(), 'minimumM': float(values.min())})
            require(all(m['minimumM'] >= 0 for m in proxy_margins), 'Rest spring child sphere inside recalculated proxy')
            fit = copy.deepcopy(old_fit); fit.update(id=spec['styleId']+'-'+row['id']+'-fit-v1', version=1, targetBodySha256=row['avatar']['sha256'])
            fit['dynamics']['colliders'] = colliders
            manifest = copy.deepcopy(old_manifest); manifest['compatibleBodies'] = [row['avatar']['sha256']]
            manifest['fit'] = {'id': fit['id'], 'version': 1, 'url': spec['publicPrefix']+row['id']+'/fit.json', 'sha256': sha(encoded(fit))}
            report = {'id': row['id'], 'target': row['avatar'], 'dependencies': dependencies, 'proxyChanges': changes,
                'baselineGeometry': old_geometry, 'targetGeometry': geometry, 'newCrossingPairs': new_pairs, 'restSpringProxyMargins': proxy_margins,
                'hairHeadLocalBoundsM': [P.min(0).tolist(), P.max(0).tolist()], 'assetBytesUnchanged': True,
                'springJointsAndRawHeadReferenceUnchanged': True, 'runtimeAccepted': False}
            for name, value in [('fit.json', fit), ('manifest.json', manifest), ('report.json', report)]: outputs[row['id']+'/'+name] = encoded(value)
            result.append({'id': row['id'], 'status': 'source-passed', 'targetBodySha256': row['avatar']['sha256'],
                'manifestPath': (BASE/'generated'/row['id']/'manifest.json').relative_to(ROOT).as_posix(),
                'manifestSha256': sha(encoded(manifest)), 'fitSha256': sha(encoded(fit))})
        except Exception as error:
            failure = {'id': row['id'], 'status': 'failed', 'reason': str(error), 'runtimeAccepted': False}
            outputs[row['id']+'/FAILED.json'] = encoded(failure); result.append(failure)
    outputs['report.json'] = encoded({'schema': 'preset-ponytail-fits-v1', 'sourceSpec': spec,
        'generatorSha256': sha(Path(__file__).read_bytes()), 'variants': result, 'repeatBytesIdentical': True,
        'limits': ['Rest geometry/noncoplanar triangle crossings and sampled surface distances only; no signed interior, continuous collision or posed guarantee.',
            'Recomputed proxies enclose algorithm-selected rest vertices, not arbitrary posed clothing. Existing v3 chair-top tail bending/naturalness limits remain.',
            'No game/GPU/visual acceptance. Original v3 fit and batch VRMs remain immutable.'], 'runtimeAccepted': False})
    return outputs


def write_plan(out, output):
    for name, data in output.items(): require(not (out/name).exists() or (out/name).read_bytes() == data, 'Existing output differs: '+name)
    for name, data in output.items():
        path = out/name; path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists(): path.write_bytes(data)


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--out'); args = parser.parse_args()
    out = (ROOT/args.out).resolve() if args.out else BASE/'generated'
    require(out.is_relative_to(BASE) and out != BASE, 'Output must be a child of this source package')
    spec = json.loads((BASE/'spec.json').read_bytes()); output = plan(spec)
    require(output == plan(spec), 'Repeated fit generation changed bytes')
    write_plan(out, output)
    print(output['report.json'].decode())


if __name__ == '__main__': main()
