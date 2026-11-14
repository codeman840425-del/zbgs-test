"""Project-local, pinned Blender/VRM addon; no global app/settings changes.

Usage: python scripts/setup-foundation-tools.py
Downloads are retryable in bounded HTTP ranges; final archives are SHA256 verified.
"""
import concurrent.futures
import hashlib
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOOLS = ROOT / 'experiments/tools'
BLENDER_URL = 'https://download.blender.org/release/Blender4.5/blender-4.5.9-windows-x64.zip'
BLENDER_SHA = '41da973b9bf95bb312cbeff4d1982feb13259b43c821686b9bafea4dfe5477cf'
BLENDER_SIZE = 399051129
ADDON_URL = 'https://github.com/saturday06/VRM-Addon-for-Blender/releases/download/v4.10.5/VRM_Addon_for_Blender-4_10_5.zip'

def digest(p):
    with p.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def blender_archive():
    target = TOOLS / BLENDER_URL.rsplit('/', 1)[1]
    if target.exists() and target.stat().st_size == BLENDER_SIZE and digest(target) == BLENDER_SHA:
        return target
    parts = TOOLS / 'blender-parts'
    parts.mkdir(exist_ok=True)
    chunk = 8 * 1024 * 1024
    def fetch(start):
        end = min(BLENDER_SIZE, start + chunk) - 1
        dest = parts / str(start)
        if dest.exists() and dest.stat().st_size == end - start + 1:
            return dest
        for attempt in range(3):
            try:
                req = urllib.request.Request(BLENDER_URL + '?range=' + str(start), headers={'Range': f'bytes={start}-{end}'})
                with urllib.request.urlopen(req, timeout=45) as response:
                    assert response.status == 206, response.status
                    assert response.headers['Content-Range'] == f'bytes {start}-{end}/{BLENDER_SIZE}', response.headers
                    data = response.read()
                assert len(data) == end - start + 1
                dest.write_bytes(data)
                return dest
            except Exception:
                if attempt == 2: raise
    starts = list(range(0, BLENDER_SIZE, chunk))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for i, p in enumerate(pool.map(fetch, starts)):
            print(f'Blender archive: {i+1}/{len(starts)} chunks', flush=True)
    with target.open('wb') as f:
        for start in starts: f.write((parts / str(start)).read_bytes())
    assert digest(target) == BLENDER_SHA, 'Archive digest does not match official SHA256 list'
    return target

def main():
    TOOLS.mkdir(parents=True, exist_ok=True)
    archive = blender_archive()
    exe = TOOLS / 'blender-4.5.9-windows-x64/blender.exe'
    if not exe.exists():
        with zipfile.ZipFile(archive) as z: z.extractall(TOOLS)
    addon = TOOLS / ADDON_URL.rsplit('/', 1)[1]
    if not addon.exists():
        with urllib.request.urlopen(ADDON_URL, timeout=45) as r: addon.write_bytes(r.read())
    # Addon hash is pinned in assets-source/foundation/toolchain.json after acquisition.
    import json
    manifest = ROOT / 'assets-source/foundation/toolchain.json'
    if manifest.exists():
        assert digest(addon) == json.loads(manifest.read_text())['addonSha256']
    with zipfile.ZipFile(addon) as z: z.extractall(TOOLS / 'vrm-addon')
    print('Ready:', exe)

if __name__ == '__main__': main()
