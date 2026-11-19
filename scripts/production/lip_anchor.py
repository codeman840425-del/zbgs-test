"""Produce a body-pinned lip-ring anchor from a released VRM0 or VRM1."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from types import SimpleNamespace

import numpy as np

from production_paths import main_checkout, project_output


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_measurement():
    tool = Path(__file__).resolve().parents[1] / 'native-live-accessory-fit-v1' / 'mouth.py'
    spec = importlib.util.spec_from_file_location('legacy_mouth_measurement', tool)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def index(value, values, label):
    require(type(value) is int and 0 <= value < len(values), 'Invalid ' + label)
    return values[value]


def face_primitives(doc, mesh_index, primitive_index, material):
    nodes, meshes = doc['nodes'], doc['meshes']
    index(mesh_index, meshes, 'FaceMouth mesh')
    index(primitive_index, meshes[mesh_index]['primitives'], 'FaceMouth primitive')
    mouths, faces = [], []
    for i, mesh in enumerate(meshes):
        for j, primitive in enumerate(mesh['primitives']):
            if 'material' not in primitive:
                continue
            name = index(primitive['material'], doc['materials'], 'material index').get('name', '')
            if 'FaceMouth' in name:
                mouths.append((i, j, name))
            if re.search(r'_Face_.*SKIN', name):
                faces.append((i, primitive))
    require(mouths == [(mesh_index, primitive_index, material)], 'Expected the exact, unique FaceMouth primitive and material')
    owners = [i for i, node in enumerate(nodes) if node.get('mesh') == mesh_index]
    require(len(owners) == 1, 'Expected one skinned FaceMouth owner')
    owner = owners[0]
    index(nodes[owner].get('skin'), doc['skins'], 'FaceMouth owner skin')
    require(any(mesh == mesh_index for mesh, _ in faces), 'Missing adjoining Face_SKIN primitive')
    for mesh, _ in faces:
        skin_owners = [node for node in nodes if node.get('mesh') == mesh]
        require(skin_owners and all('skin' in node for node in skin_owners), 'Expected skinned Face_SKIN references')
    return owner, meshes[mesh_index]['primitives'][primitive_index], [primitive for _, primitive in faces]


def expression_binding(doc, mesh, owner, mouth):
    extensions = doc['extensions']
    versions = set(extensions) & {'VRM', 'VRMC_vrm'}
    require(len(versions) == 1, 'Expected one VRM0 or VRM1 binding format')
    if 'VRM' in versions:
        vrm = extensions['VRM']
        require(vrm.get('specVersion') == '0.0', 'Unsupported VRM0 source version')
        human = {}
        for bone in vrm['humanoid']['humanBones']:
            name = bone['bone']
            require(name not in human, 'Ambiguous VRM0 humanoid bone: ' + name)
            human[name] = {'node': bone['node']}
        expressions = [row for row in vrm['blendShapeMaster']['blendShapeGroups'] if row.get('presetName') == 'a']
        require(len(expressions) == 1, 'Expected one VRM0 a preset')
        binds = expressions[0].get('binds', [])
        require(len(binds) == 1 and type(binds[0].get('mesh')) is int and binds[0]['mesh'] == mesh,
                'Expected one VRM0 a bind on the FaceMouth mesh')
        extension, preset, full_weight = 'VRM', 'a', 100
    else:
        vrm = extensions['VRMC_vrm']
        require(vrm.get('specVersion') == '1.0', 'Unsupported VRM1 source version')
        human = vrm['humanoid']['humanBones']
        binds = vrm['expressions']['preset'].get('aa', {}).get('morphTargetBinds', [])
        require(len(binds) == 1 and type(binds[0].get('node')) is int and binds[0]['node'] == owner,
                'Expected one VRM1 aa bind on the FaceMouth owner')
        extension, preset, full_weight = 'VRMC_vrm', 'aa', 1

    bind = binds[0]
    require(type(bind.get('weight')) in (int, float) and bind['weight'] == full_weight,
            'Expected a full-weight FaceMouth ' + preset + ' bind')
    target = index(bind.get('index'), mouth.get('targets', []), 'FaceMouth expression target')
    require('POSITION' in target, 'FaceMouth expression has no POSITION target')
    names = [entry['extras']['targetNames'] for entry in (mouth, doc['meshes'][mesh])
             if 'targetNames' in entry.get('extras', {})]
    targets = [index(bind['index'], name_list, 'FaceMouth expression target name') for name_list in names]
    require(targets and isinstance(targets[0], str) and all(name == targets[0] for name in targets)
            and re.search(r'(?:^|[._])Fcl_MTH_A$', targets[0]),
            'Expected the authored FaceMouth A target')
    landmarks = {name: human.get(name, {}).get('node') for name in ('head', 'leftEye', 'rightEye')}
    for name, node in landmarks.items():
        index(node, doc['nodes'], 'raw humanoid ' + name + ' node')
    require(len(set(landmarks.values())) == len(landmarks), 'Expected distinct raw head and eye nodes')
    source = {'extension': extension, 'specVersion': vrm['specVersion'], 'preset': preset,
              'bind': bind, 'morphTargetName': targets[0]}
    return human, landmarks, source


def dense(g, attribute, label, kind, components):
    entry = index(attribute, g.doc['accessors'], label + ' accessor')
    require(entry.get('type') == kind and entry.get('componentType') in components
            and not entry.get('normalized') and 'sparse' not in entry and 'bufferView' in entry,
            'Unsupported ' + label + ' accessor layout')
    result = g.acc(attribute)
    require(np.isfinite(result).all(), 'Nonfinite ' + label + ' accessor')
    return result


def referenced(g, primitive):
    require(primitive.get('mode', 4) == 4, 'Expected indexed FaceMouth and Face_SKIN triangles')
    positions = dense(g, primitive['attributes']['POSITION'], 'face POSITION', 'VEC3', (5126,))
    raw = dense(g, primitive['indices'], 'face indices', 'SCALAR', (5121, 5123, 5125)).ravel()
    require(len(raw) > 0 and len(raw) % 3 == 0 and int(raw.max()) < len(positions), 'Invalid face triangle indices')
    return positions, dict.fromkeys(map(int, raw))


def runtime_ring(g, mouth, mouth_geometry, face_geometries, measured_ids):
    def key(point):
        # Match Math.round in facility-vocal.js, including negative half values.
        return tuple(np.floor(np.asarray(point, dtype=np.float64) * 1e7 + .5).astype(np.int64))

    positions, used = mouth_geometry
    face_positions = {key(coordinates[i]) for coordinates, ids in face_geometries for i in ids}
    chosen = {key(positions[i]): i for i in used if key(positions[i]) in face_positions}
    measured = {key(positions[i]): i for i in measured_ids}
    require(len(chosen) == len(measured) == 32 and chosen.keys() == measured.keys(),
            'Runtime and production mouth selectors must identify the same 32-point seam')

    before = [measured[k] for k in chosen]
    after = list(chosen.values())
    attributes = mouth['attributes']
    dependencies = [
        positions,
        dense(g, attributes['JOINTS_0'], 'FaceMouth JOINTS_0', 'VEC4', (5121, 5123)),
        dense(g, attributes['WEIGHTS_0'], 'FaceMouth WEIGHTS_0', 'VEC4', (5126,)),
    ]
    dependencies.extend(dense(g, target['POSITION'], 'FaceMouth morph POSITION', 'VEC3', (5126,))
                        for target in mouth['targets'] if 'POSITION' in target)
    require(all(len(data) == len(positions) and np.array_equal(data[before], data[after])
                for data in dependencies),
            'Welded FaceMouth representatives disagree in position, skinning or morph')
    return sorted(chosen.values())


def build(source, body_sha, mesh, primitive, material, *, checkout):
    require(re.fullmatch(r'[0-9a-f]{64}', body_sha), 'Expected an exact lowercase body SHA-256')
    source = source.resolve()
    raw = source.read_bytes()
    require(hashlib.sha256(raw).hexdigest() == body_sha, 'Body SHA-256 mismatch')
    legacy = load_measurement()
    g = legacy.mod.GLB(SimpleNamespace(read_bytes=lambda: raw))
    owner, mouth, faces = face_primitives(g.doc, mesh, primitive, material)
    mouth_geometry = referenced(g, mouth)
    face_geometries = [referenced(g, face) for face in faces]
    human, landmarks, binding = expression_binding(g.doc, mesh, owner, mouth)
    target = binding['bind']['index']
    delta = dense(g, mouth['targets'][target]['POSITION'], 'FaceMouth expression POSITION', 'VEC3', (5126,))
    require(len(delta) == len(mouth_geometry[0]), 'FaceMouth expression POSITION length differs')

    # The historical measurement reads VRM1 metadata. Only adapt the already
    # verified VRM0 bind for that call, leaving the source and legacy tool intact.
    measurement = g
    if binding['extension'] == 'VRM':
        normalized = {
            'humanoid': {'humanBones': human},
            'expressions': {'preset': {'aa': {'morphTargetBinds': [{'node': owner, 'index': target, 'weight': 1}]}}},
        }
        adapted = {**g.doc, 'extensions': {**g.doc['extensions'], 'VRMC_vrm': normalized}}
        measurement = SimpleNamespace(doc=adapted, acc=g.acc)
    reference = legacy.measure(measurement)
    ring = runtime_ring(g, mouth, mouth_geometry, face_geometries, reference['rimVertexIds'])
    require(reference['aaMorphIndex'] == target, 'Mouth measurement used a different expression target')
    require(np.any(delta[ring] != 0), 'FaceMouth expression has no lip-ring displacement')
    source_name = source.relative_to(checkout).as_posix() if source.is_relative_to(checkout) else source.name
    return {
        'schema': 'character-lip-anchor-v1',
        'bodySha256': body_sha,
        'source': {'path': source_name, **binding},
        'faceMouth': {'node': owner, 'mesh': mesh, 'primitive': primitive, 'material': material},
        'landmarkNodes': landmarks,
        'rimVertexIds': ring,
        'rimVertexIdsSha256': hashlib.sha256(np.array(ring, dtype='<u4').tobytes()).hexdigest(),
        'reference': {
            'coordinates': 'raw-head-local metres',
            'neutralCentroid': reference['mouthRawHeadLocal'],
            'neutralBounds': reference['neutralRimAABB'],
            'fullVowelCentroid': reference['aaMouthRawHeadLocal'],
            'fullVowelBounds': reference['aaRimAABB'],
            'adjacentFaceNormal': reference['adjacentFaceAreaWeightedNormalRawHeadLocal'],
        },
    }


def write_or_verify(output, data):
    if output.exists():
        require(output.read_bytes() == data, 'Existing lip anchor differs; choose a new output path')
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=output.parent, prefix='.lip-anchor-', delete=False) as stream:
        staged = Path(stream.name)
        try:
            stream.write(data)
            stream.close()
            try:
                os.link(staged, output)
            except FileExistsError:
                require(output.read_bytes() == data, 'Existing lip anchor differs; choose a new output path')
        finally:
            stream.close()
            staged.unlink()


def run(source, body_sha, mesh, primitive, material, output):
    destination = project_output(output, __file__)
    row = build(source, body_sha, mesh, primitive, material, checkout=main_checkout(__file__))
    data = (json.dumps(row, indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode('utf-8')
    write_or_verify(destination, data)
    return row


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--body-sha256', required=True)
    parser.add_argument('--mesh-index', type=int, required=True)
    parser.add_argument('--primitive-index', type=int, required=True)
    parser.add_argument('--material', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        row = run(args.source, args.body_sha256, args.mesh_index, args.primitive_index, args.material, args.output)
    except (ValueError, OSError, KeyError, IndexError) as error:
        parser.exit(1, str(error) + '\n')
    print(json.dumps({'bodySha256': row['bodySha256'], 'rimVertices': len(row['rimVertexIds']),
                      'rimVertexIdsSha256': row['rimVertexIdsSha256']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
