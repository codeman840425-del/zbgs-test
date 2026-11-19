"""True original VRM0 and native VRM1 inputs stay distinct and cannot admit a look."""
import json
import struct
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import native_body_intake as intake
from native_mesh_budget import encode


DIR = intake.ROOT / 'evidence/m2-body-intake-v1'


def fixture(name):
    return json.loads((DIR / (name + '-request.json')).read_bytes())


class SourceIntakeTests(unittest.TestCase):
    def test_real_sources_and_runtime_registry(self):
        profiles = intake.runtime_profiles()
        for name, kind, count, registered in [
                ('published-cc0', 'different-vrm-format', 2, ['source-male-ab9a-v1']),
                ('native-template', 'native-template-comparable', 9, [])]:
            request = fixture(name)
            original = intake.inspect(request, {})
            self.assertEqual(original, json.loads((DIR / (name + '-report.json')).read_bytes()))
            result = intake.inspect(request, profiles)
            self.assertEqual(result, {**original, 'registration': {'exactBodyProfiles': registered}})
            self.assertEqual(result['referenceComparison']['classification'], kind)
            self.assertEqual(set(result['body']['directlyWeightedCoreBones']), intake.CORE)
            self.assertEqual(len(result['staticBodyBudget']['violations']), count)
            self.assertFalse(result['productionAdmission'])
            self.assertFalse(result['runtimeAdmission'])

    def test_source_hash_cannot_be_swapped(self):
        request = fixture('published-cc0')
        request['source']['sha256'] = request['reference']['sha256']
        with self.assertRaisesRegex(ValueError, 'SHA-256 mismatch'):
            intake.inspect(request, {})

    def test_unrelated_publisher_receipt_cannot_identify_other_body(self):
        request = fixture('published-cc0')
        request['source'] = fixture('native-template')['source']
        with self.assertRaisesRegex(ValueError, 'receipt does not identify'):
            intake.inspect(request, {})

    def test_bad_referenced_vertex_is_rejected_by_cli_with_a_receipt(self):
        request = fixture('published-cc0')
        source = intake.AssetCost(intake.confined(intake.ROOT, request['source']['path']))
        doc, binary = intake.embedded_glb(source.raw)
        node = next(node for node in doc['nodes'] if 'skin' in node)
        primitive = doc['meshes'][node['mesh']]['primitives'][0]
        vertex = source.accessor(primitive['indices'])[0][0]
        weights = doc['accessors'][primitive['attributes']['WEIGHTS_0']]
        self.assertEqual(weights['componentType'], 5126)
        view = doc['bufferViews'][weights['bufferView']]
        start = view.get('byteOffset', 0) + weights.get('byteOffset', 0) + vertex * view.get('byteStride', 16)
        with TemporaryDirectory(dir=DIR) as tmp:
            directory = Path(tmp)

            def asset(name, data):
                path = directory / name
                path.write_bytes(data)
                return {'path': path.relative_to(intake.ROOT).as_posix(), 'sha256': intake.digest(data)}

            indices = doc['accessors'][primitive['indices']]
            index_view = doc['bufferViews'][indices['bufferView']]
            index_offset = index_view.get('byteOffset', 0) + indices.get('byteOffset', 0)
            index_type = {5121: '<B', 5123: '<H', 5125: '<I'}[indices['componentType']]
            original_count = weights['count']
            cases = [('zero', '<4f', start, (0, 0, 0, 0), 'invalid weights'),
                     ('negative', '<4f', start, (-1, 2, 0, 0), 'invalid weights'),
                     ('nonfinite', '<4f', start, (float('nan'), 1, 0, 0), 'nonfinite value'),
                     ('indices', index_type, index_offset, (original_count,), 'index exceeds POSITION'),
                     ('weight-count', None, None, (), 'attribute count mismatch')]
            for name, fmt, offset, values, reason in cases:
                with self.subTest(case=name):
                    changed = bytearray(binary)
                    if fmt:
                        struct.pack_into(fmt, changed, offset, *values)
                    weights['count'] = original_count - int(name == 'weight-count')
                    request['source'] = asset('injected.vrm', encode(doc, changed))
                    request['provenance'] = asset('diagnostic-source.json',
                        json.dumps({'vrmSHA256': request['source']['sha256']}).encode())
                    pin = asset('test-request.json', json.dumps(request).encode())
                    proc = subprocess.run([sys.executable, intake.__file__, pin['path']], cwd=intake.ROOT,
                                          capture_output=True, text=True)
                    self.assertNotEqual(proc.returncode, 0)
                    self.assertEqual(proc.stderr, '')
                    failure = json.loads(proc.stdout)
                    self.assertEqual(failure['declaredSource'], request['source'])
                    self.assertEqual(failure['schema'], 'native-body-intake-failure-v1')
                    self.assertIn(reason, failure['reason'])
                    self.assertFalse(failure['productionAdmission'])
                    self.assertFalse(failure['runtimeAdmission'])

    def test_native_recipe_cannot_nominate_another_reference(self):
        request = fixture('native-template')
        request['reference'] = fixture('published-cc0')['source']
        with self.assertRaisesRegex(ValueError, 'Recipe reference differs'):
            intake.inspect(request, {})

    def test_empty_modern_expressions_and_bad_targets_remain_warnings(self):
        request = fixture('native-template')
        model = intake.AssetCost(intake.confined(intake.ROOT, request['source']['path']))
        vrm = model.doc['extensions']['VRMC_vrm']
        names = list(vrm['expressions']['preset']) + ['lookUp', 'lookDown', 'lookLeft', 'lookRight']
        vrm['expressions'] = {'preset': {name: {} for name in names}}
        active = intake.active_scene(model.doc)
        result = intake.expression_bindings(model, vrm, True, active)
        self.assertEqual((result['declaredCount'], result['withResolvedBindings'], len(result['warnings'])), (18, 0, 18))
        vrm['expressions']['custom'] = {'test': {
            'materialColorBinds': [{'material': 0, 'type': 'color', 'targetValue': [0, 1, 1, 1]}],
            'textureTransformBinds': [{'material': 0, 'offset': [.2, .2]}],
            'morphTargetBinds': [{'node': len(model.doc['nodes']), 'index': 0, 'weight': 1}]}}
        result = intake.expression_bindings(model, vrm, True, active)
        self.assertEqual(result['resolvedByExpression']['custom.test'], {'materialColor': 1, 'textureTransform': 1})
        self.assertTrue(any(w.get('binding') == 'morphTargetBinds[0]' for w in result['warnings']))

    def test_legacy_morph_material_and_unbound_declarations(self):
        request = fixture('published-cc0')
        model = intake.AssetCost(intake.confined(intake.ROOT, request['source']['path']))
        vrm = model.doc['extensions']['VRM']
        material = model.doc['materials'][0]['name']
        vrm['blendShapeMaster']['blendShapeGroups'] = [
            {'name': 'Empty', 'presetName': 'unknown'}, {'name': 'MaterialOnly', 'materialValues': [
                {'materialName': material, 'propertyName': '_Color', 'targetValue': [1, 0, 0, 1]},
                {'materialName': material, 'propertyName': '_MainTex_ST', 'targetValue': [1, 1, .1, .1]}]},
            {'name': 'Bad', 'binds': [{'mesh': 0, 'index': 1000, 'weight': 100}]}]
        result = intake.expression_bindings(model, vrm, False, intake.active_scene(model.doc))
        self.assertEqual((result['declaredCount'], result['withResolvedBindings']), (3, 1))
        self.assertEqual(result['resolvedByExpression']['groups[1].MaterialOnly'], {'materialColor': 1, 'textureTransform': 1})
        self.assertTrue(any(w.get('binding') == 'binds[0]' for w in result['warnings']))

    def test_legacy_body_without_a_foot_or_with_a_bad_parent_is_rejected(self):
        source = fixture('published-cc0')['source']
        model = intake.AssetCost(intake.confined(intake.ROOT, source['path']))
        bones = model.doc['extensions']['VRM']['humanoid']['humanBones']
        foot = next(row for row in bones if row['bone'] == 'leftFoot')
        bones.remove(foot)
        with self.assertRaisesRegex(ValueError, 'Incomplete project full-body'):
            intake.humanoid(model)
        bones.append(foot)
        hand = next(row for row in bones if row['bone'] == 'rightHand')
        foot['node'], hand['node'] = hand['node'], foot['node']
        with self.assertRaisesRegex(ValueError, 'Humanoid hierarchy mismatch'):
            intake.humanoid(model)


if __name__ == '__main__':
    unittest.main()
