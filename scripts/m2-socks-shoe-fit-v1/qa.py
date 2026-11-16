"""Candidate self-check. Dense source and prescribed ankle/toe transport, no GPU."""
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
import build


def posed_surface(g, rotations):
    parents = {child: i for i, node in enumerate(g.doc['nodes']) for child in node.get('children', [])}
    worlds = {}
    def world(index):
        if index in worlds:
            return worlds[index]
        node = g.doc['nodes'][index]
        build.require(not any(key in node for key in ['rotation', 'scale', 'matrix']), 'Expected pinned translation-only source nodes')
        local = np.eye(4)
        local[:3, 3] = node.get('translation', [0, 0, 0])
        if node.get('name') in rotations:
            axis, angle = rotations[node['name']]
            c, s = np.cos(angle), np.sin(angle)
            local[:3, :3] = [[1, 0, 0], [0, c, -s], [0, s, c]] if axis == 'X' else [[c, -s, 0], [s, c, 0], [0, 0, 1]]
        worlds[index] = world(parents[index])@local if index in parents else local
        return worlds[index]
    positions, faces = [], []
    for mesh_index, mesh in enumerate(g.doc['meshes']):
        node = next(n for n in g.doc['nodes'] if n.get('mesh') == mesh_index)
        skin = g.doc['skins'][node['skin']]
        inverses = [np.array(m).reshape(4, 4).T for m in g.accessor(skin['inverseBindMatrices'])]
        matrices = [world(joint)@inverse for joint, inverse in zip(skin['joints'], inverses)]
        for p in mesh['primitives']:
            attrs = p['attributes']
            points = np.array(g.accessor(attrs['POSITION']))
            joints = np.array(g.accessor(attrs['JOINTS_0']), dtype=int)
            weights = np.array(g.accessor(attrs['WEIGHTS_0']))
            homogeneous = np.column_stack([points, np.ones(len(points))])
            deformed = np.zeros((len(points), 4))
            for k in range(4):
                transforms = np.array(matrices)[joints[:, k]]
                deformed += np.einsum('nij,nj->ni', transforms, homogeneous)*weights[:, k, None]
            faces.extend(np.array(g.accessor(p['indices']), dtype=int).reshape(-1, 3)+len(positions))
            positions.extend(deformed[:, :3])
    return np.array(positions), np.array(faces, dtype=int)


