"""Read back the retained garment coverage producer and exact runtime descriptor."""
import hashlib
import json
from pathlib import PurePosixPath


def validate_garment_coverage(v, ident, require, GLB):
    base = 'assets-source/m2-garment-coverage-v1/'
    package = json.loads(v.pin(ident['manifest'], ident['manifestSha256']))
    require(package['schema'] == 'zbgs-garment-coverage-package-v1' and
            package['id'] == 'm2-male-open-vest-panels-v2-inner-top-back-mask-v1',
            'Garment coverage package schema/ID mismatch')
    rows = package['files']
    require(rows and len({row['path'] for row in rows}) == len(rows), 'Garment coverage inventory empty/duplicate')
    for row in rows:
        path = PurePosixPath(row['path'])
        require(not path.is_absolute() and '..' not in path.parts and len(path.parts) == 1,
                'Unsafe garment coverage package path')
        v.pin(base + row['path'], row['sha256'], row['bytes'])
    spec = v.json(base + 'spec.json')
    require(spec['schema'] == 'zbgs-garment-coverage-source-v1' and
            spec['id'] == package['id'], 'Garment coverage source spec mismatch')
    top = GLB(v.pin(spec['innerTop'], spec['innerTopSha256']))
    outer = GLB(v.pin(spec['outer'], spec['outerSha256']))
    body_bytes = v.pin('prototype/public/assets/foundation/base-male-roundtrip.vrm', spec['bodySha256'])
    require(body_bytes and spec['parentTopSha256'] == spec['innerTopSha256'], 'Garment coverage body/top parent mismatch')
    top_primitive = top.doc['meshes'][0]['primitives'][spec['innerTopPrimitive']]
    require(top_primitive['attributes']['POSITION'] is not None and
            top.doc['materials'][top_primitive['material']]['name'] == spec['innerTopMaterial'],
            'Garment coverage top primitive/material mismatch')
    index_accessor = top.doc['accessors'][top_primitive['indices']]
    require(index_accessor['componentType'] == 5125 and index_accessor['type'] == 'SCALAR',
            'Garment coverage top index component mismatch')
    top_index_view = top.doc['bufferViews'][index_accessor['bufferView']]
    index_bytes = top.binary[top_index_view.get('byteOffset', 0):top_index_view.get('byteOffset', 0) + top_index_view['byteLength']]
    mask = v.json(base + 'coverage-mask.json')
    require(mask['schema'] == 'zbgs-garment-coverage-mask-v1' and mask['id'] == package['id'] and
            mask['innerTopSha256'] == spec['innerTopSha256'] and mask['outerAssetSha256'] == spec['outerSha256'] and
            mask['innerTopId'] == spec['innerTopId'] and mask['outerId'] == spec['outerId'] and
            mask['innerTopMaterial'] == spec['innerTopMaterial'], 'Garment coverage mask identity mismatch')
    require(mask['topFaceCount'] == index_accessor['count'] // 3 and
            mask['topIndexComponentType'] == 5125 and
            hashlib.sha256(index_bytes).hexdigest() == mask['topIndexAccessorSha256'],
            'Garment coverage top index identity mismatch')
    faces = mask['selectedFaceIds']; triangles = mask['selectedTriangles']; raw = list(top.accessor(top_primitive['indices']))
    raw = [row[0] for row in raw]
    require(faces and len(faces) == len(set(faces)) == len(triangles), 'Garment coverage selection empty/duplicate')
    for face, triangle in zip(faces, triangles):
        require(isinstance(face, int) and 0 <= face < mask['topFaceCount'] and
                triangle == raw[face * 3:face * 3 + 3], 'Garment coverage face/index mismatch')
    require(mask['coveredTriangleCount'] == len(faces) and mask['observations']['innerSidePassed'] is True and
            mask['observations']['openBoundaryMarginPassed'] is True and
            mask['observations']['minOpenBoundaryMarginM'] >= .005 and
            mask['binding']['bodySha256'] == spec['bodySha256'], 'Garment coverage geometry witness mismatch')
    report = v.json(base + 'report.json')
    require(report['sourceFiles']['innerTop']['sha256'] == spec['innerTopSha256'] and
            report['sourceFiles']['outer']['sha256'] == spec['outerSha256'] and
            report['coveredTriangleCount'] == len(faces), 'Garment coverage producer report mismatch')
    qa = v.json(base + 'qa-report.json')
    require(qa['passed'] is True and qa['selectedTriangles'] == len(faces) and qa['GPUUsed'] is False,
            'Garment coverage CPU QA mismatch')
    runtime_qa = v.json(base + 'runtime-qa.json')
    require(runtime_qa['passed'] is True and runtime_qa['GPUUsed'] is False and
            runtime_qa['runtimeOrVisualAcceptance'] is False, 'Garment coverage runtime QA mismatch')
    public_path = 'prototype/public/assets/m2-garment-coverage-v1/coverage-mask.json'
    source_mask = v.pin(base + 'coverage-mask.json', next(row['sha256'] for row in rows if row['path'] == 'coverage-mask.json'))
    require(v.pin(public_path, hashlib.sha256(source_mask).hexdigest(), len(source_mask)) == source_mask,
            'Garment coverage public/source descriptor mismatch')
    runtime = v.item(v.json('prototype/public/assets/m1b/equipment.json'), spec['outerId'])
    require(runtime['sha256'] == spec['outerSha256'] and runtime['compatibleAvatarSha256'] == spec['bodySha256'] and
            runtime['layerWith'] == ['m1b-uniform-top'], 'Garment coverage outer runtime identity mismatch')
    return {'id': package['id'], 'inventoryFiles': len(rows), 'innerTopSha256': spec['innerTopSha256'],
            'outerSha256': spec['outerSha256'], 'bodySha256': spec['bodySha256'],
            'coveredTriangleCount': len(faces), 'coveredAreaM2': mask['coveredAreaM2'],
            'minOpenBoundaryMarginM': mask['observations']['minOpenBoundaryMarginM'],
            'runtimeDescriptorMatchesSource': True, 'cpuGeometryAndRuntimeQA': True,
            'scope': 'Stored source/mask/public identity and CPU geometry witness only; no exporter, GPU, browser or visual acceptance.'}
