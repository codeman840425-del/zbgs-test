"""One recorded original Bridge call; no desktop input or editor launch."""
from pathlib import Path
import importlib.util
import json
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
BASE = Path(__file__).resolve().parent
EVIDENCE = ROOT / 'evidence/native-vroid-male-skin-recovery-v1'
spec = importlib.util.spec_from_file_location('original_bridge_call', ROOT/'assets-source/vroid-bridge-study-v1/call.py')
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)

def payload(path):
    record = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    assert record['ok'] is True, record.get('failures')
    response = next(r for r in record['responses'] if r.get('id') == 2)
    blocks = response['result']['content']
    for block in blocks:
        if block.get('type') == 'text':
            try:
                return json.loads(block['text'])
            except ValueError:
                continue
    raise AssertionError('Missing structured original tool payload')

def call(name, tool, args):
    request_dir = BASE / 'requests'
    request_dir.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    request = request_dir/(name+'.json')
    with request.open('x', encoding='utf-8') as f:
        json.dump(dict(method='tools/call',params=dict(name=tool,arguments=args)), f, ensure_ascii=False, indent=2)
        f.write('\n')
    output = EVIDENCE/(name+'.json')
    client.run_call(request, output)
    value = payload(output)
    print(json.dumps(value, ensure_ascii=False))
    return value

if __name__ == '__main__':
    call(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv)>3 else {})
