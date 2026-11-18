"""Register exactly two published 1K tops on their own bodies and recheck the female torso coverage."""

import argparse
import json
from pathlib import Path

import numpy as np

import garment_basecolor_release as source
from asset_budget import ref
from flow import GLB, ROOT, Validator, require
from garment_source_mapping import json_bytes
from native_accessory_batch import load_script
from native_import import digest
from stripped_outfit_body import check_checkout, input_path, physical, pinned

RECIPE = source.ASSETS / 'runtime-fits.json'
PUBLIC = ROOT / 'prototype/public'
PACKAGE = PUBLIC / 'assets/garment-basecolor-release-v1'
REPORT = ROOT / 'evidence/m2-garment-basecolor-release-v1/runtime-fits.json'


def coverage(body, top, near, far, spec):
    original = json.loads(pinned(spec['coverage']))
    detail = json.loads(pinned(spec['selection']))
    require(
        original['schema'] == 'zbgs-outfit-body-coverage-candidate.1'
        and original['avatarSha256'] == far['compatibleAvatarSha256']
        and original['topId'] == near['id']
        and original['topSha256'] == near['sha256']
        and original['sourceSelectionReportSha256'] == spec['selection']['sha256'],
        'Coverage requires the exact parent top, selection and body',
    )
    require(
        all(detail[k] == original[k] for k in detail if k != 'sourceSelectionSamples'),
        'Original coverage and source witnesses disagree',
    )
    mesh = ref(body.doc['meshes'], original['bodyMeshIndex'], 'coverage mesh')
    prim = ref(mesh['primitives'], original['bodyPrimitive'], 'coverage primitive')
    require(
        mesh['name'] == original['bodyMesh']
        and body.doc['materials'][prim['material']]['name'] == original['bodyMaterial']
        and body.doc['accessors'][prim['indices']]['componentType']
        == original['bodyIndexComponentType']
        == 5125,
        'Coverage body geometry differs',
    )
    tris = np.asarray(body.accessor(prim['indices']), dtype='<u4').reshape(-1, 3)
    require(
        len(tris) == original['bodyFaceCount']
        and digest(tris.tobytes()) == original['bodyIndexAccessorSha256'],
        'Coverage topology changed',
    )
    faces = original['selectedFaceIds']
    require(
        faces == sorted(set(faces))
        and faces
        and all(type(i) is int and 0 <= i < len(tris) for i in faces)
        and tris[faces].tolist() == original['selectedTriangles']
        and sorted(set(tris[faces].flatten().tolist())) == original['selectedVertices'],
        'Coverage face identity changed',
    )
    # Reproject the seven recorded rest samples for each selected body face onto the actual far top triangles.
    points = np.array(body.accessor(prim['attributes']['POSITION']))
    cloth = top.doc['meshes'][0]['primitives'][0]
    garment = np.array(top.accessor(cloth['attributes']['POSITION']))
    cloth_faces = np.array(top.accessor(cloth['indices'])).reshape(-1, 3)
    samples = detail['sourceSelectionSamples']
    require(set(samples) == {str(i) for i in faces}, 'Coverage witness identities differ')
    hits, source_points, distances, indices = [], [], [], []
    for face in faces:
        group = samples[str(face)]
        corners = points[tris[face]]
        require(
            group['vertices'] == tris[face].tolist()
            and len(group['vertexSamples']) == 3
            and len(group['interiorSamples']) == 4,
            'Incomplete body-face witnesses',
        )
        for i, sample in enumerate(group['vertexSamples'] + group['interiorSamples']):
            source_points.append(corners[i] if i < 3 else np.asarray(sample['barycentric']) @ corners)
            hit = sample['hit']
            hits.append(hit['point'])
            distances.append(hit['distanceM'])
            indices.append(hit['topFace'])
    require(all(type(i) is int and 0 <= i < len(cloth_faces) for i in indices), 'Invalid witness top face')
    a, b, c = garment[cloth_faces[indices]].transpose(1, 0, 2)
    u, v, w = b - a, c - a, np.array(hits) - a

    def dot(x, y):
        return np.einsum('ij,ij->i', x, y)

    uu, uv, vv, wu, wv = dot(u, u), dot(u, v), dot(v, v), dot(w, u), dot(w, v)
    area = uu * vv - uv * uv
    require(np.all(area > 0), 'Degenerate top witness')
    s, t = (wu * vv - wv * uv) / area, (wv * uu - wu * uv) / area
    residual = np.linalg.norm(w - s[:, None] * u - t[:, None] * v, axis=1)
    require(
        np.all((s >= -1e-5) & (t >= -1e-5) & (s + t <= 1 + 1e-5))
        and np.max(residual) < 2e-6
        and np.max(np.abs(np.linalg.norm(np.array(hits) - source_points, axis=1) - distances)) < 2e-6,
        'Original coverage witnesses miss the candidate garment',
    )
    result = dict(
        original,
        id=far['id'] + '-torso-coverage',
        topId=far['id'],
        topSha256=far['sha256'],
        status='candidate; same rest coverage checked against the published 1K top',
        parentCoverage=spec['coverage'],
        sourceSelectionEvidence=spec['selection'],
    )
    del result['sourceSelectionReport'], result['sourceSelectionReportSha256']
    kept = np.delete(tris, faces, axis=0)
    return result, {
        'bodyTriangles': len(tris),
        'maskedTriangles': len(kept),
        'selectedFaces': len(faces),
        'maskedIndicesSha256': digest(kept.tobytes()),
        'restSurfaceHits': len(hits),
    }


