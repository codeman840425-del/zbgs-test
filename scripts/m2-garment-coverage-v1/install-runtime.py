"""Copy the pinned coverage descriptor into the runtime public asset tree."""
import hashlib
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets-source/m2-garment-coverage-v1/coverage-mask.json'
TARGET = ROOT / 'prototype/public/assets/m2-garment-coverage-v1/coverage-mask.json'
EXPECTED = '9da63589879a129aacddded37d9dfcc60d7f32364a394c316737c9999f65bfc6'

data = SOURCE.read_bytes()
observed = hashlib.sha256(data).hexdigest()
if observed != EXPECTED:
    raise SystemExit(f'coverage source SHA mismatch: {observed}')
TARGET.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(SOURCE, TARGET)
if TARGET.read_bytes() != data:
    raise SystemExit('runtime descriptor copy mismatch')
print({'path': TARGET.relative_to(ROOT).as_posix(), 'bytes': len(data), 'sha256': observed})
