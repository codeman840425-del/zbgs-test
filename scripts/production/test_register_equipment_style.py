"""A real two-body publication exercises the matrix authoring boundary and source pin checks."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import flow
from register_equipment_style import MATRIX, ROOT, build_style, register

SPEC = 'assets-source/m2-socks-layer-v1/spec.json'
PUBLICATION = 'prototype/public/assets/m2-socks-layer-v1/manifest.json'
LABEL = '素色中筒袜'


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
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory)/'isolated-test-copy'
            for name, data, reason in [(catalog,json.dumps(source).encode(),'Equipment member differs'),
                                        (target,b'wrong GLB','SHA mismatch')]:
                with self.subTest(modified=name):
                    file.write_bytes(data)
                    def resolve(root, candidate):
                        return file if candidate == name else real_local(root,candidate)
                    with patch.object(flow,'local',resolve), self.assertRaisesRegex(ValueError, reason):
                        build_style(ROOT, SPEC, PUBLICATION, LABEL)


if __name__ == '__main__':
    unittest.main()
