"""Inspect an exact, project-local full-body VRM before requesting per-body production assets.

Pass a request JSON (see evidence/m2-body-intake-v1) to print the report to stdout.
--check compares a saved report. This command never installs a body or writes assets.
"""
import argparse
import json
import math
from pathlib import Path
import subprocess

from asset_budget import AssetCost, budget_config, check, ref
from flow import ROOT, require
from native_dependency_delta import compare_exports, name_matching_issues, read_pinned
from native_import import confined, digest, embedded_glb


CORE = {'hips', 'spine', 'head', *(side + bone for side in ('left', 'right')
                                    for bone in ('UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot'))}
BUDGET = ROOT / 'scripts/production/asset-budgets-v1.json'


def pin(entry):
    path = confined(ROOT, entry['path'])
    identity, raw = read_pinned(path, entry['sha256'])
    return identity, raw


def runtime_profiles():
    program = """import {FOUNDATION_PROFILES as profiles} from './prototype/src/foundation-profiles.js';
    console.log(JSON.stringify(Object.fromEntries(Object.entries(profiles).map(([id,p]) => [id,p.sha256]))))"""
    output = subprocess.check_output(['node', '--input-type=module', '-e', program], cwd=ROOT)
    return json.loads(output)


def provenance(request, source):
    receipt, raw = pin(request['provenance'])
    record = json.loads(raw)
    if record.get('schema') == 'native-body-package-recipe-v1':
        item, = [row for row in record['items'] if row['candidate'] == request['source']]
        require(record['baseline'] == request.get('reference'), 'Recipe reference differs')
        editable_template, _ = pin(record['template'])
        batch, batch_raw = pin(record['authoringBatch'])
        result, result_raw = pin(record['authoringResult'])
        require(json.loads(batch_raw)['template']['sha256'] == editable_template['sha256'],
                'Authoring batch/template mismatch')
        produced = json.loads(result_raw)
        entry, = [row for row in produced['items'] if row['id'] == item['id']]
        require(produced['passed'] and entry['state'] == 'exported'
                and entry['exported']['sha256'] == source['sha256'], 'Authoring result does not identify this VRM')
        project = (Path(source['path']).parent / entry['editable']['path']).as_posix()
        editable, _ = pin({'path': project, 'sha256': entry['editable']['sha256']})
        return {'kind': 'native-authoring-recipe', 'receipt': receipt, 'template': editable_template,
                'editableSource': editable, 'batch': batch, 'result': result, 'item': item['id']}
    # For a publisher or local author, the request identifies the SHA field in their source receipt.
    record_sha = record
    for key in request['sourceShaField']:
        record_sha = record_sha[key]
    require(record_sha == source['sha256'], 'Source receipt does not identify this VRM')
    terms, _ = pin(request['terms'])
    return {'kind': 'documented-source', 'receipt': receipt, 'terms': terms,
            'publisher': record.get('publisher'), 'sourceUrl': record.get('url'),
            'sourceLimitations': record.get('limits'), 'editableSource': None}


def active_scene(doc):
    nodes = doc['nodes']
    scene = ref(doc['scenes'], doc.get('scene', 0), 'scene')
    pending = list(scene['nodes'])
    active = set()
    while pending:
        index = pending.pop()
        node = ref(nodes, index, 'scene node')
        require(index not in active, 'Scene node has duplicate parent or cycle')
        active.add(index)
        pending.extend(node.get('children', []))
    return active


