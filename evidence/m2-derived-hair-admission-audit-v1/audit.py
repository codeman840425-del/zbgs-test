"""Read actual female VRMs and compare source dependencies for one ponytail."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys

import numpy as np

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
parser_path = ROOT/'scripts/m2-male-face-v1/glb.py'
loader = importlib.util.spec_from_file_location('existing_glb_reader', parser_path)
module = importlib.util.module_from_spec(loader)
loader.loader.exec_module(module)
GLB = module.GLB
NAMES = ['female', 'm1a-jaw-v1', 'm1a-waisthip-v1']
files = []


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(name, expected=None):
    raw = (ROOT/name).read_bytes()
    digest = sha(raw)
    if expected:
        assert digest == expected, name
    files.append({'path': name, 'bytes': len(raw), 'sha256': digest})
    return raw


def json_file(name, expected=None):
    return json.loads(read(name, expected))


def canonical(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())


def matrices(doc):
    parents = {child: i for i, node in enumerate(doc['nodes']) for child in node.get('children', [])}
    local, world = [], {}
    for node in doc['nodes']:
        if 'matrix' in node:
            matrix = np.array(node['matrix']).reshape(4, 4).T
        else:
            x, y, z, w = node.get('rotation', [0, 0, 0, 1])
            rotation = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                                 [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                                 [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
            matrix = np.eye(4)
            matrix[:3, :3] = rotation@np.diag(node.get('scale', [1, 1, 1]))
            matrix[:3, 3] = node.get('translation', [0, 0, 0])
        local.append(matrix)

    def resolve(index):
        if index not in world:
            world[index] = resolve(parents[index])@local[index] if index in parents else local[index]
        return world[index]

    for i in range(len(local)):
        resolve(i)
    return local, world


def transform(points, matrix):
    return (np.column_stack([points, np.ones(len(points))])@matrix.T)[:, :3]


def bounds(points):
    return [points.min(0).tolist(), points.max(0).tolist()] if len(points) else None


def array_check(a, b):
    return {'equal': a.dtype == b.dtype and a.shape == b.shape and a.tobytes() == b.tobytes(),
            'originalSha256': sha(a.tobytes()), 'candidateSha256': sha(b.tobytes()),
            'maxAbsoluteDifference': float(np.max(np.abs(a.astype(float)-b.astype(float)))) if a.size else 0}


def inventory(g):
    local, world = matrices(g.doc)
    mesh_nodes = {node['mesh']: i for i, node in enumerate(g.doc['nodes']) if 'mesh' in node}
    semantic = {h['bone']: h['node'] for h in g.doc['extensions']['VRM']['humanoid']['humanBones']}
    binds = {}
    for skin in g.doc['skins']:
        for index, row in zip(skin['joints'], g.acc(skin['inverseBindMatrices'])):
            name = g.doc['nodes'][index]['name']
            if name in binds:
                assert np.array_equal(binds[name], row)
            binds[name] = row
    primitives = {}
    for mi, mesh in enumerate(g.doc['meshes']):
        node_index = mesh_nodes[mi]
        skin = g.doc['skins'][g.doc['nodes'][node_index]['skin']]
        joint_names = [g.doc['nodes'][i]['name'] for i in skin['joints']]
        for pi, primitive in enumerate(mesh['primitives']):
            material = g.doc['materials'][primitive['material']]
            indices = g.acc(primitive['indices']).reshape(-1)
            used = np.unique(indices)
            attributes = {key: g.acc(value)[used] for key, value in primitive['attributes'].items()}
            primitives[material['name']] = {'mesh': mi, 'primitive': pi, 'indices': indices, 'used': used,
                'attributes': attributes, 'material': material, 'jointNames': joint_names,
                'world': transform(attributes['POSITION'], world[node_index])}
    return {'local': local, 'world': world, 'semantic': semantic, 'binds': binds, 'primitives': primitives, 'meshNodes': mesh_nodes}


js = "import {foundationProfile} from './prototype/src/foundation-profiles.js'; import {HAIRSTYLES} from './prototype/src/hairstyle-catalog.js'; console.log(JSON.stringify({profiles:Object.fromEntries(['female','m1a-jaw-v1','m1a-waisthip-v1'].map(n=>[n,foundationProfile(n)])),hairEntries:HAIRSTYLES.filter(e=>e.id==='female-ponytail-v1')}));"
config = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], cwd=ROOT))
for name in ['prototype/src/foundation-profiles.js', 'prototype/src/hairstyle-catalog.js',
             'prototype/src/main.js', 'scripts/m1-variants/build-variants.py', 'scripts/m2-male-face-v1/glb.py']:
    read(name)
spec = json_file('assets-source/m1-variants/spec.json')
read(spec['sourceBlend'], spec['sourceBlendSha256'])
hair = next(entry for entry in config['hairEntries'] if entry['sourceBodySha256'] == config['profiles']['female']['sha256'])
hair_manifest = json_file('prototype/public'+hair['manifestUrl'], hair['manifestSha256'])
fit = json_file('prototype/public'+hair['fit']['url'], hair['fit']['sha256'])
read('prototype/public'+hair_manifest['url'], hair['assetSha256'])
assets, data = {}, {}
for name, profile in config['profiles'].items():
    resource = 'prototype/public'+profile['url']
    read(resource, profile['sha256'])
    g = GLB(ROOT/resource)
    assets[name] = g
    data[name] = inventory(g)
    read('prototype/public'+profile['manifestUrl'])
source_reports = {name: json_file('assets-source/m1-variants/'+name+'/build-report.json') for name in NAMES[1:]}
for name, report in source_reports.items():
    assert report['sourceVRMSha256'] == config['profiles']['female']['sha256']
    assert report['vrmSha256'] == config['profiles'][name]['sha256'] == report['repeatExportSha256']
    read(report['editableBlend'], report['editableBlendSha256'])

base = data['female']
comparisons = {}
for name in NAMES[1:]:
    candidate = data[name]
    bones = {}
    for semantic in ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head']:
        if semantic not in base['semantic']:
            continue
        oi, ni = base['semantic'][semantic], candidate['semantic'][semantic]
        old_name, new_name = assets['female'].doc['nodes'][oi]['name'], assets[name].doc['nodes'][ni]['name']
        bones[semantic] = {'originalRawName': old_name, 'candidateRawName': new_name,
            'local': array_check(base['local'][oi], candidate['local'][ni]),
            'world': array_check(base['world'][oi], candidate['world'][ni]),
            'inverseBind': array_check(base['binds'][old_name], candidate['binds'][new_name]),
            'candidateWorldColumnMajor': candidate['world'][ni].T.reshape(-1).tolist()}
    primitives = []
    for material, old in base['primitives'].items():
        new = candidate['primitives'][material]
        assert np.array_equal(old['indices'], new['indices']) and np.array_equal(old['used'], new['used']), 'Unmatched topology needs separate mapping'
        delta = np.linalg.norm(new['world']-old['world'], axis=1)
        changed = delta > 0
        primitives.append({'material': material, 'mesh': old['mesh'], 'primitive': old['primitive'],
            'usedVertices': len(old['used']), 'triangles': len(old['indices'])//3,
            'indexSha256': sha(old['indices'].tobytes()), 'indicesExactlyEqual': True,
            'changedPositionVertices': int(changed.sum()), 'maxPositionDisplacementM': float(delta.max()),
            'changedOriginalWorldBoundsM': bounds(old['world'][changed]),
            'attributes': {key: array_check(value, new['attributes'][key]) for key, value in old['attributes'].items()},
            'materialJsonEqual': old['material'] == new['material'],
            'materialJsonSHA256': {'original': canonical(old['material']), 'candidate': canonical(new['material'])}})
    regions = {}
    body = base['primitives']['F00_001_01_Body_00_SKIN']
    new_body = candidate['primitives']['F00_001_01_Body_00_SKIN']
    for label, raw_names in [('headNeckWeightedBody', ['J_Bip_C_Head', 'J_Bip_C_Neck']),
                             ('chestWeightedBody', ['J_Bip_C_Chest', 'J_Bip_C_UpperChest'])]:
        ids = [i for i, joint in enumerate(body['jointNames']) if joint in raw_names]
        selected = np.any(np.isin(body['attributes']['JOINTS_0'], ids)&(body['attributes']['WEIGHTS_0'] > 0), axis=1)
        delta = np.linalg.norm(new_body['world'][selected]-body['world'][selected], axis=1)
        regions[label] = {'selection': 'Body_SKIN vertices with positive source weight to listed raw joints', 'rawNames': raw_names,
            'vertices': int(selected.sum()), 'changedPositionVertices': int(np.count_nonzero(delta)),
            'maxPositionDisplacementM': float(delta.max()) if len(delta) else 0,
            'sourceWorldBoundsM': bounds(body['world'][selected]),
            'attributes': {key: array_check(value[selected], new_body['attributes'][key][selected]) for key,value in body['attributes'].items()}}
    colliders = []
    for collider in fit['dynamics']['colliders']:
        semantic = collider['bone']
        oi, ni = base['semantic'][semantic], candidate['semantic'][semantic]
        old_matrix, new_matrix = base['world'][oi], candidate['world'][ni]
        offset = np.array(collider['offset'])
        tail = np.array(collider.get('tail', collider['offset']))
        affected = []
        for material in ['F00_001_01_Body_00_SKIN', 'F00_000_00_Face_00_SKIN']:
            old, new = base['primitives'][material], candidate['primitives'][material]
            points = transform(old['world'], np.linalg.inv(old_matrix))
            axis = tail-offset
            t = np.clip((points-offset)@axis/(axis@axis), 0, 1) if axis@axis else np.zeros(len(points))
            inside = np.linalg.norm(points-(offset+t[:, None]*axis), axis=1) <= collider['radius']
            delta = np.linalg.norm(new['world']-old['world'], axis=1)
            affected.append({'material': material, 'sourceVerticesInsideProxy': int(inside.sum()),
                             'changedInsideProxyVertices': int(np.count_nonzero(delta[inside])),
                             'maxChangedInsideProxyDisplacementM': float(delta[inside].max()) if inside.any() else 0})
        colliders.append({'config': collider, 'anchorFrameExactlyEqual': np.array_equal(old_matrix,new_matrix),
            'originalWorldOffset': transform(offset[None],old_matrix)[0].tolist(),
            'candidateWorldOffset': transform(offset[None],new_matrix)[0].tolist(),
            'originalWorldTail': transform(tail[None],old_matrix)[0].tolist(),
            'candidateWorldTail': transform(tail[None],new_matrix)[0].tolist(),
            'changedSourceGeometryInsideProxy': affected,
            'scope': 'Vertex membership within the declared rest proxy, not triangle contact or collider suitability approval'})
    mesh_arrays = []
    for mi, mesh in enumerate(assets['female'].doc['meshes']):
        old_primitive = mesh['primitives'][0]
        new_primitive = assets[name].doc['meshes'][mi]['primitives'][0]
        a = assets['female'].acc(old_primitive['attributes']['POSITION'])
        b = assets[name].acc(new_primitive['attributes']['POSITION'])
        delta = np.linalg.norm(a.astype(float)-b.astype(float), axis=1)
        oi, ni = base['meshNodes'][mi], candidate['meshNodes'][mi]
        mesh_arrays.append({'meshIndex': mi, 'meshName': mesh['name'], 'accessorVertices': len(a),
            'exactChangedPositionEntries': int(np.count_nonzero(delta)), 'maximumDisplacementM': float(delta.max()),
            'nonzeroDisplacementsAtMost1eMinus7M': int(np.count_nonzero((delta>0)&(delta<=1e-7))),
            'countScope': 'Exact exported accessor differences, including float storage. Primitive counts and Blender source deformation counts have different scopes.',
            'meshLocalFrame': array_check(base['local'][oi],candidate['local'][ni]),
            'meshWorldFrame': array_check(base['world'][oi],candidate['world'][ni])})
    comparisons[name] = {'rawBones': bones, 'meshArrays': mesh_arrays, 'allSkinInverseBindsExactlyEqual': all(np.array_equal(value,candidate['binds'][key]) for key,value in base['binds'].items()),
        'primitiveComparisons': primitives, 'weightedRegions': regions, 'colliderAnchorComparisons': colliders,
        'embeddedImageSHA256ExactlyEqual': assets['female'].images() == assets[name].images(),
        'embeddedImageSHA256': assets[name].images(),
        'vrmHumanoidMappingExactlyEqual': assets['female'].doc['extensions']['VRM']['humanoid'] == assets[name].doc['extensions']['VRM']['humanoid'],
        'vrmMaterialPropertiesExactlyEqual': assets['female'].doc['extensions']['VRM']['materialProperties'] == assets[name].doc['extensions']['VRM']['materialProperties'],
        'sourceAuthorRecord': {'kind': source_reports[name]['kind'], 'skeletonRestHash': source_reports[name]['skeletonRestHash'],
            'meshChanges': [{key: mesh[key] for key in ['mesh','changedVertices','maxDisplacement','maxShapeDeltaError']} for mesh in source_reports[name]['meshes']]}}

report = {'status': 'source-dependency-audit-complete-no-new-admission', 'profiles': config['profiles'], 'currentPonytailCatalogEntry': hair,
    'currentPonytailFit': fit, 'currentPonytailCatalogEntries': config['hairEntries'],
    'exactBodyAdmission': {name: any(profile['sha256'] in entry['compatibleBodies'] for entry in config['hairEntries']) for name, profile in config['profiles'].items()},
    'sourceFiles': files, 'comparisons': comparisons,
    'method': {'parser': 'Existing scripts/m2-male-face-v1/glb.py', 'numpyVersion': np.__version__,
        'coordinates': 'Full glTF node TRS/matrix hierarchy in source bind coordinates. Same-coordinate comparisons, no runtime VRM0 pose/render claim.',
        'attributeHashes': 'Actual accessor dtype bytes selected by exact equal primitive indices. No approximate identity substitution.',
        'geometryRegions': 'Positive source raw-bone weight selection and declared rest-proxy vertex membership; no arbitrary named-body assumption.'},
    'limits': ['No new fit/catalog allowlist, GPU, browser, deformation/physics runtime or visual acceptance.',
        'Matching frames and original cap dependencies are necessary source evidence only. Derived target identity and changed anatomy/collider contact still need bounded fit and runtime verification.',
        'Only current original-female rootjoin-v2 ponytail dependency reuse is assessed.']}
for item in files:
    assert sha((ROOT/item['path']).read_bytes()) == item['sha256'], 'Input changed during audit: '+item['path']
(OUT/'report.json').write_text(json.dumps(report, ensure_ascii=False, separators=(',', ':'))+'\n',encoding='utf-8')
print(json.dumps({'status': report['status'], 'variants': {name: {'allSkinInverseBindsExactlyEqual': value['allSkinInverseBindsExactlyEqual'],
    'headWorldEqual': value['rawBones']['head']['world']['equal'],
    'changedPrimitives': [{'material': p['material'], 'vertices': p['changedPositionVertices'], 'maximumM': p['maxPositionDisplacementM'], 'bounds':p['changedOriginalWorldBoundsM']} for p in value['primitiveComparisons'] if p['changedPositionVertices']],
    'regions': value['weightedRegions'], 'colliders': value['colliderAnchorComparisons']} for name,value in comparisons.items()}},ensure_ascii=False))
