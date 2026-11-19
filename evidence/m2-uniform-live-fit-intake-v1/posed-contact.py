"""Replay original and fitted glasses on four frozen posed meshes. Prints JSON; no renderer."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB

CAPTURE = ROOT / 'evidence/m2-uniform-live-fit-capture-v1'
FITS = ROOT / 'assets-source/uniform-glasses-transfer-v1/generated'
ASSETS = ROOT / 'prototype/public/assets'


def pinned(path, digest):
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == digest, path
    return raw


def transform(vertices, matrix):
    return vertices @ matrix[:3, :3].T + matrix[:3, 3]


def bend(original, control):
    assert hashlib.sha256(original.astype('<f4').tobytes()).hexdigest() == control['positionSHA256']
    out = original.astype('<f4')
    ids = []
    for ring in control['rings']:
        ix = ring['indices']
        ids.extend(ix)
        rot = np.asarray(ring['rotationRowMajor']).reshape(3, 3)
        out[ix] = (original[ix] - ring['sourceCenter']) @ rot.T + ring['targetCenter']
    assert sorted(ids) == list(range(len(original))) and len(control['rings']) == 4
    return out.astype(float)


def alphas(model):
    result = {}
    for m in model.doc['materials']:
        name = m['name']
        if not (('_Face_' in name or '_Body_' in name) and 'SKIN' in name or '_HAIR' in name):
            continue
        tex = m['pbrMetallicRoughness']['baseColorTexture']['index']
        image = model.doc['images'][model.doc['textures'][tex]['source']]
        view = model.doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        with Image.open(io.BytesIO(model.binary[start:start+view['byteLength']])) as bitmap:
            result[name] = {'mode':m.get('alphaMode','OPAQUE'), 'alpha':bitmap.convert('RGBA').getchannel('A').getextrema()}
    return result


algo_sha = '69fc4a67a24ee0f693d2845451e97975dc72338546c8bffa813fdb83b9a3db03'
source = pinned(ROOT / 'scripts/m1-assets/qa-layer-rest-triangles.py', algo_sha).decode()
# Same read-only method as qa-acc01-diagnose.py; do not run the skirt file's own CLI.
functions = {'np':np}
exec(source[source.index('def bary('):source.index('colliders=[]')], functions)
check = functions['check']
capture = json.loads(pinned(CAPTURE/'verified.json', 'f7e43fff3e99602ebbe7e203e937209093939520f8dc690ac1e6af85082be23a'))
provenance = json.loads(pinned(FITS/'provenance.json', '85d67a577c0d9e9517664561bac9b51981d427c7eac4ac7046f7a612323e400d'))
glass_sha = provenance['accessory']['sha256']
glasses = GLB(pinned(ASSETS/'m1c/studio-glasses-v1.glb', glass_sha))
sources = {}
for node in glasses.doc['nodes']:
    if 'mesh' not in node:
        continue
    assert set(node) == {'name','mesh'}
    prim, = glasses.doc['meshes'][node['mesh']]['primitives']
    sources[node['name']] = (np.asarray(glasses.accessor(prim['attributes']['POSITION'])),
                             np.asarray(glasses.accessor(prim['indices'])).reshape(-1, 3))


def intersections(triangles, surface, scale):
    result = check(triangles, surface)
    return {'pairs':len(result['pairs']), 'segmentSumWorldM':sum(p['length'] for p in result['pairs'])*scale,
            'unresolvedCoplanar':result['coplanarAABBUnresolved']}


def one(pose, candidate, alpha):
    key = candidate['body'] + '-' + pose
    evidence = capture['cases'][key]
    d = json.loads(gzip.decompress(pinned(CAPTURE/'capture'/(key+'.json.gz'), evidence['archiveSha256'])))
    profile = json.loads(pinned(FITS/candidate['file'], candidate['sha256']))
    identity = d['live']['accessories']['glasses']['identity']
    assert identity['fit']['id'] == 'legacy-glasses-fit-v1' and identity['accessorySHA256'] == profile['accessorySHA256'] == glass_sha
    assert identity['bodySHA256'] == evidence['bodySha256'] == candidate['targetSha256'] == profile['bodySHA256']
    assert d['pose'] == pose and d['snapshot'] == evidence['snapshot'] and d['counts'] == evidence['triangles']
    matrix = np.array(d['glassesMatrix']).reshape(4,4).T
    inverse = np.linalg.inv(matrix)
    scale = np.linalg.norm(matrix[:3,0])
    np.testing.assert_allclose(matrix[:3,:3].T @ matrix[:3,:3], np.eye(3)*scale**2, atol=1e-12)
    controls = {c['mesh']:c for c in profile['controls']}
    assert set(controls) == {'Temple-1','Temple1'}
    surfaces = {'face':[], 'body':[], 'hair':[]}
    for m in d['meshes']:
        if m['role'] == 'glasses':
            continue
        name = m['materials'][0]['name']
        group = 'hair' if m['role'] == 'hair' else 'face' if '_Face_' in name else 'body'
        assert name in alpha and (group == 'hair' or alpha[name]['alpha'] == (255,255))
        assert group != 'body' or '_Body_' in name
        surfaces[group].extend(transform(np.array(m['positions']), inverse)[m['triangles']])
    surfaces = {kind:np.asarray(rows) for kind,rows in surfaces.items()}
    assert len(surfaces['face']) + len(surfaces['body']) == d['counts']['skin']
    assert len(surfaces['hair']) == d['counts']['hair']
    metrics = {}
    margin = float('inf')
    cutoff = d['head'][1] - .22
    for m in d['meshes']:
        if m['role'] != 'glasses':
            continue
        name = m['name']
        original, indices = sources[name]
        actual = transform(np.asarray(m['positions']), inverse)
        np.testing.assert_allclose(actual, original, rtol=0, atol=1e-12)
        np.testing.assert_array_equal(m['triangles'], indices)
        before = {s:intersections(actual[indices], surf, scale) for s,surf in surfaces.items()}
        after = before
        fitted = actual
        if name in controls:
            fitted = bend(original, controls[name])
            after = {s:intersections(fitted[indices], surf, scale) for s,surf in surfaces.items()}
        margin = min(margin, min(transform(actual,matrix)[:,1]) - cutoff, min(transform(fitted,matrix)[:,1]) - cutoff)
        metrics[name] = {'original':before, 'fourRings':after}
    assert set(metrics) == set(sources) and margin > 0
    return {'case':key, 'captureSha256':evidence['archiveSha256'], 'fitSha256':candidate['sha256'],
            'skinTriangles':d['counts']['skin'], 'hairTriangles':d['counts']['hair'],
            'glassesMinimumAboveCaptureCutoffWorldM':margin, 'worldScale':scale, 'byMesh':metrics}


rows, alpha_proof = [], {}
for c in provenance['candidates']:
    folder = {'source-female-uniform-texture-v1':'female-uniform-texture-release-v1',
              'source-male-cc0-texture-release-v1':'cc0-body-release-v1'}[c['body']]
    alpha_proof[c['body']] = alphas(GLB(pinned(ASSETS/folder/'body.vrm', c['targetSha256'])))
    for pose in ('stand','sit'):
        rows.append(one(pose, c, alpha_proof[c['body']]))
print(json.dumps({'schema':'uniform-glasses-posed-contact-v1', 'triangleAlgorithmSha256':algo_sha,
                  'accessorySha256':glass_sha, 'skinAndHairBaseColor':alpha_proof, 'cases':rows}, indent=2))
