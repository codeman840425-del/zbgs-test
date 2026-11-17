"""One bounds-domain correction, then the frozen response-only sampler."""
import argparse
import ast
import copy
import difflib
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-head-cage-skin-domain-v1'
path = ROOT / 'scripts/m2-head-cage-response-probe-v1/probe.py'
module = importlib.util.spec_from_file_location('frozen_response_probe', path)
prior = importlib.util.module_from_spec(module)
module.loader.exec_module(prior)
np, io, bpy, require = prior.np, prior.io, prior.bpy, prior.require
OriginalHead = prior.Head


class SkinDomainHead(OriginalHead):
    def domain_endpoints(self, primitives, ends):
        selected = []
        for primitive in primitives:
            name = self.g.doc['materials'][primitive['material']]['name']
            if any(token in name for token in self.setup['boundsDomainMaterialTokens']):
                selected.extend(np.asarray(self.g.accessor(primitive['indices']), int).ravel().tolist())
        ids = np.unique(selected).astype(int)
        return [points[ids] for points in ends] if len(ids) else []


def corrected_constructor():
    source = (ROOT / 'scripts/m2-representative-head-cage-v1/head.py').read_text()
    tree = ast.parse(source)
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Head')
    init = copy.deepcopy(next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == '__init__'))
    original = ast.unparse(init)
    replacements = 0
    for node in ast.walk(init):
        if isinstance(node, ast.Call) and ast.unparse(node) == 'all_endpoints.extend(ends)':
            node.args = [ast.parse('self.domain_endpoints(primitives, ends)', mode='eval').body]
            replacements += 1
    require(replacements == 1, 'Original bounds branch changed')
    corrected = ast.unparse(init)
    namespace = dict(prior.original.__dict__)
    exec(compile(ast.fix_missing_locations(ast.Module([init], [])), 'skin-domain-only', 'exec'), namespace)
    SkinDomainHead.__init__ = namespace['__init__']
    return ''.join(difflib.unified_diff(original.splitlines(True), corrected.splitlines(True),
        fromfile='original-Head.__init__', tofile='skin-domain-Head.__init__'))


def prerequisite(head):
    rows, maximum, outside_count = [], 0., 0
    low, high = head.rest.min(0), head.rest.max(0)
    source_hash = hashlib.sha256()
    for accessor, primitives, points, _ in head.records:
        ends = [points] + [points + np.asarray(head.g.accessor(t['POSITION']))
            for t in primitives[0].get('targets', [])]
        necessary = []
        for primitive in primitives:
            name = head.g.doc['materials'][primitive['material']]['name']
            if any(token in name for token in head.setup['boundsDomainMaterialTokens']):
                necessary.extend(np.asarray(head.g.accessor(primitive['indices']), int).ravel())
        ids = np.unique(necessary).astype(int)
        for target, P in enumerate(ends, -1):
            source_hash.update(np.asarray(P, dtype='<f8').tobytes())
            Q = head.evaluate(accessor, P)
            error = float(abs(Q - P).max())
            maximum = max(maximum, error)
            active = head.weights(P) > 0
            outside = np.any((P < low) | (P > high), axis=1)
            required_outside = ids[active[ids] & outside[ids]]
            outside_count += len(required_outside)
            rows.append({'accessor': accessor, 'target': target, 'pointCount': len(P),
                'necessaryReferencedCount': len(ids), 'activeNecessaryCount': int(active[ids].sum()),
                'activeNecessaryOutside': required_outside.tolist(),
                'allOtherActiveOutsideCount': int((active & outside).sum()) - len(required_outside),
                'identityMaximumErrorM': error})
    require(outside_count == 0, 'Necessary active endpoint outside skin-domain cage')
    require(maximum <= head.setup['identityToleranceM'], 'Full original endpoint identity failed')
    return {'status': 'identity-and-necessary-coverage-passed', 'boundsM': [low.tolist(), high.tolist()],
        'widthM': float(high[0] - low[0]), 'allEndpointSourcePointsSha256': source_hash.hexdigest(),
        'maximumIdentityErrorM': maximum, 'necessaryActiveOutsideCount': outside_count, 'endpoints': rows,
        'includedMaterialTokens': head.setup['boundsDomainMaterialTokens'],
        'excludedClothingStillPresent': True, 'sourceGeometryMutated': False,
        'otherActiveOutsideMeaning': 'Retained source clothes/other roles are not required head-boundary inputs. No deformed clothing output is generated; existing body-donor adaptation and runtime source-clothes policy are unchanged.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    spec = json.loads((BASE / 'spec.json').read_bytes())
    result = {'schema': 'head-cage-skin-domain-manifest-v1', 'cases': [],
        'productionAdmitted': False, 'runtimeAccepted': False, 'shapeSolveCalled': False, 'characterExported': False}
    try:
        require(bpy.app.build_hash.decode() == spec['tool']['buildHash'], 'Actual Blender build differs')
        refs = spec['sourcePins'] + [spec['parentSpec']] + list(spec['sources'].values())
        for row in refs:
            require(io.sha((ROOT / row['path']).read_bytes()) == row['sha256'], 'Input changed: ' + row['path'])
        diff = corrected_constructor()
        (args.out / 'bounds-only.diff').write_bytes(diff.encode())
        response, targets, ast_sha = prior.extracted_functions()
        setup = {**spec['setup'], 'boundsDomainMaterialTokens': spec['boundsDomainMaterialTokens']}
        sample_spec = {**spec, 'setup': setup}
        # Frozen sampler constructs this class. Gate each real object before its first probe.
        receipts = []
        class GatedHead(SkinDomainHead):
            def __init__(self, g, setup):
                super().__init__(g, setup)
                receipts.append(prerequisite(self))
        prior.Head = GatedHead
        result.update(inputs=refs, tool=spec['tool'], extractedAstSha256=ast_sha,
            constructorDiffSha256=io.sha(diff.encode()), numpyVersion=np.__version__, blenderPython=sys.version)
        for sex, source in spec['sources'].items():
            data = prior.sample(sex, source, [r for r in spec['requests'] if r['sex'] == sex], sample_spec, response, targets)
            data.update(schema='head-cage-skin-domain-response-v1', domainPrerequisite=receipts[-1], productionAdmitted=False)
            output = args.out / (sex + '.json')
            output.write_bytes(io.encoded(data))
            result['cases'].append({'sex': sex, 'path': output.relative_to(ROOT).as_posix(),
                'sha256': io.sha(output.read_bytes()), 'bytes': output.stat().st_size})
            print(json.dumps({'sex': sex, 'widthM': receipts[-1]['widthM'], 'identityM': receipts[-1]['maximumIdentityErrorM']}), flush=True)
        result['status'] = 'response-only-complete-not-production'
    except Exception as error:
        result.update(status='failed-no-retry', error=str(error))
        raise
    finally:
        (args.out / 'manifest.json').write_bytes(io.encoded(result))
