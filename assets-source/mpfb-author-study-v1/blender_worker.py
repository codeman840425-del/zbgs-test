"""Environment adapter and readback for the unchanged upstream MPFB sample 02."""
import argparse
import gzip
import hashlib
import importlib
import json
from pathlib import Path
import runpy
import sys
import traceback

import addon_utils
import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = Path(__file__).resolve().parent
SOURCE = ROOT / 'experiments/tools/mpfb-author-study/source'


def points(collection):
    array = np.empty(len(collection) * 3, dtype=np.float32)
    collection.foreach_get('co', array)
    return array.reshape(-1, 3).astype(np.float64)


def geometry(obj, include_helpers):
    masks = [(mod, mod.show_viewport) for mod in obj.modifiers if mod.type == 'MASK']
    try:
        if include_helpers:
            for mod, _ in masks:
                mod.show_viewport = False
        bpy.context.view_layer.update()
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        try:
            coordinates = points(mesh.vertices)
            topology = [list(poly.vertices) for poly in mesh.polygons]
            return coordinates, topology
        finally:
            evaluated.to_mesh_clear()
    finally:
        for mod, visible in masks:
            mod.show_viewport = visible
        bpy.context.view_layer.update()


def readback(reference, modified):
    props_module = importlib.import_module('bl_ext.mpfb_author_study.mpfb.entities.objectproperties')
    scale = props_module.GeneralObjectProperties.get_value('scale_factor', entity_reference=modified)
    source, source_topology = geometry(reference, True)
    actual, actual_topology = geometry(modified, True)
    assert source_topology == actual_topology, 'The sample changed topology'
    assert np.isfinite(source).all() and np.isfinite(actual).all()
    basis = points(reference.data.shape_keys.key_blocks[0].data)
    assert np.array_equal(basis, points(modified.data.shape_keys.key_blocks[0].data))
    expected = np.zeros_like(actual)
    support = set()
    target_rows = []
    for filename, weight in [('nose-volume-incr.target.gz', 1.0),
                             ('nose-scale-horiz-incr.target.gz', 0.5)]:
        target_path = SOURCE / 'src/mpfb/data/targets/nose' / filename
        indices = []
        for line in gzip.decompress(target_path.read_bytes()).decode().splitlines():
            fields = line.strip().split()
            if not fields or fields[0].startswith(('#', '"')):
                continue
            index = int(fields[0])
            dx, dy, dz = map(float, fields[1:4])
            expected[index] += np.array([dx, -dz, dy]) * scale * weight
            support.add(index)
            indices.append(index)
        keys = [key for key in modified.data.shape_keys.key_blocks if
                key.name.endswith(filename.removesuffix('.target.gz'))]
        assert len(keys) == 1 and keys[0].value == weight, 'Original target weight/name mismatch'
        assert filename.removesuffix('.target.gz') not in reference.data.shape_keys.key_blocks
        target_rows.append({'file': target_path.relative_to(ROOT).as_posix(),
                            'sha256': hashlib.sha256(target_path.read_bytes()).hexdigest(),
                            'key': keys[0].name, 'weight': keys[0].value, 'sourceIndexCount': len(indices)})
    delta = actual - source
    residual = np.linalg.norm(delta - expected, axis=1)
    outside = np.ones(len(delta), dtype=bool)
    outside[list(support)] = False
    assert float(residual.max()) < 1e-6, 'Actual evaluated target differs from original file arithmetic'
    assert np.array_equal(delta[outside], np.zeros_like(delta[outside])), 'Non-target body points changed'
    assert float(np.linalg.norm(delta, axis=1).max()) > .001, 'No meaningful actual target deformation'
    visible = []
    for obj in [reference, modified]:
        coordinates, faces = geometry(obj, False)
        visible.append({'name': obj.name, 'vertices': len(coordinates), 'faces': len(faces),
                        'boundsObjectLocalM': [coordinates.min(axis=0).tolist(), coordinates.max(axis=0).tolist()],
                        'location': list(obj.location), 'scale': list(obj.scale),
                        'shapeKeys': [{'name': key.name, 'value': key.value} for key in obj.data.shape_keys.key_blocks],
                        'materials': [slot.material.name if slot.material else None for slot in obj.material_slots],
                        'modifiers': [{'name': mod.name, 'type': mod.type, 'visible': mod.show_viewport}
                                      for mod in obj.modifiers],
                        'vertexGroups': len(obj.vertex_groups)})
    return {'status': 'original-target-sample-readback-passed', 'targetFiles': target_rows,
            'scaleFactor': scale, 'fullSourceVerticesIncludingHelpers': len(source),
            'fullSourceFacesIncludingHelpers': len(source_topology),
            'targetSourceIndexUnion': len(support),
            'actualChangedVertices': int(np.count_nonzero(np.linalg.norm(delta, axis=1))),
            'maximumDisplacementM': float(np.linalg.norm(delta, axis=1).max()),
            'maximumOriginalFileArithmeticResidualM': float(residual.max()),
            'nonTargetVertices': int(outside.sum()), 'maximumNonTargetDisplacementM': 0.0,
            'basisCoordinatesEqual': True, 'topologyEqual': True,
            'components': visible, 'armatures': sum(obj.type == 'ARMATURE' for obj in bpy.data.objects),
            'separateClothes': False, 'expressionsLoaded': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', choices=['create', 'reopen'], required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    generated = PACKAGE / 'generated'
    generated.mkdir(exist_ok=True)
    output = generated / f'{args.phase}-readback.json'
    if output.exists():
        raise ValueError('Refusing to overwrite prior execution evidence')
    try:
        bpy.context.preferences.extensions.repos.new(
            name='MPFB Original Author Study', module='mpfb_author_study',
            custom_directory=str(SOURCE / 'src'), remote_url='', source='USER')
        addon = addon_utils.enable('bl_ext.mpfb_author_study.mpfb', default_set=True)
        if addon is None:
            raise RuntimeError('Original MPFB extension failed to register')
        sample = SOURCE / 'script_samples/02_working_with_modeling_targets.py'
        assert sample.read_bytes() == (PACKAGE / 'original' / sample.name).read_bytes()
        if args.phase == 'create':
            bpy.ops.object.select_all(action='SELECT')
            bpy.ops.object.delete(use_global=False)
            namespace = runpy.run_path(str(sample), run_name='__mpfb_original_sample__')
            reference, modified = namespace['reference_human'], namespace['big_nose_human']
            reference['author_study_role'] = 'reference'
            modified['author_study_role'] = 'original-targets'
        else:
            bpy.ops.wm.open_mainfile(filepath=str(generated / 'mpfb-original-sample-02.blend'))
            reference = next(obj for obj in bpy.data.objects if obj.get('author_study_role') == 'reference')
            modified = next(obj for obj in bpy.data.objects if obj.get('author_study_role') == 'original-targets')
        result = readback(reference, modified)
        result.update({'schema': 'mpfb-author-study-readback-v1', 'phase': args.phase,
                       'blenderVersion': bpy.app.version_string,
                       'buildHash': bpy.app.build_hash.decode(), 'mpfbVersion': list(addon.VERSION),
                       'sampleSHA256': hashlib.sha256(sample.read_bytes()).hexdigest(),
                       'sampleModified': False, 'environmentAdapterOnly': True,
                       'gpuRendering': False, 'vrmExport': False})
        if args.phase == 'create':
            bpy.ops.wm.save_as_mainfile(filepath=str(generated / 'mpfb-original-sample-02.blend'))
        else:
            previous = json.loads((generated / 'create-readback.json').read_text())
            for key in ['targetFiles', 'components', 'maximumDisplacementM', 'actualChangedVertices',
                        'maximumOriginalFileArithmeticResidualM', 'fullSourceVerticesIncludingHelpers']:
                assert previous[key] == result[key], f'Saved/reopened state changed: {key}'
            result['savedStateReadbackEqual'] = True
        output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({key: value for key, value in result.items() if key not in ['components', 'targetFiles']}))
    except Exception:
        output.write_text(json.dumps({'status': 'failed', 'phase': args.phase,
                                      'traceback': traceback.format_exc()}, indent=2), encoding='utf-8')
        raise


if __name__ == '__main__':
    main()
