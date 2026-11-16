"""Run the pinned background Blender prerequisite trial with bounded resources."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

import psutil

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-representative-cage-trial-v1'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tool-root', type=Path, default=ROOT)
    parser.add_argument('--out', type=Path, default=BASE / 'generated')
    parser.add_argument('--phase', choices=['preflight', 'batch'], default='preflight')
    args = parser.parse_args()
    spec = json.loads((BASE / 'spec.json').read_bytes())
    binary = args.tool_root / spec['tool']['path']
    if digest(binary) != spec['tool']['sha256']:
        raise ValueError('Pinned Blender SHA mismatch')
    for reference in [spec['sourceSpec']] + [s['body'] for s in spec['sources'].values()] + [e for s in spec['sources'].values() for e in s['equipment']]:
        if digest(ROOT / reference['path']) != reference['sha256']:
            raise ValueError('Input SHA mismatch: ' + reference['path'])
    output = args.out.resolve()
    if not output.is_relative_to(BASE.resolve()):
        raise ValueError('Output must stay inside trial package')
    if args.phase == 'preflight' and output.exists():
        raise ValueError('Use a new output directory inside the trial package')
    if args.phase == 'batch':
        prerequisite = json.loads((output / 'preflight.json').read_bytes())
        if prerequisite['status'] != 'preflight-passed' or (output / 'batch-run-report.json').exists():
            raise ValueError('Require actual passed preflight and an unused batch output')
    else:
        output.mkdir(parents=True)
    command = [str(binary), '--background', '--factory-startup', '--threads', '2',
               '--python-exit-code', '1', '--python', str(Path(__file__).with_name(args.phase + '.py')),
               '--', '--out', str(output)]
    start = time.monotonic()
    peak = 0
    stop = None
    with (output / (args.phase + '-blender.log')).open('wb') as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
        observed = psutil.Process(process.pid)
        while process.poll() is None:
            try:
                peak = max(peak, observed.memory_info().rss)
            except psutil.NoSuchProcess:
                break
            if peak > spec['preflight']['memoryLimitBytes']:
                stop = 'memory-limit'
            if time.monotonic() - start > spec['preflight']['timeLimitSeconds']:
                stop = 'time-limit'
            if stop:
                process.terminate()
                break
            time.sleep(.25)
        code = process.wait(timeout=15)
    result = {'schema': 'representative-cage-run-v1', 'exitCode': code, 'stop': stop,
              'elapsedSeconds': time.monotonic() - start, 'peakObservedRssBytes': peak,
              'blender': spec['tool'], 'psutilVersion': psutil.__version__,
              'pythonVersion': sys.version, 'gpuRendering': False}
    (output / (args.phase + '-run-report.json')).write_bytes((json.dumps(result, indent=2) + '\n').encode())
    print(json.dumps(result))
    return 2 if stop or code else 0


if __name__ == '__main__':
    raise SystemExit(main())
