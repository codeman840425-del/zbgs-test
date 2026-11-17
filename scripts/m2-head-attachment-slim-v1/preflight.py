"""Exact material/node reclassification and controlled-tet target readback only."""
import ast
import importlib.util
import json
import math
from pathlib import Path
import sys

import numpy as np

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-head-attachment-slim-v1'


def imported_common():
    path = ROOT / 'scripts/m2-head-volume-slim-v1/common.py'
    loader = importlib.util.spec_from_file_location('fixed_native_head_readback', path)
    module = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(module)
    return module


def serializer():
    path = ROOT / 'scripts/m2-head-volume-slim-v1/recover_readback.py'
    tree = ast.parse(path.read_bytes())
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'serializable')
    namespace = {'np': np, 'math': math}
    exec(compile(ast.Module([node], []), str(path) + ':serializable-only', 'exec'), namespace)
    return namespace['serializable']


def endpoint_names(source, row):
    if row['endpoint'] == -1:
        return ['source mesh base']
    mesh = source.doc['meshes'][row['mesh']]
    labels = []
    names = mesh.get('extras', {}).get('targetNames', [])
    if row['endpoint'] < len(names):
        labels.append(names[row['endpoint']])
    groups = source.doc.get('extensions', {}).get('VRM', {}).get('blendShapeMaster', {}).get('blendShapeGroups', [])
    for group in groups:
        if any(bind['mesh'] == row['mesh'] and bind['index'] == row['endpoint'] for bind in group.get('binds', [])):
            labels.append(group.get('name', group.get('presetName', 'unnamed expression')))
    return sorted(set(labels))


