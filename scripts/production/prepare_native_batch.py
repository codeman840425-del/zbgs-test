"""Prepare a pinned body package recipe from one completed native authoring batch."""
import argparse
import json
from pathlib import Path, PurePosixPath
import re
import sys

from native_authoring import runner
from native_dependency_delta import ROOT, compare_exports
from native_import import confined, digest


COMMON = ('template', 'baseline', 'donor', 'mask')


def pin(path, root):
    return {'path': path.relative_to(root).as_posix(), 'sha256': digest(path.read_bytes())}


def recorded_call(batch_dir, sequence, tool):
    prefix = f'calls/{sequence:04d}-{tool}'
    request = json.loads(confined(batch_dir, prefix + '.request.json').read_bytes())
    record = json.loads(confined(batch_dir, prefix + '.response.json').read_bytes())
    runner.require(request == record['request'] and request['method'] == 'tools/call'
                   and request['params']['name'] == tool, f'Archived request differs at {prefix}')
    return request['params']['arguments'], runner.embedded(record)


def archived_path_matches(path, identity, filename):
    # Native archives retain the absolute path used at capture time. The item
    # and filename still identify the same artifact in a relocated checkout.
    return PurePosixPath(path.replace('\\', '/')).parts[-2:] == (identity, filename)


def check_cold_readback(batch_dir, row, batch, screenshot_sequence):
    definitions = {}
    for parameter in batch['parameters']:
        definitions.setdefault(parameter['groupType'], []).append(parameter)
    group_sequence = screenshot_sequence - len(definitions) - 1
    _, opened = recorded_call(batch_dir, group_sequence - 1, 'vroid_status')
    runner.require(opened['ready'] is True and opened['modelOpen'] is True and opened['dirty'] is False
                   and archived_path_matches(opened['currentFile'], row['id'], row['editable']['path']),
                   'Archived readback is not from the saved cold-open candidate')
    _, groups = recorded_call(batch_dir, group_sequence, 'vroid_list_groups')
    runner.require(set(row['protectedParameters']) == set(definitions), 'Missing protected group readback')
    for i, (group_type, parameters) in enumerate(definitions.items(), start=1):
        group, = [item['id'] for item in groups if item['type'] == group_type]
        request, values = recorded_call(batch_dir, group_sequence + i, 'vroid_get_params')
        runner.require(request['group'] == group, f'Cold-open group differs: {group_type}')
        keys = {item['key'] for item in parameters}
        for parameter in parameters:
            key = parameter['key']
            value, = [item['value'] for item in values if item['key'] == key and item['kind'] == parameter['kind']]
            runner.require(value == row['coldReadback'][key], f'Archived cold-open value differs: {key}')
        runner.require(sum(item['key'] not in keys for item in values) == row['protectedParameters'][group_type],
                       f'Archived protected group count differs: {group_type}')


def checked_candidate(batch_dir, batch, row, definition, template_sha, root):
    identity = row['id']
    folder = confined(batch_dir, identity)
    runner.require(json.loads(confined(folder, 'result.json').read_bytes()) == row,
                   'Item result differs from batch result')
    runner.require(row['values'] == row['coldReadback'] == definition['values'],
                   'Declared and cold-read parameter values differ')
    runner.require(digest(confined(folder, 'template-copy.vroid').read_bytes()) == template_sha,
                   'Native authoring used a different template copy')
    editable, exported = row['editable'], row['exported']
    runner.require(editable['path'] == 'candidate.vroid' and exported['path'] == 'candidate.vrm',
                   'Unknown native authoring output layout')
    runner.require(pin(confined(folder, 'candidate.vroid'), root)['sha256'] == editable['sha256'],
                   'Saved native editable source identity differs')
    intent = json.loads(confined(folder, 'export-intent.json').read_bytes())
    runner.require(intent == {'document': editable['path'], 'sha256': editable['sha256']},
                   'Export intent does not refer to the saved native source')
    candidate = confined(folder, 'candidate.vrm')
    candidate_pin = pin(candidate, root)
    runner.require(candidate_pin['sha256'] == exported['sha256'] and candidate.stat().st_size == exported['bytes'],
                   'Native VRM export identity differs')
    screenshot = row['nativeScreenshot']
    name = re.fullmatch(r'calls/(\d+)-vroid_screenshot\.response\.image-2-0\.png', screenshot['path'])
    runner.require(name and digest(confined(batch_dir, screenshot['path']).read_bytes()) == screenshot['sha256'],
                   'Invalid native screenshot receipt')
    sequence = int(name[1])
    check_cold_readback(batch_dir, row, batch, sequence)
    request, reply = recorded_call(batch_dir, sequence + 2, 'vroid_export_vrm')
    archived_path = request.pop('path')
    runner.require(request == batch['export'] and archived_path == reply['path']
                   and archived_path_matches(archived_path, identity, exported['path']),
                   'Archived export does not match the recipe or candidate')
    runner.require(reply['version'] == '1.0' and reply['bytes'] == exported['bytes']
                   and reply['warnings'] == [] and reply['leftExportScreen'] is True
                   and all(reply['settings'][field] == request[key]
                           for key, field in runner.EXPORT_SETTINGS.items()),
                   'Native export settings or byte counts differ')
    return candidate, candidate_pin


