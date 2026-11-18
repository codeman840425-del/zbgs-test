import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from native_dependency_delta import ROOT, compare_exports
from native_import import embedded_glb
from native_mesh_budget import encode


BASELINE = ROOT / 'assets-source/native-vroid-geometry-production-v1/generated/female-geometry-baseline.vrm'
BASELINE_SHA = '1924a88851d0fa6e786ba99b52c6007a9e0f090c799c8341af37fd3b67a49a2b'


class DependencyDeltaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = BASELINE.read_bytes()

    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.directory = Path(scratch.name)

    def mutated(self, mutate, *, source=None, filename='candidate.vrm'):
        raw = self.raw if source is None else source.read_bytes()
        boundary = struct.unpack_from('<I', raw, 12)[0] + 20
        doc = json.loads(raw[20:boundary])
        binary = bytearray(raw[boundary + 8:])
        mutate(doc, binary)
        data = json.dumps(doc, separators=(',', ':')).encode()
        data += b' ' * (-len(data) % 4)
        candidate = self.directory / filename
        raw = (struct.pack('<4sIII4s', b'glTF', 2, 28 + len(data) + len(binary), len(data), b'JSON')
               + data + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
        candidate.write_bytes(raw)
        return candidate, hashlib.sha256(raw).hexdigest()

    def compare_mutation(self, mutate):
        return compare_exports(BASELINE, BASELINE_SHA, *self.mutated(mutate))

    def test_unnamed_texture_reports_array_index_and_material_channels(self):
        doc, binary = embedded_glb(self.raw)
        tex = doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']
        del doc['textures'][tex]['name']
        other = encode(doc, binary)
        pins = [({'sha256': BASELINE_SHA}, self.raw), ({'sha256': hashlib.sha256(other).hexdigest()}, other)]
        with patch('native_dependency_delta.read_pinned', side_effect=pins):
            report = compare_exports(BASELINE, BASELINE_SHA, BASELINE, pins[1][0]['sha256'])
        self.assertEqual(report['status'], 'unsupported')
        self.assertIn('candidate:', report['reason'])
        issue, = report['matchingIssues']
        self.assertEqual(issue['path'], f'textures[{tex}].name')
        self.assertIn('materials[0].pbrMetallicRoughness.baseColorTexture', issue['materialChannels'])
        self.assertTrue(all(v['status'] == 'needs-recheck' for v in report['requiredChecks'].values()))

    def test_accessor_reindex_keeps_dependency_data(self):
        def reindex(doc, _):
            doc['accessors'].reverse()
            last = len(doc['accessors']) - 1
            for mesh in doc['meshes']:
                for p in mesh['primitives']:
                    p['indices'] = last - p['indices']
                    for table in [p['attributes'], *p.get('targets', [])]:
                        table.update({key: last - val for key, val in table.items()})
            for skin in doc['skins']:
                skin['inverseBindMatrices'] = last - skin['inverseBindMatrices']

        report = self.compare_mutation(reindex)
        self.assertEqual(report['status'], 'compared', report.get('reason'))
        self.assertEqual(report['primitives'], [])
        self.assertEqual(report['skins'], [])
        self.assertEqual(report['requiredChecks']['runtimeRecordAndBudget']['status'], 'needs-recheck')

    def test_primitive_reorder_is_unsupported(self):
        report = self.compare_mutation(lambda doc, _: doc['meshes'][0]['primitives'].reverse())
        self.assertEqual(report['status'], 'unsupported')
        self.assertIn('Primitive layout changed', report['reason'])
        self.assertTrue(all(v['status'] == 'needs-recheck' for v in report['requiredChecks'].values()))

    def test_shorter_node_layout_is_unsupported(self):
        report = self.compare_mutation(lambda doc, _: doc['nodes'].pop())
        self.assertEqual(report['status'], 'unsupported')
        self.assertIn('nodes identities or order changed', report['reason'])

    def test_changed_indices_report_topology_without_pairing_vertex_rows(self):
        def change_indices(doc, binary):
            index = doc['meshes'][0]['primitives'][0]['indices']
            entry = doc['accessors'][index]
            view = doc['bufferViews'][entry['bufferView']]
            offset = view['byteOffset'] + entry.get('byteOffset', 0)
            a, b = struct.unpack_from('<II', binary, offset)
            self.assertNotEqual(a, b)
            struct.pack_into('<II', binary, offset, b, a)

        report = self.compare_mutation(change_indices)
        self.assertEqual(report['status'], 'unsupported')
        self.assertIn('Index topology differs', report['reason'])
        self.assertEqual(report['primitives'][0]['indices']['changedRows'], 2)
        self.assertEqual(report['primitives'][0]['attributes'], {})

    def test_material_graph_uses_actual_sampler_values(self):
        def change_sampler(doc, _):
            sampler = doc['textures'][0]['sampler']
            doc['samplers'][sampler]['wrapS'] = 33071

        report = self.compare_mutation(change_sampler)
        self.assertEqual(report['status'], 'compared', report.get('reason'))
        self.assertIn('_01', report['surface']['textureBindings'])
        self.assertTrue(any('FaceMouth' in row['material'] for row in report['surface']['materials']))
        self.assertEqual(report['surface']['images'], [])

    def test_morph_positions_alone_trigger_body_and_hair_dependency_checks(self):
        def add_body_morph(doc, binary):
            body = doc['meshes'][1]
            position = body['primitives'][0]['attributes']['POSITION']
            count = doc['accessors'][position]['count']
            offset = len(binary)
            binary.extend(bytes(count * 12))
            doc['buffers'][0]['byteLength'] = len(binary)
            view = len(doc['bufferViews'])
            doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': count * 12})
            morph = len(doc['accessors'])
            doc['accessors'].append({'bufferView': view, 'componentType': 5126, 'count': count,
                                     'type': 'VEC3', 'min': [0, 0, 0], 'max': [0, 0, 0]})
            body['extras']['targetNames'] = ['FixtureBodyMorph']
            body['weights'] = [1]
            for primitive in body['primitives']:
                primitive['targets'] = [{'POSITION': morph}]
                primitive['extras']['targetNames'] = ['FixtureBodyMorph']

        def change_morph_positions(doc, binary):
            body = doc['meshes'][1]
            morph = doc['accessors'][body['primitives'][0]['targets'][0]['POSITION']]
            morph_offset = doc['bufferViews'][morph['bufferView']]['byteOffset']
            morph['max'] = [0.125, 0, 0]
            for primitive in body['primitives']:
                material = doc['materials'][primitive['material']]['name']
                if 'Body_00_SKIN' in material or 'HairBack' in material:
                    index = doc['accessors'][primitive['indices']]
                    view = doc['bufferViews'][index['bufferView']]
                    start = view['byteOffset'] + index.get('byteOffset', 0)
                    vertex = struct.unpack_from('<I', binary, start)[0]
                    struct.pack_into('<f', binary, morph_offset + vertex * 12, 0.125)

        baseline, baseline_sha = self.mutated(add_body_morph, filename='body-morph-base.vrm')
        candidate, candidate_sha = self.mutated(change_morph_positions, source=baseline)
        report = compare_exports(baseline, baseline_sha, candidate, candidate_sha)
        self.assertEqual(report['status'], 'compared', report.get('reason'))
        self.assertTrue(all(not row['attributes'] for row in report['primitives']))
        self.assertEqual(report['nodes'], [])
        self.assertEqual(report['skins'], [])
        self.assertEqual(report['vrmFields'], [])
        for material in ('Body_00_SKIN', 'HairBack'):
            row = next(row for row in report['primitives'] if material in row['material'])
            self.assertGreater(row['morphs']['FixtureBodyMorph']['POSITION']['changedRows'], 0)
        for check in ('garmentsAndCoverage', 'feetAndFloor', 'seatContact', 'dynamicMotion',
                      'headAttachments'):
            self.assertEqual(report['requiredChecks'][check]['status'], 'needs-recheck', check)

    def test_cli_rejects_bad_sha_and_existing_output(self):
        output = self.directory / 'result.json'
        command = [sys.executable, '-B', str(Path(__file__).with_name('native_dependency_delta.py')),
                   '--baseline', str(BASELINE), '--baseline-sha256', BASELINE_SHA,
                   '--candidate', str(BASELINE), '--candidate-sha256', '0' * 64,
                   '--output', str(output)]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn('SHA-256 mismatch', result.stderr)
        self.assertFalse(output.exists())
        output.write_text('existing output', encoding='utf-8')
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Output already exists', result.stderr)
        self.assertEqual(output.read_text(encoding='utf-8'), 'existing output')


if __name__ == '__main__':
    unittest.main()
