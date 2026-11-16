"""Prove exact upper-body dependency equality before deriving a forearm profile."""
import copy
import importlib.util
import json
import re
import textwrap
import numpy as np
import build
from flow import require


def write_profile(path, value):
    # Long source index arrays retain readable rows without one index per line.
    text = json.dumps(value, ensure_ascii=False, indent=2)
    def rows(match):
        values = json.loads(match.group(0)); indent = ' '*(len(match.group(1))+2)
        contents = ', '.join(json.dumps(v) for v in values)
        return '[\n'+textwrap.fill(contents, width=110, initial_indent=indent, subsequent_indent=indent)+'\n'+match.group(1)+']'
    text = re.sub(r'\[\n(?:(?: +)-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?,?\n)+( *)\]', rows, text)
    path.write_bytes((text+'\n').encode())


def binds(g):
    return {g.doc['nodes'][joint]['name']: inverse for skin in g.doc['skins']
            for joint, inverse in zip(skin['joints'], g.acc(skin['inverseBindMatrices']))}


def prove(source, candidate, profile, top):
    old_world, new_world = build.positions(source.doc), build.positions(candidate.doc)
    old_bind, new_bind = binds(source), binds(candidate)
    semantics = {h['bone']: h['node'] for h in source.doc['extensions']['VRM']['humanoid']['humanBones']}
    require(profile['bodySHA256'] == build.sha(source.path.read_bytes()), 'Forearm source body identity')
    required = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head']
    required += [side+part for side in ['left', 'right'] for part in ['Shoulder', 'UpperArm', 'LowerArm', 'Hand']]
    bone_names = set(top.doc['nodes'][j]['name'] for s in top.doc['skins'] for j in s['joints'])
    bone_names.update(source.doc['nodes'][semantics[name]]['name'] for name in required)
    source_nodes = {n['name']: i for i, n in enumerate(source.doc['nodes'])}
    for name in sorted(bone_names):
        i = source_nodes[name]
        require(source.doc['nodes'][i] == candidate.doc['nodes'][i] and np.array_equal(old_world[i], new_world[i]) and
                np.array_equal(old_bind[name], new_bind[name]), 'Upper-body raw rest/bind differs: '+name)
    require(all(np.array_equal(matrix, new_bind[name]) for name, matrix in binds(top).items()), 'Top actual inverse bind differs from body')
    regions = []
    for old, new in zip(source.doc['meshes'][0]['primitives'], candidate.doc['meshes'][0]['primitives']):
        material = source.doc['materials'][old['material']]['name']
        if not any(token in material for token in ['_Tops_', '_Accessory_Tie_']): continue
        ids = np.unique(source.acc(old['indices']))
        require(np.array_equal(source.acc(old['indices']), candidate.acc(new['indices'])), 'Upper garment topology differs')
        hashes = {}
        for key in ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0', 'TEXCOORD_0']:
            a, b = source.acc(old['attributes'][key])[ids], candidate.acc(new['attributes'][key])[ids]
            require(np.array_equal(a, b), 'Selected upper-body '+key+' differs')
            hashes[key] = build.sha(a.tobytes())
        regions.append({'material': material, 'selectedVertices': len(ids), 'unchangedAttributeSha256': hashes})
    module_spec = importlib.util.spec_from_file_location('forearm_source_reader', build.ROOT/'scripts/m1-assets/build-forearm-collision-profile.py')
    forearm = importlib.util.module_from_spec(module_spec); module_spec.loader.exec_module(forearm)
    before, after = [forearm.load('male', g.path) for g in [source, candidate]]
    index_sha = build.sha(before['tri'].astype('<u4').tobytes())
    require(profile['primitive'] == {'mesh': before['mesh'], 'primitive': before['primitive'], 'indexSHA256': index_sha}, 'Forearm primitive identity')
    arms = []
    for side in ['left', 'right']:
        old = forearm.prepare(before, side); new = forearm.prepare(after, side)
        stored = next(p for p in profile['profiles'] if p['side'] == side)
        ids, faces = old[7], old[6]
        require(stored['sourceFaceIndices'] == faces.tolist() and stored['sourceVertexIndices'] == ids.tolist(), 'Forearm measured selection differs')
        require(all(np.array_equal(old[i], new[i]) for i in range(5)) and
                all(np.array_equal(old[i][ids], new[i][ids]) for i in [5, 8, 9]) and
                all(np.array_equal(old[i], new[i]) for i in [6, 7]), 'Forearm source measurement inputs differ')
        require(np.array_equal(before['pos'][ids], after['pos'][ids]) and np.array_equal(before['j'][ids], after['j'][ids]) and
                np.array_equal(before['w'][ids], after['w'][ids]), 'Selected forearm geometry/weights differ')
        used_joints = np.unique(before['j'][ids][before['w'][ids] > 0]).astype(int)
        require(np.array_equal(before['ibm'][used_joints], after['ibm'][used_joints]), 'Forearm weighted inverse bind differs')
        used_nodes = np.array(before['skin']['joints'])[used_joints]
        require(np.array_equal(old_world[used_nodes], new_world[used_nodes]) and
                all(source.doc['nodes'][i] == candidate.doc['nodes'][i] for i in used_nodes), 'Forearm weighted raw rest differs')
        require(np.allclose(stored['bindElbow'], old[1], atol=1e-12, rtol=0) and np.allclose(stored['bindWrist'], old[2], atol=1e-12, rtol=0) and
                np.array_equal(stored['sourceInverseBindMatrixColumnMajor'], before['ibm'][old[0]].T.reshape(-1)), 'Stored forearm bind origin differs')
        arms.append({'side': side, 'selectedFaces': len(faces), 'selectedVertices': len(ids),
                     'positionSha256': build.sha(before['pos'][ids].tobytes()), 'weightsSha256': build.sha(before['w'][ids].tobytes()),
                     'weightedInverseBindSha256': build.sha(before['ibm'][used_joints].tobytes()), 'lengthM': float(old[4]),
                     'weightedRawRestWorldSha256': build.sha(old_world[used_nodes].tobytes()),
                     'weightedBones': [before['d']['nodes'][before['skin']['joints'][j]]['name'] for j in used_joints]})
    return {'protectedRawBoneNames': sorted(bone_names), 'selectedUpperBody': regions, 'forearms': arms,
            'headAndArmRawRestExact': True, 'selectedGeometryWeightsAndBindsExact': True, 'runtimeAccepted': False}