def expression_bindings(model, vrm, modern, active):
    doc = model.doc
    nodes, meshes, materials = doc['nodes'], doc['meshes'], doc.get('materials', [])
    active_meshes = {nodes[i]['mesh'] for i in active if 'mesh' in nodes[i]}
    active_materials = {p['material'] for mesh in active_meshes for p in meshes[mesh]['primitives'] if 'material' in p}
    declared = []
    if modern:
        for group in ('preset', 'custom'):
            for name, entry in vrm.get('expressions', {}).get(group, {}).items():
                declared.append((f'{group}.{name}', entry))
    else:
        for i, entry in enumerate(vrm.get('blendShapeMaster', {}).get('blendShapeGroups', [])):
            declared.append((f"groups[{i}].{entry.get('name') or entry.get('presetName') or 'unnamed'}", entry))

    def finite(value):
        return type(value) in (float, int) and math.isfinite(value)

    def vector(value, size):
        return isinstance(value, list) and len(value) == size and all(finite(x) for x in value)

    geometry = {}

    def morph_target(mesh, index):
        if (mesh, index) not in geometry:
            primitives = meshes[mesh]['primitives']
            if not all(0 <= index < len(p.get('targets', [])) for p in primitives):
                return 'morph index missing from target mesh primitives'
            changed = False
            for p in primitives:
                used = ({row[0] for row in model.accessor(p['indices'])} if 'indices' in p
                        else range(len(model.accessor(p['attributes']['POSITION']))))
                for accessor in p['targets'][index].values():
                    values = model.accessor(accessor)
                    if any(any(values[vertex]) for vertex in used):
                        changed = True
                        break
                if changed:
                    break
            geometry[mesh, index] = None if changed else 'no nonzero morph delta on referenced vertices'
        return geometry[mesh, index]

    def resolve(kind, bind):
        if not isinstance(bind, dict):
            return kind, 'invalid binding object'
        if kind == 'morph':
            mesh = bind.get('mesh')
            if modern:
                node = bind.get('node')
                if type(node) is not int or node not in active:
                    return kind, 'target node missing from active scene'
                mesh = nodes[node].get('mesh')
            if type(mesh) is not int or mesh not in active_meshes or type(bind.get('index')) is not int:
                return kind, 'target mesh or morph index unavailable'
            weight = bind.get('weight', None if modern else 100)
            if not finite(weight) or not 0 < weight <= (1 if modern else 100):
                return kind, 'missing, zero or out-of-range influence'
            return kind, morph_target(mesh, bind['index'])
        if modern:
            material = bind.get('material')
            if type(material) is not int or material not in active_materials:
                return kind, 'material missing from active primitives'
            if kind == 'materialColor':
                supported = ('color', 'emissionColor', 'shadeColor', 'matcapColor', 'rimColor', 'outlineColor')
                valid = bind.get('type') in supported and vector(bind.get('targetValue'), 4)
            else:
                valid = vector(bind.get('scale', [1, 1]), 2) and vector(bind.get('offset', [0, 0]), 2)
        else:
            matches = [i for i in active_materials if bind.get('materialName') and
                       materials[i].get('name') == bind['materialName']]
            if len(matches) != 1:
                return kind, 'material name is missing or ambiguous on active primitives'
            material = matches[0]
            field = bind.get('propertyName')
            if field == '_MainTex_ST':
                kind = 'textureTransform'
            elif field in ('_Color', '_EmissionColor', '_ShadeColor', '_RimColor', '_OutlineColor'):
                kind = 'materialColor'
            else:
                return kind, 'unsupported VRM0 material property'
            valid = vector(bind.get('targetValue'), 4)
        definition = materials[material]
        extensions = definition.get('extensions', {})
        legacy_materials = vrm.get('materialProperties', [])
        legacy = legacy_materials[material] if not modern and material < len(legacy_materials) else {}
        mtoon = 'VRMC_materials_mtoon' in extensions or legacy.get('shader') == 'VRM/MToon'
        if kind == 'materialColor':
            channel = bind.get('type') if modern else bind.get('propertyName')
            if channel in ('shadeColor', 'rimColor', 'matcapColor', 'outlineColor', '_RimColor', '_ShadeColor', '_OutlineColor') and not mtoon:
                return kind, 'target material has no MToon color channel'
            if channel in ('emissionColor', '_EmissionColor') and not mtoon and 'KHR_materials_unlit' in extensions:
                return kind, 'unlit material has no emission channel'
        elif kind == 'textureTransform':
            pbr = definition.get('pbrMetallicRoughness', {})
            mapped = [pbr.get(k) for k in ('baseColorTexture', 'metallicRoughnessTexture')]
            mapped.extend(definition.get(k) for k in ('normalTexture', 'emissiveTexture'))
            mapped.extend(extensions.get('VRMC_materials_mtoon', {}).get(k) for k in
                          ('shadeMultiplyTexture', 'rimMultiplyTexture', 'outlineWidthMultiplyTexture', 'uvAnimationMaskTexture'))
            legacy_maps = legacy.get('textureProperties', {})
            if not any(isinstance(tex, dict) and 'index' in tex for tex in mapped) and not any(
                    legacy_maps.get(k, -1) >= 0 for k in ('_MainTex', '_BumpMap', '_ShadeTexture', '_EmissionMap',
                                                         '_RimTexture', '_OutlineWidthTexture', '_UvAnimMaskTexture')):
                return kind, 'target material has no sampled texture for UV transforms'
        return kind, None if valid else 'invalid material channel or target value'

    fields = ([('morphTargetBinds', 'morph'), ('materialColorBinds', 'materialColor'),
               ('textureTransformBinds', 'textureTransform')] if modern
              else [('binds', 'morph'), ('materialValues', 'legacyMaterial')])
    resolved, warnings = {}, []
    for name, entry in declared:
        counts = {}
        for field, kind in fields:
            for i, bind in enumerate(entry.get(field, [])):
                category, issue = resolve(kind, bind)
                if issue:
                    warnings.append({'expression': name, 'binding': f'{field}[{i}]', 'reason': issue})
                else:
                    counts[category] = counts.get(category, 0) + 1
        resolved[name] = counts
        if not counts:
            warnings.append({'expression': name, 'reason': 'no resolved morph, material color or texture transform binding'})
    return {'declaredCount': len(declared), 'withResolvedBindings': sum(bool(v) for v in resolved.values()),
            'resolvedByExpression': resolved, 'warnings': warnings,
            'scope': 'Static active-scene targets. Morphs require nonzero referenced deltas. Material bindings resolve source channels and values; runtime or visible change is unmeasured.'}


