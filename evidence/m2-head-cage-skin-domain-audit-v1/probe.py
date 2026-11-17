"""Bounded CPU check of the bounds-only constructor and recorded coverage."""
import ast
import copy
import difflib
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

sys.dont_write_bytecode = True
import numpy as np
from scipy.spatial import cKDTree

ROOT = Path('F:/gamemake')
OUT = Path(__file__).resolve().parent
BASE = ROOT / 'assets-source/m2-head-cage-skin-domain-v1'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    head_path = ROOT / 'scripts/m2-representative-head-cage-v1/head.py'
    producer = ROOT / 'scripts/m2-head-cage-skin-domain-v1/probe.py'
    original = ast.parse(head_path.read_text())
    cls = next(n for n in original.body if isinstance(n, ast.ClassDef) and n.name == 'Head')
    init = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == '__init__')
    expected = copy.deepcopy(init)
    changed = 0
    for node in ast.walk(expected):
        if isinstance(node, ast.Call) and ast.unparse(node) == 'all_endpoints.extend(ends)':
            node.args = [ast.parse('self.domain_endpoints(primitives, ends)', mode='eval').body]
            changed += 1
    assert changed == 1
    diff_expected = ''.join(difflib.unified_diff(ast.unparse(init).splitlines(True),
        ast.unparse(expected).splitlines(True), fromfile='original-Head.__init__', tofile='skin-domain-Head.__init__'))
    script = ast.parse(producer.read_text())
    function = next(n for n in script.body if isinstance(n, ast.FunctionDef) and n.name == 'corrected_constructor')
    fake_class = type('UnexecutedHead', (), {})
    namespace = {'ROOT': ROOT, 'ast': ast, 'copy': copy, 'difflib': difflib,
        'prior': SimpleNamespace(original=SimpleNamespace()), 'SkinDomainHead': fake_class,
        'require': lambda test, message: test or (_ for _ in ()).throw(AssertionError(message))}
    exec(compile(ast.Module([function], []), 'actual-constructor-transform', 'exec'), namespace)
    actual_diff = namespace['corrected_constructor']()
    assert actual_diff == diff_expected
    assert actual_diff.encode() == (BASE / 'generated/bounds-only.diff').read_bytes()
    # __init__ was compiled but never called, so no Blender object was created.
    spec = json.loads((BASE / 'spec.json').read_bytes())
    parent_spec = json.loads((ROOT / spec['parentSpec']['path']).read_bytes())
    assert spec['setup'] == parent_spec['setup'] and spec['requests'] == parent_spec['requests']
    domain_class = next(n for n in script.body if isinstance(n, ast.ClassDef) and n.name == 'SkinDomainHead')
    domain_method = next(n for n in domain_class.body if isinstance(n, ast.FunctionDef) and n.name == 'domain_endpoints')
    domain_namespace = {'np': np}
    exec(compile(ast.Module([domain_method], []), 'actual-domain-selection', 'exec'), domain_namespace)
    old_domain = json.loads((ROOT / 'evidence/m2-head-cage-domain-audit-v1/readback.json').read_bytes())
    rows, pins = [], {head_path, producer, BASE / 'spec.json', BASE / 'generated/bounds-only.diff',
        ROOT / 'evidence/m2-head-cage-domain-audit-v1/readback.json'}
    for sex in ['female', 'male']:
        path = BASE / 'generated' / (sex + '.json')
        old_path = ROOT / 'assets-source/m2-head-cage-response-probe-v1/generated' / path.name
        data, old = json.loads(path.read_bytes()), json.loads(old_path.read_bytes())
        for key in ['source', 'units', 'sourceTarget', 'sourceTargetMeaning', 'sourcePointsM',
            'sourceFaceTriangles', 'sourceFacePositionAccessor', 'sourceLandmarksM', 'sourceFlatAxisMajor',
            'rawHeadRestOriginM', 'landmarks', 'requests', 'controls', 'controlSigns', 'controlVertexIndices',
            'nominalProbeM', 'responseBaseline', 'rowOrder', 'columnOrder', 'samplingMeaning']:
            assert data[key] == old[key], key
        frozen = subprocess.check_output(['git', 'show', '5309c95b6c3d81755b5f9da885a308c84158d66b:' + old_path.relative_to(ROOT).as_posix()], cwd=ROOT)
        assert frozen == old_path.read_bytes()
        tensor = np.asarray(data['responseTensor'])
        assert tensor.shape == (3, 202, 9, 3)
        assert np.array_equal(data['responseMatrices'], [tensor[a, :, :, a] for a in range(3)])
        assert np.array_equal(data['flattenedResponseAxisMajor'], tensor.transpose(3, 1, 0, 2).reshape(606, 27))
        for index, probe in enumerate(data['probes']):
            axis, control = divmod(index, 9)
            assert [probe['probeAxis'], probe['controlIndex'], probe['ring']] == [axis, control, data['controls'][control]]
            assert np.array_equal(tensor[axis, :, control, :], np.asarray(probe['landmarkDisplacementsM']) / data['nominalProbeM'])
        source = ROOT / data['source']['path']
        assert sha(source) == data['source']['sha256']
        g = GLB(source.read_bytes())
        pins.update([path, old_path, source])
        groups = {}
        for mi, mesh in enumerate(g.doc['meshes']):
            for pi, p in enumerate(mesh['primitives']):
                groups.setdefault(p['attributes']['POSITION'], []).append((mi, pi, p))
        anchors, records, necessary_materials = [], [], []
        for accessor, primitives in groups.items():
            P = np.asarray(g.accessor(accessor), dtype=np.float32)
            ends = [P] + [P + np.asarray(g.accessor(t['POSITION'])) for t in primitives[0][2].get('targets', [])]
            necessary = set()
            for mi, pi, p in primitives:
                name = g.doc['materials'][p['material']]['name']
                ids = np.unique(g.accessor(p['indices'])).astype(int)
                if any(t in name for t in spec['boundsDomainMaterialTokens']):
                    necessary.update(ids.tolist())
                    necessary_materials.append({'mesh': mi, 'primitive': pi, 'material': name, 'indexAccessor': p['indices'], 'indexCount': len(ids)})
                if any(t in name for t in ['_EYE', 'Eyeline', 'Eyelash', 'HAIR']):
                    anchors.extend(E[ids] for E in ends)
            records.append((accessor, primitives, ends, np.asarray(sorted(necessary), int)))
            actual_domain = domain_namespace['domain_endpoints'](
                SimpleNamespace(g=g, setup={'boundsDomainMaterialTokens': spec['boundsDomainMaterialTokens']}),
                [p for _, _, p in primitives], ends)
            expected_domain = [E[sorted(necessary)] for E in ends] if necessary else []
            assert len(actual_domain) == len(expected_domain)
            assert all(np.array_equal(a, b) for a, b in zip(actual_domain, expected_domain))
        nearest = cKDTree(np.unique(np.concatenate(anchors).astype(np.float32), axis=0))
        prior_domain = next(c for c in old_domain['cases'] if c['sex'] == sex)
        assert prior_domain['sourceSHA256'] == data['source']['sha256']
        thresholds = prior_domain['thresholds']
        H = np.asarray(thresholds['headOriginM'])
        # Same source spatial factors as the unchanged Head.weights method.
        def weights(P):
            def smooth(t):
                t = np.clip(t, 0, 1)
                return t * t * (3 - 2 * t)
            lo, hi = thresholds['neckStartWorldYM'], thresholds['neckEndWorldYM']
            w = smooth(((P - H)[:, 1] - (lo - H[1])) / (hi - lo))
            upper = thresholds['upperStartWorldYM'] - H[1]
            w *= 1 - smooth(((P - H)[:, 1] - upper) / .03)
            rear = thresholds['rearEndWorldZM'] - H[2]
            w *= 1 - smooth(((P - H)[:, 2] - (rear - .03)) / .03)
            w *= smooth(nearest.query(P.astype(np.float32))[0] / .015)
            return w
        gate = data['domainPrerequisite']
        low, high = np.asarray(gate['boundsM'])
        recorded = {(e['accessor'], e['target']): e for e in gate['endpoints']}
        endpoint_rows, outsiders, source_hash = [], [], hashlib.sha256()
        for accessor, primitives, ends, necessary in records:
            for target, P in enumerate(ends, -1):
                source_hash.update(np.asarray(P, dtype='<f8').tobytes())
                active = weights(P) > 0
                outside = np.any((P < low) | (P > high), axis=1)
                required_outside = necessary[active[necessary] & outside[necessary]]
                actual = recorded[(accessor, target)]
                assert actual['pointCount'] == len(P)
                assert actual['necessaryReferencedCount'] == len(necessary)
                assert actual['activeNecessaryCount'] == int(active[necessary].sum())
                assert actual['activeNecessaryOutside'] == required_outside.tolist() == []
                ids = np.flatnonzero(active & outside)
                assert actual['allOtherActiveOutsideCount'] == len(ids)
                assert actual['identityMaximumErrorM'] == 0
                endpoint_rows.append({'accessor': accessor, 'target': target, 'necessaryCount': len(necessary), 'activeNecessaryCount': int(active[necessary].sum())})
                for vertex in ids:
                    materials = [g.doc['materials'][p['material']]['name'] for _, _, p in primitives
                        if np.any(np.asarray(g.accessor(p['indices'])) == vertex)]
                    outsiders.append({'accessor': accessor, 'target': target, 'vertex': int(vertex),
                        'positionM': P[vertex].tolist(), 'weight': float(weights(P)[vertex]), 'materials': materials})
        assert len(recorded) == len(endpoint_rows)
        assert source_hash.hexdigest() == gate['allEndpointSourcePointsSha256']
        assert gate['maximumIdentityErrorM'] == 0 and gate['necessaryActiveOutsideCount'] == 0
        assert gate['widthM'] == float(np.float32(high[0]) - np.float32(low[0]))
        assert data['identityBefore']['maximumPointErrorM'] == data['identityAfter']['maximumPointErrorM'] == 0
        rows.append({'sex': sex, 'endpointCount': len(endpoint_rows), 'sourceEndpointHashMatches': True,
            'allOldInputFieldsExact': True, 'tensorAndActualProbeAxesExact': True,
            'necessaryIndicesAndActiveCountsMatch': True, 'necessaryActiveOutsideCount': 0,
            'recordedAllEndpointRestIdentityErrorM': 0, 'widthM': gate['widthM'],
            'necessaryMaterials': necessary_materials, 'endpointReadback': endpoint_rows,
            'retainedOtherActiveOutsideCount': len(outsiders), 'retainedOtherActiveOutside': outsiders})
    result = {'schema': 'head-cage-skin-domain-independent-readback-v1',
        'reviewedRootCommit': 'cd639b1b5b0a91d7ebfa34ba47f2127ff50b9e23',
        'authorCommit': '23d934497d50afa4b21002f551a11d624ab75e1b',
        'oneASTBoundsInputChangeVerified': True, 'storedDiffMatchesActualTransformation': True,
        'cases': rows, 'pins': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p)} for p in sorted(pins)],
        'blenderStarted': False, 'productionAdmitted': False, 'runtimeAccepted': False}
    (OUT / 'readback.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'AST': True, 'cases': [{k: c[k] for k in ['sex', 'endpointCount', 'widthM', 'retainedOtherActiveOutsideCount']} for c in rows]}))


if __name__ == '__main__':
    main()