def generate(spec, source, candidate, entries, out):
    profile = json.loads(build.checked(spec['forearmProfile']).read_text(encoding='utf-8'))
    entry = next(e for e in entries if e['slot'] == 'top')
    top = build.load(out/entry['url'])
    evidence = prove(source, candidate, profile, top)
    evidence.update(sourceBodySha256=spec['sourceBody']['sha256'], avatarSha256=build.sha(candidate.path.read_bytes()),
                    topSha256=entry['sha256'], originalForearmProfile=spec['forearmProfile'])
    build.write(out/'upper-body-fit.json', evidence)
    derived = copy.deepcopy(profile)
    derived.update(body=spec['id'], source='assets-source/m2-lower-leg-proportion-v1/generated/avatar.vrm', bodySHA256=evidence['avatarSha256'])
    derived['adaptationEvidence'] = {'method': 'Exact selected forearm and upper-body geometry/weights/raw rest/IBM equality',
        'parentBodySHA256': spec['sourceBody']['sha256'], 'parentProfileSHA256': spec['forearmProfile']['sha256'],
        'evidenceSource': 'assets-source/m2-lower-leg-proportion-v1/generated/upper-body-fit.json',
        'evidenceSha256': build.sha((out/'upper-body-fit.json').read_bytes()), 'runtimeStatus': 'pending candidate game contacts/movement'}
    require(derived['profiles'] == profile['profiles'], 'Measured forearm data changed during derivation')
    write_profile(out/'forearm-profile.json', derived)
    return {'file': 'forearm-profile.json', 'sha256': build.sha((out/'forearm-profile.json').read_bytes()), 'bodySHA256': evidence['avatarSha256']}
