"""Publish only the three SHA-pinned ready cap files after complete readback."""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB, Validator, require
from hat_package import OUTPUT, validate_hat_source


def publish(root=ROOT, output=None, validator=None):
    v = validator if validator is not None else Validator(root)
    payload, identity = validate_hat_source(v, require, GLB)
    dest = Path(output).resolve() if output is not None else root/OUTPUT

    def existing_matches():
        require(dest.is_dir(), 'Different existing cap release')
        existing = {p.relative_to(dest).as_posix(): p.read_bytes() for p in dest.rglob('*') if p.is_file()}
        require(existing == payload, 'Different existing cap release')

    if dest.exists():
        existing_matches()
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix='.hat-stage-', dir=dest.parent))
        try:
            for name, data in payload.items():
                (staging/name).write_bytes(data)
            try:
                os.rename(staging, dest)
            except OSError:
                if not dest.exists():
                    raise
                existing_matches()
        finally:
            if staging.exists():
                require(staging.resolve().parent == dest.parent.resolve() and staging.name.startswith('.hat-stage-'), 'Unsafe staging cleanup')
                shutil.rmtree(staging)
    return {'published': True, 'files': len(payload), 'manifestSha256': identity['manifestSha256'],
            'runtimeAccepted': False, 'sourceInventoryFiles': identity['inventoryFiles']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    print(json.dumps(publish(output=args.output)))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(json.dumps({'published': False, 'error': str(error)}))
        raise SystemExit(2)
