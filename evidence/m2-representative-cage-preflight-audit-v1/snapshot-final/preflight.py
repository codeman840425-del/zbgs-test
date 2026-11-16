"""Real Blender modifier gates. Failure stops the eight-request production trial."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-representative-cage-trial-v1'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def encoded(value):
    return (json.dumps(value, indent=2) + '\n').encode()


def input_receipt(spec):
    require(sha(Path(bpy.app.binary_path).read_bytes()) == spec['tool']['sha256'], 'Blender binary SHA mismatch')
    require(bpy.app.version_string.startswith(spec['tool']['version']), 'Blender version mismatch')
    require(bpy.app.build_hash.decode() == spec['tool']['buildHash'], 'Blender build mismatch')
    references = [spec['sourceSpec']] + [s['body'] for s in spec['sources'].values()] + [e for s in spec['sources'].values() for e in s['equipment']]
    rows = []
    for reference in references:
        path = (ROOT / reference['path']).resolve()
        require(path.is_relative_to(ROOT), 'Input escapes root')
        digest = sha(path.read_bytes())
        require(digest == reference['sha256'], 'Pinned input SHA mismatch: ' + reference['path'])
        rows.append({'path': reference['path'], 'sha256': digest})
    paths = list(Path(__file__).parent.glob('*.py')) + [BASE / 'spec.json', ROOT / 'scripts/production/flow.py', ROOT / 'scripts/m2-representative-batch-v1/deform.py']
    return {'inputs': rows, 'producer': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p.read_bytes())} for p in sorted(paths)]}


def mesh_object(name, positions, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(positions.tolist(), [], faces.tolist())
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def coords(obj):
    result = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get('co', result)
    return result.reshape(-1, 3)


def evaluate(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    depsgraph.update()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        result = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
        mesh.vertices.foreach_get('co', result)
        return result.reshape(-1, 3).copy()
    finally:
        evaluated.to_mesh_clear()


def bind(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    with bpy.context.temp_override(object=obj, active_object=obj):
        if modifier.type == 'MESH_DEFORM':
            outcome = bpy.ops.object.meshdeform_bind(modifier=modifier.name)
        else:
            outcome = bpy.ops.object.surfacedeform_bind(modifier=modifier.name)
    obj.select_set(False)
    return sorted(outcome)


def group_records(g):
    groups = {}
    for mesh in g.doc['meshes']:
        for primitive in mesh['primitives']:
            groups.setdefault(primitive['attributes']['POSITION'], []).append(primitive)
    records = []
    for accessor, primitives in groups.items():
        require(len({p['attributes']['NORMAL'] for p in primitives}) == 1, 'POSITION group has different NORMAL sources')
        require(all(p.get('targets', []) == primitives[0].get('targets', []) for p in primitives), 'POSITION group has different morph sources')
        P = np.asarray(g.accessor(accessor), dtype=np.float32)
        F = np.concatenate([g.accessor(p['indices']) for p in primitives]).reshape(-1, 3)
        records.append((accessor, primitives, P, F))
    return records


def cage_geometry(low, high):
    # One closed rectangular cage. Slices are editable shared rest controls.
    # It is a prerequisite fixture, not a claim of eight-preset shape realization.
    positions = []
    for y in np.linspace(low[1], high[1], 17):
        positions.extend([[low[0], y, low[2]], [high[0], y, low[2]],
                          [high[0], y, high[2]], [low[0], y, high[2]]])
    faces = [[0, 1, 2, 3]]
    for ring in range(16):
        for side in range(4):
            a = 4 * ring + side
            b = 4 * ring + (side + 1) % 4
            faces.append([a, a + 4, b + 4, b])
    faces.append([67, 66, 65, 64])
    return np.asarray(positions, dtype=np.float32), faces


def one_source(sex, source, config, output):
    start = time.monotonic()
    g = GLB((ROOT / source['body']['path']).read_bytes())
    row = {'sex': sex, 'source': source['body'], 'gates': [], 'status': 'running'}
    def gate(name, condition, details):
        row['gates'].append({'id': name, 'passed': bool(condition), **details})
        checkpoint()
        require(condition, sex + ': ' + name)
    def checkpoint():
        row['elapsedSeconds'] = time.monotonic() - start
        (output / (sex + '-preflight.json')).write_bytes(encoded(row))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    records = group_records(g)
    endpoints = []
    source_objects = []
    try:
        identity_nodes = all(all(key not in node for key in ['matrix', 'translation', 'rotation', 'scale'])
                             for node in g.doc['nodes'] if 'mesh' in node)
        for accessor, primitives, P, F in records:
            obj = mesh_object(sex + '-source-' + str(accessor), P, F)
            identity = np.array_equal(coords(obj), P)
            topology = [list(p.vertices) for p in obj.data.polygons] == F.tolist()
            gate('source-index-' + str(accessor), identity and topology,
                 {'vertices': len(P), 'triangles': len(F), 'positionSha256': sha(P.tobytes()),
                  'indexSha256': sha(F.astype('<u4').tobytes())})
            source_objects.append((obj, primitives, P))
            endpoints.append(P)
            for target in primitives[0].get('targets', []):
                endpoints.append(P + np.asarray(g.accessor(target['POSITION']), dtype=np.float32))
        all_points = np.concatenate(endpoints)
        low = all_points.min(0) - config['cagePaddingM']
        high = all_points.max(0) + config['cagePaddingM']
        height = float(high[1] - low[1] - 2 * config['cagePaddingM'])
        gate('metre-space-identity', identity_nodes and 1 < height < 2.2,
             {'heightM': height, 'meshNodeIdentity': identity_nodes, 'objectScale': [1, 1, 1],
              'coordinatePolicy': 'Original rest POSITION metre coordinates, no bone/model transform'})
        cage_positions, cage_faces = cage_geometry(low, high)
        cage = mesh_object(sex + '-closed-rest-cage', cage_positions, np.asarray(cage_faces, dtype=object))
        counts = {}
        for face in cage_faces:
            for a, b in zip(face, face[1:] + face[:1]):
                edge = tuple(sorted([a, b]))
                counts[edge] = counts.get(edge, 0) + 1
        margin = float(np.minimum(all_points - low, high - all_points).min())
        gate('closed-cage-all-endpoints', all(n == 2 for n in counts.values()) and margin > 0,
             {'vertices': len(cage_positions), 'faces': len(cage_faces), 'edgeCount': len(counts),
              'minimumBoundaryMarginM': margin, 'pointSamples': len(all_points),
              'endpointArraysIncludingBase': len(endpoints), 'low': low.tolist(), 'high': high.tolist()})
        # Every source group uses the actual official dynamic Mesh Deform.
        for obj, primitives, P in source_objects:
            modifier = obj.modifiers.new('trial-dynamic-mesh-deform', 'MESH_DEFORM')
            modifier.object = cage
            modifier.precision = config['meshDeformPrecision']
            modifier.use_dynamic_bind = True
            result = bind(obj, modifier)
            error = float(np.linalg.norm(evaluate(obj) - P, axis=1).max())
            gate('dynamic-identity-' + obj.name, modifier.is_bound and error <= config['identityToleranceM'],
                 {'bindResult': result, 'isBound': modifier.is_bound, 'maximumErrorM': error})
            targets = primitives[0].get('targets', [])
            if targets:
                target_index = next(i for i, t in enumerate(targets) if np.max(abs(np.asarray(g.accessor(t['POSITION'])))) > 0)
                D = np.asarray(g.accessor(targets[target_index]['POSITION']), dtype=np.float32)
                obj.shape_key_add(name='Basis')
                key = obj.shape_key_add(name='actual-source-endpoint-' + str(target_index))
                key.data.foreach_set('co', (P + D).ravel())
                key.value = 1
                endpoint = evaluate(obj)
                identity_error = float(np.linalg.norm(endpoint - (P + D), axis=1).max())
                shift = np.asarray(config['affineProbeTranslationM'], dtype=np.float32)
                cage.data.vertices.foreach_set('co', (cage_positions + shift).ravel())
                cage.data.update()
                posed = evaluate(obj)
                affine_error = float(np.linalg.norm(posed - endpoint - shift, axis=1).max())
                gate('real-expression-through-dynamic-bind', identity_error <= config['identityToleranceM'] and affine_error <= config['identityToleranceM'],
                     {'targetIndex': target_index, 'sourceDeltaSha256': sha(D.tobytes()),
                      'sourceMaximumDeltaM': float(np.linalg.norm(D, axis=1).max()),
                      'identityEndpointErrorM': identity_error, 'affineProbeErrorM': affine_error,
                      'probeTranslationM': shift.tolist()})
                cage.data.vertices.foreach_set('co', cage_positions.ravel())
                cage.data.update()
                key.value = 0
        # Use actual Body_SKIN only. Exact coincident source positions can be
        # welded in this separate donor. Output/source indices stay intact.
        skin = next(p for mesh in g.doc['meshes'] for p in mesh['primitives']
                    if 'Body_00_SKIN' in g.doc['materials'][p['material']]['name'])
        source_P = np.asarray(g.accessor(skin['attributes']['POSITION']), dtype=np.float32)
        source_F = np.asarray(g.accessor(skin['indices']), dtype=np.int32).reshape(-1, 3)
        referenced = np.unique(source_F)
        unique, inverse = np.unique(source_P[referenced], axis=0, return_inverse=True)
        mapping = np.full(len(source_P), -1, dtype=np.int32)
        mapping[referenced] = inverse
        donor_F = mapping[source_F]
        valid = np.array([len(set(f)) == 3 for f in donor_F])
        require(valid.all(), 'Exact donor weld collapses a source triangle')
        donor = mesh_object(sex + '-immutable-skin-donor', unique, donor_F)
        donor_edges = {}
        for face in donor_F:
            for a, b in zip(face, np.roll(face, -1)):
                edge = tuple(sorted([int(a), int(b)]))
                donor_edges[edge] = donor_edges.get(edge, 0) + 1
        gate('donor-source-correspondence', np.array_equal(unique[donor_F], source_P[source_F]),
             {'sourceTriangles': len(source_F), 'donorVertices': len(unique),
              'sourceIndexToDonorSha256': sha(mapping.astype('<i4').tobytes()),
              'maximumFacesPerEdge': max(donor_edges.values()),
              'boundaryEdges': sum(n == 1 for n in donor_edges.values()),
              'normalPolicy': 'Actual source positions and winding, exact-position weld in donor only'})
        for equipment in source['equipment']:
            garment = GLB((ROOT / equipment['path']).read_bytes())
            for accessor, primitives, P, F in group_records(garment):
                obj = mesh_object(equipment['id'] + '-' + str(accessor), P, F)
                modifier = obj.modifiers.new('trial-official-surface-deform', 'SURFACE_DEFORM')
                modifier.target = donor
                result = bind(obj, modifier)
                error = float(np.linalg.norm(evaluate(obj) - P, axis=1).max())
                gate('surface-bind-' + obj.name, modifier.is_bound and error <= config['identityToleranceM'],
                     {'equipment': equipment, 'bindResult': result, 'isBound': modifier.is_bound,
                      'vertices': len(P), 'maximumIdentityErrorM': error})
        row['status'] = 'preflight-passed-batch-not-started'
    except Exception as error:
        row['status'] = 'failed-stop-before-batch'
        row['failure'] = str(error)
    finally:
        checkpoint()
        bpy.ops.wm.save_as_mainfile(filepath=str(output / (sex + '-preflight.blend')), check_existing=False)
    return row


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    spec = json.loads((BASE / 'spec.json').read_bytes())
    receipt = input_receipt(spec)
    require(bpy.app.version_string.startswith(spec['tool']['version']), 'Blender version mismatch')
    require(bpy.app.build_hash.decode() == spec['tool']['buildHash'], 'Blender build hash mismatch')
    output = args.out.resolve()
    rows = []
    for sex, source in spec['sources'].items():
        rows.append(one_source(sex, source, spec['preflight'], output))
        if rows[-1]['status'].startswith('failed'):
            break
    report = {'schema': 'representative-cage-preflight-v1', 'blenderVersion': bpy.app.version_string,
              'blenderBuildHash': bpy.app.build_hash.decode(), 'blenderPython': sys.version,
              'numpyVersion': np.__version__, 'sources': rows,
              'status': 'failed-stop-before-batch' if any(r['status'].startswith('failed') for r in rows) else 'preflight-passed',
              'receipt': receipt, 'eightRequestBatchStarted': False, 'runtimeAccepted': False}
    (output / 'preflight.json').write_bytes(encoded(report))
    print(json.dumps(report), flush=True)
    require(report['status'] == 'preflight-passed', 'Actual modifier prerequisites failed. Batch stopped.')


if __name__ == '__main__':
    main()
