"""One original native custom-item production/reuse trial, inventory first."""
import argparse
import asyncio
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import struct
import sys
import traceback

PACKAGE = Path(__file__).resolve().parent
ROOT = PACKAGE.parents[1]
EXPRESSION = ROOT / 'assets-source/vroid-expression-study-v1'
sys.path.insert(0, str(EXPRESSION))
module_spec = importlib.util.spec_from_file_location('vroid_expression_study_reused', EXPRESSION / 'study.py')
expression_study = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(expression_study)
from vroid_mcp.server import create_server
from vroid_mcp.custom_item_file import inspect_custom_item
from vroid_mcp.vrm_export import validate_vrm

LAB = expression_study.LAB
EVIDENCE = ROOT / 'evidence/vroid-customitem-study-v1'
PREFIX = 'customitem-study-'
sha = expression_study.sha
write = expression_study.write
parameters = expression_study.parameters
values = expression_study.values
client_for = expression_study.client_for


def preflight():
    spec = json.loads((PACKAGE / 'spec.json').read_bytes())
    for identity in spec['inputs']:
        if sha(ROOT / identity['path']) != identity['sha256']:
            raise ValueError('Prepared input changed: ' + identity['path'])
    return expression_study.preflight()


def require_selection(parts, group_parameters, rows, part_type, parameter_id, value):
    candidates = [part for part in parts['parts'] if part['type'] == part_type]
    if part_type not in parts['savable_types'] or len(candidates) != 1:
        raise ValueError('Select one unique actually savable part type')
    part = candidates[0]
    matches = [row for row in rows if row['id'] == parameter_id]
    if len(matches) != 1 or matches[0].get('type') != 'float' or not matches[0].get('editable'):
        raise ValueError('Select one actually enumerated editable float clothing parameter')
    parameter = matches[0]
    owners = [row for row in group_parameters.get(part['id'], {}).get('parameters', [])
              if row.get('target_binding_id') == parameter_id and row.get('editable')
              and row.get('group_id') == part['id'] and row.get('source') == 'exact_native_vm']
    if len(owners) != 1:
        raise ValueError('Exact native group ownership is not established for this parameter')
    if (not math.isfinite(value) or not parameter['min'] <= value <= parameter['max']
            or value == parameter['value']):
        raise ValueError('Use one different value within the native parameter range')
    return part, parameter


def require_values(actual, expected, label):
    def equal(value, other):
        if type(value) in (int, float) and type(other) in (int, float):
            return math.isclose(value, other, abs_tol=1e-6, rel_tol=0)
        return value == other
    if set(actual) != set(expected) or any(not equal(actual[key], value) for key, value in expected.items()):
        raise RuntimeError(label + ' parameter values or identities differ')


def verify_reused_clothing(current, original_rows, expected, part, saved_item):
    """Only the saved top's root ID may change; its template bindings must not."""
    active = [row for row in current['parts']['parts'] if row['type'] == part['type']]
    if len(active) != 1 or active[0]['id'] != saved_item['id'] or active[0]['group_type'] != part['group_type']:
        raise RuntimeError('Reused top does not have the actual saved registered group identity')
    if active[0]['resource_name'] != saved_item['resource_name']:
        raise RuntimeError('Reused top resource differs from saved registered item')
    before_top = [row for row in original_rows if row.get('semantic_group') == part['group_type']]
    after_top = [row for row in current['clothing'] if row.get('semantic_group') == part['group_type']]
    require_values({row['id']: row['value'] for row in current['clothing'] if row not in after_top},
                   {row['id']: expected[row['id']] for row in original_rows if row not in before_top}, 'Other clothing')
    def binding(row):
        if row.get('semantic_status') != 'complete' or not row.get('semantic_bindings') or not row.get('semantic_key'):
            raise RuntimeError('Reused top binding identity is incomplete')
        return json.dumps([row['type'], row.get('native_type'), row['semantic_group'],
                           row['semantic_key'], row['semantic_kind'], row['semantic_bindings']], sort_keys=True)
    old = {binding(row): row for row in before_top}
    new = {binding(row): row for row in after_top}
    if len(old) != len(before_top) or len(new) != len(after_top) or set(old) != set(new):
        raise RuntimeError('Top template/parameter bindings changed or became ambiguous')
    owners = current['groupParameters'].get(active[0]['id'], {}).get('parameters', [])
    for row in after_top:
        matches = [owner for owner in owners if owner.get('target_binding_id') == row['id']
                   and owner.get('source') == 'exact_native_vm' and owner.get('group_id') == active[0]['id']]
        if len(matches) != 1:
            raise RuntimeError('Reused top parameter ownership is not proven')
    require_values({key: row['value'] for key, row in new.items()},
                   {key: expected[row['id']] for key, row in old.items()}, 'Reused top')
    return [{'sourceId': old[key]['id'], 'reusedId': new[key]['id'],
             'semanticKey': old[key]['semantic_key']} for key in sorted(old)]


