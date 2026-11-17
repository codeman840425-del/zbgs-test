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
    'native-vroid-custom-top-unmasked-fit-v1/equipment.json': '9cba67346ad2ed8f7d9af0af5fa941dec273e60330ca8f2616faa533eeab2edb',
    'native-vroid-custom-top-v1/native-vroid-78912-sleeve56-top-v1.glb': '75c113d68a7eab1e9f09178b4ddf5c03a9f9d237e0a66d79b0984f45bd5538b7',
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
    # An extension's runtime URL must be absolute. The source fit and all other
    # fields remain intact; this is an explicit derived catalog, not a new fit.
    source_catalog = 'native-vroid-custom-top-unmasked-fit-v1/equipment.json'
    extra = json.loads((ROOT / 'assets-source' / source_catalog).read_text(encoding='utf-8'))
    for entry in extra['items']:
        resource = (ROOT / 'assets-source' / Path(source_catalog).parent / entry['url']).resolve()
        relative = resource.relative_to(ROOT / 'assets-source').as_posix()
        if relative not in FILES or FILES[relative] != entry['sha256']:
            raise ValueError('Extension resource is not among verified staging inputs')
        entry['url'] = '/assets/native-factory-v1/' + relative
    extra['stagingSource'] = {'path': source_catalog, 'sha256': FILES[source_catalog], 'change': 'resource URL only'}
    encoded = (json.dumps(extra, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    extension = DEST / 'sleeve56-runtime-equipment.json'
    if extension.exists() and extension.read_bytes() != encoded:
        raise ValueError('Refusing to replace a different runtime extension')
    for relative, expected in FILES.items():
        target = DEST / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copyfile(ROOT / 'assets-source' / relative, target)
        if sha(target) != expected:
            raise ValueError(f'Staged readback mismatch: {target}')
    if not extension.exists():
        extension.write_bytes(encoded)
    print(json.dumps({'passed': True, 'files': len(FILES), 'destination': str(DEST),
        'extensionSha256': sha(extension),
        'scope': 'Byte-preserving staging; no runtime or visual acceptance'}, ensure_ascii=False))

if __name__ == '__main__':
    main()
