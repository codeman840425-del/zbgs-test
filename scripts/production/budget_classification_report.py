"""Classify static budget evidence into transport, decode, GPU and PC gates."""
import argparse
import hashlib
import json
from pathlib import Path
import re


MEASURED_STATUSES = {'over-budget', 'within-static-limits'}
ASSET_GROUPS = {'garment': 'garments', 'accessory': 'accessories', 'hair': 'hair'}
COST_SCOPES = ('selectedCost', 'startupAndSelectedCost')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def excesses(model):
    return model.get('assetExcesses', [])


def classification_static_failures(record):
    gates = record.get('resourceGates') or {}
    failures = ['body'] if gates.get('body') == 'failed' else []
    for group in (*ASSET_GROUPS.values(), 'aggregate'):
        failures.extend(f'{group}.{key}' for key, status in (gates.get(group) or {}).items()
                        if status == 'failed')
    if not failures and record.get('staticBudgetStatus') == 'over-budget':
        failures.append('record')
    return failures


def record_identity(record):
    values = {key: record.get(key) for key in ('id', 'revision', 'recordSha256')}
    if all(value is None for value in values.values()):
        return {}
    identifier, revision, digest = values.values()
    if (not isinstance(identifier, str) or not identifier or type(revision) is not int or revision < 1
            or not isinstance(digest, str) or not re.fullmatch(r'[a-f0-9]{64}', digest)):
        raise ValueError('Incomplete signed record identity in measured budget')
    return {'recordId': identifier, 'revision': revision, 'recordSha256': digest}


def classify_record(record):
    bodies = [model for model in record['models'] if model.get('class') == 'body']
    if len(bodies) != 1:
        raise ValueError('Expected one measured body per record')
    body = bodies[0]
    assets = {group: {model['id']: excesses(model) for model in record['models']
                      if model.get('class') == kind}
              for kind, group in ASSET_GROUPS.items()}
    totals = record['selectedCost']['totals']
    aggregate = {scope: record[scope]['aggregateExcesses'] for scope in COST_SCOPES}
    if any(not isinstance(failures, list) for failures in aggregate.values()):
        raise ValueError('Expected measured aggregate budget results')
    row = {
        'bodyType': record['bodyType'],
        'bodySha256': record['avatarSha256'],
        **record_identity(record),
        'transport': {
            'status': 'measured',
            'closureSourceBytes': record['closureSourceBytes'],
            'selectedFileBytes': totals['fileBytes'],
            'standaloneEncodedImageBytes': totals.get('standaloneEncodedImageBytes', 0),
        },
        'decodeCanvas': {
            'status': 'static-estimate',
            'rgba8MipBytes': totals['rgba8MipBytes'],
            'textureObjects': totals['textureObjects'],
            'bodyExcesses': excesses(body),
            'garmentExcesses': assets['garments'],
            'accessoryExcesses': assets['accessories'],
            'hairExcesses': assets['hair'],
            'aggregateExcesses': aggregate,
            'canvasDerivedHairCost': 'included in selected look' if 'reviewedLegacyAppearanceCache' in record
                                     else 'no reviewed legacy cache in this record budget',
            **({'appearanceCachePixelCosts': record['reviewedLegacyAppearanceCache']['totals']}
               if 'reviewedLegacyAppearanceCache' in record else {}),
        },
        'gpu': {
            'status': 'unmeasured',
            'observedGpuBytes': None,
            'observedTextureLifetime': False,
            'reason': 'RGBA8 mip totals and KTX CPU transcode bytes are estimates, not GPU residency',
        },
        'ordinaryPC': {'status': 'unmeasured'},
        'resourceGates': {
            'body': 'failed' if excesses(body) else 'passed-static',
            **{group: {key: 'failed' if failures else 'passed-static' for key, failures in items.items()}
               for group, items in assets.items()},
            'aggregate': {scope: 'failed' if failures else 'passed-static'
                          for scope, failures in aggregate.items()},
        },
    }
    status = record.get('status')
    if status not in MEASURED_STATUSES or (status == 'within-static-limits' and classification_static_failures(row)):
        raise ValueError('Expected a supported and consistent record budget')
    row['staticBudgetStatus'] = status
    return row


def classify_ktx(source_report):
    samples = []
    for sample in source_report.get('samples', []):
        encoded = sample['encoded']
        levels = encoded['header']['levels']
        samples.append({
            'id': sample['id'], 'sourcePngBytes': sample['sourcePngBytes'],
            'ktxBytes': encoded['bytes'], 'encodingSeconds': encoded['encodingSeconds'],
            'cpuTranscodedMipUncompressedBytes': sum(level['uncompressedByteLength'] for level in levels),
            'transport': 'measured', 'decodeCanvas': 'source PNG retained separately',
            'gpu': 'unmeasured', 'ordinaryPC': 'unmeasured',
        })
    return {'status': 'pilot-only-fixed-801', 'samples': samples,
            'limitations': ['The pilot targets fixed build/body samples, not the two native FaceContour bodies.',
                            'KTX validation and CPU transcode do not establish GPU residency, Canvas allocations, or ordinary-PC performance.']}


def classify(budget, budget_path, ktx, ktx_path):
    if budget.get('schema') != 'zbgs-character-record-budget-result-v1' or budget.get('status') not in MEASURED_STATUSES:
        raise ValueError('Expected a measured record budget')
    if not isinstance(budget.get('records'), list) or not budget['records']:
        raise ValueError('Record budget has no measured records')
    records = [classify_record(record) for record in budget['records']]
    blocked = any(classification_static_failures(item) for item in records)
    if blocked != (budget['status'] == 'over-budget'):
        raise ValueError('Batch budget status differs from measured record results')
    return {
        'schema': 'native-batch-budget-classification-v1', 'status': 'blocked' if blocked else 'static-candidate',
        'source': {'budget': {'path': budget_path.as_posix(), 'sha256': sha(Path(budget_path))},
                   'ktxPilot': {'path': ktx_path.as_posix(), 'sha256': sha(Path(ktx_path))}},
        'layers': {
            'transport': 'Encoded file and closure bytes measured from source files',
            'decodeCanvas': 'RGBA8/mip and texture-object static estimates. Canvas-derived color paths require a separate cost model',
            'gpu': 'No observed GPU residency or lifetime evidence',
            'ordinaryPC': 'No ordinary-PC frame or memory evidence',
        },
        'records': records, 'ktxPilot': classify_ktx(ktx),
        'nextEvidence': ['Run the same estimator for each new body and each selected garment/accessory separately.',
                         'Measure browser texture/Canvas allocations and release after a settled actor.',
                         'Measure ordinary-PC memory/frame time with the fixed build and exact records.'],
    }


def main():
    from production_paths import project_output

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--budget', type=Path, required=True)
    parser.add_argument('--ktx', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = project_output(args.output, __file__)
    report = classify(json.loads(args.budget.read_bytes()), args.budget, json.loads(args.ktx.read_bytes()), args.ktx)
    with output.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'status': report['status'], 'records': len(report['records'])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
