"""Focused regression fixtures for v2 audit math and actual corruption rejection."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'scripts'))
from qa_representative_batch_v2 import nearest_binding, normal_map, positions, primitive, transfer_check, triangles

loader = importlib.util.spec_from_file_location('batch_audit', REPO / 'scripts/qa-representative-batch-v1.py')
module = importlib.util.module_from_spec(loader)
loader.loader.exec_module(module)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=REPO)
    args = parser.parse_args()
    checks = []
    def check(name, passed, detail=None):
        checks.append({'name': name, 'passed': bool(passed), 'detail': detail})
    body = np.array([[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]])
    points = np.array([[.2, .3, .4], [.7, .7, .4], [-.1, -.1, .4]])
    faces = np.array([[0, 1, 2]])
    chosen, bary, anchor, derivative, distance = nearest_binding(points, body, faces)
    expected = np.array([[.2, .3, 0.], [.5, .5, 0.], [0., 0., 0.]])
    check('triangle-interior-edge-vertex-projection', np.allclose(anchor, expected, atol=1e-12))
    check('triangle-convex-barycentric', (bary >= 0).all() and np.allclose(bary.sum(1), 1))
    jacobian = np.array([[[2., .3, 0.], [0., 1., 0.], [0., 0., 1.]]])
    normal = np.array([[1., 1., 0.]])
    mapped = normal_map(normal, jacobian)
    tangent = np.array([[1., -1., 0.]])
    transformed_tangent = np.einsum('nij,nj->ni', jacobian, tangent)
    check('normal-inverse-transpose-orthogonality', abs(float((mapped * transformed_tangent).sum())) < 1e-12)
    check('normal-length-preserved', np.allclose(np.linalg.norm(mapped, axis=1), np.linalg.norm(normal, axis=1)))
    audit = module.Audit(args.root)
    manifest = json.loads((args.root / 'assets-source/m2-representative-batch-v2/generated/manifest.json').read_bytes())
    entry = next(v for v in manifest['variants'] if v['id'] == 'female-round-full-v2')
    spec = json.loads((args.root / 'assets-source/m2-representative-batch-v2/spec.json').read_bytes())
    original = spec['sources']['female']['equipment'][0]
    source = audit.glb(args.root / original['path'])
    equipment = json.loads((args.root / entry['equipmentManifest']['path']).read_bytes())
    garment = next(i for i in equipment['items'] if i['slot'] == 'top')
    target = audit.glb((args.root / entry['equipmentManifest']['path']).parent / Path(garment['url']).name)
    old = audit.glb(args.root / entry['sourceBody']['path'])
    new = audit.glb(args.root / entry['avatar']['path'])
    p, q = primitive(old, 'Body_00_SKIN'), primitive(new, 'Body_00_SKIN')
    first = source.doc['meshes'][0]['primitives'][0]
    position_index = target.doc['meshes'][0]['primitives'][0]['attributes']['POSITION']
    vertex = int(source.acc(first['indices']).reshape(-1)[0])
    class Mutated:
        doc = target.doc
        def acc(self, index):
            array = target.acc(index)
            if index == position_index:
                array = array.copy()
                array[vertex, 0] += .001
            return array
    transfer_check(audit, source, Mutated(), positions(old, p), positions(new, q), triangles(old, p), 'one-mm-corruption')
    failed = [c['name'] for c in audit.checks if not c['passed']]
    check('actual-garment-one-mm-offset-corruption-rejected', any(name.startswith('v2-source-offset-vector-preserved-') for name in failed), failed)
    check('actual-garment-one-mm-displacement-corruption-rejected', any(name.startswith('v2-nearest-body-displacement-') for name in failed), failed)
    result = {'status': 'passed' if all(c['passed'] for c in checks) else 'failed', 'checks': checks,
              'scope': 'Three analytic nearest-point cases, inverse-transpose normal math and in-memory corruption of an actual produced garment. No candidate or source bytes changed.'}
    (Path(__file__).parent / 'focused-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
