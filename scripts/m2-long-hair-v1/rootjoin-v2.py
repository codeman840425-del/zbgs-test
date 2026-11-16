"""One welded local hair-root revision; v1 source and release remain frozen."""
import argparse
import copy
import importlib.util
import io
import json
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build as original
from flow import GLB, local, require
BASE = original.BASE
REV = BASE/'revisions/rootjoin-v2'
PREFIX = '/assets/m2-long-hair-rootjoin-v2/'


def read_inputs():
    spec = json.loads((REV/'spec.json').read_text(encoding='utf-8'))
    inventory_path = BASE/'generated/package-files.json'; inventory_bytes = inventory_path.read_bytes()
    require(original.sha(inventory_bytes) == spec['sourceInventorySha256'], 'Frozen v1 inventory identity changed')
    for row in json.loads(inventory_bytes)['files']:
        data = local(original.ROOT, row['path']).read_bytes()
        require(original.sha(data) == row['sha256'] and len(data) == row['bytes'], 'Frozen v1 file changed: '+row['path'])
    refs = [('female-ponytail.glb', 'sourceAssetSha256'), ('fit.json', 'sourceFitSha256'), ('manifest.json', 'sourceManifestSha256')]
    for name, key in refs: require(original.sha((BASE/'generated'/name).read_bytes()) == spec[key], 'V1 source identity mismatch: '+name)
    return spec, inventory_bytes


def append_accessor(doc, blob, values, kind, component=5126):
    values = np.asarray(values, dtype='<u2' if component == 5123 else '<u4' if component == 5125 else '<f4')
    blob.extend(b'\0'*(-len(blob) % 4)); doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': values.nbytes}); blob.extend(values.tobytes())
    row = {'bufferView': len(doc['bufferViews'])-1, 'componentType': component, 'count': len(values), 'type': kind}
    if kind == 'VEC3': row.update(min=values.min(0).tolist(), max=values.max(0).tolist())
    doc['accessors'].append(row); return len(doc['accessors'])-1


def components(faces):
    remaining = set(int(v) for v in faces.flat); neighbors = {i: set() for i in remaining}; count = 0
    for a, b, c in faces:
        neighbors[int(a)].update([int(b), int(c)]); neighbors[int(b)].update([int(a), int(c)]); neighbors[int(c)].update([int(a), int(b)])
    while remaining:
        count += 1; stack = [remaining.pop()]
        while stack:
            for child in neighbors[stack.pop()] & remaining: remaining.remove(child); stack.append(child)
    return count


def edge_uses(faces):
    edges = {}
    for face in faces:
        for a, b in zip(face, np.roll(face, -1)):
            a, b = int(a), int(b); edges.setdefault(tuple(sorted([a, b])), []).append((a, b))
    return edges