def geometry_readback(path):
    """Hash actual dense native-export POSITION payloads, reject unsupported layout."""
    container = validate_vrm(path, 1)
    raw = path.read_bytes()
    json_length = struct.unpack_from('<I', raw, 12)[0]
    document = json.loads(raw[20:20 + json_length])
    binary_start = 28 + json_length
    binary = raw[binary_start:]
    signatures = []
    for mesh_index, mesh in enumerate(document['meshes']):
        for primitive_index, primitive in enumerate(mesh['primitives']):
            accessor = document['accessors'][primitive['attributes']['POSITION']]
            if accessor['componentType'] != 5126 or accessor['type'] != 'VEC3' or 'sparse' in accessor:
                raise ValueError('Only actual dense Float32 VEC3 export positions are supported')
            view = document['bufferViews'][accessor['bufferView']]
            offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
            stride = view.get('byteStride', 12)
            payload = b''.join(binary[offset + i * stride:offset + i * stride + 12]
                               for i in range(accessor['count']))
            if len(payload) != accessor['count'] * 12:
                raise ValueError('Incomplete actual POSITION payload')
            signatures.append({'mesh': mesh_index, 'primitive': primitive_index,
                               'count': accessor['count'], 'sha256': hashlib.sha256(payload).hexdigest()})
    return {'container': container, 'positions': signatures,
            'metadata': document['extensions']['VRMC_vrm']['meta']}


async def inventory(call):
    token = (await call('list_face_params'))['model_token']
    parts = await call('list_parts', {'expected_model': token})
    clothing = await parameters(call, 'clothing')
    grouped = {}
    clothing_group_types = {row.get('semantic_group') for row in clothing if row.get('semantic_group')}
    for part in parts['parts']:
        if part['type'] in parts['savable_types'] and part['group_type'] in clothing_group_types:
            grouped[part['id']] = await call('list_group_parameters',
                {'expected_model': token, 'group_id': part['id']})
    return token, {'parts': parts, 'clothing': clothing, 'groupParameters': grouped,
                   'groupScope': 'savable active groups actually named by clothing semantic_group metadata',
                   'registryBasePath': 'not-exposed-by-list_parts-public-tool',
                   'writeBoundary': 'author save_custom_items refuses registry outside owned lab/profile before native save'}


async def guards(call):
    return {domain: values(await parameters(call, domain)) for domain in ['face', 'body', 'colors']}


async def verify_guards(call, before):
    for domain, expected in before.items():
        if values(await parameters(call, domain)) != expected:
            raise RuntimeError('Unrequested ' + domain + ' parameter change')


async def export(call, token, name, options=None):
    args = {'expected_model': token, 'filename': PREFIX + name + '.vrm', 'version': 1,
            'title': 'Custom item study', 'author': 'Project study', 'model_version': '1'}
    if options is not None:
        args['options'] = {key: value for key, value in options.items() if value is not None}
    return await call('export_vrm', args)


