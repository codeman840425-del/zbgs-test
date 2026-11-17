"""One Qhull volume/embedding preflight; no shape solver or character export."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-head-volume-domain-v1'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.write_bytes((json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode())


def worker():
    import numpy as np
    import scipy
    from scipy.spatial import Delaunay

    spec = json.loads((BASE / 'spec.json').read_bytes())
    out = BASE / 'generated'
    report = {'schema': 'head-volume-domain-preflight-v1', 'status': 'running',
              'shapeSolved': False, 'characterExported': False, 'runtimeAccepted': False,
              'numpy': np.__version__, 'scipy': scipy.__version__, 'stages': []}
    started = time.monotonic()
    try:
        for source in spec['inputs']:
            if digest(ROOT / source['path']) != source['sha256']:
                raise ValueError('Input identity differs: ' + source['path'])
        if np.__version__ != spec['numpy'] or scipy.__version__ != spec['scipy']:
            raise ValueError('Numeric dependency identity differs')
        loader = importlib.util.spec_from_file_location('domain_source', ROOT / spec['sourceReader'])
        legacy = importlib.util.module_from_spec(loader)
        loader.loader.exec_module(legacy)
        g = legacy.GLB((ROOT / spec['source']['path']).read_bytes())
        context = legacy.source_context(g)
        neck_y = float(context['joints']['neck'][1] - spec['neckBelowM'])
        head = np.asarray(context['joints']['head'], float)
        response = json.loads((ROOT / spec['response']).read_bytes())
        guide_indices = np.asarray(sorted({i for row in response['landmarks'] for i in (row['a'], row['b'])}), int)
        guide_points = np.asarray(response['sourcePointsM'])[guide_indices]
        base_sets, protected_sets, endpoint_sets, records, needed_sets, body_records = [], [], [], [], [], []
        offset = 0
        def add_record(mi, pi, material, accessor, ei, ids, Q, role):
            nonlocal offset
            endpoint_sets.append(Q)
            records.append({'mesh': mi, 'primitive': pi, 'material': material,
                            'positionAccessor': accessor, 'endpoint': ei - 1, 'offset': offset,
                            'count': len(ids), 'sourceIndices': ids.tolist(), 'role': role})
            offset += len(ids)
        for mi, mesh in enumerate(g.doc['meshes']):
            for pi, p in enumerate(mesh['primitives']):
                material = g.doc['materials'][p['material']]['name']
                is_head = any(token in material for token in ['Face_00_SKIN', 'FaceMouth', 'FaceBrow'])
                protect = any(token in material for token in ['_EYE', 'Eyeline', 'Eyelash', 'HAIR'])
                is_body = 'Body_00_SKIN' in material
                if not (is_head or is_body or protect):
                    continue
                P = np.asarray(g.accessor(p['attributes']['POSITION']), float)
                original_ids = np.unique(g.accessor(p['indices'])).astype(int)
                ends = [P] + [P + np.asarray(g.accessor(t['POSITION']), float) for t in p.get('targets', [])]
                for ei, E in enumerate(ends):
                    ids = original_ids
                    if is_body:
                        body_records.append((mi, pi, material, p['attributes']['POSITION'], ei, ids, E[ids]))
                        ids = ids[E[ids, 1] >= neck_y]
                    if not len(ids):
                        continue
                    Q = E[ids]
                    if is_head or is_body:
                        needed_sets.append(Q)
                        if ei == 0:
                            base_sets.append(Q)
                    if protect:
                        protected_sets.append(Q)
                    add_record(mi, pi, material, p['attributes']['POSITION'], ei, ids, Q,
                               'feature-preservation' if protect else 'required-head-endpoint')
        needed = np.concatenate(needed_sets)
        low = needed.min(0) - spec['paddingM']
        high = needed.max(0) + spec['paddingM']
        protected = np.unique(np.concatenate(protected_sets), axis=0)
        inside = np.all((protected >= low) & (protected <= high), axis=1)
        if not inside.all():
            raise ValueError('Reviewed source expected all protected points inside; source selection mismatch')
        neck_sets = []
        for mi, pi, material, accessor, ei, ids, Q in body_records:
            mask = (Q[:, 1] <= neck_y) & np.all((Q >= low) & (Q <= high), axis=1)
            if mask.any():
                neck_sets.append(Q[mask])
                add_record(mi, pi, material, accessor, ei, ids[mask], Q[mask], 'neck-preservation')
        neck = np.unique(np.concatenate(neck_sets), axis=0)
        protected = np.unique(np.concatenate([protected, neck]), axis=0)
        endpoints = np.concatenate(endpoint_sets)
        frame = np.asarray([[x, y, z] for x in [low[0], high[0]] for y in [low[1], high[1]] for z in [low[2], high[2]]])
        controls = np.concatenate([guide_points, protected, frame])
        raw = np.concatenate([controls, *base_sets])
        nodes, inverse = np.unique(raw, axis=0, return_inverse=True)
        plan = json.loads((ROOT / spec['pointPlan']).read_bytes())
        planned = next(row for row in plan['sexes'] if row['sex'] == spec['sex'])
        if len(nodes) != planned['exactUniqueNodeCount'] or not np.array_equal(low, planned['boundsLowM']) or not np.array_equal(high, planned['boundsHighM']):
            raise ValueError('Point selection differs from independently reviewed domain plan')
        control_nodes = inverse[:len(controls)]
        guide_nodes = control_nodes[:len(guide_points)]
        protected_nodes = control_nodes[len(guide_points):len(guide_points) + len(protected)]
        frame_nodes = control_nodes[-8:]
        scale = float(np.ptp(nodes, axis=0).max())
        normalized = (nodes - head) / scale
        report.update(source=spec['source'], rawHeadOriginM=head.tolist(), neckYMetres=neck_y,
                      pointRule=spec['pointRule'], sourceEndpointOccurrences=len(endpoints),
                      nodes=len(nodes), guideNodes=len(guide_nodes), protectedNodes=len(protected_nodes),
                      exactDuplicateMergeOnly=True, randomJoggle=False, normalizationScaleM=scale,
                      boundsM=[low.tolist(), high.tolist()])
        save(out / 'endpoint-records.json', records)
        report['stages'].append('source-selection-complete')
        save(out / 'report.json', report)
        tri = Delaunay(normalized, qhull_options=spec['qhullOptions'])
        T = tri.simplices.copy()
        used = np.unique(T)
        missing = np.setdiff1d(np.unique(control_nodes), used)
        edges = np.transpose(nodes[T[:, 1:]] - nodes[T[:, :1]], (0, 2, 1))
        determinant = np.linalg.det(edges)
        negative = determinant < 0
        T[negative, 1], T[negative, 2] = T[negative, 2].copy(), T[negative, 1].copy()
        singular = (~np.isfinite(determinant)) | (determinant == 0)
        report.update(tetrahedra=len(T), coplanarOmitted=tri.coplanar.tolist(),
                      missingControlNodes=missing.tolist(), missingControlPositionsM=nodes[missing].tolist(),
                      degenerateTetIndices=np.flatnonzero(singular).tolist(),
                      minimumAbsoluteVolumeM3=float(abs(determinant).min() / 6),
                      negativeOrientationReordered=int(negative.sum()))
        np.savez_compressed(out / 'domain.npz', nodesM=nodes, tetrahedra=T, sourceEndpointsM=endpoints,
                            guideSourceIndices=guide_indices, guideNodes=guide_nodes,
                            protectedNodes=protected_nodes, frameNodes=frame_nodes,
                            sourceOccurrenceToNode=inverse)
        report['stages'].append('delaunay-complete')
        save(out / 'report.json', report)
        if missing.size or singular.any():
            raise ValueError('Native controls omitted or exact-zero/nonfinite tetrahedra: do not solve')
        condition = np.linalg.cond(edges)
        report['conditionQuantiles'] = dict(zip(['min', 'p50', 'p95', 'p99', 'max'], np.quantile(condition, [0, .5, .95, .99, 1]).tolist()))
        simplex = tri.find_simplex((endpoints - head) / scale)
        outside = np.flatnonzero(simplex < 0)
        report['outsideEndpointOccurrences'] = outside.tolist()
        if outside.size:
            raise ValueError('Required endpoint outside volume')
        x = (endpoints - head) / scale
        transform = tri.transform[simplex]
        b3 = np.einsum('nij,nj->ni', transform[:, :3], x - transform[:, 3])
        bary = np.column_stack([b3, 1 - b3.sum(1)])
        original_order = tri.simplices[simplex]
        identity = np.einsum('ni,nij->nj', bary, nodes[original_order])
        A = np.asarray(spec['affineMatrix'])
        b = np.asarray(spec['affineTranslationM'])
        mapped_nodes = nodes @ A.T + b
        actual = np.einsum('ni,nij->nj', bary, mapped_nodes[original_order])
        expected = endpoints @ A.T + b
        identity_error = np.linalg.norm(identity - endpoints, axis=1)
        affine_error = np.linalg.norm(actual - expected, axis=1)
        finite = bool(np.isfinite(bary).all() and np.isfinite(condition).all())
        report.update(identityMaximumErrorM=float(identity_error.max()), affineMaximumErrorM=float(affine_error.max()),
                      minimumBarycentric=float(bary.min()), finite=finite,
                      affineMeaning='Interpolation mathematics only; not an admissible character or feature-preservation pose')
        np.savez_compressed(out / 'embedding.npz', simplexVertexIndices=original_order, barycentric=bary,
                            identityErrorM=identity_error, affineErrorM=affine_error)
        if not finite or max(identity_error.max(), affine_error.max()) > spec['toleranceM']:
            raise ValueError('Identity/affine embedding precision failed')
        report['status'] = 'volume-embedding-preflight-passed-not-a-shape'
        report['stages'].append('identity-affine-complete')
    except Exception as error:
        report.update(status='preflight-failed-no-shape-solve', error=f'{type(error).__name__}: {error}')
        raise
    finally:
        report['seconds'] = time.monotonic() - started
        save(out / 'report.json', report)
    print(json.dumps({k: report[k] for k in ['status', 'nodes', 'tetrahedra', 'seconds', 'identityMaximumErrorM', 'affineMaximumErrorM']}))


def main():
    import psutil
    out = BASE / 'generated'
    out.mkdir(parents=True, exist_ok=False)
    python = ROOT / 'experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe'
    spec = json.loads((BASE / 'spec.json').read_bytes())
    start, peak, stop = time.monotonic(), 0, None
    with (out / 'execution.txt').open('wb') as log:
        p = subprocess.Popen([str(python), '-B', str(Path(__file__).resolve()), '--worker'], stdout=log, stderr=subprocess.STDOUT,
                             env={**os.environ, 'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2', 'MKL_NUM_THREADS': '2'})
        root = psutil.Process(p.pid)
        while p.poll() is None:
            processes = [root]
            try:
                processes += root.children(recursive=True)
            except psutil.NoSuchProcess:
                pass
            rss = 0
            for process in processes:
                try:
                    rss += process.memory_info().rss
                except psutil.NoSuchProcess:
                    pass
            peak = max(peak, rss)
            if rss > spec['maxRssBytes'] or time.monotonic() - start > spec['maxSeconds']:
                stop = 'time-or-process-tree-memory-budget'
                for process in reversed(processes):
                    try:
                        process.kill()
                    except psutil.NoSuchProcess:
                        pass
                break
            time.sleep(.1)
        code = p.wait(timeout=15)
    receipt = {'schema': 'head-domain-run-v1', 'exitCode': code, 'stop': stop, 'seconds': time.monotonic() - start,
               'peakSampledProcessTreeRssBytes': peak, 'sampleIntervalSeconds': .1,
               'specSha256': digest(BASE / 'spec.json'), 'scriptSha256': digest(Path(__file__)),
               'samplingLimit': 'Sampled sum of process-tree RSS, not guaranteed instantaneous peak; shared pages may be double counted.'}
    save(out / 'run-report.json', receipt)
    print(json.dumps(receipt))
    raise SystemExit(code if code else (2 if stop else 0))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--worker', action='store_true')
    args = parser.parse_args()
    worker() if args.worker else main()
