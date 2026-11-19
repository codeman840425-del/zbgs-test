"""Independent shape readback, atomic retries, and cross-checkout path regressions."""
import gzip
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from uuid import uuid4

sys.dont_write_bytecode = True
import numpy as np

from flow import GLB, ROOT, read_json
from native_import import digest
from production_paths import project_output
from rule_body_producer import generate, produce


RECIPES = ROOT / 'assets-source/rule-body-recipe-v1'
SCRATCH = ROOT / 'output/m2-first-rule-delivery-v1/producer'


class ShapeRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipe = read_json(RECIPES / 'candidate.json')
        cls.template = read_json(ROOT / cls.recipe['template']['path'])
        cls.input = (ROOT / cls.template['sourceBody']['path']).read_bytes()
        project_output(SCRATCH, __file__).mkdir(parents=True, exist_ok=True)

    def test_real_geometry_and_protected_dependencies(self):
        data, proof = generate(self.recipe)
        parent, emitted = GLB(self.input), GLB(data)
        mesh_idx = next(i for i, m in enumerate(parent.doc['meshes']) if m['name'] == self.template['mesh'])
        prims = parent.doc['meshes'][mesh_idx]['primitives']
        pos = prims[0]['attributes']['POSITION']
        old = np.array(parent.accessor(pos))
        new = np.array(emitted.accessor(pos))
        shape = json.loads(gzip.decompress((ROOT / self.template['shapeEndpoint']['path']).read_bytes()))
        dx, dy, dz = np.array(shape['delta']).T
        expected = (old + self.recipe['weight'] * np.column_stack((dx, dz, -dy))).astype('f4')
        np.testing.assert_array_equal(new, expected)
        changed = np.any(new != old, axis=1)
        self.assertGreater(np.count_nonzero(changed), 0)
        for prim in prims:
            material = parent.doc['materials'][prim['material']]['name']
            if material != self.template['mutableMaterial']:
                ids = np.array(parent.accessor(prim['indices'])).ravel()
                self.assertFalse(changed[ids].any(), material)
        allowed = {pos, prims[0]['attributes']['NORMAL'], *(t['NORMAL'] for t in prims[0]['targets'])}
        for idx in range(len(parent.doc['accessors'])):
            if idx not in allowed:
                self.assertEqual(parent.accessor(idx), emitted.accessor(idx), f'accessor {idx}')
        for key in parent.doc:
            if key != 'accessors':
                self.assertEqual(parent.doc[key], emitted.doc[key], key)
        for idx, a in enumerate(parent.doc['accessors']):
            for key, val in a.items():
                if not (idx in allowed and key in ('min', 'max')):
                    self.assertEqual(val, emitted.doc['accessors'][idx][key])
        for image in parent.doc['images']:
            view = parent.doc['bufferViews'][image['bufferView']]
            offset = view.get('byteOffset', 0)
            span = slice(offset, offset + view['byteLength'])
            self.assertEqual(parent.binary[span], emitted.binary[span])
        self.assertEqual(digest(data), proof['bodySha256'])
        self.assertEqual(generate(dict(self.recipe, weight=0))[0], self.input)

    def test_rejection_then_retry_from_separate_input_checkout(self):
        with TemporaryDirectory(dir=SCRATCH) as tmp:
            workspace = Path(tmp)
            incoming = project_output(workspace / 'input', __file__)
            project_output(incoming, __file__).mkdir()
            env = dict(os.environ, TMP=tmp, TEMP=tmp)
            subprocess.run(['git', 'init', '-q', str(incoming)], check=True, env=env)
            for pin in (self.recipe['template'], self.template['sourceBody'],
                        self.template['shapeEndpoint'], self.template['provenance']):
                copy = project_output(incoming / pin['path'], __file__)
                copy.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / pin['path'], copy)
            out = project_output(workspace / 'emitted', __file__)
            for wrong in (True, '0.4', float('nan'), -0.1, 1.2):
                with self.subTest(weight=wrong), self.assertRaisesRegex(ValueError, 'Shape weight'):
                    produce(dict(self.recipe, weight=wrong), out, incoming)
                self.assertFalse(out.exists())
            with self.assertRaisesRegex(ValueError, 'digest'):
                produce(dict(self.recipe, template=dict(self.recipe['template'], sha256='0'*64)), out, incoming)
            self.assertFalse(out.exists())
            actual = produce(self.recipe, out, incoming)
            self.assertEqual(digest((out / 'body.vrm').read_bytes()), actual['bodySha256'])
            self.assertEqual(produce(self.recipe, out, incoming), actual)
            with self.assertRaisesRegex(ValueError, 'Existing destination differs'):
                produce(read_json(RECIPES / 'control.json'), out, incoming)
            self.assertEqual(digest((out / 'body.vrm').read_bytes()), actual['bodySha256'])
            self.assertFalse(list(workspace.glob('.body-*')))

    @unittest.skipUnless(os.name == 'nt', 'Windows drive/junction fixture')
    def test_drive_traversal_and_directory_junction(self):
        with TemporaryDirectory(dir=SCRATCH) as tmp:
            folder = Path(tmp)
            marker = 'rule-body-' + uuid4().hex
            drive = Path(ROOT.anchor)
            junction = project_output(folder / 'drive', __file__)
            subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(junction), str(drive)],
                           check=True, capture_output=True, env=dict(os.environ, TMP=tmp, TEMP=tmp))
            try:
                self.assertEqual(junction.resolve(), drive)
                for path in (drive / marker, ROOT / '..' / marker, junction / marker):
                    with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'inside the production'):
                        produce(self.recipe, path)
                    self.assertFalse((drive / marker).exists())
            finally:
                junction.rmdir()


if __name__ == '__main__':
    unittest.main()
