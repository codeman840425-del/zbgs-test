"""Classify static budget evidence into transport, decode, GPU and PC gates."""
import argparse
import json
from pathlib import Path
import hashlib


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def excesses(model):
    return model.get('assetExcesses', [])


def classify_record(record):
    models = {model['id']: model for model in record['models']}
    body = models.get('body', {})
    garments = [model for model in record['models'] if model.get('class') == 'garment']
    accessories = [model for model in record['models'] if model.get('class') == 'accessory']
    totals = record['selectedCost']['totals']
    return {
        'bodyType': record['bodyType'],
        'bodySha256': record['avatarSha256'],
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
            'garmentExcesses': {model['id']: excesses(model) for model in garments},
            'accessoryExcesses': {model['id']: excesses(model) for model in accessories},
            'canvasDerivedHairCost': 'unsupported unless the selected hair color model is explicitly budgeted',
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
            'garments': {model['id']: 'failed' if excesses(model) else 'passed-static' for model in garments},
            'accessories': {model['id']: 'failed' if excesses(model) else 'passed-static' for model in accessories},
        },
    }


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
    records = [classify_record(record) for record in budget['records']]
    gate = 'blocked' if any(
        item['resourceGates']['body'] == 'failed' or any(value == 'failed' for value in item['resourceGates']['garments'].values())
        or any(value == 'failed' for value in item['resourceGates']['accessories'].values())
        for item in records) else 'static-candidate'
    return {
        'schema': 'native-batch-budget-classification-v1', 'status': gate,
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
