"""Check the original PNG, mesh and transform evidence; print a reproducible summary."""
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def read(path):
    return json.loads(path.read_bytes())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


base = Path(__file__).resolve().parent
folder = base / 'capture'
report = read(folder / 'report.json')
assert not report.get('failure') and not report['errors'] and not report['consoleErrors']
targets = {body: (asset, digest) for body, asset, digest in read(base / 'cases.json')}
rows = {}
for case in report['cases']:
    body, pose = case['body'], case['pose']
    stem = body + '-' + pose
    assert stem not in rows
    expected_id, expected_sha = targets[body]
    for key in ('identity', 'finalIdentity'):
        r = case[key]
        assert r['primary']['id'] == expected_id
        assert r['primary']['declaredSha256'] == r['primary']['actualSha256'] == expected_sha
        assert r['runtimeBuild']['sourceDigest'] == r['servedBuild']['sourceDigest'] == '73d6f64eeebc771fe656820578f82249745ca88124df58c0945f1750555b3799'
    archive = folder / (stem + '.json.gz')
    sample = json.loads(gzip.decompress(archive.read_bytes()))
    assert sample['live']['avatarSha256'] == expected_sha and sample['pose'] == pose
    assert sample['live']['accessories']['glasses']['identity']['fit']['id'] == 'legacy-glasses-fit-v1'
    assert sample['snapshot'] == case['snapshot']
    assert sample['snapshot']['sitProgress'] == {'stand': 0, 'sit': 1}[pose]
    inverse = np.linalg.inv(np.array(sample['glassesMatrix']).reshape(4, 4).T)
    counts = dict(skin=0, hair=0, earPositiveX=0, earNegativeX=0, temples={})
    for mesh in sample['meshes']:
        vertices, indices = np.array(mesh['positions']), np.array(mesh['triangles'])
        assert vertices.shape[1] == indices.shape[1] == 3 and np.isfinite(vertices).all()
        assert indices.min() >= 0 and indices.max() < len(vertices)
        if mesh['role'] in ('skin', 'hair'):
            counts[mesh['role']] += len(indices)
        if mesh['name'] in ('Temple-1', 'Temple1') and mesh['role'] == 'glasses':
            counts['temples'][mesh['name']] = len(indices)
        if mesh['role'] == 'skin' and any('_Face_' in m['name'] and 'SKIN' in m['name'] for m in mesh['materials']):
            local = (vertices @ inverse[:3, :3].T + inverse[:3, 3])[indices]
            for sign, side, field in [(1, 'positiveX', 'earPositiveX'), (-1, 'negativeX', 'earNegativeX')]:
                members = np.flatnonzero(((sign * local[:, :, 0] > .072) & (local[:, :, 2] < -.065)).all(axis=1)).tolist()
                assert members == mesh['earTriangleIndices'][side]
                counts[field] += len(members)
    assert counts == case['counts'] == sample['counts']
    assert all(counts[key] > 0 for key in ('skin','hair','earPositiveX','earNegativeX'))
    assert set(counts['temples']) == {'Temple-1','Temple1'} and min(counts['temples'].values()) > 0
    views = {}
    for angle in ('front','left','right','three-quarter'):
        png = folder / (stem + '-' + angle + '.png')
        with Image.open(png) as image:
            assert image.format == 'PNG' and min(image.size) > 0
            image.verify()
        views[angle] = sha(png)
    rows[stem] = {'bodySha256': expected_sha, 'snapshot': sample['snapshot'], 'triangles': counts,
                  'archiveSha256': sha(archive), 'viewSha256': views}

assert set(rows) == {body + '-' + pose for body in targets for pose in ('stand','sit')}
print(json.dumps({'reportSha256': sha(folder/'report.json'), 'cases': rows}, indent=2))
