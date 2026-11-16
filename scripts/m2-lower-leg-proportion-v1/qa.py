"""CPU rest/bind/invariant checks and exact repeat exports; no GPU or Blender."""
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build
from flow import GLB, Validator, require


def neutral_error(g):
    world = build.positions(g.doc); maximum = 0.; matrix_error = 0.
    for node in g.doc['nodes']:
        if 'mesh' not in node: continue
        skin = g.doc['skins'][node['skin']]
        inverse = g.acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
        rest = np.tile(np.eye(4), (len(skin['joints']), 1, 1)); rest[:, :3, 3] = world[skin['joints']]
        matrices = rest @ inverse
        matrix_error = max(matrix_error, float(np.abs(matrices-np.eye(4)).max()))
        for primitive in g.doc['meshes'][node['mesh']]['primitives']:
            attrs = primitive['attributes']; p = g.acc(attrs['POSITION'])
            j, w = g.acc(attrs['JOINTS_0']).astype(int), g.acc(attrs['WEIGHTS_0'])
            # Actual Three.js normalizes skin weights on loader consumption.
            w = w/w.sum(1)[:, None]
            homogeneous = np.column_stack([p, np.ones(len(p))])
            moved = np.einsum('nvij,nj->nvi', matrices[j], homogeneous)
            skinned = np.sum(moved*w[:, :, None], axis=1)[:, :3]
            maximum = max(maximum, float(np.linalg.norm(skinned-p, axis=1).max()))
    require(matrix_error < 3e-7 and maximum < 3e-7, 'Neutral skin/rest inverse inconsistency')
    return {'maximumRestMatrixIdentityError': matrix_error, 'maximumNeutralSkinPositionErrorM': maximum}


def primitive_points(g, primitive):
    return g.acc(primitive['attributes']['POSITION'])[np.unique(g.acc(primitive['indices']))]


