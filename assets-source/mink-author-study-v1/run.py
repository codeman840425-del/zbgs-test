"""Bounded CPU run of the original Mink examples, with isolated dependencies."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import psutil

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = Path(__file__).resolve().parent
TOOLS = ROOT / 'experiments/tools/mink-author-study'
EVIDENCE = ROOT / 'evidence/mink-author-study-v1'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    evidence = EVIDENCE / 'environment-fix-v2' if '--environment-fix' in sys.argv[1:] else EVIDENCE
    evidence.mkdir(parents=True, exist_ok=True)
    receipt = json.loads((PACKAGE / 'prepared/source-receipt.json').read_bytes())
    source = ROOT / receipt['sourceRoot']
    for row in receipt['sourceFiles']:
        if digest(source / row['path']) != row['sha256']:
            raise ValueError('Pinned source changed: ' + row['path'])
    output = evidence / 'execution.json'
    if output.exists():
        raise ValueError('Refusing to overwrite prior execution evidence')
    environment = os.environ.copy()
    environment.update({'PYTHONPATH': str(source / 'src'), 'MINK_DISABLE_NATIVE': '1',
                        'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2',
                        'MKL_NUM_THREADS': '2'})
    command = [str(TOOLS / '.venv/Scripts/python.exe'), str(PACKAGE / 'worker.py')]
    start = time.monotonic()
    peak = 0
    stopped = None
    log_path = evidence / 'worker.log'
    with log_path.open('xb') as log:
        process = subprocess.Popen(command, env=environment, stdout=log, stderr=subprocess.STDOUT)
        observed = psutil.Process(process.pid)
        while process.poll() is None:
            try:
                peak = max(peak, observed.memory_info().rss)
            except psutil.NoSuchProcess:
                break
            if time.monotonic() - start > 120:
                stopped = '120-second-limit'
            if peak > 2 * 1024 ** 3:
                stopped = '2-GiB-limit'
            if stopped:
                process.terminate()
                break
            time.sleep(.1)
        code = process.wait(timeout=10)
    result = {'schema': 'mink-author-study-execution-v1', 'exitCode': code, 'stopped': stopped,
              'wallSeconds': time.monotonic() - start, 'peakObservedRssBytes': peak,
              'command': command, 'cpuThreadEnvironment': {key: environment[key] for key in [
                  'OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS']},
              'workerSha256': digest(PACKAGE / 'worker.py'),
              'runnerSha256': digest(Path(__file__)), 'logSha256': digest(log_path),
              'sourceReceiptSha256': digest(PACKAGE / 'prepared/source-receipt.json'),
              'gpuRendering': False, 'training': False}
    output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result), flush=True)
    return 1 if code or stopped else 0


if __name__ == '__main__':
    raise SystemExit(main())
