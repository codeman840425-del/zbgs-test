"""Prepared MCP trial. Native modes require the chief's separate execution window."""
import argparse
import asyncio
from contextlib import asynccontextmanager
from datetime import timedelta
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import sys
import traceback

PACKAGE = Path(__file__).resolve().parent
ROOT = PACKAGE.parents[1]
UPSTREAM = PACKAGE / 'private-tools/upstream'
LAB = PACKAGE / 'private-tools/lab'
EVIDENCE = ROOT / 'evidence/vroid-expression-study-v1'
sys.path.insert(0, str(UPSTREAM))

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from vroid_mcp.server import create_server
from vroid_mcp.supported_builds import assembly_identity
from readback import inspect_expression_payloads


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')


def preflight():
    receipt = json.loads((PACKAGE / 'prepared/source-receipt.json').read_bytes())
    if sha(ROOT / receipt['inputModel']['path']) != receipt['inputModel']['sha256']:
        raise ValueError('Original selected input changed')
    for row in receipt['upstreamFiles']:
        if sha(UPSTREAM / row['path']) != row['sha256']:
            raise ValueError('Fixed author source changed: ' + row['path'])
    if assembly_identity(LAB / 'app/GameAssembly.dll') != receipt['buildAdmission']:
        raise ValueError('Exact author binary admission changed')
    if (LAB / 'app/BepInEx').exists() or (LAB / 'app/winhttp.dll').exists():
        raise ValueError('The Frida lab must remain separate from the Bridge installation')
    return receipt


@asynccontextmanager
async def client_for(model, folder, label):
    folder.mkdir(parents=True, exist_ok=True)
    environment = dict(os.environ, VROID_MCP_CLEAR_CLOSET_KEY='0')
    params = StdioServerParameters(command=sys.executable,
        args=[str(UPSTREAM / 'launch.py'), '--lab', str(LAB), '--model', str(model)],
        cwd=str(UPSTREAM), env=environment)
    with (folder / (label + '-server.log')).open('w', encoding='utf-8') as log:
        async with stdio_client(params, errlog=log) as (reader, writer):
            async with ClientSession(reader, writer, read_timeout_seconds=timedelta(seconds=240)) as session:
                await session.initialize()
                async def call(name, arguments=None):
                    result = await session.call_tool(name, arguments or {})
                    if result.isError:
                        raise RuntimeError(name + ': ' + str(result.content))
                    value = result.structuredContent
                    if value is None:
                        value = json.loads(''.join(block.text for block in result.content if block.type == 'text'))
                    if isinstance(value, dict) and value.get('ok') is False:
                        raise RuntimeError(name + ': ' + json.dumps(value))
                    with (folder / 'calls.jsonl').open('a', encoding='utf-8') as calls:
                        calls.write(json.dumps({'tool': name, 'arguments': arguments or {}, 'result': value}, ensure_ascii=False) + '\n')
                    return value
                yield call


async def parameters(call, domain, scope=None):
    found = []
    offset = 0
    while True:
        result = await call('list_parameters', {'domain': domain, 'scope': scope, 'offset': offset, 'limit': 500})
        found.extend(result['parameters'])
        next_offset = result.get('next_offset')
        if next_offset is None:
            break
        if type(next_offset) is not int or next_offset <= offset:
            raise RuntimeError('Invalid parameter pagination')
        offset = next_offset
    return found


def values(rows):
    return {row['id']: row['value'] for row in rows}


