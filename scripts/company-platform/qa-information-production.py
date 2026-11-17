"""Exercise the independent offline content CLI, including failure before output."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets-source/company-information-v1'
OUT = Path(sys.argv[1]).resolve()
OUT.mkdir(parents=True, exist_ok=False)
report = {'status': 'running', 'checks': [], 'limits': ['Offline producer only; actual rendering is checked separately.']}
sha = lambda data: hashlib.sha256(data).hexdigest()
try:
    with tempfile.TemporaryDirectory(prefix='company-information-inputs-') as temp:
        work = Path(temp)
        for name in ['NotoSansSC-VF.ttf', 'OFL.txt']:
            shutil.copy2(SOURCE / name, work / name)
        original = json.loads((SOURCE / 'parameters.json').read_text(encoding='utf8'))

        def run(source, name):
            config = work / f'{name}.json'
            config.write_text(json.dumps(source, ensure_ascii=False), encoding='utf8')
            destination = work / name
            process = subprocess.run([sys.executable, str(SOURCE / 'generate-content.py'), '--input', str(config), '--output-dir', str(destination)], capture_output=True, text=True, encoding='utf8')
            return process, destination

        baseline, baseline_dir = run(original, 'baseline')
        assert baseline.returncode == 0, baseline.stderr
        variant = copy.deepcopy(original)
        variant['contents'][1]['title'] = '直播安排'
        changed, changed_dir = run(variant, 'changed')
        assert changed.returncode == 0, changed.stderr
        file = 'company-live-cn.png'
        before, after = (baseline_dir / file).read_bytes(), (changed_dir / file).read_bytes()
        assert before != after
        assert (baseline_dir / 'company-news-cn.png').read_bytes() == (changed_dir / 'company-news-cn.png').read_bytes()
        (OUT / 'modified-parameters.json').write_text(json.dumps(variant, ensure_ascii=False, indent=2), encoding='utf8')
        (OUT / 'modified-content.png').write_bytes(after)
        report['checks'].append({'name': 'Second content source edit changes only its actual PNG', 'passed': True, 'beforeSha256': sha(before), 'afterSha256': sha(after)})

        def field(key, value):
            return lambda source: source['contents'][1].__setitem__(key, value)

        cases = [
            ('unsafe-id', field('id', '../escaped')),
            ('duplicate-id', field('id', original['contents'][0]['id'])),
            ('four-lines', field('lines', ['一', '二', '三', '四'])),
            ('newline', field('title', '第一行\n第二行')),
            ('unknown-graphic', field('graphic', 'external-image')),
            ('invalid-color', field('accent', 'invalid')),
            ('missing-glyph', field('title', '\U0010FFFF')),
            ('text-overflow', field('title', '公司公告' * 20)),
        ]
        for name, mutate in cases:
            bad = copy.deepcopy(original)
            mutate(bad)
            result, destination = run(bad, name)
            assert result.returncode != 0, name
            assert not destination.exists() or not list(destination.iterdir()), f'{name}: partial output'
            report['checks'].append({'name': name, 'passed': True, 'exitCode': result.returncode, 'diagnostic': result.stderr.strip().splitlines()[-1], 'noPartialPng': True})
        report['tools'] = {key: value for key, value in json.loads(baseline.stdout).items() if key != 'outputs'}
    report['status'] = 'passed'
except Exception as error:
    report['status'] = 'failed'
    report['error'] = repr(error)
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'status': report['status'], 'checks': len(report['checks'])}))
