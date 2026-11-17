"""Run the original sample and its saved-file readback in an isolated Blender profile."""
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
TOOLS = ROOT / 'experiments/tools/mpfb-author-study'
EVIDENCE = ROOT / 'evidence/mpfb-author-study-v1'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    receipt = json.loads((PACKAGE / 'prepared/source-receipt.json').read_bytes())
    source = ROOT / receipt['sourceRoot']
    for row in receipt['sourceInventory']:
        if sha(source / row['path']) != row['sha256']:
            raise ValueError('Original upstream file changed: ' + row['path'])
    binary = ROOT / receipt['blender']['path']
    if sha(binary) != receipt['blender']['sha256']:
        raise ValueError('Blender binary SHA mismatch')
    environment = os.environ.copy()
    private = TOOLS / 'private-user'
    for key, folder in [('BLENDER_USER_RESOURCES', private),
                        ('BLENDER_USER_CONFIG', private / 'config'),
                        ('BLENDER_USER_SCRIPTS', private / 'scripts'),
                        ('BLENDER_USER_EXTENSIONS', private / 'extensions')]:
        folder.mkdir(parents=True, exist_ok=True)
        environment[key] = str(folder)
    rows = []
    for phase in ['create', 'reopen']:
        log_path = EVIDENCE / f'{phase}-blender.log'
        if log_path.exists():
            raise ValueError('Use a fresh explicitly named run, preserving prior failure logs')
        command = [str(binary), '--background', '--factory-startup', '--offline-mode', '--threads', '2',
                   '--python-exit-code', '1', '--python', str(PACKAGE / 'blender_worker.py'),
                   '--', '--phase', phase]
        start = time.monotonic()
        peak = 0
        stopped = None
        with log_path.open('wb') as log:
            process = subprocess.Popen(command, env=environment, stdout=log, stderr=subprocess.STDOUT)
            observed = psutil.Process(process.pid)
            while process.poll() is None:
                try:
                    peak = max(peak, observed.memory_info().rss)
                except psutil.NoSuchProcess:
                    break
                if time.monotonic() - start > 300:
                    stopped = '300-second-limit'
                if peak > 3 * 1024 ** 3:
                    stopped = '3-GiB-limit'
                if stopped:
                    process.terminate()
                    break
                time.sleep(.25)
            code = process.wait(timeout=15)
        row = {'phase': phase, 'exitCode': code, 'stopped': stopped,
               'wallSeconds': time.monotonic() - start, 'peakObservedRssBytes': peak,
               'command': command, 'logSha256': sha(log_path)}
        rows.append(row)
        (EVIDENCE / 'execution.json').write_text(json.dumps({
            'schema': 'mpfb-author-study-execution-v1', 'runs': rows,
            'wrapperSha256': sha(Path(__file__)), 'workerSha256': sha(PACKAGE / 'blender_worker.py'),
            'sourceReceiptSha256': sha(PACKAGE / 'prepared/source-receipt.json'),
            'blender': receipt['blender'], 'isolatedUserResources': str(private),
            'psutilVersion': psutil.__version__, 'pythonVersion': sys.version,
            'gpuRendering': False}, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(row), flush=True)
        if code or stopped:
            return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
