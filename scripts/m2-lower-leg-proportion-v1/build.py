"""One CPU rest-proportion derivative. No source/public/runtime writes."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-lower-leg-proportion-v1'
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import local, require
module_spec = importlib.util.spec_from_file_location('retained_glb', ROOT/'scripts/m2-male-face-v1/glb.py')
reader = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(reader)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, data):
    path.write_bytes((json.dumps(data, ensure_ascii=False, indent=2)+'\n').encode())


def checked(ref):
    path = local(ROOT, ref['path'])
    require(sha(path.read_bytes()) == ref['sha256'], 'Source SHA mismatch: '+ref['path'])
    return path


def positions(doc):
    parents = {c: i for i, node in enumerate(doc['nodes']) for c in node.get('children', [])}
    require(all(not any(k in n for k in ['matrix', 'rotation', 'scale']) for n in doc['nodes']), 'Only reviewed translation-only rest nodes are supported')
    cache = {}
    def world(index):
        if index not in cache:
            cache[index] = np.array(doc['nodes'][index].get('translation', [0, 0, 0]), float)+(world(parents[index]) if index in parents else 0)
        return cache[index]
    return np.array([world(i) for i in range(len(doc['nodes']))])


def leg_axes(source, increase):
    require(increase == .02, 'This source specimen supports only the reviewed +20 mm parameter')
    doc = source.doc
    semantic = {h['bone']: h['node'] for h in doc['extensions']['VRM']['humanoid']['humanBones']}
    world = positions(doc); legs = []
    for side in ['left', 'right']:
        knee, foot = [semantic[side+part] for part in ['LowerLeg', 'Foot']]
        vector = world[foot]-world[knee]; length = np.linalg.norm(vector); axis = vector/length
        upper = semantic[side+'UpperLeg']; descendants = set()
        def collect(index):
            descendants.add(doc['nodes'][index]['name'])
            for child in doc['nodes'][index].get('children', []): collect(child)
        collect(upper)
        legs.append({'side': side, 'knee': world[knee], 'ankle': world[foot], 'length': length,
                     'axis': axis, 'delta': axis*increase, 'footName': doc['nodes'][foot]['name'],
                     'newFootLocal': np.array(doc['nodes'][foot]['translation'])+axis*increase,
                     'jointNames': descendants})
    return legs


def append_accessor(doc, blob, original, values):
    values = np.asarray(values, dtype='<f4')
    blob.extend(b'\0'*(-len(blob) % 4))
    view = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': values.nbytes}
    blob.extend(values.tobytes()); doc['bufferViews'].append(view)
    accessor = copy.deepcopy(original)
    accessor.update(bufferView=len(doc['bufferViews'])-1, byteOffset=0)
    if accessor['type'] == 'VEC3': accessor.update(min=values.min(0).tolist(), max=values.max(0).tolist())
    doc['accessors'].append(accessor)
    return len(doc['accessors'])-1


def deform(source, legs, identifier):
    doc = copy.deepcopy(source.doc); old_world = positions(doc)
    for leg in legs:
        for node in doc['nodes']:
            if node.get('name') == leg['footName']: node['translation'] = leg['newFootLocal'].tolist()
    new_world = positions(doc); blob = bytearray(source.bin)
    groups = {}; traces = []; changed_nodes = np.flatnonzero(np.linalg.norm(new_world-old_world, axis=1) > 1e-10)
    for node in doc['nodes']:
        if 'mesh' not in node: continue
        require('skin' in node and not any(k in node for k in ['matrix', 'translation', 'rotation', 'scale']), 'Expected identity weighted mesh node')
        skin = doc['skins'][node['skin']]
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            attrs = primitive['attributes']; key = (attrs['POSITION'], attrs['NORMAL'], attrs['JOINTS_0'], attrs['WEIGHTS_0'], node['skin'])
            group = groups.setdefault(key, {'primitives': [], 'shoeVertices': set()})
            group['primitives'].append(primitive)
            if '_Shoes_' in doc['materials'][primitive['material']]['name']:
                group['shoeVertices'].update(int(i) for i in source.acc(primitive['indices']).flat)
    for key, group in groups.items():
        pi, ni, ji, wi, si = key
        points, normal = source.acc(pi), source.acc(ni)
        result, transformed = points.copy(), normal.copy()
        joints, weights = source.acc(ji).astype(int), source.acc(wi)
        joint_names = [doc['nodes'][j]['name'] for j in doc['skins'][si]['joints']]
        touched = np.zeros(len(points), bool)
        side_counts = {}
        shoe = np.zeros(len(points), bool); shoe[list(group['shoeVertices'])] = True
        for leg in legs:
            allowed = [i for i, name in enumerate(joint_names) if name in leg['jointNames']]
            side_weight = np.where(np.isin(joints, allowed), weights, 0).sum(1)
            t = (points-leg['knee']) @ leg['axis']/leg['length']
            selected = (side_weight > .5) & ((t > 0) | shoe)
            require(np.all(side_weight[selected] > .99995) and not np.any(touched & selected), 'Ambiguous lower-leg side weights')
            factor = np.clip(t, 0, 1); factor[shoe] = 1
            result[selected] = points[selected]+factor[selected, None]*leg['delta']
            band = selected & (t < 1) & ~shoe
            scale = .02/leg['length']
            transformed[band] = normal[band]-(scale/(1+scale))*((normal[band] @ leg['axis'])[:, None]*leg['axis'])
            transformed[band] /= np.linalg.norm(transformed[band], axis=1)[:, None]
            touched |= selected; side_counts[leg['side']] = int(selected.sum())
        displacement = np.linalg.norm(result-points, axis=1)
        require(displacement.max(initial=0) <= .0200001, 'Rest displacement exceeds parameter')
        if touched.any():
            require(all(not p.get('targets') for p in group['primitives']), 'Changed morph geometry requires a dedicated morph exporter')
            new_pi = append_accessor(doc, blob, doc['accessors'][pi], result)
            new_ni = append_accessor(doc, blob, doc['accessors'][ni], transformed)
            for primitive in group['primitives']: primitive['attributes'].update(POSITION=new_pi, NORMAL=new_ni)
        traces.append({'sourcePositionAccessor': pi, 'changedVertices': int(touched.sum()), 'perSide': side_counts,
                       'sourcePositionSha256': sha(points.tobytes()), 'newPositionSha256': sha(result.tobytes()),
                       'sourceNormalSha256': sha(normal.tobytes()), 'newNormalSha256': sha(transformed.tobytes()),
                       'preservedJointsSha256': sha(source.acc(ji).tobytes()), 'preservedWeightsSha256': sha(source.acc(wi).tobytes()),
                       'primitiveRegions': [{'material': doc['materials'][p['material']]['name'],
                          'usedVertices': len(np.unique(source.acc(p['indices']))),
                          'changedVertices': int(touched[np.unique(source.acc(p['indices']))].sum())} for p in group['primitives']],
                       'maximumDisplacementM': float(displacement.max(initial=0)), 'shoeVerticesRigid': len(group['shoeVertices']),
                       'boundsBeforeM': [points.min(0).tolist(), points.max(0).tolist()], 'boundsAfterM': [result.min(0).tolist(), result.max(0).tolist()]})
    skin_cache = {}; bind_changes = []
    for skin in doc['skins']:
        index = skin['inverseBindMatrices']; key = (index, tuple(skin['joints']))
        if key not in skin_cache:
            values = source.acc(index); delta = new_world[skin['joints']]-old_world[skin['joints']]
            old_bind_sha = sha(values.tobytes())
            require(np.max(np.abs(values.reshape(-1, 4, 4)[:, :3, :3]-np.eye(3))) < 1e-7, 'Expected translation-only inverse binds')
            if np.any(delta):
                values[:, 12:15] -= delta
                skin_cache[key] = append_accessor(doc, blob, doc['accessors'][index], values)
            else: skin_cache[key] = index
            bind_changes.append({'sourceAccessor': index, 'newAccessor': skin_cache[key], 'sourceSha256': old_bind_sha,
                                 'newSha256': sha(values.tobytes()), 'changedJoints': [doc['nodes'][joint]['name'] for joint, change in zip(skin['joints'], delta) if np.any(change)]})
        skin['inverseBindMatrices'] = skin_cache[key]
    changed = len(changed_nodes) or any(t['changedVertices'] for t in traces)
    if changed:
        doc['asset']['generator'] = 'm2-lower-leg-proportion-v1 CPU rest derivative'
        if 'VRM' in doc.get('extensions', {}): doc['extensions']['VRM']['meta']['title'] = identifier
        doc['buffers'][0]['byteLength'] = len(blob)
        text = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode(); text += b' '*(-len(text) % 4)
        blob.extend(b'\0'*(-len(blob) % 4))
        raw = struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(blob))+struct.pack('<I4s', len(text), b'JSON')+text+struct.pack('<I4s', len(blob), b'BIN\0')+blob
    else: raw = source.path.read_bytes()
    return raw, {'changedRawNodes': [doc['nodes'][i]['name'] for i in changed_nodes], 'meshGroups': traces, 'inverseBindChanges': bind_changes}


def load(path):
    g = reader.GLB(path); g.path = path
    return g


def main():
    spec = json.loads((BASE/'spec.json').read_text(encoding='utf-8')); checked(spec['editableCheckpoint'])
    source = load(checked(spec['sourceBody'])); legs = leg_axes(source, spec['lowerLegLengthIncreaseM'])
    out = BASE/'generated'; out.mkdir(exist_ok=True)
    avatar, trace = deform(source, legs, spec['id']); (out/'avatar.vrm').write_bytes(avatar)
    manifest = json.loads(local(ROOT, spec['equipmentManifest']).read_text(encoding='utf-8-sig'))
    entries, dependencies = [], []
    new_body = sha(avatar)
    avatar_doc = load(out/'avatar.vrm'); new_binds = {avatar_doc.doc['nodes'][j]['name']: row for j, row in zip(avatar_doc.doc['skins'][0]['joints'], avatar_doc.acc(avatar_doc.doc['skins'][0]['inverseBindMatrices']))}
    for ref in spec['equipment']:
        entry = copy.deepcopy(next(e for e in manifest['items'] if e['id'] == ref['id']))
        require(entry['sha256'] == ref['sha256'], 'Equipment manifest source identity')
        relative = 'prototype/public'+entry['url'] if entry['url'].startswith('/') else 'prototype/public/assets/m1b/'+entry['url']
        path = checked({'path': relative, 'sha256': ref['sha256']})
        garment = load(path); identifier = spec['id']+'-'+entry['slot']
        raw, garment_trace = deform(garment, legs, identifier); filename = identifier+'.glb'; (out/filename).write_bytes(raw)
        omitted_recipes = entry.pop('materialRecipes', [])
        entry.pop('sourceSpec', None)
        entry.update(id=identifier, styleId=entry.get('styleId', ref['id']), fitId=identifier+'-fit-v1', compatibleAvatarSha256=new_body,
                     url=filename, sha256=sha(raw), bytes=len(raw))
        entry.update(sourceSpec='assets-source/m2-lower-leg-proportion-v1/spec.json',
                     method='Exact source rest-proportion derivative; six-bone shoes translated and rebound; shorts reused only after actual geometry/bind invariants',
                     limits=['Exact male-lower-leg-plus20-v1 source fit only', 'Source/rest checks only; runtime movement and visual acceptance pending'])
        for binding in entry['bindings']: binding['inverseBindMatrix'] = new_binds[binding['targetRawBone']].tolist()
        entries.append(entry)
        dependencies.append({'source': {'path': relative, 'sha256': ref['sha256']}, 'newId': identifier, 'newSha256': sha(raw),
                             'geometryAndGLBUnchanged': raw == path.read_bytes(), 'omittedOriginalMaterialRecipes': omitted_recipes,
                             'trace': garment_trace})
    write(out/'equipment.json', {'schema': 'zbgs-equipment-v1', 'items': entries})
    write(out/'fit.json', {'schema': 'zbgs-lower-leg-proportion-fit-v1', 'id': spec['id']+'-source-fit', 'version': 1,
          'sourceBodySha256': spec['sourceBody']['sha256'], 'avatarSha256': new_body, 'deltaM': .02,
          'equipment': [{'id': e['id'], 'styleId': e['styleId'], 'fitId': e['fitId'], 'sha256': e['sha256']} for e in entries],
          'reference': spec['reference'], 'originalBodyPreserved': True, 'runtimeAccepted': False,
          'notInherited': ['female bases', 'socks', 'onePiece', 'other independent clothing', 'original material recipe fit identities']})
    leg_report = [{'side': l['side'], 'kneeM': l['knee'].tolist(), 'ankleBeforeM': l['ankle'].tolist(),
                   'ankleAfterM': (l['ankle']+l['delta']).tolist(), 'lengthBeforeM': float(l['length']),
                   'lengthAfterM': float(l['length']+.02), 'footDisplacementM': l['delta'].tolist()} for l in legs]
    write(out/'build-report.json', {'schema': 'zbgs-lower-leg-proportion-build-v1', 'id': spec['id'], 'sourceBody': spec['sourceBody'],
          'specSha256': sha((BASE/'spec.json').read_bytes()), 'generatorSha256': sha(Path(__file__).read_bytes()),
          'avatarSha256': new_body, 'avatarBytes': len(avatar), 'legMeasurements': leg_report, 'trace': trace,
          'equipment': dependencies, 'runtimeAccepted': False})
    print(json.dumps({'avatarSha256': new_body, 'legMeasurements': leg_report, 'equipment': [(e['newId'], e['geometryAndGLBUnchanged']) for e in dependencies]}))


if __name__ == '__main__':
    main()