def humanoid(model):
    """Read semantics after asset_budget.check validated this SHA's primitive indices and weight streams."""
    doc = model.doc
    ext = doc.get('extensions', {})
    formats = [name for name in ('VRM', 'VRMC_vrm') if name in ext]
    require(len(formats) == 1, 'Expected exactly one VRM humanoid extension')
    name = formats[0]
    vrm = ext[name]
    expected_version = '1.0' if name == 'VRMC_vrm' else '0.0'
    require(vrm['specVersion'] == expected_version, 'Unreviewed VRM specification version')
    declared = vrm['humanoid']['humanBones']
    pairs = ([(key, row['node']) for key, row in declared.items()] if name == 'VRMC_vrm'
             else [(row['bone'], row['node']) for row in declared])
    bones = dict(pairs)
    require(len(bones) == len(pairs) == len(set(bones.values())), 'Duplicate humanoid semantic or node')
    require(CORE <= bones.keys(), 'Incomplete project full-body semantics: ' + str(sorted(CORE - bones.keys())))
    active = active_scene(doc)
    require(all(type(idx) is int and idx in active for idx in bones.values()), 'Humanoid node outside active scene')
    influenced = set()
    mesh_count = 0
    for i in sorted(active):
        node = doc['nodes'][i]
        if 'skin' not in node:
            continue
        mesh = ref(doc['meshes'], node['mesh'], 'skinned mesh')
        joints = ref(doc['skins'], node['skin'], 'skin')['joints']
        require(set(joints) <= active, 'Skin joint outside active scene')
        mesh_count += 1
        for primitive in mesh['primitives']:
            attrs = primitive['attributes']
            count = ref(doc['accessors'], attrs['POSITION'], 'skinned POSITION')['count']
            used = (set(i for row in model.accessor(primitive['indices']) for i in row)
                    if 'indices' in primitive else range(count))
            require(all(type(v) is int and 0 <= v < count for v in used), 'Triangle index outside skinned POSITION')
            require('JOINTS_0' in attrs and 'WEIGHTS_0' in attrs, 'Skinned mesh has no joint/weight streams')
            for key, index in attrs.items():
                if key.startswith('JOINTS_'):
                    js = model.accessor(index)
                    ws = model.accessor(attrs[key.replace('JOINTS_', 'WEIGHTS_')])
                    for vertex in used:
                        influenced.update(ref(joints, j, 'skin joint') for j,w in zip(js[vertex], ws[vertex], strict=True) if w > 0)
    require(mesh_count and influenced, 'Missing skinned geometry with actual vertex influence')
    parents = {child: i for i in active for child in doc['nodes'][i].get('children', [])}
    chains = [('hips', 'spine', 'head')]
    for side in ('left', 'right'):
        chains.extend([('spine', side + 'UpperArm', side + 'LowerArm', side + 'Hand'),
                       ('hips', side + 'UpperLeg', side + 'LowerLeg', side + 'Foot')])
    for chain in chains:
        for parent, child in zip(chain, chain[1:]):
            node = bones[child]
            while node in parents and node != bones[parent]:
                node = parents[node]
            require(node == bones[parent], f'Humanoid hierarchy mismatch: {parent} / {child}')
    if name == 'VRMC_vrm':
        expressions = list(vrm.get('expressions', {}).get('preset', {}))
    else:
        expressions = [g.get('presetName') for g in vrm.get('blendShapeMaster', {}).get('blendShapeGroups', [])]
    return {'format': name, 'specVersion': vrm['specVersion'], 'embeddedMeta': vrm['meta'], 'generator': doc['asset'].get('generator'),
            'activeNodes': len(active), 'skinnedMeshNodes': mesh_count, 'mappedBones': len(bones),
            'directlyWeightedCoreBones': sorted(s for s in CORE if bones[s] in influenced),
            'coreBonesWithoutDirectWeights': sorted(s for s in CORE if bones[s] not in influenced),
            'expressionPresetDeclarations': sorted(x for x in expressions if x),
            'expressionBindings': expression_bindings(model, vrm, name == 'VRMC_vrm', active)}


