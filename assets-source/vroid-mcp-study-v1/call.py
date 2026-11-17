"""Call the author's MCP HTTP helper, retaining one immutable response per operation.

Usage: python call.py request.json output.json
This is a local protocol client, not registration in the Codex host.
"""
import base64
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('vroid_author_api', ROOT / 'original/api_tests.py')
author = importlib.util.module_from_spec(spec)
spec.loader.exec_module(author)

def main():
    request_path, output_path = map(Path, sys.argv[1:])
    if output_path.exists():
        raise FileExistsError(output_path)
    request = json.loads(request_path.read_text(encoding='utf-8-sig'))
    client = author.Harness('127.0.0.1:17890', 'http://127.0.0.1:17891/mcp/', None, 60)
    status, raw = client.mcp_raw(request)
    response = json.loads(raw) if raw else None
    output_path.parent.mkdir(parents=True, exist_ok=True)
    images = []
    for index, block in enumerate((response or {}).get('result', {}).get('content', [])):
        if block.get('type') == 'image' and block.get('data'):
            target = output_path.with_suffix(f'.image-{index}.png')
            if target.exists():
                raise FileExistsError(target)
            data = base64.b64decode(block['data'])
            target.write_bytes(data)
            import hashlib
            images.append(str(target))
            block['savedImage'] = target.name
            block['sha256'] = hashlib.sha256(data).hexdigest()
            del block['data']
    result = dict(httpStatus=status, request=request, response=response, images=images)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(dict(httpStatus=status, output=str(output_path), images=images)))
    if status >= 400 or (response or {}).get('error') or (response or {}).get('result', {}).get('isError'):
        raise SystemExit(1)
    # A batch may report per-operation failures inside a successful MCP envelope.
    if request.get('params', {}).get('name') == 'batch':
        for block in (response or {}).get('result', {}).get('content', []):
            if block.get('type') != 'text':
                continue
            try:
                operations = json.loads(block.get('text', ''))
            except json.JSONDecodeError:
                continue
            if isinstance(operations, list) and any(isinstance(o, dict) and o.get('ok') is False for o in operations):
                raise SystemExit('Batch operation failed; inspect recorded response before any retry.')

if __name__ == '__main__':
    main()
