"""Stage pinned native-factory specimens without invoking VRoid or changing sources."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'prototype/public/assets/native-factory-v1'
FILES = {
    'native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm': '843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef',
    'native-vroid-factory-fit-v1/equipment.json': 'f6088ae94008425061d9e7305eb311dc79399e9bed3b25541cd073bc6dc557d4',
    'native-vroid-equipment-v1/native-vroid-78912-top-v1.glb': '36c1b6a4d63839e94b21057898f9990b1ce4978a87140b70dcae9a1d779739d9',
    'native-vroid-equipment-v1/native-vroid-78912-shorts-v1.glb': '12d922ec62cdb530d0dfa2e055e7632fb72c8359a9d3482546eccd7681d3e7c6',
    'native-vroid-equipment-v1/native-vroid-78912-shoes-v1.glb': '23c16289206c9c62b582921722510ac89b6d6bcd2397594a311494c1092f5243',
    'native-vroid-body-texture-fit-v1/manifest.json': '003e98086ed67b6fcd5c57e0b3b13e9c4a4beff412b3b74683e7cefc049c8fb2',
    'native-vroid-body-texture-fit-v1/native-tops-body.png': 'dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c',
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    # Verify every source and existing destination before creating any output.
    for relative, expected in FILES.items():
        source = ROOT / 'assets-source' / relative
        if sha(source) != expected:
            raise ValueError(f'Source identity mismatch: {relative}')
        target = DEST / relative
        if target.exists() and sha(target) != expected:
            raise ValueError(f'Refusing to replace different staged resource: {target}')
    for relative, expected in FILES.items():
        target = DEST / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copyfile(ROOT / 'assets-source' / relative, target)
        if sha(target) != expected:
            raise ValueError(f'Staged readback mismatch: {target}')
    print(json.dumps({'passed': True, 'files': len(FILES), 'destination': str(DEST),
        'scope': 'Byte-preserving staging; no runtime or visual acceptance'}, ensure_ascii=False))

if __name__ == '__main__':
    main()
