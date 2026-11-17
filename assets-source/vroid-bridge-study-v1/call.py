"""Use the unmodified release's stdio MCP server, recording request and responses.
Usage: python call.py REQUEST.json NEW_OUTPUT.json
No host registration, desktop input or editor launch occurs in this client.
"""
from pathlib import Path
import base64
import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT/'experiments/tools/vroid-mcp-bridge-0.15.0/package/VRoidMcp-v0.15.0'

def payload_failures(value, path='payload'):
    """Inspect decoded author payloads, including batch result wrappers."""
    failures = []
    if isinstance(value, dict):
        if value.get('ok') is False or value.get('isError') is True:
            failures.append(path + ': explicit failure')
        if value.get('error') not in (None, '', False):
            failures.append(path + ': error')
        status = value.get('http_status')
        if isinstance(status, (int, float)) and status >= 400:
            failures.append(path + ': HTTP failure')
        failed = value.get('failed')
        if (isinstance(failed, (int, float)) and failed > 0) or (isinstance(failed, list) and failed):
            failures.append(path + ': failed operations')
        if value.get('notRestored'):
            failures.append(path + ': restoration incomplete')
        if isinstance(value.get('results'), list) and 'requested' in value and 'executed' in value:
            if value['requested'] != value['executed']:
                failures.append(path + ': batch incomplete')
        for key, child in value.items():
            if isinstance(child, (dict, list)):
                failures.extend(payload_failures(child, path + '.' + str(key)))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            failures.extend(payload_failures(child, f'{path}[{index}]'))
    return failures


def inspect_responses(stdout, request):
    responses, failures = [], []
    try:
        lines = stdout.decode('utf-8').splitlines()
    except UnicodeDecodeError:
        return [], ['stdout is not UTF-8']
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        try:
            response = json.loads(line)
            if not isinstance(response, dict):
                raise ValueError('not an object')
            responses.append(response)
        except ValueError:
            failures.append(f'stdout line {index + 1}: invalid JSON-RPC object')
    for response_id in (1, 2):
        matching = [r for r in responses if r.get('id') == response_id]
        if len(matching) != 1:
            failures.append(f'response {response_id}: expected exactly one, got {len(matching)}')
            continue
        response = matching[0]
        if response.get('jsonrpc') != '2.0' or 'error' in response or not isinstance(response.get('result'), dict):
            failures.append(f'response {response_id}: invalid or failed envelope')
            continue
        result = response['result']
        if result.get('isError') is True:
            failures.append(f'response {response_id}: isError')
        if response_id != 2 or request.get('method') != 'tools/call':
            continue
        content = result.get('content')
        if not isinstance(content, list) or not content:
            failures.append('tool response: missing or empty content')
            continue
        usable_payload = False
        for index, block in enumerate(content):
            path = f'content[{index}]'
            if not isinstance(block, dict):
                failures.append(path + ': invalid block')
                continue
            if block.get('type') == 'image':
                usable_payload |= bool(block.get('data'))
            elif block.get('type') == 'text':
                text = block.get('text')
                if not isinstance(text, str):
                    failures.append(path + ': invalid text')
                    continue
                try:
                    payload = json.loads(text)
                except ValueError:
                    # The author prepends a plain cache notice, and help is plain text.
                    if text.lstrip().startswith(('{', '[')):
                        failures.append(path + ': malformed JSON payload')
                    elif request.get('params', {}).get('name') == 'vroid_help' and text.strip():
                        usable_payload = True
                    continue
                if isinstance(payload, (dict, list)):
                    usable_payload = True
                    failures.extend(payload_failures(payload, path))
        if not usable_payload:
            failures.append('tool response: no structured payload/image (or help text)')
    return responses, failures


def run_call(request_file, output):
    request_file, output = Path(request_file), Path(output)
    stdout_path = output.with_suffix(output.suffix + '.stdout.bin')
    stderr_path = output.with_suffix(output.suffix + '.stderr.bin')
    for path in (output, stdout_path, stderr_path):
        if path.exists():
            raise FileExistsError(path)
    request = json.loads(request_file.read_text(encoding='utf-8-sig'))
    messages = [dict(jsonrpc='2.0', id=1, method='initialize', params=dict(protocolVersion='2025-06-18', capabilities={}, clientInfo=dict(name='gamemake-bridge-study',version='1'))), dict(jsonrpc='2.0',method='notifications/initialized'), dict(request, id=2, jsonrpc='2.0')]
    started = time.monotonic()
    output.parent.mkdir(parents=True,exist_ok=True)
    exit_code, failure = None, None
    try:
        result = subprocess.run([str(PACKAGE/'python/python.exe'),str(PACKAGE/'mcp_server/vroid_mcp.py')],input=('\n'.join(json.dumps(m,ensure_ascii=False) for m in messages)+'\n').encode('utf-8'),capture_output=True,timeout=960,env=dict(os.environ,NO_PROXY='127.0.0.1,localhost'),creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        stdout, stderr, exit_code = result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired as exc:
        stdout, stderr = exc.stdout or b'', exc.stderr or b''
        failure = 'client timeout after 960 seconds; editor operation state unknown'
    except OSError as exc:
        stdout, stderr = b'', b''
        failure = f'process launch failed: {type(exc).__name__}: {exc}'
    # Byte-exact evidence survives decoding/parsing/image failures and is never printed.
    for path, data in ((stdout_path, stdout), (stderr_path, stderr)):
        with path.open('xb') as stream:
            stream.write(data)
    responses, failures = inspect_responses(stdout, request)
    if failure:
        failures.insert(0, failure)
    if exit_code not in (None, 0):
        failures.append(f'process exit code {exit_code}')
    images=[]
    for response in responses:
        result = response.get('result')
        content = result.get('content', []) if isinstance(result, dict) else []
        for i,block in enumerate(content if isinstance(content, list) else []):
            if isinstance(block, dict) and block.get('type')=='image' and 'data' in block:
                encoded = block.pop('data')
                suffix = {'image/png': 'png', 'image/jpeg': 'jpg'}.get(block.get('mimeType'), 'bin')
                target=output.with_suffix(f'.image-{response.get("id")}-{i}.{suffix}')
                try:
                    data=base64.b64decode(encoded, validate=True)
                    if not data:
                        raise ValueError('empty image')
                    with target.open('xb') as stream:
                        stream.write(data)
                    block.update(savedImage=target.name,sha256=hashlib.sha256(data).hexdigest())
                    images.append(str(target))
                except (ValueError, TypeError, OSError) as exc:
                    block['imageError'] = type(exc).__name__
                    failures.append(f'image {response.get("id")}/{i}: {type(exc).__name__}')
    record=dict(request=request,responses=responses,wallSeconds=time.monotonic()-started,exitCode=exit_code,stderr=stderr.decode('utf-8',errors='replace'),images=images,ok=not failures,failures=failures,rawStdout=dict(path=stdout_path.name,bytes=len(stdout),sha256=hashlib.sha256(stdout).hexdigest()),rawStderr=dict(path=stderr_path.name,bytes=len(stderr),sha256=hashlib.sha256(stderr).hexdigest()))
    with output.open('x', encoding='utf-8') as stream:
        stream.write(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(output=str(output),images=images,wallSeconds=record['wallSeconds'],ok=record['ok'],failureCount=len(failures))))
    if failures:
        raise SystemExit('MCP failed; inspect response before any retry.')
    return record


def main():
    run_call(*sys.argv[1:])

if __name__=='__main__': main()