def build(check_only):
    check_checkout()
    recipe = json.loads(physical(RECIPE).read_bytes())
    require(recipe['schema'] == 'garment-basecolor-release-fits-v1', 'Unknown runtime fit recipe')
    # Rebuild both parents and match every derived byte, including skin/rest, UV and full-image alpha.
    generated = source.build(check_only=True)
    derivations = json.loads(pinned(recipe['derivations']))
    reader = Validator()
    files = {}
    report = {}
    staged = []
    for spec in recipe['items']:
        ident = spec['id']
        row = reader.item(derivations, ident)
        require(
            spec['directory'] in ('male', 'female')
            and ident in generated
            and ident not in report
            and row['sha256'] == generated[ident],
            'Unknown or duplicate garment release',
        )
        out = physical(PACKAGE / spec['directory'])
        glb_path = physical(out / (ident + '.glb'))
        catalog_path = physical(out / 'equipment.json')
        require(
            catalog_path not in files
            and (spec['directory'] == 'female') == ('coverage' in spec) == ('selection' in spec),
            'Duplicate destination or missing body-specific coverage proof',
        )
        parent_catalog = json.loads(pinned(spec['nearCatalog']))
        near = reader.item(parent_catalog, spec['nearId'])
        body_sha = spec['body']['sha256']
        body = GLB(pinned(spec['body']))
        require(
            near['slot'] == 'top'
            and near['compatibleAvatarSha256'] == body_sha
            and near['sha256'] == row['sourceSha256']
            and near['sourceLicense'] == row['sourceLicense'],
            'Wrong near top, body or provenance',
        )
        # Check the actual near fit on this body, including the stripped male's independent catalog.
        old = reader.equipment(near, body_sha, body, spec['nearCatalog']['path'])
        raw = pinned({'path': row['path'], 'sha256': row['sha256']})
        far = dict(
            near,
            id=ident,
            fitId=ident + '-fit',
            styleId=near.get('styleId', near['id']),
            version=1,
            name=near['name'] + ' · 1K',
            url='/' + glb_path.relative_to(PUBLIC).as_posix(),
            sha256=digest(raw),
            bytes=len(raw),
            method=source.OPERATION,
            limits=[
                'Single opaque base color published at 1024x1024; exact body fit.',
                *near.get('limits', []),
            ],
        )
        far_src = dict(far, url=Path(row['path']).name)
        new = reader.equipment(far_src, body_sha, body, row['path'])
        require(
            (new['bones'], new['weightedVertices']) == (old['bones'], old['weightedVertices']),
            'Published skin differs from the parent fit',
        )
        files[glb_path] = raw
        files[catalog_path] = json_bytes({'schema': 'zbgs-equipment-v1', 'items': [far]})
        staged.append((far, body_sha, body, catalog_path))
        proof = {
            'near': old,
            'far': new,
            'parentSourceBodySha256': row['bodySha256'],
            'bodySha256': body_sha,
            'manifestSha256': digest(files[catalog_path]),
            'glbSha256': digest(raw),
        }
        if 'coverage' in spec:
            mask, proof['coverage'] = coverage(body, GLB(raw), near, far, spec)
            mask_path = physical(out / 'body-coverage.json')
            files[mask_path] = json_bytes(mask)
            proof['coverage']['sha256'] = digest(files[mask_path])
        report[ident] = proof
    require(len(report) == len(generated) and len(staged) == 2, 'Expected both exact garments')
    files[physical(REPORT)] = json_bytes(
        {
            'schema': 'garment-basecolor-runtime-fits-v1',
            'items': report,
            'verification': 'production CPU readback; game rendering separate',
        }
    )
    writer = load_script('garment_runtime_publish', 'scripts/native-vroid-equipment-extract.py')
    for path, data in files.items():
        if physical(path).exists() or check_only:
            writer.write_outputs({path.name: data}, path.parent, check=True)
    if not check_only:
        for path, data in files.items():
            writer.write_outputs({path.name: data}, physical(path).parent)
    for far, body_sha, body, path in staged:
        catalog = json.loads(physical(path).read_bytes())
        require(catalog['items'] == [far], 'Staged outfit catalog differs')
        Validator().equipment(catalog['items'][0], body_sha, body, path.relative_to(ROOT).as_posix())
    return report


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--check', action='store_true')
    print(json.dumps(build(cli.parse_args().check), ensure_ascii=True))