async def native(args, out, receipt):
    source = ROOT / receipt['inputModel']['labCopy']
    report = {'schema': 'vroid-customitem-study-native-v1', 'status': 'running', 'mode': args.mode,
              'inputModel': receipt['inputModel'], 'selection': None,
              'closetScope': 'author-owned-lab-profile-only-no-attached-mode'}
    write(out / 'report.json', report)
    try:
        async with client_for(source, out, 'inventory-and-produce') as call:
            token, current = await inventory(call)
            write(out / 'native-inventory.json', current)
            if args.mode == 'inspect':
                report['status'] = 'native-customitem-inventory-only'
                return report
            part, parameter = require_selection(current['parts'], current['groupParameters'], current['clothing'],
                                                 args.part_type, args.parameter_id, args.value)
            report['selection'] = {'part': part, 'parameter': parameter, 'value': args.value}
            guard_values = await guards(call)
            original_clothing = values(current['clothing'])
            expected = {**original_clothing, args.parameter_id: args.value}
            baseline = await export(call, token, 'baseline')
            report['baselineExport'] = baseline
            await call('set_parameters', {'expected_model': token, 'domain': 'clothing',
                'changes': [{'id': args.parameter_id, 'value': args.value}]})
            require_values(values(await parameters(call, 'clothing')), expected, 'Direct changed')
            await verify_guards(call, guard_values)
            saved = await call('save_custom_items', {'expected_model': token, 'types': [args.part_type]})
            report['customItemSave'] = saved
            write(out / 'report.json', report)
            if len(saved['saved']) != 1 or saved['profile_scope'] != 'lab profile':
                raise RuntimeError('Expected exactly one owned-profile saved item')
            item = saved['saved'][0]
            item_path = Path(item['path']).resolve()
            if not item_path.is_relative_to((LAB / 'profile').resolve()) or sha(item_path) != item['sha256']:
                raise RuntimeError('Saved item escaped owned profile or bytes changed')
            copied = LAB / 'saves' / (PREFIX + 'top.vroidcustomitem')
            if copied.exists():
                raise FileExistsError('Refusing to overwrite a previous study custom item')
            shutil.copy2(item_path, copied)
            checked = inspect_custom_item(copied)
            if checked['sha256'] != item['sha256']:
                raise RuntimeError('Copied item bytes differ from native registered file')
            report['copiedItem'] = {'path': str(copied), 'sha256': sha(copied), 'inspection': checked}
            direct = await export(call, token, 'direct', baseline['effective'])
            report['directExport'] = direct
        # Fresh original source in a new author-owned process, without carrying
        # the first process's edited model. The registered item stays in lab/profile.
        async with client_for(source, out, 'reuse-original-source') as call:
            token, original_again = await inventory(call)
            require_values(values(original_again['clothing']), original_clothing, 'Fresh original')
            await verify_guards(call, guard_values)
            applied = await call('apply_custom_item', {'expected_model': token, 'filename': copied.name})
            report['application'] = applied
            _, applied_inventory = await inventory(call)
            write(out / 'reapplied-inventory.json', applied_inventory)
            report['reappliedParameterIds'] = verify_reused_clothing(
                applied_inventory, current['clothing'], expected, part, item)
            await verify_guards(call, guard_values)
            report['savedModel'] = await call('save_as', {'expected_model': token, 'filename': PREFIX + 'reused.vroid'})
        reused = LAB / 'saves' / (PREFIX + 'reused.vroid')
        async with client_for(reused, out, 'cold-reopen-reused') as call:
            token, reopened = await inventory(call)
            write(out / 'reopened-inventory.json', reopened)
            report['reopenedParameterIds'] = verify_reused_clothing(
                reopened, current['clothing'], expected, part, item)
            await verify_guards(call, guard_values)
            report['reusedExport'] = await export(call, token, 'reused', baseline['effective'])
        geometry = {name: geometry_readback(LAB / 'saves' / (PREFIX + name + '.vrm'))
                    for name in ['baseline', 'direct', 'reused']}
        write(out / 'vrm-geometry-readback.json', geometry)
        if geometry['direct']['positions'] != geometry['reused']['positions']:
            raise RuntimeError('Reused item export does not reproduce actual edited POSITION payloads')
        if geometry['baseline']['positions'] == geometry['direct']['positions']:
            raise RuntimeError('Selected clothing parameter has no observed native-export position change')
        if any(geometry[name]['metadata'] != geometry['baseline']['metadata'] for name in ['direct', 'reused']):
            raise RuntimeError('Unrequested export metadata or permission change')
        report['sealedArtifacts'] = []
        for path in [copied, reused] + [LAB / 'saves' / (PREFIX + name + '.vrm') for name in geometry]:
            target = out / path.name
            shutil.copy2(path, target)
            report['sealedArtifacts'].append({'path': target.relative_to(ROOT).as_posix(), 'sha256': sha(target)})
        report['status'] = 'one-native-customitem-produced-reapplied-cold-reopened-and-exported'
        report['visualAcceptance'] = 'not-established-by-this-script'
        return report
    except BaseException as error:
        report['status'] = 'failed-not-admissible'
        report['error'] = str(error)
        raise
    finally:
        report['originalSourceUnchanged'] = sha(ROOT / receipt['inputModel']['path']) == receipt['inputModel']['sha256']
        write(out / 'report.json', report)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['offline', 'inspect', 'test'], default='offline')
    parser.add_argument('--execute-native', action='store_true')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--part-type')
    parser.add_argument('--parameter-id')
    parser.add_argument('--value', type=float)
    args = parser.parse_args()
    if args.mode != 'offline' and not args.execute_native:
        parser.error('Root-controlled native window required')
    if args.mode == 'test' and (not args.part_type or not args.parameter_id or args.value is None):
        parser.error('Choose the actual unique top type, parameter ID and one value after inspect')
    receipt = preflight()
    if args.mode == 'test':
        for name in ['top.vroidcustomitem', 'reused.vroid', 'baseline.vrm', 'direct.vrm', 'reused.vrm']:
            if (LAB / 'saves' / (PREFIX + name)).exists():
                parser.error('Previous native trial artifact exists; preserve and inspect it before any retry')
    out = args.out.resolve()
    if not out.is_relative_to(EVIDENCE.resolve()) or out.exists():
        parser.error('Use a fresh output directory inside the owned evidence package')
    out.mkdir(parents=True)
    if args.mode == 'offline':
        tools = asyncio.run(create_server(LAB, 'F00', None).list_tools())
        selected = {tool.name: tool.model_dump(mode='json') for tool in tools if tool.name in {
            'list_face_params', 'list_parts', 'list_parameters', 'list_group_parameters', 'set_parameters',
            'save_custom_items', 'apply_custom_item', 'save_as', 'export_vrm'}}
        if len(selected) != 9:
            raise RuntimeError('Required original author tool schema missing')
        write(out / 'actual-tool-schemas.json', selected)
        write(out / 'report.json', {'schema': 'vroid-customitem-study-offline-v1',
            'status': 'prepared-only', 'toolCount': len(tools), 'requiredToolCount': len(selected),
            'nativeCalls': 0, 'editorLaunches': 0, 'newEditorCopies': 0,
            'buildAdmission': receipt['buildAdmission']})
        print('Offline schema preparation passed; no native execution')
        return
    try:
        print(asyncio.run(native(args, out, receipt))['status'])
    except BaseException as error:
        write(out / 'failure.json', {'error': str(error), 'traceback': traceback.format_exc()})
        raise


if __name__ == '__main__':
    main()