def inspect(request, profiles):
    require(request['schema'] == 'native-body-intake-request-v1', 'Unsupported source intake request')
    identity, raw = pin(request['source'])
    path = confined(ROOT, identity['path'])
    doc, _ = embedded_glb(raw)
    require(all('uri' not in row for row in doc.get('images', [])), 'Embedded VRM images required for pinned source inspection')
    origin = provenance(request, identity)
    model = AssetCost(path)
    require(digest(model.raw) == identity['sha256'], 'Model changed during intake')
    config = budget_config(BUDGET, 'm2-technical-v1')
    # check() validates stream cardinality, unsigned indices, normalized weight sums,
    # finite components and joint bounds before any index is used for humanoid readback.
    cost = check(path, 'body', config)
    require(cost['sha256'] == identity['sha256'], 'Model changed during budget readback')
    body = humanoid(model)
    comparison = {'classification': 'no-reference', 'reference': None}
    if request.get('reference'):
        reference, ref_raw = pin(request['reference'])
        ref_doc, _ = embedded_glb(ref_raw)
        if body['format'] not in ref_doc.get('extensions', {}):
            comparison = {'classification': 'different-vrm-format', 'reference': reference,
                          'reason': 'VRM humanoid extension and loader coordinate contracts differ.'}
        else:
            delta = compare_exports(confined(ROOT, reference['path']), reference['sha256'], path, identity['sha256'])
            if delta['status'] == 'compared':
                family = 'native-template-comparable' if origin['kind'] == 'native-authoring-recipe' else 'aligned-exports-lineage-unverified'
                comparison = {'classification': family, 'reference': reference, 'changedPrimitives': len(delta['primitives']),
                              'observedCounts': delta['comparedCounts'], 'checks': delta['requiredChecks']}
            else:
                comparison = {'classification': 'reference-comparison-unsupported', 'reference': reference, 'reason': delta['reason']}
                if 'matchingIssues' in delta:
                    comparison['matchingIssues'] = delta['matchingIssues']
    registered = sorted(key for key, sha in profiles.items() if sha == identity['sha256'])
    return {'schema': 'native-body-intake-result-v1', 'source': identity, 'origin': origin, 'body': body,
            'registration': {'exactBodyProfiles': registered}, 'referenceComparison': comparison,
            'nativeNameMatchingIssues': name_matching_issues(doc) if body['format'] == 'VRMC_vrm' else [],
            'staticBodyBudget': {'version': cost['budgetVersion'], 'rulesSha256': digest(BUDGET.read_bytes()),
                                 'status': cost['status'], 'metrics': dict(sorted(cost['metrics'].items())),
                                 'violations': cost['violations']},
            'status': 'source-inspected', 'productionAdmission': False, 'runtimeAdmission': False,
            'outstanding': {'fit': 'No target-SHA accessory/contact/motion fit evidence supplied.',
                            'equipment': 'No target garment skin bindings, outfit pairing or coverage assets supplied.',
                            'record': 'No target record, game package, playback or cold restore supplied.',
                            'outfitBudget': 'Only the source body was measured; selected equipment and runtime cost remain unmeasured.'}}


class IntakeArguments(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError(message)


def main():
    parser = IntakeArguments(description=__doc__)
    parser.add_argument('request', help='project-relative request JSON')
    parser.add_argument('--check', help='compare against a project-relative saved intake report')
    request_path = None
    candidate = None
    try:
        args = parser.parse_args()
        request_path = args.request
        request = json.loads(confined(ROOT, request_path).read_bytes())
        require(isinstance(request, dict) and isinstance(request.get('source'), dict),
                'Expected an intake request with a source identity')
        candidate = {key: request['source'].get(key) for key in ('path', 'sha256')}
        result = inspect(request, runtime_profiles())
        if args.check:
            require(json.loads(confined(ROOT, args.check).read_bytes()) == result, 'Saved intake report differs')
    except Exception as error:
        # The CLI is the production pipeline boundary; library callers keep the original exception.
        print(json.dumps({'schema': 'native-body-intake-failure-v1', 'status': 'rejected',
                          'request': request_path, 'declaredSource': candidate, 'error': type(error).__name__,
                          'reason': str(error), 'productionAdmission': False, 'runtimeAdmission': False},
                         ensure_ascii=True))
        return 1
    if args.check:
        print(f"{result['source']['sha256']}: {result['referenceComparison']['classification']}")
    else:
        print(json.dumps(result, indent=2, ensure_ascii=True, allow_nan=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
