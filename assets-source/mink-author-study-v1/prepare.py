"""Fetch only fixed Mink source and its UR5e collision example inputs."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = Path(__file__).resolve().parent
TOOLS = ROOT / 'experiments/tools/mink-author-study'
COMMIT = '5f800f0a369d05bab88b5e5582cf95122d3b82a5'


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mink-original-author-study'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def main():
    source = TOOLS / 'source'
    if source.exists() or (PACKAGE / 'prepared').exists():
        raise ValueError('Refusing to overwrite existing fixed-source preparation')
    tree_url = f'https://api.github.com/repos/kevinzakka/mink/git/trees/{COMMIT}?recursive=1'
    tree_data = fetch(tree_url)
    tree = json.loads(tree_data)
    if tree.get('truncated'):
        raise ValueError('Upstream tree is incomplete')
    selected = [row for row in tree['tree'] if row['type'] == 'blob' and (
        row['path'].startswith('src/mink/') or
        row['path'].startswith('examples/universal_robots_ur5e/assets/') or
        row['path'] in {'LICENSE', 'README.md', 'pyproject.toml',
                       'examples/arm_ur5e.py', 'tests/test_collision_avoidance_limit.py',
                       'examples/universal_robots_ur5e/scene.xml',
                       'examples/universal_robots_ur5e/ur5e.xml',
                       'examples/universal_robots_ur5e/LICENSE',
                       'examples/universal_robots_ur5e/README.md'})]
    TOOLS.mkdir(parents=True, exist_ok=True)
    (TOOLS / 'upstream-tree.json').write_bytes(tree_data)

    def download(row):
        data = fetch(f"https://raw.githubusercontent.com/kevinzakka/mink/{COMMIT}/{row['path']}")
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if blob != row['sha'] or len(data) != row['size']:
            raise ValueError('Upstream Git blob mismatch: ' + row['path'])
        output = source / row['path']
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)
        return {'path': row['path'], 'gitBlob': blob, 'bytes': len(data),
                'sha256': hashlib.sha256(data).hexdigest()}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        inventory = list(pool.map(download, selected))
    prepared = PACKAGE / 'prepared'
    prepared.mkdir()
    originals = PACKAGE / 'original'
    originals.mkdir()
    for name, relative in {
        'arm_ur5e.py': 'examples/arm_ur5e.py',
        'test_collision_avoidance_limit.py': 'tests/test_collision_avoidance_limit.py',
        'LICENSE-mink': 'LICENSE',
        'LICENSE-ur5e': 'examples/universal_robots_ur5e/LICENSE',
        'pyproject.toml': 'pyproject.toml',
    }.items():
        (originals / name).write_bytes((source / relative).read_bytes())
    result = {'schema': 'mink-author-study-source-v1', 'commit': COMMIT,
              'repository': 'https://github.com/kevinzakka/mink',
              'sourceRoot': source.relative_to(ROOT).as_posix(),
              'downloadedBytesIncludingTree': len(tree_data) + sum(row['bytes'] for row in inventory),
              'sourceFiles': inventory,
              'sourceImports': 'PYTHONPATH points to the fixed source/src directory',
              'nativeLieAcceleration': 'disabled via original MINK_DISABLE_NATIVE=1 option',
              'models': ['original universal_robots_ur5e'], 'training': False}
    (prepared / 'source-receipt.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'files': len(inventory), 'bytes': result['downloadedBytesIncludingTree'],
                      'commit': COMMIT}), flush=True)


if __name__ == '__main__':
    main()