def main():
    base = build.BASE; out = base/'generated'
    spec = json.loads((base/'spec.json').read_text(encoding='utf-8'))
    frozen = {p.name: build.sha(p.read_bytes()) for p in out.iterdir() if p.is_file() and p.name not in ['qa-report.json', 'package-files.json', 'vrm-loader-qa.json']}
    build.main()
    require(frozen == {name: build.sha((out/name).read_bytes()) for name in frozen}, 'Repeat export changed stored output')
    source = build.load(build.checked(spec['sourceBody'])); candidate = build.load(out/'avatar.vrm')
    require(candidate.bin[:len(source.bin)] == source.bin, 'Original binary payload was modified')
    require(source.doc['extensions']['VRM']['humanoid'] == candidate.doc['extensions']['VRM']['humanoid'], 'VRM humanoid mapping changed')
    require(source.doc['extensions']['VRM']['blendShapeMaster'] == candidate.doc['extensions']['VRM']['blendShapeMaster'], 'VRM expression mapping changed')
    require(source.images() == candidate.images(), 'Encoded textures changed')
    before_world, after_world = build.positions(source.doc), build.positions(candidate.doc)
    semantic = {h['bone']: h['node'] for h in source.doc['extensions']['VRM']['humanoid']['humanBones']}
    legs = build.leg_axes(source, .02); measured = []
    for leg in legs:
        knee, foot = [semantic[leg['side']+part] for part in ['LowerLeg', 'Foot']]
        old_length = np.linalg.norm(before_world[foot]-before_world[knee])
        new_length = np.linalg.norm(after_world[foot]-after_world[knee])
        require(abs(new_length-old_length-.02) < 1e-12, 'Actual raw lower-leg length is incorrect')
        require(np.array_equal(before_world[knee], after_world[knee]), 'Knee reference moved')
        measured.append({'side': leg['side'], 'oldLengthM': float(old_length), 'newLengthM': float(new_length)})
    for name in ['hips', 'head', 'leftUpperArm', 'rightUpperArm']:
        require(np.array_equal(before_world[semantic[name]], after_world[semantic[name]]), 'Protected raw reference moved: '+name)
    regions = []
    for mesh_index, (old_mesh, new_mesh) in enumerate(zip(source.doc['meshes'], candidate.doc['meshes'])):
        for pi, (old, new) in enumerate(zip(old_mesh['primitives'], new_mesh['primitives'])):
            old_pos = source.acc(old['attributes']['POSITION']); new_pos = candidate.acc(new['attributes']['POSITION'])
            protected = np.logical_and.reduce([(old_pos-leg['knee']) @ leg['axis'] <= 0 for leg in legs])
            require(np.array_equal(old_pos[protected], new_pos[protected]), 'Region above anatomical knee planes changed')
            require(np.array_equal(old_pos[old_pos[:, 1] >= .65], new_pos[old_pos[:, 1] >= .65]), 'Upper body region changed')
            for key in ['JOINTS_0', 'WEIGHTS_0', 'TEXCOORD_0']:
                require(np.array_equal(source.acc(old['attributes'][key]), candidate.acc(new['attributes'][key])), 'Skin or UV changed')
            require(np.array_equal(source.acc(old['indices']), candidate.acc(new['indices'])), 'Topology changed')
            if mesh_index == 1:
                require(old == new, 'Face/morph accessor references changed')
            old_used, new_used = primitive_points(source, old), primitive_points(candidate, new)
            regions.append({'material': source.doc['materials'][old['material']]['name'],
                'changedUsedVertices': int(np.count_nonzero(np.linalg.norm(new_used-old_used, axis=1) > 1e-9)),
                'minimumYBeforeM': float(old_used[:, 1].min()), 'minimumYAfterM': float(new_used[:, 1].min())})
    entries = json.loads((out/'equipment.json').read_text(encoding='utf-8'))['items']; equipment = []
    report = json.loads((out/'build-report.json').read_text(encoding='utf-8'))
    for entry, ref in zip(entries, report['equipment']):
        actual = Validator(build.ROOT).equipment(entry, build.sha((out/'avatar.vrm').read_bytes()), GLB((out/'avatar.vrm').read_bytes()),
                                                (out/'equipment.json').relative_to(build.ROOT).as_posix())
        old = build.load(build.local(build.ROOT, ref['source']['path'])); new = build.load(out/entry['url'])
        old_world, new_world = build.positions(old.doc), build.positions(new.doc)
        neutral = neutral_error(new)
        if entry['slot'] == 'bottom':
            require(old.path.read_bytes() == new.path.read_bytes(), 'Shorts should remain exact geometry and binds')
        else:
            for old_p, new_p in zip(old.doc['meshes'][0]['primitives'], new.doc['meshes'][0]['primitives']):
                attrs = old_p['attributes']; p = old.acc(attrs['POSITION']); q = new.acc(new_p['attributes']['POSITION'])
                joint_names = [old.doc['nodes'][j]['name'] for j in old.doc['skins'][0]['joints']]
                j, w = old.acc(attrs['JOINTS_0']).astype(int), old.acc(attrs['WEIGHTS_0'])
                for leg in legs:
                    ids = [i for i, name in enumerate(joint_names) if name in leg['jointNames']]
                    side = np.where(np.isin(j, ids), w, 0).sum(1) > .5
                    require(np.max(np.linalg.norm((q-p)[side]-leg['delta'], axis=1)) < 4e-8, 'Shoe foot-relative geometry distorted')
        equipment.append({'id': entry['id'], 'actualBinding': actual, 'neutralSkin': neutral,
                          'sourceGLBUnchanged': old.path.read_bytes() == new.path.read_bytes()})
    rejected = []
    def rejects(label, operation, expected):
        try: operation()
        except ValueError as error:
            require(expected in str(error), 'Unexpected rejection: '+str(error)); rejected.append(label)
        else: raise AssertionError('Accepted '+label)
    rejects('wrong original SHA', lambda: build.checked(dict(spec['sourceBody'], sha256='0'*64)), 'Source SHA mismatch')
    rejects('unsupported parameter', lambda: build.leg_axes(source, .03), 'reviewed +20 mm')
    old_manifest = json.loads(build.local(build.ROOT, spec['equipmentManifest']).read_text(encoding='utf-8-sig'))
    old_shoes = next(e for e in old_manifest['items'] if e['id'] == 'm1b-uniform-shoes')
    rejects('old body equipment fit', lambda: Validator(build.ROOT).equipment(old_shoes, build.sha(candidate.path.read_bytes()),
                GLB(candidate.path.read_bytes()), spec['equipmentManifest']), 'Wrong body fit')
    loader_path = out/'vrm-loader-qa.json'
    if loader_path.exists():
        loader = json.loads(loader_path.read_text(encoding='utf-8'))
        require(loader['passed'] is True and loader['original']['sha256'] == spec['sourceBody']['sha256'] and
                loader['candidate']['sha256'] == build.sha(candidate.path.read_bytes()), 'Stored actual VRM loader identity mismatch')
    report = {'schema': 'zbgs-lower-leg-proportion-qa-v1', 'passed': True, 'repeatExportExact': True,
        'sourceBodySha256': spec['sourceBody']['sha256'], 'avatarSha256': build.sha((out/'avatar.vrm').read_bytes()),
        'measuredRawLegs': measured, 'sourceNeutralSkin': neutral_error(source), 'candidateNeutralSkin': neutral_error(candidate),
        'primitiveRegions': regions, 'equipment': equipment, 'texturesAndFaceMorphsUnchanged': True,
        'hipsKneesHeadUpperArmsUnchanged': True, 'topologyUVWeightsUnchanged': True,
        'negativeChecks': rejected,
        'actualVRMNormalizedMappingCPUReportPresent': loader_path.exists(),
        'GPUUsed': False, 'BlenderUsed': False, 'runtimeAccepted': False,
        'limits': ['Rest pose only; no movement, foot contact, seated fit or camera acceptance',
                   'Embedded original trousers are deformed by the same segment field, without a separate visual/action approval',
                   'Female, socks and other independent garments require new fit work; original material recipes are omitted due to their old identity']}
    build.write(out/'qa-report.json', report)
    paths = [p for directory in [base, Path(__file__).resolve().parent] for p in directory.rglob('*')
             if p.is_file() and '__pycache__' not in p.parts and p.name != 'package-files.json']
    build.write(out/'package-files.json', {'files': [{'path': p.relative_to(build.ROOT).as_posix(), 'sha256': build.sha(p.read_bytes()),
                 'bytes': p.stat().st_size} for p in sorted(paths)]})
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