if __name__ == '__main__':
    common = imported_common()
    clean = serializer()
    spec = json.loads((BASE / 'spec.json').read_bytes())
    for row in spec['inputs']:
        if common.digest(ROOT / row['path']) != row['sha256']:
            raise ValueError('Pinned dependency changed: ' + row['path'])
    out = BASE / 'preflight'
    if out.exists():
        raise ValueError('Preserve first classification/preflight. Output already exists.')
    out.mkdir()
    result = {'schema': 'semantic-head-attachment-preflight-v1', 'status': 'checking',
        'solverCalled': False, 'characterExported': False, 'runtimeAccepted': False,
        'specSha256': common.digest(BASE / 'spec.json'), 'scriptSha256': common.digest(Path(__file__)),
        'consumedInputs': spec['inputs'], 'cases': []}
    def save(name, value):
        (out / name).write_bytes((json.dumps(clean(value), ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode())
    try:
        old_spec, domain, embedding, domain_report, guide, response, records, source = common.load_inputs()
        common.input_checks(domain, embedding, guide, records, source, spec['toleranceM'])
        nodes, tets = domain['nodesM'], domain['tetrahedra']
        by_coordinate = {tuple(point): i for i, point in enumerate(nodes)}
        if len(by_coordinate) != len(nodes):
            raise ValueError('Domain contains conflicting duplicate source coordinates')
        fixed, adaptive, old_feature, node_provenance, table = set(), set(), set(), {}, []
        endpoint_rows = []
        for ri, row in enumerate(records):
            material = row['material']
            category = 'fixed-neck' if row['role'] == 'neck-preservation' else spec['materialRoles'][material]
            if row['role'] == 'neck-preservation' and material != spec['neckMaterial']:
                raise ValueError('Unexpected neck-preservation material')
            primitive = source.doc['meshes'][row['mesh']]['primitives'][row['primitive']]
            name = source.doc['materials'][primitive['material']]['name']
            if name != material:
                raise ValueError('Source material identity differs from endpoint record')
            points = domain['sourceEndpointsM'][row['offset']:row['offset'] + row['count']]
            selected_nodes = []
            if category in ['fixed-eye', 'fixed-neck', 'adaptive-attachment']:
                for local, point in enumerate(points):
                    coordinate = tuple(point)
                    if coordinate not in by_coordinate:
                        raise ValueError(f'Native source endpoint missing from domain: {ri}/{local}')
                    index = by_coordinate[coordinate]
                    selected_nodes.append(index)
                    provenance = {'record': ri, 'mesh': row['mesh'], 'primitive': row['primitive'],
                        'positionAccessor': row['positionAccessor'], 'sourceVertex': row['sourceIndices'][local],
                        'endpoint': row['endpoint'], 'material': material, 'newRole': category}
                    node_provenance.setdefault(index, []).append(provenance)
                selected = set(selected_nodes)
                old_feature |= selected
                if category == 'adaptive-attachment':
                    adaptive |= selected
                else:
                    fixed |= selected
            endpoint_rows.append({'record': ri, 'mesh': row['mesh'], 'primitive': row['primitive'],
                'material': material, 'oldRole': row['role'], 'newRole': category,
                'endpoint': row['endpoint'], 'endpointNames': endpoint_names(source, row),
                'sourceIndices': row['sourceIndices'], 'domainNodesInSourceIndexOrder': selected_nodes,
                'sourceCoordinateMeaning': 'Exact original base or P+original morph delta, metres',
                'count': row['count']})
        if old_feature != set(domain['protectedNodes'].tolist()):
            raise ValueError('Exact old protected source/endpoint node coverage differs')
        for material, category in spec['materialRoles'].items():
            material_rows = [row for row in endpoint_rows if row['material'] == material and row['newRole'] != 'fixed-neck']
            if not material_rows:
                raise ValueError('Declared semantic material missing: ' + material)
            primitive = source.doc['meshes'][material_rows[0]['mesh']]['primitives'][material_rows[0]['primitive']]
            expected = set(range(-1, len(primitive.get('targets', []))))
            if {row['endpoint'] for row in material_rows} != expected:
                raise ValueError('Material endpoint coverage incomplete: ' + material)
            selected_nodes = sorted({i for row in material_rows for i in row['domainNodesInSourceIndexOrder']})
            table.append({'material': material, 'oldRole': material_rows[0]['oldRole'], 'newRole': category,
                'endpointRecords': len(material_rows), 'actualNodes': selected_nodes, 'uniqueNodes': len(selected_nodes)})
        new_protected = np.asarray(sorted(fixed), np.int64)
        # Shared exact coordinates cannot be independently moved. Retained protection wins.
        shared = sorted(fixed & adaptive)
        adapter_domain = {**domain, 'protectedNodes': new_protected}
        save('classification.json', {'schema': 'semantic-head-attachment-classification-v1',
            'source': old_spec['source'], 'table': table, 'endpointRecords': endpoint_rows,
            'oldProtectedNodes': domain['protectedNodes'].tolist(), 'newProtectedNodes': new_protected.tolist(),
            'adaptiveNodes': sorted(adaptive), 'releasedOldProtectedNodes': sorted(old_feature - fixed),
            'sharedAdaptiveRetainedProtectedNodes': shared,
            'coincidentSourceRule': 'Retained fixed eye/neck identity wins. Same G cannot independently move coincident points.',
            'nodeSourceProvenance': [{'node': i, 'sourcePositionM': nodes[i].tolist(), 'origins': origins}
                for i, origins in sorted(node_provenance.items())]})
        np.savez_compressed(out / 'classification-nodes.npz', oldProtectedNodes=domain['protectedNodes'],
            newProtectedNodes=new_protected, adaptiveNodes=np.asarray(sorted(adaptive), np.int64),
            sharedRetainedProtectedNodes=np.asarray(shared, np.int64))
        result.update(oldProtectedNodes=len(old_feature), newProtectedNodes=len(fixed),
            adaptiveNodes=len(adaptive), releasedOldProtectedNodes=len(old_feature - fixed),
            sharedAdaptiveRetainedProtectedNodes=len(shared), coordinateMergesChanged=False,
            referenceNodesAndTetsChanged=False)
        for identifier in spec['requests']:
            request = next(row for row in guide['cases'] if row['id'] == identifier)
            b, bc, roles, duplicates = common.constraints(adapter_domain, np.asarray(request['requestedVertexPointsM']))
            target = nodes.copy()
            target[b] = bc
            controlled = np.isin(tets, b).all(axis=1)
            ids = np.flatnonzero(controlled)
            if len(ids):
                metrics, J, determinants = common.tetra_metrics(nodes, target, tets[ids], b, bc, spec['softP'])
                failures = ids[np.flatnonzero(~np.isfinite(determinants) | (determinants <= spec['minimumDeterminant']))]
                minimum = float(determinants.min())
            else:
                J, determinants, failures, minimum = np.empty((0, 3, 3)), np.empty(0), np.empty(0, int), None
            np.savez_compressed(out / (identifier + '-controlled-targets.npz'), constraintIndices=b,
                constraintTargetsM=bc, controlledTetIndices=ids, targetJacobians=J, targetDeterminants=determinants)
            failed_details = [{'tet': int(i), 'nodes': tets[i].tolist(),
                'nodeProvenance': [node_provenance.get(int(n), []) for n in tets[i]]} for i in failures]
            case = {'id': identifier, 'newCandidateId': request['id'].removesuffix('-v2') + '-attachment-slim-v1',
                'nativeRequestUnchanged': request, 'uniqueSoftControls': len(b), 'freeNodes': len(nodes) - len(b),
                'duplicateTargets': duplicates, 'fullyControlledTetCount': len(ids),
                'minimumFullyControlledTargetDeterminant': minimum, 'failedTargetTetIndices': failures.tolist(),
                'failedTetSourceDetails': failed_details, 'preflightPassed': len(failures) == 0,
                'meaning': 'Exact positions of all four controlled nodes only. Does not certify unconstrained tets, soft-solver outcome or 101-section intent.'}
            result['cases'].append(case)
        if 'igl' in sys.modules or any(name.startswith('igl.') for name in sys.modules):
            raise ValueError('Classification preflight unexpectedly imported solver')
        result['status'] = 'classification-and-controlled-targets-preflight-passed-no-solve' if all(
            row['preflightPassed'] for row in result['cases']) else 'controlled-targets-failed-no-solve'
        result['pending'] = spec['pending']
    except Exception as error:
        result.update(status='preflight-failed-no-solve', error=f'{type(error).__name__}: {error}')
        raise
    finally:
        save('report.json', result)
    print(json.dumps(clean({key: result[key] for key in ['status', 'oldProtectedNodes', 'newProtectedNodes',
        'adaptiveNodes', 'releasedOldProtectedNodes', 'sharedAdaptiveRetainedProtectedNodes']})))
