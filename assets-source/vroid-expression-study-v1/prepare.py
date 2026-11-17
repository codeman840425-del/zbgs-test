"""Prepare the fixed author runtime and physical lab without launching VRoid."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = Path(__file__).resolve().parent
PRIVATE = PACKAGE / 'private-tools'
EVIDENCE = ROOT / 'evidence/vroid-expression-study-v1'
COMMIT = '6469bd3a6d00fe5fac508d992f63b5a1a783d80e'
BARE = ROOT / 'experiments/tools/vroid-2.16.0/app'
MODEL = ROOT / 'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vroid'
MODEL_SHA = '311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'VRoid-expression-source-study'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(64 * 1024 * 1024 + 1)
    if len(data) > 64 * 1024 * 1024:
        raise ValueError('Unexpected fixed-source archive size')
    return data


def main():
    if PRIVATE.exists() or (PACKAGE / 'prepared').exists():
        raise ValueError('Use a new study identity; prior preparation is preserved')
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    PRIVATE.mkdir()
    prepared = PACKAGE / 'prepared'
    prepared.mkdir()
    if sha(MODEL) != MODEL_SHA:
        raise ValueError('The selected input .vroid SHA changed')
    expected = {
        'GameAssembly.dll': 'c8daa116938b40896e3a09208bbde71604a92d5ca6d86f9ff8b89fea3c1a5ad2',
        'VRoidStudio_Data/il2cpp_data/Metadata/global-metadata.dat': '089fe945572695f0592e04abaae096c54f7ea74a382a3ce68440e0425b8486b8'}
    for name, value in expected.items():
        if sha(BARE / name) != value:
            raise ValueError('Original author build admission mismatch: ' + name)
    if (BARE / 'BepInEx').exists() or (BARE / 'winhttp.dll').exists():
        raise ValueError('This study requires the unchanged official bare directory')
    tree_bytes = fetch(f'https://api.github.com/repos/froz3ncore/VRoid-Character-MCP/git/trees/{COMMIT}?recursive=1')
    tree = json.loads(tree_bytes)
    if tree.get('truncated'):
        raise ValueError('Incomplete fixed-source tree')
    archive = fetch(f'https://codeload.github.com/froz3ncore/VRoid-Character-MCP/zip/{COMMIT}')
    archive_path = PRIVATE / 'upstream.zip'
    archive_path.write_bytes(archive)
    wanted = {'launch.py', 'prepare_lab.py', 'pyproject.toml', 'requirements.txt',
              'package.json', 'package-lock.json', 'LICENSE', 'LICENSING.md', 'NOTICE',
              'README.md', 'ATTACHED_SESSION.md', 'tools/tool_manifest.py',
              'tools/expected-tools.json', 'tools/vrm_inspect.py',
              'tests/test_ordinary_vrm_options.py', 'tests/parameter_adapter_test.js',
              'docs/native-evidence/2026-11-07-vroid-216.md'}
    selected = [row for row in tree['tree'] if row['type'] == 'blob' and (
        row['path'].startswith(('vroid_mcp/', 'agent/', 'licenses/')) or row['path'] in wanted)]
    source = PRIVATE / 'upstream'
    inventory = []
    with zipfile.ZipFile(archive_path) as bundle:
        for row in selected:
            relative = Path(row['path'])
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Unexpected upstream path')
            data = bundle.read('VRoid-Character-MCP-' + COMMIT + '/' + row['path'])
            blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            if blob != row['sha'] or len(data) != row['size']:
                raise ValueError('Original Git blob mismatch: ' + row['path'])
            output = source / relative
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(data)
            inventory.append({'path': row['path'], 'bytes': len(data), 'gitBlob': blob,
                              'sha256': hashlib.sha256(data).hexdigest()})
    # This is the original read/copy/hash entry. It never starts the editor.
    lab = PRIVATE / 'lab'
    command = [sys.executable, str(source / 'prepare_lab.py'), '--source', str(BARE), '--lab', str(lab)]
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
    (EVIDENCE / 'original-prepare-lab.log').write_text(result.stdout + result.stderr, encoding='utf-8')
    if result.returncode:
        raise RuntimeError('Original lab preparation failed; retained for diagnosis')
    sys.path.insert(0, str(source))
    from vroid_mcp.supported_builds import assembly_identity
    admission = assembly_identity(lab / 'app/GameAssembly.dll')
    sources = lab / 'saves'
    sources.mkdir()
    copied = sources / 'source.vroid'
    copied.write_bytes(MODEL.read_bytes())
    if sha(copied) != MODEL_SHA or sha(MODEL) != MODEL_SHA:
        raise ValueError('Source model copy/readback failed')
    receipt = {'schema': 'vroid-expression-study-preparation-v1', 'status': 'prepared-not-executed',
               'upstreamCommit': COMMIT, 'upstreamFiles': inventory,
               'archive': {'sha256': hashlib.sha256(archive).hexdigest(), 'bytes': len(archive)},
               'sourceRoot': source.relative_to(ROOT).as_posix(),
               'lab': lab.relative_to(ROOT).as_posix(), 'labSource': BARE.relative_to(ROOT).as_posix(),
               'originalPrepareCommand': command, 'buildAdmission': admission,
               'physicalAppInventory': {'path': (lab / 'source-manifest.json').relative_to(ROOT).as_posix(),
                                        'sha256': sha(lab / 'source-manifest.json')},
               'inputModel': {'path': MODEL.relative_to(ROOT).as_posix(), 'sha256': MODEL_SHA,
                              'labCopy': copied.relative_to(ROOT).as_posix()},
               'editorLaunches': 0, 'nativeCalls': 0, 'attachedProcesses': 0,
               'retention': 'One authorized expression trial, then seal output/logs and remove the private lab copy after its process exits. Rebuild from the pinned bare source if needed.'}
    (prepared / 'source-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in receipt.items() if key != 'upstreamFiles'}), flush=True)


if __name__ == '__main__':
    main()
