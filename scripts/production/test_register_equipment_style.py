"""A real two-body publication exercises the matrix authoring boundary and source pin checks."""
import io
import json
import os
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import flow
from register_equipment_style import MATRIX, ROOT, build_style, main, register

SPEC = 'assets-source/m2-socks-layer-v1/spec.json'
PUBLICATION = 'prototype/public/assets/m2-socks-layer-v1/manifest.json'
LABEL = '素色中筒袜'
ARGS = ['--spec', SPEC, '--publication', PUBLICATION, '--label', LABEL]


class PublishedStyleTests(unittest.TestCase):
    def test_both_targets_and_idempotence(self):
        style, evidence = build_style(ROOT, SPEC, PUBLICATION, LABEL)
        self.assertEqual([row['bodyType'] for row in evidence], ['female', 'male'])
        self.assertTrue(all(row['bones'] == 6 and row['weightedVertices'] > 0 for row in evidence))
        for row in style['variants']:
            self.assertEqual(row['status'], 'candidate')
            self.assertEqual(row['coverageManifest'], row['fitManifest']+'#bodyCoverageMasks')
        current = json.loads(MATRIX.read_bytes())
        without = dict(current, styles=[s for s in current['styles'] if s['styleId'] != style['styleId']])
        authored = register(without, style)
        published = next(s for s in current['styles'] if s['styleId'] == style['styleId'])
        beta_types = {row['bodyType'] for row in style['variants']}
        self.assertEqual([r for r in published['variants'] if r['bodyType'] in beta_types],
                         style['variants'])
        for row in published['variants']:
            if row['bodyType'] not in beta_types:
                authored = register(authored, dict(style, variants=[row]))
        self.assertEqual(authored, current)
        self.assertEqual(register(current, style), current)
        female, male = style['variants']
        partial = register(without, dict(style, variants=[female]))
        self.assertEqual(register(partial, dict(style, variants=[male])), register(without, style))
        self.assertEqual(register(current, dict(style, variants=[male])),current)
        with self.assertRaisesRegex(ValueError, 'Existing variant has different data'):
            register(current, dict(style, variants=[dict(male,fitManifestSha256='0'*64)]))
        self.assertEqual(partial['styles'][-1]['variants'],[female])

    def test_published_asset_and_member_are_checked_against_sources(self):
        publication = json.loads((ROOT/PUBLICATION).read_bytes())
        entry = publication['items'][0]
        target = 'prototype/public'+entry['url']
        catalog = json.loads((ROOT/SPEC).read_bytes())['bodies']['female']['manifest']
        source = json.loads((ROOT/catalog).read_bytes())
        marked, = [e for e in source['items'] if e['id'] == entry['id']]
        marked['preserveOriginalBody'] = False
        real_local = flow.local
        with tempfile.TemporaryDirectory(dir=ROOT/'experiments') as directory:
            file = Path(directory)/'isolated-test-copy'
            for name, data, reason in [(catalog,json.dumps(source).encode(),'Equipment member differs'),
                                        (target,b'wrong GLB','SHA mismatch')]:
                with self.subTest(modified=name):
                    file.write_bytes(data)
                    def resolve(root, candidate):
                        return file if candidate == name else real_local(root,candidate)
                    with patch.object(flow,'local',resolve), self.assertRaisesRegex(ValueError, reason):
                        build_style(ROOT, SPEC, PUBLICATION, LABEL)

    def test_fresh_project_matrix_and_verification(self):
        original = MATRIX.read_bytes()
        with tempfile.TemporaryDirectory(dir=ROOT/'experiments') as directory, redirect_stdout(io.StringIO()):
            output = Path(directory)/'candidate-matrix.json'
            main([*ARGS, '--output', str(output)])
            expected = output.read_bytes()
            self.assertEqual(json.loads(expected), json.loads(original))
            with self.assertRaises(FileExistsError):
                main([*ARGS, '--output', str(output)])
            self.assertEqual(output.read_bytes(), expected)
            main(ARGS)
        self.assertEqual(MATRIX.read_bytes(), original)

    def test_outside_outputs_rejected_before_loading_publication(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'experiments') as directory:
            parent = Path(directory)
            checkout = parent/'main-checkout'
            tool = checkout/'scripts/production/register_equipment_style.py'
            tool.parent.mkdir(parents=True)
            tool.touch()
            subprocess.run(['git', 'init', '-q', str(checkout)], check=True)
            outside = parent/'outside-checkout'
            outside.mkdir()
            redirect = checkout/'redirect'
            if os.name == 'nt':
                subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/j', str(redirect), str(outside)],
                               check=True, capture_output=True)
            else:
                redirect.symlink_to(outside, target_is_directory=True)
            try:
                blocked = (Path(ROOT.anchor), checkout, outside/'matrix.json',
                           checkout/'../outside-checkout/matrix.json', redirect/'matrix.json')
                with patch('register_equipment_style.__file__', str(tool)):
                    for output in blocked:
                        with self.subTest(output=output), patch('register_equipment_style.build_style') as build:
                            with self.assertRaisesRegex(ValueError, 'Output must be inside the production tool main checkout'):
                                main([*ARGS, '--output', str(output)])
                            build.assert_not_called()
                self.assertFalse((outside/'matrix.json').exists())
            finally:
                if os.name == 'nt':
                    redirect.rmdir()
                else:
                    redirect.unlink()


if __name__ == '__main__':
    unittest.main()