async def native(args, out, receipt):
    source = ROOT / receipt['inputModel']['labCopy']
    if sha(source) != receipt['inputModel']['sha256']:
        raise ValueError('Lab input source changed')
    report = {'schema': 'vroid-expression-study-native-v1', 'status': 'running', 'mode': args.mode,
              'inputModel': receipt['inputModel'], 'selected': None, 'permissionsModified': False}
    write(out / 'report.json', report)
    try:
        async with client_for(source, out, 'first') as call:
            expressions = await call('list_expressions')
            token = expressions['model_token']
            inventory = {row['id']: await parameters(call, 'expressions', row['id'])
                         for row in expressions['expressions']}
            write(out / 'expression-inventory.json', {'list': expressions, 'parameters': inventory})
            if args.mode == 'inspect':
                report['status'] = 'native-expression-inventory-only'
                return report
            if args.expression_id not in inventory:
                raise ValueError('Use an expression ID from the actual inventory')
            matches = [row for row in inventory[args.expression_id] if row['id'] == args.parameter_id]
            if len(matches) != 1 or matches[0].get('type') != 'float':
                raise ValueError('Select one enumerated numeric expression parameter')
            selected = matches[0]
            if not math.isfinite(args.value) or not selected['min'] <= args.value <= selected['max'] or args.value == selected['value']:
                raise ValueError('The one test value must differ and stay inside the native range')
            report['selected'] = {'expressionId': args.expression_id, 'parameter': selected, 'requestedValue': args.value}
            write(out / 'report.json', report)
            neutral_before = {domain: values(await parameters(call, domain)) for domain in ['face', 'body']}
            await call('preview_expression', {'expected_model': token, 'expression': None})
            baseline = await call('export_vrm', {'expected_model': token, 'filename': 'expression-study-baseline.vrm',
                'version': 1, 'title': 'Expression study', 'author': 'Project study', 'model_version': '1'})
            await call('set_parameters', {'expected_model': token, 'domain': 'expressions',
                'scope': args.expression_id, 'changes': [{'id': args.parameter_id, 'value': args.value}]})
            changed = await parameters(call, 'expressions', args.expression_id)
            observed = values(changed)
            expected = values(inventory[args.expression_id])
            expected[args.parameter_id] = args.value
            if any(abs(observed[key] - value) > 1e-6 for key, value in expected.items()):
                raise RuntimeError('Expression value readback mismatch or unrelated definition changed')
            for expression_id, original_rows in inventory.items():
                if expression_id != args.expression_id and values(await parameters(call, 'expressions', expression_id)) != values(original_rows):
                    raise RuntimeError('A different expression definition changed')
            await call('preview_expression', {'expected_model': token, 'expression': args.expression_id})
            await call('preview_expression', {'expected_model': token, 'expression': None})
            for domain, before in neutral_before.items():
                if values(await parameters(call, domain)) != before:
                    raise RuntimeError('Unexpected face/body parameter change')
            saved = await call('save_as', {'expected_model': token, 'filename': 'expression-study-candidate.vroid'})
            report.update(baselineExport=baseline, saved=saved)
        candidate = LAB / 'saves/expression-study-candidate.vroid'
        async with client_for(candidate, out, 'cold-reopen') as call:
            token = (await call('list_expressions'))['model_token']
            reopened = values(await parameters(call, 'expressions', args.expression_id))
            if any(abs(reopened[key] - value) > 1e-6 for key, value in expected.items()):
                raise RuntimeError('Cold-reopened expression definition did not persist')
            for expression_id, original_rows in inventory.items():
                if expression_id != args.expression_id and values(await parameters(call, 'expressions', expression_id)) != values(original_rows):
                    raise RuntimeError('A different expression definition changed after cold reopen')
            write(out / 'cold-reopen-values.json', reopened)
            exported = await call('export_vrm', {'expected_model': token, 'filename': 'expression-study-candidate.vrm',
                'version': 1, 'title': 'Expression study', 'author': 'Project study', 'model_version': '1',
                'options': {key: value for key, value in baseline['effective'].items() if value is not None}})
            report['candidateExport'] = exported
        baseline_path = LAB / 'saves/expression-study-baseline.vrm'
        candidate_path = LAB / 'saves/expression-study-candidate.vrm'
        before = inspect_expression_payloads(baseline_path)
        after = inspect_expression_payloads(candidate_path)
        write(out / 'baseline-vrm-readback.json', before)
        write(out / 'candidate-vrm-readback.json', after)
        permission_fields = ['avatarPermission', 'commercialUsage', 'allowRedistribution', 'modification']
        report['permissions'] = {key: {'before': before['metadata'].get(key), 'after': after['metadata'].get(key)}
                                 for key in permission_fields}
        if any(row['before'] != row['after'] for row in report['permissions'].values()):
            raise RuntimeError('Unrequested downstream VRM permission change')
        report['changedVrmExpressionPayloads'] = [key for key in sorted(set(before['expressions']) | set(after['expressions']))
            if before['expressions'].get(key) != after['expressions'].get(key)]
        if not report['changedVrmExpressionPayloads']:
            raise RuntimeError('Persisted parameter has no observed VRM expression binding/morph-data difference')
        report['sealedArtifacts'] = []
        for path in [candidate, baseline_path, candidate_path]:
            destination = out / path.name
            shutil.copy2(path, destination)
            report['sealedArtifacts'].append({'path': destination.relative_to(ROOT).as_posix(), 'sha256': sha(destination)})
        report['status'] = 'single-expression-persistence-and-vrm-difference-observed'
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
    parser.add_argument('--out', type=Path)
    parser.add_argument('--expression-id')
    parser.add_argument('--parameter-id')
    parser.add_argument('--value', type=float)
    args = parser.parse_args()
    if args.mode != 'offline' and not args.execute_native:
        parser.error('Native execution is reserved for the chief-controlled editor window')
    if args.mode == 'test' and (not args.expression_id or not args.parameter_id or args.value is None):
        parser.error('Test requires one actually enumerated expression/parameter and value')
    receipt = preflight()
    out = (args.out or EVIDENCE / 'offline-preflight').resolve()
    if not out.is_relative_to(EVIDENCE.resolve()) or out.exists():
        parser.error('Use a new output directory inside the owned evidence package')
    out.mkdir(parents=True)
    if args.mode == 'offline':
        tools = asyncio.run(create_server(LAB, 'F00', None).list_tools())
        by_name = {tool.name: tool.model_dump(mode='json') for tool in tools}
        for name in ['list_expressions', 'list_parameters', 'set_parameters', 'preview_expression', 'save_as', 'export_vrm']:
            if name not in by_name:
                raise RuntimeError('Required real author tool missing: ' + name)
        write(out / 'actual-tool-schemas.json', by_name)
        write(out / 'report.json', {'status': 'offline-prepared-only', 'toolCount': len(tools),
            'buildAdmission': receipt['buildAdmission'], 'editorLaunches': 0, 'nativeCalls': 0})
        print('Offline schema/build preparation complete; no editor launched')
        return 0
    try:
        result = asyncio.run(native(args, out, receipt))
        print(result['status'])
        return 0
    except BaseException as error:
        write(out / 'failure.json', {'status': 'failed', 'error': str(error), 'traceback': traceback.format_exc()})
        raise


if __name__ == '__main__':
    raise SystemExit(main())
