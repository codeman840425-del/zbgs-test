"""Publish the fixed root-join revision with the existing atomic hair publisher."""
import hashlib
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT/'assets-source/m2-long-hair-v1/revisions/rootjoin-v2'
MANIFEST_SHA = '28337f44c1d297f2657b8ca32466e0c3b9e0cfceb17c39bda019fc19bfb48b9d'

if __name__ == '__main__':
    import sys
    if hashlib.sha256((SOURCE/'manifest.json').read_bytes()).hexdigest() != MANIFEST_SHA:
        raise SystemExit('Refusing unreviewed root-join manifest identity')
    spec = importlib.util.spec_from_file_location('existing_hair_publisher', Path(__file__).with_name('publish.py'))
    publisher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(publisher)
    publisher.SOURCE = SOURCE
    # Retain original publisher's exact-copy, identity, conflict and staging checks.
    if not any(arg == '--output' or arg.startswith('--output=') for arg in sys.argv[1:]):
        sys.argv.extend(['--output', str(ROOT/'prototype/public/assets/m2-long-hair-rootjoin-v2')])
    publisher.main()
