"""Actual original/v1/v2 source surfaces in the same front/side/back CPU views."""
import importlib.util
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/m2-representative-batch-v1'))
module_spec = importlib.util.spec_from_file_location('fixed_batch_raster', ROOT/'scripts/m2-representative-batch-v1/preview.py')
raster = importlib.util.module_from_spec(module_spec); module_spec.loader.exec_module(raster)
BASE = ROOT/'assets-source/m2-representative-batch-v2'
OUT = ROOT/'evidence/m2-representative-batch-v2-preview'


def parts(avatar, gear):
    result = raster.triangles(avatar, True)
    for asset in gear: result += raster.triangles(asset)
    return result


def main():
    started = time.perf_counter(); spec = json.loads((BASE/'spec.json').read_bytes()); manifest = json.loads((BASE/'generated/manifest.json').read_bytes())
    OUT.mkdir(parents=True, exist_ok=True); font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17); receipts = []
    for sex in ['female', 'male']:
        source = spec['sources'][sex]; original = parts(ROOT/source['body']['path'], [ROOT/e['path'] for e in source['equipment']])
        H = raster.source_context(raster.GLB((ROOT/source['body']['path']).read_bytes()))['joints']['head']
        for row in [r for r in manifest['variants'] if r['sex'] == sex]:
            old = ROOT/'assets-source/m2-representative-batch-v1/generated'/row['basePresetId']; current = BASE/'generated'/row['id']
            stages = [('Original', original), ('v1 fixed', parts(old/'avatar.vrm', [old/(row['basePresetId']+'-'+k+'.glb') for k in ['top', 'bottom', 'shoes']]))]
            stages.append(('v2 projected candidate', parts(current/'avatar.vrm', [current/(row['id']+'-'+k+'.glb') for k in ['top', 'bottom', 'shoes']])) if row['status'] == 'source-passed' else ('v2 FAILED - no asset admitted', None))
            full = Image.new('RGB', (1500, 1740), '#f0f0f0'); head = Image.new('RGB', (1500, 1320), '#f0f0f0')
            for column, (label, geometry) in enumerate(stages):
                for image in [full, head]: ImageDraw.Draw(image).text((column*500+10, 10), label, fill='#222222', font=font)
                for view, angle in enumerate([0., np.pi/2, np.pi]):
                    if geometry is None:
                        for image, height in [(full, 560), (head, 420)]: ImageDraw.Draw(image).text((column*500+15, 100+view*height), 'FAILED: inspect retained FAILED.json', fill='#a33131', font=font)
                        continue
                    full.paste(raster.render(geometry, np.array([0, .85, 0]), 1.9, angle, (500, 530)), (column*500, 40+view*560))
                    head.paste(raster.render(geometry, H+np.array([0, .055, -.015]), .34, angle, (500, 400)), (column*500, 40+view*420))
            full.save(OUT/(row['id']+'-full.png')); head.save(OUT/(row['id']+'-head.png'))
            receipts.append({'id': row['id'], 'status': row['status'], 'v1BodySha256': raster.sha((old/'avatar.vrm').read_bytes()), 'v2BodySha256': row.get('avatar', {}).get('sha256')})
            print(row['id'], 'CPU preview written', flush=True)
    result = {'schema': 'batch-v2-three-view-source-preview', 'views': ['front', 'side', 'back'], 'columns': ['exact original', 'fixed v1', 'v2 candidate or explicit FAILED'],
        'method': 'Read-only original UV/normals CPU orthographic z-buffer, neutral source pose; same camera scales as v1 previews', 'fullBodyVerticalSpanM': 1.9, 'headVerticalSpanM': .34,
        'limits': ['Approximate base colour and lighting, alpha threshold, no MToon/outline/game motion.', 'No v2 image is synthesized for failed variants.'], 'variants': receipts, 'seconds': time.perf_counter()-started, 'runtimeAccepted': False}
    (OUT/'report.json').write_bytes((json.dumps(result, indent=2)+'\n').encode())


if __name__ == '__main__': main()
