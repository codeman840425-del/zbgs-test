"""Fetch the fixed original MPFB addon and sample, without external asset packs."""
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = Path(__file__).resolve().parent
TOOLS = ROOT / 'experiments/tools/mpfb-author-study'
COMMIT = '9de0707fdc88438d7c53a1a2ac7937d9221e2431'
LIMIT = 200 * 1024 * 1024


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'MPFB-original-author-study'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError('Download exceeds the authorized 200 MiB limit')
    return data


def main():
    if TOOLS.exists() or (PACKAGE / 'prepared').exists():
        raise ValueError('Refusing to overwrite an existing study preparation')
    tree_url = f'https://api.github.com/repos/makehumancommunity/mpfb2/git/trees/{COMMIT}?recursive=1'
    tree_bytes = fetch(tree_url)
    tree = json.loads(tree_bytes)
    if tree.get('truncated'):
        raise ValueError('Incomplete upstream tree')
    total = sum(row.get('size', 0) for row in tree['tree'])
    if total > LIMIT:
        raise ValueError('Upstream expanded source exceeds the download budget estimate')
    TOOLS.mkdir(parents=True)
    (TOOLS / 'upstream-tree.json').write_bytes(tree_bytes)
    archive_url = f'https://codeload.github.com/makehumancommunity/mpfb2/zip/{COMMIT}'
    archive = fetch(archive_url)
    archive_path = TOOLS / f'mpfb2-{COMMIT}.zip'
    archive_path.write_bytes(archive)
    selected = [row for row in tree['tree'] if row['type'] == 'blob' and (
        row['path'].startswith('src/mpfb/') or row['path'] in {
            'script_samples/02_working_with_modeling_targets.py',
            'LICENSE.md', 'LICENSE.CODE.md', 'LICENSE.ASSETS.md', 'README.md'})]
    source_root = TOOLS / 'source'
    inventory = []
    with zipfile.ZipFile(archive_path) as bundle:
        prefix = f'mpfb2-{COMMIT}/'
        for row in selected:
            relative = Path(row['path'])
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Unexpected upstream source path')
            data = bundle.read(prefix + row['path'])
            git_sha = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            if git_sha != row['sha'] or len(data) != row['size']:
                raise ValueError('Upstream Git blob mismatch: ' + row['path'])
            output = source_root / relative
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(data)
            inventory.append({'path': row['path'], 'gitBlob': git_sha,
                              'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
    original = PACKAGE / 'original'
    original.mkdir()
    for name in ['LICENSE.md', 'LICENSE.CODE.md', 'LICENSE.ASSETS.md']:
        (original / name).write_bytes((source_root / name).read_bytes())
    sample = 'script_samples/02_working_with_modeling_targets.py'
    (original / Path(sample).name).write_bytes((source_root / sample).read_bytes())
    prepared = PACKAGE / 'prepared'
    prepared.mkdir()
    spec = {'schema': 'mpfb-original-author-study-v1', 'commit': COMMIT,
            'repository': 'https://github.com/makehumancommunity/mpfb2',
            'archive': {'url': archive_url, 'sha256': hashlib.sha256(archive).hexdigest(),
                        'bytes': len(archive)},
            'upstreamTreeUncompressedBytes': total,
            'selectedBytes': sum(row['bytes'] for row in inventory),
            'downloadedBytesIncludingTree': len(archive) + len(tree_bytes),
            'externalAssetPacks': [], 'sourceRoot': source_root.relative_to(ROOT).as_posix(),
            'sample': sample, 'sourceInventory': inventory,
            'blender': {'path': 'experiments/tools/blender-4.5.9-windows-x64/blender.exe',
                        'sha256': '42c096b04d79bd0ff234429f67178881047c1c370d25ad3aef2766f3eeac4024'}}
    (prepared / 'source-receipt.json').write_text(json.dumps(spec, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in spec.items() if key != 'sourceInventory'}))


if __name__ == '__main__':
    main()
