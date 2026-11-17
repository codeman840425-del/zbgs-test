"""Read-only male native source preflight, reusing the sealed native audit."""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
import sys
sys.dont_write_bytecode = True
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import platform
import time
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = Path(__file__).resolve().parent
SOURCE = 'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm'
EDITABLE = 'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid'
PINS = {SOURCE: 'a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da',
        EDITABLE: 'c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a'}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=BASE / 'generated')
    args = parser.parse_args()
    output = args.out.resolve()
    assert not output.exists(), 'Fresh output required; existing evidence is immutable'
    for relative, expected in PINS.items():
        assert sha(ROOT / relative) == expected, 'Source identity mismatch: ' + relative
    rb = load('male_preflight_native_readback', 'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/readback.py')
    a = rb.a
    g = a.reader.GLB(ROOT / SOURCE)
    d = g.doc
    skeleton, world, names = rb.skeleton(g)
    assert d['extensions']['VRMC_vrm']['specVersion'] == '1.0'
    selectors = {}
    for slot, token in [('body', '_Body_'), ('top', '_Tops_'), ('bottom', '_Bottoms_'), ('shoes', '_Shoes_')]:
        matches = [m['name'] for m in d['materials'] if token in m['name']]
        assert len(matches) == 1, (slot, matches)
        selectors[slot] = rb.primitive(g, world, names, matches[0])
    rows = []
    for slot, p in selectors.items():
        attrs, ids = p['attrs'], p['ids']
        weights = attrs['WEIGHTS_0'][ids].astype(float)
        joints = attrs['JOINTS_0'][ids].astype(int)
        assert np.isfinite(weights).all() and (weights >= 0).all()
        assert joints.min() >= 0 and joints.max() < len(p['jointNames'])
        assert np.max(np.abs(weights.sum(1) - 1)) < 1e-5
        used = sorted(set(np.array(p['jointNames'])[joints[weights > 0]].tolist()))
        parent = {c: i for i, node in enumerate(d['nodes']) for c in node.get('children', [])}
        ancestors = set()
        for name in used:
            node = names.index(name)
            while node is not None:
                ancestors.add(node)
                node = parent.get(node)
        ni = p['meta']['node']
        skin_id = d['nodes'][ni]['skin']
        row = dict(slot=slot, node=ni, mesh=d['nodes'][ni]['mesh'], primitive=p['meta']['primitive'],
                   skin=skin_id, materialName=p['meta']['material'], materialIndex=p['p']['material'],
                   attributes=p['p']['attributes'], indexAccessor=p['p']['indices'],
                   referencedVertices=len(ids), triangles=len(p['tri']), attributeRows=len(attrs['POSITION']),
                   morphTargets=len(p['p'].get('targets', [])), jointCount=len(p['jointNames']),
                   usedBones=used, ancestorNodesIncludingSelf=sorted(ancestors),
                   rawNameSanitizationExamples=[n for n in p['jointNames'] if '(' in n or ' ' in n],
                   meshWorldRest=world[ni], restSkinPositionBoundsM={'min': p['rest'][ids].min(0), 'max': p['rest'][ids].max(0)},
                   finite=bool(np.isfinite(p['rest'][ids]).all()), maximumWeightSumError=float(np.max(np.abs(weights.sum(1)-1))),
                   attributeSha256={k: hashlib.sha256(v.tobytes()).hexdigest() for k,v in attrs.items()},
                   indexSha256=hashlib.sha256(g.acc(p['p']['indices']).tobytes()).hexdigest(),
                   inverseBindAccessor=d['skins'][skin_id]['inverseBindMatrices'],
                   inverseBindSha256=hashlib.sha256(g.acc(d['skins'][skin_id]['inverseBindMatrices']).tobytes()).hexdigest())
        rows.append(row)
    output.mkdir(parents=True)
    a.OUT = output
    started = time.monotonic()
    # Existing author audit computes actual indexed skin rest, seven alpha probes,
    # skeleton-relative bands and real triangle cross sections from this male source.
    a.audit('male', Path(SOURCE).name, PINS[SOURCE])
    old = json.loads((output/'male-result.json').read_bytes())
    arrays = np.load(output/'male-body-arrays.npz')
    alpha = arrays['bodyAlphaSamples']
    body_row = next(row for row in old['primitives'] if '_Body_' in row['materialName'])
    body_row['sevenProbeTriangleClasses'] = {
        'allSamplesBelowCutoff': int((alpha < body_row['texture']['alphaCutoff']).all(1).sum()),
        'anySampleBelowCutoff': int((alpha < body_row['texture']['alphaCutoff']).any(1).sum()),
        'allSamplesExactlyZero': int((alpha == 0).all(1).sum()),
    }
    descriptor = dict(schema='native-vroid-extraction-input-v1', status='cpu-preflight-only-no-extraction',
        source={'path': SOURCE, 'sha256': PINS[SOURCE]}, editableSource={'path': EDITABLE, 'sha256': PINS[EDITABLE]},
        avatarSha256=PINS[SOURCE], extractionMethod='Exact original primitive/buffer extraction; retain original node and joint ordering',
        items=[dict(id='native-vroid-a18a-'+('shorts' if r['slot']=='bottom' else r['slot'])+'-v1',
                    **{k:r[k] for k in ['slot','node','mesh','primitive','skin','materialName','materialIndex','attributes','indexAccessor','inverseBindAccessor']})
               for r in rows if r['slot'] != 'body'],
        requirements=['Resolve source selections by unique exact material and verify pinned node/mesh/primitive',
                      'Fresh bindings must use this male skin IBM and exact names; preserve userData.name aliases',
                      'Keep MToon surface and outline and initialize each new material update(0)',
                      'Future output preflight must verify all planned destinations before writes'],
        equipmentGenerated=False, createEquipmentLoaded=False)
    inputs = [dict(path=p, sha256=sha(ROOT/p), bytes=(ROOT/p).stat().st_size) for p in PINS]
    consumed = [Path(__file__), Path(rb.__file__), Path(a.__file__), Path(a.reader.__file__),
                ROOT/'assets-source/native-vroid-equipment-v1/build.py',
                ROOT/'assets-source/native-vroid-unmasked-base-v1/build.py',
                ROOT/'prototype/src/equipment.js', ROOT/'prototype/src/equipment-material-loader.js']
    report = dict(schema='native-vroid-male-preflight-v1', status='male-source-readable-extraction-preflight-only',
        source=inputs[0], editableSource=inputs[1], sourceMeta=d['extensions']['VRMC_vrm']['meta'],
        sourceNodes=len(d['nodes']), skinJointCounts=[len(s['joints']) for s in d['skins']],
        humanoidBoneCount=len(d['extensions']['VRMC_vrm']['humanoid']['humanBones']),
        primitives=rows, body=body_row, rawSkeletonNamesUnique=True,
        skeleton=[dict(name=name, **record) for name,record in sorted(skeleton.items())],
        sourceImages=[dict(index=i,mimeType=im.get('mimeType'),sha256=hashlib.sha256(g.bin[d['bufferViews'][im['bufferView']].get('byteOffset',0):d['bufferViews'][im['bufferView']].get('byteOffset',0)+d['bufferViews'][im['bufferView']]['byteLength']]).hexdigest()) for i,im in enumerate(d['images'])],
        consumedFiles=[dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size) for p in consumed],
        python=platform.python_version(),numpy=np.__version__,wallSeconds=time.monotonic()-started,
        nativeMaleTopsRemovedDonorAvailable=False,
        limitations=['Seven alpha probes and actual cross sections do not establish watertight/full anatomical surface or exhaustive visibility',
                     'No original male tops-removed VRM/PNG donor exists in the reviewed sealed recovery package',
                     'No extraction, createEquipment execution, native editor, GPU, new fit, factory or runtime acceptance',
                     'Female bones, masks, IBM, bindings, texture and fit cannot be copied to male',
                     'Preserved onlyAuthor/personalNonProfit/noRedistribution/modification-prohibited metadata; no distribution authority asserted'])
    def write(name, value):
        with (output/name).open('xb') as f:
            f.write((json.dumps(a.clean(value),ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())
    write('extraction-input.json', descriptor)
    write('preflight.json', report)
    for relative, expected in PINS.items():
        assert sha(ROOT/relative) == expected, 'Source changed during preflight'
    print(json.dumps(a.clean({'status':report['status'],'sourceNodes':report['sourceNodes'],
        'skinJointCounts':report['skinJointCounts'],'items':descriptor['items'],
        'body':{'triangles':body_row['triangles'],'alpha':body_row['sevenProbeTriangleClasses'],'bands':body_row['bands']}}),ensure_ascii=False))


if __name__ == '__main__':
    main()
