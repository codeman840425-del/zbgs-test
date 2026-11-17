"""Audit exact source dependencies, then reuse the existing native extractor."""
import collections
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'assets-source/vroid-customitem-study-v1'))
from analyze_export_diff import load, accessor

TARGET = ROOT / 'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm'
BASELINE = ROOT / 'evidence/vroid-customitem-study-v1/native-single-top-v1/customitem-study-baseline.vrm'
DIRECT = ROOT / 'evidence/vroid-customitem-study-v1/native-single-top-v1/customitem-study-direct.vrm'
PINS = {TARGET: '78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3',
        BASELINE: '88a34746c9563112e7c75231345c1a9efba14b9628720b1c281aecbd91ab224a',
        DIRECT: '6a32481ef8caef06b3f3fe52528e0330b6e83334e0d9b41fa66caf7b7f5ec634'}
IDENT = 'native-vroid-78912-sleeve56-top-v1'
TOP = 'N00_004_01_Tops_01_CLOTH (Instance)'
sha = lambda data: hashlib.sha256(data).hexdigest()
encoded = lambda value: (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode()


def primitive(data, name):
    doc, binary = data
    found = [(mi, pi, p) for mi, mesh in enumerate(doc['meshes']) for pi, p in enumerate(mesh['primitives'])
             if doc['materials'][p['material']]['name'] == name]
    assert len(found) == 1, 'Source material must identify exactly one primitive'
    mi, pi, p = found[0]
    indices = [row[0] for row in accessor(doc, binary, p['indices'])[1]]
    return {'mesh': mi, 'primitive': pi, 'definition': p, 'indices': indices, 'ids': sorted(set(indices)),
            'attributes': {key: accessor(doc, binary, index) for key, index in p['attributes'].items()}}


def signature(row, index, names=None):
    return tuple(row['attributes'][name][0][index] for name in (names or sorted(row['attributes'])))


def material_graph(data, material):
    doc, binary = data
    def replace(value):
        if isinstance(value, list):
            return [replace(v) for v in value]
        if not isinstance(value, dict):
            return value
        result = {}
        for key, child in value.items():
            if 'texture' in key.lower() and isinstance(child, dict) and 'index' in child:
                texture = doc['textures'][child['index']]
                assert not texture.get('extensions')
                image = doc['images'][texture['source']]
                assert 'uri' not in image
                view = doc['bufferViews'][image['bufferView']]
                payload = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
                result[key] = {**child, 'index': {'imageSha256': sha(payload), 'mimeType': image['mimeType'],
                    'sampler': doc.get('samplers', [])[texture['sampler']] if 'sampler' in texture else None}}
            else:
                result[key] = replace(child)
        return result
    return replace(material)


def build():
    for path, expected in PINS.items():
        assert sha(path.read_bytes()) == expected, str(path)
    original, baseline, direct = [load(path) for path in PINS]
    target_top, baseline_top, direct_top = [primitive(data, TOP) for data in [original, baseline, direct]]
    assert baseline_top['indices'] == direct_top['indices']
    for name in ['TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']:
        assert baseline_top['attributes'][name][0] == direct_top['attributes'][name][0]
    lookup = {signature(target_top, i): i for i in target_top['ids']}
    assert len(lookup) == len(target_top['ids']), 'Target top vertex correspondence is ambiguous'
    mapping = {i: lookup[signature(baseline_top, i)] for i in baseline_top['ids']}
    assert len(set(mapping.values())) == len(mapping)
    # Cyclic rotations retain winding. Reversed triangles do not match.
    canonical = lambda tri: min(tuple(tri[i:] + tri[:i]) for i in range(3))
    target_triangles = collections.Counter(canonical(target_top['indices'][i:i + 3])
                                           for i in range(0, len(target_top['indices']), 3))
    mapped_triangles = collections.Counter(canonical([mapping[v] for v in baseline_top['indices'][i:i + 3]])
                                           for i in range(0, len(baseline_top['indices']), 3))
    assert not (mapped_triangles - target_triangles), 'Top surface is not a retained target triangle subset'
    source_doc, target_doc = direct[0], original[0]
    source_skin, target_skin = source_doc['skins'][1], target_doc['skins'][1]
    assert source_skin['joints'] == target_skin['joints'] and len(source_skin['joints']) == 130
    source_names = [source_doc['nodes'][n]['name'] for n in source_skin['joints']]
    assert source_names == [target_doc['nodes'][n]['name'] for n in target_skin['joints']]
    assert len(set(source_names)) == 130
    assert source_doc['extensions']['VRMC_vrm']['humanoid'] == target_doc['extensions']['VRMC_vrm']['humanoid']
    joints = direct_top['attributes']['JOINTS_0'][1]
    weights = direct_top['attributes']['WEIGHTS_0'][1]
    used = sorted({joint for vertex in direct_top['ids'] for joint, weight in zip(joints[vertex], weights[vertex]) if weight > 0})
    parent = {child: i for i, node in enumerate(source_doc['nodes']) for child in node.get('children', [])}
    ancestors = set()
    for joint in used:
        node = source_skin['joints'][joint]
        while node not in ancestors:
            ancestors.add(node)
            if node not in parent:
                break
            node = parent[node]
    assert all(source_doc['nodes'][i] == target_doc['nodes'][i] for i in ancestors)
    assert source_doc['nodes'][131] == target_doc['nodes'][131]
    source_ibm = accessor(*direct, source_skin['inverseBindMatrices'])[1]
    target_ibm = accessor(*original, target_skin['inverseBindMatrices'])[1]
    differences = [{'joint': i, 'name': source_names[i], 'maximumAbsoluteDifference': max(abs(a - b) for a, b in zip(x, y)),
                    'drawnTopInfluence': i in used} for i, (x, y) in enumerate(zip(source_ibm, target_ibm)) if x != y]
    assert all(source_ibm[i] == target_ibm[i] for i in used)
    assert all(row['maximumAbsoluteDifference'] <= 1e-5 and not row['drawnTopInfluence'] for row in differences)
    material = source_doc['materials'][direct_top['definition']['material']]
    assert 'VRMC_materials_mtoon' in material['extensions']
    assert material_graph(direct, material) == material_graph(original, target_doc['materials'][target_top['definition']['material']])
    # Body mapping uses exact UV and skin bindings, never nearest-position fitting.
    body_name = 'N00_000_00_Body_00_SKIN (Instance)'
    a, b = primitive(original, body_name), primitive(baseline, body_name)
    body_lookup = collections.defaultdict(list)
    for i in a['ids']:
        body_lookup[signature(a, i, ['TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'])].append(i)
    distances, equivalent_duplicates, changed_y = [], 0, []
    for i in b['ids']:
        options = body_lookup[signature(b, i, ['TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'])]
        assert options, 'Body correspondence absent'
        exact = [v for v in options if a['attributes']['POSITION'][0][v] == b['attributes']['POSITION'][0][i]]
        if len(options) > 1:
            assert exact and len({a['attributes']['POSITION'][0][v] for v in exact}) == 1
            equivalent_duplicates += len(exact) > 1
            distances.append(0)
        else:
            distance = math.dist(a['attributes']['POSITION'][1][options[0]], b['attributes']['POSITION'][1][i])
            distances.append(distance)
            if distance:
                changed_y.append(b['attributes']['POSITION'][1][i][1])
    min_top_y = min(direct_top['attributes']['POSITION'][1][i][1] for i in direct_top['ids'])
    assert not changed_y or max(changed_y) < min_top_y, 'Body differences reach the top fitting region'
    report = {'schema': 'native-custom-top-exact-source-fit-v1', 'status': 'source-backed-technical-candidate-only',
        'inputs': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': h} for p, h in PINS.items()],
        'top': {'targetReferencedVertices': len(target_top['ids']), 'baselineReferencedVertices': len(mapping),
            'mapping': [{'sourceBaselineIndex': k, 'original78912Index': v} for k, v in sorted(mapping.items())],
            'allBaselineAttributesByteExactToUniqueTargetRows': True, 'retainedOrientedTriangles': sum(mapped_triangles.values()),
            'targetOnlyTriangles': sum((target_triangles - mapped_triangles).values()),
            'sourceDirectMinimumReferencedY': min_top_y, 'directUvJointsWeightsByteExactToBaseline': True,
            'materialAndEmbeddedImageSamplerGraphExactToTarget': True},
        'skeleton': {'jointNamesAndOrderExact': 130, 'humanoidSemanticsExact': True, 'usedJoints': [source_names[i] for i in used],
            'usedJointIbmsAndAncestorNodeTransformsExact': True, 'allJointIbmsByteExact': not differences,
            'unusedJointIbmDifferences': differences, 'existingEquipmentIbmAdmissionTolerance': 1e-5},
        'body': {'targetReferencedVertices': len(a['ids']), 'baselineReferencedVertices': len(b['ids']),
            'mappingMethod': 'exact UV + JOINTS + WEIGHTS; duplicate candidates resolved only by exact coordinate equivalence',
            'coordinateEquivalentDuplicateRows': equivalent_duplicates, 'changedPositionRows': len(changed_y),
            'maximumMatchedPositionDifferenceM': max(distances), 'changedPositionYRangeM': [min(changed_y), max(changed_y)],
            'notEntireBodyByteEquivalent': True},
        'limits': ['Native delete_transparent false/true changed source topology and numbering; only retained top triangle subset is extracted',
            'Removed triangles were not independently texture-alpha classified',
            'All130 bone IBMs are not byte-identical; the four small differences have zero drawn top influence',
            'Source-backed single top fit only; no global body/source compatibility or game visual acceptance']}
    fit_bytes = encoded(report)
    # Reuse the unchanged mature exporter in memory; emit only its new top.
    path = ROOT / 'assets-source/native-vroid-equipment-v1/build.py'
    module_spec = importlib.util.spec_from_file_location('native_equipment_extractor_reused', path)
    legacy = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(legacy)
    legacy.SOURCE, legacy.EXPECTED = DIRECT, PINS[DIRECT]
    extracted = legacy.build()
    old_manifest = json.loads(extracted['equipment.json'])
    item = next(x for x in old_manifest['items'] if x['slot'] == 'top')
    blob = extracted[item['url']]
    item.update(id=IDENT, name='原生改袖上衣·技术样件', url=IDENT + '.glb',
        compatibleAvatarSha256=PINS[TARGET], fitId=IDENT + '-fit', styleId=IDENT,
        sourceFitEvidence={'path': 'source-fit.json', 'sha256': sha(fit_bytes)},
        limits=report['limits'], sourceLicense={**item['sourceLicense'], 'status': 'internal-study-only-not-distribution-authority'})
    recipe = {'schema': 'native-custom-top-source-recipe-v1', 'sourceVroidSha256': '311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de',
        'nativeCustomItemSha256': 'c8d50791efb75d7e5daf856d698613d2c05d1a9bf36f0cb4ea4ccfcfc47348c1',
        'parameter': 'Model.N00.Casual1.BlendShape.SleeveLong', 'before': 66, 'after': 56,
        'extractor': {'path': path.relative_to(ROOT).as_posix(), 'sha256': sha(path.read_bytes()),
            'adaptation': 'unchanged build imported with explicit source/SHA globals; only top result emitted, bottom/shoe results discarded in memory'},
        'targetSha256': PINS[TARGET], 'candidateAdmission': 'technical-only-not-game-validated'}
    extraction = json.loads(extracted['extraction.json'])
    extraction['records'] = [x for x in extraction['records'] if x['sourcePrimitive'] == direct_top['primitive']]
    extraction['records'][0]['id'] = IDENT
    return {IDENT + '.glb': blob, 'equipment.json': encoded({'schema': 'zbgs-equipment-v1',
        'id': 'native-vroid-custom-top-v1', 'status': 'source-backed-technical-candidate-only', 'items': [item]}),
        'source-fit.json': fit_bytes, 'recipe.json': encoded(recipe), 'extraction.json': encoded(extraction)}


if __name__ == '__main__':
    files = build()
    for name, data in files.items():
        if '--check' in sys.argv:
            assert (OUT / name).read_bytes() == data, 'Repeat differs: ' + name
        else:
            with (OUT / name).open('xb') as stream:
                stream.write(data)
    print(json.dumps({name: {'sha256': sha(data), 'bytes': len(data)} for name, data in files.items()}))
