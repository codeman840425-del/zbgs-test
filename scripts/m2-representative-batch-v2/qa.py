"""Readback of the six exported candidates and two explicit source failures."""
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
from scipy.interpolate import BSpline
from deform import ROOT, GLB, Source, primitive, section_widths, sha, require, legacy

BASE = ROOT/'assets-source/m2-representative-batch-v2'


def main():
    manifest = json.loads((BASE/'generated/manifest.json').read_bytes()); results = []
    spec = json.loads((BASE/'spec.json').read_bytes())
    originals = {sex: Source((ROOT/s['body']['path']).read_bytes()) for sex, s in spec['sources'].items()}
    for row in manifest['variants']:
        folder = BASE/'generated'/row['id']
        if row['status'] == 'failed':
            require((folder/'FAILED.json').exists() and not (folder/'avatar.vrm').exists(), 'Failed preset must not admit an avatar')
            results.append({'id': row['id'], 'status': 'failed-source-retained', 'reason': row['error']}); continue
        for key in ['avatar', 'equipmentManifest', 'fit', 'profile', 'report']:
            data = (ROOT/row[key]['path']).read_bytes(); require(sha(data) == row[key]['sha256'] and len(data) == row[key]['bytes'], 'Output reference mismatch: '+key)
        g = GLB((folder/'avatar.vrm').read_bytes()); source = originals[row['sex']]
        require(g.doc['nodes'] == source.g.doc['nodes'] and g.doc['skins'] == source.g.doc['skins'], 'Raw bones/binds changed')
        report = json.loads((folder/'build-report.json').read_bytes())
        require(report['repeatExport']['allAssetBytesIdentical'], 'Actual repeated asset export missing')
        for p in [p for m in g.doc['meshes'] for p in m['primitives']]:
            for index in list(p['attributes'].values())+[a for t in p.get('targets', []) for a in t.values()]:
                require(np.isfinite(np.array(g.accessor(index))).all(), 'Nonfinite attribute/morph')
        c = report['faceCurve']; curve = BSpline(c['knots'], c['coefficientsM'], c['degree']); t = np.linspace(0, 1, 401)
        require(curve(t, 1).min() >= -1e-9 and curve(t, 2).max() <= 1e-8, 'Continuous width constraint invalid')
        face = primitive(g, 'Face_00_SKIN'); P = np.array(g.accessor(face['attributes']['POSITION']))-source.context['joints']['head']; F = np.array(g.accessor(face['indices']), int).reshape(-1, 3)
        y = np.linspace(P[np.unique(F), 1].min()+.0001, source.face_hi, 101); widths = section_widths(P, F, y)
        backstep = float(np.maximum(-np.diff(widths), 0).max())
        items = json.loads((folder/'equipment.json').read_bytes())['items']
        for entry in items:
            raw = (folder/entry['url']).read_bytes(); require(sha(raw) == entry['sha256'] and len(raw) == entry['bytes'], 'Garment identity mismatch')
            require(entry['compatibleAvatarSha256'] == row['avatar']['sha256'], 'Garment targets wrong body')
            require(entry['id'].startswith(row['id']+'-'), 'Garment must have its new v2 identity')
        require(all(t['sourceOffsetPreservationMaxErrorM'] < 1e-10 and t['minimumJacobianDeterminant'] > .12 for t in report['garmentTransfers']), 'Donor offset/normal map failure')
        results.append({'id': row['id'], 'status': 'export-readback-passed', 'parameterIntent': c['intentStatus'],
            'requestedToActualFaceHalfWidthMaxDifferenceMm': c['maximumProjectionDifferenceM']*1000,
            'continuousMinimumWidthDerivative': float(curve(t, 1).min()), 'continuousMaximumWidthSecondDerivative': float(curve(t, 2).max()),
            'actualExportMaximumHalfWidthBackstepMm': backstep*1000,
            'sourceOffsetPreservationMaxErrorM': max(r['sourceOffsetPreservationMaxErrorM'] for r in report['garmentTransfers']),
            'morphEndpointMaxErrorM': max(r['morphEndpointMaxErrorM'] for r in report['trace']['groups']),
            'actualContourYMetres': y.tolist(), 'actualHalfWidthsM': widths.tolist()})
    files = [p for directory in [BASE, ROOT/'scripts/m2-representative-batch-v2'] for p in directory.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name not in ['qa-report.json', 'package-files.json']]
    inventory = [{'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())} for p in sorted(files)]
    result = {'schema': 'representative-batch-v2-source-qa', 'reviewRole': 'source-author readback, not independent review',
        'status': 'partial-six-exports-two-source-failures', 'allEightAccepted': False, 'variants': results, 'runtimeAccepted': False, 'GPUUsed': False}
    (BASE/'qa-report.json').write_bytes((json.dumps(result, indent=2)+'\n').encode())
    (BASE/'package-files.json').write_bytes((json.dumps({'files': inventory}, indent=2)+'\n').encode())
    print(json.dumps([{k: v for k, v in r.items() if not isinstance(v, list)} for r in results], indent=2))


if __name__ == '__main__': main()
