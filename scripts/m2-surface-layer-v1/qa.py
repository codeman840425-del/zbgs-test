"""CPU pixel protection, two independent source edits and exact repeat proof."""
import copy
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build
from flow import require


def image(data):
    return np.array(Image.open(io.BytesIO(data)))


def compose(base, layers):
    result = base.copy()
    for layer in layers:
        alpha = layer[..., 3:4].astype(float)/255
        result[..., :3] = np.rint(result[..., :3]*(1-alpha)+layer[..., :3]*alpha).astype('uint8')
    return result


def main():
    spec = json.loads((build.BASE/'spec.json').read_text(encoding='utf-8')); out = build.BASE/'generated'
    saved = {p.name: build.sha(p.read_bytes()) for p in out.iterdir() if p.is_file()}
    plan = build.make_plan(spec)
    require(all((out/n).read_bytes() == data for n, data in plan.items()), 'Stored exports differ from deterministic repeat')
    manifest = json.loads(plan['manifest.json']); rows = []
    for variant in manifest['variants']:
        name = variant['bodyType']; source = build.read_source(spec['bodies'][name])[-1]
        protected = image(plan[variant['protectedMask']['url']]) > 0
        overlays = [image(plan[layer['url']]) for layer in variant['layers']]
        checks = []
        for layer, overlay in zip(variant['layers'], overlays):
            region = image(plan[layer['regionMask']['url']]) > 0; alpha = overlay[..., 3] > 0
            require(overlay.shape == source.shape and alpha.any(), 'Layer shape/coverage invalid')
            require(not np.any(alpha & (protected | ~region)), 'Layer escaped region or touched protected pixels')
            combined = compose(source, [overlay])
            require(np.array_equal(combined[..., 3], source[..., 3]) and np.array_equal(combined[protected], source[protected]), 'Protected source color/alpha changed')
            require(np.count_nonzero(np.any(combined != source, axis=2)) > 0, 'Layer made no actual pixel difference')
            checks.append({'layer': layer['id'], 'nonzeroAlphaPixels': int(alpha.sum()), 'regionPixels': int(region.sum()), 'protectedChangedPixels': 0})
        combined = compose(source, overlays); reversed_order = compose(source, overlays[::-1])
        overlap = (overlays[0][..., 3] > 0) & (overlays[1][..., 3] > 0)
        require(overlap.any() and not np.array_equal(combined, reversed_order), 'Independent layer order has no actual overlap witness')
        require(np.array_equal(combined[..., 3], source[..., 3]) and np.array_equal(combined[protected], source[protected]), 'Stack changed protected source data')
        rows.append({'bodyType': name, 'sourcePixelSha256': build.sha(source.tobytes()), 'layers': checks,
                     'overlapPixels': int(overlap.sum()), 'stackPixelSha256': build.sha(combined.tobytes()),
                     'reverseOrderPixelSha256': build.sha(reversed_order.tobytes()), 'sourceAlphaUnchanged': True,
                     'unloadReturnsExactSourcePixels': np.array_equal(compose(source, []), source)})
    edits = []
    for layer in ['freckles', 'blush']:
        changed = copy.deepcopy(spec); changed['layers'][layer]['opacity'] *= .75
        variant = build.make_plan(changed)
        other = 'blush' if layer == 'freckles' else 'freckles'
        for body in spec['bodies']:
            require(variant[body+'-'+layer+'.png'] != plan[body+'-'+layer+'.png'], 'Source parameter edit did not change actual layer PNG')
            require(variant[body+'-'+other+'.png'] == plan[body+'-'+other+'.png'], 'Independent parameter edit changed other layer')
            require(variant[body+'-protected.png'] == plan[body+'-protected.png'], 'Color intensity edit changed protection')
            edits.append({'body': body, 'layer': layer, 'parameter': 'opacity', 'value': changed['layers'][layer]['opacity'],
                          'variantPngSha256': build.sha(variant[body+'-'+layer+'.png']), 'otherLayerExact': True})
    one_side = copy.deepcopy(spec)
    for layer in one_side['layers'].values(): layer['sides'] = ['left']
    left = build.make_plan(one_side)
    side_proof = []
    for body in spec['bodies']:
        g, mi, pi, primitive, mat, refs, pixels = build.read_source(spec['bodies'][body])
        xyz, normal, coverage, aliases = build.raster(g, primitive, 1024, 1024)
        _, _, _, trace = build.regions(g, mi, primitive, xyz, normal, coverage, aliases, spec['anatomy'])
        for name in spec['layers']:
            alpha = image(left[body+'-'+name+'.png'])[..., 3] > 0
            require(alpha.any() and not np.any(alpha & (xyz[..., 0] >= trace['centerXM'])), 'Left side source edit leaked to right')
        side_proof.append({'body': body, 'geometryAliasPixels': int(aliases.sum()), 'leftOnlyAlphaOnRight': 0})
    rejected = []
    def rejects(label, changed, expected):
        try: build.validate(changed)
        except (ValueError, TypeError) as error:
            require(expected in str(error), 'Unexpected rejection: '+str(error)); rejected.append(label)
        else: raise AssertionError('Accepted '+label)
    for value in [-.1, 1.1, float('nan'), True]:
        bad = copy.deepcopy(spec); bad['layers']['blush']['opacity'] = value
        rejects('opacity '+str(value), bad, 'opacity must be finite')
    bad = copy.deepcopy(spec); bad['bodies']['male']['sha256'] = '0'*64; rejects('wrong body identity', bad, 'exact original body')
    bad = copy.deepcopy(spec); bad['layers']['freckles']['unexpected'] = 1; rejects('unknown layer parameter', bad, 'unknown source parameter')
    missing = subprocess.run([sys.executable, '-B', str(Path(__file__).with_name('build.py')), '--spec', 'assets-source/m2-surface-layer-v1/missing.json'], capture_output=True, text=True, encoding='utf-8')
    require(missing.returncode == 2 and json.loads(missing.stdout)['status'] == 'invalid', 'Missing input CLI did not fail structurally')
    bad = copy.deepcopy(spec); bad['layers']['blush']['opacity'] = 1.1
    with tempfile.NamedTemporaryFile(dir=build.BASE, suffix='.json', delete=False) as stream:
        invalid_path = Path(stream.name); stream.write(build.json_bytes(bad))
    try:
        invalid = subprocess.run([sys.executable, '-B', str(Path(__file__).with_name('build.py')), '--spec', invalid_path.relative_to(build.ROOT).as_posix()], capture_output=True, text=True, encoding='utf-8')
        require(invalid.returncode == 2 and 'blush opacity' in json.loads(invalid.stdout)['error'], 'Invalid source opacity CLI did not reject with layer location')
    finally: invalid_path.unlink()
    require(saved == {p.name: build.sha(p.read_bytes()) for p in out.iterdir() if p.is_file()}, 'Read-only planning or rejection changed outputs')
    report = {'passed': True, 'repeatPngAndManifestBytesExact': True, 'bodies': rows, 'actualParameterExportEdits': edits,
              'sideProof': side_proof, 'rejectedInputs': rejected, 'missingInputExitCode': missing.returncode,
              'invalidOpacityInputExitCode': invalid.returncode,
              'failedInputWrites': 0, 'GPUUsed': False, 'runtimeAccepted': False,
              'limits': ['Rest geometry to UV mask only. Skin layers follow existing Face UVs through expressions without a new deformation proof.',
                         'CPU source-over RGBA8 proof only. Browser decoded pixels, shader/map/shade binding and actual expression/skin tone remain for runtime admission.']}
    (out/'qa-report.json').write_bytes(build.json_bytes(report))
    files = [p for directory in [build.BASE, Path(__file__).resolve().parent] for p in directory.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name != 'package-files.json']
    (out/'package-files.json').write_bytes(build.json_bytes({'files': [{'path': p.relative_to(build.ROOT).as_posix(), 'sha256': build.sha(p.read_bytes()), 'bytes': p.stat().st_size} for p in sorted(files)]}))
    print(json.dumps({'passed': True, 'bodies': rows, 'rejectedInputs': rejected, 'runtimeAccepted': False}))


if __name__ == '__main__': main()
