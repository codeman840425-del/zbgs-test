"""CPU re-export, exact dependencies and zero-write rejection checks."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
import numpy as np
import build


def snapshot(directory):
    return {p.relative_to(directory).as_posix(): (build.sha(p.read_bytes()), p.stat().st_mtime_ns) for p in directory.rglob('*') if p.is_file()}


def last_error(result, mirror):
    line = result.stderr.strip().splitlines()[-1]
    line = line.replace(str(mirror).replace('\\', '\\\\'), '<mirror>').replace(str(mirror), '<mirror>')
    return line.replace('\\\\', '/').replace('\\', '/')


def main():
    source = build.BASE
    spec = json.loads((source/'spec.json').read_bytes())
    outputs = ['baseball-cap.glb', 'fit.json', 'manifest.json', 'build-report.json', 'qa-report.json']
    exports = source/'exports'; exports.mkdir(exist_ok=True)
    variant_spec = copy.deepcopy(spec)
    variant_spec['geometry']['brimLengthM'] = spec['parameterEdit']['brimLengthM']
    variant_path = source/'brim-length-edit.json'
    variant_bytes = build.encoded(variant_spec)
    build.require(not variant_path.exists() or variant_path.read_bytes() == variant_bytes, 'Existing brim edit spec differs')
    if not variant_path.exists(): variant_path.write_bytes(variant_bytes)
    variant_dir = exports/'brim-length-edit'
    command = [sys.executable, '-B', str(build.ROOT/'scripts/m2-hat-hair-v1/build.py')]
    subprocess.run(command+['--spec', variant_path.relative_to(build.ROOT).as_posix(), '--out', variant_dir.relative_to(build.ROOT).as_posix()], cwd=build.ROOT, check=True, capture_output=True)
    variant_before = snapshot(variant_dir)
    subprocess.run(command+['--spec', variant_path.relative_to(build.ROOT).as_posix(), '--out', variant_dir.relative_to(build.ROOT).as_posix()], cwd=build.ROOT, check=True, capture_output=True)
    build.require(variant_before == snapshot(variant_dir), 'Brim edit repeat changes bytes or mtime')
    base_glb = build.GLB((source/'generated/baseball-cap.glb').read_bytes())
    edit_glb = build.GLB((variant_dir/'baseball-cap.glb').read_bytes())
    base_brim = np.array(base_glb.accessor(base_glb.doc['meshes'][1]['primitives'][0]['attributes']['POSITION']))
    edit_brim = np.array(edit_glb.accessor(edit_glb.doc['meshes'][1]['primitives'][0]['attributes']['POSITION']))
    advance = float(base_brim[:, 2].min()-edit_brim[:, 2].min())
    build.require(abs(advance-.01) < 1e-7, 'Declared brim edit does not change actual forward extent by 10mm')
    base_shell = base_glb.accessor(base_glb.doc['meshes'][0]['primitives'][0]['attributes']['POSITION'])
    edit_shell = edit_glb.accessor(edit_glb.doc['meshes'][0]['primitives'][0]['attributes']['POSITION'])
    build.require(np.array_equal(base_shell, edit_shell), 'Brim edit changes hat shell or rear opening')
    with tempfile.TemporaryDirectory(prefix='qa-mirror-', dir=exports) as temporary:
        mirror = Path(temporary)
        names = ['scripts/m2-hat-hair-v1/build.py', 'scripts/production/flow.py', 'scripts/m2-socks-layer-v1/qa.py', 'assets-source/m2-hat-hair-v1/spec.json',
                 spec['body']['path'], spec['hair']['path'], spec['hair']['manifestPath'], spec['hair']['fitPath']]
        for name in names:
            target = mirror/name; target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(build.ROOT/name, target)
        runner = [sys.executable, '-B', str(mirror/'scripts/m2-hat-hair-v1/build.py')]
        first = subprocess.run(runner, cwd=mirror, capture_output=True, text=True)
        build.require(first.returncode == 0, 'First mirror export failed: '+first.stderr)
        destination = mirror/'assets-source/m2-hat-hair-v1/generated'
        for name in outputs:
            build.require((destination/name).read_bytes() == (source/'generated'/name).read_bytes(), 'Fresh mirror output differs: '+name)
        before = snapshot(destination)
        repeat = subprocess.run(runner, cwd=mirror, capture_output=True, text=True)
        build.require(repeat.returncode == 0 and snapshot(destination) == before, 'Repeat changes candidate')
        (destination/'manifest.json').write_bytes(b'existing conflicting candidate\n')
        conflict_before = snapshot(mirror)
        conflict = subprocess.run(runner, cwd=mirror, capture_output=True, text=True)
        build.require(conflict.returncode != 0 and snapshot(mirror) == conflict_before, 'Conflicting destination writes files')
        refused = [{'case': 'conflictingOutput', 'exit': conflict.returncode, 'lastError': last_error(conflict, mirror), 'zeroWrites': True}]
        body_path = mirror/spec['body']['path']; original = body_path.read_bytes()
        body_path.write_bytes(original[:-1]+bytes([original[-1]^1]))
        for case in ['corruptBody', 'missingBody']:
            if case == 'missingBody': body_path.unlink()
            before = snapshot(mirror)
            result = subprocess.run(runner, cwd=mirror, capture_output=True, text=True)
            build.require(result.returncode != 0 and snapshot(mirror) == before, case+' changed files or passed')
            refused.append({'case': case, 'exit': result.returncode, 'lastError': last_error(result, mirror), 'zeroWrites': True})
        body_path.write_bytes(original)
        for case, value in [('invalidNumber', float('nan')), ('unsupportedBrim', -.02)]:
            bad = copy.deepcopy(spec); bad['geometry']['brimLengthM'] = value
            input_path = mirror/'assets-source/m2-hat-hair-v1/invalid.json'; input_path.write_bytes(build.encoded(bad))
            before = snapshot(mirror)
            result = subprocess.run(runner+['--spec', input_path.relative_to(mirror).as_posix()], cwd=mirror, capture_output=True, text=True)
            build.require(result.returncode != 0 and snapshot(mirror) == before, case+' changed files or passed')
            refused.append({'case': case, 'exit': result.returncode, 'lastError': last_error(result, mirror), 'zeroWrites': True})
    report = {'passed': True, 'firstMirrorExportMatchesFiveFiles': True, 'repeatPreservesBytesAndMtimes': True, 'refusals': refused,
              'brimEdit': {'baseM': .055, 'editM': .065, 'actualForwardExtentDeltaM': advance, 'shellPositionsIdentical': True,
                           'baseAssetSha256': build.sha((source/'generated/baseball-cap.glb').read_bytes()), 'editAssetSha256': build.sha((variant_dir/'baseball-cap.glb').read_bytes()), 'repeatBytesAndMtimesIdentical': True},
              'sourceDependenciesRechecked': True, 'review': 'source-author CPU checks', 'runtimeAccepted': False}
    build.validate(spec)
    (source/'qa-source.json').write_bytes(build.encoded(report))
    # Inventory excludes itself and temporary mirrors, retaining the one edit export.
    files = [p for p in source.rglob('*') if p.is_file() and p.name != 'package-files.json']+list((build.ROOT/'scripts/m2-hat-hair-v1').glob('*'))
    rows = [{'path': p.relative_to(build.ROOT).as_posix(), 'sha256': build.sha(p.read_bytes()), 'bytes': p.stat().st_size} for p in sorted(files) if p.is_file()]
    (source/'package-files.json').write_bytes(build.encoded({'files': rows, 'runtimeAccepted': False}))
    print(json.dumps(report, indent=2))


if __name__ == '__main__': main()
