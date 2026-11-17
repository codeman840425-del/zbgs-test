"""Compare the runtime dependencies of two pinned exports of the same VRoid template."""
import argparse
from collections import defaultdict
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import struct
import sys
from types import SimpleNamespace

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
loader = importlib.util.spec_from_file_location('native_glb', ROOT / 'scripts/m2-male-face-v1/glb.py')
decoder = importlib.util.module_from_spec(loader)
loader.loader.exec_module(decoder)

SUPPORTED_FIELDS = {
    'asset', 'buffers', 'bufferViews', 'accessors', 'textures', 'samplers', 'images',
    'materials', 'meshes', 'nodes', 'skins', 'scene', 'scenes', 'extensionsUsed',
    'extensionsRequired', 'extensions',
}
SUPPORTED_EXTENSIONS = {
    'VRMC_vrm', 'VRMC_springBone', 'VRMC_materials_mtoon', 'KHR_materials_unlit',
    'KHR_texture_transform',
}
CHECKS = (
    'facialExpressions', 'headAttachments', 'handAndMicrophone', 'garmentsAndCoverage',
    'feetAndFloor', 'seatContact', 'dynamicMotion', 'surfaceAndTexture',
    'runtimeRecordAndBudget',
)


class Unsupported(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise Unsupported(message)


def ref(values, index):
    require(type(index) is int and 0 <= index < len(values), f'Invalid reference {index!r}')
    return values[index]


def read_pinned(path, expected):
    if not re.fullmatch('[0-9a-fA-F]{64}', expected):
        raise ValueError(f'Expected SHA-256 for {path}')
    raw = path.read_bytes()
    actual = hashlib.sha256(raw).hexdigest()
    if actual != expected.lower():
        raise ValueError(f'SHA-256 mismatch for {path}. Expected {expected}, got {actual}')
    resolved = path.resolve()
    display = resolved.relative_to(ROOT) if resolved.is_relative_to(ROOT) else resolved
    return dict(path=display.as_posix(), sha256=actual, bytes=len(raw)), raw


class Export:
    def __init__(self, raw):
        self.glb = decoder.GLB(SimpleNamespace(read_bytes=lambda: raw))
        self.doc = self.glb.doc
        require(not (self.doc.keys() - SUPPORTED_FIELDS), 'Unsupported glTF document fields')
        offset = 20 + struct.unpack_from('<I', raw, 12)[0]
        length, kind = struct.unpack_from('<I4s', raw, offset)
        require(kind == b'BIN\0' and offset + 8 + length == len(raw), 'Expected one GLB BIN chunk')
        buffers = self.doc['buffers']
        require(len(buffers) == 1 and set(buffers[0]) == {'byteLength'}, 'Expected embedded buffer')
        self.buffer_length = buffers[0]['byteLength']
        require(0 <= length - self.buffer_length <= 3, 'Invalid embedded buffer length')

        extensions = self.doc['extensions']
        require(set(extensions) <= {'VRMC_vrm', 'VRMC_springBone'}, 'Unsupported root extension')
        require(extensions['VRMC_vrm']['specVersion'] == '1.0', 'Expected a VRM 1.0 export')
        self.vrm = extensions['VRMC_vrm']
        self.spring = extensions.get('VRMC_springBone')
        self._validate_extensions(self.doc)
        self.names = {}
        for key in ('meshes', 'materials', 'nodes', 'images', 'textures'):
            names = [record['name'] for record in self.doc[key]]
            require(all(isinstance(name, str) and name for name in names)
                    and len(set(names)) == len(names), f'Ambiguous {key} identity')
            self.names[key] = names
        self.accessors = {}
        for image in self.doc['images']:
            require(set(image) <= {'name', 'bufferView', 'mimeType'}, 'Unsupported image layout')
            self.view(image['bufferView'])
        self.image_hashes = self.glb.images()

    def _validate_extensions(self, value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key in {'extensions', 'extensionsUsed', 'extensionsRequired'}:
                    require(set(child) <= SUPPORTED_EXTENSIONS, 'Unsupported glTF/VRM extension')
                self._validate_extensions(child)
        elif isinstance(value, list):
            for child in value:
                self._validate_extensions(child)

    def view(self, index):
        view = ref(self.doc['bufferViews'], index)
        start = view.get('byteOffset', 0)
        size = view['byteLength']
        require(view['buffer'] == 0 and start >= 0 and size >= 0
                and start + size <= self.buffer_length, 'Invalid embedded buffer view')
        return view

    def accessor(self, index):
        entry = ref(self.doc['accessors'], index)
        if index not in self.accessors:
            normalized = entry.get('normalized', False)
            require('sparse' not in entry and type(normalized) is bool, 'Unsupported accessor encoding')
            require(entry['componentType'] in {5121, 5123, 5125, 5126}
                    and entry['type'] in {'SCALAR', 'VEC2', 'VEC3', 'VEC4', 'MAT4'},
                    'Accessor encoding outside the native GLB decoder profile')
            view = self.view(entry['bufferView'])
            array = self.glb.acc(index)
            row_bytes = array.shape[1] * array.itemsize
            stride = view.get('byteStride', row_bytes)
            start = entry.get('byteOffset', 0)
            require(len(array) > 0 and start >= 0 and stride >= row_bytes
                    and start + (len(array) - 1) * stride + row_bytes <= view['byteLength']
                    and np.isfinite(array).all(), 'Invalid accessor layout or non-finite data')
            self.accessors[index] = array, normalized
        return self.accessors[index]

    def name(self, key, index):
        return ref(self.names[key], index)


def arrays(a, ai, b, bi, where):
    first, anorm = a.accessor(ai)
    second, bnorm = b.accessor(bi)
    require(first.shape == second.shape and first.dtype == second.dtype and anorm == bnorm,
            f'Accessor layout changed at {where}')
    return first, second


def changed_rows(first, second):
    rows = np.any(first != second, axis=1)
    if rows.any():
        delta = second[rows].astype(np.float64) - first[rows].astype(np.float64)
        return {'changedRows': int(rows.sum()), 'maxAbs': float(np.abs(delta).max())}
    return None


def material_order(export, mesh):
    materials = [export.name('materials', p['material']) for p in mesh['primitives']]
    require(len(set(materials)) == len(materials), f'Ambiguous primitives in {mesh["name"]}')
    return materials


def primitive_changes(a, b):
    changes = []
    topology = []
    count = 0
    for amesh, bmesh in zip(a.doc['meshes'], b.doc['meshes'], strict=True):
        mesh = amesh['name']
        materials = material_order(a, amesh)
        require(materials == material_order(b, bmesh), f'Primitive layout changed in {mesh}')
        targets = amesh.get('extras', {}).get('targetNames', [])
        require(targets == bmesh.get('extras', {}).get('targetNames', [])
                and len(targets) == len(set(targets)), f'Morph target identity changed in {mesh}')
        require(amesh.keys() == bmesh.keys()
                and set(amesh) <= {'name', 'primitives', 'extras', 'weights'},
                f'Unsupported mesh layout in {mesh}')
        weights_changed = amesh.get('weights') != bmesh.get('weights')
        for material, ap, bp in zip(materials, amesh['primitives'], bmesh['primitives'], strict=True):
            where = f'{mesh} / {material}'
            require(set(ap) <= {'attributes', 'extras', 'indices', 'material', 'mode', 'targets'}
                    and set(bp) <= {'attributes', 'extras', 'indices', 'material', 'mode', 'targets'}
                    and ap.get('mode', 4) == bp.get('mode', 4) == 4
                    and ap['attributes'].keys() == bp['attributes'].keys()
                    and ap.get('extras') == bp.get('extras'),
                    f'Primitive layout changed at {where}')
            ia, ib = arrays(a, ap['indices'], b, bp['indices'], where + ' indices')
            require(ia.shape[1] == 1 and ia.dtype.kind == 'u' and len(ia) % 3 == 0,
                    f'Invalid triangle indices at {where}')
            positions, _ = arrays(a, ap['attributes']['POSITION'], b, bp['attributes']['POSITION'],
                                  where + ' POSITION')
            vertex_count = len(positions)
            require(int(ia.max()) < vertex_count and int(ib.max()) < vertex_count,
                    f'Triangle index out of range at {where}')
            ats, bts = ap.get('targets', []), bp.get('targets', [])
            require(len(ats) == len(bts) == len(targets), f'Morph target count changed at {where}')
            pairs = [(None, ap['attributes'], bp['attributes']), *zip(targets, ats, bts, strict=True)]
            row = {'mesh': mesh, 'material': material, 'attributes': {}, 'morphs': {}}
            count += 1
            index_delta = changed_rows(ia, ib)
            if index_delta:
                row['indices'] = index_delta
                topology.append(where)
            else:
                # Match the actual primitive references as in the original production readback.
                # Merged exports share vertex accessors across several materials.
                referenced = np.unique(ia)
                row['referencedVertices'] = len(referenced)
            for target, attrs_a, attrs_b in pairs:
                require(attrs_a.keys() == attrs_b.keys(), f'Morph attributes changed at {where}')
                for semantic, ai in attrs_a.items():
                    first, second = arrays(a, ai, b, attrs_b[semantic], f'{where} {target} {semantic}')
                    require(len(first) == vertex_count, f'Vertex count mismatch at {where}')
                    if index_delta:
                        continue
                    delta = changed_rows(first[referenced], second[referenced])
                    if delta and target is None:
                        row['attributes'][semantic] = delta
                    elif delta:
                        row['morphs'].setdefault(target, {})[semantic] = delta
            if weights_changed:
                row['defaultMorphWeightsChanged'] = True
            if index_delta or row['attributes'] or row['morphs'] or weights_changed:
                changes.append(row)
    return changes, topology, count


def node_state(export):
    nodes = export.doc['nodes']
    parents = {}
    for node in nodes:
        for index in node.get('children', []):
            child = export.name('nodes', index)
            require(child not in parents, f'Multiple parents for {child}')
            parents[child] = node['name']
    return {
        node['name']: {'parent': parents.get(node['name']),
                       **{k: v for k, v in node.items() if k != 'name'}}
        for node in nodes
    }


def structural_changes(a, b):
    return sorted(key for key in a.keys() | b.keys() if a.get(key) != b.get(key))


def nodes_and_skins(a, b):
    states = node_state(a), node_state(b)
    def human_mapping(export):
        return {name: export.name('nodes', bone['node'])
                for name, bone in export.vrm['humanoid']['humanBones'].items()}

    before_human, after_human = human_mapping(a), human_mapping(b)
    by_node = {node: semantic for semantic, node in before_human.items()}
    human = [{'semantic': name, 'baselineNode': before_human.get(name),
              'candidateNode': after_human.get(name)}
             for name in structural_changes(before_human, after_human)]
    nodes = []
    for name in a.names['nodes']:
        before, after = states[0][name], states[1][name]
        fields = structural_changes(before, after)
        if fields:
            nodes.append({'node': name, 'fields': fields, 'humanBone': by_node.get(name),
                          **({'parents': [before['parent'], after['parent']]} if 'parent' in fields else {})})

    def skin_owners(export):
        owners = [[] for skin in export.doc['skins']]
        for node in export.doc['nodes']:
            if 'mesh' in node:
                export.name('meshes', node['mesh'])
            if 'skin' in node:
                ref(owners, node['skin']).append(node['name'])
        require(all(owners), 'Skin without a named consumer')
        return owners

    owners = skin_owners(a)
    require(owners == skin_owners(b), 'Skin consumer layout changed')
    skins = []
    for owner, left, right in zip(owners, a.doc['skins'], b.doc['skins'], strict=True):
        aj = [a.name('nodes', i) for i in left['joints']]
        bj = [b.name('nodes', i) for i in right['joints']]
        require(len(set(aj)) == len(aj) and len(set(bj)) == len(bj), 'Duplicate skin joint')
        first, anorm = a.accessor(left['inverseBindMatrices'])
        second, bnorm = b.accessor(right['inverseBindMatrices'])
        require(not anorm and not bnorm and first.shape == (len(aj), 16)
                and second.shape == (len(bj), 16) and first.dtype == second.dtype == np.float32,
                'Invalid inverse bind matrix layout')
        ai, bi = ({name: i for i, name in enumerate(joints)} for joints in (aj, bj))
        common = sorted(ai.keys() & bi.keys())
        first, second = first[[ai[name] for name in common]], second[[bi[name] for name in common]]
        delta = changed_rows(first, second)
        fields = [key for key in structural_changes(left, right) if key != 'inverseBindMatrices']
        if fields or delta:
            skins.append({
                'consumers': owner, 'fields': fields, 'jointOrderChanged': aj != bj,
                'addedJoints': sorted(bi.keys() - ai.keys()), 'removedJoints': sorted(ai.keys() - bi.keys()),
                'inverseBindMatrices': delta,
                'changedBindJoints': [name for name, changed in zip(
                    common, np.any(first != second, axis=1), strict=True) if changed],
            })
    return nodes, skins, human


def surfaces(a, b):
    def texture(export, index):
        record = ref(export.doc['textures'], index)
        resolved = {**record, 'source': export.name('images', record['source'])}
        if 'sampler' in record:
            resolved['sampler'] = ref(export.doc.get('samplers', []), record['sampler'])
        return resolved

    def graph(export, record, consumers, material):
        resolved = {}
        for key, value in record.items():
            if isinstance(value, dict) and key.endswith('Texture') and 'index' in value:
                bound = texture(export, value['index'])
                consumers[bound['source']].add(material)
                resolved[key] = {**value, 'index': bound}
            elif isinstance(value, dict):
                resolved[key] = graph(export, value, consumers, material)
            else:
                resolved[key] = value
        return resolved

    seen = defaultdict(set)
    materials = []
    for left, right in zip(a.doc['materials'], b.doc['materials'], strict=True):
        name = left['name']
        fields = structural_changes(graph(a, left, seen, name), graph(b, right, seen, name))
        if fields:
            materials.append({'material': name, 'fields': fields})
    images = []
    for i, name in enumerate(a.names['images']):
        before, after = a.doc['images'][i], b.doc['images'][i]
        if (a.image_hashes[i], before['mimeType']) != (b.image_hashes[i], after['mimeType']):
            images.append({'image': name, 'baselineSha256': a.image_hashes[i],
                           'candidateSha256': b.image_hashes[i], 'materials': sorted(seen[name]),
                           'mimeTypeChanged': before['mimeType'] != after['mimeType']})
    textures = [name for i, name in enumerate(a.names['textures']) if texture(a, i) != texture(b, i)]
    return {'materials': materials, 'images': images, 'textureBindings': textures}


def spring_changes(a, b):
    """Identify changed spring chains by their root joints, including repeated names."""
    before, after = a.spring or {}, b.spring or {}
    changes = {}
    for key in ('colliders', 'colliderGroups', 'springs'):
        left, right = before.get(key, []), after.get(key, [])
        if left == right:
            continue
        changes[key] = {'baselineCount': len(left), 'candidateCount': len(right)}
        if len(left) != len(right):
            continue
        rows = []
        for i, (source, candidate) in enumerate(zip(left, right, strict=True)):
            if source == candidate:
                continue
            fields = structural_changes(source, candidate)
            row = {'index': i, 'fields': fields, 'name': candidate.get('name')}
            if key == 'springs' and candidate['joints']:
                row['candidateRoot'] = b.name('nodes', candidate['joints'][0]['node'])
                if len(source['joints']) == len(candidate['joints']):
                    row['jointFields'] = sorted({field for before_joint, after_joint in zip(
                        source['joints'], candidate['joints'], strict=True)
                        for field in structural_changes(before_joint, after_joint)})
            rows.append(row)
        changes[key]['changedEntries'] = rows
    return changes


def required_checks(report):
    risk = defaultdict(list)

    def mark(checks, reason):
        for check in checks:
            if reason not in risk[check]:
                risk[check].append(reason)

    if report['status'] == 'unsupported':
        mark(CHECKS, 'Export dependencies could not be fully aligned')
    for row in report.get('primitives', []):
        attrs = row['attributes']
        morph_positions = any('POSITION' in target for target in row['morphs'].values())
        geometry = ('POSITION' in attrs or morph_positions
                    or any(k.startswith(('JOINTS_', 'WEIGHTS_')) for k in attrs))
        face = row['mesh'].startswith('Face')
        hair = 'Hair' in row['material']
        body = row['mesh'].startswith('Body') and not hair
        shoes = 'Shoes' in row['material']
        label = row['material']
        mark(('surfaceAndTexture', 'runtimeRecordAndBudget'), label)
        if face and (geometry or row['morphs'] or row.get('defaultMorphWeightsChanged')):
            mark(('facialExpressions', 'headAttachments', 'handAndMicrophone'), label)
        if hair and geometry:
            mark(('headAttachments', 'dynamicMotion'), label)
        if body and (geometry or any(k.startswith('TEXCOORD_') for k in attrs)):
            mark(('garmentsAndCoverage',), label)
        if geometry and body:
            mark(('seatContact', 'dynamicMotion'), label)
        if geometry and (shoes or 'Body' in label):
            mark(('feetAndFloor',), label)
        if geometry and not (face or hair or body):
            mark(CHECKS, f'Geometry classification unavailable for {label}')

    rig = ('headAttachments', 'handAndMicrophone', 'garmentsAndCoverage', 'feetAndFloor',
           'seatContact', 'dynamicMotion')
    if report.get('nodes') or report.get('skins') or report.get('sceneChanged'):
        mark(rig + ('facialExpressions',), 'Node hierarchy, rest pose, skin or scene changed')
    vrm = report.get('vrmFields', [])
    if 'humanoid' in vrm:
        mark(rig + ('facialExpressions',), 'Humanoid bone mapping changed')
    if any(key in vrm for key in ('expressions', 'firstPerson', 'lookAt')):
        mark(('facialExpressions', 'handAndMicrophone'), 'VRM expressions or face behavior changed')
    if report.get('springFields'):
        mark(('dynamicMotion', 'headAttachments', 'garmentsAndCoverage', 'seatContact'),
             'Spring bones or colliders changed')
    surface = report.get('surface', {})
    consumers = {r['material'] for r in surface.get('materials', [])}
    consumers.update(name for r in surface.get('images', []) for name in r['materials'])
    if consumers:
        mark(('surfaceAndTexture',), 'Material graph or a consumed image changed')
    if any('Body_' in name or 'CLOTH' in name for name in consumers):
        mark(('garmentsAndCoverage',), 'Body or garment material inputs changed')
    if any('Face' in name or 'Eye' in name for name in consumers):
        mark(('facialExpressions',), 'Face material inputs changed')
    if report['baseline']['sha256'] != report['candidate']['sha256']:
        mark(('runtimeRecordAndBudget',), 'Export byte identity changed')
    return {check: {'status': 'needs-recheck' if risk[check] else 'inputs-unchanged',
                    'reasons': risk[check]} for check in CHECKS}


def compare_exports(baseline, baseline_sha256, candidate, candidate_sha256):
    baseline_id, baseline_raw = read_pinned(Path(baseline), baseline_sha256)
    candidate_id, candidate_raw = read_pinned(Path(candidate), candidate_sha256)
    report = {
        'schema': 'native-dependency-delta-v1',
        'baseline': baseline_id,
        'candidate': candidate_id,
        'scope': 'Offline comparison for the same authoring template and export settings. '
                 'Input equality refers only to the dependencies observed here. '
                 'Fit, contact, motion, appearance and game admission require their own evidence.',
        'status': 'compared',
    }
    try:
        a, b = Export(baseline_raw), Export(candidate_raw)
        for table in a.names:
            require(a.names[table] == b.names[table], f'{table} identities or order changed')
        require(a.doc['asset'] == b.doc['asset'], 'Exporter metadata differs')
        primitives, topology, count = primitive_changes(a, b)
        nodes, skins, human = nodes_and_skins(a, b)
        ae, be = (export.vrm.get('expressions', {}) for export in (a, b))
        report.update(
            primitives=primitives, nodes=nodes, skins=skins, surface=surfaces(a, b),
            comparedCounts={'primitives': count, 'nodes': len(a.names['nodes']),
                            'skins': len(a.doc['skins']), 'images': len(a.names['images']),
                            'materials': len(a.names['materials']),
                            'baselineUsedAccessors': len(a.accessors), 'candidateUsedAccessors': len(b.accessors)},
            vrmFields=structural_changes(a.vrm, b.vrm),
            humanBoneChanges=human,
            expressionChanges={group: structural_changes(ae.get(group, {}), be.get(group, {}))
                               for group in structural_changes(ae, be)},
            springFields=structural_changes(a.spring or {}, b.spring or {}),
            springChanges=spring_changes(a, b),
            sceneChanged=(a.doc.get('scene'), a.doc['scenes']) != (b.doc.get('scene'), b.doc['scenes']),
        )
        if topology:
            raise Unsupported('Index topology differs at ' + ', '.join(topology))
    except (AssertionError, KeyError, IndexError, TypeError, ValueError, struct.error) as error:
        report.update(status='unsupported', reason=str(error) or type(error).__name__)
    report['requiredChecks'] = required_checks(report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True, type=Path)
    parser.add_argument('--baseline-sha256', required=True)
    parser.add_argument('--candidate', required=True, type=Path)
    parser.add_argument('--candidate-sha256', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.output.suffix.lower() != '.json':
            raise ValueError('Expected a new .json output path')
        if args.output.exists():
            raise FileExistsError(f'Output already exists: {args.output}')
        report = compare_exports(args.baseline, args.baseline_sha256, args.candidate, args.candidate_sha256)
        payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        with args.output.open('x', encoding='utf-8', newline='\n') as output:
            output.write(payload)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0 if report['status'] == 'compared' else 2


if __name__ == '__main__':
    raise SystemExit(main())