def produce(spec):
    old_bytes = (BASE/'generated/female-ponytail.glb').read_bytes(); old = GLB(old_bytes); doc = copy.deepcopy(old.doc)
    p = doc['meshes'][0]['primitives'][0]
    attrs = {name: np.array(old.accessor(index)) for name, index in p['attributes'].items()}
    attrs['JOINTS_0'] = attrs['JOINTS_0'].astype(int)
    F = np.array(old.accessor(p['indices']), int).reshape(-1, 3)
    source_spec = json.loads((BASE/'spec.json').read_text(encoding='utf-8'))
    source, source_primitive, cap, cap_faces, inverse, root = original.source(source_spec)
    source_ids = np.unique(np.array(source.accessor(source_primitive['indices']), int))
    center_id = int(np.flatnonzero(source_ids == spec['patchSourceVertex'])[0])
    patch = np.flatnonzero((F[:len(cap_faces)] == center_id).any(1))
    require(len(patch) == 6, 'Expected six-face original cap fan')
    edges = edge_uses(F[patch]); boundary = [uses[0] for uses in edges.values() if len(uses) == 1]
    require(len(boundary) == 6 and len({a for a, b in boundary}) == 6, 'Cap patch must have one directed six-edge boundary')
    following = dict(boundary)
    start = max(following, key=lambda i: (attrs['POSITION'][i, 0], -abs(attrs['POSITION'][i, 1]-attrs['POSITION'][center_id, 1])))
    ring = [start]
    while following[ring[-1]] != start: ring.append(following[ring[-1]])
    require(len(ring) == 6, 'Disconnected patch boundary')
    cap_count = len(cap['POSITION']); radial = source_spec['radialDivisions']; axial = source_spec['axialDivisions']
    require(spec['replacedTubeSpans'] == 1, 'Measured root correction replaces exactly the first tube span')
    tube_ring = list(range(cap_count+radial, cap_count+radial*2))
    base_start = len(cap_faces)+axial*radial*2; tie_start = base_start+radial*2
    keep = np.ones(len(F), bool); keep[patch] = False; keep[base_start:base_start+radial] = False; keep[tie_start:] = False
    keep[len(cap_faces):len(cap_faces)+radial*2] = False
    axis_u = np.array([1., 0, 0]); axis_v = np.cross(attrs['NORMAL'][center_id], axis_u); axis_v /= np.linalg.norm(axis_v)
    def angles(ids, center):
        delta = attrs['POSITION'][ids]-center
        return np.unwrap(np.arctan2(delta @ axis_v, delta @ axis_u))
    cap_angles = angles(ring, attrs['POSITION'][center_id])
    tube_angles = angles(tube_ring, attrs['POSITION'][tube_ring].mean(0))
    require(np.all(np.diff(cap_angles) > 0) and np.all(np.diff(tube_angles) > 0), 'Root boundary azimuth must be monotonic')
    cap_angles = np.append(cap_angles, cap_angles[0]+2*np.pi); tube_angles = np.append(tube_angles, tube_angles[0]+2*np.pi)
    bridge = []; i = j = 0
    while i < len(ring) or j < len(tube_ring):
        if j == len(tube_ring) or (i < len(ring) and cap_angles[i+1] <= tube_angles[j+1]):
            bridge.append([ring[i % len(ring)], ring[(i+1) % len(ring)], tube_ring[j % len(tube_ring)]]); i += 1
        else:
            bridge.append([ring[i % len(ring)], tube_ring[(j+1) % len(tube_ring)], tube_ring[j % len(tube_ring)]]); j += 1
    bridge = np.array(bridge, int); retained = F[keep]; joined = np.vstack([retained, bridge])
    for ring_index in range(1, spec['rootWeightBlendRings']+1):
        ids = np.arange(cap_count+ring_index*radial, cap_count+(ring_index+1)*radial); fraction = ring_index/4
        attrs['JOINTS_0'][ids] = [0, 1, 0, 0]; attrs['WEIGHTS_0'][ids] = [1-fraction, fraction, 0, 0]
    # Recompute only the welded boundary normals from all incident triangles.
    touched = np.unique(bridge); normals = np.zeros_like(attrs['POSITION'])
    crosses = np.cross(attrs['POSITION'][joined[:, 1]]-attrs['POSITION'][joined[:, 0]], attrs['POSITION'][joined[:, 2]]-attrs['POSITION'][joined[:, 0]])
    require(np.min(np.linalg.norm(crosses, axis=1)) > 1e-12, 'Root join contains a degenerate face')
    for column in range(3): np.add.at(normals, joined[:, column], crosses)
    attrs['NORMAL'][touched] = normals[touched]/np.linalg.norm(normals[touched], axis=1)[:, None]
    used = np.unique(joined); lookup = {int(old_id): i for i, old_id in enumerate(used)}
    faces = np.array([[lookup[int(v)] for v in face] for face in joined], int)
    packed = {key: values[used] for key, values in attrs.items()}
    edge_map = edge_uses(faces)
    require(all(len(v) <= 2 and (len(v) == 1 or v[0] == v[1][::-1]) for v in edge_map.values()), 'Root join has nonmanifold or inconsistent winding')
    old_boundary = {key for key, values in edge_uses(F).items() if len(values) == 1}
    new_boundary = {tuple(sorted([int(used[a]), int(used[b])])) for (a, b), values in edge_map.items() if len(values) == 1}
    require(old_boundary == new_boundary and components(faces) == 1, 'Root join adds an open seam or detached component')
    blob = bytearray(old.binary)
    p['attributes'] = {key: append_accessor(doc, blob, values, 'VEC4' if key in ['JOINTS_0', 'WEIGHTS_0'] else 'VEC2' if key == 'TEXCOORD_0' else 'VEC3', 5123 if key == 'JOINTS_0' else 5126) for key, values in packed.items()}
    p['indices'] = append_accessor(doc, blob, faces.reshape(-1, 1), 'SCALAR', 5125)
    doc['buffers'][0]['byteLength'] = len(blob); doc['asset']['generator'] = 'm2-long-hair rootjoin-v2 welded local root source'
    text = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode(); text += b' '*(-len(text) % 4); blob.extend(b'\0'*(-len(blob) % 4))
    raw = struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(blob))+struct.pack('<I4s', len(text), b'JSON')+text+struct.pack('<I4s', len(blob), b'BIN\0')+blob
    trace = {'sourceAssetSha256': spec['sourceAssetSha256'], 'removedCapOriginalFaces': patch.tolist(), 'sourceCapBoundaryOldVertexIds': ring,
        'tubeRootOldVertexIds': tube_ring, 'removedTubeBaseTriangles': radial, 'removedTorusTriangles': len(F)-tie_start,
        'replacedTubeSideOriginalFaces': list(range(len(cap_faces), len(cap_faces)+radial*2)),
        'newConnectorTriangles': len(bridge), 'retainedOldVertexMappingSha256': original.sha(used.astype('<u4').tobytes()),
        'capBoundaryAzimuthRad': cap_angles[:-1].tolist(), 'tubeBoundaryAzimuthRad': tube_angles[:-1].tolist(),
        'vertices': len(used), 'triangles': len(faces), 'connectedSurfaceComponents': 1, 'boundaryEdgesUnchanged': len(new_boundary),
        'capBoundaryPositionsAndUVUnchanged': True, 'allRetainedRestPositionsUnchanged': True,
        'newRootWeightVertices': radial*spec['rootWeightBlendRings'], 'headInverseBindColumnMajor': inverse.T.reshape(-1).tolist(),
        'sourceBodySha256': source_spec['source']['sha256'], 'skeletonAndInverseBindsUnchanged': True}
    return raw, trace, packed, faces, np.array([[lookup[int(v)] for v in face] for face in bridge]), source, inverse


