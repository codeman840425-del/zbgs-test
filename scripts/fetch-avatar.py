"""Fetch the exact licensed reference VRM. Existing unknown files are never overwritten."""
import hashlib
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET = ROOT / 'prototype/public/assets/avatar.vrm'
COMMIT = 'ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab'
URL = f'https://raw.githubusercontent.com/pixiv/three-vrm/{COMMIT}/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm'
SHA256 = '12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2'
SIZE = 10776032

if TARGET.exists():
    data = TARGET.read_bytes()
    assert len(data) == SIZE and hashlib.sha256(data).hexdigest() == SHA256, 'Existing avatar differs; preserve it and resolve manually'
    print('Existing avatar verified:', TARGET)
else:
    with urllib.request.urlopen(URL, timeout=120) as response:
        data = response.read()
    assert len(data) == SIZE, 'Truncated/unexpected download'
    assert hashlib.sha256(data).hexdigest() == SHA256, 'Unexpected source file'
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with TARGET.open('xb') as output:
        output.write(data)
    print('Downloaded and verified:', TARGET)
print('VRM1_Constraint_Twist_Sample v1.0.1; (c) 2022 pixiv Inc.; VRM Public License 1.0. See docs/ASSETS.md.')