def by_id(rows):
    index = {row['id']: row for row in rows}
    runner.require(len(index) == len(rows), 'Duplicate item ID')
    return index


def prepare(authoring_result, template_config, output, root=ROOT):
    root = root.resolve()
    authoring_result, output = authoring_result.resolve(), output.resolve()
    runner.require(authoring_result.is_relative_to(root) and output.is_relative_to(root)
                   and output != root, 'Expected authoring result and output inside this repository')
    batch_dir = authoring_result.parent
    batch_path = confined(batch_dir, 'batch.json')
    batch = json.loads(batch_path.read_bytes())
    result = json.loads(authoring_result.read_bytes())
    source_config = json.loads(template_config.read_bytes())
    runner.require(source_config['schema'] == 'native-body-package-recipe-v1', 'Invalid template config')
    runner.require(result['schema'] == 'native-authoring-result-v1', 'Invalid authoring result')
    config = {'schema': source_config['schema']}
    for key in COMMON:
        artifact = source_config[key]
        path = confined(root, artifact['path'])
        config[key] = pin(path, root)
        runner.require(config[key]['sha256'] == artifact['sha256'], f'Shared {key} identity differs')
    runner.require(batch['template']['sha256'] == config['template']['sha256']
                   and confined(root, batch['template']['path']) == confined(root, config['template']['path']),
                   'Authoring batch uses a different template')
    runner.checked_recipe(batch, root)
    definitions = by_id(batch['items'])
    existing_labels = {item['id']: item['label'] for item in source_config.get('items', []) if 'label' in item}
    outputs = by_id(result['items'])
    host_matches = (result.get('declaredStudio') == batch['host']['studio']
                    and result.get('checkedHost') == {k: batch['host'][k] for k in ('plugin', 'unity')})
    batch_failures = []
    if result.get('passed') is not True or result.get('entryRestored') is not True or not host_matches:
        batch_failures.append(result.get('error') or 'Runner batch, recovery, or host verification is incomplete')
    if extra := sorted(outputs.keys() - definitions.keys()):
        batch_failures.append(f'Authoring result has IDs outside its recipe: {", ".join(extra)}')

    config['authoringBatch'] = pin(batch_path, root)
    config['authoringResult'] = pin(authoring_result, root)
    config['items'] = []
    baseline = confined(root, config['baseline']['path'])
    output.mkdir(parents=True, exist_ok=False)
    reports = []
    for identity, definition in definitions.items():
        row = outputs.get(identity)
        report = {'id': identity}
        reports.append(report)
        try:
            runner.require(len(identity) <= 61, 'Candidate ID exceeds the body producer limit')
            runner.require(row is not None, 'No result returned for this recipe')
            runner.require(row['state'] == 'exported', row.get('recoveryError') or row.get('reason')
                           or 'Native candidate did not export')
            candidate, candidate_pin = checked_candidate(
                batch_dir, batch, row, definition, config['template']['sha256'], root)
            delta = compare_exports(baseline, config['baseline']['sha256'], candidate, candidate_pin['sha256'])
            delta_path = output / f'{identity}.delta.json'
            runner.write(delta_path, delta)
            delta_pin = pin(delta_path, root)
            report.update(candidate=candidate_pin, delta=delta_pin)
            runner.require(delta['status'] == 'compared', delta.get('reason') or 'Unsupported dependency delta')
            label = definition.get('label', existing_labels.get(identity, identity))
            runner.require(isinstance(label, str) and label.strip(), 'Missing body label')
            config['items'].append({'id': identity, 'label': label, 'candidate': candidate_pin, 'delta': delta_pin})
            report['state'] = 'prepared'
        except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
            report.update(state='failed', reason=str(error))
    passed = not batch_failures and all(row['state'] == 'prepared' for row in reports)
    report = {
        'schema': 'native-body-batch-preparation-v1', 'passed': passed,
        'authoringBatch': config['authoringBatch'], 'authoringResult': config['authoringResult'],
        'batchFailures': batch_failures, 'items': reports,
    }
    if passed:
        path = output / 'config.json'
        runner.write(path, config)
        report['config'] = pin(path, root)
    runner.write(output / 'result.json', report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--authoring-result', type=Path, required=True)
    parser.add_argument('--template-config', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        report = prepare(args.authoring_result, args.template_config, args.output)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(error, file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
