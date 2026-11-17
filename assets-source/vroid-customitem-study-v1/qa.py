"""Offline input/ownership/readback checks. No editor, attach or native calls."""
import json
from pathlib import Path
import tempfile
import zipfile

from study import require_selection, require_values, geometry_readback
from vroid_mcp.custom_item_file import inspect_custom_item, registry_root

OUT = Path(__file__).resolve().parents[2] / 'evidence/vroid-customitem-study-v1/offline-qa'


def main():
    OUT.mkdir(parents=True, exist_ok=False)
    parts = {'parts': [{'id': 'source-top', 'type': 'Tops'}], 'savable_types': ['Tops']}
    rows = [{'id': 'native-top-length', 'type': 'float', 'editable': True,
             'min': 0, 'max': 100, 'value': 50}]
    grouped = {'source-top': {'parameters': [{'target_binding_id': 'native-top-length',
        'editable': True, 'group_id': 'source-top', 'source': 'exact_native_vm'}]}}
    selected = require_selection(parts, grouped, rows, 'Tops', 'native-top-length', 60)
    assert selected[0]['id'] == 'source-top'
    checks = [{'name': 'explicit-exact-owner-selection', 'passed': True}]
    for name, selected_parts, selected_groups, part_type, value in [
            ('unknown-part', parts, grouped, 'Other', 60),
            ('outside-range', parts, grouped, 'Tops', 101),
            ('unchanged-value', parts, grouped, 'Tops', 50),
            ('unproved-owner', parts, {'source-top': {'parameters': []}}, 'Tops', 60),
            ('ambiguous-part', {**parts, 'parts': parts['parts'] * 2}, grouped, 'Tops', 60)]:
        try:
            require_selection(selected_parts, selected_groups, rows, part_type, 'native-top-length', value)
        except ValueError as error:
            checks.append({'name': name, 'passed': True, 'rejection': str(error)})
        else:
            raise AssertionError('Invalid selection accepted: ' + name)
    require_values({'scalar': 60.00000001, 'vector': [1, 2, 3]}, {'scalar': 60, 'vector': [1, 2, 3]}, 'QA')
    checks.append({'name': 'native-float-readback-and-typed-vector-preservation', 'passed': True})
    with tempfile.TemporaryDirectory(dir=OUT) as folder:
        root = Path(folder).resolve()
        path = root / 'source.vroidcustomitem'
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('v1customitem/meta.json', json.dumps({
                'rootTransferableGroupId': 'source-top', 'rootTransferableGroupTypeId': 'Tops'}))
        info = inspect_custom_item(path)
        assert info['metadata']['rootTransferableGroupId'] == 'source-top'
        checks.append({'name': 'actual-author-customitem-zip-inspection', 'passed': True})
        try:
            registry_root(str(root), root / 'profile')
        except ValueError as error:
            checks.append({'name': 'actual-author-outside-profile-refusal', 'passed': True, 'rejection': str(error)})
        else:
            raise AssertionError('Outside-profile registry accepted')
    original_fixture = Path(__file__).resolve().parents[2] / 'evidence/vroid-expression-study-v1/offline-readback-qa/dense.vrm'
    checked = geometry_readback(original_fixture)
    assert checked['positions'][0]['count'] == 3
    checks.append({'name': 'actual-glb-container-and-position-payload-readback', 'passed': True})
    (OUT / 'report.json').write_text(json.dumps({'schema': 'vroid-customitem-study-offline-qa-v1',
        'status': 'passed', 'checks': checks, 'nativeCalls': 0, 'editorLaunches': 0,
        'limits': 'Synthetic ownership/ZIP/container checks, no real customitem production or application'}, indent=2) + '\n', encoding='utf-8')
    print(str(len(checks)) + ' offline checks passed')


if __name__ == '__main__':
    main()
