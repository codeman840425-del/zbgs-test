"""Rebuild the two recorded exports, re-export the editable mesh and compare exact receipts."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def check(files, root):
    for name, expected in files.items():
        actual = hashlib.sha256((root/name).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError('SHA mismatch: '+name)


def main():
    receipt = json.loads((HERE/'source-lock.json').read_bytes())
    check(receipt['producerInputs'], ROOT)
    check(receipt['editableInput'], HERE)
    for args in [('make.py','--first-export'), ('make.py',), ('pattern.py',), ('inspect_fit.py',)]:
        subprocess.run([sys.executable,'-B',str(HERE/args[0]),*args[1:]], cwd=ROOT, check=True)
    check(receipt['generatedFiles'], HERE)
    print('Reproduced all', len(receipt['generatedFiles']), 'derived files; editable OBJ independently re-exported.')


if __name__ == '__main__':
    main()
