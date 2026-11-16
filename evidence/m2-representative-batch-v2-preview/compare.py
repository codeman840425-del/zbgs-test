"""Read-only millimetre comparison of exact original, fixed v1 and partial v2."""
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
module_spec = importlib.util.spec_from_file_location('fixed_source_sections', ROOT/'evidence/m2-representative-shape-diagnosis-v1/probe.py')
diagnosis = importlib.util.module_from_spec(module_spec); module_spec.loader.exec_module(diagnosis)
GLB = diagnosis.deform.GLB
OUT = Path(__file__).resolve().parent


def stage(body_path, top_path, y, head, levels):
    body = GLB(body_path.read_bytes()); top = GLB(top_path.read_bytes())
    P, F = diagnosis.arrays(body, 'Body_00_SKIN'); Q, G = diagnosis.arrays(top, 'Tops_01_CLOTH'); face, triangles = diagnosis.arrays(body, 'Face_00_SKIN')
    body_width = diagnosis.sections(P, F, [y])[0]['widthM']; top_width = diagnosis.sections(Q, G, [y])[0]['widthM']
    contour = diagnosis.sections(face, triangles, levels, head)
    half = np.array([c['widthM']/2 for c in contour])
    return {'bodySha256': diagnosis.pin(body_path)['sha256'], 'topSha256': diagnosis.pin(top_path)['sha256'],
        'bodySectionWidthMm': body_width*1000, 'topSectionWidthMm': top_width*1000, 'topMinusBodyWidthMm': (top_width-body_width)*1000,
        'actualFaceMaximumHalfWidthBackstepMm': float(np.maximum(-np.diff(half), 0).max(initial=0))*1000,
        'faceSections': contour}


def main():
    package = ROOT/'assets-source/m2-representative-batch-v2'; spec = json.loads((package/'spec.json').read_bytes()); manifest = json.loads((package/'generated/manifest.json').read_bytes()); rows = []
    for v in manifest['variants']:
        if v['status'] == 'failed':
            rows.append({'id': v['id'], 'status': 'failed-no-v2-resource', 'reason': v['error']}); continue
        source = spec['sources'][v['sex']]; source_body_path = ROOT/source['body']['path']; source_top_path = ROOT/source['equipment'][0]['path']
        context = diagnosis.deform.source_context(GLB(source_body_path.read_bytes())); H = context['joints']['head']
        g = GLB(source_top_path.read_bytes()); P, F = diagnosis.arrays(g, 'Tops_01_CLOTH'); ids = np.unique(F); lower = ids[P[ids, 1] < P[ids, 1].min()+.06]
        at = lower[np.argmax(abs(P[lower, 0]))]; y = float(P[at, 1])
        old = ROOT/'assets-source/m2-representative-batch-v1/generated'/v['basePresetId']; new = package/'generated'/v['id']
        body_paths = [source_body_path, old/'avatar.vrm', new/'avatar.vrm']; face_mins = []
        for path in body_paths:
            p, f = diagnosis.arrays(GLB(path.read_bytes()), 'Face_00_SKIN'); face_mins.append(float((p[np.unique(f)]-H)[:, 1].min()))
        levels = np.linspace(max(face_mins)+.0001, context['eyeMin'][1]-H[1]-.006, 101)
        stages = {'original': stage(source_body_path, source_top_path, y, H, levels),
            'v1': stage(old/'avatar.vrm', old/(v['basePresetId']+'-top.glb'), y, H, levels),
            'v2': stage(new/'avatar.vrm', new/(v['id']+'-top.glb'), y, H, levels)}
        report = json.loads((new/'build-report.json').read_bytes())
        rows.append({'id': v['id'], 'status': 'source-comparison-only', 'sourceSectionYM': y, 'stages': stages,
            'requestedVsActualFaceHalfWidthMaxMm': report['faceCurve']['maximumProjectionDifferenceM']*1000})
        print(v['id'], {k: {key: round(r[key], 4) for key in ['bodySectionWidthMm', 'topSectionWidthMm', 'topMinusBodyWidthMm', 'actualFaceMaximumHalfWidthBackstepMm']} for k, r in stages.items()})
    result = {'schema': 'representative-v2-source-comparison', 'rows': rows, 'method': 'Same physical source-height triangle-plane sections and same lower-face head-local y samples for original/v1/v2.',
        'limits': ['Top-minus-body cross-section width is an observable total width difference; it does not replace individual per-vertex source offset preservation evidence.',
            'No runtime, animation, continuous collision or artistic acceptance. Original source topology and CPU texture/shading limits remain.'], 'runtimeAccepted': False}
    (OUT/'measurements.json').write_bytes((json.dumps(result, indent=2)+'\n').encode())


if __name__ == '__main__': main()
