"""Thin reuse of frozen native evaluation with explicit semantic protection."""
import ast
import copy
import difflib
import importlib.metadata
import json
from pathlib import Path
import time

import numpy as np

from preflight import BASE, ROOT, imported_common, serializer

common = imported_common()
clean = serializer()


def save(path, value):
    path.write_bytes((json.dumps(clean(value), ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode())


def evaluate_function():
    path = ROOT / 'scripts/m2-head-volume-slim-v1/solve.py'
    tree = ast.parse(path.read_bytes())
    original = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'evaluate')
    node = copy.deepcopy(original)
    filters, schemas = 0, 0
    for item in ast.walk(node):
        if isinstance(item, ast.List) and ast.unparse(item) == "['feature-preservation', 'neck-preservation']":
            item.elts = [ast.Constant('fixed-eye'), ast.Constant('fixed-neck')]
            filters += 1
        if isinstance(item, ast.Constant) and item.value == 'native-head-slim-result-v1':
            item.value = 'semantic-head-attachment-slim-result-v1'
            schemas += 1
    if filters != 1 or schemas != 1:
        raise ValueError('Frozen evaluation source changed')
    namespace = {name: getattr(common, name) for name in ['constraints', 'tetra_metrics', 'interpolate',
        'float32_readback', 'horizontal_sections']}
    namespace.update(np=np, time=time, save=save)
    exec(compile(ast.fix_missing_locations(ast.Module([node], [])), str(path) + ':semantic-adapter', 'exec'), namespace)
    difference = ''.join(difflib.unified_diff(ast.unparse(original).splitlines(True),
        ast.unparse(node).splitlines(True), fromfile='frozen-evaluate', tofile='semantic-evaluate'))
    return namespace['evaluate'], difference


def load():
    execution = json.loads((BASE / 'execution-spec.json').read_bytes())
    for row in execution['inputs']:
        if common.digest(ROOT / row['path']) != row['sha256']:
            raise ValueError('Pinned execution input differs: ' + row['path'])
    method = json.loads((BASE / 'spec.json').read_bytes())
    preflight = json.loads((BASE / 'preflight/report.json').read_bytes())
    if preflight['status'] != 'classification-and-controlled-targets-preflight-passed-no-solve':
        raise ValueError('Exact passed semantic preflight required')
    if preflight['specSha256'] != common.digest(BASE / 'spec.json'):
        raise ValueError('Semantic method/preflight identity differs')
    old_spec, domain, embedding, domain_report, guide, response, records, source = common.load_inputs()
    classification = json.loads((BASE / 'preflight/classification.json').read_bytes())
    labels = classification['endpointRecords']
    if len(labels) != len(records):
        raise ValueError('Semantic endpoint records incomplete')
    semantic_records = []
    for i, (record, label) in enumerate(zip(records, labels, strict=True)):
        for key in ['material', 'mesh', 'primitive', 'endpoint', 'sourceIndices']:
            if label[key] != record[key]:
                raise ValueError('Semantic source record identity differs')
        if label['record'] != i:
            raise ValueError('Semantic record order differs')
        semantic_records.append({**record, 'sourceRole': record['role'], 'role': label['newRole']})
    adapted_domain = {**domain, 'protectedNodes': np.asarray(classification['newProtectedNodes'], np.int64)}
    return execution, method, old_spec, adapted_domain, embedding, domain_report, guide, response, semantic_records, source


def run_case(evaluate, kind, request, method, old_spec, domain, embedding, domain_report,
             guide, response, records, source, out):
    report = evaluate(kind, request, old_spec, domain, embedding, np.asarray(domain_report['rawHeadOriginM']),
        guide, response, records, source, out)
    identifier = 'identity' if kind == 'identity' else request['id']
    candidate = 'male-head-attachment-slim-v1-identity' if kind == 'identity' else request['id'].removesuffix('-v2') + '-attachment-slim-v1'
    trace = report.get('endpointReadbacks', [])
    adaptive = {}
    for row, actual in zip(records, trace):
        if row['role'] == 'adaptive-attachment':
            adaptive[row['material']] = max(adaptive.get(row['material'], 0.), actual['maximumDisplacementM'])
    report.update(id=candidate, sourceRequestId=identifier, methodId='m2-head-attachment-slim-v1',
        methodSpecSha256=common.digest(BASE / 'spec.json'),
        executionSpecSha256=common.digest(BASE / 'execution-spec.json'), source=method['source'],
        classificationSha256=common.digest(BASE / 'preflight/classification.json'),
        sourceEndpointRecords={'path': old_spec['endpointRecords'], 'sha256': common.digest(ROOT / old_spec['endpointRecords'])},
        fixedEndpointRoleMeaning=['fixed-eye', 'fixed-neck'], adaptiveEndpointMaximumDisplacementsM=adaptive,
        adaptiveMaximumEndpointDisplacementM=max(adaptive.values(), default=None),
        adaptiveDisplacementIsNotProtectionPass=True, pending=method['pending'])
    save(out / identifier / 'report.json', report)
    return report
