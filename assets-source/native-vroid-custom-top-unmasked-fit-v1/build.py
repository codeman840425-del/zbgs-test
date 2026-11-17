"""Re-read exact 843ac source and unchanged sleeve56 GLB; emit one new fit only."""
import copy
import hashlib
import importlib.util
import json
import platform
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
IDENT = 'native-unmasked-843ac-sleeve56-top-v1'
TOP = 'N00_004_01_Tops_01_CLOTH (Instance)'
TARGET = 'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm'
ORIGINAL = 'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm'
GEAR = 'assets-source/native-vroid-custom-top-v1/native-vroid-78912-sleeve56-top-v1.glb'
DIRECT = 'evidence/vroid-customitem-study-v1/native-single-top-v1/customitem-study-direct.vrm'
PINS = {
    TARGET: '843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef',
    ORIGINAL: '78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3',
    GEAR: '75c113d68a7eab1e9f09178b4ddf5c03a9f9d237e0a66d79b0984f45bd5538b7',
    DIRECT: '6a32481ef8caef06b3f3fe52528e0330b6e83334e0d9b41fa66caf7b7f5ec634',
    'assets-source/native-vroid-custom-top-v1/equipment.json': '1ff75de76ed48c11f302154671b8150ec1026356274af9ecf1631f828c59b63e',
    'assets-source/native-vroid-custom-top-v1/source-fit.json': '88d9e18718a56a6afebd69855de7cb6f8fb2481a4947e532aa3fb4d2211fea8e',
    'assets-source/native-vroid-custom-top-v1/recipe.json': '7b498627c224ea63a3675bb15b40d82aee85fe244517827260ce1eeb42ad42be',
    'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vroid': '311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de',
    'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/female-tops-removed.vroid': '76955cfa0a2e711af2499e44cbf8682c2231445139a996cf2a549df2dd7d46ac',
}
sha = lambda b: hashlib.sha256(b).hexdigest()
encoded = lambda x: (json.dumps(x, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')


def build():
    pins = []
    for relative, expected in PINS.items():
        data = (ROOT / relative).read_bytes()
        assert sha(data) == expected, 'Input identity mismatch: ' + relative
        pins.append({'path': relative, 'sha256': expected, 'bytes': len(data)})
    helper = ROOT / 'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/readback.py'
    assert sha(helper.read_bytes()) == '5f6f7d25067b1604dc6814f31b0193dac2a7be8274c8b784f3b1788d55989506'
    module = importlib.util.spec_from_file_location('native_fit_readback', helper)
    rb = importlib.util.module_from_spec(module)
    module.loader.exec_module(rb)
    for file in [helper, Path(rb.a.__file__), Path(rb.a.reader.__file__)]:
        pins.append({'path': file.relative_to(ROOT).as_posix(), 'sha256': sha(file.read_bytes()), 'bytes': file.stat().st_size})
    target, original, gear, direct = [rb.a.reader.GLB(ROOT / p) for p in [TARGET, ORIGINAL, GEAR, DIRECT]]
    assert target.doc['accessors'] == original.doc['accessors']
    for i in range(len(target.doc['accessors'])):
        assert np.array_equal(target.acc(i), original.acc(i)), ('Original/843ac accessor changed', i)
    for key in ['nodes', 'skins', 'meshes', 'materials', 'textures', 'samplers', 'extensions']:
        assert target.doc[key] == original.doc[key], 'Original/843ac dependency changed: ' + key
    tb, tw, tn = rb.skeleton(target)
    ob, ow, on = rb.skeleton(original)
    gb, gw, gn = rb.skeleton(gear)
    db, dw, dn = rb.skeleton(direct)
    t, o, g, d = [rb.primitive(model, world, names, TOP) for model, world, names in
        [(target, tw, tn), (original, ow, on), (gear, gw, gn), (direct, dw, dn)]]
    assert np.array_equal(t['tri'], o['tri'])
    assert set(t['attrs']) == set(o['attrs'])
    assert all(np.array_equal(t['attrs'][k], o['attrs'][k]) for k in t['attrs'])
    assert np.array_equal(g['tri'], d['tri'])
    assert set(g['attrs']) == set(d['attrs'])
    assert all(np.array_equal(g['attrs'][k], d['attrs'][k]) for k in g['attrs'])
    assert np.array_equal(gw[g['meta']['node']], tw[t['meta']['node']]), 'Mesh authored rest space differs'
    ids = g['ids']
    joints = g['attrs']['JOINTS_0'][ids].astype(int)
    weights = g['attrs']['WEIGHTS_0'][ids].astype(float)
    assert np.isfinite(weights).all() and (weights >= 0).all()
    assert joints.min() >= 0 and joints.max() < len(g['jointNames'])
    sum_error = float(np.abs(weights.sum(1) - 1).max())
    assert sum_error < 1e-5
    used = set(np.unique(joints[weights > 0]).tolist())
    used_names = {g['jointNames'][j] for j in used}
    parent = {c: i for i, n in enumerate(gear.doc['nodes']) for c in n.get('children', [])}
    ancestors = set()
    for j in used:
        node = gear.doc['skins'][0]['joints'][j]
        while node is not None:
            ancestors.add(node)
            node = parent.get(node)
    target_by_name = {name: i for i, name in enumerate(tn) if name}
    assert len(target_by_name) == len([name for name in tn if name])
    local = lambda node: {key: node[key] for key in ['matrix', 'translation', 'rotation', 'scale'] if key in node}
    ancestor_rows = []
    for node in sorted(ancestors):
        name = gn[node]
        other = target_by_name[name]
        assert local(gear.doc['nodes'][node]) == local(target.doc['nodes'][other]), name
        assert np.array_equal(gw[node], tw[other]), name
        ancestor_rows.append({'name': name, 'sourceNode': node, 'targetNode': other,
            'localRest': local(gear.doc['nodes'][node]), 'worldRestExact': True})
    target_ibms = {}
    for skin in target.doc['skins']:
        for node, matrix in zip(skin['joints'], target.acc(skin['inverseBindMatrices'])):
            name = tn[node]
            if name in target_ibms:
                assert np.array_equal(target_ibms[name], matrix)
            target_ibms[name] = matrix
    semantic = {v['node']: k for k, v in target.doc['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()}
    bindings, differences = [], []
    for name in g['jointNames']:
        assert gb[name]['parentName'] == tb[name]['parentName'], name
        inverse = target_ibms[name]
        own = g['ibm'][name].T.reshape(-1)
        difference = float(np.max(np.abs(inverse - own)))
        assert difference <= 1e-5, name
        if name in used_names:
            assert difference == 0, name
        if difference:
            differences.append({'name': name, 'maximumAbsoluteDifference': difference,
                'drawnTopInfluence': name in used_names})
        bindings.append({'sourceBone': name, 'targetRawBone': name,
            'humanoidSemantic': semantic.get(target_by_name[name]), 'inverseBindMatrix': inverse.tolist()})
    old = json.loads((ROOT / 'assets-source/native-vroid-custom-top-v1/equipment.json').read_text(encoding='utf-8'))['items'][0]
    legacy_fit = json.loads((ROOT / 'assets-source/native-vroid-custom-top-v1/source-fit.json').read_text(encoding='utf-8'))
    assert legacy_fit['top']['baselineReferencedVertices'] == len(ids) == 700
    skin_rows = {'schema': 'native-unmasked-custom-top-indexed-skin-v1', 'sourceGLB': GEAR,
        'indicesAccessor': g['p']['indices'], 'indices': gear.acc(g['p']['indices']).reshape(-1).tolist(),
        'actualReferencedSourceIndices': ids.tolist(), 'jointAccessor': g['p']['attributes']['JOINTS_0'],
        'weightAccessor': g['p']['attributes']['WEIGHTS_0'], 'jointNames': g['jointNames'],
        'referencedJointLanes': joints.tolist(), 'referencedWeightLanes': weights.tolist(),
        'sourceAttributes': {k: {'accessor': g['p']['attributes'][k], 'rows': len(v),
            'decodedByteSha256': sha(v.tobytes()), 'dtype': str(v.dtype)} for k, v in g['attrs'].items()}}
    skin_bytes = encoded(skin_rows)
    fit = {'schema': 'native-unmasked-custom-top-fit-v1', 'id': IDENT + '-fit', 'styleId': IDENT,
        'targetAvatarSha256': PINS[TARGET], 'garmentSha256': PINS[GEAR],
        'status': 'actual-source-and-bind-checked-cpu-runtime-pending', 'inputs': pins,
        'newSourceVsOriginal': {'allDecodedAccessorsExact': len(target.doc['accessors']),
            'nodesSkinsMeshesMaterialsTexturesSamplersExtensionsExact': True, 'targetTopIndicesAndAllAttributesExact': True,
            'changedBodyTextureDoesNotGrantCoverage': True},
        'indexedSkin': {'path': 'indexed-skin.json', 'sha256': sha(skin_bytes), 'referencedVertices': len(ids),
            'triangles': len(g['tri']), 'maximumStoredWeightSumError': sum_error},
        'garmentVsNativeDirect': {'indicesAndAllAttributeRowsExact': True, 'authoredMeshRestSpaceExact': True},
        'binding': {'jointNamesAndOrder': g['jointNames'], 'jointCount': len(bindings),
            'usedJoints': sorted(used_names), 'usedJointCount': len(used_names),
            'usedJointIBMExact': True, 'usedJointAncestors': ancestor_rows,
            'allJointIBMByteExact': not differences, 'unusedJointIBMDifferences': differences,
            'loaderToleranceUnchanged': 1e-5, 'bindingsRebuiltFromActual843acIBM': True},
        'retainedSourceFit': {'path': 'assets-source/native-vroid-custom-top-v1/source-fit.json',
            'sha256': PINS['assets-source/native-vroid-custom-top-v1/source-fit.json'],
            'retainedOrientedTriangles': legacy_fit['top']['retainedOrientedTriangles'],
            'targetOnlyTriangles': legacy_fit['top']['targetOnlyTriangles'],
            'mappingAppliesToNewTargetBecauseFullActualAttributesEqual': True},
        'limits': ['Only this top on exact843ac; no general source or body compatibility',
            '39 points/70 faces from transparent-delete source difference remain unclassified per-face alpha',
            'Four unused Foot/Toe IBM differences retained, no threshold changes',
            'Body texture coverage, factory, room and visual checks pending; old78912 run is not new843ac validation']}
    fit_bytes = encoded(fit)
    item = copy.deepcopy(old)
    item.update(id=IDENT, name='完整原生基体 · 改袖上衣技术样件', styleId=IDENT, fitId=fit['id'],
        url='../native-vroid-custom-top-v1/' + Path(GEAR).name, compatibleAvatarSha256=PINS[TARGET], bindings=bindings,
        sourceFitEvidence={'path': 'source-fit.json', 'sha256': sha(fit_bytes)}, limits=fit['limits'])
    manifest = {'schema': 'zbgs-equipment-v1', 'id': 'native-vroid-custom-top-unmasked-fit-v1',
        'status': '843ac-source-fit-and-cpu-check-required-not-public', 'items': [item]}
    return {'equipment.json': encoded(manifest), 'source-fit.json': fit_bytes, 'indexed-skin.json': skin_bytes,
        'input-pins.json': encoded({'schema': 'native-unmasked-custom-top-inputs-v1', 'inputs': pins,
            'buildScriptSha256': sha(Path(__file__).read_bytes()), 'python': platform.python_version(), 'numpy': np.__version__,
            'geometryReexported': False, 'originalAssetsModified': False})}


if __name__ == '__main__':
    plan = build()
    repeated = build()
    assert plan == repeated, 'Independent repeat plan differs'
    for name, data in plan.items():
        if '--check' in sys.argv:
            assert (OUT / name).read_bytes() == data, 'Repeat differs: ' + name
        else:
            assert not (OUT / name).exists(), 'Output conflict: ' + name
    if '--check' not in sys.argv:
        for name, data in plan.items():
            with (OUT / name).open('xb') as stream:
                stream.write(data)
    print(json.dumps({'mode': 'check' if '--check' in sys.argv else 'build', 'repeatedBytesIdentical': True,
        'outputs': {name: {'sha256': sha(data), 'bytes': len(data)} for name, data in plan.items()}}))
