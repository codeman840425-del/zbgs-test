"""Fixed source-band input and reused official-SLIM evaluation adapter."""
import ast
import copy
import importlib.util
import json
from pathlib import Path
import time
from types import SimpleNamespace

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-head-surface-band-slim-v1'
old_preflight_path = ROOT / 'scripts/m2-head-attachment-slim-v1/preflight.py'
loader = importlib.util.spec_from_file_location('frozen_attachment_preflight_helpers', old_preflight_path)
helpers = importlib.util.module_from_spec(loader)
loader.loader.exec_module(helpers)
common, clean = helpers.imported_common(), helpers.serializer()


def save(path, value):
    path.write_bytes((json.dumps(clean(value), ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode())


def requested_function(source, response, source_reader):
    """Extract only original target construction, excluding response and solve."""
    path = ROOT / 'scripts/m2-representative-head-cage-v1/head.py'
    tree = ast.parse(path.read_bytes())
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Head')
    fit = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'fit')
    end = next(i for i, n in enumerate(fit.body) if isinstance(n, ast.Assign)
        and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'cage')
    node = copy.deepcopy(fit)
    node.name = 'requested_points'
    node.body = copy.deepcopy(fit.body[2:end]) + [ast.Return(ast.Name('target', ast.Load()))]
    namespace = {'np': np, 'legacy': source_reader}
    exec(compile(ast.fix_missing_locations(ast.Module([node], [])), str(path) + ':targets-only', 'exec'), namespace)
    P, F = np.asarray(response['sourcePointsM']), np.asarray(response['sourceFaceTriangles'], int)
    origin = np.asarray(response['rawHeadRestOriginM'])
    properties = {'H': origin, 'face_lo': float(P[np.unique(F), 1].min() - origin[1]),
        'context': source_reader.source_context(source)}
    def requested(points, parameters):
        return namespace['requested_points'](SimpleNamespace(**properties, landmark_source=np.asarray(points)), parameters)
    return requested, ast.dump(node)


def reused_functions():
    """Reuse prior two-role evaluation and case wrapper, with new identities."""
    path = ROOT / 'scripts/m2-head-attachment-slim-v1/adapter.py'
    tree = ast.parse(path.read_bytes())
    selected = [copy.deepcopy(next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name))
        for name in ['evaluate_function', 'run_case']]
    replacements = {'semantic-head-attachment-slim-result-v1': 'surface-band-head-slim-result-v1',
        'male-head-attachment-slim-v1-identity': 'male-head-surface-band-slim-v1-identity',
        '-attachment-slim-v1': '-surface-band-slim-v1', 'm2-head-attachment-slim-v1': 'm2-head-surface-band-slim-v1'}
    for node in selected:
        for item in ast.walk(node):
            if isinstance(item, ast.Constant) and isinstance(item.value, str) and item.value in replacements:
                item.value = replacements[item.value]
            if isinstance(item, ast.Call) and ast.unparse(item) == "common.digest(BASE / 'preflight/classification.json')":
                item.args = [ast.parse("ROOT / method['classification']", mode='eval').body]
    import difflib
    namespace = {'ROOT': ROOT, 'BASE': BASE, 'ast': ast, 'copy': copy, 'difflib': difflib,
        'np': np, 'time': time, 'save': save, 'common': common}
    exec(compile(ast.fix_missing_locations(ast.Module(selected, [])), str(path) + ':band-identity-adapter', 'exec'), namespace)
    return namespace['evaluate_function'], namespace['run_case']


def load():
    method = json.loads((BASE / 'spec.json').read_bytes())
    for row in method['inputs']:
        if common.digest(ROOT / row['path']) != row['sha256']:
            raise ValueError('Band input identity differs: ' + row['path'])
    old_spec, domain, embedding, domain_report, guide, response, records, source = common.load_inputs()
    classification = json.loads((ROOT / method['classification']).read_bytes())
    labels = classification['endpointRecords']
    if len(labels) != len(records):
        raise ValueError('Semantic source records incomplete')
    semantic = []
    for i, (row, label) in enumerate(zip(records, labels, strict=True)):
        if label['record'] != i or any(label[key] != row[key] for key in ['mesh', 'primitive', 'material', 'endpoint', 'sourceIndices']):
            raise ValueError('Original endpoint semantic identity differs')
        semantic.append({**row, 'sourceRole': row['role'], 'role': label['newRole']})
    adapted = {**domain, 'protectedNodes': np.asarray(classification['newProtectedNodes'], np.int64)}
    return method, old_spec, adapted, embedding, domain_report, guide, response, semantic, source