def main():
    spec = json.loads((build.PACKAGE/'spec.json').read_text(encoding='utf-8'))
    output = build.PACKAGE/'generated'
    results, failures = [], []
    checks = []
    def check(name, passed, details=None):
        row = {'name': name, 'passed': bool(passed)}
        if details is not None:
            row['details'] = details
        checks.append(row)
        if not passed:
            failures.append(row)
    source_hashes = {config[name]: build.sha((build.ROOT/config[name]).read_bytes()) for config in spec['bodies'].values() for name in ['shoePath', 'sockPath', 'bodyPath']}
    for body, config in spec['bodies'].items():
        original = build.read_pinned(config['shoePath'], config['shoeSha256'])
        sock = build.read_pinned(config['sockPath'], config['sockSha256'])
        avatar = build.read_pinned(config['bodyPath'], config['bodySha256'])
        candidate_path = output/(body+'-plain-crew-socks-shoe-fit-v1.glb')
        candidate = build.GLB(candidate_path.read_bytes())
        P, F = build.surface(candidate)
        old, old_faces = build.surface(original)
        delta = P-old
        maximum = float(np.linalg.norm(delta, axis=1).max())
        check(body+' vertex count and topology retained', P.shape == old.shape and np.array_equal(F, old_faces))
        check(body+' bounded local lateral displacement', maximum <= spec['maximumVertexDisplacementM']+1e-8 and np.array_equal(delta[:, 1:], np.zeros_like(delta[:, 1:])))
        protected = old[:, 1] <= old[:, 1].min()+spec['contactProtectedAboveMinimumYM']
        check(body+' protected sole/contact vertices unchanged', np.array_equal(P[protected], old[protected]))
        changed = np.linalg.norm(delta, axis=1) > 1e-8
        check(body+' both feet changed without whole-shoe expansion', np.any(changed & (old[:, 0] < 0)) and np.any(changed & (old[:, 0] > 0)) and changed.sum() < len(P)/3,
              {'changedVertices': int(changed.sum()), 'totalVertices': len(P), 'maximumDisplacementM': maximum})
        old_primitive = original.doc['meshes'][0]['primitives'][0]
        new_primitive = candidate.doc['meshes'][0]['primitives'][0]
        unchanged_attributes = {name: np.array_equal(original.accessor(index), candidate.accessor(new_primitive['attributes'][name])) for name, index in old_primitive['attributes'].items() if name not in ['POSITION', 'NORMAL']}
        check(body+' UV JOINTS and WEIGHTS unchanged', all(unchanged_attributes.values()), unchanged_attributes)
        check(body+' skin IBM bone nodes materials images metadata retained', original.doc['skins'] == candidate.doc['skins'] and original.doc['nodes'] == candidate.doc['nodes'] and original.doc['materials'] == candidate.doc['materials'] and original.doc['images'] == candidate.doc['images'] and original.doc['textures'] == candidate.doc['textures'])
        inverse_index = original.doc['skins'][0]['inverseBindMatrices']
        check(body+' exact IBM accessor retained', original.accessor(inverse_index) == candidate.accessor(inverse_index))
        normals = np.array(candidate.accessor(new_primitive['attributes']['NORMAL']))
        check(body+' transported normals finite and normalized', np.isfinite(normals).all() and np.max(abs(np.linalg.norm(normals, axis=1)-1)) < 1e-5)
        texture_views = [original.doc['bufferViews'][image['bufferView']] for image in original.doc['images']]
        check(body+' embedded image bytes exact', all(original.binary[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']] == candidate.binary[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']] for v in texture_views))
        pairs = []
        for side, raw in [(-1, 'J_Bip_L_Foot'), (1, 'J_Bip_R_Foot')]:
            samples = build.contact_samples((old, F), build.surface(sock), build.surface(avatar, True), side,
                                            build.bind_position(avatar.doc, raw)[1], spec, spec['verificationSpacingM'])
            gaps = build.signed_gaps(P, F, samples, side)
            label = body+(' left' if side < 0 else ' right')
            missed = np.flatnonzero(gaps < spec['restNormalClearanceM']-1e-7)
            check(label+' dense rest target0.5mm', gaps.min() >= spec['restNormalClearanceM']-1e-7,
                  {'minimumSignedNormalGapM': float(gaps.min()), 'belowTargetSamples': len(missed), 'samples': len(gaps),
                   'missedPoints': [{'sockPointM': samples['sockPoints'][i].tolist(), 'shoeTriangle': int(samples['shoeFaces'][i]), 'sockTriangle': int(samples['sockFaces'][i]), 'gapM': float(gaps[i])} for i in missed]})
            check(label+' dense measured rest patch has positive gap', gaps.min() > 0)
            poses = []
            for name, axis, angle, mirror in [('ankle-X-positive', 'X', .35, False), ('ankle-X-negative', 'X', -.35, False), ('ankle-Z-outward', 'Z', .18, True), ('ankle-Z-inward', 'Z', -.18, True), ('toes-X-negative', 'X', -.4, False)]:
                bone = 'ToeBase' if name.startswith('toes') else 'Foot'
                rotations = {f'J_Bip_{s}_{bone}': (axis, angle*(-1 if s == 'R' and mirror else 1)) for s in ['L', 'R']}
                shoe_posed, _ = posed_surface(candidate, rotations)
                sock_posed, sock_faces = posed_surface(sock, rotations)
                moved_samples = dict(samples)
                moved_samples['sockPoints'] = np.sum(sock_posed[sock_faces[samples['sockFaces']]]*samples['sockBarycentric'][..., None], axis=1)
                posed_gaps = build.signed_gaps(shoe_posed, F, moved_samples, side)
                poses.append({'pose': name, 'angleRadians': angle, 'minimumSignedNormalGapM': float(posed_gaps.min()), 'nonPositiveSamples': int((posed_gaps <= 0).sum()), 'finite': bool(np.isfinite(posed_gaps).all())})
                check(label+' '+name+' measured pair gap finite and positive', np.isfinite(posed_gaps).all() and posed_gaps.min() > 0, poses[-1])
            pairs.append({'side': 'left' if side < 0 else 'right', 'restMinimumGapM': float(gaps.min()), 'poses': poses})
        results.append({'body': body, 'candidateSha256': build.sha(candidate_path.read_bytes()), 'sides': pairs})
        repeat = output/'repeat'
        repeat.mkdir(exist_ok=True)
        repeated = build.build_body(body, config, spec, repeat)
        check(body+' same parameters reproduce exact candidate asset', repeated['assetSha256'] == build.sha(candidate_path.read_bytes()))
        for suffix in [body+'-plain-crew-socks-shoe-fit-v1.glb', body+'-entry.json', body+'-fit.json']:
            check(body+' repeat exact '+suffix, (repeat/suffix).read_bytes() == (output/suffix).read_bytes())
            temporary_file = (repeat/suffix).resolve()
            build.require(temporary_file.is_relative_to(output.resolve()), 'Repeat cleanup escaped package')
            temporary_file.unlink()
    (output/'repeat').rmdir()
    final_source_hashes = {config[name]: build.sha((build.ROOT/config[name]).read_bytes()) for config in spec['bodies'].values() for name in ['shoePath', 'sockPath', 'bodyPath']}
    check('pinned original source files unchanged', source_hashes == final_source_hashes)
    report = {'schema': 'm2-socks-shoe-fit-candidate-self-qa-v1', 'status': 'passed-source-self-checks-runtime-pending' if not failures else 'failed-source-acceptance',
              'qaSourceSha256': build.sha(Path(__file__).read_bytes()), 'generatorSha256': build.sha(Path(build.__file__).read_bytes()),
              'checks': checks, 'failures': failures, 'bodies': results, 'sourceHashesBefore': source_hashes, 'sourceHashesAfter': final_source_hashes,
              'limits': ['Candidate authored and checked by the same agent. Independent root review and actual game acceptance remain pending.',
                         'Dense0.25mm source sampling and transported corresponding rest surface pairs only. Not exhaustive collision or a screenshot pose reconstruction.',
                         'No GPU or browser used. No original shoe, sock, Body, public runtime or historical outfit changed.']}
    build.write_json(output/'qa-report.json', report)
    print(json.dumps({'status': report['status'], 'checks': len(checks), 'failures': failures}))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