def check_geometry(P, F, UV, bridge, source, inverse):
    helper_path = original.ROOT/'scripts/m2-socks-layer-v1/qa.py'; module_spec = importlib.util.spec_from_file_location('rootjoin_diagnostics', helper_path)
    diagnostics = importlib.util.module_from_spec(module_spec); module_spec.loader.exec_module(diagnostics)
    rows = []
    samples = np.vstack([P[np.unique(bridge)], P[bridge].mean(1), (P[bridge[:, 0]]+P[bridge[:, 1]])/2, (P[bridge[:, 1]]+P[bridge[:, 2]])/2, (P[bridge[:, 2]]+P[bridge[:, 0]])/2])
    for mi, pi in [(0, 0), (1, 7), (0, 1)]:
        p = source.doc['meshes'][mi]['primitives'][pi]; Q = original.apply(np.array(source.accessor(p['attributes']['POSITION'])), inverse); G = np.array(source.accessor(p['indices']), int).reshape(-1, 3)
        pairs = diagnostics.intersections(P, bridge, Q, G); distance = diagnostics.nearest_distance(samples, Q[G])
        rows.append({'material': source.doc['materials'][p['material']]['name'], 'connectorNoncoplanarTrianglePairs': len(pairs),
                     'firstPairs': pairs[:8], 'minimumSampledConnectorDistanceM': float(distance.min())})
    self_pairs = diagnostics.intersections(P, F, P, F, True); bridge_start = len(F)-len(bridge)
    connector_self = [p for p in self_pairs if p[0] >= bridge_start or p[1] >= bridge_start]
    hair = source.doc['meshes'][0]['primitives'][5]; material = source.doc['materials'][hair['material']]
    image = source.doc['images'][source.doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
    view = source.doc['bufferViews'][image['bufferView']]
    pixels = np.array(Image.open(io.BytesIO(source.binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']])).convert('RGBA'))
    uv_samples = np.vstack([UV[np.unique(bridge)], UV[bridge].mean(1), (UV[bridge[:, 0]]+UV[bridge[:, 1]])/2, (UV[bridge[:, 1]]+UV[bridge[:, 2]])/2, (UV[bridge[:, 2]]+UV[bridge[:, 0]])/2])
    xy = np.clip(np.floor(uv_samples*[pixels.shape[1], pixels.shape[0]]).astype(int), 0, [pixels.shape[1]-1, pixels.shape[0]-1])
    minimum_alpha = int(pixels[xy[:, 1], xy[:, 0], 3].min()); require(minimum_alpha == 255, 'Connector source texture samples must remain opaque')
    return {'sourceBodyHeadAndCollar': rows, 'newConnectorSelfPairs': len(connector_self), 'firstConnectorSelfPairs': connector_self[:8],
        'samples': len(samples), 'connectorSampleMinimumSourceAlpha': minimum_alpha, 'geometryHelperSha256': original.sha(helper_path.read_bytes()), 'runtimeAccepted': False}


def make_plan(spec):
    raw, trace, attrs, faces, bridge, source, inverse = produce(spec)
    fit = json.loads((BASE/'generated/fit.json').read_text(encoding='utf-8')); old_fit = copy.deepcopy(fit)
    fit.update(id='female-ponytail-v1-rootjoin-fit-v2', version=2, assetSha256=original.sha(raw))
    require(fit['dynamics'] == old_fit['dynamics'], 'Root revision must preserve all physics/proxy settings')
    manifest = json.loads((BASE/'generated/manifest.json').read_text(encoding='utf-8'))
    manifest.update(version=2, url=PREFIX+'female-ponytail.glb', sha256=original.sha(raw), bytes=len(raw),
                    fit={'id': fit['id'], 'version': 2, 'url': PREFIX+'fit.json', 'sha256': original.sha(original.encoded(fit))})
    checks = check_geometry(attrs['POSITION'], faces, attrs['TEXCOORD_0'], bridge, source, inverse)
    if checks['newConnectorSelfPairs'] or any(r['connectorNoncoplanarTrianglePairs'] for r in checks['sourceBodyHeadAndCollar']):
        failure = REV/'attempt-3'
        if not failure.exists():
            failure.mkdir(); (failure/'female-ponytail.glb').write_bytes(raw)
            (failure/'failure.json').write_bytes(original.encoded({'spec': spec, 'trace': trace, 'checks': checks, 'runtimeAccepted': False}))
    require(checks['newConnectorSelfPairs'] == 0 and all(r['connectorNoncoplanarTrianglePairs'] == 0 for r in checks['sourceBodyHeadAndCollar']), 'Measured root connector crosses source geometry; preserve evidence before another construction')
    plan = {'female-ponytail.glb': raw, 'fit.json': original.encoded(fit), 'manifest.json': original.encoded(manifest),
        'build-report.json': original.encoded({'spec': spec, 'generatorSha256': original.sha(Path(__file__).read_bytes()), 'trace': trace, 'runtimeAccepted': False}),
        'qa-report.json': original.encoded({'passed': True, 'checks': checks, 'connectedComponents': 1, 'physicsAndProxiesUnchanged': True,
            'originalBodyAndV1FilesUnchanged': True, 'runtimeAccepted': False, 'limits': ['Static geometry and welded vertex topology only. No game motion, furniture contact or visual acceptance.']})}
    return plan


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out'); args = ap.parse_args(); spec, inventory_bytes = read_inputs()
    out = local(original.ROOT, args.out) if args.out else REV
    require(out == REV or out.is_relative_to(REV/'exports'), 'Output must remain inside rootjoin-v2')
    plan = make_plan(spec); repeated = make_plan(spec); require(plan == repeated, 'Root revision repeat bytes differ')
    for name, data in plan.items(): require(not (out/name).exists() or (out/name).read_bytes() == data, 'Existing revision output differs; choose a fresh --out: '+name)
    for name, data in plan.items():
        target = out/name; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists(): target.write_bytes(data)
    require((BASE/'generated/package-files.json').read_bytes() == inventory_bytes, 'Frozen v1 inventory changed')
    print(json.dumps({'exported': True, 'assetSha256': original.sha(plan['female-ponytail.glb']), 'manifestSha256': original.sha(plan['manifest.json']), 'fitSha256': original.sha(plan['fit.json'])}))


if __name__ == '__main__': main()
